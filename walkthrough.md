# Security Summary

**Reviewed Files:** `firestore.rules`, `security_spec.md`, `firebase-blueprint.json`, `server.ts`, `src/hooks/useFalteiStore.ts`, `src/utils/backup.ts`, `src/utils/disciplinaKey.ts`, `src/data/seed2026_2.ts`, `eslint.config.js`

**Issues Resolved:** 10 Firestore rule and client/backend hardening fixes applied and deployed (`npx eslint firestore.rules` clean, `deploy_firebase` verified).

### Issues Resolved

| Area | Issue Found | Fix Applied |
| :--- | :--- | :--- |
| Document ID validation (`firestore.rules`) | `isValidId` allowed dot-only segments (`"."`, `".."`) inside `[a-zA-Z0-9._-]+`. | Rejected `id in ['.', '..']` in `isValidId` across all document and field ID checks. |
| Time format validation (`firestore.rules`, `src/hooks/useFalteiStore.ts`, `src/utils/backup.ts`) | `isValidTimeStr` and client regexes accepted invalid hours/minutes like `"29:99"` (`^\d{2}:\d{2}$`). | Tightened time validation to strict 24-hour `HH:MM` (`^([01]\d|2[0-3]):[0-5]\d$`) and normalized client schedule/notification writes via `normalizeTime24h` and `sanitizeHorariosList`. |
| Nested array shape checks (`firestore.rules`) | `feriados`, `horarios`, and `blocosAula` only checked array length without verifying element structure. | Added `isValidHorarioEntry(h)` for `CatalogoDisciplina.horarios[0]` and `UserMateria.horarios[0]`, structured `{data, nome}` map checks on `SemestreConfig.feriados[0]`, and map type checks on `blocosAula[0]`. |
| User profile email & name integrity (`firestore.rules`, `src/hooks/useFalteiStore.ts`) | `users/{userId}` allowed empty `displayName` or arbitrary `email` strings decoupled from the auth token. | Enforced `displayName.size() >= 1`, bound `create.email` to `request.auth.token.email` (or `''` when null), restricted `update.email` to existing or token email, and guarded empty names in `updateMateria`. |
| Notification config update surface (`firestore.rules`) | `/users/{userId}/config/{configId}` lacked `isValidId(userId)` on write, lacked `affectedKeys().hasOnly(...)` on `update`, and allowed deleting arbitrary `configId`s. | Added `isValidId(userId)`, enforced exact `affectedKeys().hasOnly(...)` allowlist on `update`, and locked `create`, `update`, and `delete` to `configId == 'notificacoes'`. |
| `UserEvento` Master Gate on update & cloud migration (`firestore.rules`, `src/hooks/useFalteiStore.ts`) | `users/{userId}/eventos/{eventoId}` checked parent `materiaId` existence only on `create` (not `update`), and `importPreviewDataToCloud` could spread stale `materiaId` values from removed local subjects. | Enforced `exists`/`existsAfter` parent `materiaId` verification on `eventos` `update` as well as `create`, and stripped stale `materiaId`, `createdAt`, and `updatedAt` before migrating preview events to Firestore. |
| Collective events enrollment & parent gate (`firestore.rules`) | `disciplinas_comunidade/{disciplinaKey}/eventos_coletivos/{eventKey}` allowed any signed-in non-member to create or vote without checking community existence or enrollment, and lacked string item validation on `votosUserIds` and `list` key matching. | Required parent `disciplinas_comunidade/{disciplinaKey}` existence on `create`, restricted `create` and voting `update` to enrolled peers or verified admin, validated `votosUserIds[0] is string`, and enforced `resource.data.disciplinaKey == disciplinaKey` on `list`. |
| Community & consensus decrement guards (`firestore.rules`) | Community counter decrements omitted an explicit `existing().inscritosCount >= 1` floor, and `sem_aula_consenso` vote withdrawal (`-1`) allowed overwriting `ultimoAutorNome`. | Added explicit `existing().inscritosCount >= 1` floor on community leave and locked `ultimoAutorNome` unchanged during `sem_aula_consenso` `-1` updates. |
| Collection `list` query boundaries (`firestore.rules`) | `list` rules on `config`, `catalogo_disciplinas`, `avisos_coletivos`, and `sem_aula_consenso` had looser field assertions than `create`/`update`. | Added `isValidId` and bounded `semestreId.size() <= 32` assertions on `resource.data` in `list` rules without using `get()`/`exists()`. |
| Admin catalog parsing API route (`server.ts`) | `POST /api/gemini/parse-catalog` checked `requireFirebaseAuth` (any signed-in user) instead of restricting to the exclusive verified admin. | Added `requireAdmin` middleware verifying `emailVerified === true` and `email === 'mat.ben.henrique@gmail.com'` (`HTTP 403` otherwise). |

### Safeguards Verified

| Layer | Safeguard Status |
| :--- | :--- |
| Global default deny & tenant isolation (`firestore.rules`) | Root `match /{document=**} { allow read, write: if false; }` present; all `/users/{userId}/*` subcollections enforce `request.auth.uid == userId` (`list` queries bound `resource.data.userId == request.auth.uid`, `/config` `list` disabled). |
| Role escalation & admin locking (`firestore.rules`, `server.ts`) | Users cannot self-assign `role: "admin"` on `create` or modify `role` on `update`; admin requires `email_verified == true` and exact exclusive admin email in both Firestore rules and `server.ts`. |
| Atomic community & consensus counters (`firestore.rules`) | `disciplinas_comunidade`, `avisos_coletivos`, and `sem_aula_consenso` enforce `exists`/`existsAfter` transaction pairs and exact `+1`/`-1` deltas. |
| Backend auth, rate limits & secret isolation (`server.ts`) | All `/api/*` mutation routes verify Firebase ID tokens via `accounts:lookup` (`Authorization: Bearer`), Gemini routes apply a 12 req/h per-UID rate limiter, and `GEMINI_API_KEY` remains strictly server-side. |
| Client XSS & backup sanitization (`src/`, `src/utils/backup.ts`) | Zero `dangerouslySetInnerHTML`, `innerHTML`, `eval`, or `window.open` sinks in `src/`; backup JSON imports enforce size caps, type/enum whitelists, and strict `HH:MM` / `YYYY-MM-DD` validation. |

