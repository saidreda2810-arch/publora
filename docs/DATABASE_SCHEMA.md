# Database Schema & Entity Relational Specification

**Storage Engine**: Multi-Tenant JSON Document Store  
**Primary File**: `/data/saas_db.json`  
**Media Catalog**: `/data/media_catalog.json`  
**OAuth Vault**: `/data/oauth_store.json`  
**Atomic Write Strategy**: Staging file `.tmp.<timestamp>` with OS-level `renameSync` replacement.

---

## 1. Entity Relational Overview

```
 [User] 1 ────────────< [WorkspaceMember] >──────────── 1 [Workspace]
   │                           │                               │
   │ 1                         │                               │ 1
   ├─────< [UserSession]       │                               ├─────< [MediaAsset]
   │                           │                               │
   ├─────< [VerificationToken] │                               ├─────< [AuditLogEntry]
   │                           │                               │
   └───────────────────────────┘                               └───── 1 [WorkspaceDataPayload]
                                                                        ├─ brands[]
                                                                        ├─ projects[]
                                                                        ├─ accounts[]
                                                                        ├─ videos[]
                                                                        ├─ analytics[]
                                                                        ├─ posts[]
                                                                        └─ autopilotConfig
```

---

## 2. Table / Document Schemas

### Table 1: `users`
Stores registered user identities and authentication credentials.

| Field | Type | Modifiers | Description |
| :--- | :--- | :--- | :--- |
| `id` | `string` | PRIMARY KEY | Unique ID with prefix `usr_` (UUID or hex) |
| `email` | `string` | UNIQUE, INDEX | Lowercase trimmed user email address |
| `passwordHash`| `string` | NOT NULL | 128-character hex string from `crypto.scryptSync` (64 bytes) |
| `salt` | `string` | NOT NULL | 32-character hex salt from `crypto.randomBytes(16)` |
| `fullName` | `string` | NOT NULL | Display name of the user |
| `avatarUrl` | `string?` | OPTIONAL | Direct URL to user profile picture or avatar |
| `role` | `enum` | NOT NULL | `'user'` or `'platform_admin'` |
| `isEmailVerified` | `boolean` | DEFAULT false | Flag confirming email verification completion |
| `status` | `enum` | NOT NULL | `'active'` or `'suspended'` |
| `createdAt` | `string` | ISO 8601 | Registration timestamp |
| `lastLoginAt` | `string` | ISO 8601 | Timestamp of most recent successful session issuance |

---

### Table 2: `sessions`
Tracks active user sessions and authentication tokens.

| Field | Type | Modifiers | Description |
| :--- | :--- | :--- | :--- |
| `id` | `string` | PRIMARY KEY | Unique session identifier with prefix `ses_` |
| `userId` | `string` | FOREIGN KEY | References `users.id` |
| `token` | `string` | UNIQUE, INDEX | 96-character cryptographically random hex token |
| `userAgent` | `string?` | OPTIONAL | Browser User-Agent header at login |
| `ip` | `string?` | OPTIONAL | Client IP address at login |
| `createdAt` | `string` | ISO 8601 | Creation timestamp |
| `expiresAt` | `string` | ISO 8601 | Session expiration timestamp (Default: 30 days) |

---

### Table 3: `workspaces`
Defines tenant organizational boundaries, subscription plans, and workspace-level preferences.

| Field | Type | Modifiers | Description |
| :--- | :--- | :--- | :--- |
| `id` | `string` | PRIMARY KEY | Unique workspace identifier with prefix `ws_` |
| `name` | `string` | NOT NULL | Human-readable workspace name (e.g., "Agency Alpha") |
| `slug` | `string` | UNIQUE | URL-safe slug identifier |
| `ownerId` | `string` | FOREIGN KEY | References `users.id` of the creator |
| `plan` | `enum` | NOT NULL | `'free'`, `'starter'`, `'professional'`, `'enterprise'` |
| `billingCycle`| `enum` | NOT NULL | `'monthly'` or `'yearly'` |
| `createdAt` | `string` | ISO 8601 | Workspace provisioning timestamp |
| `settings` | `object` | NOT NULL | Embedded JSON configuration (Timezone, Autopilot mode, etc.) |

---

### Table 4: `workspaceMembers`
Maps multi-tenant access control and roles per workspace.

| Field | Type | Modifiers | Description |
| :--- | :--- | :--- | :--- |
| `id` | `string` | PRIMARY KEY | Identifier with prefix `mem_` |
| `workspaceId` | `string` | FOREIGN KEY | References `workspaces.id` |
| `userId` | `string` | FOREIGN KEY | References `users.id` |
| `role` | `enum` | NOT NULL | `'owner'`, `'admin'`, or `'member'` |
| `joinedAt` | `string` | ISO 8601 | Date user was added or accepted invitation |
| `invitedEmail`| `string?` | OPTIONAL | Email for pending invitations |

---

### Table 5: `media_catalog` (`/data/media_catalog.json`)
Tracks uploaded video and image assets stored on disk.

| Field | Type | Modifiers | Description |
| :--- | :--- | :--- | :--- |
| `id` | `string` | PRIMARY KEY | Asset identifier with prefix `med_` |
| `workspaceId` | `string` | FOREIGN KEY | References `workspaces.id` (Tenancy scope) |
| `userId` | `string` | FOREIGN KEY | References `users.id` (Uploader) |
| `filename` | `string` | NOT NULL | Safe UUID filename stored in `/data/uploads/` |
| `originalName`| `string` | NOT NULL | Sanitized original uploaded filename |
| `mimeType` | `string` | NOT NULL | Whitelisted MIME type (e.g. `video/mp4`) |
| `sizeBytes` | `integer` | NOT NULL | Exact byte length on disk |
| `url` | `string` | NOT NULL | Relative serving path (e.g. `/uploads/<uuid>.mp4`) |
| `createdAt` | `string` | ISO 8601 | Upload timestamp |

---

### Table 6: `workspaceData` (`Record<workspaceId, WorkspaceDataPayload>`)
Key-value tenant store isolating operational records:

- **`brands[]`**: Brand personas, visual guidelines, color palettes, tone of voice.
- **`projects[]`**: Client campaigns, video deliverables, deadlines.
- **`accounts[]`**: Connected social channels, platform IDs, refresh tokens.
- **`videos[]`**: Video repository, hooks, duration, editing pace, tags.
- **`posts[]`**: Scheduled, queued, optimizing, and published posts.
- **`analytics[]`**: Second-by-second retention curve points, view velocity, completion rate.
- **`autopilotConfig`**: Autonomous safeguards, emergency pause switch, blackout hours.
