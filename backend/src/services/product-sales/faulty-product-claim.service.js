import { createHash } from 'node:crypto';
import { Types } from 'mongoose';
import { productSalesModels } from '../../models/product.model.js';
import { userModel } from '../../models/user.model.js';
import { systemSettingVersionModel } from '../../models/system-setting-version.model.js';
import { PRODUCT_PERMISSIONS } from '../../constants/product-permissions.js';
import { COUNTER_CHANNEL } from '../../constants/counter-sale-fields.js';
import {
  DEFAULT_FAULTY_PRODUCT_REPORT_DAYS,
  FAULTY_CLAIM_CODE_PREFIX,
  FAULTY_CLAIM_COUNTER_ID,
  FAULTY_CLAIM_LIMITS,
  FAULTY_CLAIM_TAB_STATUSES
} from '../../constants/faulty-product-claim-fields.js';
import {
  parseClaimIdempotencyKey,
  parseClaimListQuery,
  parseClaimObjectId,
  parseClaimPhotoId,
  parseDecideClaim,
  parseExchangeSent,
  parseInspectClaim,
  parseSubmitFaultyClaim
} from '../../validators/faulty-product-claim.validator.js';
import { AppError } from '../../utils/app-error.js';
import { hasRole } from '../../utils/roles.js';
import { createUnitOfWork } from '../unit-of-work.service.js';
import { createDomainNotifications } from '../notifications/domain-notifications.service.js';
import { sellableQuantity } from './product-order-pricing.js';
import { productSalesErrors, requireCustomer } from './product-sales-errors.js';

const DAY_MS = 86_400_000;
const ELIGIBLE_ORDER_STATUSES = new Set(['DELIVERED', 'PICKED_UP']);
const oid = value => new Types.ObjectId(value);

function formatVietnamDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'Asia/Ho_Chi_Minh'
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map(({ type, value: val }) => [type, val]));
  return `${map.day}/${map.month}/${map.year}`;
}

function requireClaimHandler(actor) {
  if (actor?.state !== 'ACTIVE' || !Array.isArray(actor.roles) || typeof actor.userId !== 'string' || !/^[a-f\d]{24}$/iu.test(actor.userId)) {
    throw productSalesErrors.unauthenticated();
  }
  if (!PRODUCT_PERMISSIONS.HANDLE_FAULTY_CLAIMS.some(role => hasRole(actor.roles, role))) {
    throw productSalesErrors.forbidden();
  }
  return actor.userId;
}

function requireClaimDecider(actor) {
  if (actor?.state !== 'ACTIVE' || !Array.isArray(actor.roles) || typeof actor.userId !== 'string' || !/^[a-f\d]{24}$/iu.test(actor.userId)) {
    throw productSalesErrors.unauthenticated();
  }
  if (!PRODUCT_PERMISSIONS.DECIDE_FAULTY_CLAIMS.some(role => hasRole(actor.roles, role))) {
    throw productSalesErrors.forbidden();
  }
  return actor.userId;
}

