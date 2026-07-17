import mongoose from 'mongoose';

const replayOperationSchema = new mongoose.Schema(
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
    cursor: {
      line: { type: Number, default: 1 },
      column: { type: Number, default: 1 },
    },
    selection: {
      startLine: { type: Number },
      startColumn: { type: Number },
      endLine: { type: Number },
      endColumn: { type: Number },
    },
    fileName: {
      type: String,
      required: true,
    },
    editType: {
      type: String,
      enum: ['insert', 'delete', 'replace', 'paste', 'undo', 'redo', 'unknown'],
      default: 'unknown',
    },
    summary: {
      type: String,
      default: '',
    },
    changes: [
      {
        range: {
          startLineNumber: { type: Number, required: true },
          startColumn: { type: Number, required: true },
          endLineNumber: { type: Number, required: true },
          endColumn: { type: Number, required: true },
        },
        rangeLength: { type: Number },
        text: { type: String, default: '' },
      },
    ],
  },
  {
    timestamps: true,
  }
);

// Compound index for quick chronological retrieval per file
replayOperationSchema.index({ fileId: 1, timestamp: 1 });

const ReplayOperation = mongoose.model('ReplayOperation', replayOperationSchema);
export default ReplayOperation;
