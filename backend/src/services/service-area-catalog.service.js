import { serviceAreaModels } from '../models/service-area.model.js';
import { DEMO_WORK_AREAS } from '../constants/demo-work-areas.js';
import { AppError } from '../utils/app-error.js';

export const AREA_POLICY_ID = 'coverage-policy';
export const areaView = row => ({ code: row._id, level: row.level, label: row.label,
  ...(row.parentCode ? { parentCode: row.parentCode } : {}), enabled: row.enabled,
  sourceVersion: row.sourceVersion });

// No process cache: activation/closure is observed by every request and transaction.
export function createServiceAreaCatalog(connection) {
  const { ServiceArea } = serviceAreaModels(connection);
  async function policyState(session) {
    const policy = await ServiceArea.findById(AREA_POLICY_ID).session(session ?? null).lean();
    if (!policy && await ServiceArea.exists({}).session(session ?? null))
      throw new AppError(503, 'WORK_AREA_CATALOG_UNAVAILABLE', 'Area registry control is missing');
    return policy;
  }
  async function list({ all = false, session } = {}) {
    const policy = await policyState(session);
    // Additive rollout compatibility only. Once provisioned, an empty enabled list stays empty.
    if (!policy) return DEMO_WORK_AREAS.map(row => ({ ...row, enabled: true }));
    const rows = await ServiceArea.find({ ...(all ? {} : { enabled: true }), level: { $in: ['PROVINCE', 'COMMUNE', 'CITY', 'DISTRICT'] } })
      .sort({ _id: 1 }).limit(4001).session(session ?? null).lean();
    if (rows.length > 4000) throw new AppError(503, 'WORK_AREA_CATALOG_UNAVAILABLE', 'Area catalog exceeds supported bound');
    return rows.map(areaView);
  }
  async function assertOpen(code, session) {
    const policy = await policyState(session);
    if (!policy) {
      if (!DEMO_WORK_AREAS.some(row => row.code === code)) throw new AppError(409, 'WORK_AREA_CLOSED', 'Area is not open for new work');
      return;
    }
    // Scheduling commands and admin changes write the same gate, preventing stale activation races.
    if (session) await ServiceArea.updateOne({ _id: AREA_POLICY_ID }, { $inc: { guardVersion: 1 } }, { session });
    const active = await ServiceArea.exists({ _id: code, enabled: true }).session(session ?? null);
    if (!active) throw new AppError(409, 'WORK_AREA_CLOSED', 'Area is not open for new work');
  }
  async function lock(session) { if (session) await ServiceArea.updateOne({ _id: AREA_POLICY_ID }, { $inc: { guardVersion: 1 } }, { session }); }
  return { list, assertOpen, lock };
}
