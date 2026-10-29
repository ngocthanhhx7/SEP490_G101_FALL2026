# Paw World Care — Quy tắc chọn Pet Sitter, tính điểm và xếp lịch v1

Ngày soạn: 17/10/2026. Cập nhật triển khai AI: 24/10/2026 — xem [API và trạng thái thực tế](../api/ai-pricing-matching-v1.md); phần triển khai không tự bật mọi đề xuất trong tài liệu này. Múi giờ nghiệp vụ: Asia/Ho_Chi_Minh.

**Trạng thái: ĐỀ XUẤT NGHIỆP VỤ HOÀN CHỈNH ĐỂ DUYỆT.** Đây là đặc tả, chưa phải tính năng đã triển khai hay chính sách đã xuất bản. Các con số mới trong tài liệu là mặc định đề xuất; không tự bật trong production. Quy tắc đã duyệt trong P00/P51 tiếp tục có hiệu lực; các quyết định tiền, thời hạn giữ slot/payment và quyền riêng tư còn mở không được tài liệu này ngầm đóng.

Nguồn đối chiếu: [P00](p00-decisions-screens-v1.md), [P01 domain](../architecture/p01-domain-contract-v1.md), [P01 API](../api/p01-api-permission-contract-v1.md), [P50 pet dictionary](p50-dog-cat-pet-profile-field-dictionary-v1.md), [P51](p51-financial-contract-v1.md), [P18](../deployment/p18-sitter-schedule-handoff.md), [P21](../deployment/p21-dispatch-handoff.md), [P24](../deployment/p24-offer-assignment-handoff.md). HouseBuddy BE/ai được tham khảo ở máy cục bộ; không sao chép model hoặc coi trọng số của HouseBuddy là quy tắc PawWorld đã duyệt.

## 1. Phạm vi và nguyên tắc

- Áp dụng ba dịch vụ: ghé thăm/chơi cùng chó mèo; dắt chó đi dạo; đưa thú cưng đến lịch hẹn thú y. Không mở rộng thành lưu trú, chẩn đoán hay điều trị.
- Booking là đơn của Customer; Visit là một lượt thực hiện; Offer là lời mời; Assignment là phân công đã được sitter chấp nhận hoặc Staff phân công đúng quyền. Một booking có nhiều visit; mỗi visit tối đa một assignment có hiệu lực.
- Chọn người theo thứ tự: an toàn và điều kiện bắt buộc → khả thi thời gian/di chuyển → mức phù hợp → điểm xếp hạng → sitter nhận việc. Điểm cao không vượt được điều kiện bắt buộc.
- Không tự đổi giờ khách đặt, không coi gửi offer là đã có người, không coi thanh toán thành công là đã phân công.
- Một booking một dịch vụ, 1–2 slot/ngày, tối đa 30 ngày, đặt trước ít nhất 24 giờ theo P01. Ngoại lệ khẩn chỉ được bổ sung qua quyết định riêng; không dùng dịch vụ này như cấp cứu thú y.

## 2. Dữ liệu cần có

| Đối tượng | Dữ liệu tối thiểu phục vụ quyết định |
| --- | --- |
| Customer/booking | Chủ sở hữu; dịch vụ; pets; địa chỉ đã xác nhận; ngày giờ hoặc cửa sổ giờ được đồng ý; quote/policy version; trạng thái điều kiện thanh toán |
| Pet | Chó/mèo; số lượng; kích thước/cân nặng nếu ảnh hưởng xử lý; hành vi, nguy cơ thoát/cắn; cách tiếp cận; hướng dẫn chăm sóc; liên hệ khẩn; các trường bắt buộc theo P50/service version |
| Sitter | ACTIVE, hồ sơ APPROVED; dịch vụ/loài được duyệt; khả năng xử lý pet; khu vực phục vụ; giờ làm; ngày nghỉ; lịch đã nhận; sức chứa; điểm xuất phát ngày và điểm kết thúc nếu có |
| Visit | Start/end; thời lượng; snapshot pet/địa chỉ/hướng dẫn; assignment/offer/version; thời gian di chuyển, đệm và nguồn tính |
| Thống kê | Các lượt đã đối soát; đánh giá hợp lệ; hoàn thành, đúng giờ, lỗi hủy/no-show đã xác minh; thời điểm chốt dữ liệu |

Không suy luận tính cách, khả năng chăm sóc từ tuổi, giới, ảnh, tên hay địa chỉ cư trú. Địa chỉ xuất phát có thể là điểm hẹn làm việc do sitter chọn, không bắt buộc công bố địa chỉ nhà. Không dùng việc từ chối chia sẻ GPS liên tục làm lý do hạ điểm.

