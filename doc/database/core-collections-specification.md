# Core MongoDB Collections — Initial Specification

**Status:** Draft — fields confirmed 2026-10-09.
**Collections:** `customers`, `pet_sitters`, `roles`, `pets`
**Database:** Paw World Care development database.

MongoDB stores documents in collections (not relational tables). The Customer fields below follow UC-01 and its Technical Specification. Pet Sitter, Role, and Pet fields are proposed starting points; confirm them with the team before treating as final.

## 1. Relationships

```text
roles (1) ──────< customers
roles (1) ──────< pet_sitters
customers (1) ──< pets
```

- `customers.roleId` references a document in `roles` whose code is `CUSTOMER`.
- `pet_sitters.roleId` references a document in `roles` whose code is `PET_SITTER`.
- `pets.customerId` references the customer who owns the pet.
- MongoDB JSON Schema validates field types and required values. It does not enforce these references; validate references in backend services.
- Do not accept a role ID from an unauthenticated registration request. The backend assigns the `CUSTOMER` role.

---

## 2. `roles`

Purpose: store the role records referenced by Customer and Pet Sitter profiles. Initial seed records are `CUSTOMER` and `PET_SITTER`. Add other roles such as `ADMIN` only when the team confirms them.

### Fields

| Field | Type | Required | Ghi chú |
| --- | --- | --- | --- |
| `_id` | ObjectId | auto | |
| `code` | string | ✅ | Giá trị định danh: `CUSTOMER`, `PET_SITTER`, ... |
| `name` | string | ✅ | Tên hiển thị của role |
| `isActive` | boolean | ✅ | Bật/tắt role |

### Document shape

```json
{
  "_id": "ObjectId",
  "code": "CUSTOMER",
  "name": "Customer",
  "isActive": true
}
```

### MongoDB Compass validation

```json
{
  "$jsonSchema": {
    "bsonType": "object",
    "required": ["code", "name", "isActive"],
    "properties": {
      "_id":      { "bsonType": "objectId" },
      "code":     { "bsonType": "string", "minLength": 1, "maxLength": 50 },
      "name":     { "bsonType": "string", "minLength": 1, "maxLength": 50 },
      "isActive": { "bsonType": "bool" }
    }
  }
}
```

> **Note on `code` validation:** Validator accepts any non-empty string instead of hard-coding an `enum`, so adding a new role does not require a DDL change. The application layer enforces approved values. If the team prefers strict DB-level enforcement, change the `code` property to `"enum": ["CUSTOMER", "PET_SITTER"]`.

### Indexes and seed data

- Unique ascending index on `code`.
- Insert one document per approved role. A `CUSTOMER` role is required for UC-01.

---

## 3. `customers`

Purpose: active Customer accounts. Do not create a Customer during the pending OTP stage; create it only after successful verification per UC-01. No password is stored.

> **Note on registration collections:** UC-01 requires additional operational collections (`pending_registrations`, `contact_verification_states`, `registration_otps`, `registration_events`, `registration_ip_rate_limits`) defined in the UC-01 Technical Specification. Those are not included here; they belong to the registration flow, not the core entity model.

### Fields

| Field | Type | Required | Ghi chú |
| --- | --- | --- | --- |
| `_id` | ObjectId | auto | |
| `fullName` | string | ✅ | Trim, 2–100 ký tự, Unicode |
| `email` | string / null | one of | Lowercase; unique khi là string |
| `phone` | string / null | one of | Vietnam E.164 `+84XXXXXXXXX`; unique khi là string |
| `emailVerifiedAt` | Date / null | one of | Set khi email được dùng để đăng ký |
| `phoneVerifiedAt` | Date / null | one of | Set khi phone được dùng để đăng ký |
| `roleId` | ObjectId → roles | ✅ | Luôn = ObjectId của role `CUSTOMER` |
| `status` | enum | ✅ | `ACTIVE` / `DISABLED` |
| `avatarUrl` | string / null | — | URL ảnh đại diện |
| `address` | string / null | — | Địa chỉ — dùng cho dịch vụ đến tận nơi |
| `district` | string / null | — | Quận/huyện — dùng để tìm pet sitter gần nhà |
| `city` | string / null | — | Thành phố |
| `createdAt` | Date | ✅ | |
| `updatedAt` | Date | ✅ | |

