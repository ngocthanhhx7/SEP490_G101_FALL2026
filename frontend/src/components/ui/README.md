# Brand UI components

P04 owns Button, Input, Select, Dialog, Notice, BrandLogo and BrandIcon. Import named exports from index.js, and import ../../styles/index.css once at the application entry (relative to this folder). Component exports do not silently register routes or load styles. See [usage and tokens](../../../../doc/ui-ux/p04-brand-design-system.md).

Native HTML controls provide keyboard and form semantics. Dialog uses showModal/close, not a handmade focus trap. Tests stub modal methods in jsdom and verify state/callback behavior only; separate browser evidence verifies real modal behavior. No new package is required. FieldFrame is internal, not a consumer API.

Pagination is the shared "Hiển thị a–b trên N" line with Trước/Sau for paged Admin lists. It only draws what `page`, `limit` and `total` say and calls `onPageChange`; the list and its page size stay with the screen.
