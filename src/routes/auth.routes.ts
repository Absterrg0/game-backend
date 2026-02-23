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
router.get('/callback/google', googleAuthCallback);

router.get('/apple', appleAuth);
router.route('/callback/apple').get(appleAuthCallback).post(appleAuthCallback);

router.post('/complete-signup', completeSignUp);

router.get('/me', getMe);
router.post('/logout', logout);

export default router;