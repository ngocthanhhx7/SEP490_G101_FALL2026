import { createCatalogChange } from '../models/catalog-change-provenance.model.js';
import { Types } from 'mongoose';
import { initialServiceCatalog } from '../constants/initial-service-catalog.js';
import { serviceModel } from '../models/service.model.js';
import { serviceVersionModel } from '../models/service-version.model.js';
import { servicePolicyVersionModel } from '../models/service-policy-version.model.js';
import { servicePriceVersionModel } from '../models/service-price-version.model.js';
import { systemSettingVersionModel } from '../models/system-setting-version.model.js';

export async function provisionInitialCatalog({
  config,
  connection,
  clock = Date.now,
  entries = initialServiceCatalog,
  runKey = 'pawworld-initial-three-services-v1',
  authorization = 'Project owner requested the three services and editable initial prices in this session'
}) {
  void config;
  [
    serviceModel,
    serviceVersionModel,
    servicePolicyVersionModel,
    servicePriceVersionModel,
    systemSettingVersionModel
  ].forEach((factory) => factory(connection));
  const models = connection.models;
  const names = [
    'Service',
    'ServiceVersion',
    'ServicePolicyVersion',
    'ServicePriceVersion',
    'SystemSettingVersion'
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
      { key: runKey },
      { session }
    );
    if (prior) return { state: 'ALREADY_APPLIED', created: [] };
    const actorId = new Types.ObjectId();
    const now = new Date(clock());
    const reason =
      'Owner-authorized initial catalog provisioning; actorId identifies the system migration run, not a user account';
    const created = [];
    for (const item of entries) {
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
            changeAudit: createCatalogChange('SERVICE_CREATED', ['name', 'description', 'scope', 'species', 'state']),
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
            changeAudit: createCatalogChange('POLICY_VERSIONED', ['state', 'title', 'body']),
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
            changeAudit: createCatalogChange('SERVICE_PRICE_VERSIONED', ['amountVnd', 'unitLabel']),
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
      await models.SystemSettingVersion.create(
        [
          {
            changeAudit: createCatalogChange('SERVICE_CATALOG_VISIBILITY_CHANGED', ['enabled']),
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
    }
    await runs.insertOne(
      {
        _id: actorId,
        key: runKey,
        actorKind: 'SYSTEM_MIGRATION',
        authorization,
        createdAt: now,
        created
      },
      { session }
    );
    return { state: 'APPLIED', created };
  });
}
