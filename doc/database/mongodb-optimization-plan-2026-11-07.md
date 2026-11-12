# Kế hoạch tinh gọn MongoDB và tối ưu API — 07/11/2026

## Mục tiêu và thứ tự thực hiện

Giảm dữ liệu lặp, dữ liệu tạm tồn đọng, index không phục vụ truy vấn và chi phí đọc/ghi; giảm số collection khi có cùng vòng đời, quyền và ràng buộc. Không đặt số collection đích tùy ý hoặc tuyên bố hiệu suất cao nhất khi chưa đo workload. Duy trì API, phân quyền, hợp đồng đã ký, tài chính, idempotency và lịch sử cần đối soát.

Hai skill MongoDB chính chủ đã được cài ở phạm vi project (ngoài Git). Skill Paw World Care cục bộ đã bổ sung yêu cầu đọc cả schema-design và query-optimizer khi làm việc liên quan database. Production là MongoDB tự quản trên EC2; audit dùng native driver qua SSH, không giả định Atlas/MCP đã kết nối.

## Baseline trực tiếp

Audit read-only lúc 2026-11-07T13:54:06.123Z, chạy trên container đang phục vụ main `f6a6dca4eb243addc212b8c7fb0e256f93a7a578`. PR #199 đã merged, review độc lập và application CI success được đọc lại. Container running, restart 0, OOM false; readiness metadata PASS. Đây là baseline tại thời điểm kiểm tra, không phải trạng thái vĩnh viễn.

| Chỉ số | Đo được |
| --- | ---: |
| Collection | 103 |
| Model được runtime đăng ký | 93 |
| Collection không có model nhưng có consumer raw trong source | 10 |
| Collection rỗng | 45 |
| Document | 1.095 |
| BSON logical bytes (`collStats.size`) | 1.269.119 |
| Index bytes | 5.906.432 |
| Index | 264 |
| Collection có validator MongoDB | 0 |

Dung lượng trên không bao gồm oplog, filesystem, journal, container, R2 hay bộ nhớ toàn tiến trình. Đọc lần lượt collection không tạo snapshot nhất quán xuyên collection trong lúc ứng dụng ghi.

Đã quét toàn bộ document hiện có bằng aggregation giới hạn 5 giây/mỗi phép: thống kê kiểu field cấp cao nhất, kích thước BSON, độ dài array; kiểm tra null/missing của required field cấp cao nhất mà Mongoose khai báo required tĩnh. Không thấy thiếu required hoặc sai kiểu cấp cao nhất trong phạm vi này. Đây chưa phải kiểm tra custom validator, nested schema, quan hệ tham chiếu hoặc toàn bộ nghiệp vụ. Không log nội dung, ID, liên hệ, OTP, hợp đồng hoặc credential.

Lần kiểm kê đầu không có quyền `serverStatus` và `$indexStats` (code 13); các phép đọc collection/index/schema thành công. Không suy ra index không dùng khi thiếu số liệu này và không tự tăng quyền tài khoản ứng dụng. Lần quét chất lượng tiếp theo không gọi hai phép này, không có lỗi.

## Những nguyên nhân và ứng viên đã xác minh

