import { loadConfig } from '../../src/config/environment.js';
import { connectDatabase } from '../../src/config/database.js';
import { aiModels } from '../../src/ai/models.js';
import { serviceModel } from '../../src/models/service.model.js';
import { DEFAULT_WEIGHTS } from '../../src/ai/scoring.js';
const dog = [
  ['dog-mixed', 'Chó lai / chưa xác định'],
  ['dog-poodle', 'Poodle'],
  ['dog-golden', 'Golden Retriever'],
  ['dog-labrador', 'Labrador Retriever'],
  ['dog-corgi', 'Corgi'],
  ['dog-shiba', 'Shiba Inu'],
  ['dog-husky', 'Husky'],
  ['dog-samoyed', 'Samoyed'],
  ['dog-chihuahua', 'Chihuahua'],
  ['dog-pomeranian', 'Phốc sóc'],
  ['dog-beagle', 'Beagle'],
  ['dog-dachshund', 'Dachshund'],
  ['dog-bulldog', 'Bulldog'],
];
const cat = [
  ['cat-mixed', 'Mèo lai / chưa xác định'],
  ['cat-domestic-short', 'Mèo nhà lông ngắn'],
  ['cat-domestic-long', 'Mèo nhà lông dài'],
  ['cat-british-short', 'Mèo Anh lông ngắn'],
  ['cat-persian', 'Persian'],
  ['cat-ragdoll', 'Ragdoll'],
  ['cat-maine-coon', 'Maine Coon'],
  ['cat-scottish-fold', 'Scottish Fold'],
  ['cat-siamese', 'Siamese'],
  ['cat-sphynx', 'Sphynx'],
  ['cat-bengal', 'Bengal'],
];
const breeds = [
  ...dog.map(([code, name]) => ({ code, name, species: 'DOG' })),
  ...cat.map(([code, name]) => ({ code, name, species: 'CAT' })),
];
const traits = [
  {
    code: 'slow-introduction',
    label: 'Cần làm quen chậm',
    species: ['DOG', 'CAT'],
    explanation:
      'Customer xác nhận nhu cầu tiếp cận chậm; không suy ra từ giống.',
  },
  {
    code: 'extended-play',
    label: 'Cần thêm thời gian chơi',
    species: ['DOG', 'CAT'],
    explanation: 'Phải xác nhận thời lượng và giá trước khi nhận.',
  },
  {
    code: 'carrier-assistance',
    label: 'Cần hỗ trợ lồng vận chuyển',
    species: ['DOG', 'CAT'],
    explanation: 'Sitter cần có khả năng bàn giao và vận chuyển phù hợp.',
  },
  {
    code: 'escape-risk',
    label: 'Cần biện pháp chống chạy thoát',
    species: ['DOG', 'CAT'],
    explanation:
      'Customer báo cáo; cần kiểm tra năng lực, không tự chẩn đoán hành vi.',
  },
  {
    code: 'leash-handling',
    label: 'Cần kỹ năng kiểm soát dây dắt',
    species: ['DOG'],
    explanation:
      'Áp dụng theo thông tin Customer cung cấp, không áp chung cho một giống.',
  },
];
if (!process.argv.includes('--apply'))
  console.log(
    JSON.stringify({
      state: 'DRY_RUN',
      breedCount: breeds.length,
      traitCount: traits.length,
      policies:
        '3 base service estimates + 2% per full 5,000,000 VND order subtotal',
      customerPetsCreated: 0,
      sittersCreated: 0,
    })
  );
else {
  let connection;
  try {
    connection = await connectDatabase(loadConfig());
    const models = aiModels(connection),
      Service = serviceModel(connection);
    for (const model of Object.values(models)) await model.createIndexes();
    const result = await connection.transaction(async (session) => {
      for (const breed of breeds)
        await models.AiBreed.updateOne(
          { code: breed.code },
          {
            $setOnInsert: {
              ...breed,
              source:
                'PWC reference catalog, user-requested 2026-10-24; no breed-based temperament or fee inference',
              active: true,
            },
          },
          { upsert: true, session }
        );
      for (const trait of traits)
        await models.AiTrait.updateOne(
          { code: trait.code },
          { $setOnInsert: { ...trait, active: true } },
          { upsert: true, session }
        );
      const now = new Date(),
        policies = [];
      for (const [code, unitMinutes] of [
        ['home-visit', 30],
        ['dog-walking', 30],
        ['vet-escort', 60],
      ]) {
        const service = await Service.findOne({ code }).session(session).lean();
        if (!service)
          throw new Error('Run approved service catalog provisioning first');
        const existing = await models.AiPricingPolicy.findOne({
          serviceId: service._id,
          version: 1,
        })
          .session(session)
          .lean();
        if (!existing)
          await models.AiPricingPolicy.create(
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
                rules: [],
              },
            ],
            { session }
          );
        if (
          code === 'vet-escort' &&
          existing &&
          existing.approvalSource === 'USER_REQUEST_2026_10_24' &&
          existing.billingMode !== 'PER_VISIT'
        ) {
          const later = await models.AiPricingPolicy.findOne({
            serviceId: service._id,
            version: { $gt: 1 },
          })
            .session(session)
            .lean();
          if (!later) {
            const prior = { ...existing };
            delete prior._id;
            delete prior.createdAt;
            delete prior.updatedAt;
            await models.AiPricingPolicy.create(
              [
                {
                  ...prior,
                  version: 2,
                  billingMode: 'PER_VISIT',
                  effectiveAt: now,
                  approvedAt: now,
                  reason:
                    'Correct initial migration to preserve the approved 150,000 VND per-visit unit; appointment duration does not multiply a per-visit price.',
                },
              ],
              { session }
            );
          }
        }
        policies.push({
          service: code,
          state: existing ? 'UNCHANGED' : 'CREATED',
        });
      }
      await models.AiRankingPolicy.updateOne(
        { version: 1 },
        {
          $setOnInsert: {
            version: 1,
            status: 'APPROVED',
            effectiveAt: now,
            approvedAt: now,
            approvalSource: 'USER_REQUEST_2026_10_24',
            weights: DEFAULT_WEIGHTS,
            reason:
              'Triển khai bộ quy tắc 30/25/20/15/10 đã yêu cầu; chỉ đề xuất, không tự phân công hoặc quyết định tiền.',
          },
        },
        { upsert: true, session }
      );
      return {
        policies,
        breedCount: await models.AiBreed.countDocuments().session(session),
        traitCount: await models.AiTrait.countDocuments().session(session),
        customerPetsCreated: 0,
        sittersCreated: 0,
      };
    });
    console.log(JSON.stringify(result));
  } catch {
    console.error('AI provisioning failed; database details omitted');
    process.exitCode = 1;
  } finally {
    await connection?.close();
  }
}