### Document shape

```json
{
  "_id": "ObjectId",
  "fullName": "Nguyễn Văn A",
  "email": "a@example.com",
  "phone": null,
  "emailVerifiedAt": "Date",
  "phoneVerifiedAt": null,
  "roleId": "ObjectId",
  "status": "ACTIVE",
  "avatarUrl": null,
  "address": null,
  "district": null,
  "city": null,
  "createdAt": "Date",
  "updatedAt": "Date"
}
```

Exactly one of `email` or `phone` is present. Email is lowercased. Phone is stored in Vietnam E.164 format. The selected contact's verification timestamp is set on account creation; the other is `null`.

### MongoDB Compass validation

```json
{
  "$jsonSchema": {
    "bsonType": "object",
    "required": ["fullName", "roleId", "status", "createdAt", "updatedAt"],
    "oneOf": [
      {
        "required": ["email", "emailVerifiedAt"],
        "properties": {
          "phone":           { "bsonType": "null" },
          "phoneVerifiedAt": { "bsonType": "null" }
        }
      },
      {
        "required": ["phone", "phoneVerifiedAt"],
        "properties": {
          "email":           { "bsonType": "null" },
          "emailVerifiedAt": { "bsonType": "null" }
        }
      }
    ],
    "properties": {
      "_id":             { "bsonType": "objectId" },
      "fullName":        { "bsonType": "string", "minLength": 2, "maxLength": 100 },
      "email":           { "bsonType": ["string", "null"], "maxLength": 254 },
      "phone":           { "bsonType": ["string", "null"], "pattern": "^\\+84[0-9]{9}$" },
      "emailVerifiedAt": { "bsonType": ["date", "null"] },
      "phoneVerifiedAt": { "bsonType": ["date", "null"] },
      "roleId":          { "bsonType": "objectId" },
      "status":          { "bsonType": "string", "enum": ["ACTIVE", "DISABLED"] },
      "avatarUrl":       { "bsonType": ["string", "null"], "maxLength": 2048 },
      "address":         { "bsonType": ["string", "null"], "maxLength": 500 },
      "district":        { "bsonType": ["string", "null"], "maxLength": 100 },
      "city":            { "bsonType": ["string", "null"], "maxLength": 100 },
      "createdAt":       { "bsonType": "date" },
      "updatedAt":       { "bsonType": "date" }
    }
  }
}
```

> **`oneOf` behavior:** Enforces exactly one contact branch. Each branch explicitly sets the unused contact and its verification timestamp to `null`, preventing both from being set simultaneously. Verify behavior against the MongoDB server version in use; the backend must also enforce this rule in application logic.
>
> **Phone regex:** `^\\+84[0-9]{9}$` is a coarse guard for Vietnam E.164 mobile numbers (`+84` + 9 digits). Confirm with the chosen normalization library before finalizing.

### Indexes

- Unique partial ascending index on `email` where `email` is a string (not null).
- Unique partial ascending index on `phone` where `phone` is a string (not null).
- Ascending index on `roleId`.

> **Cross-collection uniqueness:** These indexes enforce uniqueness only within `customers`. If `pet_sitters` shares the same email/phone namespace, the team must decide on a shared identity collection or coordinated service-layer check (see Section 7).

---

## 4. `pet_sitters`

Purpose: Pet Sitter profile records. Preliminary schema — not a finalized onboarding or authentication model. Do not store credentials here unless a separate authentication design is approved.

### Fields

