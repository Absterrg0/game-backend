import express from 'express';
import {
	appleAuth,
	appleAuthCallback,
	completeSignUp,
	getMe,
	googleAuth,
	googleAuthCallback,
	logout
} from '../controllers/auth/controller';

const router = express.Router();

router.get('/google', googleAuth);
// Callback: Google redirects to GOOGLE_CALLBACK_URL. Support both path orders.
router.get('/callback/google', googleAuthCallback);
router.get('/google/callback', googleAuthCallback);

router.get('/apple', appleAuth);
// Callback: Apple redirects to APPLE_CALLBACK_URL. Support both path orders.
router.route('/callback/apple').get(appleAuthCallback).post(appleAuthCallback);
router.route('/apple/callback').get(appleAuthCallback).post(appleAuthCallback);

router.post('/complete-signup', completeSignUp);

router.get('/me', getMe);
router.post('/logout', logout);

export default router;