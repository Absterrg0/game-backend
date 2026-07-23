# AWS image storage setup (S3 + CloudFront)

End-to-end guide for TB10’s cloud image pipeline: browser compresses large files, requests a **presigned PUT URL** from the API, uploads directly to **S3**, and stores the **CloudFront CDN URL** on User / Club / Tournament / Sponsor documents.

Legacy `data:image/...` base64 values may still exist in Mongo until you run the migration scripts below.

---

## Architecture (what you are setting up)

```
Frontend (Vite)
  └─ compress if > 1 MB
  └─ POST /api/uploads/presign  →  { uploadUrl, publicUrl, key }
  └─ PUT uploadUrl (browser → S3, CORS required)
  └─ save publicUrl on the entity

Backend
  └─ signs PUT with IAM keys
  └─ object key: {prefix}/{kind}/{assetId}/{fileId}.{ext}

S3 bucket (tb10assets)  ←── OAC ──→  CloudFront (https://dn1jfspmtx8ws.cloudfront.net)
```

**Asset kinds:** `user_avatar` | `club_logo` | `tournament_logo` | `sponsor_logo`

**One file per upload** (no size variants). UI scales with CSS.

**Prefix isolation** (do not rely on `NODE_ENV` — Cloud Run often uses `NODE_ENV=production` on both services):

| Cloud Run `K_SERVICE`     | S3 prefix    |
|---------------------------|--------------|
| `tournament-api-app-dev` / local | `devassets/` |
| `tournament-api-app`             | `assets/`    |

Non-prod **cannot** start with `ASSETS_PREFIX=assets`. Production **must** use `assets`.

---

## 1. AWS console setup (personal / staging account)

Prefer a **separate AWS account** (or at least a separate bucket + IAM user) from production.

### 1.1 IAM admin + MFA

1. Enable MFA on the root user.
2. Create an admin IAM user for console work (MFA on).

### 1.2 S3 bucket

1. Region: **`eu-north-1`** (hardcoded in `src/lib/assets/config.ts`).
2. Bucket name: **`tb10assets`**.
3. **Block all public access** = ON (CloudFront OAC will read objects).
4. Default encryption: SSE-S3 (AES-256) is fine.
5. Optional: lifecycle rules later; not required for first setup.

### 1.3 CloudFront distribution

1. Origin = the S3 bucket, via **Origin Access Control (OAC)** (not legacy OAI if you can avoid it).
2. Allow CloudFront to update the bucket policy when prompted.
3. Viewer protocol: redirect HTTP → HTTPS.
4. Note the distribution domain: **`https://dn1jfspmtx8ws.cloudfront.net`** (hardcoded as `CDN` base in config).
5. Default cache behavior can stay mostly default for images; you can tune TTLs later.

### 1.4 IAM programmatic user (app keys)

