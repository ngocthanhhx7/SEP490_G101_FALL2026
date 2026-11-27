import { isUncertainOutcome } from '../../src/utils/product-format.js';

describe('FE-MONEY-04 isUncertainOutcome', () => {
  test('UTCID01 abnormal: keeps the retry key for NETWORK_ERROR', () => {
    expect(isUncertainOutcome({ code: 'NETWORK_ERROR' })).toBe(true);
  });

  test('UTCID02 abnormal: keeps the retry key for TIMEOUT', () => {
    expect(isUncertainOutcome({ code: 'TIMEOUT' })).toBe(true);
  });

  test('UTCID03 abnormal: keeps the retry key for HTTP_ERROR', () => {
    expect(isUncertainOutcome({ code: 'HTTP_ERROR' })).toBe(true);
  });

  test('UTCID04 abnormal: keeps the retry key for COMMAND_PENDING', () => {
    expect(isUncertainOutcome({ code: 'COMMAND_PENDING' })).toBe(true);
  });

  test('UTCID05 abnormal: keeps the retry key for INVALID_RESPONSE', () => {
    expect(isUncertainOutcome({ code: 'INVALID_RESPONSE' })).toBe(true);
  });

  test('UTCID06 abnormal: keeps the retry key for ABORTED', () => {
    expect(isUncertainOutcome({ code: 'ABORTED' })).toBe(true);
  });

  test('UTCID07 boundary: keeps the retry key for the lowest server-error status', () => {
    expect(isUncertainOutcome({ code: 'UNKNOWN', status: 500 })).toBe(true);
  });

  test('UTCID08 boundary: treats status 499 as a certain outcome', () => {
    expect(isUncertainOutcome({ code: 'UNKNOWN', status: 499 })).toBe(false);
  });

  test('UTCID09 normal: treats a confirmed client failure as certain', () => {
    expect(isUncertainOutcome({ code: 'CART_EMPTY', status: 409 })).toBe(false);
  });

  test('UTCID10 normal: treats an unknown code without a server status as certain', () => {
    expect(isUncertainOutcome({ code: 'UNKNOWN' })).toBe(false);
  });

  test('UTCID11 abnormal: treats null and undefined errors as certain', () => {
    expect(isUncertainOutcome(null)).toBe(false);
    expect(isUncertainOutcome(undefined)).toBe(false);
  });
});