Thiếu thông tin an toàn bắt buộc: NEEDS_INFORMATION, nêu trường thiếu; chưa gửi offer. Vaccine UNKNOWN là trạng thái thiếu dữ liệu, không tự coi là chưa tiêm hay tự từ chối nếu chưa có quy tắc P50 đã duyệt. Không suy diễn giấy tờ tải lên là đã xác minh.

## 3. Điều kiện bắt buộc của sitter

Tất cả phải đạt tại lúc đề xuất, tạo offer và nhận việc:

1. User ACTIVE, authEpoch còn hợp lệ, hồ sơ sitter APPROVED; không đình chỉ đang có hiệu lực.
2. Được duyệt làm dịch vụ và chăm sóc loài đó; đủ năng lực với mọi pet trong visit. Đáp ứng giới hạn số lượng, kích thước, hành vi và nhu cầu cụ thể.
3. Địa chỉ trong vùng phục vụ đã duyệt; pet và địa chỉ thuộc Customer đang đặt.
4. Toàn bộ thời gian bận nằm trong lịch làm việc, không ngày nghỉ, không trùng assignment/hold có hiệu lực; đủ thời gian đến và rời địa chỉ.
5. Không vượt giới hạn giờ làm/sức chứa; không có hạn chế tương tác giữa hai bên đang có hiệu lực do Staff xác minh.
6. Đủ điều kiện payment/quote/consent do P51/P01 cung cấp. Nhiều visit phải thu đủ prepay trước offer; một visit postpay không bị ép PAID.
7. Khách chỉ định: đúng sitter đã chọn; proposal và lịch được Customer xác nhận, chưa hết hạn, chưa thay đổi phiên bản.

Thiếu dữ liệu để kiểm tra không được mặc định đạt. Staff cũng không được bỏ qua an toàn, trùng lịch, quyền sở hữu hoặc payment gate.

Dịch vụ đặc thù:

- Ghé thăm: danh sách công việc, thời lượng, thức ăn/nước/dụng cụ do hai bên xác nhận; ghi rõ phạm vi không bao gồm ngủ qua đêm hay thủ thuật thú y.
- Dắt chó: chỉ DOG; mặc định một hộ mỗi lượt, không ghép chó từ nhiều chủ; có dây dắt/biện pháp kiểm soát phù hợp, hướng dẫn hành vi và phương án thời tiết. Tình huống chưa an toàn chuyển Staff; không tự ép thực hiện để đủ checklist.
- Đưa đi thú y: cần địa chỉ nhà, phòng khám, giờ hẹn, hình thức vận chuyển, lồng/đai, người bàn giao, phạm vi chờ và có/không đưa về. Chi phí khám không tự cộng vào tiền dịch vụ. Sitter chỉ hỗ trợ vận chuyển/bàn giao theo phạm vi được đồng ý.
- Không tự tạo quy tắc cho thuốc/tiêm/thủ thuật; thiếu policy và năng lực được duyệt thì loại công việc đó khỏi phạm vi nhận tự động.

## 4. Thời lượng, giờ hẹn và sức chứa

Mặc định đề xuất để pilot, phải được cấu hình theo service/policy version:

| Tham số | Giá trị khởi đầu |
| --- | --- |
| Ghé thăm/chơi cùng pet | Gói 30 phút; thời gian thêm phải hiện trong quote và lịch |
| Dắt chó | Gói 30 phút; số pet và mức xử lý phải nằm trong gói được duyệt |
| Đệm bàn giao sau mỗi visit | 15 phút; đây là thời gian không bán thêm, không tự thu phí |
| Đệm di chuyển | max(10 phút, 20% ETA), làm tròn lên phút |
| Chặng di chuyển ngoài phục vụ để xét tự động | Tối đa 45 phút/chặng; vượt chuyển Staff xem xét |
| Công việc phục vụ mỗi ngày | Tối đa 6 giờ |
| Tổng giờ bận mỗi ngày | Tối đa 8 giờ, tính phục vụ + chờ + di chuyển + đệm + nghỉ bắt buộc |
| Nghỉ giữa ngày | Ít nhất 30 phút sau tối đa 4 giờ bận liên tục; không tính tự lái xe là nghỉ |

Sức chứa thực tế là mức thấp nhất giữa cấu hình hệ thống, giới hạn sitter và giới hạn dịch vụ. Thay đổi giới hạn không được âm thầm làm mất hiệu lực lịch đã nhận; nếu phát sinh xung đột phải có Staff xử lý.

