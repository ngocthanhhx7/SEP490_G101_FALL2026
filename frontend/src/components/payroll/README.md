# Payroll components

EmploymentContractEditor prepares an application-scoped encrypted contract through
services/employment-document-api.js. EmploymentContractPrint owns the printable
Vietnamese template; PrintDocument renders only the selected document at print.
AutomaticPayrollForm previews source-derived salary, requiring explicit evidence
for attendance and statutory exceptions. PayrollDetails presents printable
statements; printing never changes payment or signature state. Unknown writes
retain original body/key; no private terms are persisted in browser storage.

Template v2 shows only the approved minimum 40/20 weekly hours and self-registration terms; no weekday/daily-hour inputs. Rendering preserves historical v1 document wording. Minimum-only automatic salary supports full months without invented calendars; exceptions need verified advanced reconciliation.
