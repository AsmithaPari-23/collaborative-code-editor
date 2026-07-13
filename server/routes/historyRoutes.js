import express from 'express';
import {
  createSnapshot,
  getFileHistory,
  restoreVersion,
} from '../controllers/historyController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

router.use(protect); // Secure all history routes

router.post('/', createSnapshot);
router.get('/file/:fileId', getFileHistory);
router.post('/restore/:historyId', restoreVersion);

export default router;
