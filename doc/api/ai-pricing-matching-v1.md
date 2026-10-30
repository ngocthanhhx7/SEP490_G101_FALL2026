# Backend pricing và AI gợi ý Pet Sitter

Ngày 24/10/2026. JavaScript ESM/Express/Mongoose tại `backend/src/services/sitter-matching`. Pricing/pet-care mount khi AUTH_ENABLED=true, chỉ matching chịu AI_ENABLED. AI không quyết định giá và không tự gửi lời mời. Không gọi báo giá là hóa đơn; không gọi shortlist là assignment. Frontend booking chưa được chuyển sang module này trong thay đổi này.

## 1. Khởi động local và Node

Đã cập nhật máy và engines/lock root metadata sang **Node 24.22.1 x64 / npm 11.19.1**, nhánh LTS, đối chiếu https://nodejs.org/dist/index.json. Mở terminal mới nếu nvm chưa nhận NVM_HOME/NVM_SYMLINK.

Mongo local độc lập với Mongo 8.2 ở cổng 27017:

```env
MONGO_URI=mongodb://127.0.0.1:27018/?replicaSet=pwc-local
MONGO_DB=paw_world_care_dev
AUTH_ENABLED=true
AI_ENABLED=true
AI_ROUTING_URL=
```

Giữ các auth secrets hiện có trong .env, không copy chúng vào tài liệu. Database local **không phải bản sao Atlas**; tài khoản/dữ liệu Atlas không tự chuyển sang. Chưa có Customer thì đăng ký bằng OTP email trên web trước khi test API riêng tư.

```powershell
cd D:\WW\SEP490_G101_FALL2026\backend
# Khi khởi động lại Windows, chạy Mongo persistent đã cấu hình:
.\scripts\start-local-mongo.ps1
node --env-file-if-exists=.env scripts/seeds/service-catalog.js --apply
node --env-file-if-exists=.env scripts/seeds/registration-policies.js --apply
node --env-file-if-exists=.env scripts/seeds/pricing.js --apply
node --env-file-if-exists=.env scripts/seeds/sitter-matching.js --apply
npm run dev
```

MongoDB 8.0.34 bind 127.0.0.1:27018, replica `pwc-local`; lưu thật tại `backend/storage/mongodb-8.0`, không tự xóa khi dừng script. Không mở cổng ra mạng; đây là dev database loopback, không cấu hình production. Script mặc định dùng binary 8.0.34 đã có trong cache; có thể truyền -MongoBinary nếu cài ở đường dẫn khác. Không dừng hoặc thay đổi Mongo ở 27017. Compass dùng cùng URI trong .env; chọn database paw_world_care_dev.

## 2. Dữ liệu đã nạp

- 24 giống: 13 giống chó và 11 giống mèo, gồm mã mixed/unknown rõ ràng.
- 5 đặc điểm do khách khai báo, có mô tả và loài áp dụng.
- 3 dịch vụ giá ban đầu: home-visit 80.000 VND/30 phút; dog-walking 80.000 VND/30 phút; vet-escort 150.000 VND/lượt.
- Pricing policy có phiên bản cho ba dịch vụ; ranking 30/25/20/15/10.
- Theo xác nhận người dùng: mỗi **5.000.000 VND trọn bậc** của tổng đơn trước phí bậc cộng 2%. Dưới 5 triệu 0%; đúng 5 triệu 2%; đúng 10 triệu 4%. Mặc định quá 20% chuyển review, không âm thầm cắt số bậc.
- Chưa có bảng phần trăm theo từng giống/đặc điểm được duyệt: seed không tự áp giá đó. Policy ban đầu maxPets=1; thêm pet hoặc trait đặc biệt chuyển review nếu chưa có rule. Admin tạo phiên bản mới để công bố phí phù hợp. Không tự lấy giá trị mua thú cưng làm cơ sở thu phí.
- Danh mục giống không đồng nghĩa đã có hồ sơ pet của Customer. Database thật không được chèn sitter/rating giả để đạt số lượng 5; các dữ liệu đó nằm trong integration test Mongo cách ly. Script test-ai-api có tùy chọn rõ ràng tạo hai hồ sơ pet Demo thuộc Customer đăng nhập.

Seeds dùng setOnInsert/unique version và transaction, chạy lại không nhân bản danh mục hay ghi đè giá Admin. Migration correction riêng giữ vet-escort PER_VISIT, không nhân 150.000 với số giờ hẹn. Cần chạy seed trước khi gọi AI.

