import { Router } from 'express';
import { container } from '../../../config/container.config.js';
import { upload } from '../../../middlewares/multer.middleware.js';

export const svcUploadsRouter = Router();

const { uploadsController, requireAuth, requireStudentOrParent } = container;

svcUploadsRouter.use(requireAuth);
svcUploadsRouter.use(requireStudentOrParent);

/**
 * 파일 업로드
 * POST /api/svc/v1/uploads
 * body: file (multipart/form-data)
 */
svcUploadsRouter.post('/', upload.single('file'), uploadsController.uploadFile);
