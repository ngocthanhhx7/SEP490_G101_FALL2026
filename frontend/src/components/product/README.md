# Product shop components

Reusable pieces of the Customer product shop: `ProductCard`, `ProductPhoto` (photo or brand placeholder), `QuantityStepper`, `OrderStatusBadge` and the shared `product-shop.css`. The stylesheet is scoped to `.pwc-shop-*` classes and uses the R3 Figma colours locally; it does not change the shared tokens. Components render backend data only; they never compute stock, price or totals. They do not import pages, layouts or route manifests.
