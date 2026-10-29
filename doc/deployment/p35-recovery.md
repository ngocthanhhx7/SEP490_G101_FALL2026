# P35 — Health, job, backup/restore và rollback

Thủ tục chuẩn bị ngày 15/10/2026, giờ Việt Nam. **Chưa diễn tập trên staging.**
Đọc [release gate và environment](p35-staging-runbook.md) trước mọi thao tác.
Chỉ dùng dữ liệu synthetic, môi trường và người thực hiện được ghi nhận.

## Health và sự cố

`GET /health` trả 200, `data.status=alive`: HTTP process sống. `GET /ready` trả
200, `data.status=ready` khi DB ping được và không draining; mất DB/draining trả
503 `NOT_READY`. Không suy ra provider, jobs, indexes hoặc luồng thanh toán đạt
từ hai endpoint. Kiểm tra cả backend trực tiếp và đường proxy; đọc JSON envelope
để tránh nhầm SPA index.html/200 thành health thành công.

Sau khi có URL thật, dùng browser/monitor hoặc `curl.exe --fail-with-body
--max-time 15 https://<host>/ready`; không dùng `-k`, không kèm credentials vào
lệnh/log. Theo dõi readiness, tỷ lệ 5xx/403/429, latency, DB pool, outbox backlog,
job success/lease lost và reconcile count theo release SHA. Health `/ready` vẫn
chịu global limiter hiện tại; P34 phải kiểm tra tần suất probe/IP qua proxy trước
rollout để probe không gây 429. Không bỏ limiter toàn API để khắc phục.

Khi 503: ngừng rollout, xem safe error code/startup field names, DB network,
credential permission, TLS và replica topology. Khi 403 tăng sau proxy: kiểm tra
public Origin/Host/protocol theo P34; không tắt CSRF hoặc Secure cookie. Khi
provider chưa chắc đã gửi: giữ pending/uncertain và đối soát, không gửi lại hàng
loạt hoặc tự đánh dấu Paid/Overdue. P34/Leader quyết định tiếp tục hay rollback.

## Job không chạy trùng và phục hồi

Hiện runtime chưa đăng ký scheduler/Mongo lease/outbox cho các job dưới đây.
Không có command worker có thể chạy thật; không tạo cron gọi tùy tiện các factory.

| Nguồn | Nhịp dự kiến | Điều kiện trước khi bật |
| --- | --- | --- |
| P23 operational sweep | offer/deadline 5 phút; reminder 15 phút | Mongo lease + fencing token + CAS/transaction + unique outbox |
| P33 reminder | scheduler 15 phút; lead theo contract | reservation/delivery bền, invalidation khi scheduleVersion đổi |
| P31 payment reminder/overdue | mỗi giờ | provider reconciliation, hold gate, dedupe và FIN deadline đã chốt |

P23 và P33 có logic nhắc visit giao nhau; P34 chọn một orchestration/owner cho
mỗi logical event. Không chạy hai scheduler tạo hai thông báo cùng nội dung.
Một web replica vẫn chưa chứng minh chống trùng vì redeploy có thể overlap.
EC2 web service không tự đăng ký job; cần quyết định worker/
scheduler phù hợp trước khi nghiệm thu, không tự mua gói trả phí.

Diễn tập sau wiring: tạo synthetic due records và chạy hai worker đồng thời trên
cùng DB. Chỉ một lease owner được ghi; một logical event có một receipt/outbox/
effect. Kill owner sau reserve nhưng trước acknowledge; chờ lease hết hạn theo
server clock, worker mới nhận fencing token lớn hơn. Writer cũ không được commit.
Replay event với key cũ phải trả kết quả cũ; không xóa dedupe để chạy lại. Theo dõi
bounded backlog catch-up và poison record không chặn batch khác. Không sửa máy
chủ sang giờ quá khứ để test deadline.

Phục hồi: dừng lịch phát sinh mới, giữ receipt/ledger, ghi checkpoint và đánh giá
uncertain provider result. Đối soát trước replay, chỉ dùng command được owner
module cung cấp và cùng logical idempotency key. Sau khi kiểm tra lease/fence và
outbox, chạy một bounded batch, đối chiếu số effect, rồi mới bật lịch. Kiểm tra
Mon 00:00 VN, cutoff 60:00/59:59 và restart qua deadline bằng injected test clock.
Không tự sửa `Paid`, hoàn tiền hoặc tạo checkout giả để xóa backlog.

## Backup và restore

