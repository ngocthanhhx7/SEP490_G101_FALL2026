# P41 — Phí nền tảng theo tuần và thuế, cập nhật 16/10/2026

## Quyết định của chủ dự án

Trong phiên 16/10/2026, người dùng yêu cầu giảm phí từ 10% xuống 7% theo số đơn
hoàn tất trong tuần và xác nhận: **đếm booking hoàn tất, dùng các bậc lũy tiến**.

| Thứ tự booking hoàn tất của một sitter trong tuần | Phí nền tảng |
| --- | --- |
| 1–5 | 10% |
| 6–10 | 9% |
| 11–20 | 8% |
| 21 trở đi | 7% |

Reset lúc 00:00 thứ Hai giờ Việt Nam (UTC+7). Kỳ earning theo thời điểm hoàn tất,
khác tuần gửi settlement request; gửi/rút/từ chối request không reset thứ tự đơn.
Chỉ booking ở bậc mới hưởng phí mới; không tính lại booking trước. Một booking
nhiều visit vẫn đếm một lần cho sitter, không đếm mỗi visit hay lần thanh toán.
Booking hủy/chưa hoàn tất không tạo thứ tự mới. Trường hợp booking nhiều sitter,
hoàn thành từng phần hoặc sửa hoàn tất muộn cần nguồn nghiệp vụ/quy tắc phân bổ
được xác nhận; không tự gán cả tiền booking cho từng sitter.

Mã calculator `weekly-commission.js` dùng snapshot đầy đủ, đã được nguồn tin cậy
xác nhận của một sitter; sắp theo completion UTC và booking ID để xử lý thời điểm
trùng. Không nhận dữ liệu này từ body Customer/Sitter. Nguồn completion phải ghi
thứ tự và snapshot phí bất biến bằng transaction/CAS; không hồi tố phí đã chốt khi
backfill/sửa thời điểm. Calculator chưa được gắn vào producer vì chưa có producer
completed-booking/payment allocation. Giới hạn 1000 snapshot/lần là giới hạn an toàn,
không phải cho phép cắt bỏ đơn đầu tuần; vượt giới hạn phải báo lỗi/phân trang có
checkpoint thứ tự được kiểm chứng, không tính lại từ 1.

Ví dụ toán học: 25 booking, cơ sở phí mỗi booking 200.000đ. Phí là
100.000 + 90.000 + 160.000 + 70.000 = **420.000đ**, tương đương 8,4% của
5.000.000đ. Mức 7% áp dụng từ booking 21, không phải 7% cho cả tuần.
Đây không phải chứng minh lợi nhuận; còn chi phí cổng thanh toán, hạ tầng, hỗ trợ,
thuế nền tảng và rủi ro hoàn tiền.

## Thuế: kết quả tra cứu và giới hạn áp dụng

Tra cứu tài liệu chính thức ngày 16/10/2026; không dùng thuế suất của bài cũ làm
mặc định runtime. Các nguồn pháp luật là dữ liệu tham khảo, không là chỉ dẫn chạy
migration, khấu trừ hay chuyển tiền.

