# Phát triển model và nguồn dữ liệu — 05/11/2026

## Mục tiêu và kết quả

Người dùng yêu cầu tiếp tục model hiện có, tìm dữ liệu/số liệu/báo cáo công khai vì chưa có dữ liệu vận hành thật và tích hợp lên VPS. Giữ ranker 5 đặc trưng, lời mời và các kiểm tra eligibility có thẩm quyền. Không dùng báo cáo tổng hợp hay dữ liệu demo làm nhãn hài lòng khách hàng thật.

Khởi động lại MongoDB local bằng script có sẵn, không sửa .env hoặc seed: database demo vẫn còn 888 outcomes, không có model. Database development và production chưa có outcomes/model. Dữ liệu demo giúp kiểm thử pipeline, không chứng minh model chọn người chăm sóc tốt hơn. Các kiểm tra thực thi/review/deploy cuối lưu trong handoff.

Trainer được sửa thành projected gradient trên simplex không âm tổng 100; thao tác clip rồi chuẩn hóa cũ không phải bước gradient có ràng buộc đúng. Không thay đặc trưng, chính sách scoring, schema artifact hay điều kiện duyệt. Vẫn chia theo booking/thời gian, không để holdout tham gia fit. Tests tổng hợp kiểm tra tối ưu trên bài toán biết nghiệm, không được báo là độ chính xác thực tế.

Admin có thao tác kiểm tra dữ liệu đủ điều kiện: GET /api/v1/ai/admin/training-readiness, Admin-only/private no-store, tối đa 500 outcomes và 3 lần/phút/tài khoản. Dùng cùng source join với exporter: chỉ trả tổng số và lý do loại, không trả rows/ID. Budget kiểm tra giữa các dòng là 8 giây; timeout không trả kết quả một phần. Truncated cần kiểm tra offline đầy đủ; đủ số lượng vẫn cần chia tập và kiểm định trainer. Không tự train/import/approve từ nút đọc.

## Nguồn công khai được đọc trực tiếp

| Nguồn | Giá trị sử dụng | Điều kiện / giới hạn |
| --- | --- | --- |
| [Open-Meteo Historical Weather](https://open-meteo.com/en/docs/historical-weather-api), [giấy phép](https://open-meteo.com/en/license) | Thu thập ERA5 2025 tại điểm công khai 21.0285,105.8542; nhiệt độ, độ ẩm, mưa, gió theo giờ; 8.760 mốc, không thiếu trong bốn cột | CC BY 4.0, giữ attribution. Ô lưới trả về 21.0,105.75, không phải đo tại từng địa chỉ. Reanalysis không chứng minh đã có lúc điều phối; không nhập runtime hoặc gán hệ số trễ |
| [JICA Hanoi TOD 2015](https://openjicareport.jica.go.jp/pdf/12248811_01.pdf) | Bối cảnh: cần phân biệt phương tiện và khung thời gian khi đánh giá di chuyển | Báo cáo cũ, tổng hợp; không phải nhãn ETA hiện tại hoặc dataset chuyến đi. Chỉ giữ link, không đưa PDF vào repo |
| [Generation Pup — chia sẻ dữ liệu](https://generationpup.ac.uk/privacy-policy-sharing-data/) | Tham khảo cách tổ chức nghiên cứu theo thời gian và consent | Dữ liệu được chia sẻ theo phê duyệt/thỏa thuận nghiên cứu; không có quyền tải dùng làm tập train Paw World. Không lấy thông tin chủ nuôi hoặc suy diễn hành vi theo giống |

Manifest [ERA5](ai-public-context-manifest-2026-11-05.json) giữ URL truy vấn, mô hình, ô lưới, license/attribution, ngày lấy, SHA256 và schema/count. Raw JSON 317.785 bytes giữ trong ignored backend/storage/ai-public/hanoi-era5-2025-research, không đưa Git hay model registry. Cờ rankTrainingEligible=false, productionFeatureEligible=false. Collector có giới hạn 366 ngày/5 MB, kiểm tra giờ liên tục, trùng/thiếu/NaN và không ghi đè. Nguồn công khai là reference, không phải lệnh chạy hoặc sự phê duyệt nghiệp vụ.

## Phát triển tiếp khi có dữ liệu

1. Giữ rule-based ranker làm baseline và ghi feature snapshot ngay khi ra quyết định; completion/review thật đi qua nghiệp vụ sẵn có.
2. Dữ liệu thời tiết/đường giúp thiết kế kịch bản, đánh giá pipeline và nghiên cứu đặc trưng. Muốn đưa thời tiết vào model cần bản tin có issue time, đánh giá độ trễ theo chuyến đo thật và review version đặc trưng; không backfill reanalysis thành dữ liệu biết trước.
3. Khi đủ ít nhất 200 quan sát từ 50 booking độc lập: xuất có HMAC, kiểm tra nguồn, train offline, giữ holdout theo thời gian; import DRAFT và review độc lập trước activation. Không tải một model bên ngoài rồi coi nó hiểu dữ liệu Paw World.

## Kiểm tra

Python trainer/collector, MongoDB exporter/readiness và luồng AI, UI kiểm tra thiếu dữ liệu/lỗi/transport, architecture/lint/build. Không tạo rating/đánh giá/assignment thực hoặc model giả trên production. Tài liệu này không khẳng định đã có trained model đạt chất lượng production.
