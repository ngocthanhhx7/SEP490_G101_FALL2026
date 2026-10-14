# P02 — Backend foundation runbook

Ngày14/10/2026. Node24.21.0/npm11.19.0/Express5.3.0/Mongoose9.11.2 theo [ADR P01](../architecture/p01-runtime-adr-v1.md). User chọn MongoDB Atlas cho runtime. [P01 domain/API](../architecture/p01-domain-contract-v1.md) và [P51](../requirements/p51-financial-contract-v1.md) vẫn giữ các decision gates, chưa có luồng tài chính.

## MongoDB Atlas và cấu hình

Atlas cluster Mongo8.0 replica-set family theo ADR; database user có quyền cần thiết trong database PWC và Network Access cho máy chạy backend. Lấy driver URI mongodb+srv, URL-encode password; chỉ lưu MONGO_URI/MONGO_DB trong backend/.env cục bộ, không gửi URI/password vào chat/log/Git. P02 không tự thao tác Atlas account/user/network policies.

Chỉ .env.example được commit, chứa placeholders (kể cả cluster host/account); .env và mọi .env.* khác đều ignored tại mọi depth. Dùng .env.example làm danh sách biến, điền giá trị thật cục bộ. NODE_ENV=development, HOST=127.0.0.1, PORT=3000; MONGO_DB không là admin/local/config. Config thiếu/sai dừng exit1 trước listen; logs chỉ names fields/mã lỗi, không values.

Mongoose pool10, autoIndex=false, bufferCommands=false; startup xác minh hello.setName và buildInfo.version8.0.x. Mã lỗi DB_CONNECTION_UNAVAILABLE/DB_AUTHENTICATION_FAILED/DB_TOPOLOGY_OR_VERSION_UNSUPPORTED không lộ URI/stack. Atlas version khác baseline cần ADR amendment trước sử dụng, không bypass. Atlas patch thực được ghi sau khi kết nối được; test replica set không là bằng chứng Atlas integration.

DB test riêng pin MongoDB8.0.34, xác minh buildInfo; [official8.0 changelog](https://www.mongodb.com/docs/manual/release-notes/8.0-changelog/) là căn cứ patch. Atlas có thể dùng8.0.x do provider quản lý. Single-node test replica set không chứng minh HA/staging; không dùng dữ liệu hoặc tiến trình Mongo hiện có của user.

## Lệnh từ backend

```powershell
npm ci --ignore-scripts
npm run lint
npm run test:unit
npm run test:integration
npm start
```

npm start dùng --env-file-if-exists=.env; dev dùng Node watch. Source JavaScript ESM không transpile/build, không có pipeline giả. Windows Ctrl+C hoặc host gửi SIGINT/SIGTERM gọi runtime.stop: draining, ngừng nhận request, chờ HTTP tối đa SHUTDOWN_TIMEOUT_MS, force-close stuck sockets rồi connection. Stop idempotent; production-host signal delivery do P35 kiểm chứng, P02 test lifecycle thật.

GET /health200 chỉ liveness process/HTTP, không kiểm tra DB/provider. GET /ready cần connected Mongo+ping và không draining;503/not-ready/Cache-Control:no-store khi DB mất. Readiness này chỉ foundation, không chứng nhận OTP/payOS/email/storage. Domain routes chưa có trả404, không fake success; rate limit áp /ready/business, exempt /health cho liveness.

## Ports và an toàn

Timeout/rate/window/trust-proxy validate bounded integers. TRUST_PROXY_HOPS default0,max1; chỉ dùng1 nếu ingress thực có một trusted proxy và chặn truy cập trực tiếp. Limiter memory cho single process, multi-worker/distributed store thuộc P34/P35. JSON64KiB, Helmet, request ID(UUID input hoặc server UUID), error envelope P01; không log raw errors/body/headers/query/URI. Error sau headers abort thay chuyển secret stack cho Express default handler.

Default session null→401, providers unavailable→503. P06 thực hiện OTP/cookies/CSRF/revocation/authEpoch; middleware role Admin chỉ kế thừa Staff, không Customer identity. Role gate không thay object ownership/serializer. Registry validate cả plan trước mount, reject name/mount duplicate; core chỉ health, P34 đăng ký domain modules sau. Route→middleware/validator→controller→service→model. createUnitOfWork transaction primary/snapshot/majority, tuần tự, không external side effects trong transaction.

## Seed và tests

Seed chỉ development + ALLOW_DEV_ADMIN_SEED=true + database *_dev. npm run seed:admin tạo unique fixtureKey bằng upsert, state LOCKED, synthetic=true; không Contact/password/OTP/session/login. Repeated/concurrent runs không thêm Admin. Fixture ACTIVE hoặc không synthetic bị SEED_FIXTURE_CONFLICT, không tự promote/sửa. Mặc định seed false; không chạy seed trên Atlas thật chỉ để test kết nối. AUTH-BOOTSTRAP Admin thật vẫn mở.

Jest30.5.2/Supertest7.3.1/ESLint10.12.0 và lockfile exact. Unit adapters là doubles; integration dùng mongodb-memory-server-core11.3.0 quản lý mongod thật8.0.34, port/data tạm riêng. First-run download lớn, setup hook600s; thiếu binary/topology thì fail, không fallback mock. Cache/binaries/node_modules không track. Tests28unit+7integration bao phủ config/error/ports/roles/rate/registry, real start/ready, transaction commit/rollback, seed, standalone deny, startupfail, bounded stuck-request shutdown và DB outage.

Jest ESM cần VM Modules flag có warning, không hạ assertions/engine. Initial npm audit19moderate từ Jest→Istanbul→js-yaml3→argparse1→sprintf-js; override hẹp @istanbuljs/load-nyc-config/js-yaml4.3.2 loại dependency lỗi, YAML loader API và tests kiểm tra lại. Full/production npm audit0vulnerabilities tại phiên này; không npm audit fix --force.

Atlas chưa VERIFIED nếu .env chưa điền hoặc connection gate thất bại. Full auth/providers/migrations/finance/domain flows còn INTEGRATION_PENDING. P34 đồng bộ root README trạng thái chung khi tích hợp; P02 không ghi đè README đang sửa của user.
