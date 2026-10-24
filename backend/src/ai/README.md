# Paw World Care AI

- `pricing.js`: versioned approved price/surcharge engine; integer VND, explainable lines, no money movement.
- `scoring.js`: five normalized interpretable dimensions; `scheduling.js`: same-day insertion feasibility and travel/capacity/break limits.
- `routing.js`: trusted OSRM table provider, bounded calls, asymmetric null-preserving matrix cache.
- `models.js` / `repository.js`: Mongoose data and bounded ownership-filtered database reads/aggregation.
- `service.js`: quote/shortlist orchestration, immutable expiring decision snapshots and safe projection.
- `management.js`: validated Admin imports, policies and Customer pet/address inputs.
- `controller.js` / `routes.js`: envelope/error mapping and cookie/role/CSRF-protected API.
- `train_model.py`: de-identified chronological grouped training, positive additive model and holdout MAE baseline; no dependencies/pickle or production fake labels.

See [API, data initialization and test guide](../../../doc/api/ai-pricing-matching-v1.md). Everything remains within the existing Express runtime; no second Python server is needed for inference. Price is governed by policy, not a learned regressor. The optional learned ranking model changes explained weights only after Admin approval; no model has been trained on real customer data yet.