Gói thú y không gán cố định 30 phút: tổng thời gian gồm bàn giao tại nhà + đi đến phòng khám + có mặt trước giờ hẹn theo yêu cầu phòng khám + ngân sách chờ đã thống nhất + chiều về nếu có + bàn giao cuối. Nếu không xác định được phạm vi/thời lượng thì chưa nhận tự động. Chờ vượt dự kiến cần Customer đồng ý phần thay đổi, Staff kiểm tra lịch sau; không tự thu thêm hoặc tự bỏ vật nuôi.

Khách chọn giờ cố định: giữ giờ. Khách chọn cửa sổ [a,b]: giờ bắt đầu thực tế phải trong cửa sổ, đồng thời toàn bộ visit không vi phạm các cam kết khác. Giờ cụ thể được Customer xác nhận trước offer; thay đổi tiếp theo đi qua change request. Ngày giờ lưu UTC, hiển thị giờ Việt Nam. Giữ slot [start,end), tính cả đệm ngoài thời gian phục vụ; không dùng thời gian máy khách để chốt hạn.

## 5. Địa chỉ và thời gian di chuyển

1. Customer nhập địa chỉ và xác nhận ghim bản đồ. Lưu địa chỉ chuẩn hóa, tọa độ [longitude,latitude], độ chính xác/nguồn, entrance note riêng tư và phiên bản.
2. Địa chỉ chưa định vị hoặc ghim lệch chưa được xác nhận: yêu cầu bổ sung/Staff xác minh; không tự gán ETA=0. Không coi cùng quận là đủ gần.
3. Dùng ETA đường bộ theo phương tiện hợp lệ và giờ khởi hành; provider phía server. Khoảng cách đường chim bay chỉ dùng sàng lọc, không thay ETA để xác nhận kịp giờ.
4. Lịch đầu ngày tính từ điểm xuất phát đã xác nhận; lịch cuối tính khả năng về điểm kết thúc nếu sitter khai báo ràng buộc đó. Thời gian nghỉ và chặng phòng khám cũng nằm trong timeline.
5. Provider lỗi: dùng cache đúng điểm/phương tiện và khung giờ tương đương không quá 24 giờ, cộng 30% ETA rồi áp dụng đệm thông thường; gắn độ tin cậy thấp. Đây chỉ là gợi ý cho Staff, không tự xác nhận assignment mới. Không có cache: ROUTING_UNAVAILABLE, giữ các lịch đã xác nhận.
6. Chốt kế hoạch dùng phiên bản tọa độ/ma trận ETA. Trước nhận việc kiểm tra freshness và lịch mới nhất; ETA mới chênh quá max(5 phút,20%) phải tính lại. Lịch tương lai xa chỉ là ETA dự kiến, cần kiểm tra lại trước ngày phục vụ.

API bản đồ chỉ nhận tọa độ và dữ liệu cần cho tính đường; không gửi tên khách, OTP, mã cửa, hồ sơ pet hoặc ghi chú nhà. Việc dùng provider bên ngoài cần đúng cấu hình và thông báo xử lý dữ liệu được duyệt. Không công khai vị trí nhà hoặc tuyến của khách cho sitter chưa được phân công.

## 6. Thuật toán xếp các địa chỉ gần nhau

Tối ưu riêng theo sitter và ngày, trong phạm vi các giờ khách cho phép. Chỉ dịch chuyển lịch chưa chốt; không tự đổi sitter hoặc thứ tự lịch đã nhận nếu ảnh hưởng giờ cam kết.

Với lịch mới B chèn giữa A và C:

- A.end + handoverBuffer(A) + ETA(A,B) + travelBuffer(A,B) <= B.start.
- B.end + handoverBuffer(B) + ETA(B,C) + travelBuffer(B,C) <= C.start.
- B và các chặng liên quan vẫn nằm trong giờ làm/ngày nghỉ/giới hạn sức chứa; giữ đủ khoảng nghỉ.
- Nếu đầu/cuối ngày, thay A/C bằng điểm xuất phát/kết thúc và các ràng buộc ngày tương ứng.

Chi phí chèn = tổng phút di chuyển và đệm tuyến sau chèn − tổng phút di chuyển và đệm tuyến trước chèn. Phải tính cùng phương tiện/giờ dự kiến, kể cả chặng đến phòng khám trong scope. Nếu kết quả âm do nguồn ETA thay đổi, kiểm tra lại baseline; khi chấm điểm dùng max(0,chi phí chèn), không tạo điểm thưởng vô hạn.

