# Thiết kế dữ liệu gốc: provenance trong phiên bản catalog

## Quyền sở hữu và bằng chứng

Thành thực hiện, Đạt review, Thành merge. Ưu tiên dữ liệu gọn và đúng authority.
Không gộp collection chỉ để giảm số lượng. Read-only live ngày 07/11/2026 xác
minh cả 55 audit tương ứng duy nhất với một immutable version:

| Audit cũ | Loại | Canonical version | Số bản |
| --- | --- | --- | ---: |
| serviceaudits | service | serviceversions | 22 |
| serviceaudits | service-policy | servicepolicyversions | 16 |
| servicepriceaudits | service-price | servicepriceversions | 16 |
| systemsettingaudits | system-setting | systemsettingversions | 1 |

Actor, reason, effectiveAt, occurredAt và BSON version type trùng hoàn toàn với
changedBy, reason, effectiveAt, recordedAt và version của bản gốc; tất cả mismatch
bằng 0. Resource/actor references đều resolve; actor provisioning hợp lệ qua
catalogprovisioningruns. Không xuất ID, reason hoặc dữ liệu riêng tư.

## Mô hình đích

Mỗi version sở hữu thêm đúng một subdocument `changeAudit` gồm `eventId`,
`action`, `changedFields`. Không sao chép lại actor/reason/time/version/resource.
Giữ nguyên event ID và BSON type của dữ liệu lịch sử. Có thể dựng lại đầy đủ
10 fields của audit cũ từ version và ba thông tin này. changedFields tối đa
32 entries; parent tối đa 1 MiB trong migration. Không tạo mảng lịch sử tăng
vô hạn trong Service: mỗi version vẫn là document riêng, có unique indexes cũ.

Bốn version collection giữ nguyên tên, unique service/key + version/effectiveAt
và index point-in-time hiện có. Không thêm index trên provenance vì không có
query thực tế cần nó. Writer mới ghi version và provenance trong cùng document,
giảm từ hai insert xuống một cho mỗi thay đổi; transaction còn bao các business
writes khác. Các trường version bất biến qua Mongoose. Native strict/error
validator bắt buộc provenance sau cutover; validator kiểm tra shape, không phải
cơ chế WORM hoặc quyền chống sửa raw DB.

Metadata dùng select:false và được bỏ khỏi các DTO tạo/cập nhật. Giữ nguyên
HTTP status/auth/error và dữ liệu giá/policy/visibility. Ba factory audit cũ
chỉ giữ cho công cụ tương thích/rollback; runtime mới không đăng ký chúng.
Không thêm TTL cho lịch sử. Không thay đổi financial/HR/security/command audit.

## Migration, cutover và rollback

1. Dry-run chỉ đọc, tắt autoCreate/autoIndex: so sánh BSON đầy đủ từng audit với
   canonical version, unknown fields, shape/type, missing/ambiguous parent,
   duplicate parent, event ID collision trong namespace cũ, metadata conflict và
   version thiếu bằng chứng. Không suy đoán actor/action hoặc tạo audit lịch sử.
   Cap 10.000 audit và 10.000 version, audit 64 KiB, batch 100, maxTimeMS 5.000.
2. Copy additive mặc định giữ cả ba source. Apply yêu cầu database và digest
   mới nhất; mỗi event chạy transaction, đọc lại source/base facts, chỉ thêm
   changeAudit nếu chưa có. Không overwrite khác biệt. Retry identical là no-op.
3. Reviewed main + CI, backup mới và restore cô lập, deploy lock, tạm dừng
   catalog Admin/provisioning. Triển khai writer mới, drain toàn bộ writer cũ,
   catch-up và kiểm tra lại mọi source lẫn version. Không chỉ so số lượng cố định:
   writer mới có thể tạo canonical-only events sau cutover.
4. Operator có quyền hiện hữu cài bốn native validators bắt buộc provenance,
   strict/error, sau preflight sạch. App readWrite không có collMod; không cấp
   thêm quyền. Xác minh validator cũ trước khi thay; validator lạ phải review.
