import express from 'express';
import {
  createRoom,
  joinRoom,
  getRooms,
  deleteRoom,
  getRoomMembers,
} from '../controllers/roomController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

router.use(protect); // Secure all room routes

router.route('/')
  .post(createRoom)
  .get(getRooms);

router.post('/join/:roomId', joinRoom);
router.delete('/:roomId', deleteRoom);
router.get('/:roomId/members', getRoomMembers);

export default router;