## 3. API và bảo vệ truy cập

API `{data,meta}` / `{error,meta}`, cùng origin, cookie và CSRF. Các đường dẫn cũ dưới `/ai` cho pricing/pets/catalog không còn được phục vụ.

| Method/path | Quyền | Mục đích |
| --- | --- | --- |
| GET /api/v1/pet-care/catalog | Customer | Giống/đặc điểm |
| GET /api/v1/pet-care/pets | Customer | Pet của chính mình |
| POST /api/v1/pet-care/pets | Customer + CSRF | Thêm pet |
| GET /api/v1/pet-care/addresses | Customer | Địa chỉ mình, không trả coordinates |
| POST /api/v1/pet-care/addresses | Customer + CSRF | Địa chỉ/ghim xác nhận |
| POST /api/v1/pricing/quotes | Customer + CSRF | Backend tính estimate 10 phút |
| GET /api/v1/pricing/quotes/:quoteId | Customer owner | Snapshot QUOTE |
| POST /api/v1/pricing/policies | Admin + CSRF | Policy giá phiên bản mới |
| POST /api/v1/ai/recommendations | Customer + CSRF | Shortlist, snapshot MATCH 5 phút |
| GET /api/v1/ai/decisions/:decisionId | Customer owner | Snapshot MATCH |
| POST /api/v1/ai/admin/ranking-policies | Admin + CSRF | Trọng số phiên bản mới |
| PUT /api/v1/ai/admin/sitters/:userId | Admin + CSRF | Năng lực/lịch với expectedVersion |
| POST /api/v1/ai/admin/schedule-blocks | Admin + CSRF | Block lịch với CAS |
| POST /api/v1/ai/admin/outcomes | Admin + CSRF | Outcome đã xác minh |
| POST /api/v1/ai/admin/models | Admin + CSRF | Import model qua quality gate |

Không chấp nhận baseAmount/score/ownerId/role do Customer truyền. Đọc giá từ ServicePriceVersion, kiểm tra ServiceVersion ACTIVE, ServicePolicy PUBLISHED và catalog enabled. Policy mới immutable qua API: không có PATCH ghi đè; duplicate version trả 409. Mutation có cookie session, Origin đúng host và X-CSRF-Token lấy từ GET /api/v1/me. Cấu hình hiện tại same-origin; không bật CORS tùy tiện.

## 4. Test nhanh bằng PowerShell

Sau khi đăng nhập Customer:

```powershell
Invoke-RestMethod http://localhost:3000/health
(Invoke-RestMethod http://localhost:3000/api/v1/pet-care/catalog).data.breeds
(Invoke-RestMethod http://localhost:3000/api/v1/services).data.services
```

Sau khi Customer đã đăng ký qua web, script dưới yêu cầu OTP thật; không in cookie/CSRF/password. Thêm -CreateSamplePets mới ghi hai pet Demo chó Poodle/mèo Anh vào tài khoản đó, chạy lại không nhân bản theo tên. Không tự tạo tài khoản Admin.

```powershell
cd D:\WW\SEP490_G101_FALL2026\backend
.\scripts\test-ai-api.ps1 -Email 'EMAIL_DA_DANG_KY' -CreateSamplePets
```

Script in breakdown báo giá và logout phiên test. Nếu chưa đăng ký, LOGIN OTP không tạo Customer. SMTP phải hoạt động; API 202 không đảm bảo thư đã đến inbox.

## 5. Test bằng DevTools trên web localhost:5173 sau đăng nhập

Copy vào Console do chính bạn thao tác. Các request dùng session hiện tại; không paste cookie/token lên chat.

```javascript
const me = await fetch('/api/v1/me').then(r => r.json());
const send = async (path, body, method = 'POST') => {
  const response = await fetch('/api/v1/ai' + path, {
    method, credentials: 'same-origin',
    headers: {'Content-Type':'application/json','X-CSRF-Token':me.data.csrfToken},
    body: JSON.stringify(body)
  });
  return {status:response.status, body:await response.json()};
};
const catalog = await fetch('/api/v1/pet-care/catalog').then(r=>r.json());
const services = await fetch('/api/v1/services').then(r=>r.json());
const serviceId = services.data.services.find(s=>s.code==='home-visit').id;
const pet = await send('/pets', {
  name:'Demo - Meo Anh', species:'CAT', breedCode:'cat-british-short',
  weightKg:4, traits:[], careNeedsConfirmed:true
});
const petId = pet.body.data.id;
const quote = await send('/quotes', {serviceId, petIds:[petId], durationMinutes:30, visitCount:1});
console.log(quote); // 201, totalVnd 80000 nếu bảng giá seed chưa sửa
```

