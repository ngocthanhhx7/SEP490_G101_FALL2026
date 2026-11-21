# Controller unit tests — 18/11/2026

Source baseline: `692c2521`, branch `feature/controller-unit-matrices`. Chỉ thêm 5 file test; không sửa production code, không commit/push/PR.

## Căn cứ và giới hạn

- SRS do người dùng cung cấp: `C:/Users/DTD/Desktop/DATN/PWC_Report-3.docx`, II.5.1 UC-31; II.14.1 UC-58; III.22.1; GBR-40/42/45. UC-31 xác định Staff/Admin và đọc planning board. UC-58 xác định Customer, chọn pet/service/slot, xem giá cuối trước khi đặt, không đặt cọc.
- HTTP signature/status/error mapping lấy từ `backend/src/controllers/employee-scheduling.controller.js`, `grooming-booking.controller.js`, `controller-action.js`, `utils/app-error.js`, `validators/pet-care.validator.js`; SRS không quy định status code hoặc DTO chi tiết.
- Đã đọc service contracts `employee-dispatch.service.js`, `grooming.service.js`, slots/pricing/booking services; routes và `middlewares/session.js`, `middlewares/http.js` để tách trách nhiệm.
- Không phát hiện mâu thuẫn SRS–controller trong phạm vi mapping đã kiểm tra. Không kết luận toàn bộ nghiệp vụ UC-31/58 đáp ứng SRS: authorization, capacity, pricing, idempotency persistence thuộc middleware/service và không được chạy ở đây.
- HTTP 200 của dispatchDetails là mặc định Express: unit chỉ xác minh `res.json`, không gọi `status`. Grooming kiểm tra trực tiếp `status(200/201)`. Lỗi reject/throw: controller không gửi HTTP error response và không gọi next; Express/error middleware xử lý ngoài unit scope.
- Service trả null/undefined, schema errors, raw duplicate errors là fault injection để xác minh controller boundary; không khẳng định Service thực tế trả các kết quả này. `undefined` được kiểm tra tại lời gọi json, không khẳng định JSON wire giữ trường undefined.
- BVA: ID 23/24/25 ký tự ở dispatchDetails; empty collection/zero quote và key missing/empty là edge cases của mapping. Không gán numeric business boundary cho grooming controller.
- Fixtures tổng hợp. Mỗi case tạo mới request, response và service mock; thời gian đóng băng `2026-11-18T10:00:00.000Z`, timers được phục hồi sau mỗi case. Không HTTP server, DB, provider hay logger thực. Controller không có log (xác nhận bằng source).

## Thực thi

Tại `backend`, đã chạy riêng từng file với:
```text
npm test -- --selectProjects unit --runTestsByPath tests/unit/<file>.test.js --json --outputFile=../.tmp-unit-matrix/<FunctionCode>.json
```
Sau đó chạy nhóm cả 5 đường dẫn bằng cùng lệnh, output `controller-group.json`: **5 suites / 75 tests Passed; 0 Failed; 0 Untested**. Đã chạy lại nhóm sau sửa lint.
`npm run lint`: Passed. `npm run check:architecture`: Passed. Ban đầu lint báo structuredClone chưa khai báo theo cấu hình ESLint; đã dùng globalThis.structuredClone, không đổi config. Đây là test implementation issue đã sửa, không phải production defect.
Integration/E2E: N/A theo phạm vi, không chạy. Backend build/typecheck: N/A, package không cấu hình script. Frontend checks: N/A vì không thay frontend. Không chạy toàn bộ backend suite ngoài nhóm liên quan.

## Workbook

Workbook `1PD80jpSwEwZgKE6Z3JoNPd3iQhwqnE3j` vẫn là XLSM, không chuyển đổi hoặc tạo sheet. GID đã đối chiếu bằng sheet đang mở trong in-app browser.
Chỉ sửa values tại 5 worksheet XML; mọi phần khác trong ZIP giữ nguyên bytes. Giữ nguyên 239 ô có font Bold mỗi sheet (kể cả ô trống), merged cells, row heights, column widths, formulas, validation, conditional formatting và styles. B34 đang có font Bold nên giữ trống; không điền nhãn bổ sung “Lỗi: không gửi response” ở đây, hành vi đó được kiểm tra trong Jest và mô tả trong report.
Template có 14 dòng Condition và 15 cột UTCID. Mỗi dòng mô tả một input; các biến thể cùng service input được đánh dấu trong các cột tương ứng. Fixture chi tiết và traceability bên dưới bổ sung cho nhãn ngắn trong template. Không thêm dòng/cột hoặc đổi kích thước để nhét nội dung dài.
Executed Date lưu dưới dạng Excel date, giữ format sẵn có `mm/dd`, hiển thị `11/18`. Line of code = 1 cho từng property handler; helper dùng chung được đọc và test xuyên qua, không cộng số dòng helper vào từng handler.
Bản XLSM nguồn không chứa VBA project (`vbaProject.bin`); không thể tuyên bố đã kiểm thử macro. Không sửa Defect_List/Defect ID.

