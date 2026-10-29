# P35 — Verification record

Ngày: 29/10/2026 (`Asia/Ho_Chi_Minh`). Baseline khảo sát: checkpoint PR #83
`3c3816517f7a67bff7494e8742403755b110754e`.
**Staging INTEGRATION_PENDING; production EC2/Cloudflare origin đã được kiểm tra
read-only, private R2 và UAT chưa được xác minh.**
Runtime/unit fixtures không chứng minh provider, hosting hoặc UAT. Link tới
[runbook](p35-staging-runbook.md), [recovery](p35-recovery.md).

Historical frontend preview checks do not verify the selected EC2 deployment.
The release target is frontend/backend on EC2 behind Cloudflare; use origin
readiness, matching release assets and live provider evidence for acceptance.

## Release evidence cần bổ sung

| Mục | Giá trị thực tại phiên này |
| --- | --- |
| Frontend/backend public URL, domain/TLS | Production origin `https://pawworldvn.shop`, EC2 frontend/backend; staging hostname remains unprovisioned |
| EC2 instance/region, DNS and origin TLS | EC2 `54.79.81.209`, `ap-southeast-2`, release `1f784887…`, `/health` and `/ready` 200 on `127.0.0.1:3001`; DNS for root/api/www resolves to Cloudflare proxy IPs; origin HTTPS succeeds with `--resolve`; staging hostname remains unprovisioned |
| R2 private bucket/adapter | Direct EC2 S3 PUT/GET 200 + SHA256 match, DELETE 204. Linux ARM64 isolated 384 MiB workload: 16 uploads/16 reads, peak 271.5 MiB, no OOM. Synthetic auth/provider diagnostic; real runtime API/UI, cache/privacy, retention/recovery/evidence acceptance still pending. |
| Final P34 integration gate | Chưa đạt; status hiện ghi mini-gate |
| Atlas version/topology/index migration | Chưa kiểm tra staging |
| Provider, private storage, webhook | Chưa xác minh trên staging |
| RPO/RTO, backup ID và restore duration | Chưa chốt/chưa diễn tập |
| Previous deployment và rollback drill | Chưa có/chưa diễn tập |
| UAT, production approval | Chưa có; preview Ready không phải UAT hoặc production |

User supplied `pawworldvn.shop`; the proposal uses `staging.pawworldvn.shop`.
The operator provisioned the R2 bucket/credentials; direct provider smoke is
recorded above. This is not proof of new-runtime API/UI or staging acceptance.

## Ma trận kiểm chứng sau gate

Mỗi lần chạy ghi release SHA, người thực hiện, URL, mốc VN, HTTP/result và bằng
chứng đã lược secrets. Ma trận dưới là acceptance cho bản staging mới và vẫn
**NOT RUN**; các probe production hiện hành và provider smoke ở trên không thay thế nó.

| Case | Kết quả cần đạt |
| --- | --- |
| HTTPS frontend/backend | TLS hợp lệ, HTTP redirect HTTPS, không mixed content |
| `/health`, `/ready` trực tiếp và proxy | JSON alive/ready 200; DB mất/draining → ready 503; không SPA HTML/200 |
| Deep link refresh `/register`, `/policies`, role route | SPA tải được, API thật; guest không bị lộ role data; assets đúng MIME |
| API unknown path | Backend JSON 404; không bị SPA rewrite nuốt |
| OTP/session/logout | Synthetic recipient được phép nhận thật; cookie HttpOnly/Secure/Lax; reload và logout/revoke hoạt động |
| CSRF/proxy/CORS | Valid public origin + CSRF mutation thành công; missing/wrong token/origin 403; origin lạ không có CORS credentials; forwarded-header spoof không qua gate |
| Quyền object/role | Guest 401, sai role 403, Customer B không đọc/sửa data A; Sitter chỉ đọc access notes đúng assignment và cửa sổ |
| Private upload | Type/size/content reject server-side; retry không duplicate; signed URL expiry/ownership; file không nằm public/cache |
| Error/empty/pending | Provider/DB lỗi không fake success; UI error/empty/forbidden/pending rõ; sensitive response no-store và không CDN/SW hit |
| payOS | Chữ ký/amount/reference đúng mới Paid; invalid/old/repeated callback an toàn; callback race cancel/expiry atomic và một outbox |
| Job hai replica + crash/restart | Một logical effect qua lease/fencing và durable receipt; không nhắc kép P23/P33; catch-up bounded |
| Deadline | 60:00 được self-cancel, 59:59 không; đổi clock client không đổi server rule; tuần Mon 00:00 VN đúng |
| Restore synthetic | DB mới, counts/indexes/ledger/keys/media mapping khớp; đo RPO/RTO; không replay provider effect |
| Rollback synthetic | FE/BE về SHA tương thích; data không mất/trùng, API/auth/readiness phục hồi |
| PWA/360px/keyboard | HTTPS install/deep link/update; offline pending rõ; không cache PII/payment/access notes; touch/keyboard dùng được |
| Query/load P44 | explain và phép đo flow thật; đáp ứng NFR đã chốt; fixture không là load thực |

## Checks cục bộ

Kết quả lệnh thực được tổng hợp trong [handoff](p35-handoff.md) sau khi chạy.
Không biến các hàng NOT RUN thành PASS từ unit doubles. Không có CI workflow
trong phạm vi P35; trạng thái GitHub checks phải đọc thật tại PR head.
