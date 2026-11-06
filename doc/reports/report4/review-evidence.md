# Đối chiếu và kiểm tra Report 4 — 06/11/2026

## Nguồn đã đọc

Skill `paw-world-care-project`, operations/approved decisions; handoff/prompt và
quy trình local; AGENTS, README, CONTRIBUTING, package architecture, review rules,
component README và EC2 guide. Report 1, 2, 3 trong thư mục người dùng chỉ được
đọc làm tham chiếu, không sao chép vào repository. Đã đọc 95 UC trong Report 3,
scope Report 1, quản lý cấu hình/phân công Report 2 và mẫu SDS của trường.

Nguồn diagram là bản người dùng cung cấp tại `New folder`: Software Architecture,
package-diagram và các file class/sequence. Bản nguồn không bị sửa. Class/sequence
bổ sung dùng cùng mẫu; không đưa vào một loại sơ đồ hoặc cấu trúc report khác.
Gomaa Chapter 2 được đọc từ PDF người dùng cung cấp để đối chiếu notation; tài liệu
tham khảo không được coi là chỉ dẫn thực thi.

## Preflight hiện tại

- Remote main `f6a6dca`, develop `5381c62`; CI `application` hiện tại đạt. Các
  preview check lịch sử không phải acceptance production.
- Hai PR ngoài phạm vi 158 và 168 còn mở; không hợp nhất nội dung của chúng vào
  thiết kế như thể đã chạy production. Goods receipt giữ trạng thái cần tích hợp.
- Root checkout sạch, HEAD `57842d3`, sáu stash được giữ; worktree riêng từ develop.
  Hash `.env` local giữ nguyên. Chỉ có local API 3035 còn listener trong tập cổng
  cũ đã kiểm tra; không suy ra các UI/process cũ vẫn chạy.
- VPS current-release/REVISION cùng main `f6a6dca`, blue/3000; API readiness công
  khai và nội bộ đạt. Các container API/web/Mongo/OSRM hiện hữu. Hash production
  `.env` không đổi so với ghi nhận trước; không sửa file hoặc restart container.
- Đọc allowlist flag trong running container: AI, checkout, employee scheduling,
  dispatch, finance sources, visit travel và R2 đều true. Đọc aggregate count:
  model/outcome/review 0; visits 4. Không xuất danh tính hoặc nội dung record.
  Không suy ra acceptance provider hoặc feature completeness từ flag/count.

## Phương pháp và giới hạn

Schema reflection gọi factory trên Mongoose connection không kết nối DB, lấy
path/types/defaults/enums/private projection/index. Raw collection contracts đọc
từ repository writer/reader và provisioning. Một raw reader contract, nhất là
refund, không phải schema writer đã hoàn thiện. `Mixed`, conditional fields và
logical aliases được ghi rõ; không giả SQL FK hoặc implicit DB validation.

Trang UC là thiết kế logical theo SRS và các quyết định mới hơn; không phải log
trace endpoint đã chạy. Status SOURCE_IMPLEMENTED_NOT_LIVE_ACCEPTED nghĩa là đã
có phần source tương ứng, không có nghĩa pass từng business/provider acceptance.
PARTIAL_SCOPE_OR_ACCEPTANCE và DESIGN_PENDING_RUNTIME nêu phần còn thiếu trong
registry. Chưa triển khai source của incident/shop/stock hoặc sửa nghiệp vụ để
"làm cho diagram đúng" trong nhiệm vụ chỉ tài liệu này.

Đối chiếu source gồm app/runtime/module composition, session/OTP/current-role
checks, pricing/matching repositories, operational ranker/model registry/trainer,
checkout snapshots and boarding splits, employee guards/offers/acceptance, care
acknowledgement/access/check-in/out, signed contract/gender lifecycle, verified
payOS receipt replay/reconciliation, complaint/financial holds, product order
stock transitions, notifications, payroll/settlement source separation và indexes.

## Kết quả kiểm tra

`npm run check:architecture`, backend lint và frontend lint đạt.
Frontend build đầu tiên không đạt do junction tới dependencies cũ thiếu chart.js;
không sửa thư mục dependency đang dùng. Đã tạo checkout kiểm tra riêng cùng baseline,
chạy `npm ci --ignore-scripts`, lint và build đạt; còn cảnh báo chunk lớn.
Install ghi 21 advisories dev/transitive theo lockfile hiện có, không chạy audit-fix.
`git diff --check` đạt. Thay đổi chỉ tài liệu/diagram nên không tạo business test
vô nghĩa; CI của PR được ghi riêng khi thực sự hoàn thành. Build không chứng minh
tính đúng của diagram hoặc acceptance provider.

