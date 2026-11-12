# Database contracts — Paw World Care

Thư mục chứa thiết kế logical records, quan hệ, khóa/index đề xuất, snapshots và invariants. P01 chuẩn hóa Mongoose schema; module owner và P34 áp migration/tích hợp theo phân công. Thiết kế không là bằng chứng database hoặc transaction đã chạy.

- [Acceptance tối ưu database/API — 08/11/2026](optimization-acceptance-2026-11-08.md): kết quả đã triển khai/kiểm chứng, runtime, backup/recovery và giới hạn provider/retention còn lại.
- [Backlog thống nhất](optimization-backlog-2026-11-08.md) và [ma trận lifecycle/retention](lifecycle-retention-matrix-2026-11-08.md): bao phủ 50 source IDs; queue đã retire theo quyết định riêng, không áp TTL mới.

Các thiết kế và checkpoint cũ bên dưới giữ ngữ cảnh lịch sử; không dùng số collection hoặc trạng thái phê duyệt cũ thay cho acceptance mới.

- [P51 financial ledger/data v1.0](p51-financial-ledger-v1.md): integer VND, allocation/receipt/refund/earning, weekly quota và reservation xuyên tuần; công thức còn mở chưa được triển khai.
- [P01 logical data/schema/index/atomic contract v1](p01-data-contract-v1.md):17 entities, snapshots và multi-document transaction/occupancy guards; chưa có models/migration hoặc DB verification.


## Backend pricing và sitter matching data

Mongoose definitions tại backend/src/models/platform-data.model.js: Pet, CustomerAddress, AiBreed, AiTrait, AiPricingPolicy, AiSitterProfile, AiVisitOutcome, AiScheduleBlock, AiRoutingMatrix, AiDecision, AiRankingPolicy và AiRankModel. Canonical pets/addresses dùng ownerId; routing points chọn riêng, không public. Policy/source versions immutable qua API, outcome unique visitId; calendar writes CAS profile trong transaction. Seeds chỉ reference/configuration, không tạo user/rating giả. Xem [contract và local setup](../api/ai-pricing-matching-v1.md). AiDecision TTL dành estimate5/10phút không phải sổ booking/tiền; consumer phải snapshot cần thiết vào booking riêng.

Model names now split into pet-care/pricing/decision-snapshot/sitter-matching factories. Physical legacy Ai* collections are preserved explicitly by `model-definitions.js`; routing cache remains `airoutingmatrixes`. The aggregate platform factory is seed/test composition only.

- [MongoDB optimization plan — 07/11/2026](mongodb-optimization-plan-2026-11-07.md): baseline trực tiếp, inventory 103 collection, phạm vi audit và rollout/migration/rollback theo từng đợt.
- [Catalog audit storage — 07/11/2026](catalog-audit-storage-plan-2026-11-07.md): thiết kế dữ liệu gốc, loại bỏ audit trùng lặp qua provenance trong canonical version, validator và reverse migration.

- [Concurrency guard schema — 08/11/2026](concurrency-guard-schema-2026-11-08.md): mô tả khóa raw hiện hữu, sparse/hidden và concurrency invariants; không backfill/index mới.

- [Catalog effective reads — 08/11/2026](catalog-effective-reads-2026-11-08.md): dùng unique index hiện hữu cho point-in-time selection, giữ nguyên dữ liệu và index.

- [Booking owner index — 08/11/2026](booking-owner-index-2026-11-08.md): scoped cursor query, read/write tradeoff, explicit provision and deployment assertion.

- [Calendar batch reads — 08/11/2026](calendar-batch-reads-2026-11-08.md): bounded revision range, same-day version tie and snapshot consistency, no migration/index changes.

- [Collection architecture — 08/11/2026](collection-architecture-2026-11-08.md): ownership của 100 collection, legacy producer registration và các bước retirement/consolidation; chưa phê duyệt drop.

- [Demo core reset — 08/11/2026](demo-core-reset-2026-11-08.md): giữ catalog/account core, chọn sitter theo seed manifest và dọn workflow trong transaction; command mặc định dry-run, chưa phê duyệt live apply.

- [Employee storage profile — 08/11/2026](employee-storage-profile-2026-11-08.md): profile-aware composition/provisioning, protected legacy API retirement and authoritative booking commission holds.
