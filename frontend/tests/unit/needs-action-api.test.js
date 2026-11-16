import { createNeedsActionApi } from '../../src/services/needs-action-api.js';
import { createEmployeeSchedulingApi } from '../../src/services/employee-scheduling-api.js';

describe('needs action API client', () => {
  test('visitBoard reads the board path and leaves empty params out of the URL', async () => {
    const request = jest.fn().mockResolvedValue({ data: { items: [] } });
    const signal = new AbortController().signal;
    await createNeedsActionApi(request).visitBoard({ tab: 'all', search: 'Ngô Minh', areaCode: '', reason: undefined, cursor: null }, { signal });
    expect(request).toHaveBeenCalledWith(`/employee-scheduling/visit-board?${new globalThis.URLSearchParams({ tab: 'all', search: 'Ngô Minh' })}`, { signal });
  });

  test('visitBoard without params has no query string', async () => {
    const request = jest.fn().mockResolvedValue({ data: { items: [] } });
    await createNeedsActionApi(request).visitBoard();
    expect(request).toHaveBeenCalledWith('/employee-scheduling/visit-board', { signal: undefined });
  });

  test('visitContact asks for one party of one visit and returns the answer', async () => {
    const answer = { data: { party: 'sitter', displayName: 'Trịnh Văn Hoà', phone: '0912345678' } };
    const request = jest.fn().mockResolvedValue(answer);
    await expect(createNeedsActionApi(request).visitContact('visit-1', 'sitter')).resolves.toBe(answer);
    expect(request).toHaveBeenCalledWith('/employee-scheduling/visits/visit-1/contact?party=sitter', { signal: undefined });
  });

  test('visitContact accepts a missing number and refuses an answer for another party or a wrong shape', async () => {
    const none = { data: { party: 'customer', displayName: 'Ngô Minh Đức', phone: null } };
    await expect(createNeedsActionApi(jest.fn().mockResolvedValue(none)).visitContact('visit-1', 'customer')).resolves.toBe(none);
    for (const data of [{ party: 'customer', phone: '0912345678' }, { party: 'sitter', phone: 912345678 }, null]) {
      await expect(createNeedsActionApi(jest.fn().mockResolvedValue({ data })).visitContact('visit-1', 'sitter')).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
    }
  });

  test('visitContact refuses an id that is not a plain resource id before any request', async () => {
    const request = jest.fn();
    await expect(createNeedsActionApi(request).visitContact('../x', 'sitter')).rejects.toMatchObject({ code: 'INVALID_RESOURCE_ID' });
    expect(request).not.toHaveBeenCalled();
  });

  test('the dispatch API exposes the board and contact methods and keeps its own propose', () => {
    const api = createEmployeeSchedulingApi(jest.fn());
    expect(api.visitBoard).toEqual(expect.any(Function));
    expect(api.visitContact).toEqual(expect.any(Function));
    expect(api).not.toHaveProperty('assign');
    expect(api).not.toHaveProperty('detail');
  });
});
