# Thu gọn cấu trúc collection — 08/11/2026

100 collection hiện tại không phải mục tiêu thiết kế. Cần tách số thực thể nghiệp vụ
khỏi số kho hạ tầng, bản sao chuyển tiếp và subsystem cũ được provision theo model.
Không dùng số lượng collection hoặc việc collection rỗng làm lý do xóa dữ liệu.

## Trạng thái và nguồn kiểm chứng

Source đang phục vụ khi lấy census: main `026a5e1`. Chẩn đoán chỉ đọc,
maxPoolSize 1, maxTimeMS 3.000; không đọc nội dung document, không gọi `$indexStats`.
Có 100 collection, 1.033 document, 260 index; 46 collection rỗng.
Số liệu là ảnh chụp ngày kiểm tra, không là cam kết cardinality tương lai.

| Nhóm ownership | Collections | Documents | Indexes |
| --- | ---: | ---: | ---: |
| Identity/contact | 7 | 115 | 19 |
| Application/employment intake | 8 | 225 | 26 |
| Owned/pet reference data | 5 | 136 | 12 |
| Catalog and policies | 9 | 131 | 28 |
| Matching and routing | 8 | 43 | 22 |
| Scheduling | 7 | 113 | 12 |
| Booking/care/receipts | 11 | 33 | 23 |
| Legacy earning/settlement | 16 | 0 | 55 |
| Employee payroll | 9 | 83 | 24 |
| Commerce | 7 | 35 | 20 |
| Reviews/public profile | 5 | 47 | 10 |
| Notification | 2 | 39 | 3 |
| Private media | 5 | 32 | 5 |
| Provisioning | 1 | 1 | 1 |

## Nguyên nhân cần sửa trước

`provisionDeploymentStorage` tạo collection/index cho mọi model đã đăng ký.
Vì thế một service khởi tạo producer không dùng vẫn có thể mở rộng physical schema.
`createBookingFinanceSourceService` mặc định EMPLOYEE và runtime truyền rõ EMPLOYEE,
nhưng trước thay đổi này vẫn luôn dựng legacy earning source/accrual service.
Producer đó đăng ký 12 model settlement và 4 model accrual.

Census xác nhận cả 16 collection thuộc hai factory này đều rỗng và có tổng 55 index.
Tại thời điểm kiểm tra, tổng indexBytes là 225.280 và storageBytes là 65.536.
Đây là bytes do collStats báo, không phải lợi ích RAM hay dung lượng chắc chắn thu hồi.
Việc chúng rỗng không chứng minh không có consumer hoặc không có write path.

Bước đầu chỉ dựng producer khi compensationModel là LEGACY_PARTNER. EMPLOYEE vẫn
chạy completion/payroll credit hiện có; drain và enqueue của legacy vẫn no-op trong
EMPLOYEE. Mode legacy giữ nguyên producer, schema, unique indexes và công thức.
Không thêm flag/env mới, không đổi endpoint, không tự gỡ collection.

**Bước này chưa giảm collection production.** Trong composition toàn app, settlement
routes, earnings dashboard và complaint financial-hold adapter còn đăng ký/đọc các
model cũ. Không đổi provisioner thành bộ lọc theo tên để che phụ thuộc còn tồn tại.

## Các nhóm cần thu gọn, theo thứ tự

1. **Subsystem legacy earning/settlement:** xác định API/UI còn cần giữ, reader lịch sử,
   default unresolved policy, complaint/refund hold và mọi worker. Tách phần EMPLOYEE
   khỏi legacy trước khi ngừng provision. Nếu cả 16 store đủ điều kiện nghỉ dùng,
   phép trừ là 100 -> 84; đây là một kịch bản có điều kiện, chưa là target hay phê duyệt.
   `earningaccrualtasks` chưa nằm trong 16 vì finance-source storage còn assert nó.
2. **Bản sao chuyển tiếp:** servicepresentations có metadata đã nhúng trong services.
   Loại fallback/compatibility writer sau kiểm chứng đầy đủ rồi mới xin cleanup legacy.
