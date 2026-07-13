import File from '../models/File.js';
import RoomMember from '../models/RoomMember.js';
import CodeHistory from '../models/CodeHistory.js';

// Helper to check if user is in room
const checkRoomMember = async (roomId, userId) => {
  const member = await RoomMember.findOne({ roomId, userId });
  return !!member;
};

// @desc    Create a new file in a room
// @route   POST /api/files
// @access  Private
export const createFile = async (req, res, next) => {
  const { roomId, name, language } = req.body;

  if (!roomId || !name || !language) {
    res.status(400);
    return next(new Error('Room ID, file name, and language are required'));
  }

  try {
    const isMember = await checkRoomMember(roomId, req.user._id);
    if (!isMember) {
      res.status(403);
      return next(new Error('Unauthorized: You are not a member of this room'));
    }

    const file = await File.create({
      roomId,
      name,
      content: '',
      language,
    });

    // Create initial code snapshot in history
    await CodeHistory.create({
      roomId,
      fileId: file._id,
      content: '',
      authorId: req.user._id,
    });

    res.status(201).json({
      success: true,
      data: file,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get all files in a room
// @route   GET /api/files/room/:roomId
// @access  Private
export const getRoomFiles = async (req, res, next) => {
  const { roomId } = req.params;

  try {
    const isMember = await checkRoomMember(roomId, req.user._id);
    if (!isMember) {
      res.status(403);
      return next(new Error('Unauthorized: You are not a member of this room'));
    }

    const files = await File.find({ roomId }).sort({ name: 1 });
    res.status(200).json({
      success: true,
      data: files,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Rename a file
// @route   PUT /api/files/:fileId/rename
// @access  Private
export const renameFile = async (req, res, next) => {
  const { fileId } = req.params;
  const { name } = req.body;

  if (!name) {
    res.status(400);
    return next(new Error('File name is required'));
  }

  try {
    const file = await File.findById(fileId);
    if (!file) {
      res.status(404);
      return next(new Error('File not found'));
    }

    const isMember = await checkRoomMember(file.roomId, req.user._id);
    if (!isMember) {
      res.status(403);
      return next(new Error('Unauthorized: You are not a member of this room'));
    }

    file.name = name;
    if (req.body.language) {
      file.language = req.body.language;
    }
    await file.save();

    res.status(200).json({
      success: true,
      data: file,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete a file
// @route   DELETE /api/files/:fileId
// @access  Private
export const deleteFile = async (req, res, next) => {
  const { fileId } = req.params;

  try {
    const file = await File.findById(fileId);
    if (!file) {
      res.status(404);
      return next(new Error('File not found'));
    }

    const isMember = await checkRoomMember(file.roomId, req.user._id);
    if (!isMember) {
      res.status(403);
      return next(new Error('Unauthorized: You are not a member of this room'));
    }

    // Check if it is the only file in the room
    const fileCount = await File.countDocuments({ roomId: file.roomId });
    if (fileCount <= 1) {
      res.status(400);
      return next(new Error('Cannot delete the last remaining file in the room'));
    }

    await File.findByIdAndDelete(fileId);
    await CodeHistory.deleteMany({ fileId });

    res.status(200).json({
      success: true,
      message: 'File deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};
