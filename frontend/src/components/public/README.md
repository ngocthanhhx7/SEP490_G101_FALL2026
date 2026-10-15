# Public site components

`PublicHeader` and `PublicFooter` implement Figma nodes 278:33 and 277:7308 with the user's requested changes. The header retains five labels; Sản phẩm opens the care-service catalog, Câu truyện opens the Home stories, Về chúng tôi opens /about and Liên hệ opens /contact. Search passes a query to the catalog. Guests see sign-in/register; authenticated users reuse P48 AvatarMenu with hover, click pinning and the real session logout callback. No cart or shopping flow is introduced.

The fourth footer column contains policy links, replacing newsletter signup as requested. Facebook/TikTok/Instagram remain visual marks until official destination URLs are provided. The brand tagline refers to care instead of food sales.

The complete Home is in `pages/public/HomePage.jsx`. Catalog data and prices remain server-owned. Static service illustrations link to catalog exploration and are distinguished from bookable published offers; the supplied community stories are marked illustrative.
