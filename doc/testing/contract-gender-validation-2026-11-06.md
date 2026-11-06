# Contract gender validation

The reported defect is reproducible: the editor used a free-text input and the
API validated gender only as required text. A value such as `Name` could be
saved and printed unchanged. Regression tests failed against that behavior.
The report's screenshot is reference material; its personal data is not copied
into tests or this document.

## Correction

- Replace free text with a required selection: `Nam`, `Nữ`, `Khác`. Start empty
  unless the existing value is supported; never guess a person's gender.
- Validate independently in the backend. New saves normalize case, surrounding
  spaces and Unicode NFC to one canonical label. Unsupported or missing values
  return HTTP 422, `VALIDATION_FAILED`, `error.fields.gender: INVALID_GENDER`.
  Other invalid fields retain their existing validation codes.
- Recheck gender before issuing or confirming signatures on legacy unsigned
  documents. A rejected command must not change state, encrypted terms or hash.
  The editor warns and blocks these actions and the print button until a new
  corrected revision is saved. Revisions preserve the original document.
- Preserve signed/activated historical terms, signatures and hashes. This change
  performs no data migration and cannot establish the correct value for an
  existing real contract. Historical signed documents remain printable as stored.

## Verification scope

Backend regressions cover unsupported types/spelling, canonical labels and
Unicode, authenticated HTTP rejection without creating a document or reserving
the idempotency key, legacy issue/sign rejection and correction by new revision.
Frontend regressions cover required choices, blank legacy invalid values,
preserved entries, field-error focus, blocked unsigned actions and historical
signed print preservation. Fixtures contain synthetic identities only.

Run the configured architecture checker, backend/frontend lint and tests,
frontend build, Python and deployment tests before pushing. Built-browser
checks use intercepted synthetic application/contract APIs at desktop and
mobile widths; they do not attest to real signatures or change production HR
records. Production acceptance additionally checks readiness, deployed source
hashes and the deployed validator using synthetic input without database writes.
