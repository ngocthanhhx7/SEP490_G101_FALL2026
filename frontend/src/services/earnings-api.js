import { createProjectionApi } from './dashboard-projection-api.js';
export const createEarningsApi = options => createProjectionApi({ ...options, kind: 'earnings', path: '/me/earnings' });
export const earningsApi = createEarningsApi();
