# P26 customer care screens

`VisitCareInstructionsPage` (WBS-035) edits a versioned visit snapshot through
an injected adapter and keeps history visible. The server remains authoritative
for ownership, important-field re-acknowledgement and the two-hour cutoff.

`VisitHandoverPage` (WBS-036) renders the confirmation command. A local form
submission never grants access; the server verifies the replacement assignment
and acknowledgement of the current instruction version. Both screens are
intentionally unregistered; P34 owns route registration and live Visit wiring.
