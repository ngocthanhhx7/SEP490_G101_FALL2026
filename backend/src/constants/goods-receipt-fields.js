// Goods Receipt (R3 UC-70). Codes are PN-0001, PN-0002, ...: at least four digits and no upper limit (PN-9999 is followed by PN-10000).
export const GOODS_RECEIPT_COUNTER_ID = 'GOODS_RECEIPT';
export const GOODS_RECEIPT_CODE_PREFIX = 'PN-';
export const GOODS_RECEIPT_CODE_SHAPE = /^PN-\d{4,}$/u;
// Technical limits (D-216 style), not business rules: the screen's inputs stop at them and the API answers 422.
// `recentCount` is how many receipts the "Phiếu nhập gần đây" column shows; `pickerMax` is how many products one search returns.
export const GOODS_RECEIPT_LIMITS = Object.freeze({
  linesMax: 50,
  quantityMax: 100000,
  rejectReasonMax: 300,
  recentCount: 10,
  pickerMax: 10,
  suppliersMax: 500
});
