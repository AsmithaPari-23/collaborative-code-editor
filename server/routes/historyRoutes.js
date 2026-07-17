import express from 'express';
import {
  getReplayOperations,
  getVersions,
  createManualVersion,
  restoreVersion,
} from '../controllers/replayController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

router.use(protect); // Secure all history routes

router.post('/', createManualVersion);
router.get('/file/:fileId', getVersions);
router.get('/versions/:fileId', getVersions);
router.get('/replays/:fileId', getReplayOperations);
router.post('/restore/:versionId', restoreVersion);

export default router;
