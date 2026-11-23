import { matchPath } from 'react-router-dom';

// Matrix IDs trace compact presentation only. AppRoutes owns route guards.
const metadata = [
  ["M01","/account","Tài khoản","account","root",["CUSTOMER","PET_SITTER"]],
  ["M02","/account/settings","Liên hệ & bảo mật","account","detail",["CUSTOMER","PET_SITTER"]],
  ["M03","/account/notifications","Thông báo","account","detail",["CUSTOMER","PET_SITTER"]],
  ["M04","/customer","Trang chủ","home","root",["CUSTOMER"]],
  ["M05","/sitters","Tìm Pet Sitter","services","detail",["CUSTOMER"]],
  ["M06","/account/profile","Thông tin cá nhân","account","detail",["CUSTOMER","PET_SITTER"]],
  ["M07","/account/addresses","Địa chỉ","account","detail",["CUSTOMER"]],
  ["M08","/account/pets","Thú cưng","pets","root",["CUSTOMER"]],
  ["M09","/account/pets/:petId","Hồ sơ thú cưng","pets","detail",["CUSTOMER"]],
  ["M10","/account/bookings","Lịch hẹn","bookings","root",["CUSTOMER"]],
  ["M11","/customer/product-orders","Đơn mua hàng","account","detail",["CUSTOMER"]],
  ["M12","/account/bookings/:bookingId","Chi tiết đơn","bookings","detail",["CUSTOMER"]],
  ["M13","/account/bookings/:bookingId/visits/:visitId","Theo dõi buổi chăm sóc","bookings","detail",["CUSTOMER"]],
  ["M14","/account/bookings/:bookingId/complaints/new","Gửi khiếu nại","bookings","task",["CUSTOMER"]],
  ["M15","/account/schedule-proposals/:proposalId","Đề nghị đổi lịch","bookings","detail",["CUSTOMER"]],
  ["M16","/account/sitter-recommendations","Chọn Pet Sitter","services","detail",["CUSTOMER"]],
  ["M17","/sitter","Hôm nay","home","root",["PET_SITTER"]],
  ["M18","/sitter/profile","Hồ sơ Pet Sitter","account","detail",["PET_SITTER"]],
  ["M19","/sitter/public-profile","Hồ sơ công khai","account","detail",["PET_SITTER"]],
  ["M20","/sitter/earnings","Thu nhập","income","detail",["PET_SITTER"]],
  ["M21","/sitter/partner-earnings","Thu nhập","income","detail",["PET_SITTER"]],
  ["M22","/sitter/availability","Giờ nhận việc","schedule","detail",["PET_SITTER"]],
  ["M23","/sitter/settlements","Thu nhập","income","detail",["PET_SITTER"]],
  ["M24","/sitter/payroll","Thu nhập","income","root",["PET_SITTER"]],
  ["M25","/sitter/work-areas","Khu vực làm việc","account","detail",["PET_SITTER"]],
  ["M26","/sitter/invitations","Lời mời","offers","root",["PET_SITTER"]],
  ["M27","/visits/:visitId/incidents/new","Báo sự cố","account","task",["CUSTOMER","PET_SITTER"]],
  ["M28","/cases/:caseId","Chi tiết sự cố","account","detail",["CUSTOMER","PET_SITTER"]],
  ["M29","/incidents","Sự cố","account","detail",["CUSTOMER","PET_SITTER"]],
  ["M30","/install","Cài ứng dụng","account","task",["GUEST","CUSTOMER","PET_SITTER"]],
  ["M31","/","Trang chủ","home","root",["GUEST","CUSTOMER"]],
  ["M32","/about","Về chúng tôi","account","detail",["GUEST","CUSTOMER"]],
  ["M33","/contact","Hỗ trợ","account","detail",["GUEST","CUSTOMER"]],
  ["M34","/services","Dịch vụ","services","root",["GUEST","CUSTOMER"]],
  ["M35","/services/:serviceId","Chi tiết dịch vụ","services","detail",["GUEST","CUSTOMER"]],
  ["M36","/booking/:serviceId","Đặt dịch vụ","services","task",["CUSTOMER"]],
  ["M37","/grooming-booking","Đặt lịch grooming","services","task",["CUSTOMER"]],
  ["M38","/products","Cửa hàng","shop","root",["GUEST","CUSTOMER"]],
  ["M39","/products/:productId","Chi tiết sản phẩm","shop","detail",["GUEST","CUSTOMER"]],
  ["M40","/customer/cart","Giỏ hàng","shop","detail",["CUSTOMER"]],
  ["M41","/customer/product-checkout","Xác nhận đơn mua","shop","task",["CUSTOMER"]],
  ["M42","/service-areas","Vùng phục vụ","account","detail",["GUEST","CUSTOMER"]],
  ["M43","/sign-in","Đăng nhập","account","task",["GUEST","CUSTOMER","PET_SITTER"]],
  ["M44","/register","Tạo tài khoản","account","task",["GUEST","CUSTOMER"]],
  ["M45","/sitter/apply","Ứng tuyển Pet Sitter","account","task",["GUEST","CUSTOMER"]],
  ["M46","/sitter/application-status","Hồ sơ ứng tuyển","account","detail",["GUEST","CUSTOMER","PET_SITTER"]],
  ["M47","*","Không tìm thấy trang","account","root",["GUEST","CUSTOMER","PET_SITTER"]],
  ["M48","/policies","Chính sách","account","detail",["GUEST","CUSTOMER","PET_SITTER"]],
  ["M49","/policies/:slug","Chính sách","account","detail",["GUEST","CUSTOMER","PET_SITTER"]],
  ["M50","/policies/:slug/:version","Phiên bản chính sách","account","detail",["GUEST","CUSTOMER","PET_SITTER"]],
  ["N01","/sitter/schedule","Ca làm","schedule","root",["PET_SITTER"]],
  ["N02","/sitter/visits/:visitId","Buổi chăm sóc","schedule","task",["PET_SITTER"]],
  ["N03","/sitter/visits/:visitId/handover","Xác nhận bàn giao","schedule","task",["PET_SITTER"]],
];

export const mobileRoutes = metadata.map(([id, path, title, tab, kind, roles]) =>
  Object.freeze({ id, path, title, tab, kind, roles }));

export function mobileRoute(pathname, role) {
  if (role && !['GUEST', 'CUSTOMER', 'PET_SITTER'].includes(role)) return null;
  const match = mobileRoutes.filter(row => row.path !== '*' && matchPath(row.path, pathname))
    .sort((left, right) => Number(left.path.includes(':')) - Number(right.path.includes(':')))[0];
  // Protected routes still need the compact frame while their guard resolves or redirects.
  return match ?? mobileRoutes.find(row => row.path === '*');
}
