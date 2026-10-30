import { AppError } from '../utils/app-error.js';
import { hasRole } from '../utils/roles.js';

const ISO_WITH_ZONE = /(?:Z|[+-]\d{2}:\d{2})$/i;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;
const MAX_SLOTS = 20;

function invalid(message = 'Directed sitter proposal is invalid') {
  throw new AppError(422, 'VALIDATION_FAILED', message);
}

function providerUnavailable(message) {
  throw new AppError(503, 'PROPOSAL_UNAVAILABLE', message);
}

function id(value, label) {
  if (typeof value !== 'string' || !IDENTIFIER.test(value.trim()))
    invalid(`${label} is required`);
  return value.trim();
}

function instant(value, label) {
  if (
    typeof value !== 'string' ||
    !ISO_WITH_ZONE.test(value) ||
    !Number.isFinite(Date.parse(value))
  ) {
    invalid(`${label} must include a timezone offset`);
  }
  return new Date(Date.parse(value)).toISOString();
}

function activeCustomer(actor) {
  if (
    !actor ||
    actor.state !== 'ACTIVE' ||
    typeof actor.userId !== 'string' ||
    !actor.userId.trim()
  ) {
    throw new AppError(401, 'UNAUTHENTICATED', 'Authentication required');
  }
  if (!hasRole(actor.roles, 'CUSTOMER'))
    throw new AppError(
      403,
      'FORBIDDEN',
      'Only the Customer can confirm a directed proposal'
    );
  return actor.userId.trim();
}

function key(value) {
  if (typeof value !== 'string' || value.length < 8 || value.length > 128)
    invalid('A valid idempotency key is required');
  return value;
}

function normalizeSlot(slot) {
  if (!slot || typeof slot !== 'object' || Array.isArray(slot))
    invalid('Each proposed slot is invalid');
  const startAt = instant(slot.startAt, 'slot startAt');
  const endAt = instant(slot.endAt, 'slot endAt');
  if (Date.parse(endAt) <= Date.parse(startAt))
    invalid('A proposed slot must have a positive duration');
  return Object.freeze({ startAt, endAt });
}

function normalizeSlots(slots) {
  if (!Array.isArray(slots) || slots.length === 0 || slots.length > MAX_SLOTS)
    invalid('Provide one to twenty proposed slots');
  const seen = new Set();
  const normalized = slots.map(normalizeSlot).filter((slot) => {
    const marker = `${slot.startAt}/${slot.endAt}`;
    if (seen.has(marker)) return false;
    seen.add(marker);
    return true;
  });
  if (!normalized.length) invalid('Provide at least one unique proposed slot');
  return Object.freeze(normalized);
}

function normalizeAvailableSlots(slots) {
  if (!Array.isArray(slots) || slots.length > MAX_SLOTS) {
    throw new AppError(
      503,
      'AVAILABILITY_UNAVAILABLE',
      'Sitter availability is unavailable'
    );
  }
  if (slots.length === 0) return Object.freeze([]);
  const seen = new Set();
  return Object.freeze(
    slots.map(normalizeSlot).filter((slot) => {
      const marker = `${slot.startAt}/${slot.endAt}`;
      if (seen.has(marker)) return false;
      seen.add(marker);
      return true;
    })
  );
}

function safePriceSnapshot(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const amountVnd = value.amountVnd ?? value.amount;
  return Object.freeze({
    amountVnd:
      Number.isSafeInteger(amountVnd) && amountVnd >= 0 ? amountVnd : null,
    currency: typeof value.currency === 'string' ? value.currency : 'VND',
    serviceName:
      typeof value.serviceName === 'string' ? value.serviceName : null
  });
}

function safePetSnapshots(values) {
  if (!Array.isArray(values)) return Object.freeze([]);
  return Object.freeze(
    values
      .filter(
        (item) => item && typeof item === 'object' && !Array.isArray(item)
      )
      .map((item) =>
        Object.freeze({
          id: typeof item.id === 'string' ? item.id : null,
          name: typeof item.name === 'string' ? item.name : null,
          species: typeof item.species === 'string' ? item.species : null,
          breed: typeof item.breed === 'string' ? item.breed : null
        })
      )
  );
}

