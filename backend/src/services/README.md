# Domain services

Services own domain decisions, data access orchestration and provider interactions. They import models/config/validators/utils/constants; never routes/controllers/middleware. Pricing is deterministic in `pricing/`; AI only recommends sitters in `sitter-matching/`. Shared owned-pet/service context has no pricing prerequisite. Private provider/default ports fail closed if unconfigured.

The registration/sitter runtime and its scoped OTP status flow are now connected; see [registration verification](../../../doc/testing/registration-sitter-flow.md). The application intake service keeps owner/media checks separate from submission/approval transactions.
