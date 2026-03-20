import { Router } from 'express';
import { authenticateToken } from '../middleware/auth.middleware';
import { updateMatch } from '../controllers/admin.controller';

const router = Router();

// In a real app, this should have admin role checking middleware
router.use(authenticateToken); 

router.post('/update-match/:matchId', updateMatch);

export default router;
