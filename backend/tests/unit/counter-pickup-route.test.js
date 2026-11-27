import { jest, expect, test } from '@jest/globals';
import { createPickupDrivingRoute } from '../../src/services/counter-booking/counter-pickup.service.js';

const facility = [105.812, 21.029], address = [105.884, 21.032];
test('pickup uses OSRM driving distance in meters, not matching ETA or straight-line geometry', async () => {
  const fetchImpl = jest.fn(async () => ({ ok: true, json: async () => ({
    code: 'Ok', routes: [{ distance: 6851.7, duration: 1200 }]
  }) }));
  const route = createPickupDrivingRoute({ baseUrl: 'http://127.0.0.1:5000/', fetchImpl });
  await expect(route(facility, address)).resolves.toBe(6851.7);
  const url = String(fetchImpl.mock.calls[0][0]);
  expect(url).toContain('/route/v1/driving/105.812,21.029;105.884,21.032');
  expect(url).toContain('overview=false');
  expect(url).not.toContain('annotations=duration');
});
test.each([
  { ok: false },
  { ok: true, json: async () => ({ code: 'NoRoute', routes: [] }) },
  { ok: true, json: async () => ({ code: 'Ok', routes: [{ distance: -5 }] }) },
  { ok: true, json: async () => ({ code: 'Ok', routes: [{ distance: NaN }] }) }
])('OSRM does not return a valid road distance: no pickup quote', async response => {
  const route = createPickupDrivingRoute({
    baseUrl: 'https://routing.example.test/', fetchImpl: async () => response
  });
  await expect(route(facility, address)).rejects.toMatchObject({
    code: 'PICKUP_DISTANCE_UNAVAILABLE', status: 503
  });
});
test('unconfigured OSRM and invalid client destination fail closed', async () => {
  await expect(createPickupDrivingRoute()(facility, address)).rejects.toMatchObject({ status: 503 });
  await expect(createPickupDrivingRoute({
    baseUrl: 'https://routing.example.test/', fetchImpl: async () => { throw Error('must not reach'); }
  })(facility, [999, 999])).rejects.toMatchObject({ status: 503 });
});
