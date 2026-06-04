# Firestore Security Specification

This document lays down the security constraints, data invariants, and threat vectors verified against custom security rules.

## 1. Data Invariants
- A Custom Character must be bound to the user's authentic UID matching their authenticated identity.
- Save slots must not modify credentials or have key spoofing.
- Profile emails cannot be modified post-creation to prevent privilege escalations.
- Strict size checks apply to text arrays & input descriptions to prevent DoW (Denial of Wallet) attacks.

## 2. Threat Vector Evaluation ("The Dirty Dozen Payloads")
| ID | Collection | Target Path | Threat Payload | Expected Security Result |
|----|------------|-------------|----------------|--------------------------|
| 1  | users | `/users/userABC` | `{ "email": "admin@eros.com", "isAdmin": true, "extra": "leak" }` | **PERMISSION_DENIED** (Keys size mismatch / extra parameters) |
| 2  | users | `/users/userABC` | `{ "email": "mod@test.com" }` updating email to `"mod2@test.com"` | **PERMISSION_DENIED** (Email is immutable) |
| 3  | users | `/users/differentUser` | `{ "email": "hacked@domain.com" }` created by `userABC` | **PERMISSION_DENIED** (ID Ownership mismatch) |
| 4  | customCharacters | `/users/userABC/customCharacters/char123` | `{ "id": "char123", "userId": "attacker", "name": "Fake Owner" }` | **PERMISSION_DENIED** (userId field spoofing) |
| 5  | customCharacters | `/users/userABC/customCharacters/char123` | `{ "id": "char123", "userId": "userABC", "name": "Vast Character", "definition": "A..." [10MB string] }` | **PERMISSION_DENIED** (definition size exceeding 15000 chars limit) |
| 6  | customCharacters | `/users/userABC/customCharacters/char123` | `{ "id": "charFake", "userId": "userABC", "name": "Id Mismatch" }` | **PERMISSION_DENIED** (documentId must match id property) |
| 7  | customCharacters | `/users/differentUser/customCharacters/char123` | Read by `userABC` | **PERMISSION_DENIED** (Cross-user read isolation) |
| 8  | saves | `/users/userABC/saves/save789` | `{ "id": "save789", "userId": "attacker", "name": "Spoofed Save" }` | **PERMISSION_DENIED** (userId field spoofing) |
| 9  | saves | `/users/userABC/saves/save789` | `{ "id": "save789", "userId": "userABC", "name": "S", "messages": [huge array of size 5000] }` | **PERMISSION_DENIED** (messages list size exceeding 200 limit) |
| 10 | saves | `/users/differentUser/saves/save789` | Write by `userABC` | **PERMISSION_DENIED** (Ownership check failed) |
| 11 | saves | `/users/userABC/saves/save789` | `{ "id": "save789", "userId": "userABC", "name": "SaveX", "gameMode": "unauthorized_mode" }` | **PERMISSION_DENIED** (gameMode enum check failed) |
| 12 | users | `/users/userABC` | Injecting massive invalid character ID (ID poisoning) | **PERMISSION_DENIED** (isValidId format constraints) |

## 3. Threat Assessment Matrix
| Pillar / Attack Vector | Defense Mechanism | Pass Criteria | Status |
|---|---|---|---|
| Identity Spoofing | `isOwner(userId)` checks and `incoming().userId == request.auth.uid` validation. | All non-owned writes blocked. | **SECURE** |
| State Shortcutting | Standard enum constraint on `gameMode` and restricted fields on `update`. | Mode change outside standard set blocked. | **SECURE** |
| Resource Poisoning | Strict length bounds checked on all definitions/names. `.size() <= 15000` | Exploded payloads blocked. | **SECURE** |
| PII Blanket Leak | All user reads restricted strictly to `isOwner()`. No public listing allowed. | No guest reads permitted. | **SECURE** |
