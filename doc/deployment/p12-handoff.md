# P12 / WBS-066 handoff

Ngày 14/10/2026. Phạm vi: SMS OTP Integration; UC-01/02/04/05; EXT-26; UI_NOT_IN_SCOPE. P06 sở hữu OTP generation/verification/quota/session. P01 yêu cầu phone E.164 theo quốc gia. P02 backend đã merge `798a795`; P11 email đã merge trước khi tạo nhánh P12.

Chọn eSMS làm provider nội địa ưu tiên chi phí; đơn giá chưa chốt vì cần báo giá theo nhà mạng, segment, sản lượng và thủ tục Brandname/template. eSMS yêu cầu Brandname/template được đăng ký; `RequestId` chống trùng 24 giờ. Không dùng API auto-generated OTP vì P06 quản lý mã. Adapter chuyển `operationId` thành `RequestId`, không retry timeout/ambiguous response và không khẳng định giao SMS khi eSMS trả `100`.

## Tệp và trạng thái

- Branch: `feature/wbs-066-sms-otp-integration`
- Worktree: `D:/WW/SEP490_G101_FALL2026-p12`
- `backend/src/services/sms-template.service.js`: VN mobile normalization/E.164 và template ASCII.
- `backend/src/services/sms-delivery.service.js`: eSMS HTTP adapter, timeout/rejection/rate limit/idempotency/log redaction.
- `backend/src/services/esms-sms.service.js`: config validation và `contactDelivery` override.
- `backend/tests/unit/*sms*.test.js`, `backend/tests/unit/esms-sms.service.test.js`: fake-provider tests only.
- `doc/deployment/p12-sms-runbook.md`: chọn dịch vụ, đăng ký, báo giá, cấu hình, trạng thái và nguồn.
- Runtime/manifest/lockfile/routes chưa đổi; P34 cần compose adapter với P11 theo `channel` trước listen. P06 cần tích hợp private command, resend quota và unknown outcome.

Trạng thái: **IMPLEMENTED** cho adapter độc lập; **INTEGRATION_PENDING** cho P06/P34 wiring và provider thật. Chưa tạo tài khoản, chưa nhận báo giá/credentials, chưa đăng ký Brandname/template, chưa sandbox/send thật. Không có Figma work.

## Checks

Lệnh/kết quả ghi sau khi chạy trong worktree P12. Provider tests không kết nối eSMS; không xem fake response là SMS delivery.

## Git/review

Contributor/author được giao: Nguyễn Ngọc Thành. Reviewer được giao: Phạm Thành Chung, approval phải độc lập và kiểm tra trên head hiện tại. Merger: Nguyễn Ngọc Thành sau approval/checks. Trước commit/push/PR cần xác minh GitHub session owner bằng script repository; không giả author/committer/approval.
