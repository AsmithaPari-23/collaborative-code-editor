import Room from '../models/Room.js';
import RoomMember from '../models/RoomMember.js';
import File from '../models/File.js';
import CodeHistory from '../models/CodeHistory.js';
import Message from '../models/Message.js';

// @desc    Create a new room
// @route   POST /api/rooms
// @access  Private
export const createRoom = async (req, res, next) => {
  const { name, description } = req.body;

  if (!name) {
    res.status(400);
    return next(new Error('Room name is required'));
  }

  try {
    // 1. Create the room
    const room = await Room.create({
      name,
      description,
      ownerId: req.user._id,
    });

    // 2. Add the owner to RoomMember
    await RoomMember.create({
      roomId: room._id,
      userId: req.user._id,
      role: 'owner',
    });

    // 3. Create a default "index.js" file inside this room
    const defaultFile = await File.create({
      roomId: room._id,
      name: 'index.js',
      content: `// Welcome to collaboration room: ${name}\n// Happy coding!\n\nconsole.log("Hello, World!");\n`,
      language: 'javascript',
    });

    // 4. Create an initial code snapshot in history
    await CodeHistory.create({
      roomId: room._id,
      fileId: defaultFile._id,
      content: defaultFile.content,
      authorId: req.user._id,
    });

    res.status(201).json({
      success: true,
      data: {
        room,
        defaultFileId: defaultFile._id,
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Join an existing room
// @route   POST /api/rooms/join/:roomId
// @access  Private
export const joinRoom = async (req, res, next) => {
  const { roomId } = req.params;

  try {
    const room = await Room.findById(roomId);
    if (!room) {
      res.status(404);
      return next(new Error('Room not found'));
    }

    // Check if membership record already exists
    let membership = await RoomMember.findOne({ roomId, userId: req.user._id });
    if (!membership) {
      // User is joining as collaborator
      membership = await RoomMember.create({
        roomId,
        userId: req.user._id,
        role: 'collaborator',
      });
    }

    // Find first/default file of this room
    const files = await File.find({ roomId });

    res.status(200).json({
      success: true,
      data: {
        room,
        membership,
        files,
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get all rooms (or search/filter)
// @route   GET /api/rooms
// @access  Private
export const getRooms = async (req, res, next) => {
  const { filter, search } = req.query;

  try {
    let query = {};

    // Filter by "mine" (rooms owned or joined by current user)
    if (filter === 'mine') {
      const userMemberships = await RoomMember.find({ userId: req.user._id });
      const roomIds = userMemberships.map((m) => m.roomId);
      query._id = { $in: roomIds };
    }

    // Search filter
    if (search) {
      query.name = { $regex: search, $options: 'i' };
    }

    const rooms = await Room.find(query)
      .populate('ownerId', 'username email')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      data: rooms,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete a room
// @route   DELETE /api/rooms/:roomId
// @access  Private
export const deleteRoom = async (req, res, next) => {
  const { roomId } = req.params;

  try {
    const room = await Room.findById(roomId);
    if (!room) {
      res.status(404);
      return next(new Error('Room not found'));
    }

    // Only owner can delete the room
    if (room.ownerId.toString() !== req.user._id.toString()) {
      res.status(403);
      return next(new Error('Unauthorized: Only the room owner can delete it'));
    }

    // Delete room and all cascading details
    await Room.findByIdAndDelete(roomId);
    await RoomMember.deleteMany({ roomId });
    await File.deleteMany({ roomId });
    await CodeHistory.deleteMany({ roomId });
    await Message.deleteMany({ roomId });

    res.status(200).json({
      success: true,
      message: 'Room and all its associated files/messages deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get members in a room
// @route   GET /api/rooms/:roomId/members
// @access  Private
export const getRoomMembers = async (req, res, next) => {
  const { roomId } = req.params;

  try {
    const members = await RoomMember.find({ roomId })
      .populate('userId', 'username email')
      .sort({ joinedAt: 1 });

    res.status(200).json({
      success: true,
      data: members,
    });
  } catch (error) {
    next(error);
  }
};
