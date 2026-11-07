# Rà soát phân trang, thẻ sản phẩm và giỏ hàng

Mẫu đối chiếu ngày 05/11/2026:
[phân trang 2:3124](https://www.figma.com/design/MJ2YjJIKiQK9oEX7ulKFjC/SEP490_G101_FALL2026?node-id=2-3124),
[thẻ sản phẩm 2:3052](https://www.figma.com/design/MJ2YjJIKiQK9oEX7ulKFjC/SEP490_G101_FALL2026?node-id=2-3052).
Đã đọc design context và ảnh render trực tiếp bằng Figma MCP. SVG điều hướng và
thêm giỏ được tải vào assets dự án; ảnh/tên/mô tả/giá sản phẩm vẫn lấy từ MongoDB.

## Danh sách các phần phân trang cần sửa và cách xử lý

| Màn / nhóm màn | Tình trạng trước | Cách xử lý |
| --- | --- | --- |
| Sản phẩm công khai | Nút chữ Trước/Sau | Pagination chung: đầu/trước/số trang/dấu lửng/sau/cuối |
| Dịch vụ công khai | Hiện toàn bộ, chưa có phân trang | Chia 12 dịch vụ/trang sau lọc/sắp xếp, trả về trang đầu khi đổi bộ lọc |
| Admin sản phẩm | Trước/Sau chữ nhật | Pagination chung |
| Admin nhà cung cấp | Trước/Sau chữ nhật | Pagination chung |
| Admin dịch vụ và giá | Bộ nút riêng | Pagination chung, giữ chọn số dòng |
| Đơn mua sản phẩm của khách | Chỉ lấy một nhóm đơn giới hạn, không có bộ chuyển trang | API phân trang có tổng số bản ghi; Pagination chung, bảo toàn phạm vi chủ đơn |
| Admin đơn sản phẩm | Chỉ lấy một nhóm đơn giới hạn | API phân trang sau bộ lọc; giữ số đếm trạng thái toàn cục, reset trang khi đổi tab/tìm kiếm |
| Admin người dùng | Bộ nút chữ riêng | CursorPagination chung, giữ khóa khi đang tải |
| Quản lý người chăm sóc | Hai nút mũi tên riêng | CursorPagination chung, giữ tổng hồ sơ |
| Công việc trong hồ sơ người chăm sóc | Hai nút riêng | CursorPagination chung, giữ khoảng ngày |
| Hồ sơ ứng tuyển | Nút chữ riêng | CursorPagination chung |
| Duyệt hồ sơ công khai | Chỉ tiếp/đầu | CursorPagination chung, bổ sung lịch sử để quay về trang trước |
| Bảng điều phối buổi chăm sóc | Chỉ tiếp/đầu | CursorPagination chung, bổ sung lịch sử, reset khi lọc |
| Theo dõi ca di chuyển | Hai nút riêng | CursorPagination chung |
| Dashboard vận hành | Bộ nút chữ riêng | CursorPagination chung |
| Dashboard khách / lịch chăm sóc | Bộ nút chữ riêng | CursorPagination chung |
| Đơn chăm sóc của khách | Nút xem đơn cũ hơn/đầu | CursorPagination chung, bổ sung quay về trang trước |
| Địa chỉ khách hàng | Bộ nút chữ riêng | CursorPagination chung, giữ khóa khi có thao tác |
| Báo cáo/projection theo vai trò | Chỉ tiếp/đầu | CursorPagination chung, lịch sử cursor, reset khi lọc |
| Lời mời và ca đã nhận của Sitter | Hai bộ nút riêng | CursorPagination chung cho từng danh sách độc lập |
| Tạm ứng / phiếu lương / điều chỉnh của Admin và nhân viên | PayrollPager dùng mũi tên chữ | PayrollPager dùng CursorPagination chung, giữ cursor và khóa ghi |
| Duyệt tất toán | Chỉ tiếp/đầu | CursorPagination chung, bổ sung quay về trang trước |
| Thông báo, hồ sơ thú cưng | Tải thêm và nối vào danh sách | Giữ thao tác tải thêm; đây là danh sách tích lũy, không giả lập số trang |

Pagination đánh số dùng nút tròn 59 px, viền/nền trang hiện tại `#bfc4f2`, chữ
Nunito và icon Figma. Mobile giữ nút đầu/trước/trang hiện tại/sau/cuối trong vùng
hiển thị, không tràn ngang; nhãn ARIA và trạng thái disabled được giữ.
API cursor không cung cấp tổng hay cursor cuối: hiển thị trang đã đi tới,
đầu/trước/sau, không tự tạo số trang cuối hoặc truy vấn toàn bộ dữ liệu riêng tư.
Không thay đổi nghiệp vụ lương, tất toán, điều phối hay phí khi thống nhất UI.

## Giỏ hàng và thông báo bán hàng

- Header có biểu tượng giỏ cho cả khách chưa đăng nhập; route giỏ vẫn kiểm tra
  phiên và vai trò, đăng nhập xong khách quay lại giỏ. Không gọi API giỏ riêng tư
  khi chưa có phiên Customer. Badge theo giỏ đã được backend xác nhận.
- Thẻ theo bố cục Figma: ảnh lớn, tên/mô tả thật, đường nét đứt, giá và nút giỏ
  vàng. Khách chưa đăng nhập được đưa tới đăng nhập với sản phẩm đang chọn.
  Hết hàng hoặc vai trò vận hành không thể thêm. Báo kết quả sau API xác nhận;
  mất phản hồi khóa thử lại và hướng dẫn kiểm tra giỏ.
- Các lệnh giỏ phía client được xếp thứ tự để phản hồi cũ không ghi đè badge mới.
  Lệnh đang chờ không được chạy với tài khoản khác sau logout/đổi phiên.
- Đặt đơn và chuyển trạng thái/ghi nhận thanh toán tạo thông báo IN_APP cùng
  transaction. Mã sự kiện gắn với id/phiên bản đơn và người nhận nên replay không
  gửi lặp. Chỉ chủ đơn nhận cập nhật; Admin đang hoạt động nhận thông báo đơn mới.
  Không gửi SMS/email hoặc thông báo cho vai trò không được quản lý đơn.
- Link thông báo khách mở đúng đơn bằng API kiểm tra chủ sở hữu, kể cả khi đơn
  không nằm trên trang đầu. Nội dung không chứa địa chỉ, số điện thoại hay thông
  tin tài chính riêng tư ngoài mã/trạng thái đơn.

Kiểm tra bao gồm unit điều hướng/khóa, API phân trang/ownership, MongoDB replay và
rollback thông báo khi thay đổi kho hoặc ghi thông báo thất bại, hồi quy session,
và browser ở desktop/mobile. Kết quả cuối cùng cùng trạng thái review/CI/EC2 ghi
trong PR và handoff; không tạo đơn hay gửi thông báo thử vào production.
