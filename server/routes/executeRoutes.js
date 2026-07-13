import express from 'express';
import { runCode } from '../controllers/executeController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

router.use(protect); // Secure compilation endpoint

router.post('/', runCode);

export default router;