### Dependency Audit Notes

- Running `bun audit` reported 4 transitive advisory findings: `@grpc/grpc-js` (via `firebase` / `@firebase/firestore`) and `glob`/`minimatch` (via `vite-plugin-pwa`, `eslint`, and `@firebase/eslint-plugin-security-rules`). None of these packages are directly imported by application code, and the lint/build plugins do not run in the production server runtime. Keep `firebase` and build tooling updated as upstream patches become available.

---

## PoC Verification

### 1. Cross-Collection Orphan Reference on `UserEvento` Update (`firestore.rules` + `src/hooks/useFalteiStore.ts`)
- **Attack / Failure Path:** An authenticated user attempts `updateDoc` on `/users/{uid}/eventos/{eventoId}` setting `materiaId: "ghost_materia_999"`, or `importPreviewDataToCloud` migrates a local preview event whose parent local subject was deleted.
- **Expected & Enforced Outcome:**
  1. In `firestore.rules` (`match /users/{userId}/eventos/{eventoId}`, `allow update`), the rule checks `!('materiaId' in incoming()) || exists(/databases/$(database)/documents/users/$(userId)/materias/$(incoming().materiaId)) || existsAfter(...)`. Since `ghost_materia_999` does not exist in `/users/{uid}/materias`, Firestore denies the write with `PERMISSION_DENIED`.
  2. In `src/hooks/useFalteiStore.ts` (`importPreviewDataToCloud`), `materiaId` is destructured out before spreading `cleanEv` so unmapped local `materiaId` values are omitted instead of causing legitimate cloud migrations to fail.

### 2. Un-enrolled Peer Posting or Voting on `eventos_coletivos` (`firestore.rules`)
- **Attack / Failure Path:** Signed-in User B (not enrolled in `/disciplinas_comunidade/med_farmaco/inscritos/{userB}`) calls `setDoc` on `/disciplinas_comunidade/med_farmaco/eventos_coletivos/evt_1` or `updateDoc` to push their UID into `votosUserIds`.
- **Expected & Enforced Outcome:**
  1. Both `allow create` and the voting branch of `allow update` check `isAdmin() || exists(/databases/$(database)/documents/disciplinas_comunidade/$(disciplinaKey)/inscritos/$(request.auth.uid))`, and `allow create` additionally requires `exists(/databases/$(database)/documents/disciplinas_comunidade/$(disciplinaKey))`.
  2. Because User B has no `/inscritos/{userB}` record (and is not `isAdmin()`), Firestore rejects both operations with `PERMISSION_DENIED`.

### 3. Profile Email Spoofing & Empty `displayName` (`firestore.rules`)
- **Attack / Failure Path:** Signed-in User A (`token.email = "aluno@unirio.br"`) sends `setDoc` on `/users/{userA}` with `{ email: "mat.ben.henrique@gmail.com", displayName: "" }` or updates `role: "admin"`.
- **Expected & Enforced Outcome:**
  1. `isValidUserProfile` enforces `data.displayName.size() >= 1`, rejecting empty strings.
  2. `allow create` enforces `incoming().email == request.auth.token.email` and `(incoming().role == 'student' || isAdmin())`.
  3. `allow update` enforces `incoming().role == existing().role` and rejects arbitrary unverified emails, returning `PERMISSION_DENIED`.

### 4. Malformed Time Injection & Shadow Keys on `config/notificacoes` (`firestore.rules` + `src/utils/backup.ts`)
- **Attack / Failure Path:** User A sends `horarioNoturno: "29:99"` or injects `{ extraAdminFlag: true }` via `updateDoc` on `/users/{userA}/config/notificacoes`, or imports a backup JSON containing `"horarioInicio": "99:88"`.
- **Expected & Enforced Outcome:**
  1. `isValidTimeStr` (`^([01]\d|2[0-3]):[0-5]\d$`) rejects `"29:99"` in `firestore.rules`, and `update` enforces `affectedKeys().hasOnly(['ativo', 'horarioNoturno', 'alertasRisco', 'alertasAvaliacao', 'alertasTurma', 'fcmToken', 'ultimoDisparoData', 'updatedAt'])`, rejecting any extra key with `PERMISSION_DENIED`.
  2. `src/utils/backup.ts` (`TIME_HM_RE`) and `src/hooks/useFalteiStore.ts` (`normalizeTime24h`) sanitize malformed time strings before any Firestore write.

### 5. Non-Admin Access to Catalog AI Parser (`server.ts`)
- **Attack / Failure Path:** A regular authenticated student obtains their Firebase ID token and sends `POST /api/gemini/parse-catalog` directly with a PDF payload.
- **Expected & Enforced Outcome:**
  1. `requireFirebaseAuth` verifies the ID token and populates `req.authUser`.
  2. `requireAdmin` verifies `req.authUser?.emailVerified && req.authUser?.email === 'mat.ben.henrique@gmail.com'` and immediately returns `HTTP 403` before invoking `@google/genai`.