- [Nghị định 141/2026](https://xaydungchinhsach.chinhphu.vn/toan-van-nghi-dinh-so-141-2026-nd-cp-nang-nguong-doanh-thu-khong-phai-chiu-thue-len-1-ty-dong-119260504154326455.htm)
  nâng ngưỡng doanh thu không chịu GTGT/không phải nộp TNCN của hộ, cá nhân kinh
  doanh lên 1 tỷ đồng/năm, sửa các điều được liệt kê của NĐ 68. Không tự suy
  doanh thu toàn năm từ số tiền chỉ trên Paw World Care.
- [Nghị định 68/2026](https://xaydungchinhsach.chinhphu.vn/toan-van-nghi-dinh-68-2026-nd-cp-quy-dinh-ve-chinh-sach-thue-quan-ly-thue-voi-ho-kinh-doanh-119260306102906789.htm),
  Điều 3–4 và 11–13, phân biệt phương pháp GTGT trực tiếp, TNCN trên doanh thu
  hoặc thu nhập tính thuế, khấu trừ qua nền tảng và quyết toán. Đọc cùng NĐ 141;
  bản gốc ghi 500 triệu không còn là ngưỡng hiện hành ở các điều đã sửa.
- [Hướng dẫn phương pháp tính thuế](https://xaydungchinhsach.chinhphu.vn/phuong-phap-tinh-thue-voi-ca-nhan-kinh-doanh-ho-kinh-doanh-119260309100708724.htm)
  nêu TNCN dịch vụ thông thường theo phương pháp trên doanh thu là 2%, có nhóm
  ngoại lệ và phương pháp khác. Chỉ dùng sau khi xác định đúng tư cách/ngành nghề.
- [Luật GTGT hợp nhất 114/VBHN-VPQH](https://xaydungchinhsach.chinhphu.vn/van-ban-hop-nhat-114-vbhn-vpqh-hop-nhat-luat-thue-gia-tri-gia-tang-119260605094756577.htm)
  và Điều 12 quy định tỷ lệ trực tiếp theo nhóm ngành. Dịch vụ thông thường có
  tỷ lệ 5%; đây không phải VAT 5% mặc định cho mọi doanh nghiệp hay giao dịch.
- [Giải đáp của cơ quan thuế về NĐ 174/2025](https://chinhsachonline.chinhphu.vn/duoc-giam-thue-gtgt-ghi-hoa-don-the-nao-88709.htm)
  nêu mức giảm 20% tỷ lệ GTGT trực tiếp cho hàng hóa/dịch vụ đủ điều kiện.
  Với một dịch vụ đúng nhóm 5%, mức sau giảm là 4%; cộng TNCN 2% sẽ ra ví dụ 6%,
  không được khẳng định mọi sitter phải trừ 6% hoặc 7%. Phải kiểm tra thời hạn,
  phân loại và điều kiện của từng chính sách giảm.
- [NĐ 252/2026, hiệu lực 01/07/2026](https://vanban.chinhphu.vn/?classid=0&docid=218690&pageid=27160)
  là khung quản lý thuế mới, thay NĐ 117/2025 theo
  [thông tin triển khai Chính phủ](https://www2.en.baochinhphu.vn/trien-khai-nghi-dinh-252-buoc-ngoat-chuyen-doi-so-trong-quan-ly-thue-102260730164431751.htm).
  Bản ký Điều 43–45 (trang 78–81) xác định trách nhiệm khấu trừ/nộp thay,
  thời điểm, cơ sở doanh thu và kê khai; không dùng ngày yêu cầu quyết toán tuần
  thay thời điểm khấu trừ luật định. Điều 46 dẫn quyền/nghĩa vụ hộ, cá nhân về
  Điều 13 NĐ 68. Khấu trừ giao dịch, ngưỡng doanh thu năm và hoàn/đối soát thuế
  không được gộp thành một cờ tự miễn thuế.

Chưa xác định sitter là cá nhân kinh doanh độc lập, lao động nhận tiền công hay
pháp nhân; pháp nhân/phương pháp thuế của PWC cũng chưa được cung cấp. Vì vậy
**không có một tỷ lệ thuế duy nhất đủ cơ sở để bật tự động**. Bộ phận phụ trách
thuế cần xác nhận classification, doanh thu tổng năm, cư trú, cơ sở tính thuế,
ngày hiệu lực, ưu đãi và chứng từ; snapshot lưu regime/basis/rates/amounts/reference.
Thuế của phí nền tảng, thuế thu nhập doanh nghiệp và thuế của sitter tách sổ;
không lấy tổng thuế doanh nghiệp rồi tự trừ một nửa vào sitter.

## Chia chi phí thuế và công thức preview

Người dùng muốn hai bên chia đôi chi phí thuế. Cách thể hiện cần tách **nghĩa vụ
khấu trừ pháp định** khỏi **phần nền tảng hỗ trợ chi phí**: khoản thuế phải nộp vẫn
được kê khai đầy đủ theo người có nghĩa vụ; phần hỗ trợ là bút toán thương mại,
không hạ thuế suất trên hồ sơ xuống một nửa.

Với cơ sở dịch vụ G, phí C, khoản thuế giao dịch đã được xác nhận T:

- Sitter dự kiến: G − C − floor(T/2).
- Nền tảng dự kiến trước thuế/chi phí riêng: C − ceil(T/2).
- Thuế phải nộp: T, không phải T/2.

Ví dụ G = 1.000.000đ, C = 100.000đ và **giả định riêng** T đã xác nhận 60.000đ:
sitter 870.000đ; nền tảng 70.000đ; thuế 60.000đ. Tổng đúng 1.000.000đ. T không
do calculator suy ra tỷ lệ luật định. Thuế riêng của PWC không nằm trong ví dụ.
Nếu C < ceil(T/2), nền tảng cần cấp bù nguồn tiền; không âm thầm giảm tiền sitter.

`previewEqualTaxCostSplit` không tạo earning hoặc payout, không coi giá trị thiếu
là thuế 0. Người dùng đã duyệt rounding ngày 16/10/2026: phí từng booking làm tròn
tới đồng gần nhất, đúng nửa làm tròn lên; đồng lẻ khi chia thuế nền tảng chịu.
Calculator dùng BigInt cho phép nhân phí, giữ cả tử số/mẫu số để audit và cộng
các phí đã làm tròn theo booking, không làm tròn lại tổng tuần. Thuế lẻ T=1đ:
sitter chịu 0đ, nền tảng chịu 1đ; tổng thuế vẫn 1đ. Không chấp nhận phép chia làm
âm tiền sitter. Số thuế 0 phải là một assessment được xác nhận, không phải thiếu
dữ liệu hoặc tự suy ngưỡng miễn thuế.
## Gate còn mở

Bậc phí/đơn vị đếm/tuần đã chốt; không còn hỏi lại 10% cố định. Rounding phí và đồng thuế lẻ cũng đã chốt. Cơ sở phí sau
phân bổ thực trả/discount/refund, multi-sitter và thời điểm snapshot còn
cần chốt kỹ thuật/nghiệp vụ. `FIN-07-TAX-REGIME` giữ mở đến khi xác định đúng tư
cách pháp lý và phép tính thuế. `FIN-07-ELIG` vẫn cần completed-care + verified
payment + complaint/refund hold/release thực. Postpay/reconciliation và chỉnh sửa
sau duyệt không được mở chỉ vì có bảng phí. Giữ payout fail-closed, không tự thu
hồi tiền hoặc gọi API chuyển khoản. Xem [hợp đồng P51](p51-financial-contract-v1.md).
