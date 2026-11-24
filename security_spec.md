# Security Specification — faltei.

## 1. Data Invariants
1. **Strict Tenant Isolation**: Documents under `/users/{userId}/materias/{materiaId}`, `/users/{userId}/faltas/{faltaId}`, and `/users/{userId}/eventos/{eventoId}` are readable and writable exclusively by the authenticated owner (`request.auth.uid == userId`), or read by a verified administrator for support.
2. **Relational Integrity (Master Gate)**: A `UserFalta` under `/users/{userId}/faltas/{faltaId}` cannot be created unless the parent `UserMateria` referenced by `materiaId` exists at `/users/{userId}/materias/{materiaId}` and the `userId` field matches the path `{userId}`. An optional `materiaId` on `UserEvento` must likewise resolve to an existing parent `UserMateria`.
3. **Role Protection**: Regular users creating `/users/{userId}` are restricted to `role: "student"` unless verified as an administrator (`isAdmin()`). Regular users cannot escalate their own `role` during updates.
4. **Catalog & Semester Governance**: `/config/{configId}` and `/catalogo_disciplinas/{disciplinaId}` require authenticated reads (`request.auth != null`); mutations (`create`, `update`, `delete`) require `isAdmin()` with verified email (`request.auth.token.email_verified == true`).
5. **Temporal & Schema Integrity**: Every create and update enforces strict key allowlists (`hasAll`/`hasOnly` on create, `affectedKeys().hasOnly(...)` on update), bounded string/array sizes (`horarios <= 7`, `blocosAula <= 14`), valid enum values (`tipoFalta in ['dia_completo', 'turno_manha', 'turno_tarde', 'turno_noite', 'parcial']`), bounded hours (`0.5 <= horasAbatidas <= 24`), and server-verified timestamps (`request.time`) on `createdAt`/`updatedAt`.
6. **Collective Discipline Enrollment & Notice Integrity (Bloco 4)**: Enrollment in `/disciplinas_comunidade/{disciplinaKey}` uses atomic `existsAfter`/`!existsAfter` pairs against `/inscritos/{userId}` with strict `+1`/`-1` deltas on `inscritosCount`, keeping `/inscritos` private (`owner`/`admin` only) and `avisos_coletivos` restricted to enrolled peers (`autorUid == request.auth.uid`, `isOficial` admin-only).
7. **Sem Aula Consensus Integrity**: `/sem_aula_consenso/{consensoId}` uses atomic `existsAfter`/`!existsAfter` pairs against `/votos/{userId}` with strict `+1`/`-1` deltas on `votosCount`, preventing counter inflation and keeping per-user votes private (`owner`/`admin` only).
8. **Collective Events Per Discipline**: `/disciplinas_comunidade/{disciplinaKey}/eventos_coletivos/{eventKey}` permits authenticated reads (`isSignedIn()`), and enforces author ownership (`autorUid == request.auth.uid`, immutable `autorUid`/`createdAt`) on create, update, and delete (with admin moderation override).

## 2. The "Dirty Dozen" Adversarial Payloads
1. **Cross-Tenant Read/Write**: User B attempts to read or write `/users/userA/materias/mat1` -> `PERMISSION_DENIED`.
2. **Shadow Field Injection on Materia**: User A creates a `UserMateria` with an extra ghost key `isApprovedByAdmin: true` -> `PERMISSION_DENIED`.
3. **Self-Role Escalation**: Student registers `/users/{uid}` with `role: "admin"` -> `PERMISSION_DENIED`.
4. **Role Escalation via Update**: Student updates `/users/{uid}` changing `role` from `"student"` to `"admin"` -> `PERMISSION_DENIED`.
5. **Email Spoofing Attack on Admin**: Attacker sets email to admin email with `email_verified: false` and tries to overwrite `/config/semestre_atual` -> `PERMISSION_DENIED`.
6. **Orphaned Falta Creation**: User A creates a `UserFalta` referencing a non-existent `materiaId: "ghost_materia"` -> `PERMISSION_DENIED`.
7. **Owner UID Spoofing**: User A creates `/users/userA/faltas/f1` with `userId: "userB"` -> `PERMISSION_DENIED`.
8. **Resource Exhaustion (1.5KB ID)**: Attacker attempts to create a document with `materiaId` of 1500 characters -> `PERMISSION_DENIED`.
9. **Unbounded Array Attack**: Attacker creates a `UserMateria` with 500 items in `horarios` -> `PERMISSION_DENIED`.
10. **Value Poisoning on Update**: User A updates `UserFalta.tipo` to `"hacked_type"` or `horas: 999` -> `PERMISSION_DENIED`.
11. **Timestamp Forgery**: Attacker sends `createdAt` in the past/future instead of `request.time` -> `PERMISSION_DENIED`.
12. **Catalog Tampering & Counter Inflation**: Authenticated student attempts to write `/catalogo_disciplinas/med1`, set `inscritosCount: 999`, or forge `isOficial: true` on `avisos_coletivos` -> `PERMISSION_DENIED`.

