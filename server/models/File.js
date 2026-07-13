import mongoose from 'mongoose';

const fileSchema = new mongoose.Schema(
  {
    roomId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Room',
      required: true,
    },
    name: {
      type: String,
      required: [true, 'File name is required'],
      trim: true,
    },
    content: {
      type: String,
      default: '',
    },
    language: {
      type: String,
      required: [true, 'Language is required'],
      default: 'javascript',
    },
  },
  {
    timestamps: true,
  }
);

// Enforce unique file names within the same room
fileSchema.index({ roomId: 1, name: 1 }, { unique: true });

const File = mongoose.model('File', fileSchema);
export default File;
