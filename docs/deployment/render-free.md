# Deploying RMS Backend to Render Free Tier

This guide provides a step-by-step walkthrough for deploying the **RMS (Restaurant Management System) Express Backend** as a long-running Node.js web service on **Render Free**.

---

## 1. Prerequisites
- A [GitHub](https://github.com) account with access to the `SYSTEM-Mat3am-Antigravity` repository.
- A free account on [Render](https://render.com).
- Access to your Firebase Project Console.

---

## 2. Step-by-Step Deployment Walkthrough

### Step 1: Connect Repository to Render
1. Log in to [Render Dashboard](https://dashboard.render.com).
2. Click the **New +** button in the top navigation bar and select **Web Service**.
3. Under **Connect a repository**, select **GitHub** and authorize Render.
4. Choose the repository: `SYSTEM-Mat3am-Antigravity`.

### Step 2: Configure Service Parameters
Configure the service fields with the exact values below:

| Field | Setting | Explanation |
| :--- | :--- | :--- |
| **Name** | `rms-api` | Unique name for your backend service. |
| **Region** | *Choose closest region (e.g. Frankfurt / Oregon)* | Low latency region for your users. |
| **Branch** | `main` | Production Git branch. |
| **Root Directory** | `server` | Points Render directly to the Node.js backend workspace. |
| **Runtime** | `Node` | Standard Node.js runtime (Node 20 LTS). |
| **Build Command** | `npm ci && npm run build` | Clean dependency install and TypeScript ESM build to `dist/`. |
| **Start Command** | `npm run start` | Executes `node dist/index.js`. |
| **Instance Type** | `Free` | Free tier web service. |

### Step 3: Configure Health Check Path
1. Scroll down and expand **Advanced Settings**.
2. Under **Health Check Path**, enter:
   ```text
   /api/v1/health
   ```
   *(Render will poll this endpoint to verify that the application has started successfully).*

### Step 4: Configure Production Environment Variables
Under the **Environment Variables** section, add the following key-value pairs:

#### Core Server & Runtime:
- `NODE_ENV` = `production`
- `ALLOWED_ORIGINS` = `https://your-frontend.vercel.app,https://your-restaurant-storefront.com`
  *(Comma-separated domains for browser CORS access. Wildcards `*` are disallowed in production).*

#### Free In-Memory Mode Defaults (No Redis required):
- `RATE_LIMIT_STORE` = `in-memory`
- `WEBHOOK_QUEUE_PROVIDER` = `in-memory`
- `WEBHOOK_WORKER_ENABLED` = `true`
- `REALTIME_EVENT_BUS_PROVIDER` = `in-memory`
- `REALTIME_EVENT_REPLAY_ENABLED` = `true`

#### Firebase Admin SDK (Server-Side Only):
- `FIREBASE_PROJECT_ID` = `your-firebase-project-id`
- `FIREBASE_CLIENT_EMAIL` = `firebase-adminsdk-xxxxx@your-firebase-project-id.iam.gserviceaccount.com`
- `FIREBASE_PRIVATE_KEY` = `-----BEGIN PRIVATE KEY-----\nMIIEvgIBA...`

> [!CAUTION]
> **Zero Exposure Rule:**
> - These Firebase Admin credentials must **ONLY** be entered into Render's secure Environment Variables dashboard.
> - **NEVER** expose `FIREBASE_PRIVATE_KEY` in frontend JavaScript, Git commits, or Vercel client environment variables (`VITE_*`).

---

## 3. How to Obtain Firebase Admin Credentials
1. Go to the [Firebase Console](https://console.firebase.google.com/).
2. Select your project.
3. Click the gear icon ⚙️ &rarr; **Project settings**.
4. Go to the **Service accounts** tab.
5. Click **Generate new private key** and confirm.
6. A JSON file will download to your computer. Open it in a text editor to extract:
   - `project_id` &rarr; Use for `FIREBASE_PROJECT_ID`
   - `client_email` &rarr; Use for `FIREBASE_CLIENT_EMAIL`
   - `private_key` &rarr; Use for `FIREBASE_PRIVATE_KEY` (Paste the full string including `-----BEGIN PRIVATE KEY-----` and `-----END PRIVATE KEY-----`).

---

## 4. Deploy & Verify

1. Click **Create Web Service**.
2. Render will automatically clone the repository, run `npm ci && npm run build` inside `server/`, and launch the service with `npm run start`.
3. Once the build log shows `🚀 RMS REST API Server is running` and Render marks the service **Live**, locate your service URL at the top left of the service dashboard:
   ```text
   https://rms-api-xxxx.onrender.com
   ```

### Verification via Health Check
Open the health check in your browser or run:
```bash
curl -i https://rms-api-xxxx.onrender.com/api/v1/health
```

**Expected Response (HTTP 200 OK):**
```json
{
  "success": true,
  "service": "rms-api",
  "version": "v1",
  "status": "healthy",
  "realtime": {
    "status": "healthy",
    "active_sse_connections": 0,
    "active_ws_connections": 0
  },
  "infrastructure": {
    "rateLimitStore": { "provider": "in-memory", "status": "healthy" },
    "webhookQueue": { "provider": "in-memory", "status": "healthy", "pending_jobs": 0 },
    "workers": { "enabled": true, "active": true, "concurrency": 5 },
    "redis": { "status": "disabled" }
  }
}
```

---

## 5. Running Automated Production Smoke Test

Once the backend is live on Render, execute the automated smoke test script locally targeting the Render deployment:

```bash
RMS_API_URL="https://rms-api-xxxx.onrender.com/api/v1" \
RMS_API_KEY="cli_xxxxxxxxxxxx.sec_xxxxxxxxxxxxxxxxxxxx" \
npx tsx examples/generic-restaurant/production-smoke-test.ts
```

This verifies:
1. `GET /health`
2. Authentication & Request ID propagation
3. Branch authorization
4. Menu & catalog retrieval
5. Authoritative pricing preview
6. Delivery zone calculation
7. Order creation with `Idempotency-Key`
8. Idempotent duplicate replay validation
