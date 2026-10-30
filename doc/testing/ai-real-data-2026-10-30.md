# AI: dữ liệu thật và mức hoàn thiện ngày 30/10/2026

## Kết luận đã xác minh

AI hiện là bộ gợi ý sitter có giải thích, dùng 5 đặc trưng fit/travel/quality/
reliability/workload. OSRM dựng graph đường từ OSM; đó là preprocessing dữ liệu
đường, không phải huấn luyện model dự đoán ùn tắc. Finance không phụ thuộc AI.

Kiểm tra EC2 chỉ đọc: release `54eb2fd471de697117d0d3eeec81d56161710348`,
`/ready` trả ready; OSRM đang chạy, hai điểm công khai `105.85,21.03` và
`105.82,21.02` trả ETA 517.7/523.8 giây. Đây chỉ là smoke test, không phải
sai số so với chuyến đi thực tế hoặc benchmark tải. Không thay cấu hình/deploy.

Đếm đúng collection legacy, không đọc/export hồ sơ cá nhân: AI_ENABLED=true,
`airankingpolicies`: 1; `aisitterprofiles`, `aischeduleblocks`, `aivisitoutcomes`,
`airankmodels`: đều 0; approved model: 0. Chưa đủ dữ liệu vận hành hoặc train.

Source hiện đọc hồ sơ/lịch/outcome AI qua Admin imports. Chưa có ingestion đầy đủ
từ assignment, nghỉ phép, care completion và review; chưa thể tuyên bố đồng bộ
nghiệp vụ thật. UI shortlist chưa nối thành command gửi lời mời. Các command
booking/offer/assignment vẫn cần kiểm tra nguồn có thẩm quyền trong transaction.

Snapshot MATCH có TTL 5 phút. Không dùng cache này làm kho training dài hạn,
không dựng lại đặc trưng cũ bằng thống kê hiện tại. `features` có thể suy ra từ
breakdown khi snapshot còn tồn tại; chưa có join bền vững từ quyết định sang
booking đã nhận và đánh giá đã xác minh. Không lấy điểm của sitter được chọn
làm nhãn cho các sitter không được chọn.

## Dữ liệu đã thu thập và kiểm tra

Raw files và metadata/manifest nằm trong `backend/storage/ai-public/2026-10-30/`
của worktree thực hiện, được ignore. Không commit archive/model bên thứ ba.
Giấy phép ở bảng là lời khai của uploader, cần đối chiếu nguồn gốc trước sử dụng.

