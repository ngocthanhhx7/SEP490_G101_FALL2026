import { expect, test } from '@jest/globals';
import { adminSettlementRuntimeModule } from '../../src/routes/admin-settlement-runtime.js';

test('admin settlement runtime stays disabled without authenticated database wiring', () => {
  expect(adminSettlementRuntimeModule()).toBeNull();
  expect(adminSettlementRuntimeModule({ config: { auth: { enabled: false } }, connection: {} })).toBeNull();
  expect(adminSettlementRuntimeModule({ config: { auth: { enabled: true } } })).toBeNull();
});
