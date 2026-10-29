# Backend — Paw World Care

Nền Express/Mongoose ESM được khởi tạo ở P02. Node24.22.1/npm11.19.1/Express5.3.0/Mongoose9.11.2 theo [ADR P01](../doc/architecture/p01-runtime-adr-v1.md); dependency dùng phiên bản exact trong manifest/lockfile. User chọn MongoDB Atlas cho runtime, Mongo8.0 replica-set family; isolated tests dùng mongod thật8.0.34. P34 đăng ký auth/OTP khi `AUTH_ENABLED=true`; P07 cung cấp Customer registration UI và runtime REGISTER handler. Booking/payment/care và provider credentials thật vẫn chưa hoàn tất.

## Chạy và kiểm tra

Từ backend, npm ci --ignore-scripts; điền URI Atlas và MONGO_DB trong .env local rồi npm start (npm run dev cho watch). Config thiếu/sai dừng trước listen. Không commit .env hoặc bất kỳ .env.* ở bất kỳ depth nào; chỉ .env.example chứa placeholders được push. Không force-add env hoặc đưa credential thật vào example.

```powershell
npm run lint
npm run test:unit
npm run test:integration
```

GET /health chỉ liveness process/HTTP; GET /ready cần DB connected+ping,503 khi draining/mất DB. Readiness không chứng minh full provider/business flow. Auth routes chỉ mount khi được bật tường minh; REGISTER uses the transactional P07 handler when auth is enabled. Source JS không transpile nên không có build script giả. Jest ESM VM Modules có warning; integration dùng MongoDB replica set riêng, không đụng DB hiện có của user.

## Trách nhiệm

P22 exports a scoped operational board service and [visit board router](src/routes/visit-board.routes.js) for P34 composition. It uses the P21 eligibility evaluator inside the guarded mutation callback. The repository must implement the real transaction/eligibility/day guards, CAS and atomic audit/outbox; synthetic tests do not supply production storage. No global registry/runtime/manifest is changed. See [P22 handoff](../doc/deployment/p22-visit-board-handoff.md) and [integration proposal](../doc/api/p22-visit-board-integration-proposal.md).

| Đường dẫn | Nội dung |
| --- | --- |
| src/server.js, runtime.js, app.js | Startup, lifecycle và app factory; validate/connect trước listen |
| src/config/ | Env validation, Mongoose topology/connect, fail-closed ports, provider composition |
| src/routes/ | Module registry/health/auth; P16 applications and P17 catalog/price/settings exports await P34 registration; auth/OTP only mount when enabled |
| src/middlewares/ | Request ID, safe errors, session/role gates; Admin kế thừa Staff, không Customer |
| src/validators/ | Domain validator entry point; schema/object auth do modules/P01 |
| src/controllers/ | HTTP orchestration mỏng |
| src/services/providers/payos/ | payOS provider boundary and isolated webhook receipt processing; signature verification and atomic receipt/state/outbox writes use injected ports; route wiring remains separate |
| src/services/ | Health/readiness, unit-of-work, synthetic seed, P06 OTP/session/contact crypto, P07 transactional Customer registration, P10 account filters/decisions, P16 application/review and Sitter status, P17 catalog/price/settings; P11 SMTP, P12 eSMS/PHONE dispatch |
| src/models/ | P06 User/identity records, P10 account decision audit; P16 Applicant, Sitter status, private documents and audit/quota; P17 immutable service/policy, price and setting versions/audit |
| src/constants/, src/jobs/ | Placeholder cho constants/jobs thực |
| scripts/seeds/ | Admin LOCKED synthetic, unique/idempotent, không credentials/login |
| scripts/migrations/ | Placeholder; chưa rollout migration/index production |
| tests/unit/ | Controlled DB/session doubles, config/errors/ports/roles/limiter/registry |
| tests/integration/ | Isolated Mongo tests for runtime, auth/registration and P16 application lifecycle; providers use explicit test adapters |
| tests/fixtures/ | Placeholder; code tests chỉ synthetic |

The isolated payOS webhook service accepts the WBS-044 verifier and a repository port. The repository
port must deduplicate the verified receipt and atomically commit the payment or reconciliation state
together with one `PaymentVerified` or `PaymentReconciliationRequired` outbox event. A provider
`transactionDateTime` without an offset is retained as the original string until payOS timezone
semantics are confirmed; it is not converted using the host timezone.

route → middleware/validator → controller → service → model. Role gate không thay object ownership/serializer/CSRF/authEpoch server. P10 mounts `/api/v1/users` only when authentication is enabled; list/detail/decision routes require Admin and writes require CSRF. Search, role/state filters, signed cursor pagination and masked contact projections run on the server. Lock/unlock increments `authEpoch`, revokes sessions and appends an audit record in the same transaction. `AUTH_ENABLED=false`, `EMAIL_ENABLED=false` and `SMS_ENABLED=false` are defaults. When OTP is enabled without a configured provider, contact delivery remains fail-closed. Nodemailer only creates a transport after email is enabled; app startup does not send email/SMS. There is no durable outbox/business lock/financial calculation, and payment/saved state is not faked.

Seed chỉ NODE_ENV=development, ALLOW_DEV_ADMIN_SEED=true và database *_dev rồi npm run seed:admin. Mặc định false; không seed Atlas thật chỉ để kiểm tra kết nối. Fixture không active/Contact/password/OTP/session; không đóng AUTH-BOOTSTRAP Admin thật. [Runbook](../doc/deployment/p02-backend-runbook.md), [handoff](../doc/deployment/p02-handoff.md) và [P01 API](../doc/api/p01-api-permission-contract-v1.md) ghi gates và checks.

