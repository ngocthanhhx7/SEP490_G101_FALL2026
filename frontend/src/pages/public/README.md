# Public pages

`SignInPage` opens the shared native `Dialog` when login returns
`REGISTRATION_REQUIRED`, before asking for OTP. The popup links to `/register`
and can close to edit the contact. Verification/resend use the same popup if
the verified contact was replaced after the first send.

`ServiceBookingPage.jsx` owns the selected-service flow at `/booking/:serviceId`:
owned pets, confirmed address and per-visit schedule, system dispatch or explicit
employee selection, then a deterministic quote/consent/checkout confirmation.
Directed availability uses the backend's employee eligibility checks for every
visit, and confirmation rechecks them transactionally. Optional MATCH snapshots
prioritize advisory invitations; they never reserve or assign an employee.
Private draft fields stay in memory; uncertain confirmation retains its key/body.
Login uses role-specific workspaces and a validated authorized return path;
Customer defaults to Home. Sitter intake keeps its
verified-account application step. Catalogue and detail booking actions open
the selected-service route, not the login screen.

`SitterApplicationPage` collects Full-time/Part-time preference and previews
selected private images locally through `ApplicationImagePreview`. Blob URLs are
released when files change or the preview unmounts; selecting/viewing a file does
not upload it. Images are limited to JPG/PNG, 5 MB and 4 megapixel. Submission
errors identify the affected field/file and preserve input for correction.

`BookingCheckout.jsx` imports shared component-specific `booking-checkout.css`
so the same controls render in catalog and recommendation flows. Customer
completion ratings remain separate from public profile moderation.

HomePage implements Figma 280:7416 using local exported images/icons and FC DK Cool Crayon, Nunito and the Figma navigation/wordmark fonts. The header and footer use their dedicated supplied frames; the old embedded shopping header is not used.

ServiceListPage reads the `q` query parameter so header search and footer service links share the same Vietnamese search behavior. Only published catalog entries carry real prices and service-detail actions. The empty/error states remain explicit; illustrative care cards do not create unpublished offers.

ServiceListPage and ProductListPage use CatalogLayout with the shared sidebar controls in `styles/catalog-layout.css`: labeled search with keyword clearing, species/category dropdowns and filter reset. Service location and sorting also live in the sidebar. Result totals appear only in the shared bottom pagination. Product filters retain URL state and debounced search; service sorting and filtering reset pagination.

The catalog uses photo cards, price badges, server-owned scope lists and detail links. service-visuals.js gives each of the 13 demo service codes its own local photograph, shared by list cards and detail pages; name/species fallbacks remain for other published services. Photo sources and licenses are recorded in public/assets/services/credits.json and credits.html. Editable prices come from the API. Header label: Dịch vụ. frontend/index.html explicitly selects the PawWorld paw SVG favicon.

`PublicServiceCards` and `service-cards.css` own the shared published-service cards on Home and the catalogue: fixed-ratio photographs, category/species, duration/location, description, server price and detail action. Home uses the full image URL without assuming a Figma asset directory and selects home care, walking and bathing when published. The catalogue also supports resetting filters and sorting by base price or Vietnamese name. Descriptions are shown once; complete scope remains on the detail page.

PublicSiteLayout handles cross-route Home anchors and focus. Responsive checks cover desktop and 320/390px widths; role dashboards keep their own layout.

AboutPage adapts Figma 2:2724 to dog/cat care, the product storefront and the current five-member project team, without nutrition, donation or partner claims. ContactPage adapts the supplied help/contact references: searchable FAQs, category filters, expandable answers and a consented email form with optional phone. Messages use the same-origin contact API, retain input on failure and confirm only SMTP acceptance. The recipient comes from server configuration; no unrelated reference-brand contact details are copied. No contact data is saved to browser storage.

SignInPage adapts Figma 2:5284 to the existing OTP flow. Email and SMS use the session adapter; Vietnamese local phone numbers are normalized to +84 before submission. sign-in.css owns all login styling, while auth-public.css retains registration/application styling. Header/footer remain owned by PublicSiteLayout. The registration link opens /register; social/password sign-in is outside this OTP flow. See [verification](../../../../doc/testing/login-email-sms-refresh.md).

RegistrationPage owns role choice and progression. CustomerRegistrationPage validates account details/consent and sends email OTP directly; SitterApplicationPage opens after the session is re-read and its intake is loaded. Sitter forms use the verified owner email, dedicated applicant-document upload adapter, policy consent and server receipts. The application-status route now uses PublicSiteLayout. See [registration flow](../../../../doc/testing/registration-sitter-flow.md).

Application receipts show the owner's rejection reason and Vietnam-local retry
instant. The refresh action reads the server's canReapply flag before opening a
new form; the device clock cannot bypass the waiting screen. Public OTP status
provides a reapplication link when its server projection permits it.

`ProductListPage.jsx` and `ProductDetailsPage.jsx` are the public shop at `/products` and `/products/:productId`. Filters live in the URL (`q`, `category`, `pet`); only Shown products are returned by the API. A guest pressing "Thêm vào giỏ hàng" is sent to sign-in and returns to the product page. Out-of-stock products lock the button (MSG98). Pressing + when the quantity already equals what can be sold shows MSG58 and the number does not go up (D-219; `QuantityStepper` `onLimit`); the cart still locks + at that quantity. A quantity above what can be sold when adding re-reads the product and shows MSG58 with the current number. Product Details shows the photos through `ProductGallery` (D-249): the large photo with a thumbnail row below it when the product has two or more photos, the single photo alone, or the brand placeholder when it has none. Product List and the cart keep showing the first photo.

The storefront also keeps `page` in the URL and uses server pagination. Home
switches its existing three-card service section to `HomeProductPreview` only
when Products is selected. Shared storefront styling lives in `styles/storefront.css`.
Inherited product images and their source hashes are in `public/assets/products/credits.json`;
no old checkout fees, ratings or sales figures are copied.

Service and product lists share `CatalogLayout`: collapsible filters on the left, results on the right, stacked on mobile. Service filters use published categories/species/locations and base-price sorting; product filters use the API-supported category/pet type and preserve URL pagination/search. Home benefits cover both care and shopping without nutrition or provider promises.

application-status/ApplicantWorkspacePage owns the authenticated application workspace and pending editor; registration routes existing active applicants here. Receipt-code verification is optional collapsed guest fallback, not a second challenge for signed-in owners.

Directed booking automatically opens the service-registered sitter directory, sorted by public Customer rating; newcomers remain visible at the end. Load-more retains prior selections. Sitters failing any visit’s eligibility are visible with disabled radios and a reason. Customers with completed care history use direct selection; recommendations remain available only before their first completed care visit, according to server-owned checkout options.
