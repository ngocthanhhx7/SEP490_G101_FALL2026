import { formatPriceInput } from '../../src/utils/product-format.js';

describe('FE-MONEY-02 formatPriceInput', () => {
  test('UTCID01 normal: keeps the minimum saved VND price as an input string', () => {
    // Arrange
    const amount = 1;

    // Act
    const result = formatPriceInput(amount);

    // Assert
    expect(result).toBe('1');
  });

  test('UTCID02 normal: groups a saved VND price with Vietnamese separators', () => {
    // Arrange
    const amount = 250000;

    // Act
    const result = formatPriceInput(amount);

    // Assert
    expect(result).toBe('250.000');
  });

  test('UTCID03 normal: keeps every digit while grouping a saved VND price', () => {
    // Arrange
    const amount = 1234567;

    // Act
    const result = formatPriceInput(amount);

    // Assert
    expect(result).toBe('1.234.567');
  });

  test('UTCID04 boundary: formats the SRS maximum selling price', () => {
    // Arrange
    const amount = 100000000;

    // Act
    const result = formatPriceInput(amount);

    // Assert
    expect(result).toBe('100.000.000');
  });

  test('UTCID05 abnormal: returns empty text for zero', () => {
    // Arrange
    const amount = 0;

    // Act
    const result = formatPriceInput(amount);

    // Assert
    expect(result).toBe('');
  });

  test('UTCID06 abnormal: returns empty text for a negative integer', () => {
    // Arrange
    const amount = -250000;

    // Act
    const result = formatPriceInput(amount);

    // Assert
    expect(result).toBe('');
  });

  test('UTCID07 abnormal: returns empty text for a fractional VND value', () => {
    // Arrange
    const amount = 1.5;

    // Act
    const result = formatPriceInput(amount);

    // Assert
    expect(result).toBe('');
  });

  test('UTCID08 abnormal: returns empty text for a numeric string', () => {
    // Arrange
    const amount = '250000';

    // Act
    const result = formatPriceInput(amount);

    // Assert
    expect(result).toBe('');
  });

  test('UTCID09 abnormal: returns empty text for null and undefined', () => {
    // Arrange
    const inputs = [null, undefined];

    // Act
    const results = inputs.map((amount) => formatPriceInput(amount));

    // Assert
    expect(results).toEqual(['', '']);
  });

  test('UTCID10 abnormal: returns empty text for NaN and infinity', () => {
    // Arrange
    const inputs = [Number.NaN, Number.POSITIVE_INFINITY];

    // Act
    const results = inputs.map((amount) => formatPriceInput(amount));

    // Assert
    expect(results).toEqual(['', '']);
  });

  test('UTCID11 abnormal: returns empty text for an unsafe integer', () => {
    // Arrange
    const amount = Number.MAX_SAFE_INTEGER + 1;

    // Act
    const result = formatPriceInput(amount);

    // Assert
    expect(result).toBe('');
  });
});
