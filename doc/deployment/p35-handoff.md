# P35-A — Handoff

- Task: staging deployment và operational runbook; nền/cross-cut, không gán UC
  mới. Bao phủ vận hành các EXT-PREPAY/SETTLEMENT/PWA/PERF/POLICY qua dependency.
- Contributor/author/committer được giao: Đặng Văn Hải (`Haidvhe181849`). Reviewer
  được giao Đoàn Tiến Đạt (`doantd11`); merger Nguyễn Ngọc Thành (`ngocthanhhx7`).
  Phân công này chưa phải approval hoặc merge. Xem PR để biết actor/SHA thực tế.
- Branch: `feature/p35-a-staging-deployment-and-operational-runbook`; isolated
  synced head `c460d16`, merged from `origin/develop` `90ad3c7`. The original
  checkout at `D:/WW/SEP490_G101_FALL2026-p35` remains separate and dirty; do not
  use it for release or cleanup operations.
- Trạng thái: công cụ/tài liệu triển khai đã chuẩn bị; staging **INTEGRATION_PENDING**.
  Không có bằng chứng deploy/UAT/production. UI_NOT_IN_SCOPE, không claim Figma.

## Phạm vi hoàn thành

Runbook hướng Vercel frontend + Render Node backend + Atlas theo screenshot người
dùng, cổng tích hợp, env preflight, proxy/HTTPS/CORS/CSRF gates, upload/payOS,
health, job recovery, private logs, backup/restore và rollback. Verification record
giữ rõ các case chưa chạy. Không sửa router, manifests/lockfile hoặc DTO/schema;
P34 nhận proposal reverse proxy/public-origin/cache từ runbook.

`backend/src/config/staging-preflight.js` tái dùng validator runtime; CLI tại
`backend/scripts/deployment/` chỉ kiểm tra offline, không connect/send/start.
Tests negative kiểm tra TLS/seed/secret separation/provider/DB namespace và
không xuất giá trị cấu hình. Các secret trong test là synthetic, không dùng deploy.
Không sửa checkout chính đang có công việc gói khác.

## Nguồn và quyết định

Đã đọc yêu cầu P35/prompt nền, mapping và dependency, delta/crosswalk, quy ước Git,
ADR P01, source runtime/env/session/ports, P34 status, P23/P31/P33 handoff và tài
liệu chính thức hosting được dẫn ở runbook. Không khẳng định đã đọc/cập nhật
reports Drive hoặc xem Figma. PWC hosting URL/domain và public-origin contract,
Admin bootstrap, private storage/retention, provider credentials, FIN details,
RPO/RTO và chi phí/scheduler vẫn cần owner chốt; không tự đưa mặc định nghiệp vụ.

## Checks thực tế

- Node 24.21.0 / npm 11.19.0 đã xác minh.
- Backend `npm run lint` trên head `c460d16`: PASS.
- Backend `npm test -- --runInBand` trên head `c460d16`: 59 suites / 559 tests PASS.
- Bộ preflight hiện có 24 tests PASS, gồm subprocess CLI exit 0/1, TLS,
  standard multi-host URI, secrets/seed/namespace/provider và SMS sandbox.
- 19 Markdown local links trong tài liệu P35: PASS; `git diff --check`: PASS.
- Ignore `.env`, env staging, IDE và cấu hình AI cục bộ: PASS.
- Staging/provider/load/UAT, two-replica Mongo jobs, backup/restore/rollback:
  NOT RUN vì final gate, deployment và inputs còn thiếu. Không có CI được claim.

Lượt test đầu phát hiện WHATWG URL không hỗ trợ MongoDB multi-host URI. Đã sửa
dùng parser MongoDB hiện có qua Mongoose (không gọi connect), giữ case regression.

## Dependency và bước tiếp

P34 hoàn thành final wiring/tests trên SHA release, gồm same-origin proxy Host/
Origin/CSRF/limiter/cache và migration/index/job/lease/outbox thật. P31 cung cấp
route webhook thực; P06/P07/P09/P10/P13/P25/P33/P42/P43/P44/P45/P46/P47 và các
luồng tài chính hoàn tất gate theo P35. Leader chốt hosting/access/domain/DB và
inputs vận hành rồi thực hiện ma trận staging, restore và rollback. Production
chỉ sau UAT duyệt. Thiếu các deliverable này chặn approval/merge toàn gói P35;
không chuyển draft thành ready hoặc gọi approval để che gate còn mở.
