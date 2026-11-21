import { demoServiceCatalog } from '../../constants/demo-service-catalog.js';

const homeCare = demoServiceCatalog.find(service => service.code === 'home-care');

export function visitServiceDisplayName({ serviceName, serviceScope, location }) {
  return location === 'HOME' && serviceName === homeCare.name && serviceScope === homeCare.scope
    ? 'Chăm sóc sinh hoạt thú cưng' : undefined;
}

export function dispatchVisitPresentation(row) {
  const snapshot = row.snapshots;
  const serviceDisplayName = visitServiceDisplayName({ ...snapshot, location: row.location });
  return {
    serviceName: snapshot?.serviceName ?? null,
    ...(serviceDisplayName && { serviceDisplayName }),
    location: row.location ?? null,
    petNames: (snapshot?.pets ?? []).map(pet => pet?.name).filter(name => typeof name === 'string' && name.trim()).slice(0, 10)
  };
}
