import { Router } from 'express';
import mongoose from 'mongoose';
import authRoutes from './authRoutes';
import conversationRoutes from './conversationRoutes';
import messageRoutes from './messageRoutes';
import fileRoutes from './fileRoutes';
import adminRoutes from './adminRoutes';
import { modelsRouter, settingsRouter, usersRouter } from './settingsRoutes';
import { getSharedConversation } from '../controllers/conversationController';

const router = Router();

router.get('/health', (_req, res) => {
  const db = mongoose.connection.readyState === 1 ? 'up' : 'down';
  res.status(db === 'up' ? 200 : 503).json({ status: db === 'up' ? 'ok' : 'degraded', db, uptime: Math.round(process.uptime()) });
});

router.use('/auth', authRoutes);
router.use('/conversations', conversationRoutes);
router.use('/messages', messageRoutes);
router.use('/files', fileRoutes);
router.use('/settings', settingsRouter);
router.use('/users', usersRouter);
router.use('/models', modelsRouter);
router.use('/admin', adminRoutes);
router.get('/share/:shareId', getSharedConversation);

export default router;
