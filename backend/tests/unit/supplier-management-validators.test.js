import { describe, test, expect } from '@jest/globals';
import {
  parseSupplierQuery, parseSupplierPhone, parseSupplierEmail, parseCreateSupplier, parseUpdateSupplier, parseSupplierVersion, requireContact
} from '../../src/validators/supplier-management.validator.js';
import { supplierNameKey } from '../../src/utils/supplier-name.js';

const code = (fn) => { try { fn(); } catch (error) { return error.code; } return null; };
const fields = (fn) => { try { fn(); } catch (error) { return error.details.fields; } return null; };
const ID = '665f1c0e2b7d4a0012345678';
const OTHER_ID = '665f1c0e2b7d4a0012345679';

describe('supplierNameKey (AC-30 MSG116)', () => {
  const same = (a, b) => expect(supplierNameKey(a)).toBe(supplierNameKey(b));
  const different = (a, b) => expect(supplierNameKey(a)).not.toBe(supplierNameKey(b));

  test('AC-30 "Hoà Bình" and "Hòa Bình" are the same name, whatever the case or the spaces', () => {
    same('Hoà Bình', 'Hòa Bình');
    same('Công ty Hoà Bình', '  CÔNG   TY  HÒA BÌNH ');
    same('Hoà Bình', 'hoà bình');
  });

  test('the tone mark in oa, oe and uy is the same wherever it is written', () => {
    same('Hoà', 'Hòa'); same('Hoá', 'Hóa'); same('Hoả', 'Hỏa'); same('Hoã', 'Hõa'); same('Hoạ', 'Họa');
    same('Hoè', 'Hòe'); same('Khoẻ', 'Khỏe'); same('Loé', 'Lóe');
    same('Thuỷ', 'Thủy'); same('Thuỵ', 'Thụy'); same('Tuỳ', 'Tùy');
    same('Hoàng', 'Hòang'); same('Ngoài', 'Ngòai');
  });

  test('a different letter, tone or diacritic is a different name: "Mai" is not "Mãi"', () => {
    different('Mai', 'Mãi'); different('Mai', 'Mại'); different('Hoa', 'Hoà'); different('Hoà', 'Hóa');
    different('Ho', 'Hô'); different('Hưa', 'Hứa'); different('Toa', 'Tôa'); different('Bình', 'Bĩnh');
    different('Hoà Bình', 'Hoà Bính');
  });

  test('tones that are not on o or u before a, e or y are left where they are', () => {
    expect(supplierNameKey('Hoặc')).toBe('hoặc');
    expect(supplierNameKey('Tuyển')).toBe('tuyển');
    expect(supplierNameKey('Huyền')).toBe('huyền');
    expect(supplierNameKey('Quý')).toBe('quý');
    expect(supplierNameKey('Phước')).toBe('phước');
    expect(supplierNameKey('Hứa')).toBe('hứa');
  });

  test('it does not care about case, space runs, line breaks or the way an accent is typed', () => {
    same('Synthetic   Pet\tFood', 'synthetic pet food');
    same('Pet Food', 'Pet Food');
    same('Hòa'.normalize('NFD'), 'Hòa'.normalize('NFC'));
    same('Hoà'.normalize('NFD'), 'Hòa'.normalize('NFC'));
  });
});

describe('parseSupplierQuery', () => {
  test('lists every supplier by default and takes a tab and a page', () => {
    expect(parseSupplierQuery({})).toEqual({ page: 1, limit: 20, status: 'ALL' });
    expect(parseSupplierQuery({ status: 'STOPPED', page: '2', limit: '10' })).toEqual({ page: 2, limit: 10, status: 'STOPPED' });
  });

  test('rejects an unknown tab or key', () => {
    for (const query of [{ status: 'OLD' }, { status: 'active' }, { search: 'a' }, { page: '0' }, { limit: '51' }]) {
      expect(code(() => parseSupplierQuery(query))).toBe('VALIDATION_FAILED');
    }
  });
});

