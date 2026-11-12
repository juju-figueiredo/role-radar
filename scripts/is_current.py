"""Return success if every configured board refreshed today in New York."""
import datetime as dt
import json
import sys
from zoneinfo import ZoneInfo

from refresh import FEED, SOURCES

timezone = ZoneInfo("America/New_York")
today = dt.datetime.now(timezone).date()
feed = json.loads(FEED.read_text())
sources = json.loads(SOURCES.read_text())

def checked_today(provider, slug):
    state = feed["sources"].get(f"{provider}:{slug}", {})
    checked = state.get("lastSuccess")
    return state.get("ok") and checked and dt.datetime.fromisoformat(checked).astimezone(timezone).date() == today

sys.exit(0 if all(checked_today(provider, slug) for provider, slug, *_ in sources) else 1)
