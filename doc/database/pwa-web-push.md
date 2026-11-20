# Lưu đăng ký Web Push

Một đăng ký thuộc phiên đăng nhập tạo ra nó. Lưu một trường tùy chọn
`webPush` trong `authsessions` để dùng chung quyền sở hữu, hạn phiên, thu hồi
và TTL hiện có. Trình duyệt khác có phiên riêng. Khi cùng trình duyệt đăng ký
sau lần đăng nhập mới, endpoint chuyển sang phiên mới. Không cần collection,
mô hình snapshot hay backfill. Thông báo đã lưu trong `notifications` là nguồn
đọc duy nhất và giữ nguyên hợp đồng in-app.

- `auth_session_push_endpoint` là unique partial trên digest của endpoint.
  `auth_session_push_due` là partial cho lịch quét đăng ký hiện có.
  Hai index bỏ qua tài liệu phiên cũ thiếu trường mới. Không đổi TTL hoặc
  unique index cũ.
- Mỗi lượt worker giữ lease tối đa 2 phút trên tối đa 8 phiên. Truy vấn thông báo
  giới hạn theo người nhận, vai trò và 24 giờ, dùng index thời gian theo người
  nhận có sẵn. Mỗi phiên chỉ nhận một cảnh báo chung cho thông báo chưa đọc mới
  nhất trong đợt. Các chi tiết luôn được đọc qua màn đã đăng nhập.
- Trước khi bật, chạy provision index theo quy trình trên bản khôi phục thử và
  kiểm tra đọc/ghi, phiên hết hạn, tranh chấp endpoint và kế hoạch truy vấn.
  Khi backup và nghiệm thu đạt, cung cấp cặp VAPID cố định ngoài artifact,
  bật `WEB_PUSH_ENABLED` và kiểm thử trên iOS/Android thật. Rollback bằng
  cờ tắt hoặc release trước; phiên/TTL cũ tiếp tục chạy, trường phụ không cần
  dọn ngay. Push có thể bị thiết bị giữ hoặc chặn theo cài đặt hệ điều hành.
