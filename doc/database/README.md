# Database contracts — Paw World Care

Thư mục chứa thiết kế logical records, quan hệ, khóa/index đề xuất, snapshots và invariants. P01 chuẩn hóa Mongoose schema; module owner và P34 áp migration/tích hợp theo phân công. Thiết kế không là bằng chứng database hoặc transaction đã chạy.

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
