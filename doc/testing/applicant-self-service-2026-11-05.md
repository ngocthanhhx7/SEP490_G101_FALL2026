# Applicant self-service

Đăng nhập bằng tài khoản sở hữu hồ sơ (hoặc liên hệ đã xác minh khớp hồ sơ cũ chưa gắn tài khoản) mở trực tiếp `/sitter/application-status`, không yêu cầu mã hồ sơ hoặc OTP lần nữa. Sau đăng nhập, Customer có hồ sơ được đưa đến trang này; menu tài khoản có đường dẫn quay lại. Customer vẫn sử dụng chức năng khách hàng khi chờ duyệt. Guest chỉ cần đăng nhập; luồng mã/OTP cũ được giữ trong mục thu gọn cho hồ sơ không có tài khoản.

GET `/api/v1/applications/me` trả đúng hồ sơ mới nhất thuộc quyền truy cập, thông tin đã gửi, trạng thái, tiến trình và lý do từ chối công khai. Không nhận owner ID/email từ client, không đọc hồ sơ gắn với tài khoản khác chỉ vì trùng liên hệ, không đưa nội dung phỏng vấn/ghi chú nội bộ hoặc storageRef vào phản hồi. Cache private/no-store; vai trò và phiên đăng nhập kiểm tra server.

POST `/api/v1/applications/me/updates` cần CSRF, idempotency key và expectedVersion. Chỉ PENDING cho sửa tên, ngày sinh/CCCD, hình thức, kinh nghiệm, dịch vụ/khu vực và giấy tờ; email liên hệ đã xác minh giữ nguyên. Ảnh cũ giữ nguyên mà không phải tải lại; ảnh mới phải được xác minh thuộc tài khoản. Thay CCCD vẫn kiểm tra trùng hồ sơ và đủ tuổi. Không tạo thêm hồ sơ, gửi email quyết định, cấp quyền hoặc sửa hợp đồng khi chỉnh hồ sơ.

Admin bắt đầu thẩm định và ứng viên lưu bản sửa tranh chấp trên cùng state/version; chỉ một thao tác thành công. UNDER_REVIEW/INTERVIEW/APPROVED/REJECTED không sửa trực tiếp. Hồ sơ từ chối dùng quy trình nộp lại đã có; không đổi cooldown. Request mất phản hồi giữ nguyên body/key và khóa ô nhập cho tới đối soát. Original submission fingerprint vẫn giữ nguyên; chỉnh sửa dùng audit riêng.

Kiểm tra bằng synthetic fixtures, không sửa hồ sơ thật trên production. Cần kiểm tra sở hữu chéo, Guest/CSRF, ảnh khác chủ, replay/stale version, đua review-update, chuyển hướng đăng nhập và ba độ rộng giao diện. Luồng ký hợp đồng/40h–20h/tính lương giữ nguyên.
