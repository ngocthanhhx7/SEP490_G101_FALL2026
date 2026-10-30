export const leashHandlingPriceRule = Object.freeze({
  code: 'leash-handling', label: 'Kỹ năng kiểm soát dây dắt', scope: 'PET', bps: 0, flatVnd: 0,
  explanation: 'Chỉ xét năng lực người chăm sóc, không phụ thu theo quyết định chủ dự án ngày 30/10/2026.',
  when: Object.freeze({ traitCode: 'leash-handling', species: 'DOG' })
});
