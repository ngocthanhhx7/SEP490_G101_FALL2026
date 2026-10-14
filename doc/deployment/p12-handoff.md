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

Trạng thái: **VERIFIED** cho adapter độc lập và checks dưới đây; **INTEGRATION_PENDING** cho P06/P34 wiring và provider thật; **PR_OPEN** (#12), chưa có approval hoặc merge. Chưa tạo tài khoản, chưa nhận báo giá/credentials, chưa đăng ký Brandname/template, chưa sandbox/send thật. Không có Figma work.

## Checks

Checks thực tế trong worktree P12 trên Node 24.21.0/npm 11.19.0:

- `npm ci --ignore-scripts`: PASS; 469 packages audited, 0 vulnerabilities. npm in ra cảnh báo deprecated `glob@10.5.0` từ dependency nền.
- `npm run lint`: PASS.
- `npm run test:unit`: PASS; 93 tests / 6 suites.
- `npm test`: PASS; 100 tests / 7 suites / 2 projects, gồm integration Mongo cô lập. Jest in ra cảnh báo Node experimental VM Modules.
- Documentation: `git diff --cached --check` và trailing-whitespace scan PASS; eSMS signup/API/error pages và Twilio pricing page trả HTTP 200 khi kiểm tra.
- Build: N/A; backend chạy JavaScript trực tiếp và chưa có build script.
- SMS/eSMS sandbox/production: chưa chạy; các test P12 dùng fake `fetch` và không chứng minh gửi/giao SMS.

## Git/review

Contributor/author/committer: Nguyễn Ngọc Thành. Push/PR account đã kiểm tra: `ngocthanhhx7`; reviewer được giao: Phạm Thành Chung (`Chunggrizzy11`), được yêu cầu trên PR #12; approval chưa có. Merger: Nguyễn Ngọc Thành sau approval/checks. Commit `7a3caeb660efca901f38d5b5969a999c3df4b52c` trên `feature/wbs-066-sms-otp-integration`, base `develop` tại `28bf288`; PR #12 OPEN. Không giả author/committer/approval.
