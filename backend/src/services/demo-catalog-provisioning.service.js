import { Types } from 'mongoose';
import { demoCatalogKey, demoServiceCatalog, demoTraits, demoPricingPolicy } from '../constants/demo-service-catalog.js';
import { provisionInitialCatalog } from './initial-catalog-provisioning.service.js';
import { servicePresentationModel } from '../models/service-presentation.model.js';
import { pricingModels } from '../models/pricing.model.js';
import { petCareModels } from '../models/pet-care.model.js';

export async function provisionDemoCatalog({ connection, clock = Date.now }) {
  const catalog = await provisionInitialCatalog({ connection, clock, entries: demoServiceCatalog,
    runKey: demoCatalogKey + '-services', authorization: 'Owner requested the demo service sheet and confirmed combo/weight rules on 2026-10-30' });
  const Presentation = servicePresentationModel(connection);
  const { PricingPolicy } = pricingModels(connection);
  const { PetTrait } = petCareModels(connection);
  for (const model of [Presentation, PricingPolicy, PetTrait]) { await model.createCollection(); await model.createIndexes(); }
  const runs = connection.collection('catalogprovisioningruns');
  const result = await connection.transaction(async session => {
    if (await runs.findOne({ key: demoCatalogKey }, { session })) return { state: 'ALREADY_APPLIED' };
    const runId = new Types.ObjectId(), now = new Date(clock()), skipped = [], retired = [];
    for (const item of demoServiceCatalog) {
      const service = await connection.models.Service.findOne({ code: item.code }).session(session).lean();
      const serviceId = service._id;
      await Presentation.updateOne({ serviceId }, { $setOnInsert: { serviceId, category: item.category, locations: item.locations,
        ...(item.durationMinutes ? { durationMinutes: item.durationMinutes } : {}), preparation: ['Cung cấp tình trạng sức khỏe, thói quen và nhu cầu của bé.',
          'Xác nhận lịch và địa điểm thực hiện trước khi đặt dịch vụ.'],
        exclusions: ['Thuốc, viện phí và điều trị thú y.', 'Công việc ngoài phạm vi chưa được xác nhận.'],
        faq: [{ question: 'Giá cuối cùng được tính như thế nào?', answer: 'Tiền dịch vụ theo đơn vị công bố, trừ combo rồi cộng phụ phí theo nhóm và phí bậc giá. Báo giá được xác nhận trước khi đặt.' }],
        provisioningRunId: runId, updatedAt: now } }, { upsert: true, session, runValidators: true });
      // Add newly introduced metadata to the earlier migration without replacing its copy.
      const initialDetailsRun = await runs.findOne({ key: 'pawworld-service-details-v1' }, { session });
      if (initialDetailsRun) {
        const owned = { serviceId, provisioningRunId: initialDetailsRun._id };
        for (const [field, value] of Object.entries({ category: item.category, locations: item.locations,
          ...(item.durationMinutes ? { durationMinutes: item.durationMinutes } : {}) })) {
          await Presentation.updateOne({ ...owned, ...(field === 'locations' ? { 'locations.0': { $exists: false } } : { [field]: { $exists: false } }) },
            { $set: { [field]: value } }, { session, runValidators: true });
        }
      }
      const prior = await PricingPolicy.findOne({ serviceId }).sort({ version: -1 }).session(session).lean();
      if (prior && prior.approvalSource !== 'USER_REQUEST_2026_10_24') skipped.push({ code: item.code, reason: 'EXISTING_PRICING_POLICY' });
      else await PricingPolicy.create([{ serviceId, version: (prior?.version || 0) + 1, status: 'APPROVED', effectiveAt: now, approvedAt: now,
        approvalSource: demoCatalogKey, reason: 'Sheet demo, combo and weight boundaries confirmed by owner; previous snapshots stay immutable.', ...demoPricingPolicy(item) }], { session });
    }
    for (const [code, label] of demoTraits) await PetTrait.updateOne({ code }, { $setOnInsert: { code, label, species: ['DOG', 'CAT'],
      explanation: 'Đặc điểm theo bảng dịch vụ demo được chủ dự án cung cấp.', active: true } }, { session, upsert: true, runValidators: true });
    // Retire only untouched migration-owned legacy entries; keep Admin versions and booking history.
    for (const code of ['home-visit', 'vet-escort']) {
      const service = await connection.models.Service.findOne({ code }).session(session).lean();
      if (!service) continue;
      const versions = await connection.models.ServiceVersion.find({ serviceId: service._id }).session(session).lean();
      const latest = versions.sort((a, b) => b.version - a.version)[0];
      if (!latest || versions.length !== 1 || !latest.reason.startsWith('Owner-authorized initial catalog provisioning')) {
        skipped.push({ code, reason: 'ADMIN_SERVICE_VERSION_PRESERVED' }); continue;
      }
      const { _id, ...previous } = latest; void _id;
      const reason = 'Owner replaced initial catalogue with demo sheet services; retain historical versions.';
      await connection.models.ServiceVersion.create([{ ...previous, version: latest.version + 1, state: 'INACTIVE', effectiveAt: now,
        changedBy: runId, reason, recordedAt: now }], { session });
      await connection.models.ServiceAudit.create([{ actorId: runId, action: 'SERVICE_VERSIONED', resourceType: 'service', resourceId: service._id,
        version: latest.version + 1, changedFields: ['state'], reason, effectiveAt: now, occurredAt: now }], { session });
      retired.push(code);
    }
    await runs.insertOne({ _id: runId, key: demoCatalogKey, actorKind: 'SYSTEM_MIGRATION', createdAt: now,
      source: '17FHTYg-Zv_5MkVKA6kyGR7_QkLYUdhVorqLLpbTsY_0/gid=1530430300', skipped, retired }, { session });
    return { state: 'APPLIED', skipped, retired };
  });
  return { catalog, ...result };
}