1. `deployment-storage.service.js` tạo collection/index cho mọi model đã đăng ký. `settlements/source-provisioning.js` tạo thêm các nguồn tài chính raw. Điều này giải thích nhiều collection rỗng; xóa chúng hiện tại sẽ bị provision lại hoặc làm hỏng gate triển khai. Muốn giảm phải có manifest ownership/feature và readiness tương ứng trước.
2. Mười collection ngoài model đều có consumer trong source; không có bằng chứng chúng là collection mồ côi. Audit contact và provisioning marker giữ vai trò truy vết/idempotency. Không xóa marker để rồi seed lại dữ liệu hoặc ghi đè chỉnh sửa Admin.
3. Ba nhóm dung lượng lớn hiện là `aisitterprofiles` 290.853 bytes, `profileavatars` 220.597 bytes, `aipricingpolicies` 217.345 bytes. Cần phân biệt snapshot/version hợp lệ với dữ liệu trùng; chưa chứng minh nên gộp toàn bộ profile/giá. Giá và AI tiếp tục độc lập theo kiến trúc.
4. Manifest `demopopulationruns` có array 421 phần tử; phải đối chiếu nguồn và tham chiếu trước khi archive. Không coi manifest là 421 bản ghi nghiệp vụ được phép xóa.
5. `sitterapplicationdownloadquotas` dùng bucket theo giờ nhưng chưa có TTL. Đây là ứng viên retention riêng, khác `applicantdocumentquotas`/`privateimagequotas` là bộ đếm sở hữu hiện tại: TTL bộ đếm sở hữu sẽ làm sai giới hạn upload. Không dùng chung chính sách cho tất cả quota.
6. Sáu collection hiện có TTL gồm aidecisions, airoutingmatrixes, authsessions, employeevisittravels, otpchallenges, otpthrottles. Không xóa TTL/index unique khi gộp cấu trúc. Không gộp cache vào audit/financial state.

## Query plan và giới hạn bằng chứng

- Tra hồ sơ `{state}` với sort `createdAt DESC, _id DESC`: IXSCAN trên index hiện hữu, không blocking SORT.
- Danh sách thông báo theo recipient với cùng sort: IXSCAN trên index hiện hữu, không blocking SORT. Dùng recipient tổng hợp, không truy xuất liên hệ thật.
- Mail worker đúng filter `deliveryState=PENDING, nextAttemptAt<=now`, sort `createdAt ASC, _id ASC`: IXSCAN trên `deliveryState_1_nextAttemptAt_1` nhưng có SORT. Đối chiếu với `applications/application-mail.service.js`.
- Các plan trả 0 dòng tại thời điểm đọc nên không chứng minh latency/cardinality khi có tải. Một phép thử ban đầu dùng nhầm field `state` của mail đã bị loại khỏi kết luận; mail dùng `deliveryState`.

Không thêm hàng loạt index theo field hoặc xóa index chỉ vì collection đang rỗng. So sánh index hỗ trợ mail worker bằng fixture lớn có backlog/future/lease và cost ghi trước khi chọn. Giữ semantics FIFO, retry, UNKNOWN và idempotency.

## Kế hoạch thay đổi theo đợt

| Đợt | Công việc cụ thể | Gate hoàn thành |
| --- | --- | --- |
| A — Đo và phân loại | Inventory 103 collection; ownership model/raw; field/type/size/index; map toàn bộ API/job/provisioning; audit nested/ref và dữ liệu demo | Báo cáo từng lỗi bằng số lượng, không xuất dữ liệu cá nhân; phân biệt source cũ và source đang chạy |
| B — Tối ưu đọc/ghi | Benchmark truy vấn danh sách, mail, dispatch, payroll, settlement trên fixture 1k/10k/100k; phát hiện N+1, unbounded reads, sort, offset sâu; projection/pagination/index theo kết quả | So sánh p50/p95, docs/keys examined, query count, RSS và throughput cùng cấu hình; không suy diễn synthetic thành tải production |
| C — Giảm dữ liệu tạm | Thiết kế retention quota theo giờ/cache, archive marker/demo đủ điều kiện; không TTL ownership counter/audit/financial evidence | Dry-run số lượng theo nhãn/tuổi/tham chiếu; thời gian retention rõ ràng; backup/restore; xác nhận trước thao tác xóa thật |
| D — Tinh gọn collection | Manifest domain/feature; cân nhắc gộp transient state cùng vòng đời và index, embed quan hệ bounded chỉ đọc cùng nhau; giữ audit/ledger/outbox/command cần độc lập | Thiết kế hiện tại/đích từng collection, kích thước document/array bounded, quyền truy cập, uniqueness và transaction invariants; lợi ích benchmark vượt chi phí |
| E — API và migration | Repository/service adapter tương thích, dual-read hoặc migration theo batch có checkpoint; cập nhật tất cả API/job/provisioner/test | Idempotent, resume, dry-run, đối chiếu count/hash/ref; không đổi physical legacy name chỉ từ rename model |
| F — Phát hành | PR develop, review độc lập, CI, release PR main; backup và restore thử trước rollout blue/green | Readiness, API auth/error/status, 4 bước ứng tuyển, in/ký hợp đồng, mail, booking/dispatch/finance kiểm tra lại; giữ release cũ và dữ liệu cũ trong cửa sổ rollback |

