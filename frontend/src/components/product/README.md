# Product shop components

`StockHistoryPanel` reads receipt history for the selected stock product, displays
`receivedOn` and accepted quantity including +0, and appends signed-cursor pages.
Unmounting or changing requests aborts them and ignores late responses. No order
events or fabricated adjustments appear; additional history kinds require an API extension.

`ProductImageManager` previews and confirms Admin gallery uploads/replacements/
removals. It revokes preview URLs, blocks writes during dirty text edits, requires
reload after unknown acknowledgements and never treats a local preview as saved.
Transport stays in `product-management-api.js`; MongoDB owns persisted images.
It shows the photos as a row of small tiles (D-249): the first tile is the cover
(accent border, named "Ảnh đại diện"), replace and delete sit on each tile, and a
dashed "+" tile at the end adds a photo until the product has five. The row is
display only: the choose-file, preview and "Lưu ảnh" steps and every API call are
unchanged, and there is no reordering.

`ProductGallery` is the photo area of Product Details (D-249): the large photo with
a row of up to five thumbnails below it. Pressing a thumbnail changes the large
photo and the chosen thumbnail has the accent border (`aria-pressed`). No photo
shows the brand placeholder and one photo shows no thumbnail row. The chosen photo
is kept by URL, so a changed photo list falls back to the first photo; a photo that
fails to load shows the brand mark. Styles are in `product-gallery.css`.

Reusable pieces of the Customer product shop: `ProductCard`, `ProductPhoto` (photo or brand placeholder), `QuantityStepper`, `OrderStatusBadge`, `OrderReturnDialogs` (the Admin dialogs for sending an order back and confirming a return) and the shared `product-shop.css`. The stylesheet is scoped to `.pwc-shop-*` classes and uses the R3 Figma colours locally; it does not change the shared tokens. Components render backend data only; they never compute stock, price or totals. They do not import pages, layouts or route manifests.

`ProductPicker` lets the Admin choose products from the catalog (search by name or code, hidden products included) and remove them with a cross; it reads the catalog through the Admin product API it is given and keeps nothing itself.

`ProductSearch` is the search box and results of `ProductPicker`, exported for the Goods Receipt page, which adds a product as a row instead of a chip. It takes any product API with `listProducts({ search, limit })`.

`HomeProductPreview` loads published products only when Home's product mode is
selected. `QuantityStepper` enforces the API's 99-per-line ceiling in addition to
available stock. `ProductPhoto` falls back to the brand mark for broken images.

`ProductCard` adapts Figma 2:3052: database image/name/description/price, dashed footer and explicit cart button. Guest clicks preserve the product on login; confirmed writes update the shared cart, unknown replies require checking/reloading. Styling stays in product-shop.css without competing legacy card overrides.
