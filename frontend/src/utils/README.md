# Pure UI helpers

`product-photo.js` maps generated product-photo URLs to the Admin reader for hidden
product previews. Static assets keep their paths; this is URL formatting only.

Reusable pure formatting and data helpers belong here, including `catalog-format.js`. They do not fetch APIs or import services, pages, contexts or components. Keep domain/financial authority in backend services; UI formatting cannot determine the amount charged.

`product-format.js` formats integer VND and order dates and maps backend error codes to the R3 messages in `constants/product-messages.js`. It also reads a price typed as `250000` or `250.000` (`parsePriceInput`) and shows a saved one the same way (`formatPriceInput`); the backend checks it again. It does not calculate money.

`supplier-validation.js` mirrors the supplier rules for the form (ten-digit phone with spaces, dots and hyphens dropped, email shape, a phone or an email needed) so mistakes show before sending; the backend checks them again.

`counter-sale-format.js` định dạng giờ nhận tiền theo Asia/Ho_Chi_Minh, không phụ thuộc timezone máy. Tiền VND dùng product-format.js; MSG110/111/112 ở constants, không tính totals tại UI.
