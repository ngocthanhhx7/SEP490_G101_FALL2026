# Public pages

HomePage implements Figma 280:7416 using local exported images/icons and FC DK Cool Crayon, Nunito and the Figma navigation/wordmark fonts. The header and footer use their dedicated supplied frames; the old embedded shopping header is not used.

ServiceListPage reads the `q` query parameter so header search and footer service links share the same Vietnamese search behavior. Only published catalog entries carry real prices and service-detail actions. The empty/error states remain explicit; illustrative care cards do not create unpublished offers.

PublicSiteLayout handles cross-route Home anchors and focus. Newsletter requests use the public same-origin API and never browser storage. Responsive checks cover desktop and 320/390px widths; role dashboards keep their own layout.
