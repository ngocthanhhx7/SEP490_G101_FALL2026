import json, pathlib, re
base=pathlib.Path('.tmp-unit-matrix')
group=json.loads((base/'controller-group.json').read_text())
proof=json.loads((base/'controller-workbook-verification.json').read_text())
codes=['EMP-CTL-01','GRM-CTL-01','GRM-CTL-02','GRM-CTL-03','GRM-CTL-04']
gids=[759450557,975803466,1996874669,557221262,130900030]
out=['# Controller unit tests — 18/11/2026','',
'Source baseline: `692c2521`, branch `feature/controller-unit-matrices`. Chỉ thêm 5 file test; không sửa production code, không commit/push/PR.',
'', '## Căn cứ và giới hạn', '',
'- SRS do người dùng cung cấp: `C:/Users/DTD/Desktop/DATN/PWC_Report-3.docx`, II.5.1 UC-31; II.14.1 UC-58; III.22.1; GBR-40/42/45. UC-31 xác định Staff/Admin và đọc planning board. UC-58 xác định Customer, chọn pet/service/slot, xem giá cuối trước khi đặt, không đặt cọc.',
'- HTTP signature/status/error mapping lấy từ `backend/src/controllers/employee-scheduling.controller.js`, `grooming-booking.controller.js`, `controller-action.js`, `utils/app-error.js`, `validators/pet-care.validator.js`; SRS không quy định status code hoặc DTO chi tiết.',
'- Đã đọc service contracts `employee-dispatch.service.js`, `grooming.service.js`, slots/pricing/booking services; routes và `middlewares/session.js`, `middlewares/http.js` để tách trách nhiệm.',
'- Không phát hiện mâu thuẫn SRS–controller trong phạm vi mapping đã kiểm tra. Không kết luận toàn bộ nghiệp vụ UC-31/58 đáp ứng SRS: authorization, capacity, pricing, idempotency persistence thuộc middleware/service và không được chạy ở đây.',
'- HTTP 200 của dispatchDetails là mặc định Express: unit chỉ xác minh `res.json`, không gọi `status`. Grooming kiểm tra trực tiếp `status(200/201)`. Lỗi reject/throw: controller không gửi HTTP error response và không gọi next; Express/error middleware xử lý ngoài unit scope.',
'- Service trả null/undefined, schema errors, raw duplicate errors là fault injection để xác minh controller boundary; không khẳng định Service thực tế trả các kết quả này. `undefined` được kiểm tra tại lời gọi json, không khẳng định JSON wire giữ trường undefined.',
'- BVA: ID 23/24/25 ký tự ở dispatchDetails; empty collection/zero quote và key missing/empty là edge cases của mapping. Không gán numeric business boundary cho grooming controller.',
'- Fixtures tổng hợp. Mỗi case tạo mới request, response và service mock; thời gian đóng băng `2026-11-18T10:00:00.000Z`, timers được phục hồi sau mỗi case. Không HTTP server, DB, provider hay logger thực. Controller không có log (xác nhận bằng source).',
'', '## Thực thi', '',
'Tại `backend`, đã chạy riêng từng file với:',
'```text',
'npm test -- --selectProjects unit --runTestsByPath tests/unit/<file>.test.js --json --outputFile=../.tmp-unit-matrix/<FunctionCode>.json',
'```',
'Sau đó chạy nhóm cả 5 đường dẫn bằng cùng lệnh, output `controller-group.json`: **5 suites / 75 tests Passed; 0 Failed; 0 Untested**. Đã chạy lại nhóm sau sửa lint.',
'`npm run lint`: Passed. `npm run check:architecture`: Passed. Ban đầu lint báo structuredClone chưa khai báo theo cấu hình ESLint; đã dùng globalThis.structuredClone, không đổi config. Đây là test implementation issue đã sửa, không phải production defect.',
'Integration/E2E: N/A theo phạm vi, không chạy. Backend build/typecheck: N/A, package không cấu hình script. Frontend checks: N/A vì không thay frontend. Không chạy toàn bộ backend suite ngoài nhóm liên quan.',
'', '## Workbook', '',
'Workbook `1PD80jpSwEwZgKE6Z3JoNPd3iQhwqnE3j` vẫn là XLSM, không chuyển đổi hoặc tạo sheet. GID đã đối chiếu bằng sheet đang mở trong in-app browser.',
'Chỉ sửa values tại 5 worksheet XML; mọi phần khác trong ZIP giữ nguyên bytes. Giữ nguyên 239 ô có font Bold mỗi sheet (kể cả ô trống), merged cells, row heights, column widths, formulas, validation, conditional formatting và styles. B34 đang có font Bold nên giữ trống; không điền nhãn bổ sung “Lỗi: không gửi response” ở đây, hành vi đó được kiểm tra trong Jest và mô tả trong report.',
'Template có 14 dòng Condition và 15 cột UTCID. Mỗi dòng mô tả một input; các biến thể cùng service input được đánh dấu trong các cột tương ứng. Fixture chi tiết và traceability bên dưới bổ sung cho nhãn ngắn trong template. Không thêm dòng/cột hoặc đổi kích thước để nhét nội dung dài.',
'Executed Date lưu dưới dạng Excel date, giữ format sẵn có `mm/dd`, hiển thị `11/18`. Line of code = 1 cho từng property handler; helper dùng chung được đọc và test xuyên qua, không cộng số dòng helper vào từng handler.',
'Bản XLSM nguồn không chứa VBA project (`vbaProject.bin`); không thể tuyên bố đã kiểm thử macro. Không sửa Defect_List/Defect ID.',
'', '## Traceability và test data', '',
'Mỗi section dưới đây là một matrix riêng. Mỗi UTCID trùng tên Jest và cột workbook. Expected chung khi thành công: trả đúng object `res`, gọi json đúng 1 lần với `{data: serviceResult, meta:{schemaVersion:1,serverNow:"2026-11-18T10:00:00.000Z",correlationId:req.requestId}}`; giữ identity data. Khi lỗi: Promise reject, không gọi response; giữ identity lỗi trừ 3 mapping của controllerAction.',
'Actor chung: `{userId:"staff-1",state:"ACTIVE",roles:["STAFF"]}` cho EMP; `{userId:"customer-1",state:"ACTIVE",roles:["CUSTOMER"]}` cho GRM. `requestId="controller-test"` trừ case ghi rõ thiếu. Dependency mock: duy nhất method service mục tiêu. Expected log = none, external side effect = none. Không truyền params/query/headers ngoài contract; getters ném lỗi nếu controller truy cập field không dùng.', '']
for code,gid in zip(codes,gids):
 suite=next(s for s in group['testResults'] if any(code in t['fullName'] for t in s['assertionResults']))
 file=pathlib.Path(suite['name']).name
 tests=suite['assertionResults']
 out += [f'### {code} — {proof[code]["sheet"]}', '',f'[Mở sheet](https://docs.google.com/spreadsheets/d/1PD80jpSwEwZgKE6Z3JoNPd3iQhwqnE3j/edit?gid={gid}#gid={gid})', '',f'File: `backend/tests/unit/{file}`. Kết quả: 15 Passed, 0 Failed, 0 Untested. N/A/B = '+ '/'.join(str(proof[code]['types'][k]) for k in 'NAB')+'.','']
 if code=='EMP-CTL-01':
  out += ['Input mặc định: `params.id="abcdef0123456789abcdef01"`. Service call = `dispatch.details(req.auth, req.params.id)` đúng 1 lần, không gọi nếu ID invalid. Kết quả mặc định: `{id:params.id,bookingId:"booking-1",petNames:["Milo"],dispatchState:"SYSTEM_SEARCHING"}` (fixture id giữ lowercase ở case uppercase). Không gọi res.status.','']
 else:
  d=json.loads((base/(code+'-design.json')).read_text())
  args='req.auth'+(', req.body' if d['method']!='options' else '')+(", req.get('Idempotency-Key')" if d['method']=='book' else '')
  out += [f'Expected Service Invocation: `service.{d["method"]}({args})`, đúng 1 lần. HTTP '+('201' if d['method']=='book' else '200')+'.', '']
  if d['method']!='options': out += ['Body mặc định:', '```json',json.dumps(d['body'],ensure_ascii=False,indent=2),'```','']
  if d['method']=='book': out += ['Header mặc định `booking-key-001`; req.get phải nhận đúng `Idempotency-Key` 1 lần. Missing/empty/whitespace đi nguyên vẹn sang mock, mock trả lỗi theo service contract; controller không tự validate/trim key.','']
  out += ['Service DTO mặc định:', '```json',json.dumps(d['data'],ensure_ascii=False,indent=2),'```','']
 out += ['| UTCID | Type | Jest test objective / condition | Actual Result |','| --- | --- | --- | --- |']
 for t in tests:
  m=re.match(r'(UTCID\d+) \[([NAB])\] - (.*)',t['title']);assert m
  out.append(f'| {m[1]} | {m[2]} | {m[3]} | Passed — assertions matched |')
 out += ['']
 if code!='EMP-CTL-01':
  out += ['Các overrides cụ thể; các trường không liệt kê giữ fixture mặc định. `error:[status,code,message]` tạo AppError với details `{reason:"synthetic"}`; `raw` là Error có message `private database detail`; `mapped` là AppError mong đợi với details `{}`. `noData` nghĩa undefined; `deferred` nghĩa Promise pending, chưa gửi response đến khi resolve; `syncResult` nghĩa service trả DTO đồng bộ.', '', '```json',json.dumps([{'UTCID':c[0],**c[3]} for c in d['cases']],ensure_ascii=False,indent=2),'```','']
 else:
  out += ['UTCID03–07: AppError `{status:422,code:"VALIDATION_FAILED",message:"Invalid identifier",details:{}}`. UTCID08: mock reject `{status:403,code:"FORBIDDEN",message:"Staff required",details:{visitId}}`. UTCID12: mock reject `{status:404,code:"RESOURCE_NOT_FOUND",message:"Dispatch visit unavailable",details:{visitId}}`. UTCID13 sync throw và UTCID14 Promise reject cùng Error("offline"). UTCID15 thiếu requestId → correlationId undefined. Các test lỗi đều xác minh json không được gọi.','']
out += ['## Defect report và workflow', '', '**No defects found** trong 75 controller cases đã chạy. Confirmed Defect: 0. Potential Defect: 0. Test Design/Implementation Issue còn mở: 0. Jest Environment Issue: 0. Không có Defect Note cần ghi hoặc xin phê duyệt.', '', 'GitHub Issue chưa được liên kết: gh CLI không có trong PATH và chưa xác minh identity cho GitHub mutation. Đã fetch, fast-forward develop từ d422ac5a lên 692c2521 và tạo nhánh riêng; giữ nguyên các thay đổi frontend/test cũ. Không commit, push, mở PR, approve hoặc merge.', '', 'Bằng chứng Jest JSON nằm tại `.tmp-unit-matrix/EMP-CTL-01.json`, `GRM-CTL-01.json` đến `GRM-CTL-04.json`, `controller-group.json`; kiểm tra workbook tại `controller-workbook-verification.json`. Đây là artifacts cục bộ, không đưa report SRS/workbook vào Git.', '']
p=pathlib.Path('doc/testing/controller-unit-matrices-2026-11-18.md');p.write_text('\n'.join(out),encoding='utf-8')
print(p)
