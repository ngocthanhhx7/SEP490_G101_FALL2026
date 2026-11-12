# Account photos and pet profile experience

## Observed problem

The previous pet workspace placed a long editor below the list, with repeated status labels and no focused read view. Choosing a photo immediately started a mutation; the user had no preview/explicit save and errors did not explain what could happen next. Server processing accepted at most 4 megapixels, so common higher-resolution phone photos could be rejected even within the file-size limit. This is a code-level reproducible limitation, not a claim about the exact file the owner attempted.

Read-only production inspection found five present profileavatars with valid JPEG 512 × 512 bytes and 48 pets. All five could be read through the existing ownership-scoped service. No image data loss was established. These checks do not prove successful rendering in the user's browser.

## Customer flow

1. Account photo: choose JPG/PNG up to 10 MB locally; decode/crop a centered square and normalize to at most 512 × 512 / 512 KB, preview, then explicitly save. Cancel leaves the current server photo intact. The server retains its existing 5 MB / 4 MP validation and authoritative normalization. Original photo data is not sent to an external image provider.
2. Private display: fetch same-origin protected content using cookies and no-store, validate JPEG/size, display a short-lived blob URL and revoke it on identity change/unmount. Stale responses cannot display another account's image. Change events refresh only the affected resource. No public bucket/path is introduced.
3. Save failures: preserve the same normalized file, expected version and operation key after unknown acknowledgement; freeze selection and allow identical retry or metadata reconciliation. A stale-version response requires reload. Removing a saved photo has a confirmation dialog.
4. Pet list: photo/name/breed/weight cards, confirmation status and clear view/edit actions. Each owner detail route shows basic facts, selected care traits, grouped care summaries and the existing private photo editor.
5. Edit: native accessible dialog, basic fields first, optional grouped care sections, multiline notes, care-trait explanations, sticky save/cancel actions and confirmation before discarding a changed draft. Native invalid-field events open the containing section. No required hidden care field silently blocks submission.
6. New pet: save the existing required basics, then open its owned detail page to add an image. No orphan photo is uploaded before a pet exists. Archived profiles stay out of new bookings; existing history/conflict checks remain authoritative.
7. Account name: photo-triggered profile refresh keeps a typed name draft and updates the version used by the subsequent save. Name saving is disabled while photo writes are uncertain, avoiding a competing version update.

Unknown/not-provided care information remains distinct from known absence. Editing resets care confirmation under the existing policy. Self-reported health/medication text is never presented as a verified medical record. Breed does not infer temperament or risk. Addresses retain their existing form/API behavior.

## Research basis

[GOV.UK file upload](https://design-system.service.gov.uk/components/file-upload/) supports clear controls, accessible labels and explicit file errors. [Check answers](https://design-system.service.gov.uk/patterns/check-answers/) supports sectioned review, prefilled changes and retaining previously entered answers. These are design references; they do not establish that this exact UI has been tested with real customers. Existing PawWorld components, colors, typography and native dialogs are reused; no animation or new component framework is added.

## Data and release boundaries

`profileavatars` continues to own a bounded normalized body and version/fingerprint per user or pet. Existing `_id` serves exact-resource reads; no collection, index, validator, TTL, schema migration or image backfill is added. The existing `/avatars/*`, `/pet-care/*` and `/me/profile` contracts are retained. The frontend binary reader is an adapter for the already protected content endpoint. No live customer image is replaced as an acceptance fixture.

Regressions cover actual signed-cookie account/pet upload/read, ownership/CSRF, normalization and size limits, explicit preview/save, stable retry, owner switching/URL cleanup, dirty-form cancellation and name preservation after photo version refresh. Run both lints, architecture, full configured tests and build before review. Deploy the exact reviewed main artifact after a fresh backup and isolated restore rehearsal; previous `218989f` is a compatible code rollback because this release requires no data migration. Preserve env, roles, contract/financial policy, private media and database volumes.

Interactive browser acceptance must be reported separately from component tests/build/HTTP checks. Local browser use was disabled in Work settings at the previous verified inventory; do not bypass that setting or invent screenshots.