Các file XML được kiểm tra ID/parent/source/target và geometry; trang UC bao phủ
đúng 01–95 không thiếu/trùng; model inventory bao phủ 103 collection contracts.
Viewer diagrams.net được dùng render native XML để kiểm tra bố cục, sửa label
kiến trúc chồng nhau và tách hai HTTP request trong booking/payment-link.
Đã xem ảnh render architecture, matching class, ProductSales class, booking/payment,
schema entity cards và các trang UC booking/stock. Không gọi đây là kiểm tra mắt
thủ công mọi trang. Các kết quả checker chi tiết lưu trong validation.json.

Google Docs được cập nhật bằng range có revision guard; ảnh giữ nguyên để user
thay từ PNG. Lần điền đầu đối chiếu đúng 42 heading gốc, 18 header bảng/số cột và
13 inline image IDs. Sau chỉ dẫn tiếp theo của user, bổ sung có chủ đích các mục
4–22 trong II với 167 heading/subheading theo cùng mẫu Class/Sequence; các heading
gốc, bảng và ảnh vẫn được bảo toàn. Kiểm tra cuối có 209 heading (42 gốc), 18 bảng,
13 ảnh và đủ 95 mã UC; một inline image ID đổi nhưng decoded bitmap 2048 × 1821
giữ nguyên SHA-256, không ghi đè kích thước hiện tại. Đã bỏ phần lặp 95 tóm tắt ở IV sau khi đưa
thiết kế vào II. Mục lục refresh sau thay ảnh.

Bộ bổ sung có 35 luồng ngoài UC cũ, 11 proposed schema contracts và các trang
class design riêng cho phần chưa có writer/runtime. Các file Class dùng đủ
operation đọc từ public factory interface; giãn khoảng dọc/compartment khi chữ
bị cắt, giữ pattern và cột bố cục. Frontend/backend package pages được so sánh
XML với nguồn của nhóm và giữ nguyên; overall chỉ sửa nhãn như đã mô tả.

Đã phân biệt public factory return interface với các callback/private port khi
trích AST. API model review thực tế yêu cầu Admin/reviewReference/version/hash/MAE,
nhưng không tự chứng minh importer khác reviewer. Diagram và Report 4 nêu rõ đây
là gate quy trình độc lập, không bịa một phép kiểm tra actor chưa có trong source.

Nhiệm vụ này không triển khai runtime: VPS tiếp tục ở reviewed main nêu trên.
Không kiểm thử thanh toán/OTP thật, ghi hợp đồng, ký thay, tạo booking thực hoặc
giả dữ liệu training. Trạng thái GitHub review/CI/merge là bằng chứng riêng,
không khẳng định một người đã đọc thủ công khi thao tác được agent hỗ trợ.

## Sửa sau review ngữ nghĩa

Review độc lập phát hiện và đã sửa: ánh xạ service sai trong supplemental sequence;
readiness/ranking thuần đọc/tính toán bị gán durable business write; thiếu explicit
raw collection indexes/provenance; UC-88 phải tách GET khỏi POST read receipt và
hỗ trợ mọi role đăng nhập. Đã kiểm tra lại delivery uncertainty của contact form,
trainer ghi model/evidence thành hai file tuần tự, và receipt NOT_FOUND trả 404.
Không mô tả một contact retry store, ghi artifact nguyên tử hoặc audit write không
có trong source. Các bảng DOCX/schema được tái tạo cùng index provenance.

## Review bổ sung và đồng bộ Drive ngày 06/11/2026

Connector Google Drive đã hoạt động trở lại. Đã đọc revision hiện tại và đồng bộ
các đính chính bằng revision guard: EMP-02/UC-21 tách save, ISSUE, SIGN và approve;
PAY-03 tách supplement/recovery và từng decision; MAP-01 tách search/resolve khỏi
ghi địa chỉ. UC-75 chỉ đọc payroll của chính sitter, không có write transaction,
acceptance command hoặc tự đóng sau 3 ngày. MAIL-01 thể hiện UNKNOWN khi SMTP
không rõ acknowledgement hoặc lease SENDING hết hạn; không tự gửi lại các row đó.
ACCEPTED chỉ là SMTP chấp nhận, không phải inbox delivery.

