# ADR P01-001 — Runtime và ranh giới triển khai v1

Ngày 14/10/2026, Asia/Ho_Chi_Minh. Quyết định kỹ thuật trong P01 do Nguyễn Ngọc Thành phụ trách theo chỉ định user; reviewer Nguyễn Hữu Anh Nhật. Hiệu lực sau review/merge bản tài liệu. Không cài dependency, sinh manifest/lockfile hoặc triển khai server trong P01.

## Quyết định dùng chung

| Thành phần | Baseline được chọn | Owner triển khai |
| --- | --- | --- |
| Node.js | 24.21.0 LTS, cùng version FE tools/BE/CI | P02/P03, P34 wiring |
| Package manager | npm11.19.0, package-lock.json riêng mỗi component, npm ci khi đã có lockfile | P02/P03 |
| Frontend | React/react-dom19.3.0; Vite8.3.4; @vitejs/plugin-react6.1.2; JavaScript ESM và JSX | P03; P04 UI/tokens |
| Backend | Express5.3.0; Mongoose9.11.2; JavaScript ESM | P02 |
| Database | MongoDB8.0 release family, replica set/Atlas có multi-document transactions | P02 xác minh deployment, pin exact patch/digest ở runbook trước DB integration |
| API contract | REST /api/v1; JSON Schema draft2020-12 cho value DTO; schemaVersion1 | P01, P34 wiring |

Không đổi sang TypeScript/Next.js/SQL/microservices/native app trong từng module. P02/P03 tạo exact top-level versions từ bảng và lock transitive dependencies; không dùng @latest hoặc ^ để tự đổi baseline. MongoDB exact patch phụ thuộc deployment chưa tồn tại, được P02 ghi nhận một lần trong cùng ADR/runbook, không chọn lại release family. Nếu version không triển khai được ở host/staging, đề xuất amendment ADR có evidence và review, không âm thầm dùng version khác.

Node/npm hiện có trên máy báo v24.21.0/11.19.0. npm registry đọc bằng npm view ngày14/10: React/react-dom19.3.0; Express5.3.0 engines>=18; Mongoose9.11.2 engines>=20.19.0; Vite8.3.4 và plugin6.1.2 engines ^20.19.0 hoặc>=22.12.0; npm11.19.0 engines ^20.17.0 hoặc>=22.9.0. Node24 thỏa các engine ranges này. Đây là kiểm tra metadata/engine, chưa phải install/build/test compatibility.

## Nguồn chính thức đã đọc

Exa search báo hết free-tier rate limit; dùng công cụ web dự phòng đọc trực tiếp nguồn chính thức, không gửi tài liệu riêng tư ra search.

- [Node download](https://nodejs.org/en/download) xác nhận24.21.0 LTS tại thời điểm đọc; lựa chọn baseline không tự chạy updater.
- [Vite guide](https://vite.dev/guide/) xác nhận yêu cầu Node20.19+/22.12+; version cụ thể lấy npm view, không suy từ ví dụ @latest.
- [Express5 API](https://expressjs.com/en/5x/api/) là API family áp dụng; exact patch là snapshot npm registry.
- [Mongoose compatibility](https://mongoosejs.com/docs/compatibility.html) dùng đối chiếu MongoDB8.x và Mongoose9.x; [transactions](https://mongoosejs.com/docs/transactions.html) nêu transaction helper và không chạy thao tác song song trong cùng transaction/session.
- [MongoDB transaction considerations](https://www.mongodb.com/docs/manual/core/transactions-production-consideration/) nêu standalone không hỗ trợ multi-document transactions. P02 phải kiểm chứng topology/FCV; tài liệu này không chứng minh DB đã có.

## Atomic strategy và provider ports

Chọn Mongo multi-document transaction cho command chạm state + reservation + ledger + outbox. Dùng Mongoose Connection#transaction, session explicit, primary reads và majority writes; xử lý retry transient/unknown commit theo idempotency record. Không gọi email/SMS/payOS/storage hoặc bank trong transaction, không Promise.all trong một session. Replica set là gate thật, không thay bằng nhiều save độc lập hoặc fixture để tuyên bố atomic.

Server là nguồn auth/clock/cause/amount. Layer routes → validators/auth → controller → domain service → repositories/provider ports. Provider ports: ContactDelivery(email/SMS), PaymentGateway(createIntent/verifyCallback/reconcile), PrivateMedia(upload/read capability), NotificationDelivery, Clock và unit-of-work. Chưa chọn email/SMS/storage account; payOS chỉ payment callback/inbound collection, không tự refund/payout API. Provider timeout là pending/retry/error, không fake success.

Session contract: opaque server-side session qua Secure/HttpOnly cookie, SameSite=Lax ở same-site deployment; browser cookie mutation cần CSRF token và Origin validation. FE/BE cross-site hosting cần ADR auth amendment trước chọn SameSite=None/CORS credentials. Customer/Sitter30 ngày, Staff/Admin12 giờ là SRS baseline; TTL cleanup không thay check expiresAt/authEpoch tại mỗi request. OTP-only; không password/hash-password/reset-password model.

P02/P03 cấu hình lint/build/test thực cùng manifest; Jest/Supertest/React Testing Library theo kế hoạch nguồn, exact test-tool versions do foundation owners ghi cùng lockfile và kiểm tra Node compatibility. P01 không tạo test chỉ để chứng minh file tồn tại hoặc báo CI pass. P04 giữ tokens/assets; P34 quản lý router/providers/manifest changes sau foundation. Runtime implementation và deployment vẫn INTEGRATION_PENDING.
