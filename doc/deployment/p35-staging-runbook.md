# P35 — Staging deployment runbook

Ngày lập: 15/10/2026, giờ Việt Nam (`Asia/Ho_Chi_Minh`). **INTEGRATION_PENDING**.
Ảnh người dùng cung cấp cho thấy đang cấu hình frontend Vercel và có workspace
Render; service `smartlearn-backend` trong ảnh thuộc dự án khác, không chứng minh
Paw World Care đã deploy. Hướng chuẩn bị là Vercel + Render + MongoDB Atlas.
Chưa có URL/service/domain PWC được xác minh hoặc quyền hosting trong phiên này.

## Cổng trước triển khai

Chỉ deploy staging sau final integration P34 và các dependency P07/P09/P10/P13/
P25/P33/P42/P43/P44/P45/P46/P47 đạt trên cùng release SHA. Xem
[P34 status](../testing/p34-a-integration-status.md): các mini-gate trước đây
không đóng final gate. P31/P32/P41 và các quyết định tài chính còn mở cũng chặn
luồng phụ thuộc. Production cần UAT được chấp thuận, PR release và Leader merge;
không tự quảng bá staging hoặc `develop` thành production.

Trước khi bấm Create/Deploy, ghi release SHA, người trực, môi trường, DB riêng,
backup đã kiểm tra, phiên bản trước để rollback và bằng chứng trong
[verification](p35-verification.md). Chọn staging riêng; chữ `Production` mặc
định của dashboard provider không phải phê duyệt production của sản phẩm.
Tắt auto-deploy và PR preview có secrets trước khi tích hợp Git để push/PR
không tự đưa bản chưa qua gate lên mạng. Lần Create đầu có thể deploy ngay.

## Cấu hình dashboard

| Mục | Vercel frontend | Render backend (service mới của PWC) |
| --- | --- | --- |
| Root Directory | `frontend` rồi Continue | `backend` |
| Framework/runtime | Vite | Node |
| Install/build | Install `npm ci --ignore-scripts`; build `npm run build` | Build `npm ci --omit=dev --ignore-scripts` |
| Output / start | `dist` | `npm start` |
| Branch | Chỉ release SHA đã qua gate; chọn nhánh staging rõ ràng | `develop`, deploy thủ công đúng SHA đã qua gate |
| Runtime | Node 24.x; kiểm tra patch build so với ADR | `NODE_VERSION=24.21.0` |
| Package manager | Kiểm tra `npm --version` = `11.19.0` | Kiểm tra `npm --version` = `11.19.0` |
| Health check | Kiểm tra deep link và API proxy | `/ready` |

Runtime pin theo [ADR](../architecture/p01-runtime-adr-v1.md) và manifest hiện có.
Nếu provider không hỗ trợ exact runtime/npm, ghi build log đã lược secret và gửi
amendment cho P01/P34; không âm thầm sửa lockfile hoặc bỏ engine check.
Vite preview không phải máy chủ backend. Không đặt Mongo/OTP/SMTP/SMS/payOS secret
vào Vercel frontend hoặc biến `VITE_*`; client hiện không đọc `VITE_API_URL`.

## HTTPS, proxy, cookie và CORS

Client hiện gọi `/api/v1` với `credentials: same-origin`; cookie HttpOnly,
Secure trong `NODE_ENV=production`, SameSite=Lax, path `/`, không Domain.
Đề xuất giữ browser cùng origin bằng reverse proxy Vercel → Render. Cần P34
đánh giá proxy headers, cache và Origin trước khi bật auth. Trỏ trực tiếp browser
từ `*.vercel.app` sang `*.onrender.com` chưa đáp ứng hợp đồng hiện tại; đổi
SameSite=None/credentials/CORS cần amendment DEPLOY-AUTH.

Trên Vercel cần routing theo thứ tự: `/api/:path*` đến backend giữ nguyên `/api`,
`/health` và `/ready` đến backend, sau đó static assets và SPA fallback. Tệp
`vercel.json` nằm trong `frontend` vì đó là root app đã chọn. Cấu hình mẫu để
P34 điền URL thật và kiểm chứng (chưa cài vào frontend, chưa kích hoạt):

```json
{
  "rewrites": [
    { "source": "/api/:path*", "destination": "https://pwc-backend.example.invalid/api/:path*" },
    { "source": "/health", "destination": "https://pwc-backend.example.invalid/health" },
    { "source": "/ready", "destination": "https://pwc-backend.example.invalid/ready" },
    { "source": "/((?!api(?:/|$)|assets(?:/|$)|fonts(?:/|$)|health$|ready$).*)", "destination": "/index.html" }
  ]
}
```

Không copy nguyên placeholder để deploy. Đường API lạ phải giữ JSON 404 từ
backend, không nhận index.html/200. Xác minh assets, manifest và service worker
đúng MIME; thiếu asset không được trả HTML. HTTPS certificate phải hợp lệ cả
public frontend và upstream; HTTP chuyển HTTPS, không tắt TLS verification.

Hiện `requireCsrf` so sánh Origin với `req.protocol://req.get('host')`, không dùng
X-Forwarded-Host. Proxy ngoài có thể đổi Host thành Render và làm mutation bị
403 dù cookie đã nhận. Không coi rewrite GET thành bằng chứng auth. P34 cần chốt
public-origin validation tin cậy và cơ chế chặn giả mạo proxy, đo đường đi header
thật. `TRUST_PROXY_HOPS` chỉ hỗ trợ 0 hoặc 1; không tự dùng `2`/trust all để vượt
validation khi có hai tầng proxy. Kiểm tra direct-origin bypass và spoofed
forwarded headers trước khi nghiệm thu limiter/IP/CSRF. Không log cookies.

