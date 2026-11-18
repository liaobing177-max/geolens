"""Check the research invariants using the provided scores, without claiming source validation."""
from pathlib import Path
import json
import math
import re
from html.parser import HTMLParser

ROOT = Path(__file__).resolve().parents[1]


def read_js_json(path):
    text = path.read_text(encoding="utf-8")
    start = text.index("=") + 1
    return json.JSONDecoder().raw_decode(text[start:].lstrip())[0]


class Structure(HTMLParser):
    def __init__(self):
        super().__init__()
        self.ids = []
        self.anchors = []
        self.resources = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if "id" in attrs:
            self.ids.append(attrs["id"])
        if tag == "a" and attrs.get("href", "").startswith("#"):
            self.anchors.append(attrs["href"][1:])
        if tag == "script" and "src" in attrs:
            self.resources.append(attrs["src"])
        if tag == "link" and attrs.get("rel") == "stylesheet":
            self.resources.append(attrs["href"])


def main():
    original = json.loads((ROOT / "research/original-data.json").read_text(encoding="utf-8"))
    derived = read_js_json(ROOT / "assets/derived.js")
    countries = original["countries"]["countries"]
    keys = derived["summary"]["globalCommonIndicators"]
    all_iso = derived["summary"]["globalCountries"]
    assert len(keys) == 8 and len(all_iso) == 16
    for iso in all_iso:
        for key in keys:
            assert countries[iso]["indicators"][key] is not None
            assert 2020 <= countries[iso]["years"][key] <= 2023
    paths_checked = 0
    for target, comparison in derived["comparisons"].items():
        assert set(comparison["freshIndicators"]) == set(keys)
        for iso, score in comparison["scores"].items():
            expected = sum(countries[iso]["indicators"][key] for key in keys) / len(keys)
            assert math.isclose(expected, score["freshScore"], abs_tol=0.00001)
        for hub, path in comparison["paths"].items():
            fresh = path["fresh"]
            expected = .45 * (fresh["host"] - fresh["direct"])
            assert math.isclose(expected, fresh["delta"], abs_tol=0.00001)
            assert math.isclose(fresh["via"] - fresh["direct"], fresh["delta"], abs_tol=0.00001)
            assert math.isclose(sum(row["contribution"] for row in fresh["contributions"]), fresh["delta"], abs_tol=0.00001)
            for alpha in (0, .05, .45, 1):
                delta = alpha * (fresh["host"] - fresh["direct"])
                via = (1-alpha)*fresh["direct"] + alpha*fresh["host"]
                assert math.isclose(via-fresh["direct"], delta, abs_tol=0.00001)
                assert 0 <= via <= 100
            paths_checked += 1
    assert paths_checked == 63
    for iso in ("VNM", "MYS", "PHL"):
        row = derived["comparisons"]["USA"]["paths"][iso]
        assert row["original"]["delta"] < 0 < row["fresh"]["delta"]
    assert len({i["dataset"] for i in original["meta"]["indicators"]}) == 11
    assert len({next(i["dataset"] for i in original["meta"]["indicators"] if i["key"] == key) for key in keys}) == 6
    assert (100 - 72 - 5 - 10) / 60 * 100 == 21.666666666666668
    parser = Structure()
    html = (ROOT / "index.html").read_text(encoding="utf-8")
    parser.feed(html)
    assert len(parser.ids) == len(set(parser.ids)), "Duplicate HTML IDs"
    assert all(anchor in parser.ids for anchor in parser.anchors), "Broken in-page navigation"
    assert all((ROOT / resource).is_file() for resource in parser.resources), "Missing page resource"
    assert all(not resource.startswith(("http:", "https:")) for resource in parser.resources)
    print("PASS: 16 economies, 8 common indicators, 6 source datasets, 63 route calculations.")
    print("PASS: year bounds, contribution totals, alpha endpoints and 3 USA sign reversals.")
    print("PASS: HTML navigation, unique IDs, resources and offline dependencies.")
    print("Scope: input-score consistency only; original record collection and actual route losses remain unverified.")


if __name__ == "__main__":
    main()