Đợt A đã có inventory và kiểm tra cấp cao nhất. Mapping toàn bộ consumer, quan hệ nested/ref và benchmark tải vẫn cần thực hiện; chưa gọi toàn bộ đợt A hoặc toàn bộ tối ưu là hoàn thành. Chưa thay schema/API, chưa xóa/gộp dữ liệu và chưa deploy thay đổi database trong đợt này.

## Quy trình migration và rollback bắt buộc

Mỗi migration phải mô tả collection nguồn/đích, điều kiện chọn, trường được phép sửa và invariants. Mặc định dry-run; apply phải tường minh. Batch bounded, không tải cả collection vào RAM, kiểm tra version khi concurrent write, checkpoint và chạy lại không nhân đôi. Backup nằm ngoài release, restore vào Mongo cô lập rồi kiểm tra. Giữ nguồn cũ đến hết cửa sổ rollback; rollback code phải hiểu dữ liệu đã ghi mới hoặc có reverse migration được thử. Không đánh dấu thành công nếu còn consumer cũ, index conflict, dangling reference hay khác biệt API.

## Inventory từng collection

### Đợt triển khai đầu: catalog đọc theo lô

`service-catalog.service.js::publicList` đang gọi policy và giá từng dịch vụ;
provider giá còn kiểm tra tồn tại service từng lần. Với N dịch vụ, nhánh runtime
có khoảng `4 + 3N` database commands. Đích là một aggregate policy theo tập ID
và dùng port `getActivePrices` sẵn có: 5 commands cho runtime đã nhúng presentation
(6 khi còn cần fallback legacy).
Giữ fallback cho provider cũ chỉ có `getActivePrice`. Chọn phiên bản effective
trước khi xét ACTIVE/PUBLISHED để không làm sống lại bản cũ đã ngừng/rút.
Giữ API, DTO, sort tiếng Việt, auth/status và deterministic price validation.
Phần batching không đổi unique/index hay dữ liệu; phần nhúng bên dưới có migration
riêng. Rollback dùng release cũ khi còn giữ legacy. Đo query count và latency
trên cùng fixture, kiểm thử withdrawal/future versions cùng suite catalog/price.

### Cấu trúc đích và migration đã chuẩn bị

Đợt 1 chuyển quan hệ 1:1 `servicepresentations` thành `services.presentation`:
metadata bounded, không có API độc lập, reader catalog/checkout và hai provisioner
là các consumer tìm thấy bằng full-source search. Đích bỏ 1 collection và 2 index
sau cutover; không gộp vào `serviceversions` vì metadata hiện không versioned.
Migration phải đo kích thước nested arrays, kiểm tra orphan/duplicate serviceId,
copy có version/hash guard, cập nhật cả raw checkout reader và provisioners,
giữ dual-read/dual-write trong cửa sổ rollback rồi mới xem xét bỏ nguồn cũ.
Code nhúng, fallback và provisioning tương thích đã được chuẩn bị trong nhánh
feature; production chưa đổi. Arrays nhúng giới hạn 50 phần tử mỗi field,
migration không thêm default/coerce metadata cũ. Runtime không đăng ký legacy
model nữa nên provisioning mới không tạo lại collection sau cleanup. Legacy
factory còn lại chỉ dành explicit tooling/compatibility. Catalog đọc theo lô;
checkout và availability đọc embedded trước rồi fallback theo cùng transaction.
Provisioner giữ nội dung hiện có, chỉ fill metadata thiếu thuộc đúng run cũ,
và mirror legacy khi collection đó còn tồn tại. Không dùng kế hoạch làm consent xóa.