P16 keeps Sitter operational suspension separate from `User.state`, so suspension preserves authentication and history access. P21 must check `SitterStatus` before creating an offer. Private owner image upload/read is now an opt-in runtime module: it requires `AUTH_ENABLED=true` and a validated `R2_ENABLED=true` configuration, keeps objects private, verifies decoded PNG/JPEG bytes, binds retries to an owner-scoped idempotency key, and enforces a Mongo-backed per-user quota. The route admits four requests, while Sharp processing is limited to one concurrent decode; each body/output is capped at 5 MiB and decoded pixels at 4 million. It is intentionally separate from applicant documents, care evidence and public images; those workflows still require their own authorization and retention contracts. See [the R2 runbook](../doc/deployment/aws/r2-private-media.md). Admin mutation remains fail-closed until the session adapter supplies CSRF.

P11 dùng SMTP theo lựa chọn của user. [Runbook email](../doc/deployment/p11-email-runbook.md) ghi env, kết quả nội bộ, retry và giới hạn delivery. Runtime dùng Nodemailer 10.1.1; `EMAIL_ENABLED=false` giữ provider fail-closed. P12 eSMS vẫn tắt mặc định và P34 ánh xạ `PHONE` sang channel nội bộ `SMS`. Không gọi adapter trực tiếp từ endpoint public hoặc ghi command email/OTP vào log. [Handoff P11](../doc/deployment/p11-handoff.md), [handoff P12](../doc/deployment/p12-handoff.md) và [P34-A status](../doc/testing/p34-a-integration-status.md) ghi các gate còn lại.

P17's service catalog (WBS-019), service price (WBS-020), and system settings (WBS-021) modules are exported from their route files for P34 composition. P34 must provide the service existence, active-price, and catalog-visibility ports and register the modules; none changes app.js or the shared route registry. Service, policy, price, and setting changes use immutable effective-dated versions with an actor and audit record. Prices are nonnegative safe integer VND values; fractional values are rejected without a rounding calculation. Catalog visibility defaults to disabled. The catalog exports a booking snapshot for new bookings to copy and never updates existing bookings. Real booking integration remains pending.

P42 exports `createDirectedBookingProposalService` from
`src/services/booking-proposals/directed-booking-proposal.service.js` and the
Customer-only `createDirectedProposalRouter` from
`src/routes/directed-proposal.routes.js`. Proposal creation reads availability
through an injected port and stores a pending Customer confirmation; the
confirm command uses an expected version, idempotency key, expiry check and an
atomic repository command before creating a pending sitter offer. The route is
export-only so P34 can wire the real booking, payment and offer repositories;
fixtures do not prove that integration. Multi-visit prepay must report a
verified payment before the offer command is allowed.


Public contact form: `POST /api/v1/contact/messages` sends a consented request to the server-configured `CONTACT_INBOX_EMAIL`, through the existing SMTP system-email adapter. Set the real inbox in local deployment configuration and enable/configure `EMAIL_ENABLED` and SMTP. It never uses a visitor-supplied destination, sends an automatic reply or stores submissions in MongoDB. Three attempts/IP/hour and same-origin checks apply; missing configuration fails closed. A 202 response means SMTP acceptance, not guaranteed mailbox delivery. Unknown delivery outcomes are reported separately to avoid automatic resend. See `doc/deployment/public-figma-alignment-handoff.md`.

Service catalog runtime: createApp mounts the existing catalog, price and visibility modules against MongoDB. See doc/deployment/service-catalog-live-handoff.md. For the owner-authorized initial three services, run node --env-file-if-exists=.env scripts/seeds/service-catalog.js (dry run), adding --apply to provision once; later Admin changes are preserved. This offline migration does not create an Admin account.


## Đăng ký email và phiên ghi nhớ

Xem [luồng đăng ký, chính sách được duyệt và giới hạn tiếp nhận hồ sơ](../doc/testing/p34-registration-email-and-session.md). Đăng ký/đăng nhập hiện chỉ dùng OTP email; không bật SMS. Tùy chọn ghi nhớ dành cho Customer/Pet Sitter tối đa 30 ngày; đăng xuất thu hồi phiên phía server.


## Báo giá backend và gợi ý sitter

Trạng thái dữ liệu, nhãn hài lòng đã chốt và kế hoạch nối nguồn nghiệp vụ:
[AI real data 30/10/2026](../doc/testing/ai-real-data-2026-10-30.md).
Offline collection/quarantine, OSM audit và training có provenance nằm ở
[scripts/ai](scripts/ai/README.md); không chạy từ Express startup.

Bộ dữ liệu demo có tài khoản khách/sitter/Admin/Staff và trang quan sát thuật toán: [AI demo local](../doc/testing/ai-demo-accounts.md). Chạy tường minh `node scripts/demo-ai.js --apply`; database riêng, không gửi email/SMS thật.

Matching tại src/services/sitter-matching bật bằng AI_ENABLED=true (cần auth); pricing tại src/services/pricing độc lập với AI. Xem [API, MongoDB local, seeds và cách test](../doc/api/ai-pricing-matching-v1.md). Dữ liệu giống/traits do script seeds/ai.js nạp tường minh, không tự seed khi server chạy. Node 24.22.1/npm11.19.1; local Mongo8.0.34 replica-set tại27018, không ảnh hưởng Mongo8.2 tại27017.
