# Home-care coverage registry and sitter registration

## Behavior

Admin configures global coverage for home-care services at `/admin/service-areas`.
New communes start disabled; the administrator selects up to 100 entries on the
current page, records a reason and confirms opening/closure. Provinces are
navigation categories, not automatic activation of all children. Staff, Customer
and Pet Sitter cannot mutate this policy. Existing legacy operational city/zones
are separately labeled and initially enabled to preserve booked addresses and
sitter selections. They are not legal administrative districts or automatic
mappings to the new communes. Product delivery zones remain independent.

Sitter `/sitter/work-areas` loads registered historical codes separately from
new registration limits: existing 22-code employee profiles no longer fail the
old 20-code reader constraint. New saves accept at most 100 codes; the page has
province/search filters and 100-row pages. Closed selections remain visible for
removal but cannot be newly added. Empty selection is permitted. Existing
availability version/idempotency, signed-contract checks and confirmed-visit
conflict checks remain authoritative. Unknown outcomes require reload/reconcile.

Address entry, home-care booking confirmation, matching and invitation eligibility
read the active database catalog without a stale process cache. Closure prevents
new booking/invitation/acceptance in that zone; it does not cancel or remove
confirmed visits. Scheduling transactions and administrator changes write the
same policy guard document to serialize closure with new work. Existing assigned
care execution retains its normal lifecycle. Recommendation alone is not an
assignment. Region choice is not proof of geocoded boundary membership.

## Source and scope of administrative data

`backend/data/vn-administrative-units-2025.json` contains 34 province-level and
3,321 commune-level entries (communes, wards and special administrative units).
It is a versioned **01 July 2025** reference snapshot, not a claim to reflect every
later change up to November 2026. The UI displays that vintage. The current NSO
site already lists later provincial naming/status changes; future updates need a
reviewed diff and provenance rather than silently replacing historical labels.

Source: [NSO official conversion workbook](https://danhmuchanhchinh.nso.gov.vn/TAPTIN/BangChuyendoi%C4%90VHCmoi_cu_final.xlsx),
linked by the [NSO administrative directory](https://danhmuchanhchinh.nso.gov.vn/Default.aspx).
The [published decision](https://www.nso.gov.vn/default/2025/07/quyet-dinh-ban-hanh-bang-danh-muc-va-ma-so-cac-don-vi-hanh-chinh-viet-nam/)
provides the legal source context. Retrieval date, source URL and SHA-256 are
stored in the dataset. Codes are strings with zero padding retained; new entries
are deduplicated by new-unit code in the workbook's unmerged sheet, whitespace
trimmed. Repeated old-unit mappings are not duplicate new communes. For code
05941 the source repeats the equivalent Thụy/Thuỵ spelling; first spelling is
retained. No geographic polygon, geocoding or old-district crosswalk is invented.

## Persistence, queries and compatibility

`serviceareas` stores bounded identity/parent/label/activation metadata plus the
single `coverage-policy` control. `serviceareacommands` holds actor/reason/codes,
fingerprint and acknowledged result for replay, expiring after 30 days; the latest
change remains on each unit. This is operational change/retry evidence, not a
permanent legal audit ledger. Two distinct lifecycles justify the stores.
No existing collection, unique constraint, TTL, address, employee availability or
financial snapshot is renamed, dropped or rewritten.

Indexes: `_id` is the stable namespaced code; `{level,parentCode,_id}` supports
province/child cursor pages; `{enabled,_id}` supports active coverage; command
`expiresAt` has a 30-day-at-write absolute expiry TTL. No regex scan is needed for
backend paging. Client search runs over bounded rendered pages; sitter selection
persists across pages. Registry reads have a 4,000-entry safety bound; admin pages
fetch 101 to return 100 and nextCursor. Integration explain verifies parent lookup
examines at most 101 documents with the compound index and no blocking SORT.
The old static operational catalog is only a pre-provision compatibility fallback;
once the control exists, an empty active set stays empty.

GET `/api/v1/admin/service-areas?level=PROVINCE` lists provinces. Use `parentCode`
(and optional `after`) for child pages. `level=CITY` lists legacy city scopes.
PUT requires session, Admin, CSRF/origin, idempotency key, `{codes,enabled,
expectedVersion,reason}`. Duplicate payload/key returns its previous result;
changed payload/key and stale version return 409. UI does not treat malformed
HTTP 200 as a confirmed save.

## Staged rollout / rollback

1. Review code, provenance, source counts/parents and tests. Preserve real `.env`.
2. Deploy artifact from reviewed main only, take fresh backup and restore isolated
   replica with TTL disabled. Rehearse provisioning and seed twice, role/CSRF,
   22-code reads, activation/closure and command replay on that clone.
3. `node scripts/deployment/provision-service-areas.js --dry-run` is data-read-only.
   `--apply` explicitly creates additive model storage/indexes, then performs
   insert-only upserts of the 3,355 reference entries plus 22 legacy zones and
   one policy control. No admin activation is overwritten on re-run. Existing
   identity/parent/label mismatch stops for a reviewed migration. Do not use
   generic database reseeding or drop any current collection.
4. Seed after backup and before activation of the candidate. Verify 34/3321,
   new units disabled, old 22 selections unchanged, indexes, role gates and
   artifact/runtime hashes; retain prior release and verified backup.
5. Ordinary code rollback restores the prior artifact and leaves additive stores
   intact. Prior code ignores the new registry, so it does **not** enforce later
   admin coverage closures; coordinate a booking maintenance gate before such a
   rollback. Do not drop stores or restore whole production data while users write.
   A data cleanup rollback requires a separate reviewed ownership/diff check.

Tests use synthetic principals and isolated MongoDB, never customer data.
