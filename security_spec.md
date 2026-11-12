# Security Specification & Threat Model

## 1. Data Invariants

1. **Identity & Authentication Invariant**:
   - Write operations (`create`, `update`, `delete`) require authenticated sessions (`request.auth != null`) with a verified email address (`request.auth.token.email_verified == true`).
   - The primary GOD Super Administrator email `saidreda2810@gmail.com` possesses verified root governance when authenticated with verified email status.

2. **Master Gate & Ownership Invariant**:
   - A video, schedule, workspace, or automation record can only be created by the owning user (`request.resource.data.userId == request.auth.uid`).
   - Unprivileged users can only read, update, or delete records they own (`resource.data.userId == request.auth.uid`).
   - Document ID path variable `{id}` must strictly adhere to the hardened regex `^[a-zA-Z0-9_\-]+$` and length `<= 128`.

3. **Immutability of Core Fields**:
   - `userId` / `ownerId` and `createdAt` cannot be modified during updates (`request.resource.data.userId == resource.data.userId`).
   - Audit logs in `/audit_logs/{logId}` are strictly append-only; update and delete operations are forbidden for all callers.

4. **Query Enforcer & No Blanket Reads**:
   - `allow list` blocks strictly evaluate `resource.data.userId == request.auth.uid || isGodOwner()`.
   - Never rely on client queries or filters to restrict unauthorized access.

5. **Type Safety & Size Enforcements**:
   - Every string field is checked with `.size()` constraints to defeat Denial-of-Wallet resource exhaustion.

---

## 2. The "Dirty Dozen" Attack Payloads & Test Scenarios

| Test # | Attack Vector | Malicious Payload / Scenario | Expected Result | Enforced Rule Gate |
|---|---|---|---|---|
| **DD-01** | **Unauthenticated Create** | Anonymous POST to `/videos/vid_001` with valid schema | `PERMISSION_DENIED` | `isSignedIn()` |
| **DD-02** | **Unverified Email Write** | Authenticated user with `email_verified: false` creating a schedule | `PERMISSION_DENIED` | `isVerified()` |
| **DD-03** | **Identity Spoofing (Owner Forgery)** | User `user_alice` attempts to write `userId: "user_bob"` on `/videos/vid_002` | `PERMISSION_DENIED` | `request.resource.data.userId == request.auth.uid` |
| **DD-04** | **God Privilege Escalation** | Regular user attempts to set `role: "god"` on `/users/{userId}` | `PERMISSION_DENIED` | `(request.resource.data.role == 'user' \|\| (request.resource.data.role == 'god' && isGodOwner()))` |
| **DD-05** | **Path Variable ID Poisoning** | Injecting a 2KB buffer or special characters into `/videos/../../../etc/passwd` | `PERMISSION_DENIED` | `isValidId(videoId)` regex check |
| **DD-06** | **Shadow / Ghost Field Injection** | Injecting hidden `{ isSuperAdmin: true, bypassRules: 1 }` into payload | `PERMISSION_DENIED` | `request.resource.data.keys().hasOnly([...])` |
| **DD-07** | **Immortality Breach (Owner Theft)** | User attempts to update existing video's `userId` from `user_alice` to `user_hacker` | `PERMISSION_DENIED` | `request.resource.data.userId == resource.data.userId` |
| **DD-08** | **Denial-of-Wallet String Flooding** | Submitting a 500KB string in video `title` (exceeding 255 chars) | `PERMISSION_DENIED` | `request.resource.data.title.size() <= 255` |
| **DD-09** | **Blanket Read / Unauthorized Snooping** | User `user_bob` attempting to get/list `/videos/vid_alice` | `PERMISSION_DENIED` | `resource.data.userId == request.auth.uid \|\| isGodOwner()` |
| **DD-10** | **Audit Log Tampering / Deletion** | Any user or admin attempting to delete or overwrite an `/audit_logs/{id}` record | `PERMISSION_DENIED` | `allow update, delete: if false;` |
| **DD-11** | **Admin Email Spoofing without Verification** | Auth token having email `saidreda2810@gmail.com` but `email_verified: false` | `PERMISSION_DENIED` | `isGodOwner()` requires `email_verified == true` |
| **DD-12** | **Default Deny Fallback** | Attempting read/write to undeclared collection `/secret_internal_config` | `PERMISSION_DENIED` | `match /{document=**} { allow read, write: if false; }` |

---

## 3. Deployment Verification

All 12 security test cases are systematically validated. Any change to rules must preserve all 12 invariants.
