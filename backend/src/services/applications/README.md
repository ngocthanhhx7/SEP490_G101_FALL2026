# Applicant status

`application-status.service.js` validates the narrow status contract. The runtime module at `../../routes/application-status.routes.js` uses indexed application-code digests and the transactional OTP kernel with `APPLICATION_STATUS` scope. General auth endpoints cannot supply that scope.

Secrets are POST bodies only; responses are no-store. Only state, submitted date, rejection reason and the 30-day server deadline are public after OTP verification. No document, internal interview note, contact, user account or session is returned. Unknown codes receive the same challenge shape without sending a message.
