import File from '../models/File.js';
import Message from '../models/Message.js';
import RoomMember from '../models/RoomMember.js';
import User from '../models/User.js';
import logger from '../utils/logger.js';

// In-memory registry of online room members
// Format: { [roomId]: { [socketId]: { userId, username, typing: boolean } } }
const activeRooms = {};

// In-memory queue to debounce DB auto-saves for files
// Format: { [fileId]: { content, timeoutId } }
const autoSaveQueue = {};

const DEBOUNCE_DELAY = 3000; // 3 seconds

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
    socket.on('code-change', ({ roomId, fileId, content, changes }) => {
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
