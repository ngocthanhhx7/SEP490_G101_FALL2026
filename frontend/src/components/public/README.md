# Public site components

`PublicHeader` and `PublicFooter` implement Figma nodes 278:33 and 277:7308. The header retains the supplied five labels; Sản phẩm opens the care-service catalog, stories/about/contact resolve real page anchors, and search passes a query to the catalog. Guests see sign-in/register; authenticated users reuse P48 AvatarMenu with hover, click pinning and the real session logout callback. No cart or shopping flow is introduced.

The footer links to published policy routes. Its newsletter form acknowledges only a successful server-stored REQUESTED receipt and shows failures honestly; it does not claim mailbox verification or sent email campaigns. Facebook/TikTok/Instagram remain visual marks until official destination URLs are provided rather than linking to invented accounts.

The complete Home is in `pages/public/HomePage.jsx`. Catalog data and prices remain server-owned. Static service illustrations link to catalog exploration and are distinguished from bookable published offers; the supplied community stories are marked illustrative.