Tạo địa chỉ bằng dữ liệu của bạn, xác nhận ghim chính xác trước gửi. Ví dụ dưới là tọa độ tổng hợp minh họa, không dùng làm địa chỉ nhà thật:

```javascript
const address = await send('/addresses', {
  label:'Demo', location:'Dia chi tong hop de test', coordinates:[105.8,21.0],
  areaCode:'HN', pointConfirmed:true
});
const recommendation = await send('/recommendations', {
  serviceId, petIds:[petId], addressId:address.body.data.id,
  startAt:'2026-10-28T10:00:00+07:00', endAt:'2026-10-28T10:30:00+07:00', limit:5
});
console.log(recommendation);
```

Đổi ngày luôn >=24h trong tương lai. Backend không tự tạo sitter: database chưa có sitter được Admin duyệt/lịch nguồn thì trả INSUFFICIENT_ELIGIBLE_SITTERS với candidates=[], shortfall=5. Đây là kết quả thật, không phải test thất bại. Nếu chưa cấu hình đường đi cho ứng viên, kết quả có ROUTING_UNAVAILABLE, không lấy đường chim bay giả làm ETA.

## 6. Cấu hình sitter và dữ liệu lịch để test ghép thật

Cần User PET_SITTER ACTIVE, SitterApplication APPROVED liên kết provisionedUserId, SitterStatus ACTIVE. Endpoint năng lực không tự cấp vai trò hay duyệt hồ sơ. Admin đăng nhập mới gửi được:

```json
{
  "expectedVersion":0,
  "serviceIds":["SERVICE_OBJECT_ID"],
  "species":["DOG","CAT"],
  "areaCodes":["HN"],
  "allowedTraits":[],
  "maxWeightKg":25,
  "maxPets":2,
  "windows":[{"weekday":3,"startMinute":480,"endMinute":1080}],
  "dayOffDates":[],
  "starts":[{"localDate":"2026-10-28","coordinates":[105.81,21.01],"availableFrom":"2026-10-28T08:00:00+07:00","availableUntil":"2026-10-28T18:00:00+07:00"}],
  "active":true
}
```

PUT /admin/sitters/USER_ID. weekday theo JS: Chủ nhật 0, thứ Hai 1. day origin và slot phải cùng ngày/khung làm việc. Lần tạo expectedVersion=0 trả version=1, lần sửa dùng version mới nhất. Hồ sơ năng lực chứa tọa độ không được trả ra Customer.

POST /admin/schedule-blocks cần sitterId/startAt/endAt/coordinates/kind/sourceRef; kind VISIT hoặc BREAK. Lượt thú y kết thúc tại phòng khám dùng endCoordinates riêng. Chặn trùng trong transaction cùng profile version. Đây là lịch đầu vào để AI kiểm tra, không phải command tạo booking/assignment. Adapter P01/P24 phải đồng bộ block và recheck occupancy khi nhận offer; không được tạo assignment chỉ từ shortlist.

POST /admin/outcomes mẫu:

```json
{"visitId":"VERIFIED_VISIT_ID","sitterId":"SITTER_ID","serviceId":"SERVICE_ID","petIds":["PET_ID"],"species":["CAT"],"occurredAt":"2026-10-23T04:00:00Z","resolution":"COMPLETED","rating":5,"onTime":true,"sourceRef":"operational-review/reference"}
```

Chỉ Admin import sau khi đối soát nguồn. COMPLETED mới có rating/onTime; SITTER_FAULT là lỗi đã xác minh, EXCUSED bị loại. Không cung cấp endpoint để Customer sửa điểm. Chưa có adapter hoàn tất visit tự động tạo outcome, nên không giả đây là thống kê tự cập nhật đầy đủ.

## 7. Routing provider

