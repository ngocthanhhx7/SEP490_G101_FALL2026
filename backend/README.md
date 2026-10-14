# Backend — Paw World Care

Nền Express/Mongoose ESM được khởi tạo ở P02. Node24.21.0/npm11.19.0/Express5.3.0/Mongoose9.11.2 theo [ADR P01](../doc/architecture/p01-runtime-adr-v1.md); dependency dùng phiên bản exact trong manifest/lockfile. User chọn MongoDB Atlas cho runtime, Mongo8.0 replica-set family; isolated tests dùng mongod thật8.0.34. P34 đăng ký auth/OTP khi `AUTH_ENABLED=true`; P07 cung cấp Customer registration UI và handler, nhưng REGISTER handler injection và route/session frontend wiring còn pending. Booking/payment/care và provider credentials thật vẫn chưa hoàn tất.

## Chạy và kiểm tra

Từ backend, npm ci --ignore-scripts; điền URI Atlas và MONGO_DB trong .env local rồi npm start (npm run dev cho watch). Config thiếu/sai dừng trước listen. Không commit .env hoặc bất kỳ .env.* ở bất kỳ depth nào; chỉ .env.example chứa placeholders được push. Không force-add env hoặc đưa credential thật vào example.

```powershell
npm run lint
npm run test:unit
npm run test:integration
```

GET /health chỉ liveness process/HTTP; GET /ready cần DB connected+ping,503 khi draining/mất DB. Readiness không chứng minh full provider/business flow. Auth routes chỉ mount khi được bật tường minh; REGISTER hiện fails closed nếu runtime chưa inject P07 handler. Source JS không transpile nên không có build script giả. Jest ESM VM Modules có warning; integration dùng MongoDB replica set riêng, không đụng DB hiện có của user.

## Trách nhiệm

| Đường dẫn | Nội dung |
| --- | --- |
| src/server.js, runtime.js, app.js | Startup, lifecycle và app factory; validate/connect trước listen |
| src/config/ | Env validation, Mongoose topology/connect, fail-closed ports, provider composition |
| src/routes/ | Module registry/health/auth; P16 applications and P17 catalog/price/settings exports await P34 registration; auth/OTP only mount when enabled |
| src/middlewares/ | Request ID, safe errors, session/role gates; Admin kế thừa Staff, không Customer |
| src/validators/ | Domain validator entry point; schema/object auth do modules/P01 |
| src/controllers/ | HTTP orchestration mỏng |
| src/services/ | Health/readiness, unit-of-work, synthetic seed, P06 OTP/session/contact crypto, P07 Customer registration, P16 application/review and Sitter status, P17 catalog/price/settings; P11 SMTP and P12 eSMS/PHONE dispatch |
| src/models/ | P06 User/identity records; P16 Applicant, Sitter status, private documents and audit/quota; P17 immutable service/policy, price and setting versions/audit |
| src/constants/, src/jobs/ | Placeholder cho constants/jobs thực |
| scripts/seeds/ | Admin LOCKED synthetic, unique/idempotent, không credentials/login |
| scripts/migrations/ | Placeholder; chưa rollout migration/index production |
| tests/unit/ | Controlled DB/session doubles, config/errors/ports/roles/limiter/registry |
| tests/integration/ | Isolated Mongo tests for runtime, auth/registration and P16 application lifecycle; providers use explicit test adapters |
| tests/fixtures/ | Placeholder; code tests chỉ synthetic |

route → middleware/validator → controller → service → model. Role gate không thay object ownership/serializer/CSRF/authEpoch server. `AUTH_ENABLED=false`, `EMAIL_ENABLED=false` và `SMS_ENABLED=false` là mặc định. Khi OTP bật mà thiếu cấu hình provider, contact delivery vẫn fail-closed. Nodemailer chỉ tạo transport sau khi email được bật; không gửi email/SMS trong lúc khởi tạo app. Chưa có outbox bền vững/business locks/financial calculations, không fake payment/saved state.

Seed chỉ NODE_ENV=development, ALLOW_DEV_ADMIN_SEED=true và database *_dev rồi npm run seed:admin. Mặc định false; không seed Atlas thật chỉ để kiểm tra kết nối. Fixture không active/Contact/password/OTP/session; không đóng AUTH-BOOTSTRAP Admin thật. [Runbook](../doc/deployment/p02-backend-runbook.md), [handoff](../doc/deployment/p02-handoff.md) và [P01 API](../doc/api/p01-api-permission-contract-v1.md) ghi gates và checks.

P16 keeps Sitter operational suspension separate from `User.state`, so suspension preserves authentication and history access. P21 must check `SitterStatus` before creating an offer. The P16 module factory is not registered by `app.js` yet (P34 owns registration); production also needs private-media upload/verification/read-capability adapters and the matching index migration. The current UI's 5 MB/type checks are client-side only; the media provider must enforce them server-side. Admin mutation remains fail-closed until the session adapter supplies CSRF.

P11 dùng SMTP theo lựa chọn của user. [Runbook email](../doc/deployment/p11-email-runbook.md) ghi env, kết quả nội bộ, retry và giới hạn delivery. Runtime dùng Nodemailer 10.1.1; `EMAIL_ENABLED=false` giữ provider fail-closed. P12 eSMS vẫn tắt mặc định và P34 ánh xạ `PHONE` sang channel nội bộ `SMS`. Không gọi adapter trực tiếp từ endpoint public hoặc ghi command email/OTP vào log. [Handoff P11](../doc/deployment/p11-handoff.md), [handoff P12](../doc/deployment/p12-handoff.md) và [P34-A status](../doc/testing/p34-a-integration-status.md) ghi các gate còn lại.

P17's service catalog (WBS-019), service price (WBS-020), and system settings (WBS-021) modules are exported from their route files for P34 composition. P34 must provide the service existence, active-price, and catalog-visibility ports and register the modules; none changes app.js or the shared route registry. Service, policy, price, and setting changes use immutable effective-dated versions with an actor and audit record. Prices are nonnegative safe integer VND values; fractional values are rejected without a rounding calculation. Catalog visibility defaults to disabled. The catalog exports a booking snapshot for new bookings to copy and never updates existing bookings. Real booking integration remains pending.