Migration `backend/scripts/database/migrate-service-presentations.js` mặc định
dry-run; apply cần xác nhận database và digest mới nhất. Per-document transaction,
kiểm tra source signature/parent và không ghi đè target khác; cuối lượt đối chiếu
digest/count/identical. Giới hạn 1.000 source, batch 100, 10 giây query nguồn,
target tối đa 256 KiB; vượt budget phải xử lý riêng, không cắt nội dung. Giữ
deployment lock và đóng provisioning trong suốt copy/verify; snapshot transaction
không tự khóa nguồn khỏi một writer cũ. Source và index legacy giữ nguyên để
rollback code. Trước apply: reviewed main, backup mới, restore cô lập thành công.
Sau apply: dry-run phải copy 0, identical bằng source, conflict/orphan/invalid 0;
catalog/checkout/auth/errors giữ hành vi. Chỉ cleanup `servicepresentations`
sau cửa sổ rollback và xác nhận riêng, với backup/recovery của collection đó.

Owner đã chọn giữ bộ đếm xem tài liệu **24 giờ sau giờ thực thi**. Index đích:
`sitterapplicationdownloadquotas.createIndex({windowStart:1}, {expireAfterSeconds:90000})`.
Unique `{actorId,windowStart}` giữ nguyên; limiter vẫn tự kiểm tra count theo giờ,
không phụ thuộc tốc độ TTL monitor. Không thêm expiresAt/backfill. Dry-run quota
lúc 14:30 UTC có 7 document, cả 7 đã quá 25 giờ. Tạo index sẽ tự xóa chúng qua
TTL monitor nên phải xác nhận thao tác cụ thể trước rollout; audit/ownership
quota không có thay đổi retention. Nếu cần dừng cleanup thì bỏ riêng TTL index;
khôi phục counter đã hết hạn chỉ từ backup, không thể undo TTL bằng rollback code.

Sau copy, collection count vẫn 103 vì legacy giữ cho rollback. Sau cleanup được
duyệt mới là 102 collection; index tổng dự kiến 263 (=264 +1 TTL -2 legacy).
Không tuyên bố đã giảm các số này trên production. Logical BSON của 15 metadata
và parent trước copy là 13.796 bytes; biểu diễn nhúng dự kiến 13.406 bytes:
giảm 390 bytes sau cleanup, không phải mức tiết kiệm bộ nhớ/toàn filesystem.
Trong cửa sổ rollback, copy làm tăng footprint tạm thời. Lợi ích chính là một
read ít hơn cho catalog và bỏ quan hệ 1:1 cùng hai index sau cleanup.

Các profile ứng tuyển/public/AI có quyền, moderation và vòng đời khác nhau;
không gộp chúng vào một hồ sơ công khai. Avatar/photo blob vẫn tách để list không
tải binary. Availability revisions, giá và chính sách immutable vẫn là lịch sử,
không phải bản trùng chỉ vì cùng sitter/service. Command replay và audit có thể
được đánh giá theo từng domain nhưng không được TTL/gộp tùy tiện vì uniqueness,
transaction và thời gian retry khác nhau. Hai counter sản phẩm/hợp đồng đều nhỏ;
chưa có lợi ích đủ lớn để đánh đổi coupling và migration sequence.

Audit mới lúc 2026-11-07T14:13:49Z xác nhận 103 collection/1.095 document,
0 lỗi trong các phép aggregate cũ. VPS main `f6a6dca`, ready/running,
restart 0/OOM false, env hash khớp; main/develop application CI success.
Đây chưa phải full nested/ref audit hoặc bằng chứng index usage.

