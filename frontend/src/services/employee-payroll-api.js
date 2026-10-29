export function createEmployeePayrollApi(request) {
  const query = values => {
    const params = new globalThis.URLSearchParams();
    for (const [key, value] of Object.entries(values)) if (value !== undefined && value !== null) params.set(key, value);
    return params.size ? `?${params}` : '';
  };
  const get = async (path, signal) => (await request(`/payroll${path}`, { signal })).data;
  const post = async (path, body, idempotencyKey) => (await request(`/payroll${path}`, { method: 'POST', body, idempotencyKey })).data;
  return Object.freeze({
    own: ({ signal, advanceCursor, statementCursor, adjustmentCursor, limit } = {}) => get('/me' + query({ advanceCursor, statementCursor, adjustmentCursor, limit }), signal),
    adjustments: ({ signal, cursor, limit } = {}) => get('/adjustments' + query({ cursor, limit }), signal),
    submitAdjustment: (body, key) => post('/adjustments', body, key),
    adjustmentDecision: (id, body, key) => post(`/adjustments/${encodeURIComponent(id)}/decisions`, body, key),
    advances: ({ signal, cursor, view, limit } = {}) => get('/advances' + query({ cursor, view, limit }), signal),
    statements: ({ signal, cursor, limit } = {}) => get('/statements' + query({ cursor, limit }), signal),
    submit: (body, key) => post('/advances', body, key),
    contract: (body, key) => post('/contracts', body, key),
    prepare: (body, key) => post('/statements', body, key),
    advanceDecision: (id, body, key) => post(`/advances/${encodeURIComponent(id)}/decisions`, body, key),
    statementDecision: (id, body, key) => post(`/statements/${encodeURIComponent(id)}/decisions`, body, key)
  });
}
