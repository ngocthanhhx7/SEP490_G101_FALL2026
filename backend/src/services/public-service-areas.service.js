import { DEMO_WORK_AREAS } from '../constants/demo-work-areas.js';

// Map provider/geocoding results are never proof that coverage is open.
export function createPublicServiceAreas({ enabled, areas = DEMO_WORK_AREAS }) {
  const view = rows => ({ available: enabled, areas: enabled ? rows.filter(area => !['CITY', 'PROVINCE'].includes(area.level)).map(area => ({ id: area.code, name: area.label,
    description: 'Khu vực đã mở phục vụ. Lịch cụ thể còn phụ thuộc địa chỉ và người chăm sóc đủ điều kiện.' })) : [] });
  return { list: () => !enabled ? view([]) : typeof areas === 'function' ? Promise.resolve(areas()).then(view) : view(areas) };
}
