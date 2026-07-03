from http.server import BaseHTTPRequestHandler
import os
import json
import time
import requests

STRAVA_CLIENT_ID = os.environ.get("STRAVA_CLIENT_ID")
STRAVA_CLIENT_SECRET = os.environ.get("STRAVA_CLIENT_SECRET")
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY")

# Safety cap: 20 pages * 100 activities = 2,000 activities per sync click.
# Upserts happen per-page, so even if this cap is hit, nothing already
# synced is lost -- clicking Sync again just continues from where it left off.
MAX_PAGES = 20


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        token_row = self._get_token_row()

        if not token_row:
            self._json_response(404, {"error": "not_connected"})
            return

        access_token = self._ensure_fresh_token(token_row)
        if not access_token:
            self._json_response(500, {"error": "token_refresh_failed"})
            return

        athlete_id = token_row["athlete_id"]
        total_synced = 0
        page = 1

        while page <= MAX_PAGES:
            response = requests.get(
                "https://www.strava.com/api/v3/athlete/activities",
                headers={"Authorization": f"Bearer {access_token}"},
                params={"per_page": 100, "page": page},
            )

            if response.status_code != 200:
                self._json_response(
                    response.status_code,
                    {"error": "strava_fetch_failed", "detail": response.text},
                )
                return

            batch = response.json()
            if not batch:
                break

            self._upsert_activities(athlete_id, batch)
            total_synced += len(batch)
            page += 1

        self._json_response(200, {"synced": total_synced, "pages": page - 1})

    def _get_token_row(self):
        url = f"{SUPABASE_URL}/rest/v1/strava_tokens?select=*&limit=1"
        headers = {
            "apikey": SUPABASE_SERVICE_KEY,
            "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
        }
        response = requests.get(url, headers=headers)
        rows = response.json()
        return rows[0] if rows else None

    def _ensure_fresh_token(self, token_row):
        if token_row["expires_at"] > int(time.time()) + 60:
            return token_row["access_token"]

        refresh_response = requests.post(
            "https://www.strava.com/oauth/token",
            data={
                "client_id": STRAVA_CLIENT_ID,
                "client_secret": STRAVA_CLIENT_SECRET,
                "refresh_token": token_row["refresh_token"],
                "grant_type": "refresh_token",
            },
        )
        if refresh_response.status_code != 200:
            return None

        new_tokens = refresh_response.json()
        self._update_tokens(token_row["athlete_id"], new_tokens)
        return new_tokens["access_token"]

    def _update_tokens(self, athlete_id, tokens):
        url = f"{SUPABASE_URL}/rest/v1/strava_tokens?athlete_id=eq.{athlete_id}"
        headers = {
            "apikey": SUPABASE_SERVICE_KEY,
            "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
            "Content-Type": "application/json",
        }
        requests.patch(
            url,
            headers=headers,
            json={
                "access_token": tokens["access_token"],
                "refresh_token": tokens["refresh_token"],
                "expires_at": tokens["expires_at"],
            },
        )

    def _upsert_activities(self, athlete_id, activities):
        rows = [
            {
                "id": a["id"],
                "athlete_id": athlete_id,
                "name": a.get("name"),
                "type": a.get("type"),
                "distance": a.get("distance"),
                "moving_time": a.get("moving_time"),
                "elapsed_time": a.get("elapsed_time"),
                "total_elevation_gain": a.get("total_elevation_gain"),
                "start_date": a.get("start_date"),
                "average_heartrate": a.get("average_heartrate"),
                "max_heartrate": a.get("max_heartrate"),
                "average_speed": a.get("average_speed"),
            }
            for a in activities
        ]

        url = f"{SUPABASE_URL}/rest/v1/activities?on_conflict=id"
        headers = {
            "apikey": SUPABASE_SERVICE_KEY,
            "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
            "Content-Type": "application/json",
            "Prefer": "resolution=merge-duplicates",
        }
        requests.post(url, headers=headers, json=rows)

    def _json_response(self, status, body):
        self.send_response(status)
        self.send_header("Content-type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps(body).encode("utf-8"))
