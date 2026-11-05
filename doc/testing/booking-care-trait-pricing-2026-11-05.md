# Báo giá bị chặn vì đặc điểm chưa có quy tắc

## Nguyên nhân và quyết định

Kiểm tra production ngày 05/11/2026: dịch vụ `home-care` có chính sách hiệu lực, nhưng catalog hồ sơ cho chọn 15 đặc điểm trong khi các policy chỉ nhận 11. Bốn mã chưa có rule là `slow-introduction`, `carrier-assistance`, `escape-risk`, `extended-play`. Pricing trả 409 đúng theo cơ chế chặn thiếu quy tắc; thông báo chung khiến Customer không biết mục nào cần xử lý.

Chủ dự án đã duyệt trong phiên 05/11/2026: làm quen chậm, hỗ trợ lồng và chống chạy thoát là yêu cầu năng lực không phụ thu. Thời gian chơi nằm trong thời lượng dịch vụ khách chọn theo đơn vị giá hiện có; không tự cộng phút hoặc tạo phụ phí đặc điểm. Quyết định được ghi bằng `OWNER_CARE_TRAITS_2026_11_05_V1`.

## Thực thi

- Bổ sung bốn rule 0 VND/0 bps vào chính sách demo cho các lần tạo mới, có giải thích rõ.
- Migration riêng chỉ thêm phiên bản APPROVED mới từ policy cuối đang APPROVED và hiệu lực; giữ nguyên rule, cap, billingMode, combo, giá, policy cũ và snapshot booking/quote. Không chạy ở startup.
- Chạy dry-run để xem kế hoạch. Apply yêu cầu xác nhận database và hash của toàn bộ policy nguồn; nếu Admin đổi dữ liệu, có policy draft/tương lai, rule trùng hoặc khoản phí cần hòa giải thì dừng, không ghi một phần.
- Quy tắc chưa biết vẫn trả 409. Phản hồi owner-scoped ghi rõ tên đặc điểm còn thiếu; UI giữ lựa chọn và không tạo booking khi quote thất bại. Không sửa matching/eligibility/thuế/phí khác.

```sh
node scripts/migrations/care-trait-policy.js
node scripts/migrations/care-trait-policy.js --apply --database DATABASE_NAME --expected-plan-hash REVIEWED_PLAN_HASH
```

Lấy config qua môi trường hiện có; không đưa giá trị `.env` hoặc dữ liệu cá nhân vào lệnh/báo cáo. Trên production chỉ chạy từ main đã review, sau backup/restore và dry-run mới.

## Kiểm tra

Mongo cô lập kiểm tra 13 dịch vụ, phiên bản cũ bất biến, rerun không nhân bản, giữ nguyên phụ phí cũ, thời lượng 30/60 phút tính theo bảng giá, chặn plan cũ/rule có phí/draft. HTTP quote tái hiện thiếu rule → migration → báo giá cùng tổng tiền cho trait không phí; trait lạ vẫn bị chặn. UI kiểm tra thông báo cụ thể, giữ pet đã chọn và giải thích thời lượng. Kết quả thực tế được ghi ở PR/handoff; fixture không tạo booking hoặc thanh toán thật.