Duyệt tất cả vị trí chèn khả thi của mỗi sitter, chọn vị trí có chi phí tăng thấp nhất. Gom theo khu vực chỉ để giảm tập tìm kiếm. Với lịch linh hoạt, thử các mốc khả thi trong cửa sổ và chọn phương án ít tăng thời gian nhất. Có thể cải thiện bằng đổi thứ tự cục bộ chỉ đối với lịch linh hoạt chưa chốt và phải kiểm tra lại mọi ràng buộc.

Thứ tự mục tiêu: không vi phạm an toàn/cam kết → giảm visit chưa có người → giảm nguy cơ trễ → giảm tổng thời gian di chuyển → cân bằng tải. Không hy sinh một lịch đã nhận để giảm vài km. Đây là heuristic chèn lịch có ràng buộc, không tuyên bố tìm tối ưu toàn cục.

Ví dụ tổng hợp: A kết thúc 09:30, đệm bàn giao 15 phút, ETA A→B 15 phút, đệm đường 10 phút: B sớm nhất 10:10. Nếu B phục vụ 30 phút, ETA B→C 10 phút thì C sớm nhất 11:15 (10:40 + 15 + 10 + 10). B lúc 10:00 hoặc C lúc 11:00 đều không khả thi.

## 7. Công thức điểm 0–100 cho ứng viên đủ điều kiện

Điểm dùng cho một visit tại một thời điểm, không phải nhãn chất lượng vĩnh viễn của con người. Không lấy điểm của chuyến trước áp cho chuyến khác.

S = F + T + Q + R + W.

| Thành phần | Tối đa | Công thức |
| --- | --- | --- |
| F: phù hợp và quen thuộc | 30 | 20 × E + 10 × H |
| T: thuận tuyến | 25 | 25 × max(0,1 − extraTravelMinutes/60) |
| Q: chất lượng đánh giá | 20 | 20 × (adjustedRating − 1)/4 |
| R: độ tin cậy thực hiện | 15 | 15 × (0.6 × completionRate + 0.4 × punctualityRate) |
| W: tải công việc | 10 | 10 × max(0,1 − projectedBusyMinutes/480) |

Mọi tỷ lệ giới hạn [0,1]; adjustedRating giới hạn [1,5]; làm tròn chỉ ở điểm tổng để hiển thị 1 chữ số thập phân, so sánh bằng giá trị chưa làm tròn. Thiếu dữ liệu bắt buộc không được lấp bằng 0/100. Các prior dưới chỉ cho cold start, phải đánh dấu không đủ lịch sử.

### 7.1 F: phù hợp dịch vụ/pet

E = min(1, số lượt cùng dịch vụ và cùng loài hoàn thành hợp lệ trong 180 ngày / 20). Với nhiều loài, dùng mức E thấp nhất trong các loài của visit; không lấy kinh nghiệm chó thay kinh nghiệm mèo.

H = min(1, số lượt hoàn thành không có sự cố được xác minh liên quan đến cùng pet trong 180 ngày / 5). Nhiều pet dùng H thấp nhất; chưa từng chăm pet đó thì H=0. Chỉ đếm lượt thực, không đếm lịch giả/hủy. F là điểm kinh nghiệm bổ sung; sitter mới vẫn có thể đạt điều kiện bắt buộc nhờ năng lực/hồ sơ đã duyệt.

### 7.2 T: thuận tuyến

extraTravelMinutes lấy từ vị trí chèn tốt nhất ở mục 6, bao gồm phần di chuyển và đệm tăng thêm, không bao gồm thời gian dịch vụ vốn giống nhau giữa các ứng viên. T được 25 khi không tăng đường đi; thêm 15 phút được 18.75; thêm 30 phút được 12.5; thêm >=60 phút được 0. Vẫn phải thỏa giới hạn từng chặng; điểm không cho phép nhận lịch bất khả thi.

### 7.3 Q: đánh giá có xử lý người mới

Chỉ dùng rating Customer 1–5 sao của visit đã hoàn thành hợp lệ, tối đa một rating/visit/chều, không tự đánh giá. Dùng dữ liệu 180 ngày đã kết luận hợp lệ; không tự xóa đánh giá thấp chỉ vì sitter phản đối.

adjustedRating = (10 × 4.5 + tổng sao hợp lệ) / (10 + số rating hợp lệ).

