---
description: Deploy Nishinae Store to Railway with PostgreSQL
---

# Deploy to Railway

## 1. Prerequisites
- Railway account (railway.app)
- GitHub account with repo connected to Railway
- Code pushed to GitHub

## 2. Create PostgreSQL Database
1. In Railway dashboard, click "New"
2. Select "Database" → "Add PostgreSQL"
3. Wait for it to provision (green checkmark)
4. Copy the "DATABASE_URL" connection string

## 3. Create Project Service
1. Click "New" → "GitHub Repo"
2. Select your `empty-window` repository
3. Railway auto-detects Next.js and suggests build command

## 4. Add Environment Variables
In Railway project Settings → Variables, add:
```
DATABASE_URL=postgresql://... (from step 2)
NEXT_PUBLIC_API_URL=https://your-app.railway.app
SHOPEE_INGEST_SECRET=your-random-secret-here
```

## 5. Build & Deploy Settings
Build Command:
```
npm ci && npx prisma migrate deploy && npm run build
```

Start Command:
```
npm start
```

## 6. Deploy
1. Click "Deploy"
2. Monitor build logs
3. Once done, copy the deployed URL (e.g., `https://nishinae.up.railway.app`)

## 7. Update UI.Vision Script
Edit `scripts/shopee-fetch-orders.json`:
- Change `http://localhost:3000` to your Railway URL
- Add secret header if you set `SHOPEE_INGEST_SECRET`

## 8. Run UI.Vision on Schedule
Options:
A) Keep PC on, run macro every 5 minutes via UI.Vision scheduler
B) Use n8n / Zapier to trigger webhook
C) Run UI.Vision on cloud VPS (see below)

## Cloud VPS Alternative (Recommended for 24/7)
1. Rent cheap Windows VPS (~$5-10/month on Vultr, Contabo, etc.)
2. Install Chrome + UI.Vision extension
3. Login to Shopee Seller Centre once
4. Set UI.Vision to run every 5 minutes
5. Done - runs 24/7 without your PC
