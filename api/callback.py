from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
import os
import requests

STRAVA_CLIENT_ID = os.environ.get("STRAVA_CLIENT_ID")
STRAVA_CLIENT_SECRET = os.environ.get("STRAVA_CLIENT_SECRET")
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY")


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        query = parse_qs(urlparse(self.path).query)
        code = query.get("code", [None])[0]
        error = query.get("error", [None])[0]

        if error:
            self._redirect(f"/?error={error}")
            return

        if not code:
            self._redirect("/?error=missing_code")
            return

        token_response = requests.post(
            "https://www.strava.com/oauth/token",
            data={
                "client_id": STRAVA_CLIENT_ID,
                "client_secret": STRAVA_CLIENT_SECRET,
                "code": code,
                "grant_type": "authorization_code",
            },
        )

        if token_response.status_code != 200:
            self._redirect("/?error=token_exchange_failed")
            return

        data = token_response.json()
        athlete = data.get("athlete", {})

        saved = self._save_tokens(
            athlete_id=athlete.get("id"),
            access_token=data["access_token"],
            refresh_token=data["refresh_token"],
            expires_at=data["expires_at"],
        )

        if not saved:
            self._redirect("/?error=token_save_failed")
            return

        self._redirect("/?connected=true")

    def _save_tokens(self, athlete_id, access_token, refresh_token, expires_at):
        url = f"{SUPABASE_URL}/rest/v1/strava_tokens?on_conflict=athlete_id"
        headers = {
            "apikey": SUPABASE_SERVICE_KEY,
            "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
            "Content-Type": "application/json",
            "Prefer": "resolution=merge-duplicates",
        }
        payload = {
            "athlete_id": athlete_id,
            "access_token": access_token,
            "refresh_token": refresh_token,
            "expires_at": expires_at,
        }
        response = requests.post(url, headers=headers, json=payload)
        return response.status_code in (200, 201)

    def _redirect(self, location):
        self.send_response(302)
        self.send_header("Location", location)
        self.end_headers()
