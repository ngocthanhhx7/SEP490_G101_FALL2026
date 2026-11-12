import { ApiError } from './api-client.js';

export function createEmployeePayrollApi(request) {
  const query = values => {
    const params = new globalThis.URLSearchParams();
    for (const [key, value] of Object.entries(values)) if (value !== undefined && value !== null) params.set(key, value);
    return params.size ? `?${params}` : '';
  };
  const get = async (path, signal) => (await request(`/payroll${path}`, { signal })).data;
  const post = async (path, body, idempotencyKey) => (await request(`/payroll${path}`, { method: 'POST', body, idempotencyKey })).data;
  const decide = async (path, id, body, key, status) => {
    const result = await request(`/payroll${path}`, {method:'POST',body,idempotencyKey:key});
    if (result.pending || result.data?.id !== id || result.data.version !== body.expectedVersion + 1 || result.data.status !== status)
      throw new ApiError('INVALID_RESPONSE');
    return result.data;
  };
  return Object.freeze({
    overview: ({signal}={})=>get('/overview',signal),
    own: ({ signal, advanceCursor, statementCursor, adjustmentCursor, limit } = {}) => get('/me' + query({ advanceCursor, statementCursor, adjustmentCursor, limit }), signal),
    adjustments: ({ signal, cursor, limit } = {}) => get('/adjustments' + query({ cursor, limit }), signal),
    submitAdjustment: (body, key) => post('/adjustments', body, key),
    adjustmentDecision: (id, body, key) => decide(`/adjustments/${encodeURIComponent(id)}/decisions`,id,body,key,({APPROVE:'APPROVED',REJECT:'REJECTED',RECORD_PAYMENT:'PAID',RECONCILE:'RECONCILED'})[body.action]),
    advances: ({ signal, cursor, view, limit } = {}) => get('/advances' + query({ cursor, view, limit }), signal),
    statements: ({ signal, cursor, limit } = {}) => get('/statements' + query({ cursor, limit }), signal),
    submit: (body, key) => post('/advances', body, key),
    contract: async (body, key) => {
      const result = await request('/payroll/contracts', { method: 'POST', body, idempotencyKey: key });
      if (result.pending || !/^[a-f0-9]{24}$/i.test(result.data?.id ?? '') || result.data?.version !== body.expectedVersion + 1)
        throw new ApiError('INVALID_RESPONSE');
      return result.data;
    },
    prepare: (body, key) => post('/statements', body, key),
    advanceDecision: (id, body, key) => decide(`/advances/${encodeURIComponent(id)}/decisions`,id,body,key,({APPROVE:'APPROVED',REJECT:'REJECTED',WITHDRAW:'WITHDRAWN',RECORD_PAYMENT:'PAID'})[body.action]),
    statementDecision: (id, body, key) => decide(`/statements/${encodeURIComponent(id)}/decisions`,id,body,key,({APPROVE:'APPROVED',REJECT:'VOIDED',VOID_UNPAID:'VOIDED',RECORD_PAYMENT:'PAID'})[body.action])
  });
}
