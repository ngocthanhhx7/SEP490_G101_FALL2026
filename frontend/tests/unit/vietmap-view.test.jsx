import { render, screen, waitFor, act, cleanup } from '@testing-library/react';
import { VietmapView } from '../../src/components/common/VietmapView.jsx';
import { mapRequest } from '../../src/services/vietmap-display.js';

afterEach(cleanup);
function fixture() {
  const events = {}, markerEvents = {};
  const map = { addControl: jest.fn(), on: jest.fn((name, fn) => { events[name] = fn; }), remove: jest.fn(), resize: jest.fn(), easeTo: jest.fn() };
  const marker = { setLngLat: jest.fn().mockReturnThis(), addTo: jest.fn().mockReturnThis(), on: jest.fn((name, fn) => { markerEvents[name] = fn; }),
    setDraggable: jest.fn(), remove: jest.fn(), getLngLat: () => ({ lng: 105.86, lat: 21.02 }) };
  const sdk = { Map: jest.fn(() => map), Marker: jest.fn(() => marker), NavigationControl: jest.fn() };
  return { map, marker, events, markerEvents, sdk, loadSdk: jest.fn(async () => sdk) };
}
test('initializes Vietmap, emits clicked and dragged pins, rechecks disabled and removes map on unmount', async () => {
  const f = fixture(), onSelect = jest.fn();
  const view = render(<VietmapView loadSdk={f.loadSdk} coordinates={[105.85, 21.01]} onSelect={onSelect} />);
  await waitFor(() => expect(f.sdk.Map).toHaveBeenCalled());
  act(() => f.events.load());
  act(() => f.events.click({ lngLat: { lng: 105.87, lat: 21.03 } }));
  expect(onSelect).toHaveBeenLastCalledWith([105.87, 21.03]);
  act(() => f.markerEvents.dragend()); expect(onSelect).toHaveBeenLastCalledWith([105.86, 21.02]);
  view.rerender(<VietmapView loadSdk={f.loadSdk} coordinates={[105.88, 21.02]} onSelect={onSelect} disabled />);
  act(() => f.events.click({ lngLat: { lng: 105.89, lat: 21.03 } }));
  expect(onSelect).toHaveBeenCalledTimes(2); expect(f.marker.setDraggable).toHaveBeenLastCalledWith(false);
  view.unmount(); expect(f.map.remove).toHaveBeenCalledTimes(1);
});
test('read-only position cannot emit a pin and provider failure is visible', async () => {
  const f = fixture(); render(<VietmapView loadSdk={f.loadSdk} coordinates={[105.85, 21.01]} />);
  await waitFor(() => expect(f.sdk.Map).toHaveBeenCalled());
  act(() => f.events.error()); expect(screen.getByRole('status')).toHaveTextContent('Chưa tải được bản đồ Vietmap');
});
test('only permits same-origin authenticated map resources', () => {
  expect(mapRequest('/api/v1/maps/render/maps/styles/tm/style.json').credentials).toBe('same-origin');
  for (const url of ['https://maps.vietmap.vn/maps/tiles/x', 'https://attacker.test/x', '/api/v1/maps/render/maps/x?apikey=secret']) expect(() => mapRequest(url)).toThrow();
});
