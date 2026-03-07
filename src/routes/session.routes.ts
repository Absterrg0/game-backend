import express from 'express';
import { completeSignUp } from '../controllers/auth/completeSignUp';
import { getMe } from '../controllers/auth/me';
import authenticate from '../middlewares/auth';
import { validateBody } from '../lib/validation';
import { completeSignupSchema } from '../validation/auth.schemas';

const router = express.Router();

router.get('/me', authenticate, getMe);
router.post('/complete-signup', authenticate, validateBody(completeSignupSchema), completeSignUp);

export default router;
