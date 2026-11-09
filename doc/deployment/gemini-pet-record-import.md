# Đọc sổ thú cưng bằng Gemini

Chức năng tùy chọn, mặc định tắt. Model mặc định `gemini-3.1-flash-lite`. Không dùng tài khoản đăng nhập Antigravity/Gemini web thay cho Gemini API key. Hạn mức phụ thuộc project/API tier thực tế; ảnh dashboard không chứng minh key đã hoạt động.

## Cấu hình sau khi có key

Tạo key trong Google AI Studio cho project được phép sử dụng. Không gửi key vào chat, Git, frontend hoặc ảnh chụp màn hình. Đọc điều khoản xử lý dữ liệu và chọn project/tier phù hợp trước khi dùng sổ khách hàng thật; thử trước bằng tài liệu tổng hợp. Không suy ra chính sách dữ liệu hoặc hạn mức của 3.1 Flash-Lite từ hàng model khác trong dashboard.

Theo [EC2 environment guide](ec2-environment-guide.md), mở file `/opt/pawworldcare/shared/.env` bằng quyền root, giữ nguyên các giá trị đang có và thêm/sửa đúng các biến sau:

```dotenv
PET_RECORD_IMPORT_ENABLED=true
GEMINI_API_KEY=REPLACE_WITH_YOUR_PRIVATE_KEY
GEMINI_PET_RECORD_MODEL=gemini-3.1-flash-lite
```

Chỉ đây là mẫu; không dán placeholder vào production. Key chỉ ở backend. Sau thay đổi env phải tái tạo container theo quy trình release; restart container không nạp lại env-file. Nếu thiếu key khi bật, backend từ chối khởi động với tên biến thiếu, không in giá trị. Khi tắt, UI giữ nhập tay và giải thích tính năng chưa bật. Không thay `AI_ENABLED`: biến đó điều khiển gợi ý sitter, tách biệt với đọc sổ.

## Luồng và giới hạn

Customer đăng nhập mở thêm/sửa thú cưng → chọn sổ JPEG/PNG/PDF tối đa5MB → đồng ý gửi nội dung tới Google → trích xuất → đối chiếu đoạn nguồn và trang → chọn/sửa từng mục → xác nhận → đưa vào bản sửa → Lưu thú cưng. Không có tự lưu. Kết quả không xác minh y tế, không chẩn đoán/kê đơn/tính liều; chưa biết không phải không có rủi ro. Mục không chọn không đổi. Đóng bản sửa chưa lưu vẫn cần xác nhận.

Backend không lưu tệp, tên tệp hoặc phản hồi Gemini vào Mongo/R2/log ứng dụng. Google xử lý dữ liệu theo điều khoản provider; không tuyên bố Google không lưu dữ liệu. Nội dung sổ có thể chứa thông tin cá nhân: khách phải xem/loại bỏ thông tin không cần thiết trước khi gửi. Bản đầu không cung cấp kho lưu sổ gốc hoặc lịch sử bệnh án.

Ảnh được kiểm tra định dạng, tối đa20MP, bỏ metadata và thu gọn1600px; PDF kiểm tra signature/EOF/size, không tuyên bố kiểm định toàn bộ cấu trúc PDF. Không thực thi liên kết/mã/nội dung chỉ dẫn trong tài liệu. Gọi countTokens trước, từ chối quá16000tokens; giới hạn generation6000outputtokens, phản hồi96KiB và tổng timeout45giây. Đây là chặn kích thước/công việc, không phải cam kết chi phí hay độ chính xác. Không tự retry trả phí. Hai tác vụ đồng thời và hai yêu cầu/phút/customer trên mỗi process; chưa phải quota toàn project hoặc bộ đếm billing bền vững. Khi429, báo hạn mức và giữ nhập tay.

## Nghiệm thu trước khi bật thật

1. Metadata chỉ Customer truy cập, không lộ key; guest401, Staff/Admin403; POST phải có CSRF và đồng ý gửiGoogle.
2. Dùng tài liệu tổng hợp một trang để kiểm tra model/key/quota thực tế, ảnh xoay, PDF scan, chữ mờ, dữ liệu thiếu và nguồn trang.
3. Kiểm tra thiếu key, hết quota, lỗi provider và timeout đều không sửa hồ sơ.
4. Kiểm tra khách không chọn hoặc chưa xác nhận thì không áp dụng; sửa bản nháp rồi phải xác nhận lại; lưu vẫn kiểm tra owner/version/idempotency.
5. Chỉ đánh dấu provider acceptance sau khi thực sự chạy với key. Unit/integration stubs không chứng minh chất lượng đọc sổ thật.

Tắt nhanh bằng `PET_RECORD_IMPORT_ENABLED=false` và tái tạo container đúng quy trình. Nguồn rollback046f33b tương thích careProfile hiện có; không có migration hoặc index mới.

Nguồn chính thức: [model](https://ai.google.dev/gemini-api/docs/models/gemini-3.1-flash-lite), [PDF](https://ai.google.dev/gemini-api/docs/document-processing), [structured output](https://ai.google.dev/gemini-api/docs/structured-output), [điều khoản](https://ai.google.dev/gemini-api/terms).
