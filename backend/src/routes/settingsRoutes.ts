import { Router } from 'express';
import * as s from '../controllers/settingsController';
import { validate } from '../middleware/validate';
import { requireAuth } from '../middleware/auth';
import { authLimiter } from '../middleware/rateLimit';
import { changePasswordSchema, deleteAccountSchema, twoFactorSchema, updatePreferencesSchema, updateProfileSchema } from '../validators/settings';
import multer from 'multer';
import { uploadLimiter } from '../middleware/rateLimit';
import { ApiError } from '../utils/ApiError';

const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) =>
    ['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.mimetype) ? cb(null, true) : cb(ApiError.badRequest('Avatar must be a PNG, JPG, WEBP or GIF image')),
}).single('avatar');

export const settingsRouter = Router();
settingsRouter.use(requireAuth);
settingsRouter.get('/', s.getUserSettings);
settingsRouter.patch('/', validate({ body: updatePreferencesSchema }), s.updateUserSettings);

export const usersRouter = Router();
// Public: avatar images (registered before the auth guard).
usersRouter.get('/:id/avatar', s.getAvatar);
usersRouter.use(requireAuth);
usersRouter.get('/me/stats', s.getStats);
usersRouter.post('/me/avatar', uploadLimiter, avatarUpload, s.uploadAvatar);
usersRouter.delete('/me/avatar', s.deleteAvatar);
usersRouter.post('/me/two-factor', authLimiter, validate({ body: twoFactorSchema }), s.setTwoFactor);
usersRouter.patch('/me', validate({ body: updateProfileSchema }), s.updateProfile);
usersRouter.patch('/me/password', authLimiter, validate({ body: changePasswordSchema }), s.changePassword);
usersRouter.delete('/me', authLimiter, validate({ body: deleteAccountSchema }), s.deleteAccount);
usersRouter.get('/me/export', s.exportData);

export const modelsRouter = Router();
modelsRouter.get('/', requireAuth, s.listModels);
