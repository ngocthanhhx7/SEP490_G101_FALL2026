import { Types } from 'mongoose';
import { AppError } from '../utils/app-error.js';

const SERVICE_FIELDS = ['name', 'description', 'scope', 'species', 'state'];
const SPECIES = new Set(['DOG', 'CAT']);
const SERVICE_STATES = new Set(['DRAFT', 'ACTIVE', 'INACTIVE', 'ARCHIVED']);
const POLICY_STATES = new Set(['PUBLISHED', 'WITHDRAWN']);
function invalid(message = 'Service request is invalid') {
  throw new AppError(422, 'VALIDATION_FAILED', message);
}

function exactKeys(value, allowed, required = []) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).some((key) => !allowed.has(key)) ||
    Array.from(required).some((key) => !Object.hasOwn(value, key))
  )
    invalid();
}

function stringField(value, min, max, name) {
  if (
    typeof value !== 'string' ||
    value.trim().length < min ||
    value.trim().length > max
  ) {
    invalid(name + ' is invalid');
  }
  return value.trim();
}

function versionNumber(value) {
  if (!Number.isSafeInteger(value) || value < 0)
    invalid('Expected version is invalid');
  return value;
}

function effectiveDate(value) {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(value)
  ) {
    invalid('Effective time must be a UTC timestamp');
  }
  const date = new Date(value);
  if (
    !Number.isFinite(date.getTime()) ||
    (date.toISOString() !== value &&
      date.toISOString().replace(/\.000Z$/, 'Z') !== value)
  ) {
    invalid('Effective time is invalid');
  }
  return date;
}

function serviceInput(value, creating = false) {
  const allowed = new Set([
    ...SERVICE_FIELDS,
    'effectiveAt',
    'reason',
    ...(creating ? ['code'] : ['expectedVersion'])
  ]);
  const required = new Set([
    ...SERVICE_FIELDS,
    'effectiveAt',
    'reason',
    ...(creating ? ['code'] : ['expectedVersion'])
  ]);
  exactKeys(value, allowed, required);
  const name = stringField(value.name, 2, 120, 'Name');
  const description = stringField(value.description, 0, 2000, 'Description');
  const scope = stringField(value.scope, 3, 2000, 'Scope');
  if (
    !Array.isArray(value.species) ||
    value.species.length === 0 ||
    value.species.some((item) => !SPECIES.has(item)) ||
    new Set(value.species).size !== value.species.length
  ) {
    invalid('Choose one or more supported pet species');
  }
  if (!SERVICE_STATES.has(value.state)) invalid('Service state is invalid');
  const parsed = {
    name,
    description,
    scope,
    species: [...value.species].sort(),
    state: value.state,
    effectiveAt: effectiveDate(value.effectiveAt),
    reason: stringField(value.reason, 3, 500, 'Reason')
  };
  if (creating) {
    if (
      typeof value.code !== 'string' ||
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value.code) ||
      value.code.length > 48
    ) {
      invalid(
        'Service code must contain lowercase letters, numbers and single hyphens'
      );
    }
    parsed.code = value.code;
  } else parsed.expectedVersion = versionNumber(value.expectedVersion);
  return parsed;
}

function policyInput(value) {
  exactKeys(
    value,
    new Set([
      'expectedVersion',
      'state',
      'title',
      'body',
      'effectiveAt',
      'reason'
    ]),
    ['expectedVersion', 'state', 'effectiveAt', 'reason']
  );
  if (!POLICY_STATES.has(value.state)) invalid('Policy state is invalid');
  const result = {
    expectedVersion: versionNumber(value.expectedVersion),
    state: value.state,
    effectiveAt: effectiveDate(value.effectiveAt),
    reason: stringField(value.reason, 3, 500, 'Reason')
  };
  if (value.state === 'PUBLISHED') {
    result.title = stringField(value.title, 2, 120, 'Policy title');
    result.body = stringField(value.body, 3, 10000, 'Policy');
  } else if (value.title !== undefined || value.body !== undefined) {
    invalid('Withdrawals cannot replace policy text');
  }
  return result;
}

function validId(id) {
  if (!Types.ObjectId.isValid(id))
    throw new AppError(404, 'RESOURCE_NOT_FOUND', 'Service is unavailable');
  return new Types.ObjectId(id);
}

function conflict(error) {
  if (error?.code === 11000)
    throw new AppError(
      409,
      'VERSION_CONFLICT',
      'A service version already exists for this effective time'
    );
  throw error;
}

async function latest(Model, serviceId, session) {
  let query = Model.findOne({ serviceId }).sort({ version: -1 });
  if (session) query = query.session(session);
  return query.lean();
}

