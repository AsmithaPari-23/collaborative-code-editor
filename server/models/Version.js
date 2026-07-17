import mongoose from 'mongoose';

const versionSchema = new mongoose.Schema(
  {
    roomId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Room',
      required: true,
      index: true,
    },
    fileId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'File',
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    username: {
      type: String,
      required: true,
    },
    timestamp: {
      type: Date,
      default: Date.now,
      index: true,
    },
    name: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      default: '',
    },
    operationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ReplayOperation',
    },
    snapshotContent: {
      type: String,
      default: '',
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for quick chronological retrieval
versionSchema.index({ fileId: 1, timestamp: -1 });

const Version = mongoose.model('Version', versionSchema);
export default Version;
