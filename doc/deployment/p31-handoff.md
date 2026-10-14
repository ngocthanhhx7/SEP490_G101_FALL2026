# P31 — Thanh toán payOS, webhook và đối soát

**Ngày:** 14/10/2026 · **Phạm vi:** WBS-043, WBS-044, WBS-045, WBS-064, WBS-065; UC-59, UC-60; mở rộng EXT-PREPAY. · **Trạng thái:** triển khai cục bộ và kiểm tra theo work item; tích hợp tổng thể `INTEGRATION_PENDING`.

Tham chiếu: [P51 financial contract](../requirements/p51-financial-contract-v1.md), [P51 ledger contract](../database/p51-financial-ledger-v1.md), [payOS docs](https://payos.vn/docs/), [payOS webhook signature guide](https://payos.vn/docs/tich-hop-webhook/kiem-tra-du-lieu-voi-signature/).

## Kết quả theo work item

| WBS | Nhánh / worktree | Kết quả cục bộ | Reviewer được giao |
| --- | --- | --- | --- |
| 043 — Booking Payment | `feature/wbs-043-booking-payment` / `D:\WW\SEP490_G101_FALL2026-p31-wbs043` | Dịch vụ billing dùng snapshot phía máy chủ; prepay giữ nguyên mode theo số visit gốc; postpay chỉ lập bill sau visit hoàn tất, đủ điều kiện và không còn hold. | Đoàn Tiến Đạt |
| 044 — payOS Gateway | `feature/wbs-044-payment-gateway-integration-payos` / `D:\WW\SEP490_G101_FALL2026-p31-wbs044` | Adapter server-only tạo link ký số, xác minh chữ ký webhook, tra cứu link phục vụ đối soát; return URL không xác nhận đã trả. | Nguyễn Hữu Anh Nhật |
| 045 — Payment Webhook | `feature/wbs-045-payment-result-webhook` / `D:\WW\SEP490_G101_FALL2026-p31-wbs045` | Processor kiểm tra chữ ký, reference, số tiền, tiền tệ, trạng thái và hạn; callback sai/cũ đi vào reconciliation; timestamp provider không có timezone được giữ nguyên. Repository phải ghi receipt, chuyển trạng thái/reconciliation và outbox event nguyên tử. | Nguyễn Hữu Anh Nhật |
| 064 — Reminder / overdue job | `feature/wbs-064-payment-reminder-overdue-job` / `D:\WW\SEP490_G101_FALL2026-p31-wbs064` | Sweep nhắc khoản đến hạn, lọc hold và provider pending/uncertain, dùng idempotency key ổn định; không đổi trạng thái payment. | Nguyễn Hữu Anh Nhật |
| 065 — Unpaid Bookings | `feature/wbs-065-unpaid-bookings` / `D:\WW\SEP490_G101_FALL2026-p31-wbs065` | Trang responsive có loading, empty, error, forbidden và pending; command gửi idempotency key; trạng thái và hạn link lấy từ API, không từ browser return hay đồng hồ máy khách. | Phạm Thành Chung |

## Checks đã chạy

- WBS-043: Backend billing Jest `20 suites / 223 tests`; ESLint; `git diff --check` đạt.
- WBS-044: Jest payOS provider `9/9`; ESLint scoped; `node --check` cho source và test; `git diff --check` đạt. Worktree chưa có `node_modules`, nên Jest dùng runner và dependencies sẵn có từ worktree WBS-043.
- WBS-045: Jest webhook `25/25`, bao gồm năm lần phát lại callback và timestamp không có timezone; `npm run lint`; `git diff --check` đạt.
- WBS-064: Jest reminder `8/8`; ESLint scoped; `git diff --check` đạt.
- WBS-065: Jest trang unpaid bookings `11/11`; `npm run lint` frontend; `npm run build` đạt; `git diff --check` đạt. UI tests dùng adapter giả, không xác minh API/auth thật.
- Chưa chạy payOS sandbox hoặc luồng end-to-end tích hợp; chưa có credentials và route/schema/repository triển khai để xác minh.

## Quyết định và dependency còn mở

Các chi tiết tài chính sau vẫn là gate theo P51; không đặt mặc định cho số tiền hoặc hạn thanh toán:

- `FIN-01-TIME`: thời hạn intent/giữ slot và callback đến sau hạn.
- `FIN-02-ALLOC`, `FIN-02-ROUND`: phân bổ tiền đã thu và quy tắc làm tròn.
- `FIN-04`: cửa sổ và cách duyệt reschedule.
- `FIN-05-DELTA`: chênh lệch giá khi thay đổi scope/lịch.
- `FIN-06-CAUSE`: phân loại nguyên nhân và remedy.
- `FIN-07-ELIG`, `FIN-07-POSTPAY`: điều kiện earning/hold và điều chỉnh sau payout.
- `FIN-08-EDIT`: chỉnh sửa request khi transfer đang xử lý.

P01 sở hữu schema, DTO, quyền và API contract. P34 sở hữu route registration, manifest/lockfile và wiring provider/job. Hợp đồng idempotency P01 yêu cầu replay kết quả gốc theo actor/operation/aggregate/key sau khi xác thực lại quyền; WBS-043 cung cấp port replay trước state/version/deadline gate và vẫn cần repository atomic thật. P34 sở hữu schema cho bill đơn visit; trang này không gửi prepayment cho bill đó. Trang cũng fail closed nếu thiếu `meta.serverNow` hoặc UTC `Z` hợp lệ; adapter thật phải cung cấp metadata theo P01. Dependency trực tiếp còn gồm P02, P06, P17 và P51. Final integration còn chờ P19, P25, P27, P29 và P30; ghi `INTEGRATION_PENDING` cho các luồng phụ thuộc này. Không có bằng chứng xác minh Figma trong worktree này; UI dùng hệ token/component hiện có.

## Git và bàn giao

Năm nhánh đã có PR mở vào `develop` và đang chờ review độc lập theo phân công; approval phải gắn với đúng SHA sau lần push gần nhất và Leader thực hiện merge cuối cùng. Các nhánh đã được đồng bộ với `origin/develop` hiện tại; checkout gốc `D:\WW\SEP490_G101_FALL2026` có thay đổi P10 chưa commit và được giữ nguyên.

Trước tích hợp, P01/P34 cần map các port sang schema/repository/route thật; repository webhook phải dedupe event, kiểm tra state/version/deadline, và ghi `PaymentVerified` hoặc `PaymentReconciliationRequired` vào outbox trong cùng transaction. P01 cần xác nhận timezone của timestamp payOS trước khi chuẩn hoá timestamp gốc đang được giữ. Bill postpay cần kiểm tra lại eligibility/hold và version nguyên tử khi phát hành. Cần quyết định P51 trước khi bật thu tiền, lập due date hoặc thực thi `OVERDUE`; notifier reminder cần dedupe bền qua lần khởi động và xử lý an toàn kết quả gửi không chắc chắn. Sau đó mới chạy negative/permission/race checks xuyên API và xác minh provider sandbox thật.
