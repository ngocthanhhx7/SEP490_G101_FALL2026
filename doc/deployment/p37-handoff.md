# P37 handoff — Đồng bộ SRS, SDS, sơ đồ và truy vết

**Ngày:** 15/10/2026 (Asia/Saigon)
**Trạng thái:** `DOCUMENT_SYNC_READY_WITH_INTEGRATION_GATES`

## Phạm vi đã chuẩn bị

- P37-A: [SRS/UC/EXT crosswalk](../requirements/p37-srs-uc-synchronization-v1.md), gồm đủ UC-01…UC-66 và EXT-01…EXT-28.
- P37-B: [SDS/API/diagram synchronization](../architecture/p37-sds-api-diagram-synchronization-v1.md), phân biệt module đã mount và module export chờ P34.
- P37-C: [test traceability/evidence](../testing/p37-traceability-evidence-v1.md), ghi kết quả lint/test thật và các QA gate còn mở.
- P37-D: [WBS/source synchronization](../references/p37-project-plan-source-sync-v1.md), ownership, dependency, estimate delta và thứ tự patch Drive.

## Kiểm tra thực tế

| Phần | Kết quả |
| --- | --- |
| Backend lint | PASS |
| Backend tests | PASS — 48 suites / 472 tests |
| Frontend lint | PASS |
| Frontend tests | PASS — 52 suites / 378 tests |
| Markdown relative links, trailing whitespace trên tệp P37 | PASS |

Chưa thực hiện provider delivery, staging/load, thiết bị thật, Figma review hoặc full end-to-end. Fixture và memory database chỉ chứng minh các contract đã được test.

## Quyết định và dependency mở

- P34 cần register các route export-only và wiring repository thật.
- P01/P51 cần chốt FIN-01…08 trước khi gọi booking/payment/refund/settlement đã verified.
- Provider SMTP/eSMS/payOS/private media, approved policy content và Figma frame IDs còn thiếu.
- P36/P38 cần tiếp tục kiểm tra device, performance, UAT và các negative/race/deadline cases trong ma trận P37-C.

## Git và attribution

Workspace đang ở nhánh `feature/p36-a-system-security-performance-and-mobile-qa`, HEAD `9dfe6ed`, có nhiều thay đổi chưa commit ngoài P37. Vì vậy P37 handoff chỉ ghi nhận diff tài liệu; chưa commit, push, PR, approval hoặc merge để tránh trộn công việc. Khi tách nhánh theo bảng P37-D, owner thực tế phải dùng account đã xác minh; reviewer độc lập approve head cuối; Leader mới merge vào `develop`.