export function createFaultyProductClaimService({ connection, phones, readImage = null, clock = Date.now }) {
  const { Product, ProductOrder, ProductCounter, FaultyProductClaim } = productSalesModels(connection);
  const getUser = () => userModel(connection);
  const getSettingVersion = () => systemSettingVersionModel(connection);
  const unitOfWork = createUnitOfWork(connection);
  let notifications = null;
  const getNotifications = () => (notifications ??= createDomainNotifications({ connection, clock }));
  const col = name => connection.db.collection(name);

  async function currentReportDays(at, session = null) {
    const query = getSettingVersion().findOne({ key: 'FAULTY_PRODUCT_REPORT_DAYS', effectiveAt: { $lte: at } })
      .sort({ effectiveAt: -1, version: -1 });
    if (session) query.session(session);
    const record = await query.lean();
    return Number.isSafeInteger(record?.valueDays) && record.valueDays >= 1
      ? record.valueDays
      : DEFAULT_FAULTY_PRODUCT_REPORT_DAYS;
  }

  function orderCompletionDate(order) {
    return order.deliveredAt ?? order.updatedAt ?? order.createdAt;
  }

  async function nextClaimNumber(session) {
    const [last] = await FaultyProductClaim.find().sort({ number: -1 }).limit(1).session(session).lean();
    const counter = await ProductCounter.findOneAndUpdate(
      { _id: FAULTY_CLAIM_COUNTER_ID },
      [{ $set: { value: { $add: [{ $max: [{ $ifNull: ['$value', 0] }, last?.number ?? 0] }, 1] } } }],
      { upsert: true, returnDocument: 'after', updatePipeline: true, session }
    );
    return counter.value;
  }

  function toClaimView(doc, { customerPhone = null, product = null } = {}) {
    const available = product ? sellableQuantity(product) : null;
    const refundEstimateVnd = doc.unitPriceVnd * doc.quantity;
    return {
      id: String(doc._id),
      code: doc.code,
      orderId: String(doc.orderId),
      orderCode: doc.orderCode,
      orderDeliveredAt: doc.orderDeliveredAt,
      customerId: String(doc.customerId),
      customerName: doc.customerName,
      customerPhone,
      productId: String(doc.productId),
      productCode: doc.productCode,
      productName: doc.productName,
      orderedQuantity: doc.orderedQuantity,
      unitPriceVnd: doc.unitPriceVnd,
      quantity: doc.quantity,
      refundEstimateVnd,
      problemType: doc.problemType,
      description: doc.description ?? '',
      photoIds: doc.photoIds ?? [],
      status: doc.status,
      inspectionResult: doc.inspectionResult ?? null,
      inspectedBy: doc.inspectedBy ? String(doc.inspectedBy) : null,
      inspectedByName: doc.inspectedByName ?? null,
      inspectedAt: doc.inspectedAt ?? null,
      decision: doc.decision ?? null,
      decisionNote: doc.decisionNote ?? null,
      refundAmountVnd: doc.refundAmountVnd ?? null,
      decidedBy: doc.decidedBy ? String(doc.decidedBy) : null,
      decidedByName: doc.decidedByName ?? null,
      decidedAt: doc.decidedAt ?? null,
      exchangeSentBy: doc.exchangeSentBy ? String(doc.exchangeSentBy) : null,
      exchangeSentByName: doc.exchangeSentByName ?? null,
      exchangeSentAt: doc.exchangeSentAt ?? null,
      productAvailable: available,
      canSendExchange: doc.status === 'EXCHANGE_APPROVED' && available !== null && available >= doc.quantity,
      version: doc.version ?? 0,
      createdAt: doc.createdAt
    };
  }

  async function hydrateClaims(docs) {
    if (!docs.length) return [];
    const customerIds = [...new Set(docs.map(doc => String(doc.customerId)))];
    const productIds = [...new Set(docs.map(doc => String(doc.productId)))];
    const [phoneMap, products] = await Promise.all([
      phones?.phonesOf ? phones.phonesOf(customerIds) : Promise.resolve(new Map()),
      Product.find({ _id: { $in: productIds.map(oid) }, deletedAt: null })
        .select('stockOnHand quantityHeld')
        .lean()
    ]);
    const productMap = new Map(products.map(row => [String(row._id), row]));
    return docs.map(doc =>
      toClaimView(doc, {
        customerPhone: phoneMap.get(String(doc.customerId)) ?? null,
        product: productMap.get(String(doc.productId)) ?? null
      })
    );
  }

  async function readTabCounts() {
    const rows = await FaultyProductClaim.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);
    const byStatus = new Map(rows.map(row => [row._id, row.count]));
    return {
      WAITING_CHECK: byStatus.get('WAITING_CHECK') ?? 0,
      WAITING_ADMIN: byStatus.get('WAITING_ADMIN') ?? 0,
      DONE: (byStatus.get('EXCHANGE_APPROVED') ?? 0)
        + (byStatus.get('EXCHANGE_SENT') ?? 0)
        + (byStatus.get('REFUND_APPROVED') ?? 0)
        + (byStatus.get('REJECTED') ?? 0)
    };
  }

  return Object.freeze({
    async eligibility(actor, rawOrderId) {
      const customerId = requireCustomer(actor);
      const orderId = parseClaimObjectId(rawOrderId, 'orderId');
      const order = await ProductOrder.findOne({
        _id: oid(orderId),
        customerId: oid(customerId),
        channel: { $ne: COUNTER_CHANNEL }
      }).lean();
      if (!order) throw productSalesErrors.notFound();
      const at = new Date(clock());
      const reportDays = await currentReportDays(at);
      const claims = await FaultyProductClaim.find({ orderId: order._id, customerId: oid(customerId) })
        .sort({ createdAt: -1, _id: -1 })
        .limit(50)
        .lean();
      if (!ELIGIBLE_ORDER_STATUSES.has(order.status)) {
        return {
          eligible: false,
          reason: 'ORDER_NOT_DELIVERED',
          reportDays,
          deliveredAt: null,
          deadlineAt: null,
          deadlineDate: null,
          claims: claims.map(doc => toClaimView(doc))
        };
      }
      const deliveredAt = orderCompletionDate(order);
      const deadlineAt = new Date(new Date(deliveredAt).getTime() + reportDays * DAY_MS);
      const deadlineDate = formatVietnamDate(deadlineAt);
      const expired = at.getTime() > deadlineAt.getTime();
      return {
        eligible: !expired,
        reason: expired ? 'CLAIM_DEADLINE_PASSED' : null,
        reportDays,
        deliveredAt,
        deadlineAt,
        deadlineDate,
        claims: claims.map(doc => toClaimView(doc))
      };
    },

    async submit(actor, rawOrderId, body, commandKey) {
      const customerId = requireCustomer(actor);
      const orderId = parseClaimObjectId(rawOrderId, 'orderId');
      const key = parseClaimIdempotencyKey(commandKey);
      const input = parseSubmitFaultyClaim(body);
      const fingerprint = createHash('sha256')
        .update(JSON.stringify([customerId, orderId, input.productId, input.quantity, input.problemType, input.description, input.photoIds]))
        .digest('hex');

      const replay = async (session = null) => {
        const existing = await FaultyProductClaim.findOne({ customerId: oid(customerId), idempotencyKey: key })
          .session(session)
          .lean();
        if (existing && existing.requestFingerprint !== fingerprint) {
          throw new AppError(409, 'IDEMPOTENCY_CONFLICT', 'Idempotency key reused with different claim details');
        }
        return existing;
      };

      const at = new Date(clock());
      for (let attempt = 0; attempt <= FAULTY_CLAIM_LIMITS.conflictRetries; attempt += 1) {
        try {
          const doc = await unitOfWork.run(async session => {
            const earlier = await replay(session);
            if (earlier) return earlier;

            const order = await ProductOrder.findOne({
              _id: oid(orderId),
              customerId: oid(customerId),
              channel: { $ne: COUNTER_CHANNEL }
            }).session(session).lean();
            if (!order) throw productSalesErrors.notFound();
            if (!ELIGIBLE_ORDER_STATUSES.has(order.status)) {
              throw new AppError(409, 'ORDER_NOT_DELIVERED', 'Only delivered or picked-up orders can be reported');
            }

            const reportDays = await currentReportDays(at, session);
            const deliveredAt = orderCompletionDate(order);
            const deadlineAt = new Date(new Date(deliveredAt).getTime() + reportDays * DAY_MS);
            if (at.getTime() > deadlineAt.getTime()) {
              throw new AppError(409, 'CLAIM_DEADLINE_PASSED', 'Faulty product report deadline has passed', {
                deadlineAt: deadlineAt.toISOString(),
                deadlineDate: formatVietnamDate(deadlineAt),
                reportDays
              });
            }

            const line = order.lines.find(row => String(row.productId) === input.productId);
            if (!line) {
              throw new AppError(422, 'VALIDATION_FAILED', 'Product does not belong to this order', {
                fieldErrors: { productId: 'Sản phẩm không thuộc đơn hàng này.' }
              });
            }
            if (input.quantity > line.quantity) {
              throw new AppError(422, 'VALIDATION_FAILED', 'Quantity exceeds ordered quantity', {
                fieldErrors: { quantity: `Số lượng tối đa là ${line.quantity}.` }
              });
            }

            // Verify every uploaded photo belongs to the customer and is READY
            const images = await col('privateimages')
              .find(
                { _id: { $in: input.photoIds }, ownerId: oid(customerId), state: 'READY' },
                { session, projection: { _id: 1 }, maxTimeMS: 2000 }
              )
              .toArray();
            if (images.length !== input.photoIds.length) {
              throw new AppError(422, 'CLAIM_PHOTO_INVALID', 'All claim photos must be uploaded by the customer', {
                fieldErrors: { photoIds: 'Ảnh đính kèm chưa sẵn sàng hoặc không hợp lệ.' }
              });
            }

            const customer = await getUser().findById(customerId).select('displayName').session(session).lean();
            const number = await nextClaimNumber(session);
            const code = `${FAULTY_CLAIM_CODE_PREFIX}${String(number).padStart(4, '0')}`;
            const record = new FaultyProductClaim({
              code,
              number,
              orderId: order._id,
              orderCode: order.code,
              orderDeliveredAt: new Date(deliveredAt),
              customerId: oid(customerId),
              customerName: customer?.displayName ?? 'Khách hàng',
              productId: line.productId,
              productCode: line.productCode,
              productName: line.productName,
              orderedQuantity: line.quantity,
              unitPriceVnd: line.sellingPriceWhenOrdered,
              quantity: input.quantity,
              problemType: input.problemType,
              description: input.description,
              photoIds: input.photoIds,
              status: 'WAITING_CHECK',
              idempotencyKey: key,
              requestFingerprint: fingerprint,
              version: 0
            });
            await record.validate();
            const plain = { ...record.toObject(), createdAt: at, updatedAt: at };
            await FaultyProductClaim.collection.insertOne(plain, { session });
            await getNotifications().faultyProductClaim({ event: 'FaultyProductClaimSubmitted', claim: plain }, session);
            return plain;
          });
          return toClaimView(doc);
        } catch (error) {
          if (error?.code !== 11000) throw error;
          const earlier = await replay();
          if (earlier) return toClaimView(earlier);
          if (attempt === FAULTY_CLAIM_LIMITS.conflictRetries) {
            throw new AppError(409, 'CLAIM_CODE_CONFLICT', 'Claim code conflicted; retry with the same key');
          }
        }
      }
    },

    async list(actor, query) {
      requireClaimHandler(actor);
      const { tab, page, limit } = parseClaimListQuery(query);
      const filter = { status: { $in: FAULTY_CLAIM_TAB_STATUSES[tab] } };
      const [docs, counts, total] = await Promise.all([
        FaultyProductClaim.find(filter)
          .sort({ createdAt: -1, _id: -1 })
          .skip((page - 1) * limit)
          .limit(limit)
          .lean(),
        readTabCounts(),
        FaultyProductClaim.countDocuments(filter)
      ]);
      const items = await hydrateClaims(docs);
      return { items, counts, page, limit, total };
    },

    async read(actor, rawClaimId) {
      requireClaimHandler(actor);
      const claimId = parseClaimObjectId(rawClaimId, 'claimId');
      const doc = await FaultyProductClaim.findById(claimId).lean();
      if (!doc) throw productSalesErrors.notFound();
      const [item] = await hydrateClaims([doc]);
      return item;
    },

    async readPhoto(actor, rawClaimId, rawPhotoId) {
      if (actor?.state !== 'ACTIVE' || !Array.isArray(actor.roles)) throw productSalesErrors.unauthenticated();
      const claimId = parseClaimObjectId(rawClaimId, 'claimId');
      const photoId = parseClaimPhotoId(rawPhotoId);
      const claim = await FaultyProductClaim.findById(claimId).select('customerId photoIds').lean();
      if (!claim || !claim.photoIds?.includes(photoId)) throw productSalesErrors.notFound();
      const isHandler = PRODUCT_PERMISSIONS.HANDLE_FAULTY_CLAIMS.some(role => hasRole(actor.roles, role));
      const isOwner = hasRole(actor.roles, 'CUSTOMER') && String(claim.customerId) === actor.userId;
      if (!isHandler && !isOwner) throw productSalesErrors.forbidden();
      if (typeof readImage !== 'function') {
        throw new AppError(503, 'PROVIDER_UNAVAILABLE', 'Private media is unavailable');
      }
      return readImage({
        actor,
        id: photoId,
        authorize: () => true
      });
    },

    async inspect(actor, rawClaimId, body) {
      const handlerId = requireClaimHandler(actor);
      const claimId = parseClaimObjectId(rawClaimId, 'claimId');
      const input = parseInspectClaim(body);
      const at = new Date(clock());
      const doc = await unitOfWork.run(async session => {
        const current = await FaultyProductClaim.findById(claimId).session(session).lean();
        if (!current) throw productSalesErrors.notFound();
        if (current.status !== 'WAITING_CHECK') {
          throw new AppError(409, 'CLAIM_STATE_CONFLICT', 'Claim is no longer waiting for check');
        }
        if (input.expectedVersion !== undefined && (current.version ?? 0) !== input.expectedVersion) {
          throw new AppError(409, 'VERSION_CONFLICT', 'Claim changed; reload and try again');
        }
        const user = await getUser().findById(handlerId).select('displayName').session(session).lean();
        const updated = await FaultyProductClaim.findOneAndUpdate(
          { _id: current._id, status: 'WAITING_CHECK', version: current.version ?? 0 },
          {
            $set: {
              status: 'WAITING_ADMIN',
              inspectionResult: input.inspectionResult,
              inspectedBy: oid(handlerId),
              inspectedByName: user?.displayName ?? 'Sale Staff',
              inspectedAt: at,
              updatedAt: at
            },
            $inc: { version: 1 }
          },
          { returnDocument: 'after', session }
        ).lean();
        if (!updated) throw new AppError(409, 'VERSION_CONFLICT', 'Claim changed; reload and try again');
        await getNotifications().faultyProductClaim({ event: 'FaultyProductClaimInspected', claim: updated }, session);
        return updated;
      });
      const [item] = await hydrateClaims([doc]);
      return item;
    },

    async decide(actor, rawClaimId, body) {
      const adminId = requireClaimDecider(actor);
      const claimId = parseClaimObjectId(rawClaimId, 'claimId');
      const input = parseDecideClaim(body);
      const at = new Date(clock());
      const doc = await unitOfWork.run(async session => {
        const current = await FaultyProductClaim.findById(claimId).session(session).lean();
        if (!current) throw productSalesErrors.notFound();
        const switchingExchangeToRefund = current.status === 'EXCHANGE_APPROVED' && input.decision === 'REFUND';
        if (current.status !== 'WAITING_ADMIN' && !switchingExchangeToRefund) {
          throw new AppError(409, 'CLAIM_STATE_CONFLICT', 'Claim cannot accept this decision in its current state');
        }
        if (input.expectedVersion !== undefined && (current.version ?? 0) !== input.expectedVersion) {
          throw new AppError(409, 'VERSION_CONFLICT', 'Claim changed; reload and try again');
        }
        const admin = await getUser().findById(adminId).select('displayName').session(session).lean();
        const nextStatus = input.decision === 'EXCHANGE'
          ? 'EXCHANGE_APPROVED'
          : input.decision === 'REFUND'
            ? 'REFUND_APPROVED'
            : 'REJECTED';
        // Refund amount is strictly read-only: order unit price * claimed quantity; accounting pays outside PWC.
        const refundAmountVnd = input.decision === 'REFUND' ? current.unitPriceVnd * current.quantity : null;
        const setFields = {
          status: nextStatus,
          decision: input.decision,
          decisionNote: input.note,
          decidedBy: oid(adminId),
          decidedByName: admin?.displayName ?? 'Admin',
          decidedAt: at,
          updatedAt: at,
          ...(refundAmountVnd !== null ? { refundAmountVnd } : {})
        };
        const updateDoc = {
          $set: setFields,
          $inc: { version: 1 },
          ...(refundAmountVnd === null ? { $unset: { refundAmountVnd: 1 } } : {})
        };
        const updated = await FaultyProductClaim.findOneAndUpdate(
          { _id: current._id, status: current.status, version: current.version ?? 0 },
          updateDoc,
          { returnDocument: 'after', session }
        ).lean();
        if (!updated) throw new AppError(409, 'VERSION_CONFLICT', 'Claim changed; reload and try again');
        await getNotifications().faultyProductClaim({ event: 'FaultyProductClaimDecided', claim: updated }, session);
        return updated;
      });
      const [item] = await hydrateClaims([doc]);
      return item;
    },

    async markExchangeSent(actor, rawClaimId, body) {
      const handlerId = requireClaimHandler(actor);
      const claimId = parseClaimObjectId(rawClaimId, 'claimId');
      const input = parseExchangeSent(body);
      const at = new Date(clock());
      const doc = await unitOfWork.run(async session => {
        const current = await FaultyProductClaim.findById(claimId).session(session).lean();
        if (!current) throw productSalesErrors.notFound();
        if (current.status === 'EXCHANGE_SENT') {
          throw new AppError(409, 'EXCHANGE_ALREADY_SENT', 'Exchange goods were already sent');
        }
        if (current.status !== 'EXCHANGE_APPROVED') {
          throw new AppError(409, 'CLAIM_STATE_CONFLICT', 'Only approved exchanges can be marked sent');
        }
        if (input.expectedVersion !== undefined && (current.version ?? 0) !== input.expectedVersion) {
          throw new AppError(409, 'VERSION_CONFLICT', 'Claim changed; reload and try again');
        }

        const handler = await getUser().findById(handlerId).select('displayName').session(session).lean();
        const claimed = await FaultyProductClaim.findOneAndUpdate(
          { _id: current._id, status: 'EXCHANGE_APPROVED', version: current.version ?? 0 },
          {
            $set: {
              status: 'EXCHANGE_SENT',
              exchangeSentBy: oid(handlerId),
              exchangeSentByName: handler?.displayName ?? 'Sale Staff',
              exchangeSentAt: at,
              updatedAt: at
            },
            $inc: { version: 1 }
          },
          { returnDocument: 'after', session }
        ).lean();
        if (!claimed) throw new AppError(409, 'CLAIM_STATE_CONFLICT', 'Claim changed; reload and try again');

        // GBR-35 & GBR-49: deduct new exchange goods from stockOnHand only when available covers claim quantity.
        // Faulty returned goods are never added back to stockOnHand, and no StockAdjustment is created.
        const deducted = await Product.findOneAndUpdate(
          {
            _id: current.productId,
            deletedAt: null,
            $expr: { $gte: [{ $subtract: [{ $ifNull: ['$stockOnHand', 0] }, { $ifNull: ['$quantityHeld', 0] }] }, current.quantity] }
          },
          { $inc: { stockOnHand: -current.quantity, version: 1 } },
          { returnDocument: 'after', session }
        ).lean();
        if (!deducted) {
          const product = await Product.findOne({ _id: current.productId, deletedAt: null }).session(session).lean();
          const available = product ? sellableQuantity(product) : 0;
          throw new AppError(409, 'EXCHANGE_INSUFFICIENT_STOCK', 'Available stock does not cover exchange quantity', {
            available,
            required: current.quantity
          });
        }

        await getNotifications().faultyProductClaim({ event: 'FaultyProductExchangeSent', claim: claimed }, session);
        return claimed;
      });
      const [item] = await hydrateClaims([doc]);
      return item;
    }
  });
}
