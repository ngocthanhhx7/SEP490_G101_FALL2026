# Pet cards, grouped editing and Gemini record drafts

Owner decisions (2026-11-09): use supplied photo-led pet card mockup, wider compact sitter selection, four editing groups; read client-entered health/vaccination/notes. Optional Gemini provider approved, specifically `gemini-3.1-flash-lite`; no API key yet, ship disabled and document setup. Owner explicitly extends the prior sitter-only AI boundary to document transcription for customer review, not diagnosis, eligibility, pricing or financial decisions.

## Persistence and rollout plan (before implementation)

Both mongodb-schema-design and mongodb-query-optimizer applied. Current physical `pets` owns bounded careProfile entries (KNOWN/UNKNOWN/NOT_PROVIDED, value max2000) and ownerId/state/version. Read list is owner/state scoped with limit100 and _id ordering; existing compound ownerId/state/_id serves that access, while exact writes use _id plus owner/version guards. No new read predicate requires an index. No health history collection, raw document binary, unbounded vaccine array, model output or provider response will be stored in MongoDB for this increment.

Target: transient extraction with at most 8 allowed care fields and source excerpts. Browser holds a draft until customer explicitly selects fields, confirms applying them and then saves the pet through existing owner-scoped expectedVersion/idempotent transaction. No result is silently persisted, marked clinically verified or used to determine price/eligibility. Imported text is subject to existing validators. Old nonselected fields remain intact; applying resets care confirmation. Original uploaded document is processed transiently, not retained as an application attachment. A new upload creates a new extraction; no automatic paid retries.

Compatibility: existing API and DTO persistence unchanged; additive /pet-record-import metadata and consented binary extraction endpoints are authenticated Customer+CSRF. Feature defaults off; no .env changes or external real-data upload in release acceptance. New capability needs configured key/model and explicit user consent to Google processing. Provider quota/timeouts fail safely to manual entry. Reference data from files is untrusted; no links/tools/instructions in a document are executed.

No schema migration/backfill/index/unique/TTL/collection change or destructive cleanup. Dry-run: full UI/backend security and provider-stub regressions; inspect existing production index/query evidence read-only. Release: exact reviewed main, fresh backup/isolated restore; compare existing private photo hashes and env. Code rollback to 046f33b is compatible because existing care storage is unchanged. Live Gemini acceptance remains pending key and synthetic request, not inferred from mocks/builds.

## Design

Desktop dispatch1120px two columns, mobile single column; candidates88px minimum with20px native radios. Pet cards use owned photos plus factual summaries and an add tile. Pet editor1040px and mobile full viewport; header/footer stay outside body scroll; four group buttons retain draft values and reveal invalid fields. No fabricated sitter prices, medical status, discounts, distances, credentials or autosave. Browser local actual-component checks at1440/390 confirmed widths,20px radios,no horizontal overflow and nonoverlapping form/footer before adding import panel; final regression checks required.

## Primary provider references

- https://ai.google.dev/gemini-api/docs/models/gemini-3.1-flash-lite
- https://ai.google.dev/gemini-api/docs/document-processing
- https://ai.google.dev/gemini-api/docs/structured-output
- https://ai.google.dev/gemini-api/terms

Provider model support verified by official indexed model documentation; direct fetch of processing/schema/terms pages failed in tools. API protocol must be exercised with synthetic stubs and a real synthetic live acceptance once a key is supplied; no claim of live provider success in this release.

Native read-only VPS evidence:48 pets,max892B BSON,existing owner/state/_id index; representative owner list returned2 with2 keys/2 docs examined and no sort stage. This is a scoped plan, not a whole-workload benchmark. No index mutation. See [Gemini setup](../deployment/gemini-pet-record-import.md).
