# Database contracts — Paw World Care

Thư mục chứa thiết kế logical records, quan hệ, khóa/index đề xuất, snapshots và invariants. P01 chuẩn hóa Mongoose schema; module owner và P34 áp migration/tích hợp theo phân công. Thiết kế không là bằng chứng database hoặc transaction đã chạy.

- [P51 financial ledger/data v1.0](p51-financial-ledger-v1.md): integer VND, allocation/receipt/refund/earning, weekly quota và reservation xuyên tuần; công thức còn mở chưa được triển khai.
- [P01 logical data/schema/index/atomic contract v1](p01-data-contract-v1.md):17 entities, snapshots và multi-document transaction/occupancy guards; chưa có models/migration hoặc DB verification.


## AI pricing/matching data

Mongoose definitions tại backend/src/models/platform-data.model.js: Pet, CustomerAddress, AiBreed, AiTrait, AiPricingPolicy, AiSitterProfile, AiVisitOutcome, AiScheduleBlock, AiRoutingMatrix, AiDecision, AiRankingPolicy và AiRankModel. Canonical pets/addresses dùng ownerId; routing points chọn riêng, không public. Policy/source versions immutable qua API, outcome unique visitId; calendar writes CAS profile trong transaction. Seeds chỉ reference/configuration, không tạo user/rating giả. Xem [contract và local setup](../api/ai-pricing-matching-v1.md). AiDecision TTL dành estimate5/10phút không phải sổ booking/tiền; consumer phải snapshot cần thiết vào booking riêng.
