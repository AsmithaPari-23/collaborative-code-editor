import express from 'express';
import {
  createFile,
  getRoomFiles,
  renameFile,
  deleteFile,
} from '../controllers/fileController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

router.use(protect); // Secure all file routes

router.route('/')
  .post(createFile);

router.get('/room/:roomId', getRoomFiles);
router.put('/:fileId/rename', renameFile);
router.delete('/:fileId', deleteFile);

export default router;