| Field | Type | Required | Ghi chú |
| --- | --- | --- | --- |
| `_id` | ObjectId | auto | |
| `fullName` | string | ✅ | |
| `email` | string / null | — | |
| `phone` | string / null | — | Vietnam E.164 |
| `roleId` | ObjectId → roles | ✅ | Luôn = ObjectId của role `PET_SITTER` |
| `status` | enum | ✅ | `ACTIVE` / `INACTIVE` / `SUSPENDED` |
| `avatarUrl` | string / null | — | Ảnh đại diện |
| `bio` | string / null | — | Giới thiệu bản thân |
| `experienceYears` | number / null | — | Số năm kinh nghiệm |
| `serviceTypes` | string[] | — | VD: `BOARDING`, `WALKING`, `GROOMING`, `DAY_CARE` |
| `acceptedSpecies` | string[] | — | VD: `DOG`, `CAT` |
| `maxPets` | number / null | — | Số thú cưng tối đa nhận cùng lúc |
| `pricePerDay` | number / null | — | Giá cơ bản / ngày (VND) |
| `address` | string / null | — | Địa chỉ cung cấp dịch vụ |
| `district` | string / null | — | Quận/huyện |
| `city` | string / null | — | Thành phố |
| `rating` | number / null | — | Điểm trung bình (0–5); tính từ reviews |
| `reviewCount` | number | — | Tổng số lượt đánh giá; mặc định `0` |
| `verificationStatus` | enum / null | — | `UNVERIFIED` / `PENDING` / `VERIFIED` |
| `certificates` | string[] | — | URL ảnh chứng chỉ |
| `photoUrls` | string[] | — | Ảnh không gian chăm sóc, tối đa 10 ảnh |
| `createdAt` | Date | ✅ | |
| `updatedAt` | Date | ✅ | |

### Document shape

```json
{
  "_id": "ObjectId",
  "fullName": "Trần Thị Mai",
  "email": "mai@example.com",
  "phone": "+84901234567",
  "roleId": "ObjectId",
  "status": "ACTIVE",
  "avatarUrl": null,
  "bio": null,
  "experienceYears": null,
  "serviceTypes": [],
  "acceptedSpecies": [],
  "maxPets": null,
  "pricePerDay": null,
  "address": null,
  "district": null,
  "city": null,
  "rating": null,
  "reviewCount": 0,
  "verificationStatus": "UNVERIFIED",
  "certificates": [],
  "photoUrls": [],
  "createdAt": "Date",
  "updatedAt": "Date"
}
```

> **Contact enforcement:** Unlike `customers`, this schema does not enforce exactly-one-contact because Pet Sitter onboarding requirements are not yet defined. A Pet Sitter profile may carry both or neither contact field until the team confirms the onboarding model.

### MongoDB Compass validation

```json
{
  "$jsonSchema": {
    "bsonType": "object",
    "required": ["fullName", "roleId", "status", "createdAt", "updatedAt"],
    "properties": {
      "_id":                { "bsonType": "objectId" },
      "fullName":           { "bsonType": "string", "minLength": 2, "maxLength": 100 },
      "email":              { "bsonType": ["string", "null"], "maxLength": 254 },
      "phone":              { "bsonType": ["string", "null"], "pattern": "^\\+84[0-9]{9}$" },
      "roleId":             { "bsonType": "objectId" },
      "status":             { "bsonType": "string", "enum": ["ACTIVE", "INACTIVE", "SUSPENDED"] },
      "avatarUrl":          { "bsonType": ["string", "null"], "maxLength": 2048 },
      "bio":                { "bsonType": ["string", "null"], "maxLength": 1000 },
      "experienceYears":    { "bsonType": ["int", "null"], "minimum": 0 },
      "serviceTypes":       { "bsonType": "array", "items": { "bsonType": "string" } },
      "acceptedSpecies":    { "bsonType": "array", "items": { "bsonType": "string" } },
      "maxPets":            { "bsonType": ["int", "null"], "minimum": 1 },
      "pricePerDay":        { "bsonType": ["double", "int", "decimal", "null"], "minimum": 0 },
      "address":            { "bsonType": ["string", "null"], "maxLength": 500 },
      "district":           { "bsonType": ["string", "null"], "maxLength": 100 },
      "city":               { "bsonType": ["string", "null"], "maxLength": 100 },
      "rating":             { "bsonType": ["double", "null"], "minimum": 0, "maximum": 5 },
      "reviewCount":        { "bsonType": "int", "minimum": 0 },
      "verificationStatus": { "bsonType": ["string", "null"], "enum": ["UNVERIFIED", "PENDING", "VERIFIED", null] },
      "certificates":       { "bsonType": "array", "items": { "bsonType": "string", "maxLength": 2048 } },
      "photoUrls":          { "bsonType": "array", "maxItems": 10, "items": { "bsonType": "string", "maxLength": 2048 } },
      "createdAt":          { "bsonType": "date" },
      "updatedAt":          { "bsonType": "date" }
    }
  }
}
```

