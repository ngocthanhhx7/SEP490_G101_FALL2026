import { createProjectionApi } from './dashboard-projection-api.js';
export const createPayrollApi = options => createProjectionApi({ ...options, kind: 'payroll', path: '/payroll' });
export const payrollApi = createPayrollApi();