Chưa xác nhận Atlas tier, retention, RPO/RTO hoặc backup tooling. Leader/DB owner
phải ghi RPO/RTO, lịch/retention, quyền restore và chứng cứ restore trước deploy.
Không tuyên bố backup tự động có trên mọi tier. Ưu tiên snapshot/PITR phù hợp tier;
bản export logical cần Database Tools tương thích và phương án nhất quán được
DB owner review. Không dùng export collection rời làm bằng chứng transaction
ledger đồng bộ trong khi writers còn chạy.

1. Chọn DB synthetic staging, ghi release/schema/index versions, mốc UTC và giờ
   VN, số lượng và tổng đối soát ledger/outbox. Tạm dừng mọi writer/job/webhook
   theo kế hoạch maintenance; provider retries phải được giữ để đối soát sau đó.
2. Tạo backup bằng công cụ được DB owner chấp thuận, giữ trạng thái hoàn tất và
   checksum/snapshot ID trong kho vận hành riêng. Mã hóa, least privilege, tách
   quyền backup/restore và giữ key giải mã cần thiết. Không dump vào repository.
3. Restore vào cluster/DB kiểm thử **mới**, không đè staging đang dùng. Cô lập
   network, chặn email/SMS/payOS và không chạy worker khi kiểm tra dữ liệu restore.
   Không chạy preflight như lệnh khởi động bản restore có provider tắt: tool này
   cố ý yêu cầu email cho đăng ký/đăng nhập trên staging tương tác.
4. So sánh counts, indexes/unique/TTL, snapshots, ledger totals, receipt/outbox
   uniqueness và đọc dữ liệu mã hóa. Kiểm tra transaction, role/ownership và không
   phát lại effect cũ. Không giả việc copy document là restore toàn hệ thống.
5. Ghi thời gian backup→restore, mất dữ liệu đo được so với RPO/RTO đã duyệt và
   kết quả read-only/synthetic checks. Đổi target runtime chỉ sau Leader xác nhận.
   Sau restore state, reconcile provider events xảy ra sau snapshot trước replay.

Private storage cần backup/versioning riêng và mapping object→DB; restore DB
không phục hồi file bị xóa. Thời hạn xóa theo MEDIA-RETENTION cần được chốt, không
giữ giấy tờ vô hạn để tiện backup. Không tự chạy restore hoặc xóa cluster thật.

## Log riêng tư

Giữ timestamp UTC, release SHA, requestId, safe code và counters; hiển thị thời
gian vận hành ở VN. Không log request body/contact/OTP/session/CSRF/Authorization/
cookie/Mongo URI/home access/giấy tờ/ảnh hoặc payload webhook chứa dữ liệu riêng.
Stack/driver error có thể lộ URI nên chỉ safe event/code theo runtime hiện có.
Kiểm tra logging ở Cloudflare/Nginx/systemd/provider, không chỉ application logger. Không xuất
HAR/cookie jar lên PR. Retention/quyền đọc và quy trình xóa log do Leader xác nhận;
incident ticket chỉ chứa dữ liệu đã lược bỏ thông tin nhạy cảm.

## Rollback

Trước rollout giữ EC2 instance/region, frontend/backend release directory/SHA trước đó,
schema/index compatibility, config version và backup đã restore được. P35 chưa
có bản staging trước đó để rollback; đây là gate chưa đạt, không ghi PASS.

Nếu readiness không ổn định, mất đăng nhập/CSRF, lộ dữ liệu, ghi effect trùng hoặc
luồng tài chính sai: dừng rollout/writers/jobs, lưu safe evidence và báo Leader.
Redeploy đúng backend SHA trước đã biết tốt; đưa frontend về deployment tương
thích. Xác minh API route/cache, `/ready`, session, quyền dữ liệu và synthetic
flow trên cả URL trực tiếp/proxy rồi mới mở traffic/jobs trở lại.

Không xóa ledger/receipt/outbox hoặc chạy down-migration tự động để lùi code.
Nếu schema mới không tương thích bản cũ, giữ maintenance và dùng kế hoạch forward
repair/restore được duyệt. Restore DB sau payment cần reconcile provider; rollback
code không hoàn tác tiền bên ngoài. Rotation secret phải giữ khả năng giải mã;
không thay key để ép phiên cũ hoạt động. Ghi incident timeline, instance/release IDs,
SHA, người thao tác, kết quả và hành động tiếp theo trong kho riêng đã lược secrets.
