# Report 4 — Software Design Specification

Thiết kế đối chiếu ngày 06/11/2026 với develop `5381c62` và production main
`f6a6dca`. Hai nhánh có cùng cây nguồn frontend/backend tại lần kiểm tra.
[Report trên Google Docs](https://docs.google.com/document/d/1uKvLla8Bx-R46vO_NSDGfhxhgylYA3UMm8umdKMx-GE/edit?tab=t.0)
giữ nguyên cấu trúc trường, tiêu đề, 18 bảng và số cột, cùng các vị trí ảnh.
Các ảnh cũ được giữ để thay bằng PNG xuất từ các file dưới đây.

Bản local đã chứa các sửa sau review ngữ nghĩa. Google Docs còn cần đồng bộ
đính chính cuối về contact delivery, trainer ghi hai file tuần tự và notification
receipt 404, rồi thay PNG/refresh mục lục. Connector Drive hiện không còn khả dụng;
browser control bị tắt trong Work settings. Không coi bản Google Docs là đã hoàn
thành đồng bộ cuối chỉ vì các file local đã được sửa.

## File để sử dụng

- [Software Architecture](architecture/software-architecture.drawio): bản sao trang
  kiến trúc Node/React trong nguồn của nhóm, giữ bố cục các tier và vị trí box.
- [Package Diagram](architecture/package-diagram.drawio): ba trang backend,
  frontend, overall. Hai trang frontend/backend giữ nguyên bố cục, quan hệ và nội
  dung; overall sửa nhãn transport/provider và tách trách nhiệm pricing/matching.
- [Class Diagram](class-diagrams.drawio): các trang giá, matching, booking/payment,
  tuyển dụng và các góc nhìn domain bổ sung theo cùng mẫu compartment/quan hệ.
- [Sequence Diagram](sequence-diagrams.drawio): các trang chi tiết của mẫu gốc và
  một trang cho từng UC-01–UC-95. Các trang UC là thiết kế tương tác logical,
  không tự khẳng định mọi thao tác đã có route runtime hoặc được nghiệm thu.
- [Data Schema](database/data-schema.drawio): 103 collection contracts, gồm
  93 Mongoose model và 10 collection repository quản lý trực tiếp.
- [Data relationships](database/data-relationships.drawio): các liên kết logical
  customer/identity, employment/dispatch, product, AI, booking/care/payment,
  payroll và legacy settlement. Liên kết do ứng dụng quản lý, không phải SQL FK.
- [Nội dung Report 4](report4-content.md): bản đối chiếu text, giữ các mục và cột
  của Google Doc; bản này không chứa bản sao nhị phân Report 1–3.
- [Bảng mô tả schema](data-schema.md): đúng bốn cột `Column`, `Type`,
  `Constraints`, `Notes`, kèm source/index cho mỗi model/collection.
- [Proposed domain schema](planned-data-schema.md) và
  [draw.io](database/planned-domain-schema.drawio): 11 hợp đồng thiết kế còn cần
  triển khai, gồm day-off/change request, incident extension, goods receipt/stock,
  grooming, faulty claim, access-note audit và tier. Tách rõ khỏi 103 collection
  hiện tại; không giả đã có migration hoặc chính sách được duyệt.
- [Schema inventory](schema-inventory.json): kết quả reflection khi không kết nối
  database, bổ sung hợp đồng raw collection từ repository; không chứa dữ liệu thật.
- [Detailed Code Design](detailed-code-design.md): các mục 4–22, đúng mẫu
  Class Diagram rồi Sequence Diagram cho từng luồng; không thay bằng một danh
  sách trong phần IV. Các mục 1–3 của nhóm được giữ và bổ sung luồng review.
- [Supplemental flows](supplemental-flow-traceability.json): 35 luồng về training,
  hợp đồng/applicant, tạm ứng/điều chỉnh, settlement, jobs, mail, maps/media/contact.
- [Source module inventory](source-module-inventory.json): tên factory/operation
  đọc từ AST của 379 module JS; không phải bằng chứng gọi thành công mọi operation.
- [UC traceability](use-case-traceability.json): nguồn, actor, guard, tác động,
  nhánh thay thế và trạng thái triển khai từng use case.
- [Các nhãn thay đổi trong mẫu](diagram-changes.json) và
  [đối chiếu/kiểm tra](review-evidence.md).

Các class diagram biểu diễn module/port logical. Source sử dụng JavaScript factory
và dependency injection; abstraction persistence không phải bằng chứng source có
class `BaseRepository`, inheritance hoặc ownership vòng đời object tương ứng.
Các phép toán logical bổ sung cần được đối chiếu nguồn trước khi triển khai.

## Xuất ảnh để thay trong Report 4

Mở `.drawio` bằng diagrams.net, chọn đúng trang, dùng **File → Export as → PNG**,
bật **Crop**, nền trắng và scale 2× hoặc 3×. Giữ bản `.drawio` để đối chiếu.
Thay ảnh tại vị trí có sẵn, không xóa/thêm cột bảng hoặc đổi bố cục report.

| Vị trí có sẵn trong Report 4 | File/trang nguồn |
| --- | --- |
| I.1 Software Architecture | architecture/software-architecture.drawio, trang duy nhất |
| I.2.1 Overall Package Diagram | architecture/package-diagram.drawio, trang 3 |
| I.2.2 Frontend Package Diagram | architecture/package-diagram.drawio, trang 2 |
| I.2.3 Backend Package Diagram | architecture/package-diagram.drawio, trang 1 |
| I.3 Database Design | database/data-relationships.drawio; schema chi tiết ở data-schema.drawio |
| II.1.1 Matching Class Diagram | class/class-ai-matching.drawio |
| II.1.2 Calculate Service Price Quote | sequence/sd-pricing-quote.drawio |
| II.1.3 Recommend Pet Sitters | sequence/sd-ai-recommendation.drawio |
| II.2.1 Booking/PayOS Class Diagram | class/class-booking-payos.drawio |
| II.2.2 Create Proposal & Payment Link | sequence/sd-booking-payment.drawio |
| II.2.3 PayOS Webhook IPN | sequence/sd-payos-webhook.drawio |
| II.3.1 Onboarding Class Diagram | class/class-sitter-onboarding.drawio |
| II.3.2 Sitter Application Submission | sequence/sd-sitter-application.drawio |

Report gốc có một tiêu đề AI trùng số thứ tự và một heading trống. Giữ nguyên
theo yêu cầu không thay cấu trúc. Mục lục tự động cần refresh trong Google Docs
sau khi thay ảnh/phân trang; không gán số trang phỏng đoán. Theo yêu cầu bổ sung
của người dùng, phần II được mở rộng các mục 4–22 bằng đúng pattern của trường;
các cột và cấu trúc bảng vẫn giữ nguyên.

## Phạm vi và khác biệt cần lưu ý

Kiến trúc giữ mẫu tier/box nhưng sửa nhãn Axios → Fetch, JWT → session/CSRF,
Socket.IO → notification REST, Cloudinary → private R2/Mongo media,
Android gateway → eSMS, FastAPI/XGBoost/pickle → Node advisory ranker và optional
JSON additive model. Python là công cụ offline; Vietmap/OSRM cung cấp road ETA,
không cung cấp nhãn satisfaction hoặc một model giao thông đã huấn luyện.

Tại lần đọc production, các flag liên quan đều bật nhưng model/outcome/review
đều bằng 0. Không có model được duyệt: rule weights 30/25/20/15/10 được dùng.
Model training cần ít nhất 200 quan sát/50 booking groups có label xác minh,
feature đúng thời điểm, tách thời gian theo booking và review artifact/evidence.

Report 2/3 là nguồn tham khảo lịch sử. EC2/Cloudflare/private R2 thay deployment
Render/Vercel/Atlas trước đây. FT 40 giờ/PT 20 giờ và ca tự đăng ký sau hợp đồng,
PREPAY 15 phút và các quyết định đã duyệt mới hơn không bị ghi đè. EmergencyContact
và standalone DayOff còn là logical design; bảng trong report nêu đúng sự thiếu
schema, không giả collection. Sale Staff chưa là role schema riêng; tier và các
mức hủy/hoàn/trách nhiệm chưa được duyệt không được tự tạo.

Chỉ sửa tài liệu/diagram. Không có migration, seed, chỉnh `.env`, thao tác dữ liệu
nghiệp vụ hoặc lý do triển khai lại application lên VPS từ thay đổi này.

## Bản sửa theo mẫu schema và review bổ sung

Schema hiện dùng đúng mẫu bảng header vàng/viền cyan, field/type và quan hệ
crow-foot; các đường nối đi ngoài vùng chữ. `data-schema.drawio` có 18 trang
cho 103 collection contracts; `data-relationships.drawio` có 10 trang theo miền.
Bảng mô tả vẫn giữ Column, Type, Constraints, Notes và có giới hạn độ dài cụ thể.
EMP-02/UC-21, PAY-03, MAP-01, UC-75 và MAIL-01 đã tách tương tác theo source.
Google Docs đã đồng bộ text mới; ảnh gốc được giữ để thay bằng PNG theo chỉ dẫn
ban đầu. Đủ trang và validator PASS không đồng nghĩa đã có approval cuối.
