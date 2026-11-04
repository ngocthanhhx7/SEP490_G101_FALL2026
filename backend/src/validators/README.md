# Input validators

Pure DTO checks and primitive validation live here. No HTTP response handling, database reads or service imports. Domain services decide eligibility, pricing and scheduling; validators reject malformed input including impossible calendar dates.

`pagination.validator.js` parses `page` and `limit` (whole numbers, 20 by default, 50 at most) for any paged Admin list. `product-management.validator.js` checks the Product Management query and bodies: it reads a price as a number or as `250000` / `250.000`, collects every wrong field with its reason (`REQUIRED`, `INVALID`, `TOO_LONG`, `WHOLE_NUMBER`, `TOO_LARGE`) and refuses the code, the stock and any unknown key.

`supplier-management.validator.js` checks the Supplier Management query and bodies: name, contact name, a ten-digit phone (spaces, dots and hyphens dropped; no `+84`, no eleven-digit landlines), email and product ids. It collects every wrong field with its reason (`REQUIRED`, `INVALID`, `TOO_LONG`, `TOO_MANY`, `CONTACT_REQUIRED`) and works out the name key with `utils/supplier-name.js`.

`goods-receipt.validator.js` checks the Goods Receipt query and body: the supplier, at most 50 lines, and for each line the product (each once), the quantity received (MSG113), the quantity taken in (MSG119) and the reason for rejected goods (MSG120). It collects every wrong field and line with its reason and works out the rejected quantity, so the client never sends it.