4.5 sao là prior đề xuất khi thiếu lịch sử, không phải đánh giá công khai của sitter. Người mới hiển thị “Chưa có đánh giá”; không hiển thị 4.5 sao giả. Người có một review 5 sao không tự vượt người có lịch sử tốt dài hạn. Cửa sổ gửi review đề xuất 7 ngày sau hoàn thành; ngày hiệu lực/moderation phải duyệt trước khi bật.

### 7.4 R: độ tin cậy, không phạt từ chối offer

Cửa sổ 90 ngày; chỉ dùng visit đã đến hạn và nguyên nhân đã xác minh.

- completed: lượt có bằng chứng hoàn thành hợp lệ; Staff-close thiếu bằng chứng không tự đếm hoàn thành tốt.
- sitterFault: hủy sau nhận/no-show do lỗi sitter đã kết luận. Khiếu nại đang xử lý không tự coi sitter có lỗi.
- completionRate = (19 + completed) / (20 + completed + sitterFault).
- onTime/late: lượt đã thực hiện có dữ liệu check-in đủ tin cậy; đúng giờ đề xuất đến không quá start+5 phút. GPS thiếu hoặc thiết bị offline phải đối soát, không tự kết luận trễ.
- punctualityRate = (9 + onTime) / (10 + onTime + late).

Hủy do Customer, lỗi nền tảng, bất khả kháng đã xác minh và offer chưa nhận không vào sitterFault. Mỗi visit chỉ được một kết quả completed hoặc sitterFault. Không phạt việc từ chối/hết hạn offer. Dữ liệu quá ít hiển thị độ tin cậy thấp thay tuyên bố sitter đáng tin cậy tuyệt đối. Phân loại nguyên nhân không tự tạo mức phạt tài chính.

### 7.5 W: tải dự kiến

projectedBusyMinutes là toàn bộ phút bận sau khi chèn lịch mới trong ngày: dịch vụ, chờ, đường đi, đệm và nghỉ bắt buộc. Giới hạn giờ là điều kiện bắt buộc độc lập. Không dùng số đơn đơn thuần vì một lượt thú y có thể dài hơn nhiều lượt ghé thăm.

### 7.6 Minh họa tính điểm

Ví dụ sitter có E=0.8, H=0.6, tăng đường 15 phút, 10 review tổng 47 sao, completed=40, sitterFault=1, onTime=36, late=4, tổng giờ bận sau chèn 240 phút:

F=22; T=18.75; adjustedRating=4.6 nên Q=18; completionRate=59/61; punctualityRate=45/50 nên R≈14.10; W=5. Tổng S≈77.9/100.

## 8. Xếp hạng, cơ hội cho người mới và khách chọn người

- Chỉ xếp hạng ứng viên vượt toàn bộ điều kiện bắt buộc và đủ dữ liệu tuyến. AUTO đề xuất S>=60; thấp hơn vẫn có thể được Staff xét, không gọi là không đủ năng lực chỉ vì ít lịch sử.
- Thứ tự: điểm chưa làm tròn giảm dần; bằng nhau thì chi phí chèn thấp hơn; tiếp theo phút bận thấp hơn; tiếp theo thời điểm nhận assignment gần nhất xa hơn; cuối cùng sitterId. Không ưu tiên nhóm unrated trước rated một cách ngầm định.
- Cơ hội người mới: tối đa một lượt trong mỗi nhóm 10 lần chọn tự động của cùng dịch vụ/khu vực/ngày, tính bằng counter atomic. Chỉ xét sitter dưới 5 lượt hoàn thành, không có hạn chế đang hiệu lực, S>=60 và không thấp hơn người đứng đầu quá 5 điểm; chọn người đủ điều kiện có ít lượt được giao nhất. Không có ứng viên thì bỏ lượt, không tạo nợ quota.
- Khách chỉ định: hiển thị khả năng phù hợp, lịch thực, thông tin công khai và rating thật; không tự đổi sang sitter khác. Nếu người được chọn không khả dụng, đưa phương án lịch/người khác và đợi Customer xác nhận.
- Booking nhiều visit: ưu tiên cùng sitter qua H và đề xuất theo cả chuỗi; chỉ hứa cùng người khi tất cả visit đã có assignment của người đó. Nếu cần nhiều sitter, Customer biết rõ người/lịch; không âm thầm đổi.

## 9. Lời mời, nhận việc và chống trùng

Mặc định vận hành đề xuất: một offer có hiệu lực/visit tại một thời điểm, gửi tuần tự; mỗi offer hạn 15 phút theo server time, thử tối đa 3 ứng viên khác nhau/một vòng, tối đa 45 phút rồi chuyển Staff. Chỉ bắt đầu khi payment/slot hold của P51 cho phép; các con số offer này không quyết định hay kéo dài payment intent/giữ slot. Chưa duyệt DIRECTED-TIMEOUT hoặc FIN-01-TIME: chưa bật dispatch thật.

