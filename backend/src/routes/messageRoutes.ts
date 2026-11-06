import { Router } from 'express';
import * as m from '../controllers/messageController';
import { validate } from '../middleware/validate';
import { requireAuth, requireVerified } from '../middleware/auth';
import { aiLimiter } from '../middleware/rateLimit';
import { idParams } from '../validators/common';
import { editMessageSchema, feedbackSchema, regenerateSchema, sendMessageSchema } from '../validators/chat';

const router = Router();
router.use(requireAuth);

router.post('/', requireVerified, aiLimiter, validate({ body: sendMessageSchema }), m.sendMessage);
router.post('/stream', requireVerified, aiLimiter, validate({ body: sendMessageSchema }), m.streamMessage);
router.patch('/:id', validate({ params: idParams, body: editMessageSchema }), m.editMessage);
router.delete('/:id', validate({ params: idParams }), m.deleteMessage);
router.post('/:id/regenerate', requireVerified, aiLimiter, validate({ params: idParams, body: regenerateSchema }), m.regenerate);
router.post('/:id/feedback', validate({ params: idParams, body: feedbackSchema }), m.submitFeedback);

export default router;
