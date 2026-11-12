const formatter = new Intl.NumberFormat('vi-VN');
export const formatStockQuantity = value => formatter.format(value);
export const formatStockDelta = value => `${value >= 0 ? '+' : ''}${formatStockQuantity(value)}`;
