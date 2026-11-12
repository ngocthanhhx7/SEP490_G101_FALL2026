# Pure UI helpers

`stock-format.js` formats integer stock quantities and signed history deltas, including
+0. It performs no availability or status calculation. Receipt days reuse `formatDay`.

`role-access.js` accepts exactly one account role (including the legacy scalar
adapter shape). Mixed/duplicate roles fail closed; they are not normalized by
privilege priority. ADMIN retains the existing STAFF-operation permission rule.

`product-photo.js` maps generated product-photo URLs to the Admin reader for hidden
product previews. Static assets keep their paths; this is URL formatting only.

Reusable pure formatting and data helpers belong here, including `catalog-format.js`. They do not fetch APIs or import services, pages, contexts or components. Keep domain/financial authority in backend services; UI formatting cannot determine the amount charged.

`product-format.js` formats integer VND and order dates and maps backend error codes to the R3 messages in `constants/product-messages.js`. It also reads a price typed as `250000` or `250.000` (`parsePriceInput`) and shows a saved one the same way (`formatPriceInput`); the backend checks it again. It does not calculate money.

`supplier-validation.js` mirrors the supplier rules for the form (ten-digit phone with spaces, dots and hyphens dropped, email shape, a phone or an email needed) so mistakes show before sending; the backend checks them again.

`goods-receipt-validation.js` mirrors the goods receipt rules for the form (a whole quantity from 1, a quantity taken in from 0 to the quantity received, a reason where goods are rejected) and works out the rejected quantity, so mistakes show before sending; the backend checks them again.

`booking-presentation.js` owns shared Customer-readable booking labels, status explanations and Vietnam date/VND formatting. Unknown states remain explicit; formatting does not change server status, payment or totals.