function proposalView(proposal) {
  if (!proposal || typeof proposal !== 'object') {
    throw new AppError(
      503,
      'PROPOSAL_UNAVAILABLE',
      'Directed proposal could not be confirmed'
    );
  }
  const view = {
    id: proposal.id ?? proposal.proposalId,
    bookingId: proposal.bookingId ?? null,
    visitId: proposal.visitId,
    sitterId: proposal.sitterId,
    customerId: proposal.customerId,
    state: proposal.state,
    slots: Array.isArray(proposal.slots)
      ? proposal.slots.map(normalizeSlot)
      : [],
    availabilityVersion: proposal.availabilityVersion ?? null,
    selectedSlot: proposal.selectedSlot
      ? normalizeSlot(proposal.selectedSlot)
      : null,
    version: proposal.version,
    expiresAt: proposal.expiresAt ?? null,
    priceSnapshot: safePriceSnapshot(proposal.priceSnapshot),
    ...(proposal.petSnapshots?.length ? { petSnapshots: safePetSnapshots(proposal.petSnapshots) } : {}),
    paymentState: proposal.paymentState ?? null,
    paymentRequired: proposal.paymentRequired === true
  };
  if (
    typeof view.id !== 'string' ||
    typeof view.visitId !== 'string' ||
    typeof view.sitterId !== 'string' ||
    typeof view.customerId !== 'string' ||
    !view.state ||
    view.slots.length === 0 ||
    !Number.isSafeInteger(view.version) ||
    view.version < 0
  ) {
    throw new AppError(
      503,
      'PROPOSAL_UNAVAILABLE',
      'Directed proposal could not be confirmed'
    );
  }
  return Object.freeze(view);
}

function offerView(offer) {
  if (!offer || typeof offer !== 'object') {
    throw new AppError(
      503,
      'OFFER_UNAVAILABLE',
      'Directed offer could not be created'
    );
  }
  const view = {
    id: offer.id ?? offer.offerId,
    visitId: offer.visitId,
    sitterId: offer.sitterId,
    state: offer.state,
    deadline: offer.deadline ?? null,
    dispatchSequence: offer.dispatchSequence
  };
  if (
    typeof view.id !== 'string' ||
    typeof view.visitId !== 'string' ||
    typeof view.sitterId !== 'string' ||
    typeof view.state !== 'string' ||
    !Number.isSafeInteger(view.dispatchSequence) ||
    view.dispatchSequence < 0
  ) {
    throw new AppError(
      503,
      'OFFER_UNAVAILABLE',
      'Directed offer could not be created'
    );
  }
  return Object.freeze(view);
}

function assertAvailabilityResult(result) {
  if (
    !result ||
    typeof result !== 'object' ||
    !Array.isArray(result.slots) ||
    !Number.isSafeInteger(result.availabilityVersion) ||
    result.availabilityVersion < 0
  ) {
    throw new AppError(
      503,
      'AVAILABILITY_UNAVAILABLE',
      'Sitter availability is unavailable'
    );
  }
  const slots = normalizeAvailableSlots(result.slots);
  return Object.freeze({
    slots,
    availabilityVersion: result.availabilityVersion
  });
}

/**
 * Directed dispatch deliberately has a proposal and confirmation boundary.
 * `createPending` must only persist a proposal; `confirmAndCreateOffer` is an
 * atomic repository command that rechecks availability and creates the Offer
 * after (and only after) Customer confirmation.
 */
