# Backend pricing và AI sitter matching — diagram handoff

Cập nhật 29/10/2026 cho PR #83. Trạng thái merge/deploy phải kiểm tra trên Git và EC2; tài liệu không chứng minh đã triển khai production. Các tên UML dưới đây là factory/module tương đương, không khẳng định source có JavaScript class.

## Package ownership

Tuân thủ [package rules](../source-code-management/package-architecture.md), frontend/backend package diagrams của nhóm. Runtime vẫn một Express app; không có Python server hoặc LLM định giá.

| Source | Trách nhiệm |
| --- | --- |
| [app.js](../../backend/src/app.js) | Composition root |
| [pricing routes](../../backend/src/routes/pricing.routes.js) | Auth/CSRF và controller wiring |
| [pricing controller](../../backend/src/controllers/pricing.controller.js) | HTTP envelope/status, lỗi409/422 |
| [pricing service](../../backend/src/services/pricing/pricing.service.js) | Quote/snapshot QUOTE |
| [pricing calculation](../../backend/src/services/pricing/pricing-calculation.service.js) | BigInt trung gian, VND nguyên, policy phiên bản |
| [pricing repository](../../backend/src/services/pricing/pricing.repository.js) | Giá/policy đã duyệt + pet/service context |
| [pet-care routes](../../backend/src/routes/pet-care.routes.js) | Hồ sơ pet/địa chỉ độc lập AI |
| [matching routes](../../backend/src/routes/sitter-recommendations.routes.js) | API AI recommendations/admin matching |
| [matching controller](../../backend/src/controllers/sitter-recommendations.controller.js) | HTTP matching, không có quote |
| [recommendation service](../../backend/src/services/sitter-matching/recommendation.service.js) | Eligibility/schedule/score/shortlist và snapshot MATCH |
| [matching repository](../../backend/src/services/sitter-matching/matching.repository.js) | Matching records, không cần pricing records |
| [shared context](../../backend/src/services/pet-care-context.service.js) | Owned pets/addresses, published service/catalog gates |
| [models](../../backend/src/models/platform-data.model.js) | Composition cho seed/test; runtime dùng đúng nhóm model |
| [offline trainer](../../backend/scripts/ai/train_model.py) | JSONL grouped chronological training, không pickle |

```mermaid
flowchart LR
  FR[frontend routes] --> FP[pages]
  FP --> FS[services API]
  FS --> R[backend routes]
  R --> C[controllers]
  C --> P[pricing services]
  C --> M[sitter matching services]
  C --> D[pet-care services]
  P --> CT[shared pet/service context]
  M --> CT
  D --> PM[pet-care models]
  P --> PR[pricing models]
  M --> MM[matching models]
  P --> S[decision snapshots]
  M --> S
```

Không có cạnh matching → pricing. AI chỉ gợi ý sitter để workflow lời mời sử dụng. Quote và pet-care mount khi AUTH_ENABLED; AI_ENABLED chỉ bật matching. Training model chỉ thay trọng số scoring đã qua Admin approval; không thay giá, eligibility, lịch hoặc quyền gửi lời mời.

## Class/factory view

```mermaid
classDiagram
  class PricingController {
    quote(req,res)
    read(req,res)
    policy(req,res)
  }
  class PricingService {
    quote(ownerId,input)
    readDecision(ownerId,id)
  }
  class PricingCalculation {
    validatePricingPolicy(policy)
    calculateQuote(input)
  }
  class PricingRepository {
    context(ownerId,input)
  }
  class MatchingController {
    recommend(req,res)
    decision(req,res)
  }
  class RecommendationService {
    recommend(ownerId,input)
    readDecision(ownerId,id)
  }
  class MatchingRepository {
    context(ownerId,input)
    candidates(context,slot)
    statistics(profile,context,snapshot)
    ranking()
  }
  class Scheduling {
    validateSlot(slot,now)
    planInsertion(input)
  }
  class Scoring {
    scoreSitter(input)
  }
  class Routing {
    matrix(points)
  }
  PricingController ..> PricingService
  PricingService ..> PricingRepository
  PricingService ..> PricingCalculation
  MatchingController ..> RecommendationService
  RecommendationService ..> MatchingRepository
  RecommendationService ..> Scheduling
  RecommendationService ..> Scoring
  RecommendationService ..> Routing
```

