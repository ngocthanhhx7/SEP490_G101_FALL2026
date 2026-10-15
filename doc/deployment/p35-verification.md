# P35 — Verification record

Ngày: 15/10/2026 (`Asia/Ho_Chi_Minh`). Baseline khảo sát: develop `f02321e`.
**Staging INTEGRATION_PENDING; chỉ có Vercel frontend branch preview, chưa có
integrated PWC staging hoặc UAT được xác minh.**
Runtime/unit fixtures không chứng minh provider, hosting hoặc UAT. Link tới
[runbook](p35-staging-runbook.md), [recovery](p35-recovery.md).

PR #72 head `3632e1a` reported Vercel status `success` and a completed
`Vercel Preview Comments` check at 15/10/2026 20:37 (`Asia/Ho_Chi_Minh`). This
is frontend preview evidence only; it does not verify an integrated backend,
provider flow, TLS contract, staging acceptance or UAT.

## Release evidence cần bổ sung

| Mục | Giá trị thực tại phiên này |
| --- | --- |
| Frontend/backend public URL, domain/TLS | Vercel preview `https://pawworld-frontend-staging-git-feature-p35-a-0f0593-ngocthanhhx7.vercel.app` được PR status báo Ready; integrated public origin/backend/TLS chưa xác minh |
| Vercel/Render deployment ID, release SHA | Vercel frontend preview `pawworld-frontend-staging`, deployment `6QaZXjrEwEp7QDuFopnkAyujPUvC`; Render backend/integrated release chưa có |
| Final P34 integration gate | Chưa đạt; status hiện ghi mini-gate |
| Atlas version/topology/index migration | Chưa kiểm tra staging |
| Provider, private storage, webhook | Chưa xác minh trên staging |
| RPO/RTO, backup ID và restore duration | Chưa chốt/chưa diễn tập |
| Previous deployment và rollback drill | Chưa có/chưa diễn tập |
| UAT, production approval | Chưa có; preview Ready không phải UAT hoặc production |

Không dùng URL của `smartlearn-backend` làm URL PWC. Screenshot cấu hình mới
chọn Ruby/main cần đổi thành Node/develop theo runbook; không chứng minh deploy.

## Ma trận kiểm chứng sau gate

Mỗi lần chạy ghi release SHA, người thực hiện, URL, mốc VN, HTTP/result và bằng
chứng đã lược secrets. Mọi dòng dưới hiện **NOT RUN**.

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
