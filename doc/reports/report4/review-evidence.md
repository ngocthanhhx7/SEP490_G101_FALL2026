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

Google Docs đã nhận phần II.4–22 và các sửa ngữ nghĩa chính. Sau đó connector Drive
không còn khả dụng và browser tool trả “Local browser use is disabled in Work
settings”; không đổi setting hoặc cố vượt quyền. Bản local DOCX/Markdown/native
draw.io chứa các đính chính cuối về contact/trainer/receipt/PWA; đồng bộ những
đính chính cuối lên Google Docs và refresh mục lục vẫn là việc còn lại.
