# HTTP controllers

Controllers translate req/auth/body/params to service calls, preserve HTTP status/envelopes/cookies and map domain/database errors without leaking details. They do not query models or import routes/middleware. Route handlers are constructed here; shared `controller-action.js` maps duplicate409 and schema422.

Application private-document reads return bounded PNG/JPEG bytes with private,
no-store and inline headers after the service's Admin/document/quota/audit checks.
They no longer redirect a browser to an R2 capability URL.

`avatar.controller.js` translates avatar metadata, binary reads and versioned PUT/DELETE commands; domain authorization/decoding stays in the avatar service.

`counter-sale.controller.js` chuyển session/query/body/key sang catalog và counter services, trả 201 cho tạo, 200 cho đọc/lookup/preview/command. Không tính tiền hoặc thay stock tại controller.