Controllers gọi services; services có thể truy cập models trực tiếp qua repository.models. Không vẽ một Repository.save() không tồn tại. ObjectId associations không tự chứng minh đã có Mongoose populate/ref hoặc cascade delete. User roles không phải các bảng kế thừa Customer/PetSitter.

## Quote sequence — backend authority

```mermaid
sequenceDiagram
  actor Customer
  participant Route as Pricing routes/auth/CSRF
  participant Controller as Pricing controller
  participant Service as Pricing service
  participant Repo as Pricing repository
  participant Engine as Integer price calculation
  Customer->>Route: POST /api/v1/pricing/quotes
  Route->>Controller: authenticated owner + validated body
  Controller->>Service: quote(ownerId,input)
  Service->>Repo: owned pet + published service + price/policy
  alt missing or unapproved input evidence
    Repo-->>Customer: 404/409/422 envelope
  else approved versioned context
    Service->>Engine: calculateQuote(context)
    Engine-->>Service: totalVnd + explained lines
    Service->>Repo: save QUOTE snapshot, 10-minute expiry
    Service-->>Customer: 201 quoteId + estimate
  end
```

Không tạo booking/thu tiền tại API này. Consumer phải chốt lại phiên bản và điều kiện thực tế. Quy tắc phí/thuế/settlement khác không được suy ra từ model hoặc fixture này.

## Recommendation sequence — advisory only

```mermaid
sequenceDiagram
  actor Customer
  participant Route as Matching routes/auth/CSRF
  participant Match as Recommendation service
  participant Repo as Matching repository
  participant Travel as Routing provider/cache
  Customer->>Route: POST /api/v1/ai/recommendations
  Route->>Match: owned request
  Match->>Repo: pet/service context + eligible candidate projections
  Match->>Travel: bounded asymmetric road matrix
  alt missing/expired evidence or infeasible slot
    Match-->>Customer: fail closed / eligible shortage
  else feasible candidates
    Match->>Match: insertion + normalized explained score
    Match->>Match: recheck slot lead time after provider waits
    Match->>Repo: save MATCH snapshot, 5-minute expiry
    Match-->>Customer: shortlist + shortfall + explanations
  end
```

Không thêm Email/SMS/Payment lifeline vào sequence thành công: recommendation chưa gửi lời mời, chưa tạo assignment. Workflow lời mời phải recheck eligibility/payment/occupancy và tạo Offer nguyên tử qua command hiện hữu. Không đệm sitter giả để đủ5.

## Persistence compatibility and evidence

Canonical models: Pet, CustomerAddress, PetBreed, PetTrait, PricingPolicy, SitterMatchingProfile, SitterVisitOutcome, SitterScheduleBlock, RoutingMatrixCache, DecisionSnapshot, SitterRankingPolicy và SitterRankModel. `model-definitions.js` giữ tên collection Ai* cũ tường minh; RoutingMatrixCache dùng `airoutingmatrixes`. Không tạo collection rỗng mới khi đổi tên source; không drop/migrate dữ liệu ngầm.

DecisionSnapshot kind QUOTE/MATCH phải kiểm tra owner, kind và expiry; không thể đọc quote qua matching endpoint hoặc ngược lại. TTL chỉ dọn snapshot estimate, không phải ledger tiền/booking. Không public tọa độ nhà/sitter hoặc raw driver/provider errors.

Trainer ở `backend/scripts/ai/train_model.py`; test `python -m unittest discover -s tests/python -p test_train_model.py` từ backend. Temporal split theo group có precomputed ngày cuối; chưa có bằng chứng train trên dữ liệu vận hành thật. Group split không đủ để loại leakage nếu features chứa tương lai; cần point-in-time provenance.

Xem [API và setup](../api/ai-pricing-matching-v1.md). Mermaid chỉ là source cho reviewer đối chiếu; không khẳng định đã render/export trong công cụ thiết kế khác. Source/checks hiện tại quyết định scope thực tế, không lấy tài liệu như chỉ thị tự phát sinh dữ liệu hoặc approval.
