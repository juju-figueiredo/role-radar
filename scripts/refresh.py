"""Fetch employer job boards and atomically update the static feed."""
import concurrent.futures
import datetime as dt
import json
import re
import sys
import time
import urllib.request
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import quote, urlsplit

ROOT = Path(__file__).resolve().parents[1]
FEED = ROOT / "app/data/jobs.json"
SOURCES = ROOT / "scripts/sources.json"
UTC = dt.timezone.utc

def fetch(source):
    provider, slug, company, sector = source
    endpoints = {
        "ashby": f"https://api.ashbyhq.com/posting-api/job-board/{quote(slug)}",
        "greenhouse": f"https://boards-api.greenhouse.io/v1/boards/{quote(slug)}/jobs",
        "lever": f"https://api.lever.co/v0/postings/{quote(slug)}?mode=json",
    }
    request = urllib.request.Request(endpoints[provider], headers={"User-Agent": "RoleRadar/1.0", "Accept": "application/json"})
    for attempt in range(2):
        try:
            with urllib.request.urlopen(request, timeout=18) as response:
                payload = json.load(response)
            break
        except (OSError, ValueError) as error:
            permanent = isinstance(error, HTTPError) and error.code in (400, 401, 403, 404)
            if attempt or permanent:
                raise
            time.sleep(2)
    rows = payload if provider == "lever" else payload["jobs"]
    if not isinstance(rows, list):
        raise ValueError("Expected a list of postings")
    jobs = []
    for item in rows:
        if item.get("isListed") is False:
            continue
        if provider == "ashby":
            title, url = item.get("title"), item.get("applyUrl") or item.get("jobUrl")
            locations = [item.get("location")] + [loc.get("location") for loc in item.get("secondaryLocations", [])]
            if item.get("isRemote"):
                locations.append("Remote")
        elif provider == "greenhouse":
            title, url = item.get("title"), item.get("absolute_url")
            locations = [(item.get("location") or {}).get("name")]
        else:
            title, url = item.get("text"), item.get("applyUrl") or item.get("hostedUrl")
            categories = item.get("categories") or {}
            locations = categories.get("allLocations") or [categories.get("location")]
            if item.get("workplaceType") == "remote":
                locations = [*locations, "Remote"]
        if not (title and url and urlsplit(url).scheme == "https" and urlsplit(url).hostname):
            continue
        normalized = title.lower()
        if not re.search(r"partner|business development|desenvolvimento de neg|origination|originação|investor relation|fundrais|capital formation|private credit|venture (debt|banking)|growth lending|structured (credit|finance)|go.to.market|\bgtm\b|market expansion|country manager|general manager|ecosystem|estratégi|strategy|\bgrowth\b|market development|capital markets|investment relation", normalized):
            continue
        jobs.append(dict(id=f"{provider}:{slug}:{item.get('id') or urlsplit(url).path}", company=company,
                         sector=sector, title=title, location=" · ".join(dict.fromkeys(filter(None, locations))) or "Location unspecified",
                         url=url))
    if rows and not any(row.get("title") or row.get("text") for row in rows):
        raise ValueError("Posting schema did not contain titles")
    return jobs

def main():
    previous = json.loads(FEED.read_text()) if FEED.exists() else {"jobs": [], "sources": {}}
    now = dt.datetime.now(UTC).isoformat(timespec="seconds")
    sources = json.loads(SOURCES.read_text())
    states, jobs = {}, []
    old_jobs = {job["id"]: job for job in previous["jobs"]}
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        pending = {pool.submit(fetch, source): source for source in sources}
        for task in concurrent.futures.as_completed(pending):
            provider, slug, company, _ = pending[task]
            key = f"{provider}:{slug}"
            old_state = previous["sources"].get(key, {})
            try:
                current = task.result()
            except (OSError, ValueError, KeyError, TypeError, AttributeError) as error:
                print(f"{company}: {error}", file=sys.stderr)
                states[key] = {"company": company, "ok": False, "lastSuccess": old_state.get("lastSuccess")}
                for job in previous["jobs"]:
                    if job["id"].startswith(key + ":"):
                        jobs.append({**job, "stale": True})
                continue
            states[key] = {"company": company, "ok": True, "lastSuccess": now}
            for job in current:
                jobs.append({**job, "firstSeen": old_jobs.get(job["id"], {}).get("firstSeen", now)})
    successes = sum(state["ok"] for state in states.values())
    if not successes:
        sys.exit("No source refreshed. The previous feed was preserved.")
    unique = {}
    for job in sorted(jobs, key=lambda job: (job.get("stale", False), job["id"])):
        unique.setdefault((job["company"], job["title"].casefold(), job["location"].casefold()), job)
    output = {"updatedAt": now, "sources": dict(sorted(states.items())), "jobs": list(unique.values())}
    temporary = FEED.with_suffix(".tmp")
    temporary.write_text(json.dumps(output, ensure_ascii=False, separators=(",", ":")) + "\n")
    temporary.replace(FEED)
    print(f"{successes}/{len(sources)} sources refreshed, {len(unique)} candidate listings")

if __name__ == "__main__":
    main()
