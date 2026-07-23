import { Router } from 'express';
import { createAuthedRouter } from './authedRouter';
import { createPresignedUploadHandler } from '../controllers/uploads/presignUpload';
import { deleteUploadHandler } from '../controllers/uploads/deleteUpload';

const router = Router();
const authed = createAuthedRouter(router);

authed.post('/presign', createPresignedUploadHandler);
authed.delete('/', deleteUploadHandler);

export default router;