Audit bổ sung dùng `scripts/database/audit-layout.js`: 83 scalar unique-key
constraints kiểm tra không có duplicate group; 12 foreign-key relationships
đã khai báo kiểm tra không có missing target; 0 lỗi. Không suy diễn thành tất cả
nested/custom/reference/business invariants đều đúng. Xem [bản đồ ownership 103
collection](mongodb-collection-ownership-2026-11-07.md) cho model/raw owner và
static composition route/job/script. Đây không phải thống kê tần suất query.

### Benchmark và lựa chọn index

Mail benchmark MongoDB 8.0.34, 40 warmed sequential reads mỗi case, 1k/10k/100k
rows, ba distribution. Ở 100k, index hiện tại vs partial FIFO:

| Distribution | p95 hiện tại / FIFO (ms) | Keys examined hiện tại / FIFO | Index bytes hiện tại / FIFO |
| --- | ---: | ---: | ---: |
| Tất cả pending/due | 135,96 / 0,52 | 100.000 / 1 | 1.757.184 / 4.255.744 |
| 90% dòng cũ chưa đến retry | 15,17 / 128,88 | 10.000 / 90.001 | 1.757.184 / 4.255.744 |
| 99% accepted | 2,75 / 0,43 | 1.000 / 1 | 1.753.088 / 1.327.104 |

Không thay/hint FIFO vì có regression lớn khi future retry chiếm đa số và tăng
footprint backlog. Không xóa index hiện tại khi không có usage history.
Insert timings/RSS/query plans được giữ trong local JSON; chúng không chứng minh
write capacity hay Mongo memory production. Index bytes được đọc sau fsync để
tránh số một trang rỗng trước WiredTiger checkpoint. Đây là synthetic, không gửi
SMTP hoặc dùng contact thật.

Catalog benchmark dùng cùng fixture 13 dịch vụ, so sánh source develop 5381c62
với code mới, 40 samples/5 warmup, cùng `at` và DTO deep-equal. Đếm commandStarted
find/aggregate/getMore: domain service 42 -> 4 commands; HTTP runtime thêm một
visibility query chung: 43 -> 5. Số latency chi tiết trong bằng chứng test đợt 1.
Fallback legacy vẫn hoạt động trước copy; provider chỉ có getActivePrice vẫn
được hỗ trợ. Chưa có benchmark toàn bộ dispatch/payroll/settlement hoặc tải thật.

Counts/bytes chỉ là aggregate của lần kiểm tra. Cột consumer không có nghĩa dữ liệu được phép bỏ.

