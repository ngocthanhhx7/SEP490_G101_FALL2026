# Role workspaces and management analytics

## Scope and references

User references supplied on 2026-10-30 establish the composition: page title and
commands, summary metrics, compact analysis, then a full-width searchable table.
Use the existing PawWorld logo, Nunito, purple ink and yellow primary actions;
neutral workspace surfaces, green/amber/red operational states. Keep headings
compact and reserve Crayon for the public website. One application shell only.

References read on 2026-10-30:

- [Carbon data tables](https://carbondesignsystem.com/components/data-table/usage/):
  toolbar, filtering, sorting, row actions, pagination and progressive disclosure.
- [Carbon notifications](https://carbondesignsystem.com/patterns/notifications/):
  persistent notification centre and contextual feedback.
- [Tabler](https://tabler.io/admin-template): compact navigation, metrics and tables.

## Deliverables

| Area | Summary and analysis | Main workflow |
| --- | --- | --- |
| Admin overview | Visits by day/state; pending applications and unassigned work | Operational table and links to queues |
| Users | Total/active/locked/new accounts; registrations by day and role distribution | Masked contacts, role/state filters, cursor pages, details and lock/unlock with reasons |
| Services and prices | Active/inactive services, configured prices; visits by day/service | One table, create, edit, archive, pricing, combo and policy version dialogs |
| Staff | Visits by day/state, unassigned work and open cases | Dispatch and review queues |
| Sitter | Own assigned visits and pending invitations, own visit trend/status | Work calendar, invitations, payroll |
| Customer | Own care summary and upcoming care | Public brand navigation, bookings, pets, addresses and service discovery |
| Notifications | Server unread count and unread filter | Every role can read its own centre, follow valid links and acknowledge reads |

## Data contracts

- Analysis uses backend aggregates across the selected 7/30/90 Vietnam calendar
  days, independent of the table's pagination. State the period and update time.
- Count only authoritative records. Do not fabricate growth comparisons, revenue,
  online activity, employee performance, completed care or provider acceptance.
- Missing storage is unavailable, distinct from a real zero or an empty result.
- Privacy and role checks apply to every aggregate and command. Customer/Sitter
  reads stay scoped to the session owner. Money uses integer VND.
- Service removal archives a version; historical booking snapshots remain intact.
  Price history remains separate persistence, presented within the service workspace.
- Combo edits create a new policy version, retain all other policy fields, check
  the expected version and require a reason/effective time. Current approved rule:
  1% per service visit, capped at 10%, before surcharges.
- Notifications require persisted domain events and recipient rules. A working
  centre does not establish SMS/email/web-push delivery; report each separately.

## Execution and acceptance

1. Build shared shell, management analytics/visualization, table toolbar/pagination
   and contextual dialogs. Remove embedded Users chrome in composed routes.
2. Add role-scoped aggregate endpoints and unify service/price/discount controls.
3. Connect notification entry points and durable lifecycle events; inspect deep links.
4. Run architecture, lint, affected regression suites and frontend build. Check
   desktop/mobile layout, menu/focus, data races, pagination and auth boundaries.
5. Review final changes with eligible assigned identities, PR into develop, release
   through reviewed main, backup/restore/rollback and production acceptance.

Work starts from develop at 8174c97, which includes the newly merged Customer
runtime PR #101. Existing main checkout edits and environment files are preserved.
This document is a plan; execution evidence is recorded separately.
