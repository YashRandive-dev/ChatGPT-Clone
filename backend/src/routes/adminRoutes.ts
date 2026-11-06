import { Router } from 'express';
import * as a from '../controllers/adminController';
import { validate } from '../middleware/validate';
import { requireAdmin, requireAuth } from '../middleware/auth';
import { idParams } from '../validators/common';
import { listUsersQuery, paginationQuery, updateAppSettingsSchema, updateUserSchema, usageQuery } from '../validators/admin';

const router = Router();
router.use(requireAuth, requireAdmin);

router.get('/dashboard', a.dashboard);
router.get('/users', validate({ query: listUsersQuery }), a.listUsers);
router.patch('/users/:id', validate({ params: idParams, body: updateUserSchema }), a.updateUser);
router.delete('/users/:id', validate({ params: idParams }), a.deleteUser);
router.get('/conversations', validate({ query: paginationQuery }), a.listConversations);
router.get('/conversations/:id', validate({ params: idParams }), a.getConversation);
router.get('/settings', a.getAppSettings);
router.patch('/settings', validate({ body: updateAppSettingsSchema }), a.patchAppSettings);
router.get('/usage', validate({ query: usageQuery }), a.usage);
router.get('/feedback', validate({ query: paginationQuery }), a.listFeedback);

export default router;