### Indexes

- Ascending index on `roleId`.
- Ascending index on `{ district: 1, city: 1, status: 1 }` for location-based search.
- Add unique email/phone indexes only after the team confirms whether Pet Sitter contacts share the same system-wide uniqueness rule as Customer contacts.

---

## 5. `pets`

Purpose: pet profiles owned by a Customer. Fields below are confirmed as of 2026-10-09; confirm species, health information, and photo storage requirements with the product team before expanding.

### Fields

| Field | Type | Required | Ghi chú |
| --- | --- | --- | --- |
| `_id` | ObjectId | auto | |
| `customerId` | ObjectId → customers | ✅ | Chủ nuôi |
| `name` | string | ✅ | Tên thú cưng |
| `species` | enum | ✅ | `DOG` / `CAT` (mở rộng khi team confirm) |
| `breed` | string / null | — | Giống |
| `sex` | enum / null | — | `MALE` / `FEMALE` / `UNKNOWN` |
| `dateOfBirth` | Date / null | — | Ngày sinh |
| `weightKg` | number / null | — | Cân nặng (kg) |
| `color` | string / null | — | Màu lông / đặc điểm nhận dạng |
| `neutered` | boolean / null | — | Đã triệt sản chưa |
| `vaccinationStatus` | enum / null | — | `UP_TO_DATE` / `OVERDUE` / `UNKNOWN` |
| `allergies` | string / null | — | Dị ứng thức ăn hoặc thuốc — pet sitter cần biết |
| `medicalConditions` | string / null | — | Bệnh lý mãn tính |
| `feedingInstructions` | string / null | — | Hướng dẫn cho ăn |
| `behaviorNotes` | string / null | — | Tính cách, chú ý khi chăm sóc |
| `photoUrls` | string[] | — | Tối đa 10 ảnh |
| `notes` | string / null | — | Ghi chú tổng hợp |
| `status` | enum | ✅ | `ACTIVE` / `ARCHIVED` |
| `createdAt` | Date | ✅ | |
| `updatedAt` | Date | ✅ | |

### Document shape

```json
{
  "_id": "ObjectId",
  "customerId": "ObjectId",
  "name": "Milo",
  "species": "DOG",
  "breed": "Mixed",
  "sex": "MALE",
  "dateOfBirth": "Date",
  "weightKg": 8.5,
  "color": "Vàng, có đốm trắng ở ngực",
  "neutered": true,
  "vaccinationStatus": "UP_TO_DATE",
  "allergies": null,
  "medicalConditions": null,
  "feedingInstructions": "2 bữa/ngày, 100g thức ăn khô mỗi bữa",
  "behaviorNotes": "Thân thiện, sợ tiếng động lớn",
  "photoUrls": [],
  "notes": null,
  "status": "ACTIVE",
  "createdAt": "Date",
  "updatedAt": "Date"
}
```

### MongoDB Compass validation

