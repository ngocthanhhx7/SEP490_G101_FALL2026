import { loadConfig } from '../../src/config/environment.js';
import { connectDatabase } from '../../src/config/database.js';
import { pricingModels } from '../../src/models/pricing.model.js';
import { serviceModel } from '../../src/models/service.model.js';
if (!process.argv.includes('--apply'))
  console.log(
    JSON.stringify({
      state: 'DRY_RUN',
      scope: 'BACKEND_PRICING',
      policies: 'Approved versioned deterministic pricing only'
    })
  );
else {
  let connection;
  try {
    connection = await connectDatabase(loadConfig());
    const models = pricingModels(connection),
      Service = serviceModel(connection);
    for (const model of Object.values(models)) await model.createIndexes();
    const result = await connection.transaction(async (session) => {
      const now = new Date(),
        policies = [];
      for (const [code, unitMinutes] of [
        ['home-visit', 30],
        ['dog-walking', 30],
        ['vet-escort', 60]
      ]) {
        const service = await Service.findOne({ code }).session(session).lean();
        if (!service)
          throw new Error('Run approved service catalog provisioning first');
        const existing = await models.PricingPolicy.findOne({
          serviceId: service._id,
          version: 1
        })
          .session(session)
          .lean();
        if (!existing)
          await models.PricingPolicy.create(
            [
              {
                serviceId: service._id,
                version: 1,
                status: 'APPROVED',
                effectiveAt: now,
                approvedAt: now,
                approvalSource: 'USER_REQUEST_2026_10_24',
                reason:
                  'Báo giá dự kiến dùng bảng giá dịch vụ hiện tại. User xác nhận 2% mỗi bậc 5 triệu tổng đơn trước phí bậc. Chưa cộng phụ phí giống/đặc điểm nếu chưa có bảng phí được duyệt; không thu tiền qua API này.',
                billingMode: code === 'vet-escort' ? 'PER_VISIT' : 'PER_UNIT',
                unitMinutes,
                maxPets: 1,
                extraPetBps: 0,
                maxSurchargeBps: 20000,
                orderStepVnd: 5000000,
                orderStepBps: 200,
                maxOrderTierBps: 2000,
                rules: []
              }
            ],
            { session }
          );
        if (
          code === 'vet-escort' &&
          existing &&
          existing.approvalSource === 'USER_REQUEST_2026_10_24' &&
          existing.billingMode !== 'PER_VISIT'
        ) {
          const later = await models.PricingPolicy.findOne({
            serviceId: service._id,
            version: { $gt: 1 }
          })
            .session(session)
            .lean();
          if (!later) {
            const prior = { ...existing };
            delete prior._id;
            delete prior.createdAt;
            delete prior.updatedAt;
            await models.PricingPolicy.create(
              [
                {
                  ...prior,
                  version: 2,
                  billingMode: 'PER_VISIT',
                  effectiveAt: now,
                  approvedAt: now,
                  reason:
                    'Correct initial migration to preserve the approved 150,000 VND per-visit unit; appointment duration does not multiply a per-visit price.'
                }
              ],
              { session }
            );
          }
        }
        policies.push({
          service: code,
          state: existing ? 'UNCHANGED' : 'CREATED'
        });
      }
      return { policies };
    });
    console.log(JSON.stringify(result));
  } catch {
    console.error('Pricing provisioning failed; database details omitted');
    process.exitCode = 1;
  } finally {
    await connection?.close();
  }
}
