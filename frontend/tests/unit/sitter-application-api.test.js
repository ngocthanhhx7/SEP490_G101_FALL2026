import { createSitterApplicationApi, sitterApplicationApi, sitterApplicationAdminApi, createSitterApplicationAdminApi } from '../../src/services/sitter-application-api.js';
import { apiSessionAdapter } from '../../src/services/session-adapter.js';
const response = (data, status = 200) => ({ ok: status < 400, status, json: async () => ({ meta: { schemaVersion: 1 }, data }) });

test('submission sends the session CSRF and stable command key and validates receipt metadata', async () => {
  const fetchImpl = jest.fn(async () => response({ id: 'app', state: 'PENDING', applicationCode: 'synthetic-application-code-0001' }, 201));
  const api = createSitterApplicationApi({ fetchImpl, getCsrfToken: () => 'synthetic-csrf' });
  await expect(api.submit({ displayName: 'Synthetic' }, { key: 'synthetic-command-key' })).resolves.toMatchObject({ state: 'PENDING' });
  expect(fetchImpl).toHaveBeenCalledWith('/api/v1/applications', expect.objectContaining({ method: 'POST', credentials: 'same-origin',
    headers: expect.objectContaining({ 'X-CSRF-Token': 'synthetic-csrf', 'Idempotency-Key': 'synthetic-command-key' }) }));
  fetchImpl.mockResolvedValueOnce(response({ id: 'app' }, 201));
  await expect(api.submit({})).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
});

test('missing CSRF blocks submission before sending and injected uploads retain document type', async () => {
  const fetchImpl = jest.fn();
  const uploader = jest.fn(async () => ({ documentId: 'synthetic' }));
  const api = createSitterApplicationApi({ fetchImpl, getCsrfToken: () => null, uploadDocumentImpl: uploader });
  await expect(api.submit({})).rejects.toMatchObject({ code: 'CSRF_UNAVAILABLE' });
  expect(fetchImpl).not.toHaveBeenCalled();
  const file = new globalThis.File(['synthetic'], 'test.png', { type: 'image/png' });
  await api.uploadDocument(file, { documentType: 'IDENTITY' });
  expect(uploader).toHaveBeenCalledWith(file, { documentType: 'IDENTITY', signal: undefined });
});

test('the real upload adapter sends raw image bytes and reuses its key for the same file', async () => {
  const original = globalThis.fetch;
  const fetchImpl = jest.fn(async path => path.endsWith('/me')
    ? response({ user: { id: 'synthetic-user', displayName: 'Synthetic', roles: ['CUSTOMER'] }, csrfToken: 'synthetic-upload-csrf' })
    : response({ id: 'a'.repeat(64), state: 'READY' }, 201));
  globalThis.fetch = fetchImpl;
  try {
    await apiSessionAdapter.resolve();
    const file = new globalThis.File(['synthetic'], 'test.png', { type: 'image/png' });
    await expect(sitterApplicationApi.uploadDocument(file)).resolves.toEqual({ documentId: 'a'.repeat(64), storageRef: 'a'.repeat(64) });
    await sitterApplicationApi.uploadDocument(file);
    const uploads = fetchImpl.mock.calls.filter(([path]) => path.endsWith('/applicant-documents'));
    expect(uploads).toHaveLength(2);
    expect(uploads[0][1]).toMatchObject({ body: file, headers: { 'Content-Type': 'image/png', 'X-CSRF-Token': 'synthetic-upload-csrf' } });
    expect(uploads[0][1].headers['Idempotency-Key']).toBe(uploads[1][1].headers['Idempotency-Key']);
    await expect(sitterApplicationApi.uploadDocument(new globalThis.File(['pdf'], 'bad.pdf', { type: 'application/pdf' }))).rejects.toMatchObject({ code: 'INVALID_DOCUMENT' });
    expect(fetchImpl.mock.calls.filter(([path]) => path.endsWith('/applicant-documents'))).toHaveLength(2);
  } finally { globalThis.fetch = original; }
});

test('production Admin adapter reads session CSRF for review, interview, approve/reject and status commands', async () => {
  const original = globalThis.fetch;
  const fetchImpl = jest.fn(async path => path.endsWith('/me')
    ? response({ user: { id: 'a'.repeat(24), displayName: 'Synthetic Admin', roles: ['ADMIN'] }, csrfToken: 'synthetic-admin-csrf' })
    : response({ state: 'APPROVED' }));
  globalThis.fetch = fetchImpl;
  try {
    await apiSessionAdapter.resolve();
    const input = { applicationId: 'b'.repeat(24), expectedVersion: 3 };
    await sitterApplicationAdminApi.startReview(input);
    await sitterApplicationAdminApi.startInterview(input);
    for (const action of ['APPROVE', 'REJECT']) await sitterApplicationAdminApi.decide({ ...input, action, reason: 'Synthetic review' });
    await sitterApplicationAdminApi.changeSitterStatus({ ...input, action: 'SUSPEND', reason: 'Synthetic status' });
    const commands = fetchImpl.mock.calls.filter(([, options]) => options.method === 'POST');
    expect(commands).toHaveLength(5);
    for (const [, options] of commands) {
      expect(options.headers.get('X-CSRF-Token')).toBe('synthetic-admin-csrf');
      expect(options.headers.get('Idempotency-Key')).toBeTruthy();
      expect(options.credentials).toBe('same-origin');
    }
  } finally { globalThis.fetch = original; }
});

test('Admin transport still blocks mutations before fetch when session CSRF is absent', async () => {
  const fetchImpl = jest.fn();
  const api = createSitterApplicationAdminApi({ fetchImpl, getCsrfToken: () => null });
  await expect(api.decide({ applicationId: 'b'.repeat(24), action: 'APPROVE', reason: 'Synthetic', expectedVersion: 1 }))
    .rejects.toMatchObject({ code: 'CSRF_NOT_READY' });
  expect(fetchImpl).not.toHaveBeenCalled();
});