describe('parseSupplierPhone (MSG03)', () => {
  test('ten digits starting with 0, with spaces, dots and hyphens dropped', () => {
    for (const [raw, value] of [['0936452118', '0936452118'], ['0936 452 118', '0936452118'], [' 0936.452.118 ', '0936452118'],
      ['0936-452-118', '0936452118'], ['0 9 3 6 4 5 2 1 1 8', '0936452118'], ['0243825123', '0243825123']]) {
      expect(parseSupplierPhone(raw)).toEqual({ value });
    }
  });

  test('+84 forms, eleven-digit landlines, wrong lengths and other characters are INVALID', () => {
    for (const raw of ['+84936452118', '+84 936 452 118', '84936452118', '936452118', '09364521180', '024 3825 1234', '02438251234', '1936452118',
      '0936 452 11a', 'abc', '(0936) 452 118', '0936/452/118', '0936,452,118', 5, true, {}, []]) {
      expect(parseSupplierPhone(raw)).toEqual({ error: 'INVALID' });
    }
  });

  test('nothing given is empty, not an error', () => {
    for (const raw of [undefined, null, '', '   ']) expect(parseSupplierPhone(raw)).toEqual({ value: '' });
  });
});

describe('parseSupplierEmail (MSG02)', () => {
  test('a valid address is kept trimmed, nothing given is empty', () => {
    expect(parseSupplierEmail(' kinhdoanh@minhanpet.vn ')).toEqual({ value: 'kinhdoanh@minhanpet.vn' });
    for (const raw of [undefined, null, '', '  ']) expect(parseSupplierEmail(raw)).toEqual({ value: '' });
  });

  test('anything that is not an address is INVALID', () => {
    for (const raw of ['not-an-email', 'a@b', '@example.test', 'a b@example.test', 'a@@example.test', `${'x'.repeat(250)}@example.test`, 7, {}]) {
      expect(parseSupplierEmail(raw)).toEqual({ error: 'INVALID' });
    }
  });
});

describe('parseCreateSupplier (AC-30)', () => {
  const body = (over = {}) => ({ name: ' Công  ty  Hoà Bình ', contactName: ' Lương Thị Hoa ', phone: '0904 778 120', email: 'a@example.test', ...over });

  test('trims, collapses spaces, keeps the phone as ten digits and works out the key the name is compared by', () => {
    expect(parseCreateSupplier(body())).toEqual({ name: 'Công ty Hoà Bình', nameKey: supplierNameKey('Công ty Hòa Bình'), contactName: 'Lương Thị Hoa',
      phone: '0904778120', email: 'a@example.test', productIds: [] });
  });

  test('only the name is needed besides a phone or an email', () => {
    expect(parseCreateSupplier({ name: 'A', phone: '0904778120' })).toMatchObject({ contactName: '', email: '', productIds: [] });
    expect(parseCreateSupplier({ name: 'A', email: 'a@example.test' })).toMatchObject({ contactName: '', phone: '' });
  });

  test('MSG01, MSG03, MSG02 and MSG125 come back in one answer, a wrong phone or email not counting as missing', () => {
    expect(fields(() => parseCreateSupplier({ name: ' ', phone: 'x', email: 'y', contactName: 'z'.repeat(101) })))
      .toEqual({ name: 'REQUIRED', contactName: 'TOO_LONG', phone: 'INVALID', email: 'INVALID' });
    expect(fields(() => parseCreateSupplier({ name: 'A' }))).toEqual({ phone: 'CONTACT_REQUIRED', email: 'CONTACT_REQUIRED' });
    expect(fields(() => parseCreateSupplier({ name: '', phone: '', email: '' }))).toEqual({ name: 'REQUIRED', phone: 'CONTACT_REQUIRED', email: 'CONTACT_REQUIRED' });
    expect(fields(() => parseCreateSupplier({ name: 'A', phone: '', email: 'bad' }))).toEqual({ email: 'INVALID' });
  });

  test('products: repeats are saved once, in order; a bad id or more than 200 is refused', () => {
    expect(parseCreateSupplier(body({ productIds: [ID, OTHER_ID, ID] })).productIds).toEqual([ID, OTHER_ID]);
    expect(fields(() => parseCreateSupplier(body({ productIds: ['x'] })))).toEqual({ productIds: 'INVALID' });
    expect(fields(() => parseCreateSupplier(body({ productIds: [5] })))).toEqual({ productIds: 'INVALID' });
    expect(fields(() => parseCreateSupplier(body({ productIds: 'x' })))).toEqual({ productIds: 'INVALID' });
    expect(fields(() => parseCreateSupplier(body({ productIds: new Array(201).fill(ID) })))).toEqual({ productIds: 'TOO_MANY' });
    expect(parseCreateSupplier(body({ productIds: new Array(200).fill(ID) })).productIds).toEqual([ID]);
  });

  test('name 200 characters at most, and the status, the version and the key are not the Admin to send', () => {
    expect(parseCreateSupplier(body({ name: 'x'.repeat(200) })).name).toHaveLength(200);
    expect(fields(() => parseCreateSupplier(body({ name: 'x'.repeat(201) })))).toEqual({ name: 'TOO_LONG' });
    for (const extra of [{ status: 'STOPPED' }, { version: 0 }, { nameKey: 'x' }, { id: 'x' }]) expect(code(() => parseCreateSupplier(body(extra)))).toBe('VALIDATION_FAILED');
    for (const bad of [undefined, null, [], 'x']) expect(code(() => parseCreateSupplier(bad))).toBe('VALIDATION_FAILED');
  });
});

