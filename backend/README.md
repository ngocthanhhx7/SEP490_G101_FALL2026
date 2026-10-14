# Backend — Paw World Care

Nền Express/Mongoose ESM đã được khởi tạo P02. Node24.21.0/npm11.19.0/Express5.3.0/Mongoose9.11.2 theo [ADR P01](../doc/architecture/p01-runtime-adr-v1.md); exact packages/package-lock.json. User chọn MongoDB Atlas cho runtime, Mongo8.0 replica-set family; isolated tests dùng mongod thật8.0.34. Chưa có OTP/booking/payment/care/settlement routes hoặc provider accounts.

## Chạy và kiểm tra

Từ backend, npm ci --ignore-scripts; điền URI Atlas và MONGO_DB trong .env local rồi npm start (npm run dev cho watch). Config thiếu/sai dừng trước listen. Không commit .env hoặc bất kỳ .env.* ở bất kỳ depth nào; chỉ .env.example chứa placeholders được push. Không force-add env hoặc đưa credential thật vào example.

```powershell
npm run lint
npm run test:unit
npm run test:integration
```

GET /health chỉ liveness process/HTTP; GET /ready cần DB connected+ping,503 khi draining/mất DB. Readiness không chứng minh full provider/business flow. Core chỉ health; routes chưa triển khai404. Source JS không transpile nên không có build script giả. Jest ESM VM Modules có warning; integration lần đầu tải binary Mongo riêng, không đụng DB hiện có của user.

## Trách nhiệm

| Đường dẫn | Nội dung |
| --- | --- |
| src/server.js, runtime.js, app.js | Startup, lifecycle và app factory; validate/connect trước listen |
| src/config/ | Env validation, Mongoose topology/connect, fail-closed ports |
| src/routes/ | Module registry/health; P34 đăng ký business routes sau |
| src/middlewares/ | Request ID, safe errors, session/role gates; Admin kế thừa Staff, không Customer |
| src/validators/ | Domain validator entry point; schema/object auth do modules/P01 |
| src/controllers/ | HTTP orchestration mỏng |
| src/services/ | Health/readiness, unit-of-work, synthetic seed |
| src/models/ | Minimum User schema cho locked fixture; P06 bổ sung auth theo P01 |
| src/constants/, src/jobs/ | Placeholder cho constants/jobs thực |
| scripts/seeds/ | Admin LOCKED synthetic, unique/idempotent, không credentials/login |
| scripts/migrations/ | Placeholder; chưa rollout migration/index production |
| tests/unit/ | Controlled DB/session doubles, config/errors/ports/roles/limiter/registry |
| tests/integration/ | Real isolated Mongo smoke: start/ready/transaction/seed/shutdown/outage |
| tests/fixtures/ | Placeholder; code tests chỉ synthetic |

route → middleware/validator → controller → service → model. Role gate không thay object ownership/serializer/CSRF/authEpoch server. Default session không xác thực, providers trả503. Chưa có outbox/business locks/financial calculations, không fake payment/saved state.

Seed chỉ NODE_ENV=development, ALLOW_DEV_ADMIN_SEED=true và database *_dev rồi npm run seed:admin. Mặc định false; không seed Atlas thật chỉ để kiểm tra kết nối. Fixture không active/Contact/password/OTP/session; không đóng AUTH-BOOTSTRAP Admin thật. [Runbook](../doc/deployment/p02-backend-runbook.md), [handoff](../doc/deployment/p02-handoff.md) và [P01 API](../doc/api/p01-api-permission-contract-v1.md) ghi gates và checks.
