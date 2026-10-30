# Bộ dữ liệu và phòng thử AI local

Ngày 24/10/2026. Đây là sandbox tổng hợp để quan sát module AI thực xử lý; không phải dữ liệu khách, đánh giá hay sitter thật.

## Demo local dùng snapshot đường Hà Nội, 30/10/2026

Chế độ mới chạy riêng tại **http://127.0.0.1:3012/**, database chính xác
`paw_world_care_ai_grounded_demo`. Chế độ tổng hợp 3011 bên dưới vẫn giữ nguyên.
Từ `backend/` của checkout chứa snapshot đã thu thập:

```powershell
node scripts/demo-ai.js --grounded --apply --snapshot storage/ai-public/2026-10-30/hanoi-osrm-snapped-samples.json
```

Runner chỉ dùng Mongo loopback 27018/pwc-local, từ chối NODE_ENV production,
giữ bí mật phiên trong bộ nhớ, không gọi email/SMS hay đổi `.env`. Port được
giữ trước khi seed để lần chạy trùng không thay dữ liệu/secret phiên đang chạy.
Cookie riêng `pwc_grounded_session` tránh ghi đè cookie của demo 3011 và ứng dụng
local; chỉ khác port không tự cô lập cookie trong trình duyệt.

- Có 16 tài khoản `[DEMO]`, fixtureKey `ai-grounded-demo:*`, 6 pet và 11 profile.
  Các vai trò/email/nút OTP giống bảng bên dưới; năng lực, phê duyệt và lịch đều
  là **khai báo mô phỏng**, không phải người hoặc công việc đã quan sát.
- Không tạo outcome, rating, lỗi sitter, lịch sử chăm sóc hoặc model học máy.
  `rating=null`, số lượt/lỗi bằng 0. Chế độ này từ chối database đã có outcome/model
  và chặn API Admin import outcome/model; không xóa lịch sử để vượt gate.
- Tất cả vị trí xuất phát, địa chỉ, lịch và điểm đến clinic lấy đúng các điểm
  công khai đã snap lên đường trong snapshot 16×16. Điểm clinic chỉ là điểm đến
  mô phỏng, không xác nhận đó là cơ sở thú y hay nhà khách.
- Provider đọc ma trận bất đối xứng đã chụp, giữ `null` cho tuyến không có bằng
  chứng, từ chối tọa độ ngoài tập điểm; không tính đường chim bay hoặc gọi provider
  khác để bù dữ liệu. Source cache/header/response:
  `OSRM_STATIC_PUBLIC_SAMPLE_NOT_LIVE`. Có thời điểm chụp, profile car, hash graph,
  hash OSM và attribution OSM/ODbL. `snapshotCanonicalSha256` là hash JSON canonical
  nội bộ (`JSON.stringify`), không phải hash byte của file đã tải.
- Đây là replay OSRM tĩnh, không phải live traffic, thời gian chuyến đi thực tế,
  dữ liệu hài lòng hay kết quả huấn luyện. Quarantine Kaggle không được nhập thành
  rating/lịch sử. Xem [nguồn dữ liệu và kế hoạch](ai-real-data-2026-10-30.md).

Smoke local với snapshot thật ngày 30/10/2026: OTP/session thành công; cả sáu
tình huống trả HTTP 201 và source đúng. Tất cả trả 0 ứng viên, thiếu 5; lý do
chủ yếu `BELOW_AUTOMATIC_THRESHOLD`, cùng loại trùng lịch/đình chỉ/năng lực.
Đây là giới hạn cold start của chính sách hiện tại: không có lịch sử thì fit
bằng 0 và tổng điểm có thể dưới 60 dù tuyến khả thi. Demo không hạ ngưỡng hoặc
thêm rating giả để làm đủ Top 5. Cần quyết định cold-start riêng trước khi đổi
chính sách production; không diễn giải các prior làm đánh giá công khai.

Regression ở `backend/tests/integration/grounded-demo.test.js` dùng snapshot
synthetic ghi rõ chỉ để test guard/replay/asymmetry/null/không có lịch sử và luồng
OTP/session thật trên Mongo replica set cách ly. Snapshot công khai thật ở storage
được ignore; không phải fixture training hoặc dữ liệu khách production.

Kiểm tra local cuối của chế độ mới: backend lint và architecture PASS; 4 test
grounded integration PASS. Bộ 5 integration test demo cũ PASS. Frontend lint,
lint trực tiếp script demo, 4 DOM test demo cũ/mới và build PASS; build vẫn báo
chunk ứng dụng lớn hơn 500 kB. Không có deployment hoặc đánh giá chất lượng
model từ những kết quả kiểm thử này.

## Mở và khởi động lại

Trang demo: **http://127.0.0.1:3011/**. Máy chủ chỉ bind loopback, không dùng localhost thay cho 127.0.0.1 vì có kiểm tra Host/Origin.

