# Product photographs

Optimized, local WebP assets for the persisted product catalog. `credits.json`
records the source page, downloaded-file SHA256, converted-file SHA256, author
and license for each downloaded illustration. `credits.html` exposes those credits
from the shop and product detail pages. Inherited owner-provided assets retain
their original provenance. Retail reference photos are identified separately;
no open license or exact SKU/size/ingredient match is asserted for them.

MongoDB `products.photos` stores the asset paths. React renders the API response;
it does not assign photos by product code or use seed records as a runtime fallback.
The reviewed `--backfill-photos` command fills only untouched sample records with
empty photos and leaves Admin photos, stock, prices and holds unchanged.
