import { Router } from 'express';
import * as f from '../controllers/fileController';
import { validate } from '../middleware/validate';
import { requireAuth } from '../middleware/auth';
import { uploadLimiter } from '../middleware/rateLimit';
import { uploadSingle } from '../middleware/upload';
import { idParams } from '../validators/common';

const router = Router();
router.use(requireAuth);

router.post('/upload', uploadLimiter, uploadSingle, f.uploadFile);
router.get('/:id', validate({ params: idParams }), f.getFile);
router.delete('/:id', validate({ params: idParams }), f.deleteFile);

export default router;
