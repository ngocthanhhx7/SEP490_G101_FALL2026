import { demoServiceCatalog } from '../../constants/demo-service-catalog.js';

const homeCare = demoServiceCatalog.find(service => service.code === 'home-care');

export function dispatchVisitPresentation(row) {
  const snapshot = row.snapshots;
  return {
    serviceName: snapshot?.serviceName ?? null,
    ...(row.location === 'HOME' && snapshot?.serviceName === homeCare.name && snapshot.serviceScope === homeCare.scope
      ? { serviceDisplayName: 'Chăm sóc sinh hoạt thú cưng' } : {}),
    location: row.location ?? null,
    petNames: (snapshot?.pets ?? []).map(pet => pet?.name).filter(name => typeof name === 'string' && name.trim()).slice(0, 10)
  };
}
