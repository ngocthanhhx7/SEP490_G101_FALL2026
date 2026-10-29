export function createEmployeePayrollApi(request) {
  const get = async (path, signal) => (await request(`/payroll${path}`, { signal })).data;
  const post = async (path, body, idempotencyKey) => (await request(`/payroll${path}`, { method: 'POST', body, idempotencyKey })).data;
  return Object.freeze({
    own: ({ signal } = {}) => get('/me', signal),
    advances: ({ signal } = {}) => get('/advances', signal),
    statements: ({ signal } = {}) => get('/statements', signal),
    submit: (body, key) => post('/advances', body, key),
    contract: (body, key) => post('/contracts', body, key),
    prepare: (body, key) => post('/statements', body, key),
    advanceDecision: (id, body, key) => post(`/advances/${encodeURIComponent(id)}/decisions`, body, key),
    statementDecision: (id, body, key) => post(`/statements/${encodeURIComponent(id)}/decisions`, body, key)
  });
}
