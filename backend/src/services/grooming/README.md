# Shop grooming booking services (UC-58)

Customer-side booking of bathing and grooming at the shop. Mounted at `/api/v1/grooming` by `routes/grooming.routes.js` only when `GROOMING_BOOKING_ENABLED=true` (needs authentication and storage from `provisionGroomingStorage`).

| File | Responsibility |
| --- | --- |
| `grooming.service.js` | Customer check and the three reads: options, time slots, final price. |
| `grooming-shop-services.service.js` | Which services are shop services: `presentation.locations` has `FACILITY` and the category is Vệ sinh or Làm đẹp. A service without an active version, published policy, price or `APPROVED` pricing policy is `bookable: false`. |
| `shop-shift-source.service.js` | **Temporary** source of shop shifts (GBR-45). One place decides who is on shift: verified `FULL_TIME` contract, active capability for every chosen service, working hours cover the slot, no day off, no assigned or running home visit. Replace this file when Shift Schedule exists. |
| `grooming-slots.service.js` | One-hour slots for a day. No sitter on shift: not listed. Sitters but not enough free places: `FULL`. Each pet takes one place in every slot it needs; its services run one after another; pets run at the same time. Free places = sitters on shift − `groomingslots.held`. |
| `grooming-pricing.service.js` | Price per pet and service from the `APPROVED` pricing policy by pet size, one pet at a time, no combo, no order-level step and no care traits (surcharges for a different pet are agreed at check-in). Tier discount is rounded down to a whole dong. |
| `grooming-discount-hold.service.js` | GBR-42 block: an overdue bill or too many refusals keeps the tier but gives no discount. Copies the product checkout rule (PR #358); replace it with that module once merged. |
| `grooming-storage.service.js` | Creates the four collections and indexes. Run before enabling the flag. |
| `grooming-demo-seed.service.js` | Demo-only: two full-time shop sitters (`scripts/seeds/grooming-demo.js`, development database only). |

The model is `models/grooming-appointment.model.js`: `groomingappointments` (Grooming Appointment with Grooming Pets embedded), `groomingslots` (places held per slot), `groomingcommands` (idempotency), `groomingcounters` (appointment code). This part only reads them; booking, slot holding and the appointment code come with the next change.

A pet whose bite answer is `YES` is never priced or stored: the API answers `422 GROOMING_PET_REFERRAL_REQUIRED` (MSG63) with the pet and the optional hotline from `GROOMING_SHOP_HOTLINE`.
