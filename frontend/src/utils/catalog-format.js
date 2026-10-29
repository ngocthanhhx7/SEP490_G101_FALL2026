const nonEmptyString = (value) =>
  typeof value === 'string' && value.trim().length > 0;
export function formatCatalogPrice(price) {
  if (
    !price ||
    !Number.isSafeInteger(price.amountVnd) ||
    price.amountVnd < 0 ||
    price.currency !== 'VND' ||
    !nonEmptyString(price.unitLabel)
  )
    return null;

  const amount = new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0
  }).format(price.amountVnd);

  return amount + ' / ' + price.unitLabel.trim();
}

export function formatPolicyDate(value) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return null;
  return new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium' }).format(
    timestamp
  );
}
