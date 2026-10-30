import { createProjectionApi } from './dashboard-projection-api.js';
export const createSitterListApi = options => createProjectionApi({ ...options, kind: 'sitter-list', path: '/sitters' });
export const sitterListApi = createSitterListApi();
