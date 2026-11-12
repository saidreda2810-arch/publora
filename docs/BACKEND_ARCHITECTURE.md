# Backend Architecture Blueprint

**Application**: SRA Social Publisher  
**Server Runtime**: Node.js v22 + Express 4.21 + TSX  
**Port**: 3000  
**Protocol**: HTTP/1.1 & HTTP/2 reverse-proxy compatible  

---

## 1. System Topology Overview

```
                      +-----------------------------+
                      |   Client Application (SPA)  |
                      |   React 19 + Tailwind v4    |
                      +--------------+--------------+
                                     |
                                     | HTTPS / JSON
                                     v
+-------------------------------------------------------------------------+
|                              EXPRESS SERVER                             |
|                                                                         |
|  [Middleware Pipeline]                                                  |
|  1. Security Headers (CSP, X-Content-Type, Referrer-Policy)             |
|  2. Body Parsers (express.json, express.urlencoded - 50MB Limit)        |
|  3. Input Sanitizer (Null-byte stripping, format sanitization)          |
|  4. Rate Limiter (Sliding Window per IP for /api/auth)                  |
|  5. Static File Handlers (/uploads, /dist in production)                |
|                                                                         |
|  +--------------------+  +--------------------+  +--------------------+ |
|  |    authRouter      |  |     saasRouter     |  |    mediaRouter     | |
|  |  /api/auth/*       |  |   /api/saas/*      |  |   /api/media/*     | |
|  | - Sign Up / Login  |  | - State Sync       |  | - File Upload      | |
|  | - Passkeys WebAuthn|  | - Workspaces       |  | - MIME Check       | |
|  | - Magic Links      |  | - Team Members     |  | - Disk Storage     | |
|  | - Password Reset   |  | - Subscriptions    |  | - Catalog DB       | |
|  +---------+----------+  +---------+----------+  +---------+----------+ |
|            |                       |                       |            |
|  +---------v----------+  +---------v----------+            |            |
|  |    oauthRouter     |  |  scheduler (Cron)  |            |            |
|  |  /api/oauth/*      |  |  Autonomous Worker |            |            |
|  | - YouTube OAuth    |  | - 30s Loop Worker  |            |            |
|  | - Meta Graph OAuth |  | - Post Transitions |            |            |
|  | - TikTok Login Kit |  | - Autopilot Rules  |            |            |
|  +--------------------+  +--------------------+            |            |
|            |                       |                       |            |
+------------|-----------------------|-----------------------|------------+
             |                       |                       |
             v                       v                       v
+-------------------------------------------------------------------------+
|                           PERSISTENCE LAYER                             |
|                                                                         |
|  - /data/saas_db.json        (Users, Workspaces, Members, State)        |
|  - /data/oauth_store.json    (Encrypted Tokens, Provider Credentials)   |
|  - /data/media_catalog.json  (Media Asset Metadata)                     |
|  - /data/uploads/*           (Persisted Video and Image Assets)         |
+-------------------------------------------------------------------------+
```

---

## 2. Core Modules Description

### 1. `server.ts` — Application Gateway & Entry Point
- Configures global middleware and binds Express to port 3000.
- In development mode, initializes Vite in `middlewareMode: true` for unified single-port local debugging.
- In production mode, serves compiled frontend bundles from `/dist` with SPA fallback.
- Houses `/health`, `/api/health`, and `/api/ai/*` retention optimization endpoints.

### 2. `server/authRouter.ts` — Universal Identity & Access Controller
- **Authentication Routes**:
  - `POST /api/auth/register`: Creates new tenant user, salt, scrypt hash, verification token, and provisions primary workspace.
  - `POST /api/auth/login`: Authenticates credentials with timing-safe hash comparison, writes HttpOnly session cookie, and returns Bearer token.
  - `POST /api/auth/logout`: Revokes active session token from memory and database.
  - `GET /api/auth/me`: Resolves current user profile and lists accessible tenant workspaces.
  - `POST /api/auth/magic-link`: Issues cryptographic one-time login links for passwordless authentication.
  - `POST /api/auth/passkey/register` & `/login`: Implements FIDO2/WebAuthn public key challenge generation and assertion verification.
  - `POST /api/auth/sso/saml`: Enterprise SSO assertion handler for Okta/Azure AD integration.

### 3. `server/saasRouter.ts` — Multi-Tenant Scoping & Workspace Engine
- Enforces `requireAuth` on all subroutes.
- Injects workspace context from the `x-workspace-id` header or user's primary workspace.
- **State Synchronization**:
  - `GET /api/saas/state`: Fetches tenant-isolated collections (posts, analytics, projects, brands, autopilot safeguards).
  - `POST /api/saas/state`: Atomically updates workspace-scoped documents.
