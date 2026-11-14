// Shop grooming booking (UC-58, GBR-40, GBR-42). Slot rules are decisions of 2026-11-14.
export const GROOMING_SLOT_MINUTES = 60;
export const GROOMING_WINDOW_DAYS = 7;
export const GROOMING_MIN_LEAD_MINUTES = 60;
export const GROOMING_MAX_PETS = 10;
export const GROOMING_MAX_SERVICES_PER_PET = 10;
export const GROOMING_UTC_OFFSET_MINUTES = 7 * 60;
export const GROOMING_CATEGORIES = Object.freeze(['Vệ sinh', 'Làm đẹp']);
export const GROOMING_DEFAULT_REFUSAL_LIMIT = 2;

export const GROOMING_APPOINTMENT_STATUSES = Object.freeze(['BOOKED', 'CHECKED_IN', 'HANDED_BACK_PAID', 'NO_SHOW', 'CLOSED_NO_CHARGE']);
export const GROOMING_PET_STATUSES = Object.freeze(['BOOKED', 'CHECKED_IN', 'IN_PROGRESS', 'READY', 'STOPPED', 'CANCELLED_NO_CHARGE']);
export const GROOMING_DISCOUNT_BLOCK_REASONS = Object.freeze(['OVERDUE', 'PREPAID_ONLY', 'POLICY_UNAPPROVED']);

export const GROOMING_BITE_ANSWERS = Object.freeze(['NO', 'SOMETIMES', 'YES']);
export const GROOMING_SKIN_ANSWERS = Object.freeze(['NO', 'YES']);
// A pet that bites or scratches when held cannot be booked online (GBR-40, MSG63).
export const GROOMING_BLOCKING_BITE_ANSWER = 'YES';

export const GROOMING_QUESTIONS = Object.freeze([
  Object.freeze({ code: 'biteOrScratch', text: 'Có cắn hoặc cào khi bị giữ không?',
    answers: Object.freeze([['NO', 'Không'], ['SOMETIMES', 'Đôi khi'], ['YES', 'Có']]), blocking: Object.freeze(['YES']) }),
  Object.freeze({ code: 'skinCondition', text: 'Có bệnh da hoặc vết thương không?',
    answers: Object.freeze([['NO', 'Không'], ['YES', 'Có']]), blocking: Object.freeze([]) })
]);

// Booking (GBR-40): the appointment code, and which existing appointments keep a pet busy (Q6).
export const GROOMING_CODE_PREFIX = 'GR-';
export const GROOMING_CODE_COUNTER_ID = 'appointment-code';
export const GROOMING_BLOCKING_APPOINTMENT_STATUSES = Object.freeze(['BOOKED', 'CHECKED_IN']);
export const GROOMING_RELEASED_PET_STATUS = 'CANCELLED_NO_CHARGE';
export const GROOMING_IDEMPOTENCY_KEY = /^[\x21-\x7e]{8,200}$/u;
