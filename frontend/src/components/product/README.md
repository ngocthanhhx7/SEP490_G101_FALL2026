# Product shop components

Reusable pieces of the Customer product shop: `ProductCard`, `ProductPhoto` (photo or brand placeholder), `QuantityStepper`, `OrderStatusBadge`, `OrderReturnDialogs` (the Admin dialogs for sending an order back and confirming a return) and the shared `product-shop.css`. The stylesheet is scoped to `.pwc-shop-*` classes and uses the R3 Figma colours locally; it does not change the shared tokens. Components render backend data only; they never compute stock, price or totals. They do not import pages, layouts or route manifests.

`ProductPicker` lets the Admin choose products from the catalog (search by name or code, hidden products included) and remove them with a cross; it reads the catalog through the Admin product API it is given and keeps nothing itself.

`HomeProductPreview` loads published products only when Home's product mode is
selected. `QuantityStepper` enforces the API's 99-per-line ceiling in addition to
available stock. `ProductPhoto` falls back to the brand mark for broken images.
