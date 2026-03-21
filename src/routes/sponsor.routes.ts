import express from 'express';
import {
	createSponsor,
	deleteSponsor,
	getAllSponsors,
	getClubSponsors,
	updateSponsor
} from '../controllers/sponsor/controller';
import authenticate from '../middlewares/auth';

const router = express.Router();

// List all unique sponsors across all clubs (public)
router.get('/', getAllSponsors);

// Club sponsor management endpoints (authenticated club admin/organiser; enforced in controllers)
router.get('/clubs/:clubId', authenticate, getClubSponsors);
router.post('/clubs/:clubId', authenticate, createSponsor);
router.patch('/clubs/:clubId/:sponsorId', authenticate, updateSponsor);
router.delete('/clubs/:clubId/:sponsorId', authenticate, deleteSponsor);

export default router;
