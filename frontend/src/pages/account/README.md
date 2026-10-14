# Account pages

`AccountSettingsPage` displays the signed-in user's own name, roles and masked verified contacts. The name and role are read-only here. Email and phone enrollment use the authenticated, CSRF-protected OTP contact-change flow; a new contact is not shown as verified until the server accepts its code.

The page does not look up an account by ID, expose full contact values or combine accounts. The contact list is part of the authenticated `/me` projection. Live mutation actions stay disabled until the session adapter supplies an in-memory CSRF token.

P34 owns registration of `/account/settings` in the root route table and its account-navigation link. This page is prepared for that integration; route wiring is not included in the WBS-004 feature branch.