Create a user with **programmatic access** only. Attach an inline policy scoped to **this bucket** (replace names):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ListBucketPrefix",
      "Effect": "Allow",
      "Action": ["s3:ListBucket"],
      "Resource": ["arn:aws:s3:::tb10assets"],
      "Condition": {
        "StringLike": {
          "s3:prefix": ["devassets/*"]
        }
      }
    },
    {
      "Sid": "ObjectRW",
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"],
      "Resource": [
        "arn:aws:s3:::tb10assets/devassets/*"
      ]
    }
  ]
}
```

Create an access key → store as `AWS_S3_KEY_ID` / `AWS_S3_KEY_SECRET` (never commit).

For a **production** user, allow only the `assets/*` prefix on the prod bucket.

### 1.5 S3 CORS (required for browser presigned PUT)

Without this, the frontend PUT to `uploadUrl` fails in the browser.

```json
[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["PUT", "GET", "HEAD"],
    "AllowedOrigins": [
      "http://localhost:5173",
      "https://your-staging-frontend.example"
    ],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3000
  }
]
```

Add every real frontend origin you use (Vercel preview URLs, production domain, etc.).

---

## 2. Backend `.env` (game-backend)

Copy from `.env.example` and fill:

```bash
# --- Image assets (S3 + CloudFront) ---
# Only credentials are env-configured. Bucket/region/CDN are hardcoded:
#   bucket: tb10assets
#   region: eu-north-1
#   CDN:    https://dn1jfspmtx8ws.cloudfront.net
AWS_S3_KEY_ID=AKIA...
AWS_S3_KEY_SECRET=...

# No DEPLOY_ENV — prefix comes from Cloud Run K_SERVICE:
#   tournament-api-app-dev / local → devassets
#   tournament-api-app             → assets

# Optional overrides:
# ASSETS_PREFIX=devassets         # only if you must override; guarded by K_SERVICE
# ASSETS_MAX_UPLOAD_BYTES=2097152 # default 2 MiB
```

Also required for migration scripts (and the API itself):

```bash
MONGODB_URI=mongodb+srv://...   # or local mongodb://...
# MONGODB_DB_NAME=...            # optional override
```

**Shared bucket, two envs:** one bucket (`tb10assets`) + one CDN — Cloud Run service name picks the prefix. Never point the prod service at the `devassets` prefix (or vice versa).

On API boot you should see assets config logging roughly: `enabled: true`, `prefix: devassets`, `assetsEnv: development`.

### Related API routes (auth required)

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/api/uploads/presign` | Body `{ kind, contentType, assetId? }` → `{ uploadUrl, publicUrl, key, expiresIn }` |
| `DELETE` | `/api/uploads` | Body `{ url }` — delete object by CDN URL |

Code: `src/routes/uploads.routes.ts`, `src/lib/assets/*`.

---

## 3. Frontend `.env` (game-frontend)

**No AWS keys on the frontend.** Uploads go:

1. `POST {REACT_APP_BACKEND_URL}/api/uploads/presign` (cookie / Bearer auth)
2. `PUT` to the returned S3 URL

Ensure:

```bash
REACT_APP_BACKEND_URL=http://localhost:3000
```

and that `CORS_ORIGIN` / `REQUEST_ORIGIN` on the backend match the Vite origin (`http://localhost:5173` in dev).

Client entry: `src/lib/api/uploadImage.ts` (compress → presign → PUT).

---

## 4. Verify uploads (manual)

1. Start backend + frontend with the env above.
2. Sign in and upload a profile / club / sponsor / tournament logo.
3. Confirm:
   - Network: `POST /api/uploads/presign` 200, then `PUT` to S3 200.
   - S3 console: object under `devassets/{kind}/…`.
   - Browser: image loads from `https://dn1jfspmtx8ws.cloudfront.net/...`.
   - Mongo: field is an `https://…` URL, not `data:image/…`.

---

## 5. Migrate existing base64 → cloud

Script: `scripts/migrate-base64-images.ts`

| Model | Field | Kind |
|-------|-------|------|
| User | `profilePictureUrl` | `user_avatar` |
| Club | `logoUrl` | `club_logo` |
| Tournament | `logoUrl` | `tournament_logo` |
| Sponsor | `logoUrl` | `sponsor_logo` |

Only values starting with `data:image/` are touched. Dry-run still **connects to Mongo** and requires AWS keys configured (`assertAssetsConfigured`), but **does not** write to S3 or update the DB.

```bash
cd game-backend

# Backend uses Yarn classic (packageManager yarn@1.22.22). If your global yarn is Berry,
# call the classic binary explicitly, e.g.:
#   ~/.volta/tools/image/yarn/1.22.22/bin/yarn assets:migrate-base64:dry

# Inspect candidates (no writes)
yarn assets:migrate-base64:dry

# Real migration (uploads + updates Mongo)
yarn assets:migrate-base64
```

**Safe order:** dry-run against **dev** Mongo → real migrate there → spot-check CDN URLs → only then consider production (prod Cloud Run service / `assets/` prefix).

### Orphan cleanup (optional)

After migration / replace-uploads:

```bash
yarn assets:cleanup-orphans           # dry-run list
yarn assets:cleanup-orphans:execute   # delete unreferenced keys under current prefix
```

---

## 6. Dev vs production checklist

| Check | Dev | Prod |
|-------|-----|------|
| `K_SERVICE` | `tournament-api-app-dev` / unset (local) | `tournament-api-app` |
| Prefix | `devassets` | `assets` |
| Mongo | local / `tournamentDev` | prod DB |
| IAM | keys limited to `devassets/*` | prod-only `assets/*` |
| CORS origins | localhost | prod FE URL |
| Migrate | dry → real on non-prod first | last |

---

## 7. Troubleshooting

| Symptom | Likely cause |
|---------|----------------|
| Presign 500 / “uploads not configured” | Missing `AWS_S3_KEY_ID` / `AWS_S3_KEY_SECRET` |
| Browser PUT CORS error | Bucket CORS missing frontend origin or `PUT` |
| Upload OK but image 403 | CloudFront OAC / bucket policy not allowing CF |
| Wrong prefix in S3 | Wrong Cloud Run service / unexpected `K_SERVICE`; or bad `ASSETS_PREFIX` override |
| App refuses to start | Non-prod with `ASSETS_PREFIX=assets`, or prod with non-`assets` prefix |
| Migration finds 0 rows | No `data:image/` left, or wrong `MONGODB_URI` / DB name |

---

## 8. What not to put in git

- Real `AWS_S3_KEY_*`, Mongo URIs, or CloudFront private keys
- Use `.env` locally / secret manager in deploy; keep `.env.example` placeholder-only

Frontend never receives AWS credentials.
