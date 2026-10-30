# Bộ Dữ Liệu Mẫu Hà Nội

Theo yêu cầu chủ đồ án ngày 30/10/2026: 42 sitter, 21 khách hàng, 42 thú cưng
và 21 địa chỉ mẫu phân bố trong 21 khu vực vận hành Hà Nội. Tên người, kinh
nghiệm 8–36 tháng, cân nặng và nhu cầu chăm sóc đều là tình huống tổng hợp.
Tên có hậu tố `(Demo)`, tiểu sử nêu rõ hồ sơ demo. Tọa độ là tâm khu vực xấp xỉ,
không phải địa chỉ nhà riêng hay bằng chứng GPS. Mã khu vực phục vụ đồ án,
không phải danh mục hành chính pháp lý hiện hành.

Mỗi sitter có phạm vi chó/mèo và cân nặng khác nhau, tối đa 1–2 bé, chỉ nhận
chăm sóc tại nhà/dắt chó khi phù hợp. Ca 4 giờ × 5 ngày/tuần, sáng hoặc chiều,
một số làm thứ Ba–thứ Bảy. Hợp đồng PART_TIME demo dùng chính sách 3 triệu
GROSS/tháng, 20 giờ/tuần đã được duyệt; reference bắt đầu `DEMO-NOT-LEGAL`.
Các trường approved/signed/capability là trạng thái mô phỏng để diễn tập,
không phải xác nhận tuyển dụng hay hợp đồng của người thật. Lịch và điểm xuất
phát mẫu có từ 30/10 đến 28/12/2026; không tự gia hạn khi chạy lại.

Các tài khoản không có Contact/OTP/session, không có mật khẩu hay cổng đăng
nhập tắt xác minh. Email `.example` chỉ nằm trong hồ sơ ứng tuyển mẫu mã hóa;
không phát email/SMS. Điều phối viên mẫu bị LOCKED. Người dùng thật vẫn đăng
nhập theo OTP hiện hành; việc sitter demo phản hồi lời mời cần môi trường diễn
tập riêng, không thể báo là đã thực hiện dịch vụ thật.

Không tạo booking, payment, rating, visit outcome, điểm chất lượng hay mô hình
AI. Bộ dữ liệu không đủ điều kiện huấn luyện hoặc chứng minh mức hài lòng.
`synthetic` là sentinel cũ chặn toàn bộ runtime; các hồ sơ diễn tập dùng
`fixtureKey=hanoi-coursework-2026-10-30-v1:*`, tên Demo và manifest
`demopopulationruns` để phân biệt, không sửa bộ lọc quyền hay eligibility.
Không dùng các hồ sơ có fixtureKey này trong kiểm kê nhân viên thật.

## Nạp Dữ Liệu

`node scripts/deployment/provision-hanoi-demo.js` chỉ xem tổng số, không kết nối
DB. `--apply` yêu cầu `CONFIRMED_DEMO_KEY=hanoi-coursework-2026-10-30-v1` và
`CONFIRMED_DEMO_DATABASE` đúng MONGO_DB đang cấu hình. Chỉ chạy source đã được
review trên VPS, sau backup và kiểm tra restore. Cần catalog home-care/
dog-walking cùng danh mục giống chó/mèo hiện hành.

Seed dùng ID ổn định, transaction, schema validation và manifest; chạy lại trả
ALREADY_APPLIED, không ghi đè thay đổi hay tài khoản có sẵn. Trùng ID dừng cả
transaction. Khôi phục bằng backup trước seed nếu chưa có giao dịch mới;
không xóa theo tên hoặc restore đè sau khi có dữ liệu mới. Manifest ghi chính
xác collection/ID của bản ghi để đối chiếu khi cần xử lý riêng.

Kiểm thử Mongo riêng kiểm tra tính lặp lại, bảo toàn tài khoản, liên kết hồ sơ,
không tạo lịch sử giả và tìm sitter đủ điều kiện từ báo giá thật của fixture.
Kết quả local/VPS và SHA phát hành được ghi trong handoff/PR sau khi chạy.
