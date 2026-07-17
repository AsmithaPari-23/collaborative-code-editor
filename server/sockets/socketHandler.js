import File from '../models/File.js';
import Message from '../models/Message.js';
import RoomMember from '../models/RoomMember.js';
import User from '../models/User.js';
import logger from '../utils/logger.js';
import ReplayOperation from '../models/ReplayOperation.js';
import Version from '../models/Version.js';
import { getEditSummary } from '../controllers/replayController.js';

// In-memory registry of online room members
// Format: { [roomId]: { [socketId]: { userId, username, typing: boolean } } }
const activeRooms = {};

// In-memory queue to debounce DB auto-saves for files
// Format: { [fileId]: { content, timeoutId } }
const autoSaveQueue = {};

// In-memory registry of active typing sessions for debounced auto-version creation
// Format: { [fileId]: { [userId]: { timeoutId, operations: [] } } }
const userTypingSessions = {};

const DEBOUNCE_DELAY = 3000; // 3 seconds

const handleAutoVersionCreation = async (io, roomId, fileId, userId, username) => {
  try {
    const session = userTypingSessions[fileId]?.[userId];
    if (!session || session.operations.length === 0) return;

    // Fetch operations
    const ops = await ReplayOperation.find({
      _id: { $in: session.operations }
    }).sort({ timestamp: 1 });

    if (ops.length === 0) return;

    let totalText = '';
    let totalDeleted = 0;
    const fileName = ops[0].fileName;

    for (const op of ops) {
      if (op.changes && op.changes.length > 0) {
        for (const change of op.changes) {
          if (change.text) totalText += change.text;
          if (change.rangeLength) totalDeleted += change.rangeLength;
        }
      }
    }

    const summaryText = getEditSummary(totalText, totalDeleted > 0 ? 'deleted' : '');

    const file = await File.findById(fileId);
    if (!file) return;

    const newVersion = await Version.create({
      roomId,
      fileId,
      userId,
      username,
      name: summaryText,
      description: `Auto-saved during coding session`,
      snapshotContent: file.content,
      operationId: ops[ops.length - 1]._id,
    });

    logger.info(`Auto-generated version checkpoint for user ${username} in file ${fileId}: ${summaryText}`);

    // Emit version-created event to room
    io.to(roomId).emit('version-created', newVersion);

    // Clear session operations
    delete userTypingSessions[fileId][userId];
  } catch (err) {
    logger.error(`Error in auto-versioning: ${err.message}`);
  }
};