| Nguồn | Phiên bản/nội dung thực đọc | Đánh giá sử dụng |
| --- | --- | --- |
| [Kaggle Hanoi traffic](https://www.kaggle.com/datasets/chi26n/hanoi-traffic) | v2; ZIP 56,183,054 bytes; 1,018 JPG, 1,019 TXT, 1 YAML, 1 PT; Apache 2.0 khai báo | Không có bảng trip time; không dùng train ETA/ranker. Không load PT hoặc chạy code dataset. |
| [Kaggle Hanoi AQI + weather](https://www.kaggle.com/datasets/diabolicfox/hanoi-air-quality-pm2-5-weather-data-2024-2026) | v1; ZIP 1,271,309 bytes; 14,451 dòng hourly, 34 cột; CC0 khai báo | Covariate nghiên cứu; không phải nhãn ETA/hài lòng. Nguồn mô tả là OpenAQ/WAQI và Open-Meteo ERA5; chưa xác minh quyền upstream. |
| [Kaggle Hanoi flooding/weather](https://www.kaggle.com/datasets/anhminhnguyen01021/hanoi-urban-flooding-and-weather-time-series) | v1; ZIP 4,706,856 bytes; 50 streets metadata, 59,184 dòng time series; CC0 khai báo | Mô tả nguồn trống; chưa biết đo thật hay mô phỏng. Quarantine; không coi ngưỡng ngập trong CSV là policy an toàn. |
| [Geofabrik Vietnam / OSM](https://download.geofabrik.de/asia/vietnam.html) | Tái sử dụng extract Hà Nội buffered 28,114,986 bytes đã có; audit lại 3,257,696 nodes, 500,576 ways, 1,206 restriction relations | Dữ liệu graph đường; không có ground truth thời gian đi. Giữ attribution [OSM contributors / ODbL](https://www.openstreetmap.org/copyright). |

SHA256 của archive/extract đã kiểm tra:

```text
hanoi-traffic v2: c28702a25636edbab4018f51469bf3cac1668c0dcf138cef8e6a1884438a449d
aqi-weather v1: 639a03c3d1f913338c440ae42f03129823112a697343fdd93e9de533e3466631
flood-weather v1: c2c9f72864972df2d46a56bc8ed4dbbeb223e4f1554e097067d8451599edcd7d
hanoi OSM extract: 1889c71f0c94c139a20f6e73a28445f8df35e07b32592bb5b1e39a3b58add285
```

Audit OSM tìm thấy 21,884 ways có oneway, 14,214 có maxspeed, 10,541 có
motorcycle, 3,514 có motor_vehicle; có restriction theo điều kiện/phương tiện.
Đây là đếm tag trên extract, không phải tỷ lệ đầy đủ, xác minh quy định đường
hay chứng minh profile car xử lý đúng xe máy. Profile hiện là car.lua; không
đổi tên thành motorbike hoặc coi đây là ETA phương tiện khác.

Kaggle search cũng có [traffic HCM](https://www.kaggle.com/datasets/evgenyarbatov/ho-chi-minh-city-road-traffic):
mô tả lấy từ TomTom, không phải Hà Nội. Không tải để thay ground truth Hà Nội;
license của uploader không tự cấp quyền tái phân phối dữ liệu provider.

Phân tích CSV trực tiếp bằng `analyze_public_context.py`: AQI/weather có nhiệt
độ trung vị 25.5, P10/P90 16.8/31.0; precipitation P90 0.5 theo đơn vị file.
Không có timestamp trùng hoặc lỗi parse, nhưng cả 14,451 dòng thiếu múi giờ.
AQI trung bình trong file là 33.2755, khác con số 35.92 ở mô tả uploader; không
chép mô tả thành số liệu đã kiểm tra. Flood/weather có 59,184 dòng từ
2018-01-01 đến 2024-10-01, nhiệt độ trung vị 25.2, rain_mm P90 0.5; toàn bộ
timestamp cũng thiếu múi giờ. Các thống kê là mô tả file, chưa chứng minh quan
trắc thật, tính nhân quả, đơn vị chuẩn hoặc dữ liệu đã có trước một quyết định.

## Demo local có cơ sở dữ liệu đường

Người dùng cho phép thêm tài khoản demo để thử pipeline, sau đó chọn làm local
trước khi chuyển VPS. Không ghi thêm account/rating/booking lên production trong
lần triển khai này. Chỉ dẫn này không biến dữ liệu mô phỏng thành đánh giá thật.

Đã đọc một ma trận 16 x 16 từ OSRM trên EC2 bằng các điểm lưới công khai, không
gửi tọa độ khách. Các điểm được snap lên đường; độ lệch lớn nhất của lưới ban
đầu là 534.6 m (ví dụ điểm nằm ngoài mặt đường), nên demo dùng tọa độ OSRM đã
snap, không giả đó là tọa độ nhà. Mọi cặp đều có duration; không suy rằng đường
luôn đi được ngoài thực tế. Snapshot lưu graph/profile/hash/attribution:

```text
backend/storage/ai-public/2026-10-30/hanoi-osrm-snapped-samples.json
SHA256 7315878b8e468910bc2d8b27ae704ece83f7970de395f460042d3748086dffd0
```

Demo dùng snapshot này như bằng chứng ETA tĩnh, chỉ nhận đúng các điểm trong
ma trận và không tự bù route thiếu. Tài khoản, pet, năng lực và lịch vẫn là kịch
bản thiết kế; không suy giới tính/kinh nghiệm/tính cách từ dữ liệu OSM/thời tiết.
Mode này không tạo rating/lịch sử chăm sóc hay model. Không có cơ sở để suy
điểm hài lòng của người thật chỉ từ một tuyến đường và nhiệt độ. Xem
[cách mở demo](ai-demo-accounts.md).

Đã xuất riêng 3,072 kịch bản cho ngày 03/11/2026: 16 điểm xuất phát x 16 điểm
đến x 4 giờ bắt đầu x 3 mẫu lịch (trống, visit có sẵn, nghỉ trưa). Generator
gọi đúng scheduling/scoring service hiện có, không viết lại công thức. Có 1,958
phương án khả thi về lịch, 256 bị trùng visit và 858 không đủ thời gian đi.
Không phương án cold-start nào vượt ngưỡng 60 điểm. Đây là kết quả trên các
lịch mô phỏng, không phải dữ liệu chuyến đi hay đo mức hài lòng người thật.

```text
backend/storage/ai-public/2026-10-30/grounded-scenarios-2026-11-03.jsonl
3,072 rows; 2,351,261 bytes
SHA256 ba0e92276101d6b78f604d16b6134792f78791cf42048a5562d7ea15e8844ffc
```

Mỗi dòng có nguồn snapshot hash, chỉ số điểm đường, mẫu lịch, reason/plan và
features khi khả thi; `verified:false`, `rankTrainingEligible:false`, rating
null. Baseline policy score chỉ để quan sát, không dùng làm target. Có thể
dùng tập này kiểm tra pipeline và để người đánh giá kịch bản; chưa đủ điều
kiện huấn luyện model hài lòng đã chốt. Không sửa threshold hoặc thêm rating
để tạo đủ shortlist; demo trả shortfall trung thực.

## Model được lưu và chuyển giữa máy

Model additive hiện tại lưu 5 trọng số, version và metadata trong JSON; inference
không cần bộ dữ liệu train gốc. Sau import, MongoDB giữ model qua lần restart
ứng dụng. Giữ nguyên artifact/hash và feature contract thì local/VPS dùng cùng
trọng số, không phải train lại khi chuyển máy. Bản đồ OSRM và dữ liệu tài khoản
là các thành phần khác, không nằm trong “trí nhớ” của rank model.

`bundle_model.py` kiểm tra model DRAFT cùng evidence có artifact hash khớp,
đóng 3 file model/evidence/manifest mà không kèm dataset hay credentials. Bundle
chỉ xác nhận tính toàn vẹn, không chứng minh nhãn thật hoặc cho phép activate.
Training cập nhật tạo version mới, giữ version cũ để rollback. [Lệnh offline](../../backend/scripts/ai/README.md)
và regression kiểm tra nạp lại chính xác bytes cùng từ chối artifact bị sửa.

## Nhãn huấn luyện đã chốt

Người dùng chốt trong phiên ngày 30/10/2026: dùng điểm hài lòng sau booking đã
hoàn tất và được xác minh. Nhãn `VERIFIED_CUSTOMER_SATISFACTION_V1`: 1–5 sao
nguyên, `targetScore = (rating - 1) * 25` (0/25/50/75/100). Không lấy heuristic
score làm target và không tự tạo đánh giá để đủ số dòng. Đây là hồi quy điểm
hài lòng trong nhóm đã được nhận việc; chưa chứng minh xếp hạng tốt hơn cho
toàn bộ ứng viên vì có selection bias.

JSONL v1 chỉ nhận các trường sau (ví dụ hợp đồng, không phải dữ liệu train):

```json
{"groupId":"opaque_booking_001","observationId":"opaque_review_001","decisionAt":"2026-10-01T00:00:00Z","occurredAt":"2026-10-03T00:00:00Z","featuresAsOf":{"fit":"2026-10-01T00:00:00Z","travel":"2026-10-01T00:00:00Z","quality":"2026-10-01T00:00:00Z","reliability":"2026-10-01T00:00:00Z","workload":"2026-10-01T00:00:00Z"},"features":{"fit":0.7,"travel":0.8,"quality":0.9,"reliability":0.95,"workload":0.6},"rating":4,"targetScore":75,"labelVersion":"VERIFIED_CUSTOMER_SATISFACTION_V1","verified":true}
```

Mỗi observationId là một nguồn đánh giá đã xác minh; retry không tạo thêm mẫu.
groupId giữ mọi observation của một booking cùng fold. Mỗi featuresAsOf là lúc
đặc trưng thực sự sẵn sàng cho hệ thống, không chỉ timestamp sự kiện. Tất cả
phải <= decisionAt < occurredAt; train outcome phải có trước quyết định sớm
nhất trong test. Nhóm đi qua cutoff bị loại. Cần >=200 observations đã xác minh,
>=50 booking độc lập, train >=100 dòng, test >=10 booking; tối đa 50 MB.
Legacy JSONL thiếu provenance bị từ chối; không tự bổ sung timestamp cho vừa gate.

Không đưa email, tên, điện thoại, địa chỉ nhà, tọa độ hoặc ghi chú chăm sóc vào
dataset. Opaque ID phải được tạo ở exporter tin cậy; validator không tự chứng
minh ID đã ẩn danh hay rating thật. Review source join và cách hủy/sửa rating
trước khi train. Output DRAFT giữ hợp đồng import hiện có; evidence sidecar ghi
dataset hash/label/split, không tự gửi sang API model import hoặc activate.

## Kế hoạch triển khai tiếp theo theo dependency

1. **Nguồn nghiệp vụ cho matching.** Nối approved capabilities, authoritative
   schedule/day-off/offer holds và completion/review vào projection có source
   version, idempotency và xử lý correction. Test nhận việc/nghỉ cùng lúc với
   gợi ý, retry và Staff resolution; thiếu source thì fail closed. Không tạo
   sitter/customer/rating demo trên production để mở gate.
2. **Dữ liệu training đúng thời điểm.** Lưu riêng feature audit tối thiểu cho
   sitter thực sự được nhận việc trước TTL MATCH, liên kết booking/assignment/
   rating source version bằng ID opaque; không lưu tọa độ trong tập train.
   Chốt retention/quyền exporter và cơ chế loại mẫu khi đánh giá bị rút/sửa.
   Chưa export dữ liệu khách từ production trong lần làm này.
3. **Ground truth ETA Hà Nội.** Thu trip duration đã được đồng ý sử dụng:
   departure/arrival UTC, mode, OSM/graph/profile version, public road segment,
   quality và thời điểm bản ghi sẵn sàng. Không suy chuyến đi từ toàn bộ thời
   gian giữa hai visit (có nghỉ/chờ). Hoặc đánh giá provider traffic có quyền
   lưu/train. [TomTom Traffic](https://docs.tomtom.com/traffic-api/documentation/tomtom-maps/v1/traffic-flow/vector-flow-tiles)
   có traffic flow nhưng cần tài khoản/quyền dùng; chưa gọi API có phí hay mua
   dữ liệu. Chọn đúng Hà Nội, mode, giờ cao điểm/thấp điểm và ngày trong tuần.
4. **Thời tiết/ngập.** Xác minh nguồn từng dataset đã tải. Ưu tiên dự báo đã
   phát hành trước decision, lưu issue/run time; không dùng reanalysis hoặc
   lượng mưa thực tế tương lai làm input dự báo.
   [Open-Meteo Single Runs](https://open-meteo.com/en/docs/single-runs-api)
   hỗ trợ kiểm tra forecast theo run; [điều khoản](https://open-meteo.com/en/terms)
   phân biệt API miễn phí phi thương mại và thương mại. Chưa tích hợp weather
   thành rule tự động từ chối lịch hay thông báo nguy hiểm.
5. **Train và đánh giá local.** Khi dữ liệu đạt gate, chạy trainer; so MAE với
   baseline cùng label, temporal holdout và phân tích sitter mới/khu vực/khung
   giờ, selection bias. ETA đánh giá MAE/P90 theo phút trên chuyến thật, cùng
   trip held-out; không dùng output OSRM làm nhãn để tuyên bố chính xác thực tế.
   Shadow, independent review và rollback version trước import model. Không
   deploy feature hoặc thay graph production bằng dữ liệu chưa review.

## Kiểm tra trong lần thay đổi

- Sửa import duplicate petIds/species: từ chối trước ghi để không nhân kinh
  nghiệm/history; ObjectId khác hoa/thường vẫn coi là trùng. Không tự sửa
  outcome cũ; cần đối soát riêng nếu tồn tại.
- Collector tải đủ 3 archive và manifest. Lần đầu console Windows lỗi Unicode
  sau khi archive thứ ba đã lưu hoàn chỉnh; đã sửa JSON console ASCII và chạy
  lại bộ flood thành công, hash khớp. Raw content luôn lưu UTF-8.
- Python regression kiểm tra label, duplicate retry, point-in-time leakage,
  cutoff theo decision và evidence/không overwrite; fixtures chỉ dùng cho test.
- Backend full suite sau grounded demo/portability: PASS, 73 suites/691 tests;
  test scenario exporter bổ sung sau đó PASS riêng. Lint/architecture PASS.
  Frontend full suite PASS, 72 suites/452 tests; lint, demo-app lint và build
  PASS. Vite còn cảnh báo bundle trên 500 kB. Python 13 tests PASS.
- Regression Mongo cách ly đã import model DRAFT synthetic, đóng/kết nối lại
  và kiểm tra hash/trọng số/kết quả score giữ nguyên; không tạo model đó trong
  database demo/production. Bundle test giữ đúng bytes và chặn model bị sửa.
- Huấn luyện model trên dữ liệu thật: **NOT RUN** vì outcome thật hiện bằng 0
  và chưa có feature/booking/rating join. Không có model production mới hoặc
  số liệu chất lượng model thật từ các kiểm thử synthetic.

Lệnh và trách nhiệm scripts: [offline tools](../../backend/scripts/ai/README.md).
Kết quả lint/test/build cuối cùng ghi trong PR; không suy nghiệp vụ đạt từ CI.
