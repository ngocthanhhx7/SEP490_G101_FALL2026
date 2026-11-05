# Payroll components

EmploymentContractEditor prepares an application-scoped encrypted contract through
services/employment-document-api.js. EmploymentContractPrint owns the printable
Vietnamese template; PrintDocument renders only the selected document at print.
AutomaticPayrollForm previews source-derived salary, requiring explicit evidence
for attendance and statutory exceptions. PayrollDetails presents printable
statements; printing never changes payment or signature state. Unknown writes
retain original body/key; no private terms are persisted in browser storage.

Template v2 shows only the approved minimum 40/20 weekly hours and self-registration terms; no weekday/daily-hour inputs. Rendering preserves historical v1 document wording. Minimum-only automatic salary supports full months without invented calendars; exceptions need verified advanced reconciliation.

The contract editor prefers saved terms, then private profile prefill, then safe generic defaults. Admin can edit suggestions; resource refresh does not overwrite mounted uncontrolled inputs. Prefill hints never sign/issue/save by themselves and are not stored in browser storage.

Field validation reports safe field names/reasons only (no entered values). The
editor retains inputs, links errors to their controls and allows a watermarked
DRAFT print for checking; printing never issues, signs or activates a contract.
