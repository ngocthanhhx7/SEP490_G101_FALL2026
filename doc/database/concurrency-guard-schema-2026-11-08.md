# Đồng bộ schema với khóa đồng thời hiện hữu

Các raw transaction dùng `$inc` trên document cha để serialize booking, ký hợp
đồng và lập lịch với các thay đổi eligibility. Đây là dữ liệu điều phối cần giữ,
không phải thuộc tính dư để xóa. Audit read-only tìm thấy 14 document có guard
ngoài schema: pets4, customeraddresses4, users4, sitterstatuses2; các giá trị đều
là số nguyên không âm. Luồng scheduling còn ghi guard vào aisitterprofiles khi
claim capability; schema phải mô tả cả đường ghi này dù chưa thấy guard live.

| Collection | Guard | Owner ghi |
| --- | --- | --- |
| pets, customeraddresses | bookingGuard | booking checkout |
| users | contractGuard | employment document |
| users, sitterstatuses, aisitterprofiles | schedulingGuardVersion | employee scheduling |

Khai báo field optional, select:false, integer từ0 đến MAX_SAFE_INTEGER, không
default. Document chưa tham gia workflow không bị thêm0; `$inc` raw giữ nguyên
semantics. Không tạo collection/index/TTL, không đổi tên collection, không gom
khóa vào collection riêng hoặc bỏ write lock. Không bật native validator hay
backfill trong đợt này: thay đổi schema ứng dụng phải tương thích dữ liệu cũ.

Trước rollout: đọc Git/PR/CI/local/VPS, rà DTO và raw writers, kiểm tra read-only
giá trị guard; test hydrate/validate dữ liệu raw, projection mặc định, update/save
giữ guard và transaction conflict/abort. Chạy checks cấu hình và review độc lập.
Deployment dùng reviewed main và backup/restore theo quy trình hiện có, giữ.env.
Không có data migration apply; rollback code giữ nguyên mọi giá trị guard trong
DB. Raw writes vẫn cần domain validation; Mongoose declaration không thay thế
native validation hoặc chứng minh toàn bộ dữ liệu hợp lệ.

Đây là sửa lệch hợp đồng schema, chưa phải giảm footprint. Không suy diễn thành
giảm collection/index hoặc tăng throughput; các thao tác concurrency giữ nguyên.
