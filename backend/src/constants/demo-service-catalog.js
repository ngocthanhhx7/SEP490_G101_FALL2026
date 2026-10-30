const both = ['DOG', 'CAT'];
const facility = ['FACILITY'];
const flexible = ['FACILITY', 'HOME'];
const rows = [
  ['pet-bathing', 'Tắm và vệ sinh thú cưng', 'Tắm bằng sữa tắm chuyên dụng, sấy khô và vệ sinh cơ bản.', 'Vệ sinh', both, facility, 100000, 'lần', 60],
  ['hair-trimming', 'Cắt tỉa lông', 'Cắt tỉa lông, tạo kiểu cơ bản và vệ sinh vùng lông cần thiết.', 'Làm đẹp', both, facility, 200000, 'lần', 90],
  ['nail-trimming', 'Cắt móng', 'Cắt móng và kiểm tra độ dài móng để hạn chế gây khó chịu khi di chuyển.', 'Làm đẹp', both, flexible, 50000, 'lần', 15],
  ['ear-eye-cleaning', 'Vệ sinh tai/mắt', 'Làm sạch vùng tai, mắt và loại bỏ chất bẩn bên ngoài một cách an toàn.', 'Vệ sinh', both, facility, 50000, 'lần', 20],
  ['coat-brushing', 'Chải lông, gỡ rối', 'Chải lông, gỡ các nút rối thông thường và loại bỏ lông rụng.', 'Làm đẹp', both, facility, 100000, 'lần', 45],
  ['pet-boarding', 'Nhà nghỉ thú cưng', 'Lưu trú, cho ăn, vệ sinh khu vực ở và theo dõi tình trạng sinh hoạt hằng ngày.', 'Lưu trú', both, facility, 250000, 'ngày', null],
  ['home-care', 'Chăm sóc tại gia', 'Nhân viên đến nhà cho ăn, thay nước, vệ sinh khu vực sinh hoạt và kiểm tra tình trạng thú cưng.', 'Chăm sóc', both, ['HOME'], 120000, 'lần', 60],
  ['dog-walking', 'Dắt chó đi dạo', 'Dắt chó đi dạo, hỗ trợ vận động và cung cấp nước khi cần thiết.', 'Chăm sóc', ['DOG'], ['OUTDOOR'], 80000, '30 phút', 30],
  ['pet-massage', 'Massage thư giãn', 'Massage nhẹ nhàng giúp thú cưng thư giãn, phù hợp với tình trạng và khả năng tiếp nhận của từng bé.', 'Chăm sóc', both, flexible, 150000, 'lần', 30],
  ['pet-transport', 'Đưa đón thú cưng', 'Đón thú cưng tại nhà và vận chuyển đến cơ sở chăm sóc hoặc đưa về nhà.', 'Vận chuyển', both, flexible, 10000, 'km', null],
  ['post-operative-care', 'Chăm sóc sau phẫu thuật', 'Hỗ trợ cho ăn, vệ sinh và theo dõi theo hướng dẫn của bác sĩ thú y.', 'Chăm sóc', both, flexible, 200000, 'lần', 60],
  ['basic-health-check', 'Kiểm tra sức khỏe cơ bản', 'Kiểm tra tổng quát ban đầu, quan sát tình trạng bên ngoài và tư vấn khi cần gặp bác sĩ thú y.', 'Chăm sóc', both, facility, 200000, 'lần', 30],
  ['basic-training', 'Huấn luyện hành vi cơ bản', 'Hướng dẫn các lệnh cơ bản như ngồi, đứng yên, đi cạnh chủ và cải thiện thói quen.', 'Huấn luyện', ['DOG'], flexible, 300000, 'tiếng', 60]
];
const locationLabels = { FACILITY: 'Tại cơ sở', HOME: 'Tại gia', OUTDOOR: 'Ngoài trời' };
export const demoCatalogKey = 'pawworld-demo-sheet-2026-10-30-v1';
export const demoServiceCatalog = Object.freeze(rows.map(([code, name, description, category, species, locations, amountVnd, unitLabel, durationMinutes]) => ({
  code, name, description, category, species, locations, amountVnd, unitLabel, durationMinutes,
  billingMode: unitLabel === 'km' ? 'PER_KM' : unitLabel === 'ngày' ? 'PER_DAY' : ['tiếng', '30 phút'].includes(unitLabel) ? 'PER_UNIT' : 'PER_VISIT',
  scope: description,
  policy: `${description}\nĐịa điểm: ${locations.map(value => locationLabels[value]).join(' / ')}. Giá cơ bản ${amountVnd.toLocaleString('vi-VN')} VND/${unitLabel}.${durationMinutes ? ` Thời lượng tham khảo: ${durationMinutes} phút.` : ''}\nPhụ phí lấy mức cao nhất trong từng nhóm lông/da, cân nặng và hành vi/sức khỏe; các nhóm cộng trên giá cơ bản. Combo giảm 1% mỗi lượt, tối đa 10% tiền dịch vụ trước phụ phí. Phí bậc giá áp dụng theo chính sách báo giá hiện hành. Chăm sóc sức khỏe không thay thế chẩn đoán hoặc điều trị của bác sĩ thú y.`
})));

