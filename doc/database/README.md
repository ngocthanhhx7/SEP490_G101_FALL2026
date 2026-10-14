# Database contracts — Paw World Care

Thư mục chứa thiết kế logical records, quan hệ, khóa/index đề xuất, snapshots và invariants. P01 chuẩn hóa Mongoose schema; module owner và P34 áp migration/tích hợp theo phân công. Thiết kế không là bằng chứng database hoặc transaction đã chạy.

- [P51 financial ledger/data v1.0](p51-financial-ledger-v1.md): integer VND, allocation/receipt/refund/earning, weekly quota và reservation xuyên tuần; công thức còn mở chưa được triển khai.
- [P01 logical data/schema/index/atomic contract v1](p01-data-contract-v1.md):17 entities, snapshots và multi-document transaction/occupancy guards; chưa có models/migration hoặc DB verification.
