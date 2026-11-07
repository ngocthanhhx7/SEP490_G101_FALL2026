# Quản lý sản phẩm: tổng quan và xóa có điều kiện

Theo yêu cầu bổ sung ngày 05/11/2026, Admin có thể xóa sản phẩm chưa từng có
đơn hàng, không còn tồn kho và không có hàng đang giữ. Quy tắc này bổ sung phạm vi
cũ chỉ cho phép ẩn. Mọi trạng thái đơn hàng, kể cả đã hủy/trả, đều chặn xóa.

`DELETE /api/v1/admin/products/:productId` nhận `{ version, reason }`, yêu cầu
Admin, CSRF và phiên bản chi tiết hiện tại. Lý do chuẩn hóa NFC, 20–1.000 ký tự,
không có ký tự điều khiển. Backend trả `409 PRODUCT_DELETE_BLOCKED` kèm
`hasOrders` / `hasStock` nếu không đủ điều kiện. Không thay đổi kho hay đơn hàng.

Xóa lưu `deletedAt`, `deletedBy`, `deletionReason` trong bản ghi MongoDB, đặt ẩn
và tăng cả phiên bản chi tiết/kho. Không tái sử dụng mã, không xóa lịch sử, ảnh
hay tham chiếu nhà cung cấp. Giao dịch kiểm tra lại lịch sử và ghi cùng sản phẩm
để tranh chấp với sửa thông tin, ảnh và các thao tác kho. Bản ghi đã xóa không
hiện trong danh sách hoạt động, API sửa/ảnh trả 404, khách không thể mua lại.
Ẩn vẫn giữ sản phẩm trong danh sách quản trị và không đòi hỏi xóa lịch sử.

Danh sách trả thêm `summary`: `total`, `visible`, `hidden`, `outOfStock`, đếm
toàn bộ bản ghi chưa xóa từ MongoDB, độc lập bộ lọc/phân trang. Hết hàng khi
`stockOnHand - quantityHeld <= 0`; không đặt ngưỡng tồn kho thấp tùy ý. Các số
liệu được tải lại sau thay đổi, không phải dữ liệu cố định trên frontend.

Bảng dùng toàn bộ workspace, tiêu đề cột không vỡ chữ, tên sản phẩm được xuống
dòng. Cột Hành động có Sửa/Xóa; thêm và sửa dùng Dialog chung như các màn quản
trị. Mobile cuộn bảng bên trong khung. Xác nhận xóa yêu cầu lý do; khi bị chặn
có nút Ẩn khỏi cửa hàng. Phản hồi không xác định/phiên bản cũ khóa thử lại đến
khi tải lại. Không báo thành công trước xác nhận API.

Kiểm tra tác giả: architecture, lint, build; hồi quy MongoDB cho quyền/CSRF,
lý do/phiên bản, lưu audit, chặn tồn kho/hàng giữ/đơn đã hủy, xóa tranh chấp sửa,
không tái dùng mã và thống kê độc lập bộ lọc. Kiểm tra frontend cho lý do,
xóa bị chặn -> ẩn và khóa thử lại sau mất phản hồi. Browser thật với Express,
Mongo replica set và phiên Admin tổng hợp kiểm tra ảnh, sửa, xóa/ẩn/lưu audit,
tải lại ở 1.440/390/320 px. Không dùng tài khoản/đơn hàng thật làm fixture.

Kết quả CI, review và triển khai thực tế ghi trong PR; build thành công không
thay thế kiểm chứng môi trường hay đăng nhập Admin thật trên production.
