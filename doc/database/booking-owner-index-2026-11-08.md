# Index lịch sử booking theo chủ sở hữu

DB-02 của audit độc lập: GET /api/v1/bookings lọc customerId:ObjectId, cursor
_id<$last, sort _id DESC, limit+1 và projection allowlist. Native collection
bookings hiện có _id và care-plan queue index, không có owner prefix. Explain
owner giả trên live đọc6docs để trả0. Không đổi owner filter/cursor/auth/DTO.

Đích: thêm đúng một non-unique index customerId ASC,_id DESC. Giữ _id,
carePlanState/createdAt/_id và mọi index/validator hiện hữu; không TTL, không
rewrite documents, không gộp booking snapshots vào master data.

Benchmark isolated100owners,1k/10k/100k bookings, cùng IDs/page results.100k:
21rows page/cursor đọc2100→21keys/docs; owner rỗng100000→0. Sau checkpoint,
index bytes thêm1.327.104. Bulk-write fixture riêng50kseed+10batches1000,
writer order luân phiên: p50batch11,54→13,44ms, p9512,13→15,46ms. Đây là
đánh đổi ghi/storage có thật trong fixture;10batch không đủ suy diễn production
throughput, latency hoặc RAM. Không thêm các index order/area trong cùng đợt.

## Chuẩn bị và rollout

1. Read-only preflight: collection phải tồn tại, owner/_id BSON types và digest,
   index equivalents/options/conflicts. Scan cap100.000, batch100, maxTimeMS5s,
   chỉ đọc _id/customerId, không xuất IDs. ObjectId owners khớp reader; missing/
   null có thể là historical/raw reconciliation và được giữ nguyên. Types lạ
   cần review; không đoán owner hay backfill để index pass.
2. CLI mặc định dry-run, tắt autoCreate/autoIndex. Apply chỉ khi confirmed DB,
   digest và index specification khớp bản review; không drop/replace index lạ.
   Equivalent plain index có tên khác được giữ, không tạo bản trùng.
3. Review/CI/main artifact, backup mới+restore cô lập, xác nhận live build
   cụ thể. Chạy command từ reviewed image dưới deploy lock trước activation.
   Index build online; MongoDB tự bao insert concurrent, không đổi owner.
4. Deployment chỉ ASSERT index đã được operator provision; không tự build mới
   để vượt cổng xác nhận. Khi booking/finance read disabled thì bỏ qua gate.
   Bookings absent không được CLI tự tạo. Không thêm index từ route/runtime.
5. Verify data digest/option/sort plan, own/foreign cursor scope, public readiness
   và existing financial uniques. Dữ liệu thay đổi hợp lệ khi build phải báo
   riêng, không rollback dữ liệu hay xóa index để cố đưa count về baseline.
6. Rollback code độc lập: giữ index additive để tiếp tục reader cũ. Việc drop
   index là thao tác riêng cần evidence/approval; không tự drop từ rollback.

Không coi yêu cầu tối ưu chung là phê duyệt build live cụ thể. Bản này chỉ
khắc phục access pattern; không chứng nhận toàn bộ raw booking schema hợp lệ.

Read-only preflight00:59Asia/Saigon:6bookings/6ObjectIdowners, invalid0,
conflicts0, equivalentindexabsent. Owner/_id digest giữ trong evidence local;
phải lấy lại trước apply. Chưa tạo index production.
