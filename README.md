# PaceIQ — Strava training dashboard

Connects to your Strava account, syncs your full run history into your own
database, and shows race predictions, training load, consistency, and more,
things Strava itself either doesn't show or puts behind a subscription.

## Stack

- Frontend: plain HTML/CSS/JS (no framework, no build step), Chart.js for the trend chart
- Backend: Python serverless functions on Vercel (`api/callback.py`, `api/activities.py`, `api/sync.py`)
- Database: Supabase (Postgres) — stores your Strava tokens and your full synced activity history
- Hosting: Vercel

## Features

- **Connect with Strava** — standard OAuth flow, stays connected across visits
- **Sync Strava data** — pulls your entire activity history (paginated) into Supabase, so the dashboard reads instantly from your own database instead of hitting Strava's API on every load
- **Predicted race times** — 5K/10K/half/marathon, using the Riegel formula on your fastest qualifying run
- **Personal bests** — your actual fastest recorded times at each distance, not estimates
- **Training load (ACWR)** — acute:chronic workload ratio, flags sudden training spikes. General guideline, not medical advice.
- **Weekly trend** — mileage and pace over the last 12 weeks
- **Consistency heatmap** — GitHub-style calendar of daily mileage, last 18 weeks
- **Training mix** — % of recent runs at easy effort vs. hard, checked against the commonly cited 80/20 rule
- **Elevation stats** — total climbing, plus an "Everest count" (your total gain ÷ Everest's height)

## 1. Create a Strava API application

1. Go to [strava.com/settings/api](https://www.strava.com/settings/api)
2. Create an application
3. Note your **Client ID** and **Client Secret**
4. Upload an app icon (Strava requires one; recommended size 124x124px)
5. Leave "Authorization Callback Domain" as `localhost` for now — update it after deploying (step 6)

## 2. Set up Supabase

1. Create a project at [supabase.com](https://supabase.com) if you don't have one
2. Go to the SQL Editor and run everything in `supabase-schema.sql`
   (safe to re-run any time — every statement uses `if not exists`)
3. Go to Project Settings > API and note your **Project URL** (no trailing
   path, just `https://xxxxx.supabase.co`) and your **service_role key**
   (not the anon/public key)

## 3. Configure environment variables

Set these in Vercel under Project Settings > Environment Variables, scoped
to Production:

```
STRAVA_CLIENT_ID=your_client_id
STRAVA_CLIENT_SECRET=your_client_secret
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your_service_role_key
```

## 4. Edit one line in script.js

```js
const STRAVA_CLIENT_ID = "YOUR_STRAVA_CLIENT_ID";
```

Replace the placeholder with your real Client ID (this one is public, safe
to have in frontend code).

## 5. Push to GitHub and deploy to Vercel

Import the repo into Vercel, add the 4 environment variables, deploy.
Vercel auto-detects the Python functions in `api/` from `requirements.txt`.

## 6. Point Strava at your live domain

Set "Authorization Callback Domain" (in Strava's app settings) to your
Vercel domain — just the bare domain, no `https://`, no trailing slash.

## 7. Connect, then sync

1. Visit your deployed site, click "Connect with Strava"
2. Once connected, click **"Sync Strava data"** — this is a separate step
   from connecting, and pulls your full history into Supabase. Without this
   step, the dashboard has nothing to show.
3. Re-click sync any time you want to pull in new activities

## How the pieces fit together

```
Connect flow:
Browser -> Strava OAuth -> api/callback.py -> saves tokens to Supabase

Sync flow (click "Sync Strava data"):
Browser -> api/sync.py -> loops through your full Strava history,
           page by page -> upserts every activity into the
           Supabase `activities` table

Dashboard load (every visit):
Browser -> api/activities.py -> reads from Supabase only
           (fast, no Strava calls, works even if Strava is down)
```

## Notes

- **Sync is idempotent.** Activities are upserted by their Strava id, so
  clicking Sync again never creates duplicates, it just catches anything
  new (or anything missed if a previous sync got cut off).
- **Very long histories may need multiple sync clicks.** Each sync pulls up
  to 2,000 activities (20 pages) per click to stay within Vercel's function
  time limit. If you have more than that, click Sync again, it'll pick up
  where the data already reflects and continue forward.
- **Training load (ACWR) is informational, not medical advice.** It's a
  general indicator used in sports science, not a diagnosis or a training
  plan. If you're making real training decisions, especially around injury,
  talk to a coach or medical professional.
- **Strava's brand guidelines** require using their official "Connect with
  Strava" button assets for full compliance. The button here uses Strava's
  brand color and logo mark as a reasonable placeholder, swap in the
  official asset before sharing this publicly.
- **Single-player mode.** Built for one person (you) connecting your own
  Strava account, no app review needed for up to 10 connected users.
