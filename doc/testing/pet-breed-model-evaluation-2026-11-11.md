# Khảo sát nhận diện giống qua ảnh — 11/11/2026

Kết luận cho đợt onboarding: chưa tích hợp hoặc tự bật nhận diện ảnh. Chủ dự án
cho phép bỏ nếu không đáp ứng ưu tiên nhanh/chính xác. Giữ danh mục hiện tại
và chọn tay; không tải ảnh nhận diện lên R2, không thêm provider/dependency vào runtime.
Nghiên cứu và file thử chỉ ở thư mục cục bộ bị ignore, không nằm trong release.

## Hai model được yêu cầu

| Model | Artifact nguồn được kiểm tra | Phạm vi |
| --- | --- | --- |
| [Dog-O-Matic](https://huggingface.co/10cdizzle/dog-o-matic) | revision `a21109ce534c543d53c4560b985e3dfb07788680`, 15.333.890 byte, SHA256 `48c119f41b0e5300a45d09eb52c2c83cc1f7cc6b521d20f953ebd2ff9412284e` | 127 nhãn chó; có metadata nhãn/thông số chuẩn hóa |
| [ScottMueller](https://huggingface.co/ScottMueller/Cat_Dog_Breeds.ONNX) | revision `b0518d138139e585e89c65defb82a7083c9ccff5`, 47.162.250 byte, SHA256 `9ddd710ce44d04b7ba763eb393e74d5988728d4fcccfcdc99a12603dccce1014` | ResNet18, 37 nhãn chó/mèo; không có bảng nhãn trong metadata ONNX |

Cả hai là classifier giống, không có đầu ra tuổi/cân nặng. Model card không
chứng minh khả năng ước lượng các trường đó từ ảnh, nên vẫn nhập tay.
Dog-O-Matic mô tả kết quả là giống về ngoại hình, không phải huyết thống;
[repository gốc](https://github.com/10CDizzle/Dog_O_Matic) cũng lưu ý provenance
quyền phân phối weights còn chưa giải quyết dù model card khai báo MIT.
Không phân phối weights này trong repository/release Paw World Care.

[Notebook của tác giả ScottMueller](https://github.com/meanderingstream/fastai_course22/blob/main/saving-cat-dog-breed-fastai-model-in-onnx.ipynb)
xác nhận model được export với batch 10 và đầu vào 224 × 224, trong khi bước
Resize huấn luyện là 192. Đây là ràng buộc artifact, không phải yêu cầu khách
cung cấp 10 ảnh. Nhãn được lowercase rồi fastai Categorize sắp xếp; đã đối chiếu
với danh mục Oxford và code fastai, nhưng không suy ra bảo đảm chất lượng
ngoài tập nguồn. [Oxford-IIIT Pet](https://www.robots.ox.ac.uk/~vgg/data/pets/).

## Thử nghiệm kỹ thuật thực sự đã chạy

Chỉ trên máy phát triển, ONNX Runtime CPU và Chromium/WASM single-thread:

- Sửa shape batch Scott từ 10 thành 1, gồm initializer Reshape `[10,-1]`.
  Tám tensor tổng hợp cho logits trùng bản gốc; không cần 10 ảnh người dùng.
- Bản FP32 batch 1 vẫn khoảng 47 MB. Thử dynamic QUInt8 tạo artifact khoảng
  11,94 MB; tốc độ native khoảng 32–38 ms/ảnh trong thử nghiệm tổng hợp.
- Chromium: Dog INT8 khoảng 157–248 ms/ảnh; Scott QUInt8 batch 1 khoảng
  59–66 ms/ảnh. Chạy từ loopback, đã loại trừ tải model qua mạng Internet;
  các số này không phải SLA production hoặc benchmark điện thoại.
- Runtime WASM đã kiểm tra khoảng 14,85 MB, ngoài model. Tải lần đầu vẫn là
  chi phí đáng kể; cache có thể hỗ trợ lần sau nhưng không bảo đảm lần đầu nhanh.
- So sánh 12 thumbnail ví dụ từ trang Oxford: batch-1 FP32 giữ top-1 của bản
  gốc; quantization đổi top-1 ở 2 ảnh. Có các dự đoán sai ngay ở ảnh ví dụ.
  Đây là probe kiểm tra export/thứ tự nhãn, có thể trùng dữ liệu huấn luyện;
  tuyệt đối không gọi là đo accuracy độc lập hay suy rộng sang ảnh khách hàng.

Ảnh tải từ nguồn công khai được cách ly với URL/hash và ghi rõ vai trò;
không đưa probe, weights, package Python hay bản xuất thử vào Git hoặc R2.
Không huấn luyện bằng dữ liệu khách hàng và không gọi Gemini để che hạn chế
model. Một vòng đối chiếu bổ sung cũng cần đo latency/chất lượng riêng trước
khi được coi là cải thiện.

## MongoDB và hướng mở lại sau này

Đã đọc cả mongodb-schema-design và mongodb-query-optimizer. Kiểm tra read-only
VPS: 24 giống trong `reference_catalog`, index unique `(kind, code)` và partial
index `(active, species, name)` cho BREED; query catalog hiện xét/trả 24 document.
Mã giống đang được Pet sử dụng được giữ nguyên; không thêm collection/index,
không đổi validator, TTL hay thêm nhãn không có consumer đủ điều kiện.

Nếu mở lại: cần bộ đánh giá hợp lệ, kiểm tra nhãn/alias từng model, không gộp
nhầm Poodle/Corgi hoặc nhãn màu/lông thành giống, đo tải lạnh/ấm và thiết bị
yếu, timeout/hủy worker, ảnh không phải chó/mèo và giống ngoài danh mục.
Chỉ gợi ý để khách xác nhận; không tự đổi species/breed hoặc suy luận giá,
sức khỏe, tuổi, cân nặng. Mở rộng danh mục phải có plan additive, dry-run,
backup/restore, kiểm tra ref/index và rollback, không ghi đè mã cũ.
