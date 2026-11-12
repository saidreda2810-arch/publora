# Master External Requirements Action Checklist

**Account Owner Email**: `saidreda2810@gmail.com`  
**Google Cloud Project ID**: `protean-braid-gc9s2`  
**Development App URL**: `https://ais-dev-zxipqzaziekjmsixhnilwx-245311395111.europe-west2.run.app`  
**Shared Preview URL**: `https://ais-pre-zxipqzaziekjmsixhnilwx-245311395111.europe-west2.run.app`  

This checklist categorizes every action you need to perform in external developer portals into Groups A through E, with exact URLs, step-by-step instructions, and target redirect URIs.

---

## Group A — Google Cloud Platform (YouTube & Google Drive)

- [ ] **A.1 Open Google Cloud Console**
  - **Direct URL**: [https://console.cloud.google.com/](https://console.cloud.google.com/)
  - Ensure project `protean-braid-gc9s2` is selected in the top bar.

- [ ] **A.2 Enable APIs**
  - **Direct URL**: [https://console.cloud.google.com/apis/library](https://console.cloud.google.com/apis/library)
  - Search and click **Enable** on each of these 3 APIs:
    1. **YouTube Data API v3**
    2. **YouTube Analytics API**
    3. **Google Drive API**

- [ ] **A.3 Configure OAuth Consent Screen**
  - **Direct URL**: [https://console.cloud.google.com/apis/credentials/consent](https://console.cloud.google.com/apis/credentials/consent)
  - Select User Type: **External** > Click **Create**.
  - **App Name**: `SRA Social Publisher`
  - **User support email**: `saidreda2810@gmail.com`
  - **Developer contact information**: `saidreda2810@gmail.com`
  - On the **Scopes** page, click **Add or Remove Scopes** and select:
    - `https://www.googleapis.com/auth/youtube.upload`
    - `https://www.googleapis.com/auth/youtube.readonly`
    - `https://www.googleapis.com/auth/yt-analytics.readonly`
    - `https://www.googleapis.com/auth/drive.readonly`
  - On the **Test users** page, add `saidreda2810@gmail.com` so you can connect your YouTube account while in development status.

- [ ] **A.4 Create OAuth 2.0 Web Client ID**
  - **Direct URL**: [https://console.cloud.google.com/apis/credentials/oauthclient](https://console.cloud.google.com/apis/credentials/oauthclient)
  - Application type: **Web application**
  - Name: `SRA Social Publisher Client`
  - **Authorized JavaScript origins**:
    - `https://ais-dev-zxipqzaziekjmsixhnilwx-245311395111.europe-west2.run.app`
    - `https://ais-pre-zxipqzaziekjmsixhnilwx-245311395111.europe-west2.run.app`
  - **Authorized redirect URIs**:
    - `https://ais-dev-zxipqzaziekjmsixhnilwx-245311395111.europe-west2.run.app/api/oauth/callback/youtube`
    - `https://ais-pre-zxipqzaziekjmsixhnilwx-245311395111.europe-west2.run.app/api/oauth/callback/youtube`
  - Click **Create**.
  - Copy the **Client ID** and **Client Secret**.

---

## Group B — Meta for Developers (Facebook & Instagram)

- [ ] **B.1 Open Meta Developers Portal**
  - **Direct URL**: [https://developers.facebook.com/apps/](https://developers.facebook.com/apps/)
  - Log in with your Facebook account associated with your managed Pages.

- [ ] **B.2 Create Business App**
  - Click **Create App** > Select **Business** > Click **Next**.
  - App Name: `SRA Social Publisher`
  - App Contact Email: `saidreda2810@gmail.com`

- [ ] **B.3 Add Facebook Login for Business**
  - In the App Dashboard, find **Facebook Login for Business** and click **Set Up**.
  - In left sidebar, navigate to **Facebook Login for Business > Settings**.
  - Under **Valid OAuth Redirect URIs**, paste:
    - `https://ais-dev-zxipqzaziekjmsixhnilwx-245311395111.europe-west2.run.app/api/oauth/callback/facebook`
    - `https://ais-dev-zxipqzaziekjmsixhnilwx-245311395111.europe-west2.run.app/api/oauth/callback/instagram`
    - `https://ais-pre-zxipqzaziekjmsixhnilwx-245311395111.europe-west2.run.app/api/oauth/callback/facebook`
    - `https://ais-pre-zxipqzaziekjmsixhnilwx-245311395111.europe-west2.run.app/api/oauth/callback/instagram`
  - Click **Save Changes**.

- [ ] **B.4 Verify Instagram Professional Linking**
  - Ensure your Instagram profile is a **Creator** or **Business** account.
  - Ensure your Instagram account is linked to your managed Facebook Page in Facebook Page Settings > Linked Accounts.

- [ ] **B.5 Retrieve Meta Credentials**
  - In left sidebar, click **App Settings > Basic**.
  - Copy **App ID** and click **Show** to copy **App Secret**.

---

## Group C — TikTok for Developers (Content Posting API)

- [ ] **C.1 Open TikTok Developer Portal**
  - **Direct URL**: [https://developers.tiktok.com/](https://developers.tiktok.com/)
  - Click **Manage Apps** or **Create App**.

- [ ] **C.2 Register Application**
  - App Name: `SRA Social Publisher`
  - Category: `Productivity & Social`
  - Add Products:
    - **Login Kit v2**
    - **Content Posting API**

- [ ] **C.3 Configure Redirect URI & Whitelist**
  - In App Configuration, under **Redirect Domains**:
    - Add `ais-dev-zxipqzaziekjmsixhnilwx-245311395111.europe-west2.run.app`
    - Add `ais-pre-zxipqzaziekjmsixhnilwx-245311395111.europe-west2.run.app`
  - Under **Redirect URI**:
    - `https://ais-dev-zxipqzaziekjmsixhnilwx-245311395111.europe-west2.run.app/api/oauth/callback/tiktok`
  - In **App Scopes**, check:
    - `user.info.basic`
    - `video.publish`
    - `video.upload`
  - In **Test Accounts**, add your TikTok username/handle to authorize in development mode.

- [ ] **C.4 Copy TikTok Credentials**
  - Copy **Client Key** and **Client Secret**.

---

## Group D — Google AI Studio (Gemini Model API Key)

- [ ] **D.1 Open Google AI Studio**
  - **Direct URL**: [https://aistudio.google.com/apikey](https://aistudio.google.com/apikey)
  - Sign in with `saidreda2810@gmail.com`.
  - Click **Create API Key** and attach it to project `protean-braid-gc9s2`.
  - Copy the generated API Key.

---

## Group E — Enter Credentials into SRA Social Publisher

- [ ] **E.1 Open Connection Center in Application**
  - Navigate to: `https://ais-dev-zxipqzaziekjmsixhnilwx-245311395111.europe-west2.run.app`
  - Click **Channels** or **Connected Accounts** in the navigation bar.
  - Click **Developer OAuth Credentials & Keys** to expand the credentials configuration modal.

- [ ] **E.2 Paste Credentials**
  - Google Client ID & Secret
  - Meta App ID & Secret
  - TikTok Client Key & Secret
  - Click **Save & Encrypt Credentials**.

- [ ] **E.3 Test Live Connection**
  - Click **Connect** next to YouTube, Facebook, Instagram, or TikTok.
  - Approve permissions in the official platform popup window.
  - Confirm the connected channel, profile badge, and live token status appear in your dashboard!
