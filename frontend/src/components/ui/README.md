# Brand UI components

P04 owns Button, Input, Select, Dialog, Notice, BrandLogo and BrandIcon. Import named exports from index.js, and import ../../styles/index.css once at the application entry (relative to this folder). Component exports do not silently register routes or load styles. See [usage and tokens](../../../../doc/ui-ux/p04-brand-design-system.md).

Native HTML controls provide keyboard and form semantics. Dialog uses showModal/close, not a handmade focus trap. Tests stub modal methods in jsdom and verify state/callback behavior only; separate browser evidence verifies real modal behavior. No new package is required. FieldFrame is internal, not a consumer API.

Pagination is the shared "Hiển thị a–b trên N" line with Trước/Sau for paged Admin lists. It only draws what `page`, `limit` and `total` say and calls `onPageChange`; the list and its page size stay with the screen.

`Pagination` and `CursorPagination` share Figma 2:3124 round controls. Numbered lists keep server page/limit/total and can recover after results shrink. Cursor lists keep caller-owned history and write/loading locks, without inventing an unknown last page.

`SiteBrandMark` is the shared PawWorldCare wordmark for the public header and role workspace header. Role navigation remains owned by the layout; the mark only renders the same icon and full brand name.
