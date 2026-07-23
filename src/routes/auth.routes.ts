import express from 'express';
import {
	appleAuth,
	appleAuthCallback,
	appleFormPostFix,
	completeSignUp,
	exchangeAuthHandoff,
	getMe,
	googleAuth,
	googleAuthCallback,
	logout,
} from '../controllers/auth/controller';
import optionalAuthenticate from '../middlewares/optionalAuthenticate';
import { validateBody } from '../lib/validation';
import { completeSignupSchema, exchangeHandoffSchema } from '../validation/auth.schemas';

const router = express.Router();

// Public routes
router.get('/google', googleAuth);
router.get('/google/callback', googleAuthCallback);
router.get('/apple', appleAuth);
router.route('/apple/callback').get(appleAuthCallback).post(appleFormPostFix, appleAuthCallback);
router.post('/complete-signup', validateBody(completeSignupSchema), completeSignUp);
router.post('/exchange-handoff', validateBody(exchangeHandoffSchema), exchangeAuthHandoff);
router.post('/logout', logout);

// Guest-safe session probe (200 + user:null when logged out)
router.get('/me', optionalAuthenticate, getMe);
export default router;
