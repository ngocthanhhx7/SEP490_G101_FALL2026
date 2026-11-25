# Account pages

Personal account/settings display the single session role. They do not infer a
primary role from multiple memberships or expose role editing to the account owner.

`AccountSettingsPage` displays the signed-in user's own name, roles and masked verified contacts. The name and role are read-only here. Email and phone enrollment use the authenticated, CSRF-protected OTP contact-change flow; a new contact is not shown as verified until the server accepts its code.

The page does not look up an account by ID, expose full contact values or combine accounts. The contact list is part of the authenticated `/me` projection. Live mutation actions stay disabled until the session adapter supplies an in-memory CSRF token.

`AccountPage` shows the signed-in user's name and role. It links to
`/account/profile`, where the shared profile editor handles personal details and
avatar. All signed-in roles can edit their own profile. Managing other users remains in the Admin workspace. See the
[navigation rules](../../../../doc/ui-ux/navigation-notifications-2026-10-30.md).
