# Sitter Management Checks

## Implemented

Admin/Staff now have an operational table, literal name search, status/area/current
contract/public profile/source filters, cursor navigation, source-labelled counts,
period work reports and area distribution. Details contain public profile,
application summary, rating aggregate, capabilities, current contract terms,
registered windows/days off, paged visits and Admin management history.
See [API and permissions](../api/sitter-management.md).

Existing versioned Admin suspension/reinstatement, application review, targeted
public profile review and Staff invitation commands are connected. Invitation
selection cannot override the Customer's directed choice; backend checks remain
authoritative. AI threshold60 is preserved.

## Author Verification

- Full backend119 suites/1023 tests PASS before the final authoritative area-source
  correction; the final directory/employee scheduling subset22 tests PASS afterward.
- Full frontend94 suites/584 tests PASS. Final frontend/backend lint,
  architecture checker and frontend build PASS. The known large bundle warning
  remains; no dependency upgrade was included.
- New Mongo runtime coverage verifies all read route roles/cache headers,
  filtered totals/cursors, actor-bound cursor rejection, real/demo distinction,
  snapshot reports, overlapping/expired contracts, scoped work history,
  exclusion of private fields and published customer ratings only.
- New UI coverage verifies table/filter/pagination/detail navigation,
  profile tabs, Staff restrictions, stable status retry, malformed DTO/pending
  rejection and selected sitter invitation restrictions.
- Actual local sample read projections return42 Demo/0 real sitters. Playwright
  with an injected session/API responses rendered Admin/Staff at1440/390/320,
  reports and24 detail-tab combinations; screenshots inspected, no page overflow
  or JavaScript errors. Mobile schedule table and status dialog were inspected.
  This uses local sample projections and simulated transport/session, not an
  authenticated production browser session or completed real service.

## Acceptance Limits

This module does not create a verified employee, signed legal contract, review,
visit completion, financial assessment or assignment. Demo profiles retain their
labels and lack public login contacts. No real status/role/payment mutation was
performed merely to validate the UI. Real employee acceptance, payment callback,
care completion and GPS acceptance remain separate operational checks.

Final reviewer/CI/main/deployment evidence is recorded in the PR and local
handoff after it happens; this source document does not assert future approval.
