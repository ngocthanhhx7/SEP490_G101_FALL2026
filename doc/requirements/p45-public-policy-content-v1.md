# P45 — Public policy content and integration handoff v1.0

Date: 14/10/2026, Asia/Ho_Chi_Minh. Scope: WBS-N10 / EXT-POLICY. Contributor and branch owner: Phạm Thành Chung. Assigned reviewer: Đoàn Tiến Đạt. Final merger: Nguyễn Ngọc Thành. This is draft content for review, not legal advice or a claim of legal verification.

## Publication contract

The frontend catalog in `frontend/src/pages/public/policies/policy-catalog.js` contains the public-facing draft copy. Each article exposes its purpose, version `1.0-draft`, proposed date 14/10/2026 and effective-date state `Chưa có hiệu lực — chờ người có thẩm quyền phê duyệt`. The date is not an effective date. A version URL identifies the selected content; this initial catalog has no historical versions to link.

The public index supports title/body-keyword search. Article routes are guest-safe React Router elements exported by `publicPolicyRouteElements`; P34 still needs to add them to `AppRoutes` before the wildcard. Registration consent links to fixed Terms, Privacy and OTP version URLs. Booking, account and sitter application pages are not present in the `origin/develop` baseline, so their `PolicyContextLinks` integration remains open for the relevant page owners/P34.

Content is static synthetic draft data. P17 policy management, P01 schema/DTO/API and P34 route/application integration are not implemented by this work. Do not treat this catalog or its UI tests as proof of current Admin-managed policy, legal approval, provider delivery, payment, authorization or end-to-end behavior.

## Article coverage and source status

| Slug | Purpose | Content/source basis | Publication gate |
| --- | --- | --- | --- |
| `terms` | Explain service scope, parties and booking state | P45 scope; domain ownership / booking / offer flow contracts | Legal and operational approval; no current app service scope is wired |
| `privacy` | Describe account/contact, address, pet and care-data boundaries | P07 registration, P27 care evidence and P45; do not invent retention/legal basis | Privacy owner must confirm legal basis, retention, recipient and data-rights channel |
| `contact-verification` | Explain OTP and contact-channel behavior | P07 UI contract: 6 digits, 5 minutes, at most 5 requests/hour, at least 60 seconds between requests; P11/P12 provider adapters | Provider delivery and active rate-limit configuration need real integration evidence |
| `service-areas` | Explain how to confirm a supported address | P17 service/system settings responsibility | Area list and boundaries are not configured; no coverage claim is published |
| `booking` | Explain requested visit, offer acceptance and assignment states | P01/P19/P21/P24/P42 contracts | P34 must wire booking/dispatch screens and live state |
| `payments` | Explain single-visit postpay and multi-visit prepay | P51 v1.0 EXT-01/02 and FIN-01 | Provider and booking integrations are pending; no prices or timelines are invented |
| `cancellations-refunds` | Explain self-cancel cutoff, eligible retention and unresolved reschedule/refund details | P51 v1.0 EXT-03/04/05, FIN-02/03/04/06 | Reschedule cutoff, allocation/rounding and refund cause/timeline remain open; do not calculate a live refund |
| `care-evidence` | Explain check-in/out photos, checklist and privacy boundary | P27 and P26 scope | P27 API/RBAC and actual upload/evidence behavior need integration checks |
| `safety-complaints` | Explain safe reporting without promising a response SLA | P29, P30 and P47 scope | Support channel, response deadline, complaint visibility and outcome governance are not configured |
| `sitter-onboarding` | Explain application and 30-day reapplication after rejection | P16 and P46 lifecycle/verification scope | Applicant status verification and real application links need P46/P34 integration |
| `settlement-and-ratings` | Explain the weekly request cap and rating boundaries | P51 v1.0 EXT-06 / P41; P30/P47 review scope | Earnings eligibility/holds, rating deadlines, display/moderation and transfer timelines remain open |
| `pwa` | Explain install/update/offline safety boundaries | P43 PWA scope | Installation, updates, push and actual cache behavior have not been verified |

## Confirmed operational wording

- Customer and sitter self-cancel only when server time is at least 60 minutes before the visit; 60:00 is allowed and 59:59 is not. This cutoff does not set a reschedule deadline.
- A validly cancelled single postpay visit has no cancellation charge. For a paid multi-visit booking cancelled without rescheduling, the confirmed rule retains 30% of the eligible cancelled portion based on actual paid allocation. The rounding/allocation details still gate live calculation; completed visits are excluded.
- If sitter/operator failure means service was not delivered, do not apply the Customer-cause 30% retention. Exact cause taxonomy and remedy/refund timing remain open.
- A sitter may submit at most one settlement request in each Monday–Sunday calendar week in Vietnam time. Eligibility, holds, review timing and transfer arrival are not promised here.
- For a directed-sitter proposal, Customer confirmation precedes sending an offer; the sitter must still accept the offer. Payment and assignment are separate states.

## Visual and technical handoff

- UI status: PROVISIONAL. P04 token and native-control contracts are reused; no P45 Figma frame was supplied or inspected. Do not claim pixel match.
- Route/link integration status: INTEGRATION_PENDING until P34 registers public route elements before its wildcard and the relevant booking/account/application owners add context links.
- Policy source/API status: INTEGRATION_PENDING until P01 DTO/API and P17 policy management are integrated. Do not promote the static draft catalog to an effective policy.
- Provider/payment/PWA status: pending their existing module contracts; this UI has no provider calls.
- Checks are recorded in the session handoff/PR after running the configured frontend test, lint and build commands on the affected branch.
