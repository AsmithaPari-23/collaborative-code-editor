import ReplayOperation from '../models/ReplayOperation.js';
import Version from '../models/Version.js';
import File from '../models/File.js';
import RoomMember from '../models/RoomMember.js';

// Get a list of edit summaries based on code content
export function getEditSummary(text, deletedText) {
  if (!text && deletedText) {
    return 'Deleted code';
  }
  if (!text) {
    return 'Modified code';
  }

  // Detect function creations
  const funcRegex = /(?:function\s+([a-zA-Z0-9_$]+)|const\s+([a-zA-Z0-9_$]+)\s*=\s*(?:\([^)]*\)|[a-zA-Z0-9_$]+)?\s*=>|class\s+([a-zA-Z0-9_$]+))/;
  const match = funcRegex.exec(text);
  if (match) {
    const name = match[1] || match[2] || match[3];
    return `Created ${name}()`;
  }

  // Detect validation or conditionals
  if (text.includes('if (') || text.includes('if(') || text.includes('switch (') || text.includes('switch(')) {
    return 'Added validation';
  }

  // Detect bug fixes/error handling
  if (text.toLowerCase().includes('fix') || text.toLowerCase().includes('bug') || text.toLowerCase().includes('error')) {
    return 'Fixed authentication bug';
  }

  // Detect imports
  if (text.includes('import ') || text.includes('require(')) {
    return 'Added imports';
  }

  // General fallback text
  return text.length > 50 ? 'Updated implementation' : 'Refactored code';
}

// @desc    Get all replay operations for a file
// @route   GET /api/history/replays/:fileId
// @access  Private
export const getReplayOperations = async (req, res, next) => {
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
      return next(new Error('Unauthorized access to room history'));
    }

    // Support pagination or lazy loading if specified
    const limit = parseInt(req.query.limit) || 10000;
    const skip = parseInt(req.query.skip) || 0;

    const operations = await ReplayOperation.find({ fileId })
      .sort({ timestamp: 1 })
      .skip(skip)
      .limit(limit);

    res.status(200).json({
      success: true,
      count: operations.length,
      data: operations,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get version history checkpoints for a file
// @route   GET /api/history/versions/:fileId (Also replaces getFileHistory)
// @access  Private
export const getVersions = async (req, res, next) => {
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
      return next(new Error('Unauthorized access to room history'));
    }

    const versions = await Version.find({ fileId })
      .sort({ timestamp: -1 })
      .populate('userId', 'username email');

    res.status(200).json({
      success: true,
      data: versions,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Manually create a version checkpoint (snapshot)
// @route   POST /api/history/version
// @access  Private
export const createManualVersion = async (req, res, next) => {
  const { fileId, content, name, description } = req.body;

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
      return next(new Error('Unauthorized access to room'));
    }

    // Determine a generic summary name if none is provided
    const lastOp = await ReplayOperation.findOne({ fileId }).sort({ timestamp: -1 });
    const versionName = name || (lastOp ? getEditSummary(lastOp.summary, '') : 'Saved Snapshot');

    // Create the version checkpoint
    const version = await Version.create({
      roomId: file.roomId,
      fileId,
      userId: req.user._id,
      username: req.user.username,
      name: versionName,
      description: description || 'User saved checkpoint',
      snapshotContent: content || file.content,
      operationId: lastOp ? lastOp._id : null,
    });

    res.status(201).json({
      success: true,
      data: version,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Restore file content to a specific version checkpoint
// @route   POST /api/history/restore/:versionId
// @access  Private
export const restoreVersion = async (req, res, next) => {
  const { versionId } = req.params;

  try {
    const version = await Version.findById(versionId);
    if (!version) {
      res.status(404);
      return next(new Error('Version checkpoint not found'));
    }

    const isMember = await RoomMember.findOne({ roomId: version.roomId, userId: req.user._id });
    if (!isMember) {
      res.status(403);
      return next(new Error('Unauthorized access to room'));
    }

    const file = await File.findById(version.fileId);
    if (!file) {
      res.status(404);
      return next(new Error('Associated file not found'));
    }

    // Update active file content in DB
    file.content = version.snapshotContent;
    await file.save();

    // Create a new version checkpoint reflecting the restoration action
    const newVersion = await Version.create({
      roomId: version.roomId,
      fileId: version.fileId,
      userId: req.user._id,
      username: req.user.username,
      name: `Restored to: ${version.name}`,
      description: `Restored from version saved on ${new Date(version.timestamp).toLocaleString()}`,
      snapshotContent: version.snapshotContent,
      operationId: version.operationId,
    });

    res.status(200).json({
      success: true,
      message: 'Code restored to selected version successfully',
      data: {
        file,
        newVersion,
      },
    });
  } catch (error) {
    next(error);
  }
};
