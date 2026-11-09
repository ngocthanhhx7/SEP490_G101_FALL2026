export const PET_CARE_LABELS = Object.freeze({ feeding: 'Thức ăn, lượng và giờ cho ăn', handling: 'Thói quen, cách tiếp cận và điều cần tránh',
  health: 'Tình trạng sức khỏe', allergies: 'Dị ứng', medication: 'Thuốc và hướng dẫn của bác sĩ thú y',
  vaccination: 'Vaccine và ngày tiêm', emergencyContact: 'Liên hệ khẩn cấp (tên, số điện thoại, quan hệ)',
  veterinaryContact: 'Phòng khám thú y (tên, số điện thoại, địa chỉ)' });
export const PET_CARE_GROUPS = Object.freeze([
  { title: 'Chăm sóc hằng ngày', hint: 'Thức ăn và cách tiếp cận quen thuộc giúp buổi chăm sóc dễ dàng hơn.', fields: ['feeding', 'handling'] },
  { title: 'Sức khỏe và lưu ý an toàn', hint: 'Chỉ ghi thông tin bạn biết. Chưa biết không đồng nghĩa với không có dị ứng hoặc rủi ro.', fields: ['health', 'allergies', 'medication', 'vaccination'] },
  { title: 'Liên hệ khi cần hỗ trợ', hint: 'Thông tin riêng tư phục vụ buổi chăm sóc và tình huống khẩn cấp.', fields: ['emergencyContact', 'veterinaryContact'] }
]);
export const petCareStatus = value => value?.status === 'KNOWN' ? value.value : value?.status === 'UNKNOWN' ? 'Chưa biết' : 'Chưa cung cấp';
export function newCustomerPet(row) {
  const careProfile = Object.fromEntries(Object.keys(PET_CARE_LABELS).map(key => [key, { status: 'NOT_PROVIDED', value: '' }]));
  return { name: '', species: 'DOG', breedCode: '', weightKg: '', ageMonths: '', sex: 'UNKNOWN', traits: [], ...row,
    ageMonths: row?.ageMonths ?? '', careProfile: { ...careProfile, ...row?.careProfile }, careNeedsConfirmed: false };
}
export function customerPetBody(draft, version) {
  return { name: draft.name.trim(), species: draft.species, breedCode: draft.breedCode, weightKg: Number(draft.weightKg),
    ...(draft.ageMonths !== '' ? { ageMonths: Number(draft.ageMonths) } : {}), sex: draft.sex, traits: draft.traits, careNeedsConfirmed: draft.careNeedsConfirmed,
    careProfile: Object.fromEntries(Object.keys(PET_CARE_LABELS).map(key => { const field = draft.careProfile[key]; return [key, field.status === 'KNOWN' ? field : { status: field.status }]; })),
    ...(version !== undefined ? { expectedVersion: version } : {}) };
}
