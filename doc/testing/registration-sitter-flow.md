# Đăng ký và ứng tuyển Pet Sitter

Cập nhật 30/10/2026 trên `feature/login-email-sms-refresh`, cùng worktree với phần đăng nhập: `C:/Users/nguye/.codex/worktrees/login-refresh/SEP490_G101_FALL2026`. Base ban đầu: `88756f4` của develop. Remote develop đã tiến thêm trong lúc làm; cần tích hợp/review lại trước khi mở PR hoặc release. Checkout `D:/WW/SEP490_G101_FALL2026` và các sửa riêng của người dùng được giữ nguyên.

## Giao diện

Tham khảo bố cục từ các ảnh HouseBuddy người dùng cung cấp, giữ nhận diện PawWorld, PublicHeader/PublicFooter. Không sao chép logo hoặc tài nguyên HouseBuddy. Form khách hàng dùng hai cột họ tên/email trên desktop, một cột trên mobile. Phần đồng ý và liên kết chính sách được căn cùng hàng; nút vàng, ô nhập mint, lựa chọn vai trò và tiến trình tài khoản → OTP → hồ sơ.

Đăng ký khách hàng không thu thêm ngày sinh/số điện thoại chỉ để giống ảnh mẫu. Backend hiện cần họ tên, email và consent phiên bản để tạo tài khoản. Nút Đăng ký gửi OTP sau kiểm tra thông tin/consent, bỏ bước bấm trung gian. Tài khoản chỉ tạo khi xác minh thành công.

Form ứng tuyển có thông tin cá nhân, dịch vụ đọc từ catalog, khu vực làm việc, kinh nghiệm và giấy tờ. Email lấy từ liên hệ đã xác minh của chính tài khoản, không nhập thay email của người khác. Trang tra cứu hồ sơ cũng dùng header/footer công khai hiện tại.

## Luồng đã nối

1. Người mới đăng ký Customer bằng OTP email và đúng phiên bản terms/privacy. Người có tài khoản đăng nhập trước.
2. `/applications/intake` đọc email của chính tài khoản và hồ sơ đã nộp. Người có hồ sơ đang xử lý xem lại mã tra cứu, không tạo hồ sơ trùng. Bị từ chối phải chờ điều kiện nộp lại của backend.
3. Ảnh giấy tờ đi qua `/applicant-documents`: phiên đăng nhập, CSRF, quota, idempotency, giải mã và mã hóa lại ảnh trước khi tải lên private R2. JPG/PNG, tối đa 5 MB/tệp, tối đa một ảnh định danh và năm ảnh bổ sung mỗi hồ sơ. Giới hạn riêng 20 giấy tờ/tài khoản. Chưa nhận PDF; giao diện ghi rõ định dạng.
4. Nộp hồ sơ yêu cầu phiên/CSRF. Backend xác minh email thuộc chủ phiên và từng ảnh READY thuộc chủ hồ sơ, kiểm tra tuổi >= 18, trùng hồ sơ, điều kiện nộp lại và chính sách. Consent terms/privacy được kiểm tra và lưu cùng transaction. Không lưu số định danh/ngày sinh nguyên văn trong bản ghi; định danh dùng digest và giấy tờ nằm trong kho riêng tư.
5. Lỗi gửi không chắc kết quả giữ command key và những upload đã hoàn tất để thử lại. Cùng File dùng cùng khóa upload để không trừ quota lần nữa. Mở lại trang sau nộp lấy mã hồ sơ từ nguồn server theo owner, không dùng localStorage để giữ dữ liệu cá nhân.
6. Mã hồ sơ + OTP giới hạn riêng từng hồ sơ mở trạng thái đã nộp/đang xét/phỏng vấn/duyệt/từ chối. Chỉ mã hồ sơ không đủ đọc trạng thái.
7. Admin duyệt qua luồng hiện có. Hồ sơ mới gắn `ownerUserId`: nâng quyền chính tài khoản Customer đã xác minh, giữ user/contact cũ, tạo SitterStatus, tăng authEpoch và yêu cầu đăng nhập lại. Không tạo thêm user không có liên hệ đăng nhập. Hồ sơ cũ không có owner vẫn giữ hợp đồng legacy, không âm thầm chuyển liên hệ.

## Kiểm tra

