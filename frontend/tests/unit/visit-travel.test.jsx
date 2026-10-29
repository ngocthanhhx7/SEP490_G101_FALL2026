import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { VisitTravel } from '../../src/components/common/VisitTravel.jsx';

afterEach(cleanup);
const startAt = new Date(Date.now() + 1800000).toISOString(), endAt = new Date(Date.now() + 5400000).toISOString();
const state = { visitId: 'visit', available: true, version: 0, state: 'NOT_SHARING', sharing: false, fresh: false, location: null };
function fixture() {
  return { travel: jest.fn(async () => ({ data: state })),
    travelCommand: jest.fn(async (_id, body) => ({ data: { ...state, version: body.expectedVersion + 1,
      state: body.action === 'START' ? 'EN_ROUTE' : 'STOPPED', sharing: body.action === 'START', sessionId: 'synthetic-session' } })),
    travelLocation: jest.fn(async (_id, body) => ({ data: { ...state, state: 'EN_ROUTE', sharing: true, version: 1, fresh: true, location: body } })),
    travelEta: jest.fn(async () => ({ data: { minutes: 8, source: 'SYNTHETIC', observedAt: new Date().toISOString() } })) };
}
const open = () => { const details = screen.getByText('Hành trình đến điểm chăm sóc').parentElement; details.open = true; fireEvent(details, new window.Event('toggle')); };

test('GPS is requested only after an employee starts; stop clears sharing and uses server version', async () => {
  const api = fixture(), gps = jest.fn(resolve => resolve({ coords: { longitude: 105.85, latitude: 21.01, accuracy: 10 }, timestamp: Date.now() }));
  Object.defineProperty(globalThis.navigator, 'geolocation', { configurable: true, value: { getCurrentPosition: gps } });
  render(<VisitTravel api={api} visitId="visit" employee startAt={startAt} endAt={endAt} />);
  expect(api.travel).not.toHaveBeenCalled(); expect(gps).not.toHaveBeenCalled(); open();
  fireEvent.click(await screen.findByRole('button', { name: 'Chia sẻ vị trí' }));
  await waitFor(() => expect(api.travelLocation).toHaveBeenCalledWith('visit', expect.objectContaining({ coordinates: [105.85, 21.01] })));
  fireEvent.click(screen.getByRole('button', { name: 'Dừng chia sẻ' }));
  await waitFor(() => expect(api.travelCommand).toHaveBeenLastCalledWith('visit', { action: 'STOP', expectedVersion: 1 }));
  expect(gps).toHaveBeenCalledTimes(1);
});

test('customer has no employee controls and unavailable location cannot request ETA', async () => {
  const api = fixture(); render(<VisitTravel api={api} visitId="visit" startAt={startAt} endAt={endAt} />); open();
  expect(await screen.findByText('Chưa chia sẻ vị trí')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Chia sẻ vị trí' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Ước tính giờ đến' })).toBeDisabled();
});

test('permission failure creates no server sharing session', async () => {
  const api = fixture(); Object.defineProperty(globalThis.navigator, 'geolocation', { configurable: true,
    value: { getCurrentPosition: (_resolve, reject) => reject(new Error('denied')) } });
  render(<VisitTravel api={api} visitId="visit" employee startAt={startAt} endAt={endAt} />); open();
  fireEvent.click(await screen.findByRole('button', { name: 'Chia sẻ vị trí' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Chưa cập nhật');
  expect(api.travelCommand).not.toHaveBeenCalled();
});

test('closing the panel stops its active sharing session', async () => {
  const api = fixture(); Object.defineProperty(globalThis.navigator, 'geolocation', { configurable: true,
    value: { getCurrentPosition: resolve => resolve({ coords: { longitude: 105.85, latitude: 21.01, accuracy: 10 }, timestamp: Date.now() }) } });
  const result = render(<VisitTravel api={api} visitId="visit" employee startAt={startAt} endAt={endAt} />); open();
  fireEvent.click(await screen.findByRole('button', { name: 'Chia sẻ vị trí' }));
  await waitFor(() => expect(api.travelLocation).toHaveBeenCalled()); result.unmount();
  expect(api.travelCommand).toHaveBeenLastCalledWith('visit', { action: 'STOP', expectedVersion: 1 });
});