```powershell
cd D:\WW\SEP490_G101_FALL2026\backend
.\scripts\start-local-mongo.ps1
node scripts/demo-ai.js --apply
```

MongoDB URI: `mongodb://127.0.0.1:27018/?replicaSet=pwc-local`, database **paw_world_care_ai_demo**. Không sửa .env của ứng dụng chính; không dùng database paw_world_care_dev. Server tạo secrets tạm trong bộ nhớ, không in ra; khởi động lại tạo secrets khác và cập nhật Contact demo, do đó cần đăng nhập lại. Node_ENV production từ chối; không tự gọi script ở startup production. Không có command xóa toàn database.

Để dừng demo: Ctrl+C trong terminal chạy script. Nếu tiến trình đang được chạy nền bởi Codex, chỉ dừng PID đúng script demo, không dừng MongoDB hoặc backend3000. Ngày lịch tự chọn ba ngày sau thời điểm khởi động; chạy lại script khi lịch cũ quá hạn. IDs demo ổn định, seed lại cập nhật đúng fixtures, không nhân bản số lượng. Seed lại cũng khôi phục fixture về cấu hình chuẩn, nên thay đổi Admin trong sandbox có thể được đặt lại.

## Tài khoản và dữ liệu có sẵn

Tổng **16 accounts**, **6 pet**, **7 địa chỉ**, **11 hồ sơ sitter đã duyệt**, **11 trạng thái sitter**, **11 profile năng lực**, **2 block lịch**, cùng lịch sử outcome tổng hợp cho cả3 dịch vụ. Mỗi khách có chó Poodle6kg và mèo Anh4kg, hai địa chỉ tại khu vực DEMO-HN/DEMO-TWO; An có thêm một địa chỉ phòng khám tổng hợp. Có3 dịch vụ,24 breeds,5 traits và pricing/ranking policies.

| Account/email demo | Vai trò | Dùng để |
| --- | --- | --- |
| customer-an@pwc-demo.example | CUSTOMER | Chạy sáu tình huống chuẩn |
| customer-binh@pwc-demo.example | CUSTOMER | Kiểm tra quyền sở hữu khác An |
| customer-chi@pwc-demo.example | CUSTOMER | Pet/địa chỉ riêng, dữ liệu lịch sử tổng hợp |
| admin@pwc-demo.example | ADMIN | Phiên Admin thật để test API Admin trong sandbox |
| staff@pwc-demo.example | STAFF | Kiểm tra giới hạn quyền |
| sitter-lan@pwc-demo.example | PET_SITTER | Nhiều kinh nghiệm, quen chó của An |
| sitter-minh@pwc-demo.example | PET_SITTER | Kinh nghiệm tốt, vùng DEMO-TWO |
| sitter-ha@pwc-demo.example | PET_SITTER | Nhiều lượt, review4 sao |
| sitter-nam@pwc-demo.example | PET_SITTER | Ít kinh nghiệm hơn |
| sitter-linh@pwc-demo.example | PET_SITTER | Nhận nhiều dịch vụ |
| sitter-phuc@pwc-demo.example | PET_SITTER | Điểm xuất phát xa hơn |
| sitter-trang@pwc-demo.example | PET_SITTER | Trùng10:00–10:30; sau đó rảnh |
| sitter-duc@pwc-demo.example | PET_SITTER | User vẫn ACTIVE nhưng SitterStatus SUSPENDED, bị loại matching |
| sitter-mai@pwc-demo.example | PET_SITTER | Chỉ nhận mèo |
| sitter-khoa@pwc-demo.example | PET_SITTER | Có lịch09:00–09:15 gần nhà khách |
| sitter-huy@pwc-demo.example | PET_SITTER | Có6 lỗi đã đối soát tổng hợp |

Không có mật khẩu. Nút **Đăng nhập qua OTP demo** gọi `/api/v1/otp-challenges`, đọc OTP từ hộp thư local demo, rồi gọi `/api/v1/sessions`. Không dùng OTP cố định, không bỏ xác thực/CSRF ở runtime. OTP/chống spam vẫn theo cấu hình chuẩn; đổi lại cùng account quá nhanh có thể cần đợi60 giây. Email `.example` không gửi ra ngoài. Hộp thư local cố ý xem được trong sandbox, không được đưa `/demo/inbox` vào server thật.

User.synthetic=false là yêu cầu kỹ thuật của session/candidate gate hiện tại để test đăng nhập đầy đủ; mọi User ở đây có fixtureKey ai-demo:* và tên [DEMO], chỉ nằm trong database được guard theo tên+loopback. Đây không phải người dùng thật hoặc training data thật.

## Thao tác xem thuật toán

