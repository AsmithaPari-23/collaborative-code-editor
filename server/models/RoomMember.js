import mongoose from 'mongoose';

const roomMemberSchema = new mongoose.Schema(
  {
    roomId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Room',
      required: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    role: {
      type: String,
      enum: ['owner', 'collaborator'],
      default: 'collaborator',
    },
    joinedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// Ensure a user can only have one membership record per room
roomMemberSchema.index({ roomId: 1, userId: 1 }, { unique: true });

const RoomMember = mongoose.model('RoomMember', roomMemberSchema);
export default RoomMember;
