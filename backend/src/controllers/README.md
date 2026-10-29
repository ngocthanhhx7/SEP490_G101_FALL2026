# HTTP controllers

Controllers translate req/auth/body/params to service calls, preserve HTTP status/envelopes/cookies and map domain/database errors without leaking details. They do not query models or import routes/middleware. Route handlers are constructed here; shared `controller-action.js` maps duplicate409 and schema422.
