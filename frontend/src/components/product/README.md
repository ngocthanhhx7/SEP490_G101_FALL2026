# Product shop components

`ProductImageManager` previews and confirms Admin gallery uploads/replacements/
removals. It revokes preview URLs, blocks writes during dirty text edits, requires
reload after unknown acknowledgements and never treats a local preview as saved.
Transport stays in `product-management-api.js`; MongoDB owns persisted images.

Reusable pieces of the Customer product shop: `ProductCard`, `ProductPhoto` (photo or brand placeholder), `QuantityStepper`, `OrderStatusBadge`, `OrderReturnDialogs` (the Admin dialogs for sending an order back and confirming a return) and the shared `product-shop.css`. The stylesheet is scoped to `.pwc-shop-*` classes and uses the R3 Figma colours locally; it does not change the shared tokens. Components render backend data only; they never compute stock, price or totals. They do not import pages, layouts or route manifests.

`ProductPicker` lets the Admin choose products from the catalog (search by name or code, hidden products included) and remove them with a cross; it reads the catalog through the Admin product API it is given and keeps nothing itself.

`ProductSearch` is the search box and results of `ProductPicker`, exported for the Goods Receipt page, which adds a product as a row instead of a chip. It takes any product API with `listProducts({ search, limit })`.

`HomeProductPreview` loads published products only when Home's product mode is
selected. `QuantityStepper` enforces the API's 99-per-line ceiling in addition to
available stock. `ProductPhoto` falls back to the brand mark for broken images.