3. **Idempotency:** 8 collection có hậu tố commands không phải 8 thực thể nghiệp vụ.
   Thiết kế shared command store với namespace + operation/actor/key, fingerprint và
   result/reference giữ nguyên BSON. Không áp một TTL chung hoặc mất lịch sử replay.
   Settlement commands có compound uniqueness; employment document command lưu documentId,
   payroll có sourceRequestHash, review có payloadHash: không đổi tên field hàng loạt.
4. **Event/audit:** 9 tên có audit/event; notificationevents là deduplication record,
   không phải audit log. FinanceSourceEvent được review/training exporter tham chiếu
   completionEventId, nên shared typed event store phải giữ định danh và mọi uniqueness.
   Không nhúng mảng lịch sử không giới hạn vào User/Booking.
5. **Dữ liệu một-một của sitter:** đánh giá nhúng status, capability và public profile
   thành các subdocument có version/quyền sở hữu riêng trong User. Giữ ranh giới
   private/moderation/Staff verification, hidden projection và các shared guard writes.
   Trước khi chọn cần đo query/index, document size và contention trên User.
6. **Reference/version/counter:** breed+trait có thể dùng typed reference catalog;
   catalog versions có thể chung kho typed immutable versions với unique theo loại,
   resource, version/effectiveAt; counter có namespace và atomic increment.
   Chỉ chọn nếu giảm tổng độ phức tạp và chi phí, không gộp pricing authority vào AI.

## Điều kiện retirement/migration

- Lập đủ writer/reader/worker graph, cả factory indirect và raw collections; kiểm tra
  API auth/status/error, UI selection và source provenance. Giữ mọi logical ID.
- Preflight chỉ đọc phải từ chối unknown fields/type, duplicate namespace, conflict,
  missing reference hoặc lịch sử không được bảo toàn; không sửa dữ liệu để pass.
- Với shared store, benchmark query/index/write/storage và isolation giữa domain;
  namespace phải bảo vệ uniqueness cả khi cùng legacy ID ở hai domain.
- Copy additive trước. Chặn writer cũ hoặc có dual-read/catch-up có kiểm chứng;
  blue/green overlap không tự bảo đảm không mất command/event cuối cùng.
- Gói source được review/CI, backup mới có restore thử và manifest kiểm chứng.
  Sau cutover, shadow/hash/counter so sánh trước khi gỡ fallback và xin drop cụ thể.
- Rollback phải phục hồi đủ legacy records, index/validator và các bản ghi mới sau
  cutover; không chỉ trỏ code cũ về các collection đã bị gỡ. Không khôi phục DB để
  che một migration conflict hoặc ghi đè giao dịch hợp lệ.

## Quan hệ với kiểm toán query

DB-06 preview N+1 vẫn cần batch/projection theo request, giữ eligible và recheck ở
invite/accept. Không tái sử dụng eligibility cache giữa các request hoặc nhiều ngày.
DB-07 overview cap không trực tiếp chặn submit. Các đề xuất balance projection,
batched writer validation và admin summary thuộc subsystem cần xác định lifecycle
ở trên; không tạo thêm projection collection trước khi quyết định ownership đó.
Không xem synthetic ready policy là phê duyệt bật production payout.

## Checklist ownership của toàn bộ collection

Disposition dưới đây là đầu mối thiết kế, không phải quyết định drop/merge.
Các model cùng domain có thể vẫn cần physical stores khác nhau vì cardinality,
retention hoặc unique/transaction ownership.