- PASS: frontend 74 suites / 465 tests; backend 75 suites / 700 tests.
- PASS: lint hai package, architecture checker, frontend production build, whitespace và liên kết tài liệu mới.
- PASS: integration dùng MongoDB 8.0.34 replica set cách ly, provider tổng hợp: đăng ký và consent thực → upload ảnh thực qua sharp → nộp/replay → tra cứu OTP → Admin đọc giấy tờ và duyệt → cùng user đăng nhập với quyền PET_SITTER. Kiểm tra guest/CSRF/cross-origin, email chưa xác minh, ảnh của tài khoản khác, ảnh giả, tuổi, consent sai/thiếu và provider lỗi.
- PASS: trình duyệt qua frontend/API/Mongo cách ly: OTP đăng ký → form → tải ảnh tổng hợp → nộp → reload khôi phục mã → tra cứu OTP trả Đã nộp. Layout desktop 1440px và mobile 390/320px.
- NOT RUN: SMTP/eSMS delivery thật, private R2 thật, review/merge/deploy production. Preview dùng database tạm và transport tổng hợp; không phải bằng chứng delivery/provider thật.

Build có cảnh báo bundle > 500 kB hiện hữu. Các ảnh chụp giao diện nằm ngoài repository trong thư mục visualizations của chat.

## Bàn giao

Thay đổi chưa commit/push/PR. Khi tích hợp cần tạo index `ownerUserId` qua runbook/`ensure-indexes.js`, kiểm tra lại SHA sau tích hợp develop. Runtime chỉ mở tiếp nhận ảnh khi private R2 được cấu hình; thiếu cấu hình hiển thị chưa mở và không báo nộp thành công. Không tự bật provider, xuất bản policy hoặc thay dữ liệu production trong tác vụ này.

## Sửa sau review và cấu hình VPS (30/10/2026)

- Tách provider `applicantDocuments`, bucket `pawworldcare-applicant-documents`, collection `ApplicantDocument`/`ApplicantDocumentQuota`, object prefix `applicant-documents/` và endpoint riêng. Chỉ `SITTER_DOCUMENTS_ENABLED=true` cùng cấu hình riêng mới mở tiếp nhận. Ảnh cá nhân không được dùng làm giấy tờ, dù cùng owner. Hai endpoint chia sẻ tổng ngân sách 4 request/1 decoder mỗi connection.
- Ràng buộc pending và thời hạn nộp lại theo ownerUserId, ngoài contact/identity; unique sparse activePendingOwnerUserId chặn hai lệnh đồng thời khác email/định danh của cùng owner. Khi quyết định kết thúc hồ sơ, xóa khóa pending-owner.
- Kiểm tra production trước rollout: 0 hồ sơ, 0 hồ sơ legacy. Không có giấy tờ opaque legacy cần chuyển đổi trong lần phát hành này.
- User yêu cầu cấu hình kho riêng: CreateBucket 200, PUT/GET 200, SHA256 khớp, private/no-store, unsigned request 400, xóa object smoke 204. Unsigned400 chỉ chứng minh request thử không đọc được, không thay bằng chứng dashboard r2.dev/custom-domain. Không bật public domain hoặc lifecycle xóa theo ngày.
- Cấu hình chỉ lưu tại shared/.env VPS mode0600, backup riêng mode0600 trước sửa; container đang chạy chưa tự đổi env. Dùng lại quyền R2 server đã tồn tại cho bucket riêng, không tạo token mới hoặc cấp thêm quyền. Đây chưa phải credential mới chỉ scope bucket; nên rotate credential riêng khi có quyền quản trị Cloudflare. Không in hoặc chép secret về local.
- Bằng chứng trước tích hợp remote là lịch sử; kết quả release ghi trong PR cuối. Chưa tự coi review trước sửa là approval cho SHA sau sửa.

## Shared-bucket follow-up

Theo yêu cầu dùng chung bucket, cấu hình giấy tờ kế thừa R2_* khi không có override, vẫn yêu cầu SITTER_DOCUMENTS_ENABLED=true. Prefix private-images/ và applicant-documents/ không đổi; collection, owner checks và quota không gộp. Kiểm thử provider dùng cùng bucket cho hai prefix, chặn upload/read/sign của prefix còn lại. Runtime integration đăng ký → upload → nộp → duyệt dùng cấu hình kế thừa. Kiểm tra trước chuyển đổi trên EC2 cho thấy bucket giấy tờ cũ và ApplicantDocument đều rỗng; chưa cần di chuyển object. Đây là trạng thái trước triển khai, không phải bằng chứng smoke test sau triển khai.


