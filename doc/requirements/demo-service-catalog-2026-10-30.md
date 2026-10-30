# Demo catalogue and pricing

Source: [team sheet](https://docs.google.com/spreadsheets/d/17FHTYg-Zv_5MkVKA6kyGR7_QkLYUdhVorqLLpbTsY_0/edit?gid=1530430300).
Owner confirmed ambiguous combo/weight rules on 30 October 2026.

`backend/src/constants/demo-service-catalog.js` defines the 13 offerings with price,
unit, species, category, location and declared duration. Unspecified boarding/transport
duration remains unspecified. The typo “Dắt cho” is corrected to “Dắt chó”.

## Money

- Highest rate within each group: coat/skin, weight, behaviour/health. Groups add on original base.
- DOG: <5kg 0%; 5–15kg 10%; >15–25kg 20%; >25kg 30%.
- CAT: <4kg 0%; 4–6kg 10%; >6–8kg 20%; >8kg 30%.
- Coat/skin: long20%, thick15%, tangled15%, fleas80%, muddy40%, sensitive40%.
- Behaviour/health: stranger fear25%, extra handling20%, limited mobility20%, prescribed medication25%.
- Combo: 1% × TOTAL visits, max10%, on service base before surcharges. The approved
  literal rule includes one visit (1%); no unapproved minimum bundle size.
- Existing order fee: 2% per complete5m VND after combo+surcharges, before this fee;
  over20% requires review. Basket computes both adjustments once across all rows.
- Boarding requires dayCount. Transport requires integer distanceMeters and rounds HALF_UP
  to VND. Neither multiplies by appointment minutes. Training/walking round up to their
  hour/30-minute unit. Per-visit services remain one price unit per visit.
- Multi-visit PREPAY. A quote is an estimate, not a booking, bill or payment.

## Migration

`node scripts/seeds/demo-services.js` previews; `--apply` only accepts non-production
`*_dev` databases. It adds missing services, immutable prices/policies and presentation,
records source provenance and preserves Admin edits. Only untouched migration-owned
home-visit/vet-escort versions become INACTIVE; historical bookings stay intact.
Pricing policies outside the original owner seed are reported as skipped and need review.

## Media And Checks

Local WebP files and attribution/license metadata: `frontend/public/assets/services/credits.json`.
Pinterest returned login-only results; downloaded Wikimedia Commons photographs were inspected.
Existing home/walking images remain in use. Photos illustrate services, not actual company facilities.

Backend: 81 suites/769 tests passed; frontend: 73 suites/458 tests passed, lint/build passed.
Playwright: 1440×1000 and 390×844, all13 images rendered, category/location filters and detail
navigation passed, no page errors or horizontal overflow. Later changes require fresh checks.
Review coordination defaults to Ngọc Thành; independent PR approval is still required.
