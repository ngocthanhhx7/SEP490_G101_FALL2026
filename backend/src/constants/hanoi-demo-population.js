// Approximate public neighbourhood centres, never private home locations.
export const HANOI_DEMO_KEY = 'hanoi-coursework-2026-10-30-v1';
export const hanoiDemoZones = [
  ['HAI_BA_TRUNG', 'Bách Khoa', 105.846, 21.006], ['HOAN_KIEM', 'Tràng Tiền', 105.855, 21.025],
  ['BA_DINH', 'Liễu Giai', 105.817, 21.035], ['DONG_DA', 'Láng Hạ', 105.815, 21.016],
  ['TAY_HO', 'Quảng An', 105.826, 21.060], ['CAU_GIAY', 'Dịch Vọng', 105.793, 21.036],
  ['THANH_XUAN', 'Nhân Chính', 105.807, 21.004], ['HOANG_MAI', 'Tân Mai', 105.851, 20.983],
  ['LONG_BIEN', 'Ngọc Lâm', 105.871, 21.045], ['HA_DONG', 'Văn Quán', 105.786, 20.980],
  ['NAM_TU_LIEM', 'Mỹ Đình', 105.773, 21.028], ['BAC_TU_LIEM', 'Cổ Nhuế', 105.782, 21.066],
  ['GIA_LAM', 'Trâu Quỳ', 105.936, 21.019], ['DONG_ANH', 'Uy Nỗ', 105.849, 21.139],
  ['THANH_TRI', 'Tứ Hiệp', 105.844, 20.947], ['HOAI_DUC', 'An Khánh', 105.727, 20.997],
  ['SOC_SON', 'Sóc Sơn', 105.849, 21.257], ['THANH_OAI', 'Kim Bài', 105.765, 20.853],
  ['DAN_PHUONG', 'Phùng', 105.663, 21.088], ['THACH_THAT', 'Liên Quan', 105.580, 21.055],
  ['SON_TAY', 'Sơn Tây', 105.505, 21.139]
].map(([suffix, neighbourhood, lng, lat]) => ({ areaCode: 'DISTRICT_'+suffix, neighbourhood, coordinates: [lng, lat] }));

export const demoSitterNames = [
  'Nguyễn Thu Hà', 'Trần Minh Đức', 'Lê Ngọc Anh', 'Phạm Hoàng Nam', 'Vũ Thùy Linh', 'Đỗ Quang Huy',
  'Bùi Phương Mai', 'Nguyễn Đức Anh', 'Trần Khánh Linh', 'Lê Tuấn Minh', 'Phạm Thanh Hương', 'Đặng Hải Sơn',
  'Hoàng Yến Nhi', 'Nguyễn Việt Long', 'Vũ Lan Anh', 'Trần Thành Đạt', 'Đỗ Minh Ngọc', 'Bùi Anh Tuấn',
  'Lê Phương Thảo', 'Nguyễn Quốc Bảo', 'Phạm Bảo Trâm', 'Trần Gia Huy', 'Ngô Hà My', 'Vũ Đức Duy',
  'Nguyễn Mai Chi', 'Lê Nhật Nam', 'Trần Hồng Nhung', 'Phạm Quang Minh', 'Đỗ Ngọc Diệp', 'Bùi Văn An',
  'Hoàng Thu Trang', 'Nguyễn Hoài Phong', 'Trần Ngọc Hân', 'Lê Đức Thành', 'Vũ Minh Tâm', 'Phạm Tiến Dũng',
  'Nguyễn Khánh Vy', 'Đỗ Anh Khoa', 'Bùi Thanh Trúc', 'Trần Duy Khánh', 'Lê Hải Yến', 'Ngô Minh Hiếu'
];
export const demoCustomerNames = [
  'Nguyễn Minh Châu', 'Trần Quốc Khánh', 'Phạm Ngọc Lan', 'Lê Hoàng Phúc', 'Vũ Hồng Hạnh', 'Đỗ Tuấn Anh',
  'Bùi Thanh Mai', 'Hoàng Đức Thắng', 'Nguyễn Phương Linh', 'Trần Hải Đăng', 'Phạm Thùy Dương', 'Lê Quang Vinh',
  'Đặng Bảo Ngọc', 'Ngô Thành Trung', 'Vũ Thu Hiền', 'Đỗ Minh Quân', 'Nguyễn Khánh An', 'Trần Tiến Đạt',
  'Bùi Như Quỳnh', 'Hoàng Anh Dũng', 'Lê Mai Phương'
];
