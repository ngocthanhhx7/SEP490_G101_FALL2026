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
- Tại thời điểm hoàn tất nhánh P12, runtime/manifest/lockfile/routes chưa đổi. P34-A sau đó compose adapter với P11, đăng ký auth routes khi bật `AUTH_ENABLED`, và ánh xạ `PHONE` sang `SMS`. P06/P34 vẫn chưa có registration provisioning, OTP UI hoặc durable outbox.

Trạng thái lịch sử: **VERIFIED** cho adapter độc lập trước tích hợp. PR #12 được Chunggrizzy11 approve trên head `a5d711154ed55e90503a6f37b2e18bb63b098635`, sau đó Project Leader merge ngày 14/10/2026 với merge commit `4bb89190f9b2ff60277c4a53f55dc3cec6ddc03c`. Không tạo tài khoản, chưa nhận báo giá/credentials, chưa đăng ký Brandname/template, chưa sandbox/send thật. Không có Figma work. Trạng thái wiring/P34 hiện tại xem [P34-A integration status](../testing/p34-a-integration-status.md).

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

Contributor/author/committer: Nguyễn Ngọc Thành. Push/PR account: `ngocthanhhx7`; reviewer được giao: Phạm Thành Chung (`Chunggrizzy11`), đã approve đúng head `a5d711154ed55e90503a6f37b2e18bb63b098635`. Project Leader `ngocthanhhx7` merge PR #12 vào `develop` theo merge commit `4bb89190f9b2ff60277c4a53f55dc3cec6ddc03c`. Commit cuối `a5d711154ed55e90503a6f37b2e18bb63b098635` trên `feature/wbs-066-sms-otp-integration`; PR #12 MERGED. Không giả author/committer/approval.