| Collection | Documents | Logical bytes | Indexes | Model / raw consumer |
| --- | ---: | ---: | ---: | --- |
| `account_contact_audit_events` | 2 | 850 | 1 | contact-change-audit.service.js |
| `aibreeds` | 24 | 5706 | 2 | PetBreed |
| `aidecisions` | 0 | 0 | 4 | DecisionSnapshot |
| `aipricingpolicies` | 40 | 217345 | 3 | PricingPolicy |
| `airankingpolicies` | 1 | 405 | 3 | SitterRankingPolicy |
| `airankmodels` | 0 | 0 | 2 | SitterRankModel |
| `airoutingmatrixes` | 0 | 0 | 3 | RoutingMatrixCache |
| `aischeduleblocks` | 0 | 0 | 2 | SitterScheduleBlock |
| `aisitterprofiles` | 42 | 290853 | 3 | SitterMatchingProfile |
| `aitraits` | 15 | 3930 | 2 | PetTrait |
| `aivisitoutcomes` | 0 | 0 | 3 | SitterVisitOutcome |
| `applicantdocumentquotas` | 7 | 294 | 1 | ApplicantDocumentQuota |
| `applicantdocuments` | 20 | 9480 | 1 | ApplicantDocument |
| `application_mails` | 23 | 9805 | 3 | ApplicationMail |
| `authsessions` | 13 | 4591 | 4 | AuthSession |
| `bookingearningsnapshots` | 0 | 0 | 4 | BookingEarningSnapshot |
| `bookings` | 6 | 31047 | 2 | settlements/source-provisioning.js (raw finance source) |
| `caremediabindings` | 0 | 0 | 2 | CareMediaBinding |
| `cases` | 0 | 0 | 1 | settlements/source-provisioning.js (raw finance source) |
| `catalogprovisioningruns` | 4 | 2456 | 2 | catalog provisioning services |
| `completedbookingordinals` | 0 | 0 | 3 | CompletedBookingOrdinal |
| `contacts` | 15 | 4713 | 3 | Contact |
| `customeraddresses` | 31 | 14238 | 4 | CustomerAddress |
| `customerreviewcommands` | 0 | 0 | 1 | CustomerReviewCommand |
| `demopopulationruns` | 1 | 25813 | 1 | hanoi-demo-population.service.js |
| `earningaccrualoutboxes` | 0 | 0 | 3 | EarningAccrualOutbox |
| `earningaccrualtasks` | 0 | 0 | 2 | EarningAccrualTask |
| `earningadjustments` | 0 | 0 | 4 | EarningAdjustment |
| `earningledgerentries` | 0 | 0 | 4 | EarningLedgerEntry |
| `earnings` | 0 | 0 | 6 | Earning |
| `employeeavailabilities` | 44 | 24660 | 1 | EmployeeAvailability |
| `employeeavailabilityrevisions` | 47 | 21353 | 2 | EmployeeAvailabilityRevision |
| `employeeschedulecommands` | 8 | 4511 | 1 | EmployeeScheduleCommand |
| `employeescheduleevents` | 14 | 3061 | 1 | EmployeeScheduleEvent |
| `employeescheduleproposals` | 0 | 0 | 2 | EmployeeScheduleProposal |
| `employeevisitoffers` | 0 | 0 | 3 | EmployeeVisitOffer |
| `employeevisittravels` | 0 | 0 | 2 | EmployeeVisitTravel |
| `employmentcontracts` | 45 | 19597 | 3 | EmploymentContract |
| `employmentdocumentcommands` | 14 | 2590 | 1 | EmploymentDocumentCommand |
| `employmentdocumentcounters` | 1 | 36 | 1 | EmploymentDocumentCounter |
| `employmentdocuments` | 6 | 28822 | 3 | EmploymentDocument |
| `financesourcecommands` | 13 | 2911 | 1 | FinanceSourceCommand |
| `financesourceevents` | 7 | 1464 | 1 | FinanceSourceEvent |
| `financiallocks` | 0 | 0 | 3 | FinancialLock |
| `notificationevents` | 0 | 0 | 1 | NotificationEvent |
| `notifications` | 39 | 19863 | 2 | Notification |
| `otpchallenges` | 0 | 0 | 4 | OtpChallenge |
| `otpthrottles` | 0 | 0 | 3 | OtpThrottle |
| `paymentintents` | 0 | 0 | 2 | settlements/source-provisioning.js (raw finance source) |
| `payments` | 1 | 357 | 4 | settlements/source-provisioning.js (raw finance source) |
| `payrolladjustments` | 0 | 0 | 4 | PayrollAdjustment |
| `payrollcommands` | 1 | 239 | 1 | PayrollCommand |
| `payrollevents` | 35 | 3832 | 1 | PayrollEvent |
| `payrollmonthguards` | 2 | 122 | 1 | PayrollMonthGuard |
| `payrollservicecredits` | 0 | 0 | 3 | PayrollServiceCredit |
| `payrollsourceclaims` | 0 | 0 | 1 | PayrollSourceClaim |
| `payrollstatements` | 0 | 0 | 5 | PayrollStatement |
| `petcarecommands` | 18 | 4644 | 1 | PetCareCommand |
| `pets` | 48 | 22390 | 3 | Pet |
| `privateimagequotas` | 0 | 0 | 1 | PrivateImageQuota |
| `privateimages` | 0 | 0 | 1 | PrivateImage |
| `productcarts` | 1 | 109 | 2 | ProductCart |
| `productcounters` | 2 | 134 | 1 | ProductCounter |
| `productcustomerrefusals` | 0 | 0 | 3 | ProductCustomerRefusal |
| `productorders` | 1 | 928 | 6 | ProductOrder |
| `productphotos` | 0 | 0 | 2 | ProductPhoto |
| `products` | 30 | 15181 | 3 | Product |
| `profileavatars` | 5 | 220597 | 1 | ProfileAvatar |
| `publicpolicyversions` | 2 | 5128 | 3 | PublicPolicyVersion |
| `refunds` | 0 | 0 | 1 | settlements/source-provisioning.js (raw finance source) |
| `reviews` | 0 | 0 | 2 | CustomerVisitReview |
| `salaryadvances` | 0 | 0 | 5 | SalaryAdvance |
| `serviceaudits` | 38 | 13638 | 2 | ServiceAudit |
| `servicepolicyversions` | 16 | 14322 | 4 | ServicePolicyVersion |
| `servicepresentations` | 15 | 12478 | 2 | ServicePresentation |
| `servicepriceaudits` | 16 | 5768 | 2 | ServicePriceAudit |
| `servicepriceversions` | 16 | 4687 | 4 | ServicePriceVersion |
| `services` | 15 | 1318 | 2 | Service |
| `serviceversions` | 22 | 12066 | 4 | ServiceVersion |
| `settlementcommands` | 0 | 0 | 3 | SettlementCommand |
| `settlementevents` | 0 | 0 | 3 | SettlementEvent |
| `settlementevidences` | 0 | 0 | 3 | SettlementEvidence |
| `settlementoutboxes` | 0 | 0 | 3 | SettlementOutbox |
| `settlementrequests` | 0 | 0 | 5 | SettlementRequest |
| `settlementtransferclaims` | 0 | 0 | 2 | SettlementTransferClaim |
| `settlementtransfers` | 0 | 0 | 4 | SettlementTransfer |
| `settlementweekclaims` | 0 | 0 | 3 | SettlementWeekClaim |
| `sitterapplicationaudits` | 86 | 33270 | 4 | SitterApplicationAudit |
| `sitterapplicationdownloadquotas` | 7 | 525 | 2 | SitterApplicationDownloadQuota |
| `sitterapplications` | 49 | 76750 | 9 | SitterApplication |
| `sitterpublicprofileaudits` | 2 | 414 | 2 | SitterPublicProfileAudit |
| `sitterpublicprofilecommands` | 2 | 805 | 2 | SitterPublicProfileCommand |
| `sitterpublicprofiles` | 43 | 19692 | 3 | SitterPublicProfile |
| `sitterrankmodelreviews` | 0 | 0 | 2 | SitterRankModelReview |
| `sitterstatuses` | 46 | 7776 | 2 | SitterStatus |
| `suppliers` | 1 | 260 | 3 | Supplier |
| `systemsettingaudits` | 1 | 359 | 2 | SystemSettingAudit |
| `systemsettingversions` | 1 | 265 | 4 | SystemSettingVersion |
| `taxassessments` | 0 | 0 | 2 | settlements/source-provisioning.js (raw finance source) |
| `useradminaudits` | 8 | 1639 | 2 | UserAdminAudit |
| `users` | 77 | 25455 | 2 | User |
| `visits` | 6 | 13577 | 4 | settlements/source-provisioning.js (raw finance source) |
| `weeklybookingcounters` | 0 | 0 | 2 | WeeklyBookingCounter |

## Nguồn quy trình

- [MongoDB Agent Skills chính chủ](https://github.com/mongodb/agent-skills).
- [MongoDB MCP Server chính chủ](https://github.com/mongodb-js/mongodb-mcp-server): công cụ bổ trợ; chưa cấu hình MCP mới trong đợt này.
- [Package architecture](../source-code-management/package-architecture.md), [MongoDB access](../deployment/mongodb-access.md) và [EC2 environment](../deployment/ec2-environment-guide.md).