| Collection | Domain | Hướng rà soát |
| --- | --- | --- |
| account_contact_audit_events | Identity/contact | Typed event store; giữ IDs/refs/quyền |
| aibreeds | Owned/pet reference data | Typed reference catalog |
| aidecisions | Matching and routing | Giữ; chưa có căn cứ gộp/xóa |
| aipricingpolicies | Catalog and policies | Giữ; chưa có căn cứ gộp/xóa |
| airankingpolicies | Matching and routing | Giữ; chưa có căn cứ gộp/xóa |
| airankmodels | Matching and routing | Giữ; chưa có căn cứ gộp/xóa |
| airoutingmatrixes | Matching and routing | Giữ; chưa có căn cứ gộp/xóa |
| aischeduleblocks | Matching and routing | Giữ; chưa có căn cứ gộp/xóa |
| aisitterprofiles | Matching and routing | User subdocument; review privacy/CAS/contention |
| aitraits | Owned/pet reference data | Typed reference catalog |
| aivisitoutcomes | Matching and routing | Giữ; chưa có căn cứ gộp/xóa |
| applicantdocumentquotas | Private media | Giữ; chưa có căn cứ gộp/xóa |
| applicantdocuments | Private media | Giữ; chưa có căn cứ gộp/xóa |
| application_mails | Application/employment intake | Giữ; chưa có căn cứ gộp/xóa |
| authsessions | Identity/contact | Giữ; chưa có căn cứ gộp/xóa |
| bookingearningsnapshots | Legacy earning/settlement | Retirement sau khi tháo đủ phụ thuộc |
| bookings | Booking/care/receipts | Giữ; chưa có căn cứ gộp/xóa |
| caremediabindings | Booking/care/receipts | Giữ; chưa có căn cứ gộp/xóa |
| cases | Booking/care/receipts | Giữ; chưa có căn cứ gộp/xóa |
| catalogprovisioningruns | Catalog and policies | Giữ; chưa có căn cứ gộp/xóa |
| completedbookingordinals | Legacy earning/settlement | Retirement sau khi tháo đủ phụ thuộc |
| contacts | Identity/contact | Giữ; chưa có căn cứ gộp/xóa |
| customeraddresses | Owned/pet reference data | Giữ; chưa có căn cứ gộp/xóa |
| customerreviewcommands | Reviews/public profile | Shared command store có namespace |
| demopopulationruns | Provisioning | Giữ; chưa có căn cứ gộp/xóa |
| earningaccrualoutboxes | Legacy earning/settlement | Retirement sau khi tháo đủ phụ thuộc |
| earningaccrualtasks | Booking/care/receipts | Giữ; chưa có căn cứ gộp/xóa |
| earningadjustments | Legacy earning/settlement | Retirement sau khi tháo đủ phụ thuộc |
| earningledgerentries | Legacy earning/settlement | Retirement sau khi tháo đủ phụ thuộc |
| earnings | Legacy earning/settlement | Retirement sau khi tháo đủ phụ thuộc |
| employeeavailabilities | Scheduling | Giữ; chưa có căn cứ gộp/xóa |
| employeeavailabilityrevisions | Scheduling | Giữ; chưa có căn cứ gộp/xóa |
| employeeschedulecommands | Scheduling | Shared command store có namespace |
| employeescheduleevents | Scheduling | Typed event store; giữ IDs/refs/quyền |
| employeescheduleproposals | Scheduling | Giữ; chưa có căn cứ gộp/xóa |
| employeevisitoffers | Scheduling | Giữ; chưa có căn cứ gộp/xóa |
| employeevisittravels | Scheduling | Giữ; chưa có căn cứ gộp/xóa |
| employmentcontracts | Employee payroll | Giữ; chưa có căn cứ gộp/xóa |
| employmentdocumentcommands | Application/employment intake | Shared command store có namespace |
| employmentdocumentcounters | Application/employment intake | Namespaced atomic counter |
| employmentdocuments | Application/employment intake | Giữ; chưa có căn cứ gộp/xóa |
| financesourcecommands | Booking/care/receipts | Shared command store có namespace |
| financesourceevents | Booking/care/receipts | Typed event store; giữ IDs/refs/quyền |
| financiallocks | Legacy earning/settlement | Retirement sau khi tháo đủ phụ thuộc |
| notificationevents | Notification | Dedup record; giữ replay contract |
| notifications | Notification | Giữ; chưa có căn cứ gộp/xóa |
| otpchallenges | Identity/contact | Giữ; chưa có căn cứ gộp/xóa |
| otpthrottles | Identity/contact | Giữ; chưa có căn cứ gộp/xóa |
| paymentintents | Booking/care/receipts | Giữ; chưa có căn cứ gộp/xóa |
| payments | Booking/care/receipts | Giữ; chưa có căn cứ gộp/xóa |
| payrolladjustments | Employee payroll | Giữ; chưa có căn cứ gộp/xóa |
| payrollcommands | Employee payroll | Shared command store có namespace |
| payrollevents | Employee payroll | Typed event store; giữ IDs/refs/quyền |
| payrollmonthguards | Employee payroll | Giữ; chưa có căn cứ gộp/xóa |
| payrollservicecredits | Employee payroll | Giữ; chưa có căn cứ gộp/xóa |
| payrollsourceclaims | Employee payroll | Giữ; chưa có căn cứ gộp/xóa |
| payrollstatements | Employee payroll | Giữ; chưa có căn cứ gộp/xóa |
| petcarecommands | Owned/pet reference data | Shared command store có namespace |
| pets | Owned/pet reference data | Giữ; chưa có căn cứ gộp/xóa |
| privateimagequotas | Private media | Giữ; chưa có căn cứ gộp/xóa |
| privateimages | Private media | Giữ; chưa có căn cứ gộp/xóa |
| productcarts | Commerce | Giữ; chưa có căn cứ gộp/xóa |
| productcounters | Commerce | Namespaced atomic counter |
| productcustomerrefusals | Commerce | Giữ; chưa có căn cứ gộp/xóa |
| productorders | Commerce | Giữ; chưa có căn cứ gộp/xóa |
| productphotos | Commerce | Giữ; chưa có căn cứ gộp/xóa |
| products | Commerce | Giữ; chưa có căn cứ gộp/xóa |
| profileavatars | Private media | Giữ; chưa có căn cứ gộp/xóa |
| publicpolicyversions | Catalog and policies | Typed version store; giữ effective/version unique |
| refunds | Booking/care/receipts | Giữ; chưa có căn cứ gộp/xóa |
| reviews | Reviews/public profile | Giữ; chưa có căn cứ gộp/xóa |
| salaryadvances | Employee payroll | Giữ; chưa có căn cứ gộp/xóa |
| servicepolicyversions | Catalog and policies | Typed version store; giữ effective/version unique |
| servicepresentations | Catalog and policies | Bản sao legacy; cần equality/freeze/cleanup approval |
| servicepriceversions | Catalog and policies | Typed version store; giữ effective/version unique |
| services | Catalog and policies | Giữ; chưa có căn cứ gộp/xóa |
| serviceversions | Catalog and policies | Typed version store; giữ effective/version unique |
| settlementcommands | Legacy earning/settlement | Retirement sau khi tháo đủ phụ thuộc |
| settlementevents | Legacy earning/settlement | Retirement sau khi tháo đủ phụ thuộc |
| settlementevidences | Legacy earning/settlement | Retirement sau khi tháo đủ phụ thuộc |
| settlementoutboxes | Legacy earning/settlement | Retirement sau khi tháo đủ phụ thuộc |
| settlementrequests | Legacy earning/settlement | Retirement sau khi tháo đủ phụ thuộc |
| settlementtransferclaims | Legacy earning/settlement | Retirement sau khi tháo đủ phụ thuộc |
| settlementtransfers | Legacy earning/settlement | Retirement sau khi tháo đủ phụ thuộc |
| settlementweekclaims | Legacy earning/settlement | Retirement sau khi tháo đủ phụ thuộc |
| sitterapplicationaudits | Application/employment intake | Typed event store; giữ IDs/refs/quyền |
| sitterapplicationdownloadquotas | Application/employment intake | Giữ; chưa có căn cứ gộp/xóa |
| sitterapplications | Application/employment intake | Giữ; chưa có căn cứ gộp/xóa |
| sitterpublicprofileaudits | Reviews/public profile | Typed event store; giữ IDs/refs/quyền |
| sitterpublicprofilecommands | Reviews/public profile | Shared command store có namespace |
| sitterpublicprofiles | Reviews/public profile | User subdocument; review privacy/CAS/contention |
| sitterrankmodelreviews | Matching and routing | Giữ; chưa có căn cứ gộp/xóa |
| sitterstatuses | Application/employment intake | User subdocument; review privacy/CAS/contention |
| suppliers | Commerce | Giữ; chưa có căn cứ gộp/xóa |
| systemsettingversions | Catalog and policies | Typed version store; giữ effective/version unique |
| taxassessments | Booking/care/receipts | Giữ; chưa có căn cứ gộp/xóa |
| useradminaudits | Identity/contact | Typed event store; giữ IDs/refs/quyền |
| users | Identity/contact | Giữ; chưa có căn cứ gộp/xóa |
| visits | Booking/care/receipts | Giữ; chưa có căn cứ gộp/xóa |
| weeklybookingcounters | Legacy earning/settlement | Retirement sau khi tháo đủ phụ thuộc |
