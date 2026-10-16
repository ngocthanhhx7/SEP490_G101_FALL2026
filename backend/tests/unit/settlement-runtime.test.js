import { expect, test } from '@jest/globals';
import { settlementRequestRuntimeModule } from '../../src/routes/settlement-runtime.js';

test('settlement runtime stays disabled without authenticated database wiring', () => {
  expect(settlementRequestRuntimeModule()).toBeNull();
  expect(settlementRequestRuntimeModule({ config: { auth: { enabled: false } }, connection: {} })).toBeNull();
  expect(settlementRequestRuntimeModule({ config: { auth: { enabled: true } } })).toBeNull();
});
