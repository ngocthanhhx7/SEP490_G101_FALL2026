# HTTP controllers

Controllers translate req/auth/body/params to service calls, preserve HTTP status/envelopes/cookies and map domain/database errors without leaking details. They do not query models or import routes/middleware. Route handlers are constructed here; shared `controller-action.js` maps duplicate409 and schema422.

Application private-document reads return bounded PNG/JPEG bytes with private,
no-store and inline headers after the service's Admin/document/quota/audit checks.
They no longer redirect a browser to an R2 capability URL.
