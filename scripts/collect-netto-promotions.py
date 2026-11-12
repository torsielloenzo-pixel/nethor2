#!/usr/bin/env python3
"""Collecte prudente des références de prospectus publiées par netto.fr.

Aucun contenu PDF ni offre commerciale n'est recopié : seules les métadonnées
vérifiées des pages officielles sont publiées. En cas d'erreur, le fichier
restitue explicitement l'échec plutôt que de fabriquer des catalogues.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
import urllib.robotparser
import xml.etree.ElementTree as ET
from datetime import date, datetime, timedelta
from html.parser import HTMLParser
from pathlib import Path
from zoneinfo import ZoneInfo

BASE = "https://www.netto.fr"
USER_AGENT = "NethorPromotionsCollector/1.0 (catalogue metadata; https://nethor.fr/)"
SEEDS = (
    "/prospectus/temps-fort-novembre-S46",
    "/prospectus/temps-fort-novembre-S47",
    "/prospectus/jouets-noel",
)
MONTHS = {
    "janvier": 1, "fevrier": 2, "mars": 3, "avril": 4,
    "mai": 5, "juin": 6, "juillet": 7, "aout": 8,
    "septembre": 9, "octobre": 10, "novembre": 11, "decembre": 12,
}
MONTH_PATTERN = r"(?:janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre)"
DATE_PATTERN = re.compile(
    rf"\bdu\s+(\d{{1,2}})(?:er)?\s+(?:({MONTH_PATTERN})\s+)?au\s+"
    rf"(\d{{1,2}})(?:er)?\s+({MONTH_PATTERN})\s+(20\d{{2}})\b",
    re.IGNORECASE,
)
NUMERIC_DATE_PATTERN = re.compile(
    r"\bdu\s+(\d{1,2})/(\d{1,2})/(20\d{2})\s+au\s+"
    r"(\d{1,2})/(\d{1,2})/(20\d{2})\b", re.IGNORECASE
)
DISCOVERY_PATTERN = re.compile(r"(?<![\w])/?prospectus/[a-zA-Z0-9-]{3,120}", re.IGNORECASE)


def normalize(text: str) -> str:
    return "".join(
        character for character in unicodedata.normalize("NFKD", text)
        if not unicodedata.combining(character)
    ).lower()


class PageText(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts = []
        self.headings = []
        self.links = []
        self.ignored = 0
        self.heading_depth = 0
        self.current_heading = []

    def handle_starttag(self, tag, attrs):
        attributes = dict(attrs)
        if tag in ("script", "style", "noscript"):
            self.ignored += 1
        if tag in ("h1", "h2", "h3") and not self.ignored:
            self.heading_depth += 1
            self.current_heading = []
        if tag == "a" and attributes.get("href"):
            self.links.append(attributes["href"])

    def handle_endtag(self, tag):
        if tag in ("script", "style", "noscript"):
            self.ignored = max(0, self.ignored - 1)
        if tag in ("h1", "h2", "h3") and self.heading_depth:
            heading = " ".join(self.current_heading).strip()
            if heading:
                self.headings.append(heading)
            self.heading_depth -= 1

    def handle_data(self, data):
        if not self.ignored:
            clean = " ".join(data.split())
            if clean:
                self.parts.append(clean)
                if self.heading_depth:
                    self.current_heading.append(clean)

    @property
    def text(self):
        return " ".join(self.parts)


def official_catalog_url(raw: str) -> str | None:
    raw = raw.replace("\\/", "/").strip()
    url = urllib.parse.urljoin(BASE + "/", raw)
    parsed = urllib.parse.urlsplit(url)
    if parsed.scheme != "https" or parsed.hostname not in ("www.netto.fr", "netto.fr"):
        return None
    if not re.fullmatch(r"/prospectus/[a-zA-Z0-9-]{3,120}/?", parsed.path):
        return None
    return BASE + parsed.path.rstrip("/")


def extract_dates(text: str):
    plain = normalize(" ".join(text.split()))
    match = DATE_PATTERN.search(plain)
    if match:
        d1, month1, d2, month2, year = match.groups()
        last_year = int(year)
        end = date(last_year, MONTHS[month2], int(d2))
        first_month = MONTHS[month1 or month2]
        first_year = last_year - (1 if first_month > end.month else 0)
        start = date(first_year, first_month, int(d1))
        if 0 <= (end - start).days <= 90:
            return start, end
    match = NUMERIC_DATE_PATTERN.search(plain)
    if match:
        a, b, c, d, e, f = (int(value) for value in match.groups())
        start, end = date(c, b, a), date(f, e, d)
        if 0 <= (end - start).days <= 90:
            return start, end
    return None


def parse_catalog(html: str, url: str, start_window: date, end_window: date):
    page = PageText()
    page.feed(html)
    dates = extract_dates(page.text)
    if not dates:
        return None
    start, end = dates
    if end < start_window or start > end_window:
        return None
    title = next((
        name.strip() for name in page.headings
        if 4 <= len(name) <= 90
        and not any(x in normalize(name) for x in (
            "retour aux prospectus", "tous nos prospectus", "ma carte netto",
            "votre magasin", "encore plus", "promotions et bons plans"))
    ), None)
    if not title:
        return None
    normalized = normalize(title)
    thematic = any(word in normalized for word in (
        "jouet", "noel", "black friday", "destock", "jardin", "special", "fetes", "rentree"))
    return {
        "id": hashlib.sha256(url.encode("utf-8")).hexdigest()[:16],
        "title": title,
        "url": url,
        "start_date": start.isoformat(),
        "end_date": end.isoformat(),
        "category": "thematic" if thematic else "weekly",
        "source": "netto.fr",
    }


def candidate_urls(html: str) -> set[str]:
    page = PageText()
    page.feed(html)
    urls = {url for href in page.links if (url := official_catalog_url(href))}
    # Certain CMS publient les chemins dans des blocs JSON non visibles.
    urls.update(url for part in DISCOVERY_PATTERN.findall(html.replace("\\/", "/"))
                if (url := official_catalog_url(part)))
    return urls


def week_window(today: date):
    monday = today - timedelta(days=today.weekday())
    return monday, monday + timedelta(days=13)


def weekly_url_candidates(today: date) -> set[str]:
    """Les URL ne sont que des hypothèses : chaque page doit être vérifiée."""
    first, _ = week_window(today)
    months = {value: key for key, value in MONTHS.items()}
    candidates = set()
    for offset in (0, 7):
        day = first + timedelta(days=offset)
        week = day.isocalendar().week
        month = months[day.month]
        for slug in (
            f"temps-fort-{month}-S{week}",
            f"tf-{month}-s{week}",
            f"les-immanquables-S{week}",
        ):
            candidates.add(BASE + "/prospectus/" + slug)
    return candidates


def http_text(url: str, limit=3_000_000) -> str:
    request = urllib.request.Request(url, headers={
        "User-Agent": USER_AGENT, "Accept": "text/html,application/xml,text/xml;q=0.9,*/*;q=0.6",
    })
    with urllib.request.urlopen(request, timeout=15) as response:
        if response.status != 200:
            raise OSError("HTTP " + str(response.status))
        body = response.read(limit + 1)
        if len(body) > limit:
            raise ValueError("Réponse trop volumineuse")
        charset = response.headers.get_content_charset() or "utf-8"
        return body.decode(charset, errors="replace")


def robots_policy():
    try:
        text = http_text(BASE + "/robots.txt", limit=400_000)
    except urllib.error.HTTPError as exc:
        if exc.code == 404:
            return lambda url: True, None
        return lambda url: False, f"robots.txt indisponible (HTTP {exc.code})"
    except Exception as exc:
        return lambda url: False, "robots.txt inaccessible : " + type(exc).__name__
    parser = urllib.robotparser.RobotFileParser()
    parser.parse(text.splitlines())
    return lambda url: parser.can_fetch(USER_AGENT, url), None


def sitemap_candidates(allow, errors):
    urls = set()
    queue = [BASE + "/sitemap.xml", BASE + "/sitemap_index.xml"]
    visited = set()
    while queue and len(visited) < 7:
        url = queue.pop(0)
        if url in visited or not allow(url):
            continue
        visited.add(url)
        try:
            xml = http_text(url)
            root = ET.fromstring(xml)
        except urllib.error.HTTPError as exc:
            if exc.code != 404:
                errors.append("Sitemap inaccessible (HTTP " + str(exc.code) + ")")
            continue
        except Exception:
            continue
        locs = [(item.text or "").strip() for item in root.iter()
                if item.tag.rsplit("}", 1)[-1] == "loc"]
        for loc in locs:
            catalog = official_catalog_url(loc)
            if catalog:
                urls.add(catalog)
            elif ("sitemap" in loc.lower()
                  and urllib.parse.urlsplit(loc).hostname in ("www.netto.fr", "netto.fr")
                  and len(queue) < 10):
                queue.append(loc)
    return urls


def collect(today: date | None = None, fetch=http_text, sleep=time.sleep,
            check_robots=True):
    now = datetime.now(ZoneInfo("Europe/Paris"))
    today = today or now.date()
    first, last = week_window(today)
    result = {
        "schema_version": 1,
        "collected_at": now.isoformat(timespec="seconds"),
        "checked_on": today.isoformat(),
        "window_start": first.isoformat(),
        "window_end": last.isoformat(),
        "status": "unavailable",
        "catalogs": [],
        "warnings": [],
        "discovery_count": 0,
        "source_url": BASE + "/prospectus",
    }
    if check_robots:
        allowed, robot_error = robots_policy()
        if robot_error:
            result["status"] = "blocked"
            result["warnings"].append(robot_error)
            return result
    else:
        allowed = lambda url: True

    discovery = {url for path in SEEDS if (url := official_catalog_url(path))}
    discovery.update(weekly_url_candidates(today))
    source_ok = False
    for url in (BASE + "/prospectus", BASE + "/"):
        if not allowed(url):
            result["warnings"].append("Accès interdit par robots.txt : " + url)
            continue
        try:
            discovery.update(candidate_urls(fetch(url)))
            source_ok = True
        except Exception as exc:
            result["warnings"].append("Page de découverte inaccessible : " + type(exc).__name__)
        sleep(0.25)

    if fetch is http_text:
        discovery.update(sitemap_candidates(allowed, result["warnings"]))

    catalogs = {}
    # URLs confirmées en tête, puis tous les liens découverts (limite de sécurité).
    ordered = [BASE + path for path in SEEDS]
    ordered.extend(sorted(weekly_url_candidates(today)))
    ordered.extend(sorted(discovery - set(ordered), reverse=True))
    ordered = list(dict.fromkeys(ordered))[:70]
    result["discovery_count"] = len(discovery)
    fetched_count = 0
    for url in ordered:
        if not allowed(url):
            continue
        try:
            html = fetch(url)
            fetched_count += 1
            catalog = parse_catalog(html, url, first, last)
            if catalog:
                catalogs[url] = catalog
        except urllib.error.HTTPError as exc:
            if exc.code != 404:
                result["warnings"].append("Prospectus inaccessible (HTTP " + str(exc.code) + ")")
        except Exception as exc:
            result["warnings"].append("Prospectus inaccessible : " + type(exc).__name__)
        sleep(0.3)

    result["catalogs"] = sorted(catalogs.values(),
                                key=lambda c: (c["start_date"], c["title"]))
    if result["catalogs"]:
        result["status"] = "partial" if result["warnings"] else "ok"
    elif source_ok or fetched_count:
        result["status"] = "none_found"
    else:
        result["status"] = "unavailable"
    result["warnings"] = list(dict.fromkeys(result["warnings"]))[:8]
    return result


def main():
    args = argparse.ArgumentParser(description="Collecte officielle des catalogues Netto")
    args.add_argument("--output", default="_site/data/netto-catalogues.json")
    args.add_argument("--date", help="Date de test YYYY-MM-DD")
    options = args.parse_args()
    selected_day = date.fromisoformat(options.date) if options.date else None
    output = collect(selected_day)
    path = Path(options.output)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n",
                    encoding="utf-8")
    print("Collecte Netto :", output["status"], "|",
          len(output["catalogs"]), "catalogue(s) confirmé(s) |",
          len(output["warnings"]), "avertissement(s)")


if __name__ == "__main__":
    main()
