# Đọc phiên bản catalog theo thời điểm bằng index hiện hữu

ServiceVersion, ServicePolicyVersion, ServicePriceVersion có unique index
(serviceId,effectiveAt); SystemSettingVersion có unique(key,effectiveAt). Vì vậy
trong một resource không thể có hai phiên bản cùng effectiveAt. `version` không
cần làm tie-breaker khi đã lọc đúng service/key và chọn effectiveAt lớn nhất.
Giữ uniqueness và toàn bộ indexes; không suy diễn index không dùng từ thống kê
thiếu quyền, không drop/create index hoặc migrate dữ liệu trong đợt này.

Read-only explain live: truy vấn service/policy hiện có SORT; mẫu service đọc2
keys/docs để trả1. Sort chỉ effectiveAt dùng existing unique index ngược chiều,
không SORT, đọc1/1; giá hiện đã dùng index phụ nên mẫu này không cải thiện.
Fixture100services/100kversions cùng schema indexes: keys/docs501→1, p953,24→0,87ms
(40 mẫu sau5warmup, một client, old→new, Mongo8.0.34). Không tuyên bố latency hay
capacity production. Rà cả dữ liệu tương lai, thiếu bản hiệu lực và version
được ghi không theo effectiveAt. Không được lọc ACTIVE/PUBLISHED trước khi chọn
phiên bản: withdrawal phải giữ fail-closed, không hồi sinh lịch sử cũ.

Chỉ bỏ tie-breaker ở point lookup (và price history đã lọc một service). Batch
aggregation/global sort giữ nguyên trong đợt này. API DTO/status/auth/error,
integerVND, version histories và transaction writers giữ nguyên.

Trước rollout: unique index native tồn tại; regression point-in-time/backdated/
future/withdrawal và duplicate-effectiveAt; explain trên fixture lớn và kiểm tra
kết quả cũ/mới tương đương. Checks/review/CI và backup/restore theo quy trình.
Không có migration apply/validator/retention; rollback code giữ nguyên dữ liệu.
