import { fail } from './pet-care.validator.js';

// Reasons of the Staff Needs action list (R3 10.1.1). Only reasons with a data source are listed.
export const NEEDS_ACTION_REASONS = Object.freeze(['NO_SITTER_TO_OFFER', 'NO_SITTER_24H', 'NOT_CHECKED_IN_30M', 'WITHDRAWAL_UNDER_12H', 'NOT_CHECKED_OUT_2H']);
export const VISIT_BOARD_TABS = Object.freeze(['needs-action', 'all']);
export const SEARCH_MIN_LENGTH = 2;
export const SEARCH_MAX_LENGTH = 50;

const KNOWN = new Set(['tab', 'search', 'areaCode', 'reason', 'cursor']);

// Query of GET /visit-board. Unknown keys and repeated keys are refused so a typo never turns a filter off silently.
export function visitBoardQuery(query = {}) {
  for (const [key, value] of Object.entries(query)) {
    if (!KNOWN.has(key) || typeof value !== 'string') fail('VALIDATION_FAILED', `Unsupported query parameter ${key}`);
  }
  const tab = query.tab ?? 'needs-action';
  if (!VISIT_BOARD_TABS.includes(tab)) fail('VALIDATION_FAILED', 'Unsupported tab');
  let search;
  if (query.search !== undefined) {
    search = query.search.normalize('NFC').trim().replace(/\s+/gu, ' ');
    if (search.length < SEARCH_MIN_LENGTH || search.length > SEARCH_MAX_LENGTH) fail('VALIDATION_FAILED', 'Search must be 2 to 50 characters');
  }
  if (query.areaCode !== undefined && !/^[A-Z0-9_]{1,64}$/u.test(query.areaCode)) fail('VALIDATION_FAILED', 'Invalid service area');
  if (query.reason !== undefined && !NEEDS_ACTION_REASONS.includes(query.reason)) fail('VALIDATION_FAILED', 'Unsupported reason');
  if (query.cursor !== undefined && (tab !== 'all' || query.cursor.length > 512)) fail('VALIDATION_FAILED', 'Invalid cursor');
  return { tab, ...(search ? { search } : {}), ...(query.areaCode ? { areaCode: query.areaCode } : {}),
    ...(query.reason ? { reason: query.reason } : {}), ...(query.cursor ? { cursor: query.cursor } : {}) };
}

// Query of GET /visits/:id/contact: whose phone number to show.
export function visitContactQuery(query = {}) {
  const keys = Object.keys(query);
  if (keys.length !== 1 || keys[0] !== 'party' || !['sitter', 'customer'].includes(query.party)) fail('VALIDATION_FAILED', 'party must be sitter or customer');
  return { party: query.party };
}