Accept phải trong một transaction: xác thực đúng sitter → kiểm tra deadline/state/version → kiểm tra lại eligibility, payment, lịch và ETA → khóa sitter-level eligibility và sitter-day occupancy (cả hai ngày nếu qua đêm) → tạo assignment duy nhất → vô hiệu offer còn lại → audit/outbox. Tất cả assign/reassign/change/cancel dùng cùng guard; tranh chấp trả 409 và tải lại. Offer đang có hiệu lực cần hold thời gian hữu hạn để không mời sitter nhận hai lịch xung đột; TTL/hold phải đồng bộ hợp đồng P51, không coi TTL database là kiểm tra deadline.

Từ chối/hết hạn: ghi nguyên nhân, tính lại ứng viên theo lịch mới nhất, không gửi lại cùng offer cho cùng sitter trong vòng đó. Lỗi mạng thông báo không chứng minh sitter đã nhận; phản hồi lặp dùng idempotency, không tạo assignment trùng. Tác vụ retry không reset vô hạn số vòng/deadline.

Khách thấy “Đang tìm người” trước khi nhận việc, “Đã có người chăm sóc” sau assignment; xem thay đổi người phụ trách và lịch rõ ràng. Không trình bày top 3 là ba người đã đồng ý.

## 10. Thực hiện lượt, thông tin nhà và chậm trễ

- Trước nhận việc: chỉ dịch vụ, vùng gần đúng, thời lượng, đặc điểm pet cần biết để đánh giá an toàn; không địa chỉ nhà đầy đủ, điện thoại riêng, mã cửa.
- Đề xuất quyền địa chỉ để lập tuyến: chỉ sitter có assignment ACTIVE mới xem địa chỉ đầy đủ từ thời điểm muộn hơn giữa acceptedAt và start−24 giờ, đến checkout/thu hồi assignment. Trước mốc này chỉ xem vùng gần đúng và ETA do server tính. Đây là thay đổi quyền mới phải duyệt và cập nhật P01/P14 trước triển khai; không được âm thầm mở sớm endpoint hiện tại đang giới hạn 60 phút. Thông tin liên hệ dùng kênh trong hệ thống, không công khai số riêng của Customer.
- Ghi chú vào nhà chỉ cho sitter đang được phân công trong [start−60 phút, checkout), thay người phải xác nhận bàn giao trước; thu hồi ngay khi checkout/rút assignment. Staff truy cập đúng nhu cầu vận hành có audit.
- Check-in sớm nhất start−30 phút theo baseline; sớm không tự bắt đầu dịch vụ hay được vào nhà khi khách chưa cho phép. Ảnh/checklist/check-out theo P26; không tự tạo ảnh hoặc xác nhận hoàn tất khi thiếu bằng chứng.
- Đề xuất cảnh báo khi ETA dự kiến trễ >5 phút; Staff liên hệ khi trễ >15 phút hoặc không phản hồi. Đây là cảnh báo vận hành, không tự áp phạt hay kết luận no-show. Trước ngày phục vụ và trước chặng đi, kiểm tra lại lịch/ETA; lỗi notify không thay đổi assignment.
- Visit kéo dài ảnh hưởng lịch sau: sitter báo ngay; Staff tìm phương án thay thế/đổi lịch có Customer đồng ý. Không tự rút ngắn chăm sóc, tự bỏ pet hay đổi giờ các nhà sau.
- Thiếu checkout sau end+2h: Staff-close có lý do và bằng chứng hiện có theo P00; không tạo checkout/report giả, không tự phát sinh doanh thu/điểm tốt.

## 11. Hủy, rút, đổi người và sự cố

