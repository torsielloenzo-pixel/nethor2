import importlib.util
import unittest
import urllib.error
from unittest.mock import patch
from datetime import date
from pathlib import Path

PATH = Path(__file__).resolve().parents[1] / "scripts" / "collect-netto-promotions.py"
SPEC = importlib.util.spec_from_file_location("netto_collector", PATH)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


def page(title, period, extra=""):
    return (f"<html><h1>{title}</h1><p>{period}</p>"
            f"<p>FluidBook PDF</p>{extra}</html>")


class CollectorTests(unittest.TestCase):
    def test_french_date_ranges_and_window(self):
        start, end = MODULE.extract_dates("DU 10 AU 16 NOVEMBRE 2026")
        self.assertEqual(str(start), "2026-11-10")
        self.assertEqual(str(end), "2026-11-16")
        self.assertEqual(MODULE.week_window(date(2026, 11, 12)),
                         (date(2026, 11, 9), date(2026, 11, 22)))
        self.assertEqual(MODULE.extract_dates("Du 28 décembre au 4 janvier 2027"),
                         (date(2026, 12, 28), date(2027, 1, 4)))

    def test_only_official_catalog_detail_urls(self):
        self.assertIsNone(MODULE.official_catalog_url("https://malicious.fr/prospectus/a"))
        self.assertIsNone(MODULE.official_catalog_url("http://www.netto.fr/prospectus/x"))
        self.assertIsNone(MODULE.official_catalog_url("/prospectus"))
        self.assertEqual(
            MODULE.official_catalog_url("/prospectus/jouets-noel"),
            "https://www.netto.fr/prospectus/jouets-noel")

    def test_only_catalogs_with_verified_period_are_collected(self):
        data = {
            "https://www.netto.fr/prospectus": '<a href="/prospectus/temps-fort-novembre-S47">S47</a>',
            "https://www.netto.fr/": "<h1>Accueil Netto</h1>",
            "https://www.netto.fr/prospectus/temps-fort-novembre-S46":
                page("TEMPS FORT NOVEMBRE", "DU 10 AU 16 NOVEMBRE 2026"),
            "https://www.netto.fr/prospectus/temps-fort-novembre-S47":
                page("TEMPS FORT NOVEMBRE", "DU 17 AU 23 NOVEMBRE 2026"),
            "https://www.netto.fr/prospectus/jouets-noel":
                page("JOUETS NOËL", "DU 3 AU 30 NOVEMBRE 2026"),
        }
        result = MODULE.collect(
            date(2026, 11, 12),
            fetch=lambda url: data.get(url, '<h1>Page introuvable</h1>'),
            sleep=lambda _: None, check_robots=False)
        self.assertEqual(result["status"], "ok")
        self.assertEqual(len(result["catalogs"]), 3)
        self.assertEqual(sum(x["category"] == "thematic" for x in result["catalogs"]), 1)
        self.assertEqual(result["window_end"], "2026-11-22")

    def test_no_invention_when_site_does_not_expose_dates(self):
        result = MODULE.collect(
            date(2026, 11, 12),
            fetch=lambda url: "<html><h1>TEMPS FORT</h1><p>Sans date</p></html>",
            sleep=lambda _: None, check_robots=False)
        self.assertEqual(result["catalogs"], [])
        self.assertEqual(result["status"], "none_found")

    def test_robots_http_403_unavailable_not_a_disallow_rule(self):
        def error403(url, limit=400_000):
            raise urllib.error.HTTPError(url, 403, "Forbidden", {}, None)
        with patch.object(MODULE, "http_text", error403):
            allowed, note = MODULE.robots_policy()
        self.assertTrue(allowed("https://www.netto.fr/prospectus"))
        self.assertIn("HTTP 403", note)

    def test_refuses_more_requests_when_official_pages_deny_access(self):
        called = []
        def denied(url):
            called.append(url)
            raise urllib.error.HTTPError(url, 403, "Forbidden", {}, None)
        result = MODULE.collect(
            date(2026, 11, 12), fetch=denied,
            sleep=lambda _: None, check_robots=False)
        self.assertEqual(result["status"], "blocked")
        self.assertEqual(len(called), 2)
        self.assertEqual(result["catalogs"], [])

    def test_expired_catalogs_do_not_appear(self):
        result = MODULE.parse_catalog(
            page("TEMPS FORT", "Du 3 au 9 novembre 2026"),
            "https://www.netto.fr/prospectus/tf-novembre-s45",
            date(2026, 11, 9), date(2026, 11, 22))
        self.assertIsNotNone(result, "le catalogue chevauche bien le début de semaine")
        result = MODULE.parse_catalog(
            page("TEMPS FORT", "Du 3 au 8 novembre 2026"),
            "https://www.netto.fr/prospectus/tf-novembre-s45",
            date(2026, 11, 9), date(2026, 11, 22))
        self.assertIsNone(result)


if __name__ == "__main__":
    unittest.main()
