import { AppError } from '../utils/app-error.js';

const retired = () => { throw new AppError(410, 'LEGACY_COMPENSATION_RETIRED', 'Use employee payroll for salary and commission'); };
export const retiredSettlementService = Object.freeze({ readOwn: retired, submit: retired, withdraw: retired,
  list: retired, decide: retired, recordTransfer: retired });
export const retiredCompensationReader = Object.freeze({ readSnapshot: retired });