1. Mở trang, chọn **CUSTOMER — Khách An**, nhấn đăng nhập.
2. Nhấn **Tính giá30 phút**: giá80000đ nếu pricing seed chưa sửa.
3. Nhấn **Test phí đơn trên5 triệu**:60phút×32 lượt=5120000đ, phí2%=102400đ, tổng5222400đ.
4. Chọn **Nhiều sitter**, nhấn Đề xuất: Top5, xem từng đóng góp điểm; Lan có ưu tiên quen pet, Đức bị ngưng, Trang trùng lịch, Mai không nhận chó.
5. Chọn **Chỉ2 sitter**: returned2, shortfall3, INSUFFICIENT_ELIGIBLE_SITTERS; không giả thêm người.
6. Chọn **Đổi sang mèo**: Mai xuất hiện, ưu tiên quen chó của Lan không còn; có thể thấy Khoa lên trên.
7. Chọn **14:00**: Trang hết trùng, được xét lại; điểm/tải lịch thay đổi.
   Hai tình huống bổ sung: **Dắt chó đi dạo** dùng lịch sử đúng dịch vụ; **Thú y** kiểm tra clinic, giờ hẹn10:45, slot10:00–12:00, chờ30 phút và đưa về. Báo giá thú y150000đ/lượt; test phí bậc dùng40 lượt=6000000đ +2%=6120000đ, không phải32 lượt của hai dịch vụ theo thời lượng.
8. Chọn Khách Bình rồi đăng nhập, thử báo giá yêu cầu chuẩn của An:404 vì pet không thuộc Bình. Nhấn **Báo giá pet của tôi** để gọi GET owned pets rồi báo giá cho chó thuộc chính Bình; tương tự với Chi.
9. Chọn sitter/Admin/Staff rồi đăng nhập, nhấn Xem phiên/quyền: API trả đúng roles. Gọi quote/match của Customer bằng vai trò khác bị403.
10. Xem bảng JSON để copy body/các ID. Chỉ cần F12 Network nếu muốn theo dõi request thật; không copy cookie/CSRF ra chat.

Đây là phòng thử AI độc lập, không phải toàn bộ dashboard Customer/Sitter/Admin đã xây xong. Không tạo Booking/Offer/Payment thật; block lịch và outcome là đầu vào mô phỏng cho AI. Có thể dùng cookie của demo trên cùng origin để gọi API bằng DevTools. Đừng dùng account ở đây để đăng nhập backend3000/database khác.

## Routing được mô phỏng rõ ràng

Demo inject provider tính ETA tổng hợp có kiểm soát, không gọi OSRM/public Internet và không có live traffic. Source cache DEMO_SIMULATED_NOT_OSRM; HTTP header X-PWC-Demo-Routing=SIMULATED_NOT_OSRM. Wrapper demo gắn routingSource=DEMO_SIMULATED_NOT_OSRM và meta.demoFixture=true vào response; không sửa module production. Điểm chỉ minh họa thuật toán với fixture ETA, không chứng minh khả năng đến nhà đúng giờ thực tế.

Nếu cần kiểm thử vận hành thật: dùng ứng dụng chính với OSRM trusted, địa chỉ đã xác nhận, sitter đã duyệt và lịch thật; không chuyển fixture rating sang database thật hoặc dùng để train model production.

## Source và kiểm tra

- backend/scripts/demo-ai.js: runner tường minh, port3011, secrets bộ nhớ, không đổi .env.
- backend/scripts/demo-ai/fixtures.js: deterministic fixture IDs, guard database, mô phỏng routing.
- backend/scripts/demo-ai/server.js: wrapper local, static UI, inbox demo; reuse createApp + auth + AiService thật.
- frontend/demo-ai/: HTML/CSS/JS chỉ được server demo serve, không import vào bundle ứng dụng chính.
- backend/tests/integration/demo-ai.test.js: Mongo replica riêng, kiểm tra rerun, OTP/session, quote/tier, đủ5/thiếu3, species/time changes, ownership/roles, Host/Origin guards.

```powershell
cd D:\WW\SEP490_G101_FALL2026\backend
npm test -- --runTestsByPath tests/integration/demo-ai.test.js
```

Giới hạn: chưa có UI quản trị đầy đủ để sửa mọi profile; bảng demo là bản manifest khi seed, không tự refresh thay đổi Admin ngoài trang. Matching API vẫn đọc database thật của sandbox. AI ranking chỉ là đề xuất, chưa gửi lời mời hay gán công việc.

Kiểm tra ngày24/10/2026: backend lint đạt, 5 integration tests demo đạt trên replica set cách ly; frontend demo lint và3 DOM tests đạt (login/CSRF/render điểm/error/escape HTML). CLI chạy trùng cổng từ chối trước khi seed để không thay secrets của phiên đang chạy. Live HTTP đã kiểm tra OTP/session, quote và các tình huống matching; công cụ browser automation bị tắt trong Work settings nên không ghi nhận kiểm tra trực quan bằng browser tự động.
