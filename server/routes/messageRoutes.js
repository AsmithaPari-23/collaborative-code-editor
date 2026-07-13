import express from 'express';
import { getRoomMessages } from '../controllers/messageController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

router.use(protect); // Secure message routes

router.get('/room/:roomId', getRoomMessages);

export default router;
