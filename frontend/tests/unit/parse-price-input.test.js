import { jest } from '@jest/globals';

jest.mock('../../src/constants/product-messages.js', () => ({
  PRODUCT_MESSAGES: {},
  PRODUCT_ERROR_MESSAGE_KEYS: {}
}));

jest.mock('../../src/constants/product-management.js', () => ({
  PRODUCT_FORM_LIMITS: Object.freeze({ priceMax: 100000000 })
}));

import { parsePriceInput } from '../../src/utils/product-format.js';

describe('FE-MONEY-01 parsePriceInput', () => {
  test('UTCID01 boundary: accepts the SRS minimum price', () => {
    // Arrange
    const raw = '1';

    // Act
    const result = parsePriceInput(raw);

    // Assert
    expect(result).toEqual({ value: 1 });
  });

  test('UTCID02 normal: accepts an ungrouped whole-number VND price', () => {
    // Arrange
    const raw = '250000';

    // Act
    const result = parsePriceInput(raw);

    // Assert
    expect(result).toEqual({ value: 250000 });
  });

  test('UTCID03 normal: removes Vietnamese group separators without changing the value', () => {
    // Arrange
    const raw = '250.000';

    // Act
    const result = parsePriceInput(raw);

    // Assert
    expect(result).toEqual({ value: 250000 });
  });

  test('UTCID04 normal: trims a grouped price before parsing it', () => {
    // Arrange
    const raw = ' 1.000.000 ';

    // Act
    const result = parsePriceInput(raw);

    // Assert
    expect(result).toEqual({ value: 1000000 });
  });

  test('UTCID05 boundary: accepts the SRS maximum price', () => {
    // Arrange
    const raw = '100.000.000';

    // Act
    const result = parsePriceInput(raw);

    // Assert
    expect(result).toEqual({ value: 100000000 });
  });

  test('UTCID06 boundary: rejects one VND above the maximum with TOO_LARGE', () => {
    // Arrange
    const raw = '100.000.001';

    // Act
    const result = parsePriceInput(raw);

    // Assert
    expect(result).toEqual({ error: 'TOO_LARGE' });
  });

  test('UTCID07 abnormal: rejects empty input and whitespace', () => {
    // Arrange
    const inputs = ['', ' '];

    // Act
    const results = inputs.map((raw) => parsePriceInput(raw));

    // Assert
    expect(results).toEqual([{ error: 'WHOLE_NUMBER' }, { error: 'WHOLE_NUMBER' }]);
  });

  test('UTCID08 abnormal: rejects zero', () => {
    // Arrange
    const raw = '0';

    // Act
    const result = parsePriceInput(raw);

    // Assert
    expect(result).toEqual({ error: 'WHOLE_NUMBER' });
  });

  test('UTCID09 abnormal: rejects a negative price', () => {
    // Arrange
    const raw = '-5';

    // Act
    const result = parsePriceInput(raw);

    // Assert
    expect(result).toEqual({ error: 'WHOLE_NUMBER' });
  });

  test('UTCID10 abnormal: rejects fractional separators', () => {
    // Arrange
    const inputs = ['1,5', '12.5'];

    // Act
    const results = inputs.map((raw) => parsePriceInput(raw));

    // Assert
    expect(results).toEqual([{ error: 'WHOLE_NUMBER' }, { error: 'WHOLE_NUMBER' }]);
  });

  test('UTCID11 abnormal: rejects malformed group separators', () => {
    // Arrange
    const inputs = ['1.00', '1.0000', '.500', '1..000'];

    // Act
    const results = inputs.map((raw) => parsePriceInput(raw));

    // Assert
    expect(results).toEqual(Array.from({ length: inputs.length }, () => ({ error: 'WHOLE_NUMBER' })));
  });

  test('UTCID12 abnormal: rejects a leading zero', () => {
    // Arrange
    const raw = '0250';

    // Act
    const result = parsePriceInput(raw);

    // Assert
    expect(result).toEqual({ error: 'WHOLE_NUMBER' });
  });

  test('UTCID13 abnormal: rejects non-string values', () => {
    // Arrange
    const inputs = [undefined, null, 250000];

    // Act
    const results = inputs.map((raw) => parsePriceInput(raw));

    // Assert
    expect(results).toEqual(Array.from({ length: inputs.length }, () => ({ error: 'WHOLE_NUMBER' })));
  });
});
