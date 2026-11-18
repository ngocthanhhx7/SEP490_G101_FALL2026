# Staff booking changes

UC-85 uses one request list and decision dialog in Staff/Admin dispatch and
booking details. The backend supplies the deadline, request version and sitter
availability. Successful decisions reload the affected parent view. An
uncertain decision keeps its original action, version and idempotency key.

Transport lives in `services/staff-booking-change-api.js`. Date, price and
message formatting lives in `utils/staff-booking-change-format.js`.
