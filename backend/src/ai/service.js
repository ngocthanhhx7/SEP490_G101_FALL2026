import {
  exact,
  fail,
  id,
  instant,
  number,
  weights,
  digest,
} from './validation.js';
import { calculateQuote } from './pricing.js';
import { scoreSitter } from './scoring.js';
import { planInsertion, requiredPoints, validateSlot } from './scheduling.js';
import { cachedMatrix } from './routing.js';
const common = ['serviceId', 'petIds', 'durationMinutes', 'visitCount'];
function quoteInput(body) {
  exact(body, common, ['serviceId', 'petIds', 'durationMinutes']);
  id(body.serviceId);
  number(body.durationMinutes, 1, 360, true);
  number(body.visitCount ?? 1, 1, 60, true);
  if (
    !Array.isArray(body.petIds) ||
    !body.petIds.length ||
    body.petIds.length > 10 ||
    new Set(body.petIds).size !== body.petIds.length
  )
    fail('VALIDATION_FAILED', 'One to ten unique owned pets required');
  body.petIds.forEach(id);
  return { ...body, visitCount: body.visitCount ?? 1 };
}
export function createAiService({
  repository,
  routingProvider,
  clock = Date.now,
}) {
  async function save(ownerId, kind, input, snapshot, ttl) {
    const [decision] = await repository.models.AiDecision.create([
      {
        ownerId,
        kind,
        requestHash: digest(input),
        expiresAt: new Date(clock() + ttl),
        snapshot,
      },
    ]);
    return {
      id: String(decision._id),
      expiresAt: decision.expiresAt.toISOString(),
    };
  }
  async function quote(ownerId, body) {
    const input = quoteInput(body),
      context = await repository.context(ownerId, input);
    if (
      context.pets.some(
        (p) =>
          p.traits.length &&
          !p.traits.every((t) =>
            context.policy.rules.some((rule) => rule.when?.traitCode === t)
          )
      )
    )
      fail(
        'PRICING_REVIEW_REQUIRED',
        'Special-care trait has no approved price rule',
        409
      );
    const result = calculateQuote({
      baseAmountVnd: context.price.amountVnd,
      priceVersion: context.price.version,
      policy: context.policy,
      pets: context.pets,
      durationMinutes: input.durationMinutes,
      visitCount: input.visitCount,
    });
    const decision = await save(
      ownerId,
      'QUOTE',
      input,
      {
        input,
        result,
        petVersions: context.pets.map((p) => ({
          id: p._id,
          version: p.version,
        })),
        serviceVersion: context.version.version,
      },
      10 * 60000
    );
    return {
      ...result,
      quoteId: decision.id,
      expiresAt: decision.expiresAt,
      explanation:
        'Báo giá dự kiến theo bảng giá đã duyệt; chưa tạo booking, chưa thu tiền. Cần xác nhận lại phiên bản và điều kiện khi đặt lịch.',
    };
  }
  async function recommend(ownerId, body) {
    exact(
      body,
      [
        'serviceId',
        'petIds',
        'addressId',
        'startAt',
        'endAt',
        'limit',
        'clinicAddressId',
        'appointmentAt',
        'waitingMinutes',
        'returnToHome',
      ],
      ['serviceId', 'petIds', 'addressId', 'startAt', 'endAt']
    );
    id(body.addressId);
    const slot = validateSlot(body, clock());
    quoteInput({
      serviceId: body.serviceId,
      petIds: body.petIds,
      durationMinutes: (slot.end - slot.start) / 60000,
    });
    const limit = body.limit ?? 5;
    number(limit, 5, 20, true);
    if (body.clinicAddressId) id(body.clinicAddressId);
    const context = await repository.context(ownerId, body);
    if (context.pets.some((p) => !p.careNeedsConfirmed))
      fail(
        'CARE_INFORMATION_REQUIRED',
        'Confirm pet care information before matching',
        409
      );
    const { policy, model } = await repository.ranking();
    weights(policy.weights);
    let rankingWeights = policy.weights,
      rankingSource = 'EXPLAINABLE_RULES',
      fallbackReason = null;
    if (model) {
      try {
        weights(model.weights);
        const content = {
          version: model.version,
          weights: model.weights,
          trainingRows: model.trainingRows,
          testMae: model.testMae,
          baselineMae: model.baselineMae,
          testGroups: model.testGroups,
          trainedUntil: new Date(model.trainedUntil).toISOString(),
        };
        if (
          digest(content) !== model.sha256 ||
          model.testMae >= model.baselineMae
        )
          throw new Error('Model gate');
        rankingWeights = model.weights;
        rankingSource = 'APPROVED_ADDITIVE_MODEL';
      } catch {
        fallbackReason = 'MODEL_VALIDATION_FAILED';
      }
    }
    const {
      profiles,
      users,
      blocks,
      truncated,
      excludedEligibility,
      statisticsSnapshot,
    } = await repository.candidates(context, slot);
    const exclusions = { ACCOUNT_OR_APPROVAL: excludedEligibility };
    const eligible = [];
    let next = 0;
    const vet = context.service.code === 'vet-escort';
    if (
      vet &&
      (!context.clinic ||
        typeof body.returnToHome !== 'boolean' ||
        body.waitingMinutes === undefined ||
        !body.appointmentAt)
    )
      fail(
        'VET_PLAN_REQUIRED',
        'Confirmed clinic, appointment, waiting budget and return scope required',
        409
      );
    if (
      !vet &&
      [
        'clinicAddressId',
        'appointmentAt',
        'waitingMinutes',
        'returnToHome',
      ].some((key) => body[key] !== undefined)
    )
      fail('VALIDATION_FAILED', 'Vet fields only apply to vet escort');
    let serviceEndPoint;
    if (vet) {
      number(body.waitingMinutes, 15, 240, true);
      const appointment = instant(body.appointmentAt);
      const matrix = await cachedMatrix({
        points: [
          context.address.point.coordinates,
          context.clinic.point.coordinates,
        ],
        Routing: repository.models.AiRoutingMatrix,
        provider: routingProvider,
        clock,
      });
      const outward = matrix(
          context.address.point.coordinates,
          context.clinic.point.coordinates
        ),
        back = body.returnToHome
          ? matrix(
              context.clinic.point.coordinates,
              context.address.point.coordinates
            )
          : 0;
      if (outward === null || back === null)
        fail('ROUTING_UNAVAILABLE', 'Clinic route unavailable', 503);
      if (outward > 45 || back > 45)
        fail(
          'VET_ROUTE_REVIEW_REQUIRED',
          'Clinic route requires Staff review',
          409
        );
      const outwardBudget =
        Math.ceil(outward) + Math.max(10, Math.ceil(outward * 0.2));
      const backBudget = body.returnToHome
        ? Math.ceil(back) + Math.max(10, Math.ceil(back * 0.2))
        : 0;
      if (
        slot.start + (15 + outwardBudget + 10) * 60000 > appointment ||
        appointment + (body.waitingMinutes + 15 + backBudget) * 60000 > slot.end
      )
        fail(
          'VET_TIME_CONFLICT',
          'Slot does not cover clinic appointment and return budget',
          409
        );
      serviceEndPoint = body.returnToHome
        ? context.address.point.coordinates
        : context.clinic.point.coordinates;
    }
    async function worker() {
      while (next < profiles.length) {
        const profile = profiles[next++];
        const reject = (reason) => {
          exclusions[reason] = (exclusions[reason] ?? 0) + 1;
        };
        if (
          context.pets.length > profile.maxPets ||
          context.pets.some(
            (p) =>
              !profile.species.includes(p.species) ||
              p.weightKg > profile.maxWeightKg ||
              p.traits.some((t) => !profile.allowedTraits.includes(t))
          )
        ) {
          reject('PET_CAPABILITY_MISMATCH');
          continue;
        }
        const dayStart = Date.parse(slot.localDate + 'T00:00:00+07:00');
        const ownedBlocks = blocks.filter(
          (b) =>
            String(b.sitterId) === String(profile.userId) &&
            new Date(b.startAt).getTime() < dayStart + 86400000 &&
            new Date(b.endAt).getTime() > dayStart
        );
        if (ownedBlocks.length > 20) {
          reject('SCHEDULE_REVIEW_REQUIRED');
          continue;
        }
        try {
          const matrix = await cachedMatrix({
            points: [
              ...requiredPoints(
                profile,
                ownedBlocks,
                context.address,
                slot.localDate
              ),
              ...(serviceEndPoint ? [serviceEndPoint] : []),
            ],
            Routing: repository.models.AiRoutingMatrix,
            provider: routingProvider,
            clock,
          });
          const plan = await planInsertion({
            profile,
            blocks: ownedBlocks,
            slot,
            address: context.address,
            matrix,
            serviceEndPoint,
          });
          if (!plan.eligible) {
            reject(plan.reason);
            continue;
          }
          const statistics = await repository.statistics(
            profile,
            context,
            statisticsSnapshot
          );
          const score = scoreSitter({
            ...statistics,
            extraTravelMinutes: plan.extraTravelMinutes,
            busyMinutes: plan.busyMinutes,
            weights: rankingWeights,
          });
          if (score.rawScore < 60) {
            reject('BELOW_AUTOMATIC_THRESHOLD');
            continue;
          }
          eligible.push({
            sitterId: String(profile.userId),
            displayName:
              users.find((u) => String(u._id) === String(profile.userId))
                ?.displayName ?? 'Pet Sitter',
            ...score,
            plan: {
              extraTravelMinutes: plan.extraTravelMinutes,
              busyMinutes: plan.busyMinutes,
              hasPreviousVisit: Boolean(plan.beforeVisitId),
              hasNextVisit: Boolean(plan.afterVisitId),
            },
            profileVersion: profile.version,
            statisticsAsOf: statistics.asOf,
          });
        } catch (error) {
          if (
            [
              'ROUTING_UNAVAILABLE',
              'ROUTING_LIMIT',
              'STATISTICS_LIMIT',
              'STATISTICS_INVALID',
            ].includes(error.code)
          ) {
            reject(error.code);
            continue;
          }
          throw error;
        }
      }
    }
    await Promise.all(
      Array.from({ length: Math.min(4, profiles.length) }, () => worker())
    );
    eligible.sort(
      (a, b) =>
        b.rawScore - a.rawScore ||
        a.plan.extraTravelMinutes - b.plan.extraTravelMinutes ||
        a.plan.busyMinutes - b.plan.busyMinutes ||
        a.sitterId.localeCompare(b.sitterId)
    );
    const selected = eligible
      .slice(0, limit)
      .map(({ rawScore: _rawScore, features: _features, ...row }, index) => ({
        ...row,
        rank: index + 1,
      }));
    const status =
      selected.length >= 5
        ? 'READY_FOR_OFFER_SHORTLIST'
        : exclusions.ROUTING_UNAVAILABLE
          ? 'ROUTING_UNAVAILABLE'
          : truncated
            ? 'SEARCH_INCOMPLETE'
            : 'INSUFFICIENT_ELIGIBLE_SITTERS';
    const result = {
      status,
      minimumRequested: 5,
      returned: selected.length,
      shortfall: Math.max(0, 5 - selected.length),
      eligibleInSearch: eligible.length,
      searchTruncated: truncated,
      rankingSource,
      policyVersion: policy.version,
      modelVersion:
        rankingSource === 'APPROVED_ADDITIVE_MODEL' ? model.version : null,
      fallbackReason,
      candidates: selected,
      exclusions,
      routingSource: 'OSRM_STATIC_ROAD_ETA_WITH_BUFFERS',
      warnings: [
        'RECOMMENDATION_IS_NOT_ASSIGNMENT',
        'REVALIDATE_PAYMENT_ELIGIBILITY_AND_OCCUPANCY_AT_OFFER_ACCEPTANCE',
        'STATIC_ETA_DOES_NOT_INCLUDE_LIVE_TRAFFIC',
      ],
    };
    const decision = await save(
      ownerId,
      'MATCH',
      body,
      {
        input: body,
        result,
        petVersions: context.pets.map((p) => ({
          id: p._id,
          version: p.version,
        })),
        addressVersion: context.address.version,
      },
      5 * 60000
    );
    return { ...result, matchId: decision.id, expiresAt: decision.expiresAt };
  }
  async function readDecision(ownerId, decisionId) {
    id(decisionId);
    const record = await repository.models.AiDecision.findOne({
      _id: decisionId,
      ownerId,
      expiresAt: { $gt: new Date(clock()) },
    })
      .select('+snapshot')
      .lean();
    if (!record)
      fail('RESOURCE_NOT_FOUND', 'Decision unavailable or expired', 404);
    return {
      id: String(record._id),
      kind: record.kind,
      expiresAt: record.expiresAt,
      ...record.snapshot.result,
    };
  }
  return { quote, recommend, readDecision };
}
