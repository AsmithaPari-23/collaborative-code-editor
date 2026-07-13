import Message from '../models/Message.js';
import RoomMember from '../models/RoomMember.js';

// @desc    Get room messages history
// @route   GET /api/messages/room/:roomId
// @access  Private
export const getRoomMessages = async (req, res, next) => {
  const { roomId } = req.params;

  try {
    const isMember = await RoomMember.findOne({ roomId, userId: req.user._id });
    if (!isMember) {
      res.status(403);
      return next(new Error('Unauthorized: You are not a member of this room'));
    }

    const messages = await Message.find({ roomId })
      .populate('senderId', 'username email')
      .sort({ timestamp: 1 })
      .limit(100);

    res.status(200).json({
      success: true,
      data: messages,
    });
  } catch (error) {
    next(error);
  }
};
