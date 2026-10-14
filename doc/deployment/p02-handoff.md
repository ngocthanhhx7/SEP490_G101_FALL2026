# Bàn giao P02 / WBS-N15

Ngày14/10/2026, Asia/Ho_Chi_Minh. Owner/author/committer Nguyễn Ngọc Thành theo chỉ định user; push/PR actor ngocthanhhx7, reviewer Nhật (anhnhat432), merger Thành. Local role map/p02 prompt đổi Hải→Thành, không stage bảng danh tính/credentials. Branch feature/wbs-n15-backend-foundation, checkout D:/WW/SEP490_G101_FALL2026-p02, base ec991b0f4f65a918c512ddb72888a2d56f680dbc sau P01#7 merged.

## Phạm vi

Express/Mongoose ESM runtime: manifest/lockfile/scripts, validated config, app/registry, request ID/helmet/rate/error/session/provider middleware/ports, health routes/controllers/services, DB connect/topology/readiness/shutdown, validator entry point, transaction unit-of-work, minimum User model và synthetic seed. Seed Admin LOCKED, no Contact/password/OTP/login, dev opt-in, unique/idempotent/conflict gate. Default session/providers fail-closed, không fake payment/delivery.

User chọn MongoDB Atlas target runtime; .env local tạo URI trống và mở để user điền, never tracked. .env.example placeholders; AGENTS/.gitignore thêm chỉ example được push theo chỉ đạo user. Không tự thao tác Atlas account/user/network. Atlas smoke vẫn chờ cấu hình/kết quả thực; isolated DB test không chứng minh Atlas kết nối.

P02 khởi tạo BE manifest/registry lần đầu theo P01/P34 ownership; future domain wiring do P34. Không frontend/assets/Drive/financial flow. Root README chưa sửa để bảo toàn user changes; P34 đồng bộ trạng thái chung. Bỏ .gitkeep nơi có nội dung thực stage, giữ placeholders migrations/constants/jobs/fixtures trống. [Runbook](p02-backend-runbook.md) và [backend README](../../backend/README.md) là entry points.

## Nguồn và checks

Đọc repository README/CONTRIBUTING/source-management, P02/master/roles/delta/revised-plan/source/scope/execution/session và P01/P51 merged contracts. Official Express error handling/Mongoose connections/Mongo8.0 changelog được kiểm tra; không đọc lại Drive/legacy hoặc nguồn thú y. UI_NOT_IN_SCOPE, Figma NOT_INSPECTED, fonts/assets không sửa.

npm run lint PASS; npm test35cases PASS/3suites:28unit controlled adapters +7integration mongod thật8.0.34 riêng. Bao gồm real socket start/readiness, transaction rollback/commit, seed repeat/concurrent/no credential/unsafe conflict, standalone refusal, invalid/unreachable startup exit1 không leak, stuck request bounded shutdown, stop Mongo service→ready503/health200 và stop idempotent. YAML loader override API PASS; npm audit full/production0vulnerabilities.

Initial integration fail do hook mặc định5s timeout khi tải binary; dừng lượt đó, sửa beforeAll600s rồi rerun đầy đủ assertions thành công. Không giảm assertions hoặc thay DB mock. Mongoose returnDocument:after tránh option deprecated. Jest VM Modules warning còn có; chưa CI. npm ci reproducibility/staged/link/ignore/diff và Atlas status ghi ở PR sau checks thật.

## Gate và Git

P02 foundation IMPLEMENTED/VERIFIED cho checks nêu trên; Atlas/providers/full auth/domain flows INTEGRATION_PENDING.9FIN+8domain decisions P01 còn mở (seed không đóng AUTH-BOOTSTRAP), chưa product UAT/HA/load/deploy VERIFIED. P03/P06/P11/P12 và các modules sau dùng config/ports/app/unit-of-work theo dependency riêng; P34 tích hợp auth/serializer/readiness/domain wiring; P35 chứng minh hosting/Atlas/signals/topology. P31/32/41 không code tiền theo FIN chưa chốt.

Tại soạn bàn giao chưa commit/PR/approval/merge. Thành publish helper WBS-N15; Nhật review head cuối/session/checks thật; Thành merge sau branch protection/approval/conversations/checks/P01dependency. Git/Atlas mốc thật ghi ở PR/history và cuối phiên, không dùng status planning làm bằng chứng.