AI_ROUTING_URL trỏ OSRM riêng/trusted, ví dụ http://127.0.0.1:5000/; không dùng cổng backend 3000. Chưa cài OSRM trong thay đổi này, không gửi tọa độ thật tới demo public tự động. HTTP chỉ cho loopback, ngoài loopback yêu cầu HTTPS, không redirect/credential URL. OSRM static ETA không có giao thông trực tiếp; có đệm và cảnh báo nguồn.

Adapter đối chiếu [OSRM Table API chính thức](https://project-osrm.org/docs/v26.4.0/http): longitude,latitude; durations đơn vị giây → phút; null giữ unreachable; không bật fallback_speed. Cache 15 phút hash theo cặp tọa độ, hướng đi và profile driving. Mỗi sitter tối đa 50 điểm, 20 blocks/ngày; tối đa 4 worker, scan 200 ứng viên, query thống kê aggregate một lượt thay N+1. Truncated báo rõ; không tuyên bố top toàn thành phố khi mới xét tập giới hạn. Cần triển khai provider/dữ liệu vùng và benchmark trước production.

## 8. Giá và chỉ số

Một quote một dịch vụ theo P01. Cơ sở giá là duration units × số visit × giá hiện hành; PER_VISIT của vet giữ nguyên một đơn vị/lượt. Phụ phí % cộng trên cùng base (không lãi kép); fixed fee × số visit; PET nhân theo từng pet khớp, VISIT chỉ áp một lần/lượt. Exclusive group trùng trả review; giới hạn % vượt trả review. Rounding HALF_UP VND mỗi dòng bằng BigInt, chặn overflow. Phí 2%/bậc tính cuối trên subtotal, không tính lại trên chính fee. Không bao gồm viện phí hoặc scope chưa duyệt. Quote có TTL/versions; booking phải revalidate, không tự thu tiền hay đóng FIN gates.

Ranking có công thức và giải thích đầy đủ tại [bộ quy tắc](../requirements/pwc-sitter-matching-scheduling-rules-v1.md). Triển khai 5 thành phần 30/25/20/15/10, lấy species ít kinh nghiệm nhất cho lượt nhiều loài, kinh nghiệm/rating180 ngày, reliability90 ngày, history cùng pet. New sitter public rating null, prior nội bộ; không zero-rating giả. Tối đa 6h phục vụ/8h bận, nghỉ30 phút sau tối đa4h liên tục; bàn giao15, buffer đường max(10,20% ETA), chặng<=45 phút. Lịch cố định, không tự reschedule. Recommender không thực thi quota offer người mới vì quota cần transaction offer P24, không sửa thứ tự để tuyên bố quota đã chạy.

Shortlist default5, cho phép5–20; chỉ người đủ gate/score>=60. Mỗi candidate có breakdown, confidence, plan phút tăng/bận, ranking source/policy/model. Nếu thiếu5 báo shortfall/exclusions aggregate, không lộ danh tính người bị loại. Employee dispatch sử dụng gợi ý này và có nhánh sắp xếp theo eligibility/tuyến đường cho nhân viên mới. Mục tiêu là 5 lời mời đồng thời, bù khi có người từ chối; ca chỉ gán cho người đầu tiên chấp nhận thành công. Các lời mời còn lại bị thu hồi. Không tạo 5 assignment; SMS/email là gate riêng. Xem [luồng điều phối](employee-scheduling-checkout.md).

## 9. Huấn luyện lại model

Khác HouseBuddy huấn luyện trên synthetic labels của heuristic: PawWorld cung cấp additive model học từ kết quả đã xác minh, Python standard library, không cần cài ML runtime vào Express, không tải pickle. Mỗi feature normalized0–1; trọng số không âm và tổng100; từng đóng góp giải thích trực tiếp. Không có đủ dữ liệu thật thì giữ EXPLAINABLE_RULES, không tuyên bố đã train thành công trên dữ liệu khách thật.

Nhãn được người dùng chốt ngày 30/10/2026 là điểm hài lòng đã xác minh,
`VERIFIED_CUSTOMER_SATISFACTION_V1`: `(rating - 1) * 25`. JSONL v1 mỗi dòng chỉ cho phép:

```json
{"groupId":"opaque_booking_group_001","observationId":"opaque_review_001","decisionAt":"2026-10-01T00:00:00Z","occurredAt":"2026-10-03T00:00:00Z","featuresAsOf":{"fit":"2026-10-01T00:00:00Z","travel":"2026-10-01T00:00:00Z","quality":"2026-10-01T00:00:00Z","reliability":"2026-10-01T00:00:00Z","workload":"2026-10-01T00:00:00Z"},"features":{"fit":0.7,"travel":0.8,"quality":0.9,"reliability":0.95,"workload":0.6},"rating":4,"targetScore":75,"labelVersion":"VERIFIED_CUSTOMER_SATISFACTION_V1","verified":true}
```

Rating phải xuất phát từ nguồn Customer đã xác minh sau booking hoàn tất; không lấy heuristic score làm nhãn. Observation ID trùng bị từ chối; mọi feature phải sẵn sàng trước hoặc tại decisionAt và outcome phải có sau decisionAt. Không tự thêm provenance cho legacy rows. Không email/địa chỉ/coordinates/CCCD trong dataset. >=200 observations, >=50 nhóm booking; chronological group split80/20, chỉ giữ training outcomes đã có trước quyết định sớm nhất trong test, loại nhóm băng qua cutoff; train>=100, test>=10 nhóm. File tối đa50MB. [Báo cáo và kế hoạch data](../testing/ai-real-data-2026-10-30.md) phân biệt dữ liệu đã tải với dữ liệu đủ điều kiện train.

```powershell
python scripts/ai/train_model.py storage/ai/verified-outcomes.jsonl --version pwc-rank-v1 --output storage/ai/model-v1.json
python -m unittest discover -s tests/python -p test_train_model.py
```

Output DRAFT, không tự activate. POST /admin/models với output và state APPROVED sau review. Gate backend: MAE test < baseline MAE, đủ nhóm/rows, weights hợp lệ, thời gian không tương lai; hash canonical kiểm tra trước inference. Đây là thông số Admin công bố, không bằng chứng tự xác minh dataset. Model lỗi gate fallback quy tắc; model không thay eligibility, route feasibility hay price policy. Trước dùng production cần benchmark/shadow thật, provenance dataset và rollback version.

## 10. Tests và giới hạn

```powershell
npm run lint
npm test
npm test -- --runTestsByPath tests/unit/ai.test.js tests/integration/ai.test.js
python -m unittest discover -s tests/python -p test_train_model.py
```

Integration tests tạo MongoDB8.0 replica set riêng và fake routing nội bộ, không đụng database .env; cover cookie/CSRF/ownership, quote policy/roundtrip, shortlist5, thiếu người, đình chỉ/trùng lịch, expiry, rules. Python tests dùng dữ liệu tổng hợp chỉ trong kiểm thử để chứng minh split/train, không publish model đó.

OSRM Hà Nội đã có runtime EC2; [kiểm tra ngày 30/10/2026](../testing/ai-real-data-2026-10-30.md) chỉ xác nhận smoke test đường tĩnh. Chưa hoàn tất: lịch/booking/offer/care ingestion tự động, training data và model thật, frontend booking consumption, performance benchmark cho 200 active users. Quote/match TTL cache không thay thế booking/financial audit hoặc feature store. Customer requests tạo nhiều quyết định có TTL nhưng chưa có replay Idempotency-Key riêng; các endpoint import dùng unique source/version, người gọi phải giữ ID và đối soát duplicate 409.


## Kết quả kiểm tra ngày 24/10/2026

- MongoDB local 8.0.34 primary pwc-local: READY; seed3 dịch vụ/24 giống/5 traits, chạy lại giữ nguyên số lượng. Có 3 policy báo giá ban đầu, một correction version cho vet theo lượt và 1 ranking policy. Không tạo Customer/sitter/rating giả trong database local.
- HTTP thật localhost:3000/health trả200; /api/v1/pet-care/catalog trả200 với24 giống. Database Atlas trước chuyển local resolveDNS được nhưng cả3 node TLS timeout; không thay chứng chỉ/TLS để lách lỗi.
- Backend lint và toàn bộ 580 tests/62 suites đạt; suite AI 24 tests đạt, gồm cạnh tranh lịch/model fallback. Python 3 tests đạt.
- Sau nâng Node24.22.1/npm11.19.1: frontend lint425 tests/66suites và build đạt. Build còn cảnh báo chunk chính555kB, không phải lỗi build.
- Không tuyên bố đã chạy model huấn luyện dữ liệu thật hoặc đã gửi lời mời sitter thực tế; integration test có6 sitter tổng hợp trong database tách biệt.
