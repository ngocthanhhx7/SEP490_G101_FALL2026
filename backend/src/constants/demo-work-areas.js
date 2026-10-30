// Operational demo zones, not a legal administrative-boundary registry.
export const DEMO_WORK_AREAS = Object.freeze([
  { code: 'CITY_HANOI', level: 'CITY', label: 'Hà Nội' },
  { code: 'DISTRICT_HAI_BA_TRUNG', level: 'DISTRICT', label: 'Khu vực Hai Bà Trưng', parentCode: 'CITY_HANOI' },
  ...[
    ['HOAN_KIEM', 'Hoàn Kiếm'], ['BA_DINH', 'Ba Đình'], ['DONG_DA', 'Đống Đa'],
    ['TAY_HO', 'Tây Hồ'], ['CAU_GIAY', 'Cầu Giấy'], ['THANH_XUAN', 'Thanh Xuân'],
    ['HOANG_MAI', 'Hoàng Mai'], ['LONG_BIEN', 'Long Biên'], ['HA_DONG', 'Hà Đông'],
    ['NAM_TU_LIEM', 'Nam Từ Liêm'], ['BAC_TU_LIEM', 'Bắc Từ Liêm'],
    ['GIA_LAM', 'Gia Lâm'], ['DONG_ANH', 'Đông Anh'], ['THANH_TRI', 'Thanh Trì'],
    ['HOAI_DUC', 'Hoài Đức'], ['SOC_SON', 'Sóc Sơn'], ['THANH_OAI', 'Thanh Oai'],
    ['DAN_PHUONG', 'Đan Phượng'], ['THACH_THAT', 'Thạch Thất'], ['SON_TAY', 'Sơn Tây']
  ].map(([suffix, name]) => ({ code: 'DISTRICT_'+suffix, level: 'DISTRICT', label: 'Khu vực '+name, parentCode: 'CITY_HANOI' }))
]);
