import { expect, test } from '@jest/globals';
import { parsePageQuery } from '../../src/validators/pagination.validator.js';

const invalid = value => expect(() => parsePageQuery(value)).toThrow(expect.objectContaining({ code: 'VALIDATION_FAILED' }));

test('UTCID01 defaults missing page and limit', () => expect(parsePageQuery()).toEqual({ page: 1, limit: 20 }));
test('UTCID02 parses bounded decimal-digit strings', () => expect(parsePageQuery({ page: '100000', limit: '50' })).toEqual({ page: 100000, limit: 50 }));
test.each([
  ['UTCID03', { page: '0' }], ['UTCID04', { page: '1.5' }], ['UTCID05', { page: 1 }],
  ['UTCID06', { page: null }], ['UTCID07', { limit: '0' }], ['UTCID08', { limit: '51' }],
  ['UTCID09', { limit: ' 1' }], ['UTCID10', { limit: true }]
])('%s rejects a non-contract query value', (_id, query) => invalid(query));
test('UTCID11 honours a caller-provided default and maximum', () => {
  expect(parsePageQuery({}, { defaultLimit: 10, maxLimit: 25 })).toEqual({ page: 1, limit: 10 });
  expect(() => parsePageQuery({ limit: '26' }, { maxLimit: 25 })).toThrow(expect.objectContaining({ code: 'VALIDATION_FAILED' }));
});
test.each([['UTCID12', { page: undefined }], ['UTCID13', { limit: undefined }]])('%s treats an explicit undefined value as omitted', (_id, query) => {
  expect(parsePageQuery(query)).toEqual({ page: 1, limit: 20 });
});
