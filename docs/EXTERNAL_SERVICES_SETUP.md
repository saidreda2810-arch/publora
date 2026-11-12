# External Services & Social Media API Integration Guide

This guide provides instructions to connect official third-party social media APIs, cloud services, and AI APIs into SRA Social Publisher.

---

## 1. Google Cloud Platform & YouTube Data API

### Overview
Integrates Google OAuth 2.0 to query YouTube channels, retrieve 1-second retention curves via YouTube Analytics API, and upload video content.

### Step-by-Step Setup
1. **Navigate to Google Cloud Console**:
   - URL: `https://console.cloud.google.com/`
   - Select or create project (e.g. `protean-braid-gc9s2`).
2. **Enable Required APIs**:
   - Go to **APIs & Services > Library**.
   - Search and Enable:
     - **YouTube Data API v3**
     - **YouTube Analytics API**
     - **Google Drive API** (if Drive import enabled)
3. **Configure OAuth Consent Screen**:
   - Go to **APIs & Services > OAuth consent screen**.
   - Select **External** User Type.
   - App Name: `SRA Social Publisher`
   - User Support Email: `saidreda2810@gmail.com`
   - Add Developer Contact Email: `saidreda2810@gmail.com`
   - Add Scopes:
     - `https://www.googleapis.com/auth/youtube.upload`
     - `https://www.googleapis.com/auth/youtube.readonly`
     - `https://www.googleapis.com/auth/yt-analytics.readonly`
4. **Create Credentials**:
   - Go to **APIs & Services > Credentials > Create Credentials > OAuth client ID**.
   - Application Type: **Web application**.
   - Name: `SRA Social Publisher Web Client`.
   - **Authorized JavaScript Origins**:
     - `https://ais-dev-zxipqzaziekjmsixhnilwx-245311395111.europe-west2.run.app`
     - `https://ais-pre-zxipqzaziekjmsixhnilwx-245311395111.europe-west2.run.app`
   - **Authorized Redirect URIs**:
     - `https://ais-dev-zxipqzaziekjmsixhnilwx-245311395111.europe-west2.run.app/api/oauth/callback/youtube`
     - `https://ais-pre-zxipqzaziekjmsixhnilwx-245311395111.europe-west2.run.app/api/oauth/callback/youtube`
5. **Copy Credentials**:
   - Copy Client ID into `GOOGLE_CLIENT_ID`
   - Copy Client Secret into `GOOGLE_CLIENT_SECRET`

---

## 2. Meta for Developers (Facebook Pages & Instagram Professional)

### Overview
Connects to the Meta Graph API to discover managed Facebook Pages and linked Instagram Professional (Creator/Business) accounts for automated Reels and post publishing.

### Step-by-Step Setup
1. **Navigate to Meta Developer Portal**:
   - URL: `https://developers.facebook.com/apps/`
2. **Create New App**:
   - Click **Create App** > Select **Business** type.
   - App Display Name: `SRA Social Publisher`.
   - App Contact Email: `saidreda2810@gmail.com`.
3. **Add Products**:
   - Add **Facebook Login for Business**.
4. **Configure Redirect URIs**:
   - Under Facebook Login > Settings > **Valid OAuth Redirect URIs**:
     - `https://ais-dev-zxipqzaziekjmsixhnilwx-245311395111.europe-west2.run.app/api/oauth/callback/facebook`
     - `https://ais-dev-zxipqzaziekjmsixhnilwx-245311395111.europe-west2.run.app/api/oauth/callback/instagram`
     - `https://ais-pre-zxipqzaziekjmsixhnilwx-245311395111.europe-west2.run.app/api/oauth/callback/facebook`
     - `https://ais-pre-zxipqzaziekjmsixhnilwx-245311395111.europe-west2.run.app/api/oauth/callback/instagram`
5. **Permissions & Features**:
   - Ensure the following permissions are requested:
     - `pages_show_list`
     - `pages_read_engagement`
     - `pages_manage_posts`
     - `instagram_basic`
     - `instagram_content_publish`
     - `instagram_manage_insights`
6. **Copy App Credentials**:
   - Under **App Settings > Basic**:
     - Copy App ID into `META_APP_ID`
     - Copy App Secret into `META_APP_SECRET`

---

## 3. TikTok for Developers (Login Kit & Content Posting API)

### Overview
Integrates TikTok Login Kit v2 and the Content Posting API for Direct Video Publishing and Draft Inbox workflows.

### Step-by-Step Setup
1. **Navigate to TikTok Developer Portal**:
   - URL: `https://developers.tiktok.com/`
2. **Register Developer Account & Create App**:
   - Register organization or individual profile.
   - Create App > Name: `SRA Social Publisher`.
3. **Add Products**:
   - **Login Kit v2**
   - **Content Posting API**
4. **Configure Callback & Redirect Domains**:
   - In App Details > Redirect Domains:
     - `ais-dev-zxipqzaziekjmsixhnilwx-245311395111.europe-west2.run.app`
     - `ais-pre-zxipqzaziekjmsixhnilwx-245311395111.europe-west2.run.app`
   - Redirect URL:
     - `https://ais-dev-zxipqzaziekjmsixhnilwx-245311395111.europe-west2.run.app/api/oauth/callback/tiktok`
5. **Add Scopes**:
   - `user.info.basic`
   - `video.publish`
   - `video.upload`
6. **Copy Credentials**:
   - Copy Client Key into `TIKTOK_CLIENT_KEY`
   - Copy Client Secret into `TIKTOK_CLIENT_SECRET`

---

## 4. Google Gemini AI API

### Overview
Powers video retention curve diagnostics, 0-3 second psychological hook creation, and publishing time intelligence.

### Step-by-Step Setup
1. **Obtain API Key**:
   - Visit Google AI Studio: `https://aistudio.google.com/`
   - Click **Get API key** > Generate in project `protean-braid-gc9s2`.
2. **Configure in SRA Social Publisher**:
   - Add to environment: `GEMINI_API_KEY="..."`
   - Model utilized: `gemini-3.8-flash`
   - Note: The application includes automated algorithmic fallback heuristics if the API key is not present during testing.
