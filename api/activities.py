from http.server import BaseHTTPRequestHandler
import os
import json
import requests

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY")


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        token_row = self._get_token_row()

        if not token_row:
            self._json_response(404, {"error": "not_connected"})
            return

        activities = self._get_activities(token_row["athlete_id"])
        self._json_response(200, activities)

    def _get_token_row(self):
        url = f"{SUPABASE_URL}/rest/v1/strava_tokens?select=athlete_id&limit=1"
        headers = {
            "apikey": SUPABASE_SERVICE_KEY,
            "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
        }
        response = requests.get(url, headers=headers)
        rows = response.json()
        return rows[0] if rows else None

    def _get_activities(self, athlete_id):
        # Reads from our own Supabase cache, not Strava directly.
        # Run /api/sync first to populate this table.
        url = (
            f"{SUPABASE_URL}/rest/v1/activities"
            f"?athlete_id=eq.{athlete_id}"
            f"&select=*"
            f"&order=start_date.desc"
            f"&limit=3000"
        )
        headers = {
            "apikey": SUPABASE_SERVICE_KEY,
            "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
        }
        response = requests.get(url, headers=headers)
        return response.json()

    def _json_response(self, status, body):
        self.send_response(status)
        self.send_header("Content-type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps(body).encode("utf-8"))
