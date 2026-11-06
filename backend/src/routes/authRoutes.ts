import { Router } from 'express';
import * as auth from '../controllers/authController';
import { validate } from '../middleware/validate';
import { requireAuth } from '../middleware/auth';
import { authLimiter } from '../middleware/rateLimit';
import { forgotPasswordSchema, loginSchema, registerSchema, resetPasswordSchema, verifyEmailSchema, verifyResetCodeSchema, challengeSchema, loginVerifySchema } from '../validators/auth';

const router = Router();

router.post('/register', authLimiter, validate({ body: registerSchema }), auth.register);
router.post('/login', authLimiter, validate({ body: loginSchema }), auth.login);
router.post('/login/verify', authLimiter, validate({ body: loginVerifySchema }), auth.loginVerify);
router.post('/login/resend', authLimiter, validate({ body: challengeSchema }), auth.loginResend);
router.post('/logout', auth.logout);
router.post('/refresh', auth.refresh);
router.post('/forgot-password', authLimiter, validate({ body: forgotPasswordSchema }), auth.forgotPassword);
router.post('/verify-reset-code', authLimiter, validate({ body: verifyResetCodeSchema }), auth.verifyResetCode);
router.post('/reset-password', authLimiter, validate({ body: resetPasswordSchema }), auth.resetPassword);
router.post('/verify-email', authLimiter, requireAuth, validate({ body: verifyEmailSchema }), auth.verifyEmail);
router.post('/resend-verification', authLimiter, requireAuth, auth.resendVerification);
router.get('/me', requireAuth, auth.me);
router.get('/session', auth.session);
router.get('/config', auth.authConfig);
router.get('/sessions', requireAuth, auth.listSessions);
router.delete('/sessions', requireAuth, auth.revokeOtherSessions);
router.delete('/sessions/:id', requireAuth, auth.revokeSession);

export default router;
