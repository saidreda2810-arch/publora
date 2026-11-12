# Production Environment Variables Reference

This document provides a comprehensive dictionary of all environment variables used by the SRA Social Publisher platform.

---

## Variable Reference Table

| Variable Name | Required | Default Value | Example Value | Description & Security Policy |
| :--- | :--- | :--- | :--- | :--- |
| `PORT` | Optional | `3000` | `3000` | Network port the HTTP server binds to. In Cloud Run or Docker, set by runtime. |
| `NODE_ENV` | Required | `development` | `production` | Execution mode. Controls asset serving, caching, and error stack trace visibility. |
| `APP_URL` | Required | `http://localhost:3000` | `https://ais-dev-...run.app` | Canonical public origin URL used to construct absolute OAuth callback addresses. |
| `SHARED_APP_URL` | Optional | Fallback to `APP_URL` | `https://ais-pre-...run.app` | Secondary or staging URL allowed in OAuth whitelist and CORS configurations. |
| `GEMINI_API_KEY` | Optional | `undefined` | `AIzaSy...` | Google GenAI API key for retention intelligence. Defaults to algorithmic heuristics if unset. |
| `SESSION_SECRET` | Required | Auto-generated | `64-char hex` | Master cryptographic secret used to sign session tokens and cookies. |
| `OAUTH_ENCRYPTION_KEY` | Required | Auto-generated | `32-byte key` | AES-256-GCM symmetric key used to encrypt OAuth refresh tokens at rest in `/data/`. |
| `GOOGLE_CLIENT_ID` | Optional | `""` | `1098234...apps.googleusercontent.com` | Google Cloud OAuth Client ID for YouTube and Drive integration. |
| `GOOGLE_CLIENT_SECRET` | Optional | `""` | `GOCSPX-...` | Google Cloud OAuth Client Secret. Must NEVER be checked into git. |
| `META_APP_ID` | Optional | `""` | `984218491024` | Meta Developers App ID for Facebook Pages and Instagram Professional integration. |
| `META_APP_SECRET` | Optional | `""` | `e8f92a10b4c8...` | Meta App Secret for token exchange. Must be kept confidential. |
| `TIKTOK_CLIENT_KEY` | Optional | `""` | `aw38fa741...` | TikTok Developer Client Key for Login Kit and Content Posting API. |
| `TIKTOK_CLIENT_SECRET`| Optional | `""` | `a9f24b01...` | TikTok Developer Client Secret. |
| `MAX_UPLOAD_SIZE_BYTES`| Optional | `104857600` | `104857600` | Maximum file upload size in bytes (100MB default). Files exceeding this receive HTTP 413. |
| `UPLOAD_DIR` | Optional | `./data/uploads` | `/var/data/uploads` | Path on disk where uploaded videos and media assets are stored. |

---

## Security Best Practices for Production

1. **Secret Rotation**:
   - Rotate `OAUTH_ENCRYPTION_KEY` and `SESSION_SECRET` on a 90-day cadence.
   - When rotating `OAUTH_ENCRYPTION_KEY`, run a migration script to re-encrypt stored tokens.
2. **Never Commit `.env`**:
   - Keep `.env` listed in `.gitignore`.
   - Distribute only `.env.example` with masked dummy values.
3. **Container Runtime Ingestion**:
   - For Google Cloud Run, inject variables via Google Cloud Secret Manager (`--set-secrets`).
   - For Kubernetes, inject via `Secret` volume mounts or environment variables.
