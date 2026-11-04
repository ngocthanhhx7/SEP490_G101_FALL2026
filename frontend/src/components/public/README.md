# Public site components

`PublicHeader` and `PublicFooter` adapt Figma nodes 278:33 and 277:7308 to the current care and shopping context. The header links to Home, products, services, About and Contact. Search passes a query to the service catalog. Guests see sign-in/register; authenticated users reuse P48 AvatarMenu with hover, click pinning and the real session logout callback. Customers can open their product cart.

The fourth footer column contains policy links, replacing newsletter signup as requested. Facebook/TikTok/Instagram remain visual marks until official destination URLs are provided. The brand tagline covers care and shopping.

The complete Home is in `pages/public/HomePage.jsx`. Catalog data and prices remain server-owned. Static service illustrations link to catalog exploration and are distinguished from bookable published offers; the supplied community stories are marked illustrative.

`CatalogLayout` shares the collapsible filter sidebar and results column between services and products. Pages own their filter state and data; this component only arranges content.
