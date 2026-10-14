import { createCustomerAddressAdapter, ADDRESS_PAGE_SIZE } from '../../src/services/customer-address-adapter.js';

const ADDRESS_ID = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const VISIT_ID = 'bbbbbbbbbbbbbbbbbbbbbbbb';

test('uses bounded cursor pages and forwards abort signal', async () => {
  const request = jest.fn().mockResolvedValue({ data: { addresses: [], nextCursor: null } });
  const adapter = createCustomerAddressAdapter(request);
  const controller = new AbortController();
  await adapter.list({ cursor: 'cursor-2', signal: controller.signal });
  expect(ADDRESS_PAGE_SIZE).toBe(20);
  expect(request).toHaveBeenCalledWith('/addresses?limit=20&cursor=cursor-2', { signal: controller.signal });
});

test('posts owner commands with idempotency keys and expected versions in body', async () => {
  const request = jest.fn().mockResolvedValue({ data: { id: ADDRESS_ID } });
  const adapter = createCustomerAddressAdapter(request);
  await adapter.create({ label: 'Home', location: '12 Synthetic Road' });
  await adapter.update(ADDRESS_ID, { label: 'Home', expectedVersion: 2, confirmOpenBookingImpact: true });
  await adapter.archive(ADDRESS_ID, { expectedVersion: 3 });
  expect(request).toHaveBeenNthCalledWith(1, '/addresses', expect.objectContaining({
    method: 'POST', body: { label: 'Home', location: '12 Synthetic Road' }, idempotencyKey: expect.any(String)
  }));
  expect(request).toHaveBeenNthCalledWith(2, `/addresses/${ADDRESS_ID}`, expect.objectContaining({
    method: 'PATCH', body: { label: 'Home', expectedVersion: 2, confirmOpenBookingImpact: true }, idempotencyKey: expect.any(String)
  }));
  expect(request).toHaveBeenNthCalledWith(3, `/addresses/${ADDRESS_ID}/archives`, expect.objectContaining({
    method: 'POST', body: { expectedVersion: 3 }, idempotencyKey: expect.any(String)
  }));
  expect(request.mock.calls.map(([, options]) => options.idempotencyKey).every(Boolean)).toBe(true);
});

test('rejects identifier path injection and supports sitter access-note fetch', async () => {
  const request = jest.fn().mockResolvedValue({ data: { visitId: VISIT_ID, privateAccessNotes: 'Synthetic note' } });
  const adapter = createCustomerAddressAdapter(request);
  expect(() => adapter.update(`${ADDRESS_ID}?x=1`, { expectedVersion: 0 })).toThrow('INVALID_ADDRESS_ID');
  expect(() => adapter.accessNotes('../addresses', {})).toThrow('INVALID_VISIT_ID');
  const controller = new AbortController();
  await adapter.accessNotes(VISIT_ID, { signal: controller.signal });
  expect(request).toHaveBeenCalledWith(`/visits/${VISIT_ID}/access-notes`, { signal: controller.signal });
});
