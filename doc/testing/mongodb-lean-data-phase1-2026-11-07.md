# MongoDB tinh gọn — bằng chứng đợt 1

Đợt này nhúng metadata 1:1 vào Service, loại N+1 catalog và chuẩn bị TTL cho quota
giờ theo retention owner đã chọn. Đây chưa phải hoàn tất tối ưu mọi API/domain.
Production chưa apply migration/index hay cleanup khi lập bằng chứng này.

## Kiểm tra dữ liệu thật, chỉ đọc

- VPS main `f6a6dca`, ready/running, restart 0/OOM false; production env hash
  khớp bàn giao. Main/develop application CI success đã đọc lại.
- 103 collection, 1.095 document; audit schema/index aggregation 0 lỗi.
- 83 scalar unique constraints không thấy duplicate group; 12 quan hệ explicit
  không thấy missing target. Không thay thế full nested/business/ref audit.
- Metadata 15 source, 15 có parent, không conflict/orphan; mảng lớn nhất 3
  phần tử cho preparation/exclusions và 2 cho FAQ/locations. Target lớn nhất
  1.248 bytes. Source+parents 13.796 bytes, sau nhúng 13.406 bytes; saving nhỏ
  390 bytes, chưa gồm overhead collection/index/filesystem. Legacy giữ cho rollback
  khiến footprint tăng tạm thời trong giai đoạn copy.
- Quota có 7 bộ đếm đã quá 25 giờ. TTL sẽ xóa cả 7; audit và ownership counter
  không thuộc cleanup. Không áp index hoặc xóa dữ liệu chỉ từ dry-run.

## Kiểm thử local

Architecture checker và lint hai package đạt; frontend build đạt, còn cảnh báo
bundle lớn hiện hữu. Full backend 138 suites/1.314 tests và frontend 123
suites/898 tests đạt. Sau khi bổ sung kiểm tra coercion/post-copy và giữ field
optional cũ, chạy lại focused migration/catalog/checkout/application/storage đạt
7 suites/59 tests; CI của SHA
cuối sẽ là bằng chứng full-suite cuối cùng. Các lần thử sai fixture timestamp
(withdrawal sớm hơn bản hiện tại) đã sửa; không tính lần thất bại là pass.

Regression gồm dry-run không ghi, checksum mismatch không copy, idempotent rerun,
giữ legacy cho rollback, target conflict/orphan/array vượt budget chặn copy,
provisioning chỉ fill field thiếu đúng owner, quota unique/TTL và giữ audit,
policy withdrawal không resurrect, catalog DTO/query count, checkout và deployment
storage. Database test/benchmark đều synthetic cô lập, không gửi mail/SMS.

Backend production dependency audit: 0 advisory. Lockfile không đổi; dev/tooling
audit vẫn có 22 backend (gồm 1 high) và 21 frontend, như baseline. Không chạy
audit fix hoặc thay version ngoài phạm vi.

## Benchmark

Node 24.22.1, MongoDB 8.0.34 riêng cho fixture. Catalog 13 dịch vụ, 5 warmup,
40 samples tuần tự, cùng `at`; DTO deep-equal. Baseline source develop `5381c62`.

| Chỉ số domain service | Baseline | Đợt 1 |
| --- | ---: | ---: |
| Command đọc/list | 42 | 4 |
| p50 (ms) | 39,46 | 8,71 |
| p95 (ms) | 86,06 | 10,62 |
| Sequential list/giây | 22,99 | 111,76 |
| Client RSS bytes | 180.416.512 | 181.018.624 |

HTTP runtime có thêm một query kiểm tra hiển thị chung: 43 -> 5 commands.
Đây là domain-service latency; không phải p95 HTTP production hoặc capacity dưới
tải đồng thời. Máy local không phải benchmark host chuyên dụng; latency dao động
giữa lượt chạy. Command count/DTO là bằng chứng ổn định hơn. RSS là client,
không phải bộ nhớ MongoDB và không có tuyên bố memory gain.

Mail so sánh 1k/10k/100k rows theo backlog/future-first/mostly-accepted. FIFO
candidate nhanh cho backlog nhưng tệ hơn khi retry tương lai chiếm đa số,
đồng thời index backlog lớn hơn. Giữ index cũ; không ép hint hoặc thêm index
chỉ để loại SORT. Số liệu và quyết định nằm trong [kế hoạch](../database/mongodb-optimization-plan-2026-11-07.md).

## Gate trước production

Review độc lập SHA cuối, CI, reviewed main, backup mới + restore cô lập,
deploy lock/provisioning freeze và fresh dry-run. Xác nhận riêng apply copy 15
metadata và tạo TTL có thể xóa 7 quota; không drop collection trong đợt copy.
Sau rollout đọc catalog/guards và dry-run identical/count/digest. Chỉ cleanup
legacy sau cửa sổ rollback, fresh comparison và xác nhận cụ thể. Các provider,
HR signature/payment/dispatch business writes không được kiểm thử thật từ fixture.