async function effective(Model, serviceId, at) {
  return Model.findOne({ serviceId, effectiveAt: { $lte: at } })
    .sort({ effectiveAt: -1, version: -1 })
    .lean();
}

function validatePrice(price) {
  const effectiveAt = new Date(price?.effectiveAt);
  if (
    !price ||
    !Number.isSafeInteger(price.amountVnd) ||
    price.amountVnd < 0 ||
    price.currency !== 'VND' ||
    typeof price.unitLabel !== 'string' ||
    !price.unitLabel.trim() ||
    !Number.isSafeInteger(price.version) ||
    price.version < 1 ||
    !Number.isFinite(effectiveAt.getTime())
  ) {
    throw new AppError(
      503,
      'CATALOG_INTEGRATION_PENDING',
      'Service price is not available'
    );
  }
  return {
    amountVnd: price.amountVnd,
    currency: 'VND',
    unitLabel: price.unitLabel,
    priceVersion: price.version,
    effectiveAt: new Date(price.effectiveAt).toISOString()
  };
}

export function createServiceCatalogService({
  connection,
  Service,
  ServiceVersion,
  PolicyVersion,
  Audit,
  Presentation,
  priceProvider,
  catalogSettings,
  clock = Date.now
}) {
  if (
    !connection?.transaction ||
    !Service ||
    !ServiceVersion ||
    !PolicyVersion ||
    !Audit ||
    typeof priceProvider?.getActivePrice !== 'function' ||
    typeof catalogSettings?.isEnabledAt !== 'function' ||
    typeof clock !== 'function'
  ) {
    throw new TypeError('Service catalog dependencies are required');
  }

  async function create({ body, actor }) {
    const input = serviceInput(body, true);
    if (!actor?.userId || !Types.ObjectId.isValid(actor.userId))
      throw new AppError(403, 'FORBIDDEN', 'Action is not permitted');
    try {
      return await connection.transaction(
        async (session) => {
          const now = new Date(clock());
          const [service] = await Service.create(
            [
              {
                code: input.code,
                createdBy: new Types.ObjectId(actor.userId),
                createdAt: now
              }
            ],
            { session }
          );
          const [version] = await ServiceVersion.create(
            [
              {
                serviceId: service._id,
                version: 1,
                name: input.name,
                description: input.description,
                scope: input.scope,
                species: input.species,
                state: input.state,
                effectiveAt: input.effectiveAt,
                changedBy: new Types.ObjectId(actor.userId),
                reason: input.reason,
                recordedAt: now
              }
            ],
            { session }
          );
          await Audit.create(
            [
              {
                actorId: new Types.ObjectId(actor.userId),
                action: 'SERVICE_CREATED',
                resourceType: 'service',
                resourceId: service._id,
                version: 1,
                changedFields: [...SERVICE_FIELDS, 'code'],
                reason: input.reason,
                effectiveAt: input.effectiveAt,
                occurredAt: now
              }
            ],
            { session }
          );
          return {
            id: service._id.toString(),
            ...version.toObject(),
            serviceId: service._id.toString()
          };
        },
        {
          readPreference: 'primary',
          readConcern: { level: 'snapshot' },
          writeConcern: { w: 'majority' }
        }
      );
    } catch (error) {
      conflict(error);
    }
  }

  async function update({ serviceId, body, actor }) {
    const id = validId(serviceId);
    const input = serviceInput(body, false);
    if (!actor?.userId || !Types.ObjectId.isValid(actor.userId))
      throw new AppError(403, 'FORBIDDEN', 'Action is not permitted');
    try {
      return await connection.transaction(
        async (session) => {
          const service = await Service.findById(id).session(session).lean();
          if (!service)
            throw new AppError(404, 'RESOURCE_NOT_FOUND', 'Service not found');
          const previous = await latest(ServiceVersion, id, session);
          if ((previous?.version ?? 0) !== input.expectedVersion) {
            throw new AppError(
              409,
              'VERSION_CONFLICT',
              'Service changed before this update was applied'
            );
          }
          const now = new Date(clock());
          const [version] = await ServiceVersion.create(
            [
              {
                serviceId: id,
                version: input.expectedVersion + 1,
                name: input.name,
                description: input.description,
                scope: input.scope,
                species: input.species,
                state: input.state,
                effectiveAt: input.effectiveAt,
                changedBy: new Types.ObjectId(actor.userId),
                reason: input.reason,
                recordedAt: now
              }
            ],
            { session }
          );
          await Audit.create(
            [
              {
                actorId: new Types.ObjectId(actor.userId),
                action: 'SERVICE_VERSIONED',
                resourceType: 'service',
                resourceId: id,
                version: version.version,
                changedFields: [...SERVICE_FIELDS],
                reason: input.reason,
                effectiveAt: input.effectiveAt,
                occurredAt: now
              }
            ],
            { session }
          );
          return { ...version.toObject(), serviceId: id.toString() };
        },
        {
          readPreference: 'primary',
          readConcern: { level: 'snapshot' },
          writeConcern: { w: 'majority' }
        }
      );
    } catch (error) {
      conflict(error);
    }
  }

  async function setPolicy({ serviceId, body, actor }) {
    const id = validId(serviceId);
    const input = policyInput(body);
    if (!actor?.userId || !Types.ObjectId.isValid(actor.userId))
      throw new AppError(403, 'FORBIDDEN', 'Action is not permitted');
    try {
      return await connection.transaction(
        async (session) => {
          const service = await Service.findById(id).session(session).lean();
          if (!service)
            throw new AppError(404, 'RESOURCE_NOT_FOUND', 'Service not found');
          const previous = await latest(PolicyVersion, id, session);
          if ((previous?.version ?? 0) !== input.expectedVersion) {
            throw new AppError(
              409,
              'VERSION_CONFLICT',
              'Service policy changed before this update was applied'
            );
          }
          const now = new Date(clock());
          const [version] = await PolicyVersion.create(
            [
              {
                serviceId: id,
                version: input.expectedVersion + 1,
                state: input.state,
                ...(input.state === 'PUBLISHED'
                  ? { title: input.title, body: input.body }
                  : {}),
                effectiveAt: input.effectiveAt,
                changedBy: new Types.ObjectId(actor.userId),
                reason: input.reason,
                recordedAt: now
              }
            ],
            { session }
          );
          await Audit.create(
            [
              {
                actorId: new Types.ObjectId(actor.userId),
                action: 'POLICY_VERSIONED',
                resourceType: 'service-policy',
                resourceId: id,
                version: version.version,
                changedFields: [
                  'state',
                  ...(input.state === 'PUBLISHED' ? ['title', 'body'] : [])
                ],
                reason: input.reason,
                effectiveAt: input.effectiveAt,
                occurredAt: now
              }
            ],
            { session }
          );
          return { ...version.toObject(), serviceId: id.toString() };
        },
        {
          readPreference: 'primary',
          readConcern: { level: 'snapshot' },
          writeConcern: { w: 'majority' }
        }
      );
    } catch (error) {
      conflict(error);
    }
  }

  async function listAdmin({ includePolicyText = false } = {}) {
    const services = await Service.find({}).sort({ code: 1 }).lean();
    const ids = services.map((service) => service._id);
    const at = new Date(clock());
    const grouped = (Model, filter, sort) =>
      Model.aggregate([
        { $match: { serviceId: { $in: ids }, ...filter } },
        { $sort: sort },
        { $group: { _id: '$serviceId', current: { $first: '$$ROOT' } } },
        { $replaceRoot: { newRoot: '$current' } }
      ]).option({ maxTimeMS: 2000 });
    const [versionRows, policyRows, latestRows] = await Promise.all([
      grouped(ServiceVersion, {}, { version: -1 }),
      grouped(
        PolicyVersion,
        { effectiveAt: { $lte: at } },
        { effectiveAt: -1, version: -1 }
      ),
      grouped(PolicyVersion, {}, { version: -1 })
    ]);
    const map = (rows) =>
      new Map(rows.map((row) => [row.serviceId.toString(), row]));
    const versions = map(versionRows),
      policies = map(policyRows),
      latestPolicies = map(latestRows);
    const output = [];
    for (const service of services) {
      const key = service._id.toString();
      const version = versions.get(key),
        currentPolicy = policies.get(key),
        latestPolicyVersion = latestPolicies.get(key);
      if (!version) continue;
      const policy =
        currentPolicy?.state === 'PUBLISHED'
          ? {
              version: currentPolicy.version,
              state: currentPolicy.state,
              title: currentPolicy.title,
              ...(includePolicyText ? { body: currentPolicy.body } : {}),
              effectiveAt: currentPolicy.effectiveAt.toISOString()
            }
          : currentPolicy
            ? {
                version: currentPolicy.version,
                state: currentPolicy.state,
                effectiveAt: currentPolicy.effectiveAt.toISOString()
              }
            : null;
      output.push({
        id: service._id.toString(),
        code: service.code,
        version: version.version,
        name: version.name,
        description: version.description,
        scope: version.scope,
        species: version.species,
        state: version.state,
        effectiveAt: version.effectiveAt.toISOString(),
        latestPolicyVersion: latestPolicyVersion?.version ?? 0,
        policy
      });
    }
    return output;
  }

  async function publicList({ at = new Date(clock()) } = {}) {
    if (!(await catalogSettings.isEnabledAt(at)))
      return { available: false, services: [] };
    // Select the effective state before filtering ACTIVE so retirement cannot
    // resurrect an older active service; return one row per service, not history.
    const versions = await ServiceVersion.aggregate([
      { $match: { effectiveAt: { $lte: at } } },
      { $sort: { effectiveAt: -1, version: -1 } },
      { $group: { _id: '$serviceId', current: { $first: '$$ROOT' } } },
      { $replaceRoot: { newRoot: '$current' } }
    ]);
    const current = new Map();
    for (const version of versions)
      if (!current.has(version.serviceId.toString()))
        current.set(version.serviceId.toString(), version);
    const serviceIds = [...current.values()].map(
      (version) => version.serviceId
    );
    const serviceDetails = await Service.find({ _id: { $in: serviceIds } })
      .select('code')
      .lean();
    const codes = new Map(
      serviceDetails.map((service) => [service._id.toString(), service.code])
    );
    const presentations = Presentation
      ? await Presentation.find({ serviceId: { $in: serviceIds } }).lean()
      : [];
    const detailMap = new Map(
      presentations.map((item) => [
        item.serviceId.toString(),
        {
          preparation: item.preparation,
            ...(item.category ? { category: item.category, locations: item.locations,
              ...(item.durationMinutes ? { durationMinutes: item.durationMinutes } : {}) } : {}),
          exclusions: item.exclusions,
          faq: item.faq.map(({ question, answer }) => ({ question, answer }))
        }
      ])
    );
    const services = [];
    for (const version of current.values()) {
      if (version.state !== 'ACTIVE') continue;
      const policy = await effective(PolicyVersion, version.serviceId, at);
      if (!policy || policy.state !== 'PUBLISHED') continue;
      const price = await priceProvider.getActivePrice(
        version.serviceId.toString(),
        at
      );
      if (!price) continue;
      services.push({
        id: version.serviceId.toString(),
        code: codes.get(version.serviceId.toString()),
        version: version.version,
        name: version.name,
        description: version.description,
        scope: version.scope,
        species: version.species,
        ...(detailMap.has(version.serviceId.toString())
          ? { details: detailMap.get(version.serviceId.toString()) }
          : {}),
        policy: {
          version: policy.version,
          title: policy.title,
          body: policy.body,
          effectiveAt: policy.effectiveAt.toISOString()
        },
        price: validatePrice(price)
      });
    }
    return {
      available: true,
      services: services.sort((left, right) =>
        left.name.localeCompare(right.name, 'vi')
      )
    };
  }

  async function bookableSnapshot(serviceId, at = new Date(clock())) {
    const id = validId(serviceId);
    if (!(await catalogSettings.isEnabledAt(at)))
      throw new AppError(
        409,
        'SERVICE_UNAVAILABLE',
        'Service is not available for new bookings'
      );
    const version = await effective(ServiceVersion, id, at);
    if (!version || version.state !== 'ACTIVE')
      throw new AppError(
        409,
        'SERVICE_UNAVAILABLE',
        'Service is not available for new bookings'
      );
    const policy = await effective(PolicyVersion, id, at);
    if (!policy || policy.state !== 'PUBLISHED')
      throw new AppError(
        409,
        'SERVICE_UNAVAILABLE',
        'Service policy is not available'
      );
    const price = await priceProvider.getActivePrice(id.toString(), at);
    if (!price)
      throw new AppError(
        409,
        'SERVICE_UNAVAILABLE',
        'Service price is not available'
      );
    const service = await Service.findById(id).select('code').lean();
    if (!service)
      throw new AppError(
        409,
        'SERVICE_UNAVAILABLE',
        'Service is not available for new bookings'
      );
    const serviceSnapshot = Object.freeze({
      id: id.toString(),
      code: service.code,
      version: version.version,
      name: version.name,
      description: version.description,
      scope: version.scope,
      species: Object.freeze([...version.species])
    });
    const policySnapshot = Object.freeze({
      version: policy.version,
      title: policy.title,
      body: policy.body,
      effectiveAt: policy.effectiveAt.toISOString()
    });
    return Object.freeze({
      service: serviceSnapshot,
      policy: policySnapshot,
      price: Object.freeze(validatePrice(price)),
      capturedAt: new Date(at).toISOString()
    });
  }

  return Object.freeze({
    create,
    update,
    setPolicy,
    listAdmin,
    publicList,
    bookableSnapshot
  });
}
