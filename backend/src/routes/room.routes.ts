import { Router } from 'express';
import { authenticateToken } from '../middleware/auth.middleware';
import { createRoom, joinRoom, getRoomDetails, getRoomLeaderboard, getRoomSquads, getAllPlayers, getMyRooms, getScoreboard, completeRoom, getCompletedRooms, leaveRoom } from '../controllers/room.controller';

const router = Router();

router.use(authenticateToken); // Protect all room routes

router.get('/mine', getMyRooms);
router.get('/completed', getCompletedRooms);
router.get('/players/all', getAllPlayers);

router.post('/', createRoom);
router.post('/join', joinRoom);
router.post('/:roomId/complete', completeRoom);
router.delete('/:roomId/leave', leaveRoom);
router.get('/:roomId', getRoomDetails);
router.get('/:roomId/leaderboard', getRoomLeaderboard);
router.get('/:roomId/scoreboard', getScoreboard);
router.get('/:roomId/squads', getRoomSquads);

export default router;
