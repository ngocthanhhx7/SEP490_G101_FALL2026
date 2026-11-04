// Supplier Management (R3 UC-69). Limits that R3 does not state were approved as technical limits (like D-216/D-242).
export const SUPPLIER_STATUSES = Object.freeze(['ACTIVE', 'STOPPED']);
// The tabs of the screen: Đang hợp tác, Ngừng hợp tác, Tất cả.
export const SUPPLIER_TABS = Object.freeze(['ACTIVE', 'STOPPED', 'ALL']);
export const SUPPLIER_LIMITS = Object.freeze({ nameMax: 200, contactNameMax: 100, emailMax: 254, productsMax: 200 });
