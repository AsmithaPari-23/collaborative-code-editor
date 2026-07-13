import CodeHistory from '../models/CodeHistory.js';
import File from '../models/File.js';
import RoomMember from '../models/RoomMember.js';

// @desc    Create a snapshot manually (Version History)
// @route   POST /api/history
// @access  Private
export const createSnapshot = async (req, res, next) => {
  const { fileId, content } = req.body;

  if (!fileId) {
    res.status(400);
    return next(new Error('File ID is required'));
  }

  try {
    const file = await File.findById(fileId);
    if (!file) {
      res.status(404);
      return next(new Error('File not found'));
    }

    const isMember = await RoomMember.findOne({ roomId: file.roomId, userId: req.user._id });
    if (!isMember) {
      res.status(403);
      return next(new Error('Unauthorized: You are not a member of this room'));
    }

    // Save snapshot
    const snapshot = await CodeHistory.create({
      roomId: file.roomId,
      fileId,
      content: content || file.content,
      authorId: req.user._id,
    });

    res.status(201).json({
      success: true,
      data: snapshot,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get code history snapshots for a file
// @route   GET /api/history/file/:fileId
// @access  Private
export const getFileHistory = async (req, res, next) => {
  const { fileId } = req.params;

  try {
    const file = await File.findById(fileId);
    if (!file) {
      res.status(404);
      return next(new Error('File not found'));
    }

    const isMember = await RoomMember.findOne({ roomId: file.roomId, userId: req.user._id });
    if (!isMember) {
      res.status(403);
      return next(new Error('Unauthorized: You are not a member of this room'));
    }

    const history = await CodeHistory.find({ fileId })
      .populate('authorId', 'username email')
      .sort({ timestamp: -1 });

    res.status(200).json({
      success: true,
      data: history,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Restore file content to a specific snapshot version
// @route   POST /api/history/restore/:historyId
// @access  Private
export const restoreVersion = async (req, res, next) => {
  const { historyId } = req.params;

  try {
    const snapshot = await CodeHistory.findById(historyId);
    if (!snapshot) {
      res.status(404);
      return next(new Error('Snapshot not found'));
    }

    const isMember = await RoomMember.findOne({ roomId: snapshot.roomId, userId: req.user._id });
    if (!isMember) {
      res.status(403);
      return next(new Error('Unauthorized: You are not a member of this room'));
    }

    const file = await File.findById(snapshot.fileId);
    if (!file) {
      res.status(404);
      return next(new Error('Associated file not found'));
    }

    // Update the active file content
    file.content = snapshot.content;
    await file.save();

    // Create a new snapshot reflecting the restoration action
    const newSnapshot = await CodeHistory.create({
      roomId: snapshot.roomId,
      fileId: snapshot.fileId,
      content: snapshot.content,
      authorId: req.user._id,
      timestamp: new Date(),
    });

    res.status(200).json({
      success: true,
      message: 'Code restored to selected version successfully',
      data: {
        file,
        newSnapshot,
      },
    });
  } catch (error) {
    next(error);
  }
};
