# Public pages

HomePage implements Figma 280:7416 using local exported images/icons and FC DK Cool Crayon, Nunito and the Figma navigation/wordmark fonts. The header and footer use their dedicated supplied frames; the old embedded shopping header is not used.

ServiceListPage reads the `q` query parameter so header search and footer service links share the same Vietnamese search behavior. Only published catalog entries carry real prices and service-detail actions. The empty/error states remain explicit; illustrative care cards do not create unpublished offers.

PublicSiteLayout handles cross-route Home anchors and focus. Responsive checks cover desktop and 320/390px widths; role dashboards keep their own layout.

AboutPage adapts Figma 2:2724 to at-home dog/cat care and the current five-member project team, without food-sales, nutrition, donation or partner claims. ContactPage adapts the supplied help/contact references: searchable FAQs, category filters, expandable answers and a consented email form with optional phone. Messages use the same-origin contact API, retain input on failure and confirm only SMTP acceptance. The recipient comes from server configuration; no unrelated reference-brand contact details are copied. No contact data is saved to browser storage.