describe('parseUpdateSupplier (AC-30)', () => {
  test('needs the version and takes any editable field, leaving the others out', () => {
    expect(parseUpdateSupplier({ version: 2, contactName: ' Mới ' })).toEqual({ version: 2, contactName: 'Mới' });
    expect(parseUpdateSupplier({ version: 0, name: 'Hoà Bình' })).toEqual({ version: 0, name: 'Hoà Bình', nameKey: supplierNameKey('Hòa Bình') });
    expect(parseUpdateSupplier({ version: 1, phone: '', email: '', productIds: [] })).toEqual({ version: 1, phone: '', email: '', productIds: [] });
  });

  test('rejects a missing or bad version, nothing to change, other keys and wrong values', () => {
    for (const bad of [{ name: 'A' }, { version: -1, name: 'A' }, { version: 1.5, name: 'A' }, { version: '1', name: 'A' }, { version: 1 },
      { version: 1, status: 'STOPPED' }, { version: 1, nameKey: 'x' }, { version: 1, code: 'x' }]) {
      expect(code(() => parseUpdateSupplier(bad))).toBe('VALIDATION_FAILED');
    }
    expect(fields(() => parseUpdateSupplier({ version: 1, name: ' ', phone: 'x' }))).toEqual({ name: 'REQUIRED', phone: 'INVALID' });
  });
});

describe('parseSupplierVersion and requireContact', () => {
  test('stop and resume carry only the version', () => {
    expect(parseSupplierVersion({ version: 3 })).toBe(3);
    for (const bad of [undefined, null, {}, { version: -1 }, { version: '1' }, { version: 1, name: 'A' }]) expect(code(() => parseSupplierVersion(bad))).toBe('VALIDATION_FAILED');
  });

  test('a phone or an email is enough, neither is MSG125 on both fields', () => {
    expect(() => requireContact({ phone: '0904778120', email: '' })).not.toThrow();
    expect(() => requireContact({ phone: '', email: 'a@example.test' })).not.toThrow();
    expect(fields(() => requireContact({ phone: '', email: '' }))).toEqual({ phone: 'CONTACT_REQUIRED', email: 'CONTACT_REQUIRED' });
  });
});