```json
{
  "$jsonSchema": {
    "bsonType": "object",
    "required": ["customerId", "name", "species", "status", "createdAt", "updatedAt"],
    "properties": {
      "_id":                { "bsonType": "objectId" },
      "customerId":         { "bsonType": "objectId" },
      "name":               { "bsonType": "string", "minLength": 1, "maxLength": 100 },
      "species":            { "bsonType": "string", "enum": ["DOG", "CAT"] },
      "breed":              { "bsonType": ["string", "null"], "maxLength": 100 },
      "sex":                { "bsonType": ["string", "null"], "enum": ["MALE", "FEMALE", "UNKNOWN", null] },
      "dateOfBirth":        { "bsonType": ["date", "null"] },
      "weightKg":           { "bsonType": ["double", "int", "decimal", "null"], "minimum": 0 },
      "color":              { "bsonType": ["string", "null"], "maxLength": 200 },
      "neutered":           { "bsonType": ["bool", "null"] },
      "vaccinationStatus":  { "bsonType": ["string", "null"], "enum": ["UP_TO_DATE", "OVERDUE", "UNKNOWN", null] },
      "allergies":          { "bsonType": ["string", "null"], "maxLength": 500 },
      "medicalConditions":  { "bsonType": ["string", "null"], "maxLength": 500 },
      "feedingInstructions":{ "bsonType": ["string", "null"], "maxLength": 500 },
      "behaviorNotes":      { "bsonType": ["string", "null"], "maxLength": 500 },
      "photoUrls": {
        "bsonType": "array",
        "maxItems": 10,
        "items": { "bsonType": "string", "maxLength": 2048 }
      },
      "notes":    { "bsonType": ["string", "null"], "maxLength": 2000 },
      "status":   { "bsonType": "string", "enum": ["ACTIVE", "ARCHIVED"] },
      "createdAt":{ "bsonType": "date" },
      "updatedAt":{ "bsonType": "date" }
    }
  }
}
```

> **`sex` với `null` trong enum:** `UNKNOWN` dùng khi giới tính không xác định được (thú cưng còn nhỏ). `null` dùng khi chưa nhập thông tin. Chọn một convention nhất quán trong toàn bộ ứng dụng.
>
> **`photoUrls` limits:** `maxItems: 10` và `maxLength: 2048` per URL là guard tạm thời. Confirm số ảnh tối đa và format URL (CDN path vs. full URL) với product team.

### Indexes

- Ascending compound index on `{ customerId: 1, status: 1 }` for listing a Customer's active pets.
- Do not make pet names unique; one Customer may have multiple pets with the same name.

---

## 6. Compass Setup Order

1. Select/create the development database in MongoDB Compass.
2. Create `roles` first → apply validator → create unique `code` index → insert approved role documents.
3. Create `customers`, `pet_sitters`, and `pets` → apply each validator → create indexes.
4. When entering references manually in Compass, use BSON `ObjectId` values that already exist in the referenced collection. JSON Schema does not verify that referenced documents exist.
5. Set validation action to `error` for development once sample documents match the schema.

---

## 7. Decisions Still Needed

- Confirm whether `pet_sitters` are separate accounts or profiles tied to a shared identity collection. This draft does not include a generic `users` collection.
- Confirm whether Customer and Pet Sitter contacts must be unique across both collections. Per-collection indexes cannot enforce cross-collection uniqueness alone.
- Confirm whether roles need permissions/scopes. `ADMIN` is intentionally not seeded by this draft.
- Confirm Pet Sitter onboarding/status rules, contact requirements, `serviceTypes` and `acceptedSpecies` enum values, and pricing model.
- Confirm Pet profile: accepted species beyond `DOG`/`CAT`, maximum photo count, and whether health fields (`allergies`, `medicalConditions`, etc.) belong here or in a separate `pet_health_records` collection.
- Confirm whether nullable fields should be omitted or stored as `null`; use one convention consistently across the application and Mongoose schemas.
- Confirm the exact Vietnam phone length/prefix rules with the chosen normalization library; `^\\+84[0-9]{9}$` is a starting guard only.
