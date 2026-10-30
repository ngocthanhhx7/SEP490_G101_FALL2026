import { createProjectionApi } from './dashboard-projection-api.js';
export const createSitterProfileApi = options => createProjectionApi({ ...options, kind: 'sitter-profile', path: '/me/sitter-profile' });
export const sitterProfileApi = createSitterProfileApi();
