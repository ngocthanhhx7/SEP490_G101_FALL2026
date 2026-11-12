# EMPLOYEE storage profile và commission holds

Scope phases1/2, source baseline639e2a5/runtime0d2169a/data600docs.
User đã duyệt thực hiện4phase và giữ hoa hồng booking bị complaint cho đến Admin
kết luận; base/allowance unchanged. Phase4 reference_catalog delegated through user;
Phase3 phải đối chiếu actualsourcequeries vàbenchmark trước indexbuild.

## Ownership đích

COMPENSATION_PROFILE=EMPLOYEE mặc định theo nghiệp vụ employee đã duyệt.
Explicit LEGACY_PARTNER giữ các API/storage legacy cho isolated compatibility.
Cùng resolver dùng trong app/runtime/provision/assertions. Runtime Mongo connection
luôn autoCreate:false/autoIndex:false; explicit provisioning tạo đúng models của profile.
EMPLOYEE không đăng ký16legacyearning/settlementmodels. LegacyURLs vẫn kiểm tra
session/role/CSRF rồi trả410 với mã rõ ràng, không đọc legacycollection hoặc tính số0giả.
Frontend deep-links legacy chuyển payrollcanonical sau authguard. Không coi modelnames
filter là profile: nếu EMPLOYEE còn registeredlegacymodel thì provisioning phải fail.

## Complaint authority

Employee hold dùng cases/refunds hiện có và booking CAS; thay thế legacyearninglock
port trong employeecomposition. Cùng PayrollMonthGuard employee:<id> serialize với
prepare/approve/payment, creditcompletion. Không tạo holdcollection. Sources dùng
ObjectId booking/employee IDs, preservedcasefinancialHold+finaldecisionsemantics.

Payroll preview/prepare loại heldcredits khỏi commissionbasis, không xóa credit;
base/allowance/KPIattendance contractkhôngđổi. Unclaimedeligiblecredit từ kỳ trước
được carry tới kỳ hiện tại; claim theo creditID vàtransactionngăn doublepay. Held
credits không claim nên có thể releasekỳsau. KPI dùng creditperiodhiệncó riêng.
Approve/payment recheck hold sau sharedguard; không rewrite approved/paid snapshot.
Nếu bảng APPROVED chưa chi cần lập lại, Admin dùng VOID_UNPAID với reason và explicit
confirmNoPayment; PAID bị chặn và đi adjustment. Đây là operatorattestation, không
phải chứng minh ngân hàng chưa chuyển. Sauvoidreleaseclaims vàrepreparebase/eligible
commission, không trừ lương tự động. Replay trước mọi source recheck để retrykhông
đổi kết quả lịch sử đã commit.

## Migration/cutover/rollback

Không đổi giá/tax/compensationpolicyamounts, không tạo collection mới. Fields snapshot
commission/held optionaladditive, không rewrite lịch sử. Currentpayrollstatements0
sau userauthorizeddemoreset; futurehistorymustremainvalid. Explicitprofileconfig
documentedplaceholder; .envproductionkhôngsửa vì defaultEMPLOYEE phù hợpnghiệpvụ.
Saucode review/CI/syntheticprofile/CAS/hold/retry/legacycompat, ordinarycode rollout.
Physicaldrop16stores separate preflight must requireall0docs andexpectedindex/validator
manifest,freezeallwriters+backup/restore before exactapproval. No drop instartup/provision.
Rollbackcode giữlegacyphysicalnames untildrop; afterdropmustrecreateexactmetadata
BEFOREoldcoderesume, never restoreoldDB overnewwrites.

## Regression/acceptance

WholeappEMPLOYEE0legacyregistration/provision/query; explicitpartnerfull16; guest401,
wrongrole403,CSRF400/403 unchanged before retired410. Caseopen/hold/release/reopen
concurrentprepare/approve/payment;transactionretry/caps/safeinteger;heldcarrynextperiod,
voidunpaidattestation/PAIDimmutability and baseallowanceunchanged. No bank/provider
acceptance inferred from synthetic. Index changes require measuredquerymatching.

Production startup now checks registered collection and unique/TTL index metadata
before listening; it never provisions them. Missing storage returns
STORAGE_PROFILE_NOT_READY. Explicit development finance migration also follows
COMPENSATION_PROFILE; legacy migration refuses EMPLOYEE. Real refund adapter
remains unverified/unmounted: future writers must use the same employee/booking
hold guard; no provider acceptance or live refund flow is claimed here.
