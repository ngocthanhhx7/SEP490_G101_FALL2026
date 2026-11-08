# Product shop components

`ProductImageManager` previews and confirms Admin gallery uploads/replacements/
removals. It revokes preview URLs, blocks writes during dirty text edits, requires
reload after unknown acknowledgements and never treats a local preview as saved.
Transport stays in `product-management-api.js`; MongoDB owns persisted images.

Reusable pieces of the Customer product shop: `ProductCard`, `ProductPhoto` (photo or brand placeholder), `QuantityStepper`, `OrderStatusBadge`, `OrderReturnDialogs` (the Admin dialogs for sending an order back and confirming a return) and the shared `product-shop.css`. The stylesheet is scoped to `.pwc-shop-*` classes and uses the R3 Figma colours locally; it does not change the shared tokens. Components render backend data only; they never compute stock, price or totals. They do not import pages, layouts or route manifests.

`ProductPicker` lets the Admin choose products from the catalog (search by name or code, hidden products included) and remove them with a cross; it reads the catalog through the Admin product API it is given and keeps nothing itself.

`HomeProductPreview` loads published products only when Home's product mode is
selected. `QuantityStepper` enforces the API's 99-per-line ceiling in addition to
available stock. `ProductPhoto` falls back to the brand mark for broken images.

`ProductCard` adapts Figma 2:3052: database image/name/description/price, dashed footer and explicit cart button. Guest clicks preserve the product on login; confirmed writes update the shared cart, unknown replies require checking/reloading. Styling stays in product-shop.css without competing legacy card overrides.

`CounterProductTable.jsx` tra/paging/thêm sản phẩm hiện, khoá Hết hàng. `CounterOrderPanel.jsx` hiển thị khách, dòng, totals server và bước tiền mặt, dùng QuantityStepper hiện có. `CounterOpenOrders.jsx` mở lại hàng đợi oldest-first từ backend, có paging. Component nhận API/callback, không tính tiền/tồn hoặc quyết định chuyển trạng thái.