## Hoàn thiện sau xét duyệt — 30/10/2026

Bản tiếp tục trên `feature/sitter-registration-completion`:

- Intake của Customer trả lý do từ chối của chính chủ và `canReapply` theo giờ server; không trả ghi chú phỏng vấn nội bộ. Chọn hồ sơ mới nhất có thứ tự `_id` khi trùng timestamp.
- Biên nhận có nút cập nhật trạng thái. Chỉ mở form mới khi server xác nhận đủ điều kiện; không dùng đồng hồ thiết bị để quyết định. Thời hạn hiển thị cả giờ Việt Nam. Tra cứu OTP có liên kết nộp lại khi đủ hạn.
- Admin nhập lý do cho cả duyệt/từ chối; thông báo phù hợp việc cấp quyền cho tài khoản đã xác minh. Nhắc điều kiện hợp đồng đã ký; phần nhắc này không phải cơ chế xác minh hợp đồng tự động hoặc bằng chứng hợp đồng thật.
- PASS: backend intake integration 9 tests, gồm chu kỳ đăng ký/upload/nộp/OTP/duyệt/đăng nhập cùng user và biên cooldown/nộp lại; frontend full 93 suites / 578 tests; architecture, lint hai package và build.
- PASS: browser fixture 1440/390/320 cho từ chối → refresh → mở form mới; không upload/mutation chỉ từ refresh, không JS error/overflow. Đã xem ảnh desktop/mobile. Browser fixture ảnh/Full-time/Part-time/14 dịch vụ/lỗi từng trường cũng đạt.
- Không gửi OTP thật, dùng giấy tờ thật, duyệt hồ sơ thật hoặc tạo hợp đồng thật trong kiểm tra này. Runtime Mongo tests dùng replica set và provider tổng hợp; browser fixture chặn API. Build vẫn có cảnh báo bundle > 500 kB.

### Lỗi transport Admin tìm thấy trong browser follow-up

Kiểm tra trình duyệt với adapter mặc định phát hiện lệnh duyệt dừng ở `CSRF_NOT_READY`: factory Admin tạo API client mà chưa nối `apiSessionAdapter.getCsrfToken`. Đã nối nguồn token phiên vào client dùng cho review/interview/decisions/sitter-status; giữ fail-closed khi token chưa có. Regression test gọi adapter production qua fetch giả, kiểm tra cả CSRF và idempotency headers; không chỉ mock hàm decide của component. Không có yêu cầu production nào được gửi khi tái hiện bằng browser fixture.

## Theo phản ánh trực tiếp của người dùng: OTP và Admin workspace

- Đối chiếu VPS: hồ sơ người dùng chỉ ra tồn tại, PENDING, có owner và tracking digest; EMAIL_ENABLED bật nhưng template hiện hành từ chối purpose APPLICATION_STATUS. Không gửi OTP thật và không xuất liên hệ/giấy tờ ra log. Sửa allowlist email/SMS cho purpose đã được OTP service hỗ trợ, giữ validation/expiry/operation-id. Integration hiện đi qua email template/delivery thật với transport SMTP giả; xác nhận mã tra cứu được render trước verify.
- Sửa link danh sách từ /admin/applications/:id sang /admin/sitter-applications/:id; giữ alias route cũ trong Admin shell. Browser mở từ tên, duyệt, mở lại link cũ và quay về danh sách đều được kiểm tra.
- Workspace tuyển dụng có thống kê toàn bộ hồ sơ theo trạng thái từ backend, bộ lọc tên/trạng thái/hình thức, thông tin dịch vụ/khu vực/ngày nộp/cập nhật, nút mở chi tiết và cursor pagination tiến/lùi. Tổng hồ sơ phù hợp không thay đổi theo cursor; thống kê tổng tách khỏi bộ lọc. Không tính tổng bằng số hàng của trang hiện tại.
- Chi tiết giữ dashboard, thêm đường quay lại danh sách, tiến trình hiện tại, ngày nộp/cập nhật và ghi chú phỏng vấn đã lưu; tài liệu riêng tư vẫn qua authorization/audit.
- Browser fixture desktop1440/mobile390/320 PASS; hình minh họa dùng dữ liệu tổng hợp, không phải số hồ sơ production. Provider delivery thật chưa được xác nhận; không gửi tin mới tự động để thử.
