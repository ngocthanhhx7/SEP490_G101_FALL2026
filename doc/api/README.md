# API contracts — Paw World Care

Thư mục chứa hợp đồng REST, DTO/events, quyền và lỗi để review trước triển khai. Tài liệu đề xuất không chứng minh endpoint/provider đang chạy; P01 quản lý chuẩn schema/DTO, P34 quản lý route wiring.

- [P51 financial API/events và acceptance v1.0](p51-financial-api-v1.md): thiết kế cho cancellation, reschedule, payment, refund và weekly settlement; quyết định còn mở được gate rõ.
- [P01 domain DTO/REST/permissions v1](p01-api-permission-contract-v1.md), [entity/state registry](p01-contract-registry-v1.json) và [common JSON Schema](p01-common.schema.json): baseline wire và quyền; chưa có endpoint/runtime, schema không thay domain validation.