5. Chỉ sau xác nhận cleanup cụ thể, backup/restore, writer drain và coverage,
   drop serviceaudits/servicepriceaudits/systemsettingaudits. Command kiểm tra
   lại digest/coverage và đúng bốn validator trước drop. Không drop phiên bản.
   Dự kiến giảm 3 collections, 6 indexes và 55 duplicate documents theo baseline;
   phải đo lại bytes/count sau apply, không suy diễn thành giảm RSS/WT storage.
6. Trước rollback code cũ: drain writer mới, dry-run reverse lấy versionDigest;
   reconstruct TOÀN BỘ audit về ba namespace cũ, gồm event phát sinh sau cutover,
   giữ ID/BSON, không overwrite conflict; dựng lại index resourceId/occurredAt.
   Coverage/digest phải khớp. Operator đổi bốn validator sang provenance optional
   đã review, rồi mới activate code cũ. Giữ embedded metadata; không restore
   toàn DB đè hoạt động mới. Backup vật lý là phương án phục hồi riêng.

`migrate-catalog-audits.js` mặc định dry-run. Các phase copy/cleanup/restore không
thay schema hoặc drop ngầm. Cleanup/restore yêu cầu xác nhận writer drain; flags
không thay thế bằng chứng thực tế. Không coi phép copy 15 presentation và TTL
được duyệt đợt trước là phép drop audit đợt này.

## Đo lường và giới hạn

Benchmark synthetic so sánh cùng version payload, legacy audit đầy đủ và
provenance ba fields tại 1k/10k/100k, MongoDB 8.0.34. Đo logical BSON bytes,
WT data/index bytes, insert duration, transaction latency và command count;
không dùng kết quả prototype shared-audit đã bỏ. Bằng chứng kiểm thử phải bao
copy/retry/conflict, native rejection, DTO, transaction abort và reverse có
post-cutover event. Số live gần nhất 103 collections/265 indexes chưa phải số
sau cleanup. servicepresentations legacy vẫn giữ và cần quyết định riêng.

Các nhóm media/AI/financial/schedule cần authority/lifecycle/reference audit riêng.
Không xóa chỉ vì tên hoặc field giống nhau; đợt này chưa hoàn tất toàn MongoDB.

## Kết quả đã đo trước triển khai

Live dry-run 16:37 UTC: 55 source/55 versions, pending55; invalid, conflict,
missing, duplicate và uncovered đều 0. Source BSON 19.765 bytes; phần provenance
thêm 7.611 bytes, dự kiến bỏ lặp ròng 12.154 bytes sau cleanup. Bốn collection
chưa có native validator. Digest source được giữ trong evidence cục bộ; phải lấy
lại trước apply. Đây chưa phải bytes đã tiết kiệm trên production.

| Synthetic changes | BSON cũ → mới | Index bytes cũ → mới | Transaction p95 ms cũ → mới |
| ---: | --- | --- | --- |
| 1.000 | 540.250 → 367.250 | 622.592 → 462.848 | 5,92 → 5,09 |
| 10.000 | 5.402.500 → 3.672.500 | 2.723.840 → 2.007.040 | 5,58 → 4,98 |
| 100.000 | 54.025.000 → 36.725.000 | 24.166.400 → 17.879.040 | 5,17 → 4,78 |

Cùng fixture/IDs, 4 loại balanced, Node24.22.1/Mongo8.0.34, 5 warmup/40 mẫu,
transaction w:majority, một client. Insert commands/thay đổi 2 → 1; collection
trong phạm vi 7 → 4, indexes22 →16. Tại100k WT data storage sau checkpoint
7.016.448 →4.087.808 bytes; sequential changes/s 252,60 →279,36. Thứ tự benchmark
cũ trước mới; cache/order/noise có thể ảnh hưởng timing, không suy diễn thành
production throughput, RSS hay mọi API nhanh hơn. Không bỏ index phiên bản cũ.
