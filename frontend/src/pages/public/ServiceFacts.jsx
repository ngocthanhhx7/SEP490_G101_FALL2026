const labels = { FACILITY: 'Tại cơ sở', HOME: 'Tại gia', OUTDOOR: 'Ngoài trời' };

export function ServiceFacts({ service }) {
  if (!service.details?.category) return null;
  return <p className="pwc-service-facts">
    <span>{service.details.category}</span>
    <span>{service.details.locations.map(x => labels[x]).join(' / ')}</span>
    {service.details.durationMinutes && <span>{service.details.durationMinutes} phút</span>}
  </p>;
}