- Self-cancel/self-withdraw khi còn ít nhất 60 phút; 60:00 cho phép, 59:59 chuyển Staff; đang chăm sóc không tự rút.
- Sitter rút: chỉ giải phóng assignment đúng state, không tự hủy toàn booking. Tính lại tuyến hai bên, thu hồi quyền riêng tư, đề xuất người thay thế; không tự thay giờ đã hứa.
- Staff đổi người: người mới vượt cùng điều kiện và kiểm tra atomic; cần bàn giao pet/chìa khóa/hướng dẫn, audit và thông báo Customer. Không bỏ qua payment hoặc an toàn vì gần giờ.
- Sự cố pet/người/nhà: dừng công việc chưa an toàn, bảo vệ pet trong phạm vi có thể, liên hệ Customer/Staff và hỗ trợ chuyên môn phù hợp; ghi nhận sự cố, không tự chẩn đoán hay tự nhận quyền quyết định điều trị.
- Quy tắc tiền giữ nguyên P51: một visit postpay hủy hợp lệ miễn phí; paid multi không đổi lịch giữ 30% phần đủ điều kiện bị hủy; lỗi sitter/vận hành không giữ 30% phần chưa cung cấp. Allocation, hoàn tiền, earning, bồi thường còn gate riêng; không dùng điểm để tự trừ tiền hay khóa tài khoản.
- Khiếu nại điểm: sitter xem thành phần và nguồn thống kê, yêu cầu đối soát; Staff quyết định dựa trên bằng chứng, lưu trước/sau, tái tính thống kê. Không chỉnh điểm tùy ý không lý do.

## 12. Màn hình và cấu hình Admin

Customer: lý do đề xuất dễ hiểu (hợp loài/dịch vụ, quen pet, thuận tuyến, rating thật), số lượt/rating, lịch khả dụng; không hiện địa chỉ khách khác hoặc điểm GPS của sitter. Không mô tả điểm là xác suất an toàn hay bảo đảm chất lượng.

Sitter: lịch ngày/tuần, thời gian phục vụ và di chuyển dự kiến, khoảng nghỉ, vùng trước offer, hạn phản hồi, đơn đã nhận; xem điểm thành phần liên quan bản thân và cách khiếu nại. Không cho xem bảng thông tin riêng tư của các sitter khác.

Staff/Admin: ứng viên bị loại và mã lý do, điểm thành phần, độ tin cậy dữ liệu, tuyến có ràng buộc, offer/assignment audit, cảnh báo trễ. Manual override phải ghi lý do, không vượt hard gate; chỉ đổi lựa chọn trong tập hợp đủ điều kiện.

Admin cấu hình versioned: trọng số tổng 100, prior/thời kỳ thống kê, ngưỡng chọn, thời lượng/gói/sức chứa, đệm, giới hạn ETA, offer TTL/số vòng, cảnh báo, quota người mới. Có preview dữ liệu tổng hợp trước kích hoạt, ngày hiệu lực, người duyệt, rollback version; không tự chấm lại lịch đã nhận khi đổi trọng số. Thay lịch/địa chỉ/phạm vi phải tái kiểm tra, snapshot tiền cũ không tự sửa.

## 13. Dữ liệu, riêng tư, kiểm toán và AI

- Chỉ backend tính điểm, ownership, role, deadline, payment gate. Không tin score/distance/assignedSitter do client truyền lên.
- Lưu match run: request/visit version, candidate ID được phép, hard-gate result, từng điểm, phiên bản công thức/ETA, insertion position, tổng giờ, lựa chọn/fallback và actor/time. Log không có mã cửa, contact plaintext hoặc toàn bộ hồ sơ pet.
- Snapshot quyết định giữ để đối soát trong thời hạn retention được duyệt; chưa chốt thời hạn thì không tự tạo kho lịch sử vô hạn hoặc TTL xóa bằng chứng tài chính. Raw GPS không cần cho công thức; không thu thập theo dõi liên tục mặc định.
- Điểm xếp hạng chỉ hỗ trợ điều phối; đình chỉ/loại ứng viên nghề nghiệp lâu dài cần quy trình xét duyệt và người chịu trách nhiệm, không do model tự quyết.
- MVP dùng quy tắc giải thích được. AI chỉ đề xuất lại thứ tự trong tập đủ điều kiện và lịch khả thi, không sửa giá/lịch/phân công. Timeout, ID lạ, trùng, thiếu, score không hợp lệ: quay về quy tắc; không gọi AI là bắt buộc để đặt lịch.
- HouseBuddy train.py dùng dữ liệu sinh từ heuristic; không mang model đó sang PawWorld như model đã chứng minh hiệu quả. Sau khi có dữ liệu PawWorld hợp lệ mới đánh giá offline/shadow, đo trễ/hủy/tổng thời gian di chuyển/công bằng cơ hội; có rollback. Không xuất dữ liệu nhà/khách thật để train khi chưa có quyền.

## 14. Tiêu chí nghiệm thu và trạng thái triển khai

