# REST API Reference Documentation

**Base URL**: `https://ais-dev-zxipqzaziekjmsixhnilwx-245311395111.europe-west2.run.app`  
**Authentication**: Session Cookie (`sra_session`) or Bearer Token (`Authorization: Bearer <token>`)  
**Format**: `Content-Type: application/json`

---

## 1. Authentication Endpoints (`/api/auth`)

### 1.1 Register New User
- **Method**: `POST /api/auth/register`
- **Rate Limit**: 30 req/min
- **Request Body**:
```json
{
  "email": "creator@agency.com",
  "password": "StrongPassword2026!",
  "fullName": "Jane Doe"
}
```
- **Response (201 Created)**:
```json
{
  "success": true,
  "user": {
    "id": "usr_94e3a891f7d24ab2",
    "email": "creator@agency.com",
    "fullName": "Jane Doe",
    "role": "user",
    "isEmailVerified": false
  },
  "workspaces": [
    {
      "id": "ws_1a89c02e1b",
      "name": "Jane Doe's Workspace",
      "plan": "free"
    }
  ],
  "token": "d748f93a0b...",
  "message": "Account created successfully."
}
```

### 1.2 User Login
- **Method**: `POST /api/auth/login`
- **Rate Limit**: 30 req/min
- **Request Body**:
```json
{
  "email": "creator@agency.com",
  "password": "StrongPassword2026!"
}
```
- **Response (200 OK)**:
```json
{
  "success": true,
  "user": { "id": "usr_94e3a891f7d24ab2", "email": "creator@agency.com" },
  "token": "d748f93a0b...",
  "workspaces": [...]
}
```

### 1.3 Logout
- **Method**: `POST /api/auth/logout`
- **Headers**: `Authorization: Bearer <token>`
- **Response (200 OK)**:
```json
{ "success": true, "message": "Signed out successfully." }
```

### 1.4 Get Current Profile
- **Method**: `GET /api/auth/me`
- **Headers**: `Authorization: Bearer <token>`
- **Response (200 OK)**:
```json
{
  "success": true,
  "user": { ... },
  "workspaces": [ ... ],
  "activeWorkspace": { ... }
}
```

---

## 2. Multi-Tenant Workspace Endpoints (`/api/saas`)

### 2.1 Fetch Workspace State
- **Method**: `GET /api/saas/state`
- **Headers**:
  - `Authorization: Bearer <token>`
  - `x-workspace-id: ws_1a89c02e1b` (Optional; defaults to primary)
- **Response (200 OK)**:
```json
{
  "success": true,
  "workspaceId": "ws_1a89c02e1b",
  "data": {
    "brands": [],
    "projects": [],
    "accounts": [],
    "videos": [],
    "analytics": [],
    "posts": [],
    "autopilotConfig": { ... }
  }
}
```

### 2.2 Synchronize Workspace State
- **Method**: `POST /api/saas/state`
- **Headers**: `Authorization: Bearer <token>`, `x-workspace-id: <ws_id>`
- **Request Body**:
```json
{
  "data": {
    "posts": [ ... ],
    "videos": [ ... ]
  }
}
```
- **Response (200 OK)**:
```json
{ "success": true, "message": "Workspace state synchronized." }
```

### 2.3 Create Workspace
- **Method**: `POST /api/saas/workspace`
- **Request Body**: `{ "name": "Global Brands Division" }`
- **Response (201 Created)**: Returns created workspace and updated membership list.

---

## 3. Media Pipeline Endpoints (`/api/media`)

### 3.1 Upload Media Asset
- **Method**: `POST /api/media/upload`
- **Headers**: `Authorization: Bearer <token>`, `x-workspace-id: <ws_id>`
- **Request Body**:
```json
{
  "filename": "hook_intro_sample.mp4",
  "mimeType": "video/mp4",
  "dataBase64": "AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDE..."
}
```
- **Response (201 Created)**:
```json
{
  "success": true,
  "asset": {
    "id": "med_8f2941cb-5e04-4b92-91ef-a10c2ec85710",
    "filename": "8f2941cb-5e04-4b92-91ef-a10c2ec85710.mp4",
    "originalName": "hook_intro_sample.mp4",
    "mimeType": "video/mp4",
    "sizeBytes": 2840501,
    "url": "/uploads/8f2941cb-5e04-4b92-91ef-a10c2ec85710.mp4",
    "createdAt": "2026-11-03T08:15:00.000Z"
  }
}
```

### 3.2 List Workspace Assets
- **Method**: `GET /api/media`
- **Headers**: `Authorization: Bearer <token>`
- **Response (200 OK)**: Returns array of `MediaAsset` objects filtered by active workspace.

### 3.3 Delete Media Asset
- **Method**: `DELETE /api/media/:id`
- **Headers**: `Authorization: Bearer <token>`
- **Response (200 OK)**: Unlinks file from disk, removes catalog entry, and logs audit record.

---

## 4. Background Scheduler Endpoints (`/api/scheduler`)

### 4.1 Scheduler Health
- **Method**: `GET /api/scheduler/status`
- **Response (200 OK)**:
```json
{
  "success": true,
  "isRunning": false,
  "lastCycleTimestamp": "2026-11-03T08:22:30.000Z",
  "publishedPostsCounter": 42
}
```

### 4.2 Manual Cycle Trigger
- **Method**: `POST /api/scheduler/run-now`
- **Response (200 OK)**: Executes immediate scan across all tenant workspaces and reports published posts.

---

## 5. System & Health Observability

### 5.1 Health Check
- **Method**: `GET /health` or `GET /api/health`
- **Response (200 OK)**:
```json
{
  "status": "healthy",
  "uptimeSeconds": 3600,
  "environment": "production",
  "process": { "pid": 1284, "nodeVersion": "v22.23.3", "heapUsedMb": 68.42 },
  "database": { "status": "online", "usersCount": 14, "workspacesCount": 16 },
  "scheduler": { "status": "active", "publishedPostsCounter": 42 }
}
```