export const demoTraits = [
  ['long-coat', 'Lông dài', 'COAT_SKIN', 2000], ['thick-coat', 'Lông dày', 'COAT_SKIN', 1500],
  ['tangled-coat', 'Lông rối', 'COAT_SKIN', 1500], ['fleas', 'Lông có bọ', 'COAT_SKIN', 8000],
  ['muddy-coat', 'Lông bẩn (bùn đất)', 'COAT_SKIN', 4000], ['sensitive-skin', 'Da nhạy cảm', 'COAT_SKIN', 4000],
  ['stranger-fear', 'Sợ người lạ', 'BEHAVIOUR_HEALTH', 2500],
  ['needs-extra-handler', 'Khó hợp tác, cần thêm nhân lực', 'BEHAVIOUR_HEALTH', 2000],
  ['limited-mobility', 'Hạn chế vận động / pet già', 'BEHAVIOUR_HEALTH', 2000],
  ['prescribed-medication', 'Uống thuốc theo chỉ dẫn', 'BEHAVIOUR_HEALTH', 2500]
];

export function demoPricingPolicy(item) {
  const rules = demoTraits.map(([code, label, exclusiveGroup, bps]) => ({ code, label, exclusiveGroup, bps, flatVnd: 0, scope: 'PET',
    explanation: `Nhóm ${exclusiveGroup}: chỉ áp dụng mức cao nhất trong nhóm.`, when: { traitCode: code } }));
  for (const [species, medium, large, extra] of [['DOG', 5, 15, 25], ['CAT', 4, 6, 8]]) {
    for (const [size, bps, when] of [
      ['MEDIUM', 1000, { minWeightKg: medium, maxWeightKg: large, maxWeightInclusive: true }],
      ['LARGE', 2000, { minWeightKg: large, minWeightExclusive: true, maxWeightKg: extra, maxWeightInclusive: true }],
      ['EXTRA_LARGE', 3000, { minWeightKg: extra, minWeightExclusive: true }]
    ]) rules.push({ code: `${species}_${size}`, label: 'Phụ phí cân nặng', explanation: 'Theo mốc cân nặng đã xác nhận trong sheet demo.',
      exclusiveGroup: 'WEIGHT', scope: 'PET', bps, flatVnd: 0, when: { species, ...when } });
  }
  return { billingMode: item.billingMode, unitMinutes: item.durationMinutes || 60, maxPets: 1, extraPetBps: 0,
    maxSurchargeBps: 13500, orderStepVnd: 5000000, orderStepBps: 200, maxOrderTierBps: 2000,
    groupStrategy: 'MAX', comboPerVisitBps: 100, comboMaxBps: 1000, rules };
}