| Trường hợp | Kết quả bắt buộc |
| --- | --- |
| Sitter điểm cao nhưng chưa duyệt/sai dịch vụ/nghỉ/trùng lịch | Bị loại, nêu lý do |
| Vaccine unknown chưa có quy tắc bắt buộc | Không tự coi chưa tiêm/không đạt |
| Địa chỉ chưa có tọa độ xác nhận | Yêu cầu bổ sung, không ETA=0 |
| Cùng phường nhưng không đủ thời gian A→B→C | Không được nhận |
| B sát đầu/cuối ngày, qua ngày hoặc khoảng nghỉ | Kiểm tra đầy đủ các guard/ràng buộc ngày |
| Thú y chỉ có giờ hẹn nhưng chưa rõ chờ/chiều về | Chưa tự gán gói 30 phút |
| Người mới chưa rating | Prior nội bộ, UI không sao giả; cơ hội mới có điều kiện và quota atomic |
| Hủy do khách/claim chưa xác minh | Không tự tính lỗi sitter |
| Hai request nhận cùng visit hoặc cùng sitter trùng giờ | Chỉ một assignment hợp lệ, request kia 409/retry có kiểm tra lại |
| Offer hết hạn, payment gate không đạt, đổi availability trong lúc nhận | Không accept trên snapshot cũ |
| Khách chỉ định từ chối/hết hạn | Không tự chuyển người; xin xác nhận phương án |
| Bản đồ lỗi/AI lỗi | Bản đồ: Staff, không giả ETA; AI: fallback quy tắc |
| Địa chỉ master thay đổi | Lịch đã chốt giữ snapshot; đổi phục vụ cần change request và kiểm tra lại |
| Rút sitter/checkout/đổi người | Thu hồi quyền đúng thời điểm, không rò ghi chú nhà |
| Rerun job/network retry | Không offer/assignment/audit tiền trùng logic |
| Đổi trọng số | Run mới dùng version mới, run cũ giải thích được |

Hiện tại PawWorld đã có code lọc/xếp thứ tự, availability và offer job dạng dependency-injected; chưa có điểm tổng hợp này, ETA đường đi, chèn tuyến hoặc runtime database đầy đủ. Cần thực hiện theo thứ tự: chuẩn hóa schema/DTO và các quyết định còn mở → nối lịch/địa chỉ và quyền → ETA + kiểm tra khả thi → scorer và giao diện giải thích → offer/assignment atomic + job → kiểm thử MongoDB/nhà cung cấp/staging → pilot trước bật tự động.

Hoàn tất triển khai chỉ khi: checks nghiệp vụ và concurrency đạt; dữ liệu thật thuộc đúng owner; không còn gate bị che bằng default; luồng Customer đặt → sitter nhận → đến nhà → hoàn tất được kiểm tra; reviewer khác tác giả approve và Leader merge. Tài liệu này không xác nhận các bước đó đã xảy ra.


## 15. Bảng cấu hình đề xuất để Leader duyệt một lần

| Nhóm | Quyết định đề xuất |
| --- | --- |
| Điểm | F30/T25/Q20/R15/W10, điểm tự động tối thiểu 60 |
| Lịch sử | 180 ngày cho kinh nghiệm/rating; 90 ngày cho độ tin cậy; prior rating 4.5 với 10 lượt tương đương |
| Đệm và sức chứa | Bàn giao 15 phút, đường max(10 phút,20% ETA), chặng <=45 phút cho auto, phục vụ <=6h/ngày, bận <=8h/ngày, nghỉ 30 phút sau tối đa 4h bận liên tục |
| Offer | Tuần tự, 15 phút/offer, 3 người/vòng rồi Staff; không tự đổi người trong directed booking; phải đồng bộ FIN-01-TIME trước bật |
| Người mới | Tối đa 1/10 cơ hội chọn, dưới 5 lượt, chênh <=5 điểm với top và đạt ngưỡng 60 |
| Đánh giá và trễ | Đề xuất review trong 7 ngày, đúng giờ nếu đến <=start+5 phút; trễ >15 phút liên hệ Staff, không tự quy lỗi |
| Địa chỉ | Đề xuất người đã nhận xem địa chỉ từ max(acceptedAt,start−24h); ghi chú vào nhà giữ [start−60 phút,checkout); thay đổi quyền phải được duyệt riêng với P01/P14 |
| Tiền và an toàn | Giữ chính sách P51 đã duyệt, không thêm phạt tiền từ điểm; không cho điểm hoặc AI vượt điều kiện an toàn |

Phê duyệt bản này chỉ chốt các đề xuất được nêu rõ; không thay thế kiểm tra provider, gate tài chính, migration quyền hay nghiệm thu runtime. Không tự xuất bản thành policy khách hàng từ tài liệu thiết kế.
