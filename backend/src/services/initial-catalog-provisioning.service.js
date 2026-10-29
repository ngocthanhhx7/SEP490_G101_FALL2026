import { servicePriceAuditModel } from '../models/service-price-audit.model.js';
import { systemSettingAuditModel } from '../models/system-setting-audit.model.js';
import { Types } from 'mongoose';
import { initialServiceCatalog } from '../constants/initial-service-catalog.js';
import { serviceModel } from '../models/service.model.js';
import { serviceVersionModel } from '../models/service-version.model.js';
import { servicePolicyVersionModel } from '../models/service-policy-version.model.js';
import { servicePriceVersionModel } from '../models/service-price-version.model.js';
import { systemSettingVersionModel } from '../models/system-setting-version.model.js';
import { serviceAuditModel } from '../models/service-audit.model.js';

export async function provisionInitialCatalog({
  config,
  connection,
  clock = Date.now
}) {
  void config;
  [
    serviceModel,
    serviceVersionModel,
    servicePolicyVersionModel,
    servicePriceVersionModel,
    systemSettingVersionModel,
    serviceAuditModel,
    servicePriceAuditModel,
    systemSettingAuditModel
  ].forEach((factory) => factory(connection));
  const models = connection.models;
  const names = [
    'Service',
    'ServiceVersion',
    'ServicePolicyVersion',
    'ServicePriceVersion',
    'ServiceAudit',
    'ServicePriceAudit',
    'SystemSettingVersion',
    'SystemSettingAudit'
  ];
  // Explicit provisioning, never on application startup. Preserve existing prices/settings.
  for (const name of names) {
    await models[name].createCollection();
    await models[name].createIndexes();
  }
  const runs = connection.collection('catalogprovisioningruns');
  await runs.createIndex({ key: 1 }, { unique: true });
  return connection.transaction(async (session) => {
    const prior = await runs.findOne(
      { key: 'pawworld-initial-three-services-v1' },
      { session }
    );
    if (prior) return { state: 'ALREADY_APPLIED', created: [] };
    const actorId = new Types.ObjectId();
    const now = new Date(clock());
    const reason =
      'Owner-authorized initial catalog provisioning; actorId identifies the system migration run, not a user account';
    const created = [];
    for (const item of initialServiceCatalog) {
      if (await models.Service.exists({ code: item.code }).session(session))
        continue;
      const serviceId = new Types.ObjectId();
      await models.Service.create(
        [
          {
            _id: serviceId,
            code: item.code,
            createdBy: actorId,
            createdAt: now
          }
        ],
        { session }
      );
      await models.ServiceVersion.create(
        [
          {
            serviceId,
            version: 1,
            name: item.name,
            description: item.description,
            scope: item.scope,
            species: item.species,
            state: 'ACTIVE',
            effectiveAt: now,
            changedBy: actorId,
            reason,
            recordedAt: now
          }
        ],
        { session }
      );
      await models.ServicePolicyVersion.create(
        [
          {
            serviceId,
            version: 1,
            state: 'PUBLISHED',
            title: 'Thông tin thực hiện — ' + item.name,
            body: item.policy,
            effectiveAt: now,
            changedBy: actorId,
            reason,
            recordedAt: now
          }
        ],
        { session }
      );
      await models.ServicePriceVersion.create(
        [
          {
            serviceId,
            version: 1,
            amountVnd: item.amountVnd,
            currency: 'VND',
            unitLabel: item.unitLabel,
            effectiveAt: now,
            changedBy: actorId,
            reason,
            recordedAt: now
          }
        ],
        { session }
      );
      for (const [action, resourceType, changedFields] of [
        [
          'SERVICE_CREATED',
          'service',
          ['name', 'description', 'scope', 'species', 'state']
        ],
        ['POLICY_VERSIONED', 'service-policy', ['state', 'title', 'body']]
      ])
        await models.ServiceAudit.create(
          [
            {
              actorId,
              action,
              resourceType,
              resourceId: serviceId,
              version: 1,
              changedFields,
              reason,
              effectiveAt: now,
              occurredAt: now
            }
          ],
          { session }
        );
      await models.ServicePriceAudit.create(
        [
          {
            actorId,
            action: 'SERVICE_PRICE_VERSIONED',
            resourceType: 'service-price',
            resourceId: serviceId,
            version: 1,
            changedFields: ['amountVnd', 'unitLabel'],
            reason,
            effectiveAt: now,
            occurredAt: now
          }
        ],
        { session }
      );
      created.push({
        code: item.code,
        id: serviceId.toString(),
        amountVnd: item.amountVnd,
        unitLabel: item.unitLabel
      });
    }
    if (
      !(await models.SystemSettingVersion.exists({
        key: 'SERVICE_CATALOG_VISIBLE'
      }).session(session))
    ) {
      const [setting] = await models.SystemSettingVersion.create(
        [
          {
            key: 'SERVICE_CATALOG_VISIBLE',
            version: 1,
            enabled: true,
            effectiveAt: now,
            changedBy: actorId,
            reason,
            recordedAt: now
          }
        ],
        { session }
      );
      await models.SystemSettingAudit.create(
        [
          {
            actorId,
            action: 'SERVICE_CATALOG_VISIBILITY_CHANGED',
            resourceType: 'system-setting',
            resourceId: setting._id,
            version: 1,
            changedFields: ['enabled'],
            reason,
            effectiveAt: now,
            occurredAt: now
          }
        ],
        { session }
      );
    }
    await runs.insertOne(
      {
        _id: actorId,
        key: 'pawworld-initial-three-services-v1',
        actorKind: 'SYSTEM_MIGRATION',
        authorization:
          'Project owner requested the three services and editable initial prices in this session',
        createdAt: now,
        created
      },
      { session }
    );
    return { state: 'APPLIED', created };
  });
}
