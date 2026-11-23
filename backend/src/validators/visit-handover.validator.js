import { exact, fail, number } from './pet-care.validator.js';
import { schedulingKey } from './employee-scheduling.validator.js';

export function handoverConfirmationInput(body, key) {
  const fields = ['expectedVersion', 'careVersion', 'acknowledged'];
  exact(body, fields, fields);
  schedulingKey(key);
  number(body.expectedVersion, 0, Number.MAX_SAFE_INTEGER, true);
  if (body.acknowledged !== true || typeof body.careVersion !== 'string' || !/^[a-f0-9]{64}$/.test(body.careVersion))
    fail('VALIDATION_FAILED', 'Reading acknowledgement and care snapshot version required');
  return body;
}
