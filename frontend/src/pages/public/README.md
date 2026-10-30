# Public pages

HomePage implements Figma 280:7416 using local exported images/icons and FC DK Cool Crayon, Nunito and the Figma navigation/wordmark fonts. The header and footer use their dedicated supplied frames; the old embedded shopping header is not used.

ServiceListPage reads the `q` query parameter so header search and footer service links share the same Vietnamese search behavior. Only published catalog entries carry real prices and service-detail actions. The empty/error states remain explicit; illustrative care cards do not create unpublished offers.

The catalog uses photo cards, price badges, server-owned scope lists and detail links. service-visuals.js maps stable catalog codes to local PawWorld photos, with name/species fallbacks for other services. The current offerings are home-visit, dog-walking and vet-escort; editable prices come from the API. Header label: Dịch vụ. frontend/index.html explicitly selects the PawWorld paw SVG favicon.

PublicSiteLayout handles cross-route Home anchors and focus. Responsive checks cover desktop and 320/390px widths; role dashboards keep their own layout.

AboutPage adapts Figma 2:2724 to at-home dog/cat care and the current five-member project team, without food-sales, nutrition, donation or partner claims. ContactPage adapts the supplied help/contact references: searchable FAQs, category filters, expandable answers and a consented email form with optional phone. Messages use the same-origin contact API, retain input on failure and confirm only SMTP acceptance. The recipient comes from server configuration; no unrelated reference-brand contact details are copied. No contact data is saved to browser storage.

SignInPage adapts Figma 2:5284 to the existing OTP flow. Email and SMS use the session adapter; Vietnamese local phone numbers are normalized to +84 before submission. sign-in.css owns all login styling, while auth-public.css retains registration/application styling. Header/footer remain owned by PublicSiteLayout. The registration link opens /register; social/password sign-in is outside this OTP flow. See [verification](../../../../doc/testing/login-email-sms-refresh.md).

RegistrationPage owns role choice and progression. CustomerRegistrationPage validates account details/consent and sends email OTP directly; SitterApplicationPage opens after the session is re-read and its intake is loaded. Sitter forms use the verified owner email, dedicated applicant-document upload adapter, policy consent and server receipts. The application-status route now uses PublicSiteLayout. See [registration flow](../../../../doc/testing/registration-sitter-flow.md).
