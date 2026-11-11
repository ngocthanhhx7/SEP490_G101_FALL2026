# Thêm thú cưng theo từng bước

Thiết kế theo ảnh tham khảo người dùng ngày 11/11/2026 và node Figma `2:6944`
của file `MJ2YjJIKiQK9oEX7ulKFjC`. Công cụ Figma trả 403 khi đọc node;
không khẳng định đã kiểm tra những frame lân cận chưa truy cập được.
Giữ font, màu lavender/vàng và icon của Paw World Care, hỗ trợ desktop/mobile.

Luồng tạo gồm tám bước: tên/loài/giới tính → ảnh → giống/tuổi → cân nặng →
thói quen → liên hệ → sức khỏe → xem lại. Ảnh hỏi ngay sau tên và giới tính,
có xem trước cục bộ và có thể bỏ qua. Tiêu đề dùng tên bé; lựa chọn có icon,
viền/trạng thái được chọn, nút quay lại và chỉ báo tiến trình.

Sức khỏe nằm cuối phần nhập, có ba lựa chọn: tải sổ JPG/PNG/PDF, tự điền,
hoặc bổ sung sau. Tải sổ vẫn dùng consent Gemini và xác nhận từng gợi ý;
không tự lưu kết quả AI. Chưa biết/chưa cung cấp không được diễn giải thành
không dị ứng, không thuốc hay khỏe mạnh. Các giá trị đã nhập được giữ khi đổi cách điền.

Vaccine nhập từng dòng tên và ngày tiêm bằng date picker, thêm/xóa mũi,
tối đa 20 dòng và 2.000 ký tự. Ngày có thể để trống, biểu diễn “Chưa rõ ngày tiêm”.
Không đưa ra lịch tiêm, đề xuất vaccine hoặc tự suy luận ngày từ ghi chú cũ.

## Ranh giới dữ liệu, API và rollback

Đây là thay đổi trình bày trên API hiện có. Ownership vẫn ở backend Pet;
ảnh tiếp tục qua Avatar có chủ sở hữu và version riêng. Không đổi schema,
collection vật lý, index, uniqueness, TTL, serializer/backend validation.
Vaccine vẫn là `careProfile.vaccination` với status và value dạng chuỗi;
ghi chú cũ được giữ nguyên khi chỉ mở/xem, chỉ định dạng lại khi người dùng sửa.
Không migration/backfill/cutover dữ liệu, không cần dry-run chỉnh dữ liệu.
Giữ giới hạn backend: ageMonths 0–600, weightKg 0,1–150; danh mục giống/đặc điểm
do server quyết định. Không thêm query hoặc index MongoDB.

Tên/ảnh và ghi chú ở bộ nhớ của bản nháp; không lưu localStorage.
Trước xác nhận cuối không tạo hồ sơ hoặc tải ảnh lên. Khi xác nhận, tạo Pet
bằng key cố định và chờ acknowledgement hợp lệ, rồi lưu ảnh qua version/key riêng.
Mất phản hồi giữ cùng body/key; ảnh lỗi không tạo lại Pet. Ảnh đang tồn tại
ở tab khác không bị ghi đè. Nếu ảnh bị từ chối rõ ràng, có thể cập nhật sau;
kết quả chưa xác định phải thử lại cùng yêu cầu. Hủy bản nháp có xác nhận.

Phát hành theo PR/review/CI/main; build đúng SHA, backup mới và restore cách ly
trước triển khai. Rollback code về release trước không cần đảo dữ liệu.
Kiểm tra luồng desktop/mobile, validation, quay lại, vaccine nhiều mũi,
consent, create/photo retry và các màn sửa hồ sơ hiện có. Fixture và API giả
không chứng minh tích hợp provider thật; không tạo hồ sơ khách thật chỉ để smoke.
