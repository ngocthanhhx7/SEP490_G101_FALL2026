# Customer account layout

User reference: supplied Shopee account/profile screenshot and current Customer
screen showing horizontally overflowing navigation. Borrow its information hierarchy,
left account navigation and quiet form layout; retain Paw World Care branding.

## Implementation

- Keep public header/footer; account pages share an unframed sidebar and white
  content surface on a neutral background. Account, service and discovery groups
  use existing authorized routes. Customer `/account` redirects to profile;
  operational roles retain their account page and shell.
- Mobile menu expands inline, with keyboard Escape/focus return and hidden links
  excluded from tab order. No horizontally scrolling account menu.
- Profile uses one compact form and verified masked contacts. Change links open
  the existing OTP contact flow. Do not invent avatar upload, gender, birth date,
  bank or password fields unsupported by existing APIs.
- Customer care overview owns customer presentation independently of operational
  dashboards. Server counters, dated visit list, collapsible date filters, cursor
  pagination and error/empty distinctions retain current API semantics.
- Existing licensed service photo represents actual care; no new external assets.

## Acceptance

Check profile save/version/CSRF, Customer redirect, same-role account switch,
role guards, mobile navigation and all account destinations. Inspect screenshots
at 1440, 768, 390 and 320 px. Browser fixtures must be labelled as synthetic;
do not change real Customer data to validate a visual release.