export default function registerSocketHandlers(io) {
  io.on('connection', (socket) => {
    logger.info(`Socket connected: ${socket.id}`);

    // Track the room this socket belongs to for easy cleanup on disconnect
    let currentRoomId = null;
    let currentUserId = null;
    let currentUsername = null;

    // 1. Join Room
    socket.on('join-room', async ({ roomId, userId, username }) => {
      try {
        if (!roomId || !userId || !username) return;

        currentRoomId = roomId;
        currentUserId = userId;
        currentUsername = username;

        socket.join(roomId);

        // Track user in memory
        if (!activeRooms[roomId]) {
          activeRooms[roomId] = {};
        }

        activeRooms[roomId][socket.id] = {
          userId,
          username,
          typing: false,
        };

        logger.info(`User ${username} (${userId}) joined room ${roomId}`);

        // Broadcast join message to other users
        socket.to(roomId).emit('user-joined', {
          socketId: socket.id,
          userId,
          username,
          activeUsers: Object.values(activeRooms[roomId]),
        });

        // Send full list of active users to the joining user
        socket.emit('active-users-list', Object.values(activeRooms[roomId]));
      } catch (err) {
        logger.error(`Error in join-room socket handler: ${err.message}`);
      }
    });

    // 2. Code changes sync
    socket.on('code-change', ({ roomId, fileId, content, changes, cursor, selection, fileName }) => {
      if (!roomId || !fileId) return;

      // Broadcast changes to other users in the room
      socket.to(roomId).emit('receive-code', {
        fileId,
        content,
        changes,
        senderSocketId: socket.id,
      });

      // Queue file content for auto-save to MongoDB
      queueAutoSave(fileId, content);

      // Save operation to MongoDB and handle auto-versioning in background
      if (currentUserId && currentUsername) {
        const recordOperation = async () => {
          try {
            let editType = 'unknown';
            let summary = '';
            if (changes && changes.length > 0) {
              const firstChange = changes[0];
              if (!firstChange.text && firstChange.rangeLength > 0) {
                editType = 'delete';
                summary = 'Deleted code';
              } else if (firstChange.text && !firstChange.rangeLength) {
                editType = firstChange.text.length > 1 ? 'paste' : 'insert';
                summary = firstChange.text;
              } else if (firstChange.text && firstChange.rangeLength > 0) {
                editType = 'replace';
                summary = firstChange.text;
              }
            }

            const operation = await ReplayOperation.create({
              roomId,
              fileId,
              userId: currentUserId,
              username: currentUsername,
              cursor: cursor || { line: 1, column: 1 },
              selection: selection || null,
              fileName: fileName || 'untitled',
              editType,
              summary,
              changes: changes || [],
            });

            // Update user typing session
            if (!userTypingSessions[fileId]) {
              userTypingSessions[fileId] = {};
            }
            if (!userTypingSessions[fileId][currentUserId]) {
              userTypingSessions[fileId][currentUserId] = {
                operations: [],
                timeoutId: null,
              };
            }

            const session = userTypingSessions[fileId][currentUserId];
            session.operations.push(operation._id);

            if (session.timeoutId) {
              clearTimeout(session.timeoutId);
            }

            session.timeoutId = setTimeout(() => {
              handleAutoVersionCreation(io, roomId, fileId, currentUserId, currentUsername);
            }, 10000); // 10s debounce for typing pause
          } catch (err) {
            logger.error(`Error saving replay operation: ${err.message}`);
          }
        };
        recordOperation();
      }
    });

    // 3. Live Cursor and Selection synchronizer
    socket.on('cursor-update', ({ roomId, fileId, cursor, selection }) => {
      if (!roomId || !fileId) return;

      socket.to(roomId).emit('cursor-update', {
        socketId: socket.id,
        userId: currentUserId,
        username: currentUsername,
        fileId,
        cursor, // { line, column }
        selection, // { startLine, startColumn, endLine, endColumn }
      });
    });

    // 4. Typing indicators
    socket.on('typing-start', ({ roomId }) => {
      if (!roomId || !activeRooms[roomId] || !activeRooms[roomId][socket.id]) return;
      activeRooms[roomId][socket.id].typing = true;
      socket.to(roomId).emit('typing-start', {
        username: currentUsername,
        socketId: socket.id,
      });
    });

    socket.on('typing-stop', ({ roomId }) => {
      if (!roomId || !activeRooms[roomId] || !activeRooms[roomId][socket.id]) return;
      activeRooms[roomId][socket.id].typing = false;
      socket.to(roomId).emit('typing-stop', {
        username: currentUsername,
        socketId: socket.id,
      });
    });

    // 5. Send Chat Message
    socket.on('send-message', async ({ roomId, content, userId }) => {
      if (!roomId || !content || !userId) return;

      try {
        const message = await Message.create({
          roomId,
          senderId: userId,
          content,
        });

        const populatedMessage = await message.populate('senderId', 'username email');

        // Broadcast to all clients in the room, including sender
        io.to(roomId).emit('receive-message', populatedMessage);
      } catch (err) {
        logger.error(`Error saving/broadcasting message: ${err.message}`);
      }
    });

    // 6. File operations synchronization
    socket.on('file-created', ({ roomId, file }) => {
      if (!roomId || !file) return;
      socket.to(roomId).emit('file-created', file);
    });

    socket.on('file-renamed', ({ roomId, file }) => {
      if (!roomId || !file) return;
      socket.to(roomId).emit('file-renamed', file);
    });

    socket.on('file-deleted', ({ roomId, fileId }) => {
      if (!roomId || !fileId) return;
      socket.to(roomId).emit('file-deleted', { fileId });
    });

    // 7. Manual disconnect / user leaving room explicitly
    socket.on('leave-room', () => {
      handleUserDeparture(socket);
    });

    // 8. Disconnect
    socket.on('disconnect', () => {
      handleUserDeparture(socket);
    });
  });
}

/**
 * Cleanup function for sockets leaving a room or disconnecting
 */
function handleUserDeparture(socket) {
  for (const roomId of Object.keys(activeRooms)) {
    if (activeRooms[roomId][socket.id]) {
      const user = activeRooms[roomId][socket.id];
      logger.info(`Socket ${socket.id} (User: ${user.username}) left room ${roomId}`);

      // Delete from registry
      delete activeRooms[roomId][socket.id];

      // Clean up empty room listings
      if (Object.keys(activeRooms[roomId]).length === 0) {
        delete activeRooms[roomId];
      } else {
        // Broadcast departure notification
        socket.to(roomId).emit('user-left', {
          socketId: socket.id,
          username: user.username,
          userId: user.userId,
          activeUsers: Object.values(activeRooms[roomId]),
        });
      }
    }
  }
}

/**
 * Debounced database saving utility
 */
function queueAutoSave(fileId, content) {
  if (autoSaveQueue[fileId]) {
    clearTimeout(autoSaveQueue[fileId].timeoutId);
  }

  const timeoutId = setTimeout(async () => {
    try {
      await File.findByIdAndUpdate(fileId, { content });
      logger.info(`Auto-saved file ${fileId} content state to database.`);
      delete autoSaveQueue[fileId];
    } catch (err) {
      logger.error(`Failed to auto-save file ${fileId}: ${err.message}`);
    }
  }, DEBOUNCE_DELAY);

  autoSaveQueue[fileId] = {
    content,
    timeoutId,
  };
}