export function createDirectedSitterProposalService({
  availabilityRepository,
  proposalRepository,
  bookingRepository,
  clock = Date.now
} = {}) {
  if (
    typeof availabilityRepository?.findAvailableSlots !== 'function' ||
    typeof proposalRepository?.findByIdempotency !== 'function' ||
    typeof proposalRepository?.createPending !== 'function' ||
    typeof proposalRepository?.findOwned !== 'function' ||
    typeof proposalRepository?.confirmAndCreateOffer !== 'function'
  ) {
    throw new TypeError('Directed proposal repository ports are required');
  }
  if (typeof clock !== 'function')
    throw new TypeError('A clock function is required');

  // A process-local lock prevents two confirmation requests from both passing
  // the read-before-write checks. The repository command remains the source of
  // truth and must still perform its own atomic compare-and-set.
  const proposalLocks = new Map();
  async function withProposalLock(proposalId, work) {
    const previous = proposalLocks.get(proposalId) || Promise.resolve();
    let release;
    const current = new Promise((resolve) => {
      release = resolve;
    });
    proposalLocks.set(proposalId, current);
    await previous;
    try {
      return await work();
    } finally {
      release();
      if (proposalLocks.get(proposalId) === current)
        proposalLocks.delete(proposalId);
    }
  }

  async function createProposal({
    actor,
    bookingId,
    visitId,
    sitterId,
    slots,
    idempotencyKey,
    paymentState,
    paymentRequired,
    priceSnapshot,
    petSnapshots
  } = {}) {
    const customerId = activeCustomer(actor);
    const booking =
      bookingId === undefined || bookingId === null
        ? null
        : id(bookingId, 'bookingId');
    const visit = id(visitId, 'visitId');
    const sitter = id(sitterId, 'sitterId');
    const requestedSlots = normalizeSlots(slots);
    const operationKey = key(idempotencyKey);
    if (typeof bookingRepository?.getDirectedContext === 'function') {
      let context;
      try {
        context = await bookingRepository.getDirectedContext({
          customerId,
          bookingId: booking,
          visitId: visit,
          sitterId: sitter
        });
      } catch (error) {
        if (error instanceof AppError) throw error;
        throw new AppError(
          503,
          'PROPOSAL_UNAVAILABLE',
          'Booking context is unavailable'
        );
      }
      if (!context)
        throw new AppError(
          404,
          'RESOURCE_NOT_FOUND',
          'Booking or visit not found'
        );
      if (
        context.directed === false ||
        (context.sitterId && context.sitterId !== sitter)
      ) {
        throw new AppError(
          409,
          'DIRECTED_PROPOSAL_NOT_ALLOWED',
          'This visit does not allow a directed sitter'
        );
      }
      paymentState = context.paymentState ?? paymentState;
      paymentRequired = context.paymentRequired === true;
      priceSnapshot = context.priceSnapshot ?? priceSnapshot;
      petSnapshots = context.petSnapshots ?? petSnapshots;
    }
    let existing;
    try {
      existing = await proposalRepository.findByIdempotency({
        customerId,
        bookingId: booking,
        visitId: visit,
        sitterId: sitter,
        idempotencyKey: operationKey
      });
    } catch (error) {
      if (error instanceof AppError) throw error;
      providerUnavailable('Directed proposal is unavailable');
    }
    if (existing) return proposalView(existing);

    let availabilityResult;
    try {
      availabilityResult = await availabilityRepository.findAvailableSlots({
        sitterId: sitter,
        visitId: visit,
        slots: requestedSlots
      });
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(
        503,
        'AVAILABILITY_UNAVAILABLE',
        'Sitter availability is unavailable'
      );
    }
    const availability = assertAvailabilityResult(availabilityResult);
    const allowed = new Set(
      availability.slots.map((slot) => `${slot.startAt}/${slot.endAt}`)
    );
    const proposed = requestedSlots.filter((slot) =>
      allowed.has(`${slot.startAt}/${slot.endAt}`)
    );
    if (!proposed.length) {
      throw new AppError(
        409,
        'NO_AVAILABLE_SLOT',
        'The selected Sitter has no matching available slot'
      );
    }
    let saved;
    try {
      saved = await proposalRepository.createPending({
        customerId,
        bookingId: booking,
        visitId: visit,
        sitterId: sitter,
        slots: proposed,
        availabilityVersion: availability.availabilityVersion,
        idempotencyKey: operationKey,
        paymentState: paymentState ?? null,
        paymentRequired: paymentRequired === true,
        priceSnapshot: safePriceSnapshot(priceSnapshot),
        petSnapshots: safePetSnapshots(petSnapshots)
      });
    } catch (error) {
      if (error instanceof AppError) throw error;
      providerUnavailable('Directed proposal could not be saved');
    }
    return proposalView(saved);
  }

  async function previewProposal({
    actor,
    bookingId,
    visitId,
    sitterId,
    slots
  } = {}) {
    const customerId = activeCustomer(actor);
    const booking =
      bookingId === undefined || bookingId === null
        ? null
        : id(bookingId, 'bookingId');
    const visit = id(visitId, 'visitId');
    const sitter = id(sitterId, 'sitterId');
    let context = null;
    if (typeof bookingRepository?.getDirectedContext === 'function') {
      try {
        context = await bookingRepository.getDirectedContext({
          customerId,
          bookingId: booking,
          visitId: visit,
          sitterId: sitter
        });
      } catch (error) {
        if (error instanceof AppError) throw error;
        throw new AppError(
          503,
          'PROPOSAL_UNAVAILABLE',
          'Booking context is unavailable'
        );
      }
      if (!context)
        throw new AppError(
          404,
          'RESOURCE_NOT_FOUND',
          'Booking or visit not found'
        );
      if (
        context.directed === false ||
        (context.sitterId && context.sitterId !== sitter)
      ) {
        throw new AppError(
          409,
          'DIRECTED_PROPOSAL_NOT_ALLOWED',
          'This visit does not allow a directed sitter'
        );
      }
    }
    const requested = slots === undefined ? [] : normalizeSlots(slots);
    let result;
    try {
      result = await availabilityRepository.findAvailableSlots({
        sitterId: sitter,
        visitId: visit,
        slots: requested
      });
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(
        503,
        'AVAILABILITY_UNAVAILABLE',
        'Sitter availability is unavailable'
      );
    }
    const availability = assertAvailabilityResult(result);
    const allowed =
      requested.length === 0
        ? availability.slots
        : availability.slots.filter((item) =>
            requested.some(
              (slotValue) =>
                slotValue.startAt === item.startAt &&
                slotValue.endAt === item.endAt
            )
          );
    return Object.freeze({
      bookingId: booking,
      visitId: visit,
      sitterId: sitter,
      slots: Object.freeze(allowed),
      availabilityVersion: availability.availabilityVersion,
      priceSnapshot: safePriceSnapshot(context?.priceSnapshot),
      paymentState: context?.paymentState ?? null,
      paymentRequired: context?.paymentRequired === true
    });
  }

  async function confirmProposal({
    actor,
    proposalId,
    expectedVersion,
    selectedSlot,
    idempotencyKey
  } = {}) {
    const customerId = activeCustomer(actor);
    const proposal = id(proposalId, 'proposalId');
    if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 0)
      invalid('A valid proposal version is required');
    const operationKey = key(idempotencyKey);
    const slot = normalizeSlot(selectedSlot);
    return withProposalLock(proposal, async () => {
      // A replay must return the original command result. Requiring this port
      // is intentionally optional for compatibility with older repositories;
      // new stores should persist the idempotency result atomically.
      if (
        typeof proposalRepository.findConfirmationByIdempotency === 'function'
      ) {
        let replay;
        try {
          replay = await proposalRepository.findConfirmationByIdempotency({
            customerId,
            proposalId: proposal,
            idempotencyKey: operationKey,
            expectedVersion,
            selectedSlot: slot
          });
        } catch (error) {
          if (error instanceof AppError) throw error;
          throw new AppError(
            503,
            'OFFER_UNAVAILABLE',
            'Directed offer could not be created'
          );
        }
        if (replay) {
          if (!replay.proposal || !replay.offer) {
            throw new AppError(
              503,
              'OFFER_UNAVAILABLE',
              'Directed offer could not be created'
            );
          }
          return Object.freeze({
            proposal: proposalView(replay.proposal),
            offer: offerView(replay.offer)
          });
        }
      }

      let stored;
      try {
        stored = await proposalRepository.findOwned({
          customerId,
          proposalId: proposal
        });
      } catch (error) {
        if (error instanceof AppError) throw error;
        providerUnavailable('Directed proposal is unavailable');
      }
      if (!stored)
        throw new AppError(404, 'RESOURCE_NOT_FOUND', 'Proposal not found');
      const current = proposalView(stored);
      if (current.customerId !== customerId)
        throw new AppError(404, 'RESOURCE_NOT_FOUND', 'Proposal not found');
      if (current.expiresAt && Date.parse(current.expiresAt) <= clock()) {
        throw new AppError(
          409,
          'PROPOSAL_EXPIRED',
          'The proposal has expired; request a new schedule'
        );
      }
      if (
        current.paymentRequired &&
        !['PAID', 'VERIFIED'].includes(current.paymentState)
      ) {
        throw new AppError(
          409,
          'PAYMENT_REQUIRED',
          'Payment must be verified before the sitter offer is sent'
        );
      }
      if (current.state !== 'PENDING_CUSTOMER_CONFIRMATION') {
        // Some repositories persist the last idempotency key on the proposal
        // while upgrading. Treat that record as a safe replay as well.
        if (
          stored.confirmationIdempotencyKey === operationKey &&
          stored.confirmationResult
        ) {
          return Object.freeze({
            proposal: proposalView(stored.confirmationResult.proposal),
            offer: offerView(stored.confirmationResult.offer)
          });
        }
        throw new AppError(
          409,
          'PROPOSAL_NOT_CONFIRMABLE',
          'The proposal is no longer awaiting Customer confirmation'
        );
      }
      if (current.version !== expectedVersion)
        throw new AppError(
          409,
          'VERSION_CONFLICT',
          'Proposal changed; reload before confirming'
        );
      if (
        !current.slots.some(
          (item) => item.startAt === slot.startAt && item.endAt === slot.endAt
        )
      ) {
        throw new AppError(
          409,
          'SLOT_NOT_PROPOSED',
          'Choose one of the proposed available slots'
        );
      }
      let result;
      try {
        result = await proposalRepository.confirmAndCreateOffer({
          customerId,
          proposalId: proposal,
          expectedVersion,
          selectedSlot: slot,
          idempotencyKey: operationKey,
          availabilityVersion: current.availabilityVersion,
          authEpoch: actor.authEpoch
        });
      } catch (error) {
        if (error instanceof AppError) throw error;
        throw new AppError(
          503,
          'OFFER_UNAVAILABLE',
          'Directed offer could not be created'
        );
      }
      if (!result || !result.proposal || !result.offer) {
        throw new AppError(
          409,
          'PROPOSAL_NOT_CONFIRMABLE',
          'The proposal is no longer available'
        );
      }
      return Object.freeze({
        proposal: proposalView(result.proposal),
        offer: offerView(result.offer)
      });
    });
  }

  async function getProposal({ actor, proposalId } = {}) {
    const customerId = activeCustomer(actor);
    const proposal = id(proposalId, 'proposalId');
    if (typeof proposalRepository.findOwned !== 'function')
      providerUnavailable('Directed proposal is unavailable');
    let stored;
    try {
      stored = await proposalRepository.findOwned({
        customerId,
        proposalId: proposal
      });
    } catch (error) {
      if (error instanceof AppError) throw error;
      providerUnavailable('Directed proposal is unavailable');
    }
    if (!stored)
      throw new AppError(404, 'RESOURCE_NOT_FOUND', 'Proposal not found');
    const view = proposalView(stored);
    if (
      view.expiresAt &&
      Date.parse(view.expiresAt) <= clock() &&
      view.state === 'PENDING_CUSTOMER_CONFIRMATION'
    ) {
      return Object.freeze({ ...view, state: 'EXPIRED' });
    }
    return view;
  }

  return Object.freeze({
    createProposal,
    previewProposal,
    confirmProposal,
    getProposal
  });
}

// P42 keeps the domain service discoverable under the booking-proposals scope
// while preserving the original P21 export used by existing integrations.
export const createDirectedBookingProposalService =
  createDirectedSitterProposalService;