- **Team & Subscription Management**:
  - Supports role hierarchy: `owner`, `admin`, `member`.
  - Subscription tiers: `free`, `starter`, `professional`, `enterprise`.
  - Platform administrator bypass: Users with `role: platform_admin` can audit system logs and inspect cross-tenant performance.

### 4. `server/mediaRouter.ts` — Media Asset Pipeline
- Saves uploaded videos and thumbnails to disk (`/data/uploads/`).
- Enforces 100MB file limit and MIME validation (`video/mp4`, `video/webm`, `image/png`, `image/jpeg`).
- Sanitizes file paths to prevent directory traversal.
- Manages asset metadata (`/data/media_catalog.json`) tagged by `workspaceId` and `userId`.

### 5. `server/scheduler.ts` — Background Autonomous Publisher
- Executes every 30 seconds via Node.js timer loop.
- Scans all workspace queues for posts whose `scheduledTime <= now`.
- Transitions posts from `scheduled` to `published`.
- Updates corresponding video analytics with realistic velocity metrics.
- Records structured audit trail entries for every autonomous publishing action.

### 6. `server/security.ts` — Defense-in-Depth Middleware
- **Sliding-Window Rate Limiter**: Capped at 30 requests/minute for authentication routes to prevent dictionary attacks.
- **Content-Security-Policy**: Configured with `frame-ancestors 'self' https://*.google.com https://*.googleusercontent.com https://*.aistudio.google.com` to guarantee safe embedding within Google AI Studio.
- **MIME Sniffing Prevention**: Enforces `X-Content-Type-Options: nosniff`.
- **Input Sanitization**: Cleans dangerous null bytes (`\0`) and malicious format codes.

---

## 3. Data Flow: Typical Publishing Lifecycle

1. **User Request**: User creates a video post in React frontend, attaches media file, and sets scheduled time.
2. **Media Pipeline**: Frontend calls `POST /api/media/upload`, storing the video file in `/data/uploads/` and returning `/uploads/<uuid>.mp4`.
3. **State Persist**: Frontend calls `POST /api/saas/state` with the updated post list under their current `workspaceId`.
4. **Autonomous Execution**: Background scheduler loop picks up the post when the scheduled time arrives, transitions status to `published`, and logs audit events.
5. **Analytics Sync**: Scheduler updates engagement records and total autonomous actions counter.

---

## 4. Permanent GOD-Level Owner System & RBAC Governance

### Primary Owner Architecture
- **Primary GOD Owner**: `saidreda2810@gmail.com`
- **Role Tier**: `god` (Hierarchy Score: 100)
- **Database-Level Invariants**:
  - `applyDatabaseInvariants()` runs upon database initialization and mutations, enforcing that `saidreda2810@gmail.com` is perpetually active, verified, and assigned the `god` role.
  - `updateUser()` intercepts all mutations and explicitly throws immutable runtime errors if any attempt is made to alter `saidreda2810@gmail.com`'s role, change their email, or suspend their account.
  - `deleteUser()` explicitly rejects deletion requests targeting the Primary GOD Owner.
  - Role promotion controls: No user other than `saidreda2810@gmail.com` can be assigned the `god` role. Only a `god` user can assign or modify `super_admin` accounts.
  - Self-service account deletion is blocked for the Primary GOD Owner.

### Role Hierarchy Matrix
| Role | Rank Score | Capabilities |
| :--- | :--- | :--- |
| `god` | 100 | Supreme authority, platform maintenance mode, feature flag control, global announcements, session termination, super admin creation |
| `super_admin` | 80 | User management (up to admin), audit log review, tenant inspection, workspace management |
| `admin` | 60 | User suspension, moderation escalation, channel approval |
| `moderator` | 40 | Content review, post moderation, flag resolution |
| `support` | 20 | Ticket support, basic user metadata lookup |
| `user` | 0 | Standard SaaS subscriber with private workspace isolation |

### Strict User Privacy Protection
- **Zero Plaintext Password Exposure**: Password hashes and salts are never accessible to any administrator or API endpoint. `sanitizeUserForClient()` strips `passwordHash`, `salt`, and `mfaSecret` before payload transmission.
- **Tenant Data Isolation**: Administrative overview endpoints provide aggregated usage numbers (active users, total storage, scheduler cycles) without exposing private customer notes, unpublished scripts, or private messages.
- **Impersonation Prevention**: Impersonation routes or tokens are prohibited by architecture design. Authentications require cryptographically verified credentials.

### Emergency Governance Subsystem
- **Maintenance Mode (`SystemSettings.maintenanceMode`)**: When activated, non-administrative access to `/api/saas` and `/api/media` is blocked with HTTP 503, preserving data integrity during critical database upgrades.
- **Broadcast Announcements (`SystemSettings.announcements`)**: GOD and Super Admins can publish dismissible banner notices rendered across all user client sessions.
- **Session Revocation**: Real-time session monitoring with individual and batch revocation capabilities.