Schema chuyển sang đúng mẫu bảng của người dùng: header vàng, viền cyan, cột
field/type và crow-foot. Port nối nằm ở biên bảng theo vị trí field; waypoint đi
qua khoảng trống, tránh phần chữ. 103 collection contracts nằm trên 18 trang
field catalog; 10 trang relationship view và 11 proposed schema pages được ghi
rõ phạm vi. Data dictionary giữ nguyên bốn cột; bổ sung 187 minLength/maxLength
constraints từ 93 Mongoose schemas qua disconnected reflection, không kết nối DB.

Đã xuất 212 PNG từ native workbooks bằng viewer diagrams.net. Xem ảnh render mới
của relationship view, UC-75 và MAIL-01; không khẳng định đã kiểm mắt mọi trang.
Google Docs hiện giữ 209 heading, 18 bảng và 13 ảnh gốc. Text đã đồng bộ; ảnh gốc
vẫn cần thay từ bộ PNG theo vị trí được phép giữ của người dùng. Bản DOCX local
được tái tạo từ snapshot mới, không khẳng định giữ nguyên pagination Google Docs.

PR200 chưa có approval. Những thay đổi sau commit 6346a3f cần được commit và
review lại đúng HEAD mới; các kiểm tra XML/count/path không thay review ngữ nghĩa.

## Tích hợp toàn bộ review F01–F12

Bản sửa sau a7374ab đã đối chiếu lại toàn bộ 95 UC và 35 supplemental flow.
19 class pages bổ sung được sửa dependency/ownership; giữ bốn mẫu gốc và các
compartment/ký hiệu của nhóm. Class tổng được dựng lại từ file riêng (33 trang).
Sequence tổng có 136 trang, gồm sáu mẫu chi tiết gốc và 130 flow được truy vết.
Các trang dùng tương tác source cụ thể, tách request/alt/loop/read/command/provider;
không áp generic replay acknowledgement cho query hoặc product management CAS.

Đã sửa các khác biệt source được phát hiện trong quá trình rà lại: employment
read có CONTRACT_READ audit; chỉ OSRM route cache lưu edge 15 phút; mail UNKNOWN
không tự retry; payment-reminder helper không tự chuyển OVERDUE; product-photo
xóa unretained blobs và không có avatar tombstone/history. Check-in hiện không
enforce care ACK trong source writer, handover actor/guard và rating/objection
deadline chưa đồng nhất toàn bộ SRS nên được ghi rõ là khoảng trống. Không tự
triển khai business code hoặc giả acceptance để làm report có vẻ hoàn thành.

11 proposed schema contracts có 147 field contracts, 28 index specifications và
48 typed references; mọi state/command/event/reference scope đều ghi đề xuất,
không phải migration đã chạy. Cash/VietQR và guest counter orders cần adapter/
schema extension; current payments là PAYOS và ProductOrder.customerId là required.
Những policy tiền/role chưa duyệt vẫn là release gate.

Đã đồng bộ thêm 437 đoạn mô tả trên Google Docs bằng fresh revision guards.
Đối chiếu trước/sau: 209 headings không đổi, 18 bảng giữ row/column/header và
13 inline image IDs không đổi; có đủ 95 mã UC. Đã bỏ câu hướng dẫn template
giới hạn 2–3 design sets theo phạm vi mở rộng mà user đã yêu cầu. Hai tên cũ trong
TOC cache sẽ được refresh từ heading User/Pet hiện có khi chốt ảnh/phân trang.
Bản DOCX trong delivery được export native từ Google Docs, giữ format nguồn;
không dùng bản dựng local làm bằng chứng pagination chính xác.

Export PNG cũ bị viewport cap 1800 px làm cắt đáy trang dài. Đã bỏ cap và xuất lại
212 trang; kiểm actual image dimensions bằng manifest × deviceScale1.5 đạt đủ
212, không thiếu/cắt theo viewport. Xem các mẫu render source/proposed và các
đáy trang dài; không khẳng định mọi trang đã được kiểm bằng mắt. Bộ PNG dành cho
thay ảnh tại vị trí hiện có theo ủy quyền ban đầu; ảnh cũ trong Doc chưa bị thay.

Fresh GitHub lúc 18:08 Asia/Saigon vẫn main f6a6dca/develop5381c62; root clean,
sáu stash và local .env checksum giữ nguyên. GET /ready trên web/www/api đều200.
Probe nhầm /api/v1/ready trả404 trước đó không phải outage; đã kiểm đúng endpoint.
Không có source runtime/env/DB/provider mutations hay rollout VPS từ task tài liệu.
Commit sau tích hợp này vẫn cần independent final-SHA review và CI; chưa có approval.
