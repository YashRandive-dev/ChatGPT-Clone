import { Router } from 'express';
import * as c from '../controllers/conversationController';
import { validate } from '../middleware/validate';
import { requireAuth } from '../middleware/auth';
import { idParams } from '../validators/common';
import { createConversationSchema, getConversationQuery, listConversationsQuery, updateConversationSchema } from '../validators/chat';

const router = Router();
router.use(requireAuth);

router.get('/', validate({ query: listConversationsQuery }), c.listConversations);
router.post('/', validate({ body: createConversationSchema }), c.createConversation);
router.delete('/', c.deleteAllConversations);
router.post('/archive-all', c.archiveAll);
router.get('/shared', c.listShared);
router.delete('/shared', c.revokeAllShared);
router.get('/:id', validate({ params: idParams, query: getConversationQuery }), c.getConversation);
router.patch('/:id', validate({ params: idParams, body: updateConversationSchema }), c.updateConversation);
router.delete('/:id', validate({ params: idParams }), c.deleteConversation);
router.post('/:id/share', validate({ params: idParams }), c.shareConversation);
router.delete('/:id/share', validate({ params: idParams }), c.unshareConversation);

export default router;