## Traceability và test data

Mỗi section dưới đây là một matrix riêng. Mỗi UTCID trùng tên Jest và cột workbook. Expected chung khi thành công: trả đúng object `res`, gọi json đúng 1 lần với `{data: serviceResult, meta:{schemaVersion:1,serverNow:"2026-11-18T10:00:00.000Z",correlationId:req.requestId}}`; giữ identity data. Khi lỗi: Promise reject, không gọi response; giữ identity lỗi trừ 3 mapping của controllerAction.
Actor chung: `{userId:"staff-1",state:"ACTIVE",roles:["STAFF"]}` cho EMP; `{userId:"customer-1",state:"ACTIVE",roles:["CUSTOMER"]}` cho GRM. `requestId="controller-test"` trừ case ghi rõ thiếu. Dependency mock: duy nhất method service mục tiêu. Expected log = none, external side effect = none. Không truyền params/query/headers ngoài contract; getters ném lỗi nếu controller truy cập field không dùng.

### EMP-CTL-01 — EMP-CTL-01_dispatchDetails

[Mở sheet](https://docs.google.com/spreadsheets/d/1PD80jpSwEwZgKE6Z3JoNPd3iQhwqnE3j/edit?gid=759450557#gid=759450557)

File: `backend/tests/unit/employee-scheduling.dispatchDetails.test.js`. Kết quả: 15 Passed, 0 Failed, 0 Untested. N/A/B = 3/9/3.

Input mặc định: `params.id="abcdef0123456789abcdef01"`. Service call = `dispatch.details(req.auth, req.params.id)` đúng 1 lần, không gọi nếu ID invalid. Kết quả mặc định: `{id:params.id,bookingId:"booking-1",petNames:["Milo"],dispatchState:"SYSTEM_SEARCHING"}` (fixture id giữ lowercase ở case uppercase). Không gọi res.status.

| UTCID | Type | Jest test objective / condition | Actual Result |
| --- | --- | --- | --- |
| UTCID01 | N | maps actor and visit ID; preserves detail object | Passed — assertions matched |
| UTCID02 | B | accepts exactly 24 uppercase hex characters unchanged | Passed — assertions matched |
| UTCID03 | B | rejects 23-character ID before calling service | Passed — assertions matched |
| UTCID04 | B | rejects 25-character ID before calling service | Passed — assertions matched |
| UTCID05 | A | rejects non-hex ID before calling service | Passed — assertions matched |
| UTCID06 | A | rejects missing params.id before calling service | Passed — assertions matched |
| UTCID07 | A | rejects numeric ID before calling service | Passed — assertions matched |
| UTCID08 | A | passes missing auth to service and propagates forbidden error | Passed — assertions matched |
| UTCID09 | A | preserves null service result without inventing data | Passed — assertions matched |
| UTCID10 | A | preserves undefined service result at json boundary | Passed — assertions matched |
| UTCID11 | N | waits for pending service before sending response | Passed — assertions matched |
| UTCID12 | A | propagates not-found AppError with details by identity | Passed — assertions matched |
| UTCID13 | A | propagates synchronous service exception | Passed — assertions matched |
| UTCID14 | A | propagates rejected service Promise without responding | Passed — assertions matched |
| UTCID15 | N | does not fabricate missing correlation ID | Passed — assertions matched |

UTCID03–07: AppError `{status:422,code:"VALIDATION_FAILED",message:"Invalid identifier",details:{}}`. UTCID08: mock reject `{status:403,code:"FORBIDDEN",message:"Staff required",details:{visitId}}`. UTCID12: mock reject `{status:404,code:"RESOURCE_NOT_FOUND",message:"Dispatch visit unavailable",details:{visitId}}`. UTCID13 sync throw và UTCID14 Promise reject cùng Error("offline"). UTCID15 thiếu requestId → correlationId undefined. Các test lỗi đều xác minh json không được gọi.

### GRM-CTL-01 — GRM-CTL-01_options

[Mở sheet](https://docs.google.com/spreadsheets/d/1PD80jpSwEwZgKE6Z3JoNPd3iQhwqnE3j/edit?gid=975803466#gid=975803466)

File: `backend/tests/unit/grooming-booking.options.test.js`. Kết quả: 15 Passed, 0 Failed, 0 Untested. N/A/B = 4/10/1.

Expected Service Invocation: `service.options(req.auth)`, đúng 1 lần. HTTP 200.

Service DTO mặc định:
```json
{
  "shop": {
    "address": "Test shop",
    "hotline": null
  },
  "window": {
    "slotMinutes": 60,
    "firstDate": "2026-11-18",
    "lastDate": "2026-11-24",
    "minLeadMinutes": 60
  },
  "services": [],
  "questions": []
}
```

| UTCID | Type | Jest test objective / condition | Actual Result |
| --- | --- | --- | --- |
| UTCID01 | N | maps request and preserves service DTO | Passed — assertions matched |
| UTCID02 | B | preserves empty result collection or zero quote unchanged | Passed — assertions matched |
| UTCID03 | A | preserves null service result | Passed — assertions matched |
| UTCID04 | A | preserves undefined service result at json boundary | Passed — assertions matched |
| UTCID05 | A | passes missing auth and propagates service forbidden error | Passed — assertions matched |
| UTCID06 | A | passes null auth to service without defaulting | Passed — assertions matched |
| UTCID07 | A | propagates synchronous service Error unchanged | Passed — assertions matched |
| UTCID08 | A | propagates rejected service Promise unchanged | Passed — assertions matched |
| UTCID09 | A | maps duplicate key to 409 VERSION_CONFLICT | Passed — assertions matched |
| UTCID10 | A | maps ValidationError to 422 VALIDATION_FAILED | Passed — assertions matched |
| UTCID11 | A | maps StrictModeError to 422 VALIDATION_FAILED | Passed — assertions matched |
| UTCID12 | N | waits for service before sending HTTP response | Passed — assertions matched |
| UTCID13 | N | does not fabricate missing correlation ID | Passed — assertions matched |
| UTCID14 | N | preserves synchronously returned service DTO | Passed — assertions matched |
| UTCID15 | A | preserves domain error status code message and details | Passed — assertions matched |

Các overrides cụ thể; các trường không liệt kê giữ fixture mặc định. `error:[status,code,message]` tạo AppError với details `{reason:"synthetic"}`; `raw` là Error có message `private database detail`; `mapped` là AppError mong đợi với details `{}`. `noData` nghĩa undefined; `deferred` nghĩa Promise pending, chưa gửi response đến khi resolve; `syncResult` nghĩa service trả DTO đồng bộ.

```json
[
  {
    "UTCID": "UTCID01"
  },
  {
    "UTCID": "UTCID02",
    "data": {
      "services": [],
      "questions": []
    }
  },
  {
    "UTCID": "UTCID03",
    "data": null
  },
  {
    "UTCID": "UTCID04",
    "noData": true
  },
  {
    "UTCID": "UTCID05",
    "noAuth": true,
    "error": [
      403,
      "FORBIDDEN",
      "Customer required"
    ]
  },
  {
    "UTCID": "UTCID06",
    "nullAuth": true,
    "error": [
      403,
      "FORBIDDEN",
      "Customer required"
    ]
  },
  {
    "UTCID": "UTCID07",
    "sync": true,
    "error": "offline"
  },
  {
    "UTCID": "UTCID08",
    "error": "offline"
  },
  {
    "UTCID": "UTCID09",
    "raw": {
      "code": 11000
    },
    "mapped": [
      409,
      "VERSION_CONFLICT",
      "Record already exists"
    ]
  },
  {
    "UTCID": "UTCID10",
    "raw": {
      "name": "ValidationError"
    },
    "mapped": [
      422,
      "VALIDATION_FAILED",
      "Data does not match the schema"
    ]
  },
  {
    "UTCID": "UTCID11",
    "raw": {
      "name": "StrictModeError"
    },
    "mapped": [
      422,
      "VALIDATION_FAILED",
      "Data does not match the schema"
    ]
  },
  {
    "UTCID": "UTCID12",
    "deferred": true
  },
  {
    "UTCID": "UTCID13",
    "noRequestId": true
  },
  {
    "UTCID": "UTCID14",
    "syncResult": true
  },
  {
    "UTCID": "UTCID15",
    "error": [
      404,
      "RESOURCE_NOT_FOUND",
      "Owned pet unavailable"
    ]
  }
]
```

### GRM-CTL-02 — GRM-CTL-02_slots

[Mở sheet](https://docs.google.com/spreadsheets/d/1PD80jpSwEwZgKE6Z3JoNPd3iQhwqnE3j/edit?gid=1996874669#gid=1996874669)

File: `backend/tests/unit/grooming-booking.slots.test.js`. Kết quả: 15 Passed, 0 Failed, 0 Untested. N/A/B = 4/10/1.

Expected Service Invocation: `service.slots(req.auth, req.body)`, đúng 1 lần. HTTP 200.

Body mặc định:
```json
{
  "pets": [
    {
      "petId": "abcdef0123456789abcdef01",
      "serviceIds": [
        "abcdef0123456789abcdef02"
      ]
    }
  ],
  "date": "2026-11-19"
}
```

Service DTO mặc định:
```json
{
  "date": "2026-11-19",
  "slots": [
    {
      "startAt": "2026-11-19T02:00:00.000Z",
      "time": "09:00",
      "state": "AVAILABLE"
    },
    {
      "startAt": "2026-11-19T03:00:00.000Z",
      "time": "10:00",
      "state": "FULL"
    }
  ]
}
```

| UTCID | Type | Jest test objective / condition | Actual Result |
| --- | --- | --- | --- |
| UTCID01 | N | maps request and preserves service DTO | Passed — assertions matched |
| UTCID02 | B | preserves empty result collection or zero quote unchanged | Passed — assertions matched |
| UTCID03 | A | preserves null service result | Passed — assertions matched |
| UTCID04 | A | preserves undefined service result at json boundary | Passed — assertions matched |
| UTCID05 | A | passes missing auth and propagates service forbidden error | Passed — assertions matched |
| UTCID06 | A | passes null body to service without defaulting | Passed — assertions matched |
| UTCID07 | A | propagates synchronous service Error unchanged | Passed — assertions matched |
| UTCID08 | A | propagates rejected service Promise unchanged | Passed — assertions matched |
| UTCID09 | A | maps duplicate key to 409 VERSION_CONFLICT | Passed — assertions matched |
| UTCID10 | A | maps ValidationError to 422 VALIDATION_FAILED | Passed — assertions matched |
| UTCID11 | A | maps StrictModeError to 422 VALIDATION_FAILED | Passed — assertions matched |
| UTCID12 | N | waits for service before sending HTTP response | Passed — assertions matched |
| UTCID13 | N | does not fabricate missing correlation ID | Passed — assertions matched |
| UTCID14 | N | preserves synchronously returned service DTO | Passed — assertions matched |
| UTCID15 | A | preserves domain error status code message and details | Passed — assertions matched |

Các overrides cụ thể; các trường không liệt kê giữ fixture mặc định. `error:[status,code,message]` tạo AppError với details `{reason:"synthetic"}`; `raw` là Error có message `private database detail`; `mapped` là AppError mong đợi với details `{}`. `noData` nghĩa undefined; `deferred` nghĩa Promise pending, chưa gửi response đến khi resolve; `syncResult` nghĩa service trả DTO đồng bộ.

```json
[
  {
    "UTCID": "UTCID01"
  },
  {
    "UTCID": "UTCID02",
    "data": {
      "date": "2026-11-19",
      "slots": []
    }
  },
  {
    "UTCID": "UTCID03",
    "data": null
  },
  {
    "UTCID": "UTCID04",
    "noData": true
  },
  {
    "UTCID": "UTCID05",
    "noAuth": true,
    "error": [
      403,
      "FORBIDDEN",
      "Customer required"
    ]
  },
  {
    "UTCID": "UTCID06",
    "nullBody": true,
    "error": [
      422,
      "VALIDATION_FAILED",
      "Invalid fields"
    ]
  },
  {
    "UTCID": "UTCID07",
    "sync": true,
    "error": "offline"
  },
  {
    "UTCID": "UTCID08",
    "error": "offline"
  },
  {
    "UTCID": "UTCID09",
    "raw": {
      "code": 11000
    },
    "mapped": [
      409,
      "VERSION_CONFLICT",
      "Record already exists"
    ]
  },
  {
    "UTCID": "UTCID10",
    "raw": {
      "name": "ValidationError"
    },
    "mapped": [
      422,
      "VALIDATION_FAILED",
      "Data does not match the schema"
    ]
  },
  {
    "UTCID": "UTCID11",
    "raw": {
      "name": "StrictModeError"
    },
    "mapped": [
      422,
      "VALIDATION_FAILED",
      "Data does not match the schema"
    ]
  },
  {
    "UTCID": "UTCID12",
    "deferred": true
  },
  {
    "UTCID": "UTCID13",
    "noRequestId": true
  },
  {
    "UTCID": "UTCID14",
    "syncResult": true
  },
  {
    "UTCID": "UTCID15",
    "error": [
      404,
      "RESOURCE_NOT_FOUND",
      "Owned pet unavailable"
    ]
  }
]
```

### GRM-CTL-03 — GRM-CTL-03_quote

[Mở sheet](https://docs.google.com/spreadsheets/d/1PD80jpSwEwZgKE6Z3JoNPd3iQhwqnE3j/edit?gid=557221262#gid=557221262)

File: `backend/tests/unit/grooming-booking.quote.test.js`. Kết quả: 15 Passed, 0 Failed, 0 Untested. N/A/B = 4/10/1.

Expected Service Invocation: `service.quote(req.auth, req.body)`, đúng 1 lần. HTTP 200.

Body mặc định:
```json
{
  "pets": [
    {
      "petId": "abcdef0123456789abcdef01",
      "serviceIds": [
        "abcdef0123456789abcdef02"
      ],
      "answers": {
        "biteOrScratch": "NO",
        "skinCondition": "NO"
      }
    }
  ]
}
```

Service DTO mặc định:
```json
{
  "currency": "VND",
  "pets": [
    {
      "petId": "abcdef0123456789abcdef01",
      "name": "Milo",
      "priceVnd": 100000,
      "lines": []
    }
  ],
  "subtotalVnd": 100000,
  "tier": {
    "code": null,
    "discountBps": 0,
    "discountVnd": 0,
    "applied": false,
    "blockedReason": null
  },
  "totalVnd": 100000
}
```

| UTCID | Type | Jest test objective / condition | Actual Result |
| --- | --- | --- | --- |
| UTCID01 | N | maps request and preserves service DTO | Passed — assertions matched |
| UTCID02 | B | preserves empty result collection or zero quote unchanged | Passed — assertions matched |
| UTCID03 | A | preserves null service result | Passed — assertions matched |
| UTCID04 | A | preserves undefined service result at json boundary | Passed — assertions matched |
| UTCID05 | A | passes missing auth and propagates service forbidden error | Passed — assertions matched |
| UTCID06 | A | passes null body to service without defaulting | Passed — assertions matched |
| UTCID07 | A | propagates synchronous service Error unchanged | Passed — assertions matched |
| UTCID08 | A | propagates rejected service Promise unchanged | Passed — assertions matched |
| UTCID09 | A | maps duplicate key to 409 VERSION_CONFLICT | Passed — assertions matched |
| UTCID10 | A | maps ValidationError to 422 VALIDATION_FAILED | Passed — assertions matched |
| UTCID11 | A | maps StrictModeError to 422 VALIDATION_FAILED | Passed — assertions matched |
| UTCID12 | N | waits for service before sending HTTP response | Passed — assertions matched |
| UTCID13 | N | does not fabricate missing correlation ID | Passed — assertions matched |
| UTCID14 | N | preserves synchronously returned service DTO | Passed — assertions matched |
| UTCID15 | A | preserves domain error status code message and details | Passed — assertions matched |

Các overrides cụ thể; các trường không liệt kê giữ fixture mặc định. `error:[status,code,message]` tạo AppError với details `{reason:"synthetic"}`; `raw` là Error có message `private database detail`; `mapped` là AppError mong đợi với details `{}`. `noData` nghĩa undefined; `deferred` nghĩa Promise pending, chưa gửi response đến khi resolve; `syncResult` nghĩa service trả DTO đồng bộ.

```json
[
  {
    "UTCID": "UTCID01"
  },
  {
    "UTCID": "UTCID02",
    "data": {
      "currency": "VND",
      "pets": [],
      "subtotalVnd": 0,
      "totalVnd": 0
    }
  },
  {
    "UTCID": "UTCID03",
    "data": null
  },
  {
    "UTCID": "UTCID04",
    "noData": true
  },
  {
    "UTCID": "UTCID05",
    "noAuth": true,
    "error": [
      403,
      "FORBIDDEN",
      "Customer required"
    ]
  },
  {
    "UTCID": "UTCID06",
    "nullBody": true,
    "error": [
      422,
      "VALIDATION_FAILED",
      "Invalid fields"
    ]
  },
  {
    "UTCID": "UTCID07",
    "sync": true,
    "error": "offline"
  },
  {
    "UTCID": "UTCID08",
    "error": "offline"
  },
  {
    "UTCID": "UTCID09",
    "raw": {
      "code": 11000
    },
    "mapped": [
      409,
      "VERSION_CONFLICT",
      "Record already exists"
    ]
  },
  {
    "UTCID": "UTCID10",
    "raw": {
      "name": "ValidationError"
    },
    "mapped": [
      422,
      "VALIDATION_FAILED",
      "Data does not match the schema"
    ]
  },
  {
    "UTCID": "UTCID11",
    "raw": {
      "name": "StrictModeError"
    },
    "mapped": [
      422,
      "VALIDATION_FAILED",
      "Data does not match the schema"
    ]
  },
  {
    "UTCID": "UTCID12",
    "deferred": true
  },
  {
    "UTCID": "UTCID13",
    "noRequestId": true
  },
  {
    "UTCID": "UTCID14",
    "syncResult": true
  },
  {
    "UTCID": "UTCID15",
    "error": [
      404,
      "RESOURCE_NOT_FOUND",
      "Owned pet unavailable"
    ]
  }
]
```

### GRM-CTL-04 — GRM-CTL-04_book

[Mở sheet](https://docs.google.com/spreadsheets/d/1PD80jpSwEwZgKE6Z3JoNPd3iQhwqnE3j/edit?gid=130900030#gid=130900030)

File: `backend/tests/unit/grooming-booking.book.test.js`. Kết quả: 15 Passed, 0 Failed, 0 Untested. N/A/B = 2/11/2.

Expected Service Invocation: `service.book(req.auth, req.body, req.get('Idempotency-Key'))`, đúng 1 lần. HTTP 201.

Body mặc định:
```json
{
  "pets": [
    {
      "petId": "abcdef0123456789abcdef01",
      "serviceIds": [
        "abcdef0123456789abcdef02"
      ],
      "answers": {
        "biteOrScratch": "NO",
        "skinCondition": "NO"
      }
    }
  ],
  "startAt": "2026-11-19T02:00:00.000Z",
  "expectedTotalVnd": 100000
}
```

Header mặc định `booking-key-001`; req.get phải nhận đúng `Idempotency-Key` 1 lần. Missing/empty/whitespace đi nguyên vẹn sang mock, mock trả lỗi theo service contract; controller không tự validate/trim key.

Service DTO mặc định:
```json
{
  "id": "abcdef0123456789abcdef03",
  "code": "GR000001",
  "status": "BOOKED",
  "depositRequired": false,
  "pricing": {
    "subtotalVnd": 100000,
    "tierDiscountVnd": 0,
    "totalVnd": 100000,
    "currency": "VND"
  }
}
```

| UTCID | Type | Jest test objective / condition | Actual Result |
| --- | --- | --- | --- |
| UTCID01 | N | maps request and preserves service DTO | Passed — assertions matched |
| UTCID02 | B | passes missing Idempotency-Key unchanged | Passed — assertions matched |
| UTCID03 | B | passes empty Idempotency-Key unchanged | Passed — assertions matched |
| UTCID04 | A | does not trim whitespace Idempotency-Key | Passed — assertions matched |
| UTCID05 | A | passes missing auth and propagates service forbidden error | Passed — assertions matched |
| UTCID06 | A | passes null body to service without defaulting | Passed — assertions matched |
| UTCID07 | A | propagates synchronous service Error unchanged | Passed — assertions matched |
| UTCID08 | A | propagates rejected service Promise unchanged | Passed — assertions matched |
| UTCID09 | A | maps duplicate key to 409 VERSION_CONFLICT | Passed — assertions matched |
| UTCID10 | A | maps ValidationError to 422 VALIDATION_FAILED | Passed — assertions matched |
| UTCID11 | A | maps StrictModeError to 422 VALIDATION_FAILED | Passed — assertions matched |
| UTCID12 | N | waits for service before sending HTTP response | Passed — assertions matched |
| UTCID13 | A | preserves null booking result | Passed — assertions matched |
| UTCID14 | A | preserves undefined booking result at json boundary | Passed — assertions matched |
| UTCID15 | A | preserves domain error status code message and details | Passed — assertions matched |

Các overrides cụ thể; các trường không liệt kê giữ fixture mặc định. `error:[status,code,message]` tạo AppError với details `{reason:"synthetic"}`; `raw` là Error có message `private database detail`; `mapped` là AppError mong đợi với details `{}`. `noData` nghĩa undefined; `deferred` nghĩa Promise pending, chưa gửi response đến khi resolve; `syncResult` nghĩa service trả DTO đồng bộ.

```json
[
  {
    "UTCID": "UTCID01"
  },
  {
    "UTCID": "UTCID02",
    "noKey": true,
    "error": [
      422,
      "VALIDATION_FAILED",
      "Idempotency-Key of 8 to 200 characters required"
    ]
  },
  {
    "UTCID": "UTCID03",
    "key": "",
    "error": [
      422,
      "VALIDATION_FAILED",
      "Idempotency-Key of 8 to 200 characters required"
    ]
  },
  {
    "UTCID": "UTCID04",
    "key": "   ",
    "error": [
      422,
      "VALIDATION_FAILED",
      "Idempotency-Key of 8 to 200 characters required"
    ]
  },
  {
    "UTCID": "UTCID05",
    "noAuth": true,
    "error": [
      403,
      "FORBIDDEN",
      "Customer required"
    ]
  },
  {
    "UTCID": "UTCID06",
    "nullBody": true,
    "error": [
      422,
      "VALIDATION_FAILED",
      "Invalid fields"
    ]
  },
  {
    "UTCID": "UTCID07",
    "sync": true,
    "error": "offline"
  },
  {
    "UTCID": "UTCID08",
    "error": "offline"
  },
  {
    "UTCID": "UTCID09",
    "raw": {
      "code": 11000
    },
    "mapped": [
      409,
      "VERSION_CONFLICT",
      "Record already exists"
    ]
  },
  {
    "UTCID": "UTCID10",
    "raw": {
      "name": "ValidationError"
    },
    "mapped": [
      422,
      "VALIDATION_FAILED",
      "Data does not match the schema"
    ]
  },
  {
    "UTCID": "UTCID11",
    "raw": {
      "name": "StrictModeError"
    },
    "mapped": [
      422,
      "VALIDATION_FAILED",
      "Data does not match the schema"
    ]
  },
  {
    "UTCID": "UTCID12",
    "deferred": true
  },
  {
    "UTCID": "UTCID13",
    "data": null
  },
  {
    "UTCID": "UTCID14",
    "noData": true
  },
  {
    "UTCID": "UTCID15",
    "error": [
      409,
      "GROOMING_SLOT_TAKEN",
      "The time slot is no longer available"
    ]
  }
]
```

## Defect report và workflow

**No defects found** trong 75 controller cases đã chạy. Confirmed Defect: 0. Potential Defect: 0. Test Design/Implementation Issue còn mở: 0. Jest Environment Issue: 0. Không có Defect Note cần ghi hoặc xin phê duyệt.

GitHub Issue chưa được liên kết: gh CLI không có trong PATH và chưa xác minh identity cho GitHub mutation. Đã fetch, fast-forward develop từ d422ac5a lên 692c2521 và tạo nhánh riêng; giữ nguyên các thay đổi frontend/test cũ. Không commit, push, mở PR, approve hoặc merge.

Bằng chứng Jest JSON nằm tại `.tmp-unit-matrix/EMP-CTL-01.json`, `GRM-CTL-01.json` đến `GRM-CTL-04.json`, `controller-group.json`; kiểm tra workbook tại `controller-workbook-verification.json`. Đây là artifacts cục bộ, không đưa report SRS/workbook vào Git.