Cùng origin không cần mở CORS cho browser. Kiểm tra origin lạ không được cấp
`Access-Control-Allow-Origin`/credentials, mutation có cookie nhưng thiếu/sai
CSRF/Origin bị 403. CORS không thay auth, quyền object hoặc webhook signature.
Nếu dùng proxy, API/session/payment/upload phải `Cache-Control: private, no-store`
và không có CDN/SW cache hit chứa PII. Đây là gate P34 cần kiểm chứng, chưa phải
header được P35 cài sẵn.

## Environment và database

Trong secret store backend, dùng tên biến từ [example](../../backend/.env.example).
Không in giá trị, `printenv`, URI có credential hoặc chụp màn hình secrets.

| Biến | Cấu hình staging |
| --- | --- |
| `NODE_ENV` | `production` để Secure cookie; không dùng `staging` vì runtime từ chối |
| `HOST`, `PORT` | `0.0.0.0`; dùng PORT provider cấp (thường 10000) |
| `MONGO_URI` | Atlas MongoDB 8.0.x replica set, TLS và certificate hợp lệ |
| `MONGO_DB` | DB riêng kết thúc `_staging`; tài khoản chỉ có quyền cần thiết trên DB này |
| `ALLOW_DEV_ADMIN_SEED` | `false`; seed hiện tạo Admin synthetic LOCKED, không bootstrap Admin staging |
| `AUTH_ENABLED` | `true` khi wiring/secret/provider đã sẵn sàng |
| Auth keys | 5 key riêng: OTP_HMAC_SECRET, SESSION_TOKEN_SECRET, SESSION_CSRF_SECRET, CONTACT_LOOKUP_SECRET (>=32 bytes); CONTACT_ENCRYPTION_KEY đúng 32 UTF-8 bytes |
| `EMAIL_ENABLED`, `SMS_ENABLED` | Bật theo provider đã xác minh; cấu hình SMTP/eSMS theo runbook; không coi sandbox là gửi thật |
| `ESMS_SANDBOX` | `false` khi bật SMS; vẫn cần đích synthetic được ủy quyền |
| Timeouts/limiter/proxy | Dùng config hiện có; đo health frequency và proxy trước khi chốt |

Từ `backend/`, với env riêng đã nạp an toàn:

```powershell
node --env-file-if-exists=.env scripts/deployment/staging-preflight.js
```

Exit 0 chỉ `CONFIG_VALIDATED/OFFLINE_ONLY`, không kiểm tra kết nối, tài khoản,
entropy key, nguồn secrets, schema/index, provider, proxy hoặc release gate.
Exit 1 trả tên field lỗi; không truyền secret qua command arguments. Chạy lại
sau đổi env. Đừng dùng test fixture keys trong hosting. Rotation encryption/
lookup keys cần migration/dual-read do P01/P06 chốt; giữ key cũ cho dữ liệu và
backup cần đọc, không xóa hoặc thay toàn bộ key tùy tiện.

Atlas: giới hạn network access theo egress thực của host; không mở mọi IP cho
tiện. Xác minh version/topology, ping và transaction thật; startup đã từ chối
không phải replica set/8.0.x. `autoIndex:false`: P01/P34 phải áp dụng và xác minh
unique/idempotency/TTL/query indexes qua migration được review trước nhận traffic.
Chưa có lệnh migration production được cung cấp; không dùng syncIndexes tự động.

## Upload và payOS

`privateMedia` hiện mặc định fail-closed. Chọn storage/private bucket, retention,
quota và quyền trước khi bật. Không lưu ảnh trên disk tạm Render. Adapter phải
kiểm tra dung lượng/type/content server-side, ownership và cửa sổ đọc; signed URL
hết hạn, không public ACL hoặc cache PWA. Kiểm tra Customer khác/Sitter không được
giao/ngoài giờ không đọc được; ảnh check-in/out không được bỏ qua do upload lỗi.

payOS đang có verifier/processor độc lập; route/repository/outbox chưa được chứng
minh trong runtime. Không bịa endpoint hoặc thêm env payOS vào shared config để
giả tích hợp. P31/P34 cung cấp route HTTPS thật và secret store mapping; đăng ký
webhook sau đó kiểm tra provider delivery log với synthetic payment được phép.
Chữ ký, amount/currency/reference và idempotency phải được verify server-side;
return URL không chứng minh Paid. Callback lặp/cũ/sai hoặc đến cùng cancel/expiry
không được ghi tiền hai lần. Webhook không cần browser cookie/CSRF và phải được
bảo vệ bằng verifier riêng; không bỏ auth/CSRF toàn bộ API. Xem
[P31 handoff](p31-handoff.md) và [recovery](p35-recovery.md).

## Nguồn hosting đã đọc

Tra cứu 15/10/2026 qua Exa, tài liệu chính thức:
[Vite on Vercel](https://vercel.com/docs/frameworks/frontend/vite),
[build/root settings](https://vercel.com/docs/builds/configure-a-build),
[rewrites](https://vercel.com/docs/routing/rewrites),
[Render web services](https://render.com/docs/web-services),
[Node version](https://render.com/docs/node-version),
[health checks](https://render.com/docs/health-checks).
Đây là hướng dẫn provider, không phải bằng chứng dịch vụ PWC đã chạy.
