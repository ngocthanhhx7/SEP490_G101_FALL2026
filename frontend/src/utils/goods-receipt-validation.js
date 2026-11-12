import { GOODS_RECEIPT_FORM_LIMITS } from '../constants/goods-receipt.js';

const WHOLE = /^\d+$/u;

// What was typed in a quantity box: whole digits, or nothing. Returns `{ value }` or `{ error }`.
// The quantity received is MSG113 when it is not a whole number above 0; above the limit has its own text.
export function parseReceivedInput(raw) {
  const typed = typeof raw === 'string' ? raw.trim() : '';
  if (!WHOLE.test(typed)) return { error: 'INVALID' };
  const value = Number(typed);
  if (value < 1) return { error: 'INVALID' };
  return value > GOODS_RECEIPT_FORM_LIMITS.quantityMax ? { error: 'TOO_LARGE' } : { value };
}

// The quantity taken into the shop is MSG119 when it is not a whole number from 0 to the quantity received; an empty box is wrong too.
export function parseAcceptedInput(raw, received) {
  const typed = typeof raw === 'string' ? raw.trim() : '';
  if (!WHOLE.test(typed)) return { error: 'INVALID' };
  const value = Number(typed);
  if (value > GOODS_RECEIPT_FORM_LIMITS.quantityMax || (received !== undefined && value > received)) return { error: 'INVALID' };
  return { value };
}

// How much of a line is rejected, or undefined while either number is not valid yet.
export function rejectedOf(line) {
  const received = parseReceivedInput(line.received).value;
  const accepted = received === undefined ? undefined : parseAcceptedInput(line.accepted, received).value;
  return received === undefined || accepted === undefined ? undefined : received - accepted;
}

// The form before it is sent: the supplier, at least one line, and each line (MSG113, MSG119, MSG120). Same shape the API answers
// with: `{ fields: { supplierId }, lineFields: { 0: { quantityReceived } } }`; both are empty when the form is fine.
export function validateReceiptForm({ supplierId, lines }) {
  const fields = {};
  const lineFields = {};
  if (!supplierId) fields.supplierId = 'REQUIRED';
  if (lines.length === 0) fields.lines = 'REQUIRED';
  if (lines.length > GOODS_RECEIPT_FORM_LIMITS.linesMax) fields.lines = 'TOO_MANY';
  lines.forEach((line, index) => {
    const found = {};
    const received = parseReceivedInput(line.received);
    if (received.error) found.quantityReceived = received.error;
    const accepted = parseAcceptedInput(line.accepted, received.value);
    if (accepted.error) found.quantityAccepted = accepted.error;
    if (received.value !== undefined && accepted.value !== undefined && received.value > accepted.value && !String(line.reason ?? '').trim()) {
      found.rejectReason = 'REQUIRED';
    }
    if (Object.keys(found).length) lineFields[index] = found;
  });
  return { fields, lineFields };
}
