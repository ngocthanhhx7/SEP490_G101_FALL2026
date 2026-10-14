# P11 / WBS-053 handoff

Ngày14/10/2026. Phạm vi Email Service Integration, UC-01/02/04/05 theo P11/P01; UI_NOT_IN_SCOPE. User chọn SMTP thay Resend. Quy tắc OTP6số/5phút giữ P01; adapter không triển khai auth hoặc thay contract API.

Code owner/contributor/author/committer/push/PR dự kiến Phạm Thành Chung (Chunggrizzy11); reviewer được giao Đoàn Tiến Đạt (doantd11); merger Nguyễn Ngọc Thành (ngocthanhhx7). Danh tính thực/approval/head/merge cần đối chiếu Git và PR sau publish; bảng phân công không tự là approval.

Branch feature/wbs-053-email-service-integration; checkout D:/WW/SEP490_G101_FALL2026-p11; base798a795201c8c8cee6aca4791810ccab0d50cf72 (P02 đã merge). Giữ nguyên thay đổi checkout chính và checkout các gói khác.

IMPLEMENTED / VERIFIED cho adapter độc lập; INTEGRATION_PENDING cho provider thật và luồng OTP. Không DEPLOYED, không khẳng định inbox delivery. Mốc PR_OPEN/MERGED kiểm tra qua GitHub, không suy từ unit tests.

Tệp: email-template.service.js, email-delivery.service.js, smtp-email.service.js trong backend/src/services; tests/unit/email-delivery.service.test.js; backend/.env.example/README; [runbook](p11-email-runbook.md). P34 nhận proposal dependency exact Nodemailer10.1.1 và port injection trong runbook; manifest/lockfile/runtime/registry chưa sửa. Không chứa credential thật hoặc tệp env local trong diff.

Checks đã chạy trong checkout:

- npm ci --ignore-scripts: PASS; baseline dependencies audit0; warning upstream deprecated glob10.5.0 được giữ nguyên, không đổi dependency ngoài scope.
- npm run lint: PASS.
- npm test: PASS, 77 tests / 4 suites / 2 projects;42 case mới P11 dùng fake transport,35 baseline gồm7 integration Mongo thật cô lập. VM Modules có experimental warning.
- Negative cases: địa chỉ/header injection, wrong channel/kind/purpose, code/UUID/expiry sai, auth/invalid recipient/throttling/drop DATA, retry3attempts, expiry trong wait, timeout và late rejection, concurrent same operation/payload conflict, disabled/missing transport/config. Logger không nhận OTP/recipient/password/raw errors.
- Không có build script vì backend JS trực tiếp. SMTP thật/sandbox/UAT chưa chạy do chưa có provider config hoặc wiring; không coi mock là evidence delivery.

Nguồn đã dùng: repository AGENTS/README/CONTRIBUTING/source-code-management và P11/local master/role map/handoff; P01 domain/API/runtime ADR và P02 ports/config; official Nodemailer SMTP/message/errors liên kết trong runbook. Reports/Figma không cần bổ sung cho adapter và không sao chép dữ liệu nguồn lên repo.

Dependency mở: P06 map command server/purpose/recipient, quota/ownership; P33 outbox/durable dedup/UNCERTAIN; P34 install+audit dependency, gọi factory trước listen và compose contact/SMS ports. Owner vận hành cấp SMTP credentials/sender/sandbox qua `.env` local. Không gửi secrets vào chat/PR. Gate chưa đóng: SMTP delivery, auth end-to-end, dependency/wiring. P11 không tự triển khai các gói này.
