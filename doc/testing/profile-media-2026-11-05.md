# Avatar tài khoản, thú cưng và ảnh ứng tuyển

## Phạm vi

- Tài khoản đăng nhập tải/thay/xóa avatar ở trang tài khoản; Customer có thêm ô ảnh ở hồ sơ. Header và sidebar dùng ảnh đã lưu, có fallback khi chưa có ảnh.
- Chủ thú cưng tải/thay/xóa avatar trên chi tiết; danh sách hiển thị ảnh. Không cấp quyền đọc cho Admin hoặc người khác chỉ vì biết ID.
- Nộp hồ sơ Pet Sitter mới hoặc sửa PENDING yêu cầu đúng một `IDENTITY_FRONT`, một `IDENTITY_BACK`, một `PORTRAIT`; tối đa 5 chứng chỉ/tài liệu khác. Không dùng ảnh bổ sung thay cho ba mục này.
- Ảnh chân dung ứng tuyển không tự trở thành avatar hoặc nội dung hồ sơ sitter công khai. Hồ sơ cũ giữ nguyên `IDENTITY`, không đoán mặt ảnh hay backfill. Replay đúng nội dung nộp cũ được giữ; khi sửa phải bổ sung bộ ảnh mới.

## API và lưu trữ

`GET /api/v1/avatars/me` hoặc `/api/v1/avatars/pets/:petId` trả `{version,present}`; thêm `/content` để đọc JPEG riêng tư. `PUT` gửi PNG/JPEG nguyên bản, query `version` và `Idempotency-Key`; `DELETE` gửi JSON `expectedVersion` cùng key. Mọi lệnh cần session/CSRF. Đổi ảnh đồng thời trả 409; retry cùng bytes/key/version trả cùng kết quả nếu chưa có thao tác tiếp theo. Không tự retry lệnh mới khi mất phản hồi.

Avatar giới hạn 5 MB, 4 megapixel, một frame, giải mã và bỏ metadata, resize/crop tối đa 512 × 512, JPEG tối đa 512 KiB. Binary nằm trong `profileavatars`, tách khỏi User/Pet và DTO; xóa bỏ bytes nhưng giữ version/fingerprint. Không đổi tên collection cũ, không thêm provider hoặc sửa môi trường. Deployment index command đăng ký collection mới. Backup Mongo hiện hành bao gồm collection này.

Service kiểm tra lại User/Pet trong transaction và tăng version của hồ sơ cùng lúc thay ảnh để không ghi đè chỉnh sửa đang dùng dữ liệu cũ. Thú cưng ARCHIVED chỉ đọc ảnh lịch sử, không sửa. Không thay snapshot booking/care, tài chính, dữ liệu AI hoặc trạng thái ứng tuyển.

Tài liệu ứng tuyển tiếp tục dùng pipeline private applicant-documents/R2 và kiểm tra ownership READY hiện có. Admin reader có kiểm tra quyền/audit/quota; nhãn phân biệt rõ hai mặt và chân dung. Không kiểm tra sinh trắc học hoặc tự xác thực giấy tờ từ ảnh.

## Kiểm tra

Các test Mongo/HTTP dùng replica set và dữ liệu tổng hợp riêng: lưu/đọc/thay/xóa/replay, version race, owner/Admin/guest/CSRF, ảnh hỏng/quá pixel, hai mặt/chân dung bắt buộc và luồng ứng tuyển/duyệt hiện có. Frontend kiểm tra bộ ảnh, lỗi theo ô, thử lại cùng yêu cầu và thay identity. Chạy architecture, hai lint, toàn bộ test, build và browser ở 1440/390/320 trước phát hành; kết quả thực tế được ghi trong PR/handoff.

Browser fixture chứng minh giao diện và request contract; không thay thế ảnh CCCD thật, consent thật, Admin đánh giá thật hay chấp nhận provider bằng dữ liệu thật. Không tải ảnh/giấy tờ cá nhân lên production chỉ để tạo bằng chứng kiểm thử.
