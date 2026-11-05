// Owner decision confirmed 2026-11-05; capability needs do not add a fee.
export const careTraitPricingDecision = 'OWNER_CARE_TRAITS_2026_11_05_V1';
const rows = [
  ['slow-introduction', 'Cần làm quen chậm', 'Yêu cầu kỹ năng tiếp cận và làm quen; không phụ thu.'],
  ['carrier-assistance', 'Cần hỗ trợ lồng vận chuyển', 'Yêu cầu năng lực hỗ trợ lồng vận chuyển; không phụ thu.'],
  ['escape-risk', 'Cần biện pháp chống chạy thoát', 'Yêu cầu năng lực và biện pháp an toàn; không phụ thu.'],
  ['extended-play', 'Cần thêm thời gian chơi', 'Chơi cùng bé trong thời lượng dịch vụ khách đã chọn, tính theo đơn vị giá hiện hành; không tự cộng phút hoặc phụ thu đặc điểm.']
];
export const careTraitPriceRules = Object.freeze(rows.map(([code, label, explanation]) => Object.freeze({
  code, label, explanation, scope: 'PET', bps: 0, flatVnd: 0, when: Object.freeze({ traitCode: code })
})));
