import { AppError } from '../utils/app-error.js';
import {
  FAULTY_CLAIM_DECISIONS,
  FAULTY_CLAIM_LIMITS,
  FAULTY_CLAIM_PROBLEM_TYPES,
  FAULTY_CLAIM_TABS
} from '../constants/faulty-product-claim-fields.js';
import { parsePageQuery, PAGE_QUERY_KEYS } from './pagination.validator.js';

const OBJECT_ID = /^[a-f0-9]{24}$/i;
const IMAGE_ID = /^[a-f0-9]{64}$/;
const IDEMPOTENCY_KEY = /^[A-Za-z0-9_:-]{8,128}$/;
const CONTROL_CHARS = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/u;

function invalid(message = 'Faulty product claim input is invalid', fieldErrors) {
  throw new AppError(422, 'VALIDATION_FAILED', message, fieldErrors ? { fieldErrors } : undefined);
}

function only(obj, keys) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) invalid();
  if (Object.keys(obj).some(key => !keys.includes(key))) invalid('Unsupported fields');
}

function cleanText(value, field, max, required = false) {
  if (value === undefined || value === null) {
    if (required) invalid(`${field} is required`, { [field]: 'Vui lòng nhập thông tin này.' });
    return '';
  }
  if (typeof value !== 'string' || CONTROL_CHARS.test(value)) {
    invalid(`${field} is invalid`, { [field]: 'Nội dung không hợp lệ.' });
  }
  const trimmed = value.trim();
  if (required && !trimmed) invalid(`${field} is required`, { [field]: 'Vui lòng nhập thông tin này.' });
  if (trimmed.length > max) invalid(`${field} is too long`, { [field]: `Tối đa ${max} ký tự.` });
  return trimmed;
}

export function parseClaimObjectId(value, field = 'id') {
  if (typeof value !== 'string' || !OBJECT_ID.test(value)) invalid(`${field} is invalid`);
  return value.toLowerCase();
}

export function parseClaimPhotoId(value) {
  if (typeof value !== 'string' || !IMAGE_ID.test(value)) invalid('photoId is invalid');
  return value;
}

export function parseClaimIdempotencyKey(value) {
  if (typeof value !== 'string' || !IDEMPOTENCY_KEY.test(value)) invalid('Idempotency key is required');
  return value;
}

export function parseSubmitFaultyClaim(body) {
  only(body, ['productId', 'quantity', 'problemType', 'description', 'photoIds']);
  const productId = parseClaimObjectId(body.productId, 'productId');
  const quantity = body.quantity;
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 99) {
    invalid('quantity is invalid', { quantity: 'Số lượng không hợp lệ.' });
  }
  if (typeof body.problemType !== 'string' || !FAULTY_CLAIM_PROBLEM_TYPES.includes(body.problemType)) {
    invalid('problemType is invalid', { problemType: 'Vui lòng chọn vấn đề hợp lệ.' });
  }
  const description = cleanText(body.description, 'description', FAULTY_CLAIM_LIMITS.descriptionMax, false);
  if (
    !Array.isArray(body.photoIds)
    || body.photoIds.length < FAULTY_CLAIM_LIMITS.minPhotos
    || body.photoIds.length > FAULTY_CLAIM_LIMITS.maxPhotos
  ) {
    invalid('At least one photo is required', { photoIds: 'Vui lòng tải lên ít nhất một ảnh.' });
  }
  const photoIds = [...new Set(body.photoIds.map(parseClaimPhotoId))];
  if (photoIds.length !== body.photoIds.length) {
    invalid('Duplicate photoIds are not allowed', { photoIds: 'Không chọn trùng ảnh.' });
  }
  return { productId, quantity, problemType: body.problemType, description, photoIds };
}

export function parseClaimListQuery(query = {}) {
  only(query, [...PAGE_QUERY_KEYS, 'tab']);
  const tab = query.tab ?? 'WAITING_CHECK';
  if (typeof tab !== 'string' || !FAULTY_CLAIM_TABS.includes(tab)) invalid('tab is invalid');
  return { ...parsePageQuery(query), tab };
}

export function parseInspectClaim(body) {
  only(body, ['expectedVersion', 'inspectionResult']);
  if (body.expectedVersion !== undefined && (!Number.isSafeInteger(body.expectedVersion) || body.expectedVersion < 0)) {
    invalid('expectedVersion is invalid');
  }
  if (typeof body.inspectionResult !== 'string' || CONTROL_CHARS.test(body.inspectionResult)) {
    throw new AppError(422, 'INSPECTION_RESULT_REQUIRED', 'Please write what you found', {
      fieldErrors: { inspectionResult: 'Vui lòng ghi kết quả kiểm tra.' }
    });
  }
  const inspectionResult = body.inspectionResult.trim();
  if (!inspectionResult) {
    throw new AppError(422, 'INSPECTION_RESULT_REQUIRED', 'Please write what you found', {
      fieldErrors: { inspectionResult: 'Vui lòng ghi kết quả kiểm tra.' }
    });
  }
  if (inspectionResult.length > FAULTY_CLAIM_LIMITS.inspectionMax) {
    invalid('inspectionResult is too long');
  }
  return { expectedVersion: body.expectedVersion, inspectionResult };
}

export function parseDecideClaim(body) {
  only(body, ['expectedVersion', 'decision', 'note']);
  if (body.expectedVersion !== undefined && (!Number.isSafeInteger(body.expectedVersion) || body.expectedVersion < 0)) {
    invalid('expectedVersion is invalid');
  }
  if (typeof body.decision !== 'string' || !FAULTY_CLAIM_DECISIONS.includes(body.decision)) {
    invalid('decision is invalid');
  }
  const note = cleanText(body.note, 'note', FAULTY_CLAIM_LIMITS.decisionNoteMax, false);
  return { expectedVersion: body.expectedVersion, decision: body.decision, note };
}

export function parseExchangeSent(body = {}) {
  if (body === undefined || body === null) return { expectedVersion: undefined };
  only(body, ['expectedVersion']);
  if (body.expectedVersion !== undefined && (!Number.isSafeInteger(body.expectedVersion) || body.expectedVersion < 0)) {
    invalid('expectedVersion is invalid');
  }
  return { expectedVersion: body.expectedVersion };
}
