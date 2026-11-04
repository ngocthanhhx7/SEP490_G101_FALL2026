# Tích hợp cửa hàng PawWorld — 04/11/2026

## Phạm vi đã được yêu cầu

Giữ giao diện tím/vàng, Nunito/Crayon và bố cục Trang chủ hiện tại. Thay mục Câu chuyện trong header bằng Sản phẩm, bổ sung nội dung mua sắm vào Trang chủ/Giới thiệu, dùng chung vị trí giới thiệu dịch vụ cho bộ chuyển Dịch vụ/Sản phẩm. Danh sách sản phẩm, chi tiết và giỏ hàng tham khảo dự án Paw World cũ do chủ dự án cung cấp; backend mới tiếp tục quyết định tồn kho, giá và tổng tiền.

## Kế hoạch thực hiện

1. Tích hợp các commit bán hàng hiện có, giữ tác giả/lịch sử; sửa giới hạn và cạnh tranh giỏ hàng, phản hồi khác phiên, phân trang catalog. Cố định clock seed của các fixture booking để test không phụ thuộc ngày chạy.
2. Bổ sung 20 sản phẩm mẫu và 5 ảnh từ catalog cũ, lưu nguồn/hash. Không chuyển tài khoản, đơn hàng, dữ liệu khách, rating, lượt bán, lời khuyên y tế hay mã xử lý thanh toán cũ. Không tự thêm phí/giảm giá của hệ thống cũ.
3. Nâng cấp thẻ sản phẩm, vùng ảnh chi tiết, giỏ hàng và trạng thái trống/lỗi; dùng nút chuyển ở khối Trang chủ, giữ ba thẻ dịch vụ như cũ. Giao diện mới phải hoạt động với bàn phím và màn hình 320/390/1440 px.
4. Chạy architecture/lint/test/build, test hồi quy và kiểm tra browser. Reviewer độc lập kiểm tra SHA cuối trước khi merge develop và release main. Triển khai EC2 từ main đã review, backup/restore, checksum, rollback và readiness; giữ nguyên secret/database volume.

## Thiết kế

- Đối tượng: người nuôi chó/mèo muốn đặt chăm sóc hoặc mua đồ dùng trong cùng thương hiệu PawWorld.
- Màu/chữ: kế thừa token thương hiệu và Crayon cho tiêu đề, Nunito cho nội dung; không thêm font/dependency.
- Điểm thay đổi chính: bộ chọn Dịch vụ/Sản phẩm trong cùng khối nền tím, tiêu đề/nút xem tất cả và ba thẻ thay theo lựa chọn. Các phần khác giữ nhịp điệu hiện tại.
- Sản phẩm: ảnh dễ xem, tên/giá/trạng thái rõ, đường dẫn chi tiết thật; giỏ hàng có ảnh, chỉnh số lượng và tóm tắt đơn theo backend. Không thêm nhãn bán chạy hay đánh giá khi chưa có bằng chứng.
- Chuyển trạng thái nhẹ; tôn trọng reduced-motion, focus rõ và vùng chạm tối thiểu 44 px. Không thay bố cục toàn site hoặc di chuyển menu quản trị.

## Dữ liệu và nghiệm thu

Catalog kế thừa là dữ liệu mẫu do chủ dự án yêu cầu, không phải tồn kho/kiểm định hàng hóa thực. Script provisioning phải additive/idempotent và có xác nhận database trước khi apply. Bản demo hỗ trợ COD/giao hàng và trả tại quầy/nhận tại shop; online payment sản phẩm vẫn chưa hỗ trợ. Kiểm thử tổng hợp không thay cho nghiệm thu OTP/giao vận/thanh toán thực.
