# Requirements — Paw World Care

Thư mục lưu bản phân tích yêu cầu, crosswalk và bản bổ khuyết có version để review. Không lưu toàn văn báo cáo nội bộ, dữ liệu khách hàng hoặc cấu hình AI cục bộ. Tài liệu yêu cầu không chứng minh ứng dụng đã chạy.

P00 ngày 14/10/2026 do Nguyễn Ngọc Thành phụ trách theo chỉ định người dùng:

- [Kiểm kê nguồn và crosswalk 66 UC / 70 WBS v1.0](p00-source-crosswalk-v1.md).
- [Bổ khuyết UC/WBS, dependency, estimate và lịch v1.0](p00-amendments-v1.md).
- [Quyết định, thuật ngữ, màn hình và gate v1.0](p00-decisions-screens-v1.md).
- [Bàn giao và bằng chứng kiểm tra P00](p00-handoff.md).

Các bản v1.0 là draft cục bộ để review; DOCX/XLSX gốc trên Drive chưa cập nhật. SRS hiện có change log cuối 09/10, đọc ngày 14/10; yêu cầu người dùng 14/10 là delta riêng. Không gộp các mã UC workbook 08/10 và SRS 09/10 khi chưa qua crosswalk.

Các tệp `doc/implementation-prompts/` có sẵn trước P00 vẫn là công việc chưa commit của người dùng; P00 không ghi đè hoặc stage các tệp này. Bộ P00 chứa bảng kiểm kê và bản bổ khuyết riêng, có thể review độc lập. Việc triển khai module và đồng bộ nguồn chính thức đi theo gói được giao tiếp theo.

P50-A — Dog/cat intake requirements and field dictionary:
- [Từ điển trường hồ sơ chó/mèo P50-A v1.0](p50-dog-cat-pet-profile-field-dictionary-v1.md) — draft for P01/P15; no schema or implementation claim.

P51-A — Financial cancellation and settlement contracts:

- [Hợp đồng tài chính và quyết định P51 v1.0](p51-financial-contract-v1.md): phương án đã được người dùng duyệt và chi tiết còn mở, trạng thái, tiền và quyền.
- [Bàn giao P51](p51-handoff.md): phạm vi, dependency, checks tài liệu và gate implementation.
- [API/events/acceptance](../api/p51-financial-api-v1.md) và [data/ledger](../database/p51-financial-ledger-v1.md): đề xuất kỹ thuật cho P01, chưa có runtime.

P37-A bổ sung [crosswalk SRS/UC và trạng thái thực thi v1.0](p37-srs-uc-synchronization-v1.md). Đây là bản audit cục bộ; chưa tuyên bố nguồn Drive đã được sửa.

- [Bộ quy tắc chọn Pet Sitter, tính điểm và xếp lịch v1](pwc-sitter-matching-scheduling-rules-v1.md): đề xuất ngày 17/10/2026; gồm điều kiện bắt buộc, điểm 100, ETA/chèn tuyến, offer/assignment, quyền địa chỉ và tiêu chí nghiệm thu. Chưa phải policy được xuất bản hoặc xác nhận runtime đã triển khai.
