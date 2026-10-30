# Location Search

`location-search.service.js` owns bounded Google geocoding and Vietmap v4 search with
selected-place resolution, not saved customer addresses. Search and route providers are
configured separately; no automatic cross-provider paid fallback is performed.
Address search defaults to Vietmap. Set both `MAPS_SEARCH_PROVIDER` and
`MAPS_ROUTING_PROVIDER` to `vietmap` to use only the Vietmap REST key; Google
credentials/billing are optional and no Google API is called in this configuration.
Suggestions return at most five labels and GeoJSON-order coordinate pairs. They never confirm
an address, infer an operational area, reserve a slot or create an assignment. The existing
pet-care command requires the owner to explicitly confirm the location and choose a supported
work area. Provider errors are sanitized and provider responses are not cached here.

Composition is in `routes/maps.routes.js`; authenticated POST requests require CSRF and are
limited to ten per account per minute per application instance, in addition to the global limit.
Multi-instance deployment needs a shared rate-limit store and provider account quotas.
Server REST keys are never returned to the browser. See the
[Google Maps / Vietmap setup guide](../../../../doc/deployment/google-goong-maps.md).
