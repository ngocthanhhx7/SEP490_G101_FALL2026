import { DEMO_WORK_AREAS } from '../constants/demo-work-areas.js';

// Share the operational coverage catalog; never infer coverage from a map pin.
export function createPublicServiceAreas({ enabled, areas = DEMO_WORK_AREAS }) {
  return {
    list: () => ({
      available: enabled,
      areas: enabled ? areas.filter(area => area.level !== 'CITY').map(area => ({
        id: area.code, name: area.label,
        description: 'Khu vực vận hành demo tại Hà Nội. Lịch cụ thể còn phụ thuộc địa chỉ và người chăm sóc đủ điều kiện.'
      })) : []
    })
  };
}
