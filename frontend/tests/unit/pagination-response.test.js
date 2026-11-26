import { ApiError } from '../../src/services/api-client.js';
import { readPagination } from '../../src/services/pagination-response.js';

const expectInvalidResponse = (data) => {
  try {
    readPagination(data);
  } catch (error) {
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ code: 'INVALID_RESPONSE', status: 200 });
    return;
  }
  throw new Error('Expected readPagination to reject invalid metadata');
};

describe('FE-PAGE-DTO-01 readPagination', () => {
  test('UTCID01 normal: returns the complete valid pagination metadata', () => {
    const data = { page: 2, limit: 20, total: 85 };

    const result = readPagination(data);

    expect(result).toEqual({ page: 2, limit: 20, total: 85 });
    expect(result).not.toBe(data);
  });

  test('UTCID02 boundary: accepts the lowest valid page, limit, and total', () => {
    const result = readPagination({ page: 1, limit: 1, total: 0 });

    expect(result).toEqual({ page: 1, limit: 1, total: 0 });
  });

  test('UTCID03 boundary: accepts the SRS maximum limit of 50', () => {
    const result = readPagination({ page: 1, limit: 50, total: 50 });

    expect(result).toEqual({ page: 1, limit: 50, total: 50 });
  });

  test('UTCID04 normal: returns undefined when optional pagination metadata is absent', () => {
    const result = readPagination({});

    expect(result).toBeUndefined();
  });

  test('UTCID05 normal: returns undefined when the response data is undefined', () => {
    const result = readPagination(undefined);

    expect(result).toBeUndefined();
  });

  test('UTCID06 abnormal: rejects partially supplied metadata', () => {
    expectInvalidResponse({ page: 1 });
  });

  test('UTCID07 abnormal: rejects a fractional page', () => {
    expectInvalidResponse({ page: 1.5, limit: 20, total: 1 });
  });

  test('UTCID08 abnormal: rejects a non-numeric limit', () => {
    expectInvalidResponse({ page: 1, limit: '20', total: 1 });
  });

  test('UTCID09 abnormal: rejects page zero', () => {
    expectInvalidResponse({ page: 0, limit: 20, total: 1 });
  });

  test('UTCID10 abnormal: rejects limit zero', () => {
    expectInvalidResponse({ page: 1, limit: 0, total: 1 });
  });

  test('UTCID11 abnormal: rejects a negative total', () => {
    expectInvalidResponse({ page: 1, limit: 20, total: -1 });
  });

  test('UTCID12 boundary: rejects a limit above the SRS maximum of 50', () => {
    expectInvalidResponse({ page: 1, limit: 51, total: 51 });
  });
});
