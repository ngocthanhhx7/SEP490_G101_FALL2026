# Bảng điều phối và các màn duyệt vận hành — 2026-11-05

## Phạm vi và kế hoạch thực hiện

Theo yêu cầu của người dùng, đồng bộ bốn màn theo các bảng quản trị hiện có: báo cáo ngắn phía trên, bảng danh sách đầy đủ chiều ngang, mở chi tiết theo dòng. Dùng ảnh mẫu làm tham khảo bố cục; không tạo thao tác gọi điện, tự đóng buổi hoặc giao người mà API chưa hỗ trợ.

1. Kiểm tra Git/PR/CI, local và VPS, giữ dữ liệu và môi trường hiện có.
2. Bổ sung các phép đọc báo cáo ở services/repository, giữ nguyên state machine và phân quyền.
3. Chuyển điều phối, duyệt hồ sơ công khai, lương và tất toán sang bảng/chi tiết.
4. Kiểm tra MongoDB thật trên replica set tổng hợp, UI/transport, responsive và các khóa nghiệp vụ; review SHA cuối, CI và phát hành reviewed main theo quy trình.

## Dữ liệu và giới hạn

- Điều phối: báo cáo ngày Việt Nam theo `startAt`, không dùng múi giờ trình duyệt. Tổng buổi, IN_PROGRESS, COMPLETED và ASSIGNED chưa check-in sau hơn 15 phút lấy từ visits. Đây là cảnh báo cần kiểm tra, không kết luận bỏ ca. Bảng hôm nay tối đa 50 buổi, công khai giới hạn và tổng; hàng đợi tối đa 50 ca sớm nhất, có thông báo nếu còn. Giữ truy vấn worker/điều kiện thanh toán, lời mời, lựa chọn của khách và yêu cầu khách xác nhận lịch mới. Theo dõi di chuyển giữ cursor riêng.
- Hồ sơ công khai: lọc trạng thái và cursor ở server. Báo cáo đếm các bản hồ sơ hiện có, không phải hồ sơ ứng tuyển hay lịch sử số lần duyệt. Chỉ lấy displayName; không lấy giấy tờ, địa chỉ riêng hoặc thông tin liên hệ. Hồ sơ đã xử lý chỉ xem, hồ sơ SUBMITTED mới có form duyệt.
- Lương: tổng phiếu gồm cả phiếu đã hủy; chờ duyệt chỉ PREPARED. Chờ chi chỉ tổng payableVnd của APPROVED, không gồm PAID. Tạm ứng chờ duyệt chỉ SUBMITTED. Vẫn giữ chuẩn bị từ hợp đồng/dữ liệu công, biểu mẫu nâng cao và in đúng phiếu được chọn. Không thay cách tính lương, thuế, bảo hiểm hay giờ làm tối thiểu FT 40/PT 20 giờ mỗi tuần.
- Tất toán: báo cáo toàn bộ request theo trạng thái; bộ lọc giao diện chỉ lọc trang đang xem và ghi rõ phạm vi. Duyệt khác ghi nhận chuyển khoản. Giữ gate chính sách/nguồn/bằng chứng; không tự chuyển tiền hoặc mở gate từ giao diện. Tiền là số nguyên VND; tổng vượt giới hạn số nguyên an toàn bị từ chối.
- Báo cáo được đọc tại thời điểm truy vấn, không phải snapshot kiểm toán liên collection hoặc số dư ngân hàng. Không có dữ liệu/đọc lỗi hiển thị dấu gạch và lỗi thay vì số 0 giả. Tên hiện tại chỉ bổ sung khi thiếu tên snapshot lương.

## Bảo toàn thao tác

Chi tiết dùng Dialog có focus containment của trình duyệt. Khi ghi đang chạy hoặc phản hồi chưa rõ (network/5xx/ack không hợp lệ), không cho sửa nội dung/đóng dialog; kiểm tra lại dùng đúng payload và idempotency key cũ. Lỗi xác định cho phép sửa hoặc tải lại phiên bản. Phân quyền và expectedVersion vẫn do backend xác nhận. Không biến retry giao diện thành bằng chứng đã trả tiền hay đã duyệt.

## Kiểm tra

Các bài tích hợp mới `backend/tests/integration/operations-workspace.test.js` chạy MongoDB replica set tổng hợp: biên ngày Việt Nam, cảnh báo trễ, báo cáo ngoài giới hạn trang, display-name allowlist, cursor ràng buộc trạng thái, phân quyền và overflow. Bộ kiểm tra UI cập nhật theo thao tác mở chi tiết, giữ kiểm tra version/key và bổ sung đóng băng quyết định không rõ kết quả. Chạy architecture, lint, các bài bị ảnh hưởng, full frontend và build trước push. Bằng chứng thực thi/review/deploy cụ thể lưu trong handoff cục bộ; không dùng dữ liệu khách hoặc quyết định tài chính thật làm fixture.
