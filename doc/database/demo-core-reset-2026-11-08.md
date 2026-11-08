# Dọn workflow và pet sitter demo — 08/11/2026

User xác nhận dữ liệu hiện tại là demo; giữ đủ dịch vụ, sản phẩm, account,
chính sách và core. User yêu cầu xóa pet sitter demo cũ, không phải toàn bộ
account có role PET_SITTER. Source marker/manifest quyết định phạm vi, không dùng tên.

## Dữ liệu giữ lại

- Services/presentation/immutable versions, pricing và policy versions; giống/trait,
  service area/config, sản phẩm/ảnh/nhà cung cấp và stockOnHand.
- Admin/Staff/Customer và sitter không có marker seed Hanoi; contact, session,
  pet/address, hồ sơ ứng tuyển/hợp đồng/private media không thuộc nhóm bị xóa.
- Counters tạo mã, guards, audit account/hợp đồng, model/policy AI và marker provisioning.
  Giữ counter để không tái sử dụng mã cũ. Không sửa `.env` hoặc object storage.

## Phạm vi command

`resetDemoWorkflows` trong backend services là operator-only; không có HTTP route.
49 collection workflow trong allowlist source được xóa document: booking/visit,
receipt/payment intent/tax/case/refund, orders/cart, review, notification, command/event
workflow, payroll transactions và legacy earning/settlement. Không drop collection/index.
Seeded sitter chỉ được chọn nếu role PET_SITTER và fixtureKey bắt đầu đúng
`hanoi-coursework-2026-10-30-v1:sitter-`. Mixed-role bị chặn. Mọi document được
chọn ở 8 store users/application/status/public/capability/availability/revision/contract
phải có trong manifest seed; record mới không có manifest bị chặn, không tự suy quyền xóa.

Census chỉ đọc lúc lập kế hoạch: 42 sitter có marker, 4 sitter khác được giữ. Workflow
97 document; seeded sitter 336 document thuộc 8 collection. Tổng dự kiến433document,
chưa là kết quả apply. Core trước/ sau được kiểm bằng hash BSON, không chỉ đếm.

Manifest demopopulationruns chỉ bỏ các references đã xóa, giữ marker run và thêm
`demoSittersRetired` để seed thông thường trả ALREADY_APPLIED, không tạo lại42sitter.
Không gỡ toàn manifest vì nó còn quản lý demo customer/pet/address được giữ.

## Tồn kho và liên kết

Đơn PLACED/READY giữ quantityHeld; phải bằng tổng lines của mọi đơn đang giữ chỗ.
Mismatch, sản phẩm thiếu hoặc version không hợp lệ chặn toàn bộ. Giữ stockOnHand,
giá và metadata; chỉ quantityHeld=0 và version+1 ở sản phẩm có reservation. Census
có1order giữ4units/2products. Không hoàn stock các đơn đã giao hoặc suy ngược lịch sử.
Mọi retained BSON được quét recursive cho references tới ID đã xóa, unknown store
cũng bị kiểm. Reference còn sót chặn toàn bộ; không tự mở rộng allowlist để xóa theo.

## Dry-run và apply

Đọc tối đa2.000doc/collection,5.000doc/DB,16MiBBSON, maxTimeMS5s, pool1. Source
và dự kiến after-state băm theo từng collection từ snapshot transaction. Không export
raw records/IDs/contact. Dry-run không ghi; output chỉ count/hash/collection names.
Apply phải cùng DB được xác nhận, digest fresh, explicit writersFrozen và approval
cho đúng operation. Toàn bộ delete/product-release/manifest-prune/postcheck trong
một transaction majority; mismatch/error rollback toàn bộ.

CLI `backend/scripts/database/reset-demo-workflows.js` mặc định dry-run. Apply cần
`--apply`, `CONFIRMED_DEMO_RESET_DATABASE`, `CONFIRMED_DEMO_RESET_DIGEST` và
`CONFIRMED_DEMO_WRITERS_FROZEN=true`. Đây chỉ là gate kỹ thuật, không tự xác nhận
user approval hoặc freeze. Không được chạy apply bằng startup/deployment/seed.

## Cutover và rollback

1. Review source/CI và kiểm thử MongoDB synthetic: đúng marker, retained BSON,
   stale digest, dangling ref, stock mismatch, protected roles và transaction abort.
2. Backup mới và isolated restore, lưu BSON/index/validator manifest. Thử reset trên
   restore cô lập trước live. Không đưa backup/private data vào Git hoặc release.
3. Freeze tất cả API writers, worker/mail/dispatch và operator seed/provision.
   Deploy lock không đóng HTTP. TTL/session expiry có thể thay digest nên preflight
   phải lấy lại trong window freeze; state khác dự kiến thì dừng.
4. Xin xác nhận concrete count/list/stock/manifest update sau chuẩn bị. Apply exact
   approved SHA/DB/digest và xác minh retained hashes trong transaction trước commit.
5. Recheck core counts/hashes, refs, products reservation, readiness/auth/catalog;
   mở writers sau xác minh. Không tạo booking, callback hoặc gửi mail để smoke test.

Trước mở writer lại, rollback có thể restore backup đã thử trong maintenance window.
Nếu đã có write mới thì không restore toàn DB ghi đè giao dịch; cần selective rollback
đối chiếu exact ID/hash/foreign references và stock versions. Không giả vờ có thể
rollback bằng source release vì delete data khác code change.

Cleanup document không giảm physical100collections. Cần profile/authority retirement
và source không tái tạo collection trước đợt drop riêng. Demo reset không thay quyết
định vừa được user duyệt: complaint chưa có kết luận giữ hoa hồng booking liên quan,
lương cơ bản/phụ cấp giữ nguyên. Commission hold implementation là scope tiếp theo;
không tự dùng legacy financiallocks làm authority payroll.
