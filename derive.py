#!/usr/bin/env python3
"""Recompute transparent comparisons from the supplied, rounded PSR scores.

No scraping, imputation, restandardisation or estimation occurs here. The input
is retained unchanged; this script only averages its existing percentile scores.
Run: python3 sea-risk-observatory/scripts/derive.py
"""
from __future__ import annotations

import hashlib
import json
import math
from pathlib import Path
from statistics import mean


ROOT = Path(__file__).resolve().parents[1]
INPUT = ROOT / "research" / "original-data.json"
OUTPUT = ROOT / "assets" / "derived.js"
BASE_YEAR = 2023
REFERENCE_YEAR = 2026
MAX_AGE = 3
ALPHA = 0.45
LABELS = {
    "VNM": "越南", "THA": "泰国", "MYS": "马来西亚", "IDN": "印度尼西亚",
    "KHM": "柬埔寨", "PHL": "菲律宾", "SGP": "新加坡", "USA": "美国",
    "DEU": "德国", "NLD": "荷兰", "GBR": "英国", "CAN": "加拿大",
    "AUS": "澳大利亚", "MEX": "墨西哥", "IND": "印度", "BRA": "巴西",
    "CHN": "中国",
}


def rounded(value: float | None) -> float | None:
    return None if value is None else round(value, 6)


def average(record: dict, keys: list[str]) -> float | None:
    if not keys or any(record["indicators"].get(k) is None for k in keys):
        return None
    return mean(record["indicators"][k] for k in keys)


def dimensions(record: dict, keys: list[str], indicators: dict) -> dict:
    return {
        dim: rounded(average(record, [k for k in keys if indicators[k]["dim"] == dim]))
        for dim in ("A", "B", "C")
    }


def common_keys(codes: list[str], all_keys: list[str], records: dict) -> list[str]:
    return [k for k in all_keys if all(records[c]["indicators"].get(k) is not None for c in codes)]


def fresh_keys(codes: list[str], keys: list[str], records: dict) -> list[str]:
    # "Fresh" here means relative to the historical base year, never to today.
    return [k for k in keys if all(
        isinstance(records[c]["years"].get(k), (int, float))
        and 0 <= BASE_YEAR - records[c]["years"][k] <= MAX_AGE for c in codes
    )]


def scenario(host: float | None, target: float | None) -> dict:
    if host is None or target is None:
        return {"direct": target, "host": host, "via": None, "delta": None, "alpha": ALPHA}
    return {
        "direct": rounded(target), "host": rounded(host),
        "via": rounded((1 - ALPHA) * target + ALPHA * host),
        "delta": rounded(ALPHA * (host - target)), "alpha": ALPHA,
    }


def ranks(values: dict[str, float]) -> dict[str, float]:
    ordered = sorted(values, key=lambda c: (values[c], c))
    result = {}
    start = 0
    while start < len(ordered):
        end = start + 1
        while end < len(ordered) and values[ordered[end]] == values[ordered[start]]:
            end += 1
        for c in ordered[start:end]:
            result[c] = (start + 1 + end) / 2
        start = end
    return result


def spearman(first: dict[str, float], second: dict[str, float]) -> float | None:
    codes = [c for c in first if c in second]
    if len(codes) < 2:
        return None
    r1, r2 = ranks({c: first[c] for c in codes}), ranks({c: second[c] for c in codes})
    a, b = mean(r1.values()), mean(r2.values())
    denominator = math.sqrt(sum((r1[c] - a) ** 2 for c in codes) * sum((r2[c] - b) ** 2 for c in codes))
    return None if denominator == 0 else rounded(sum((r1[c] - a) * (r2[c] - b) for c in codes) / denominator)


def sign(value: float) -> int:
    return (value > 0) - (value < 0)


def main() -> None:
    source_bytes = INPUT.read_bytes()
    source = json.loads(source_bytes)
    meta, records = source["meta"], source["countries"]["countries"]
    indicators = {i["key"]: i for i in meta["indicators"]}
    all_keys = list(indicators)
    hubs, targets = meta["countries"]["sea"], meta["countries"]["target"]
    assert len(all_keys) == 14 and len(hubs) == 7 and len(targets) == 9

    # Audit the published equal-weight PSR at the available export precision.
    audit_rows = []
    for iso, record in records.items():
        keys = [k for k in all_keys if record["indicators"].get(k) is not None]
        if record["psr"] is None:
            assert not keys
            continue
        assert len(keys) == record["n_indicators"]
        assert all(0 <= record["indicators"][k] <= 100 for k in keys)
        indicator_mean = average(record, keys)
        dim_mean = mean(v for v in record["dims"].values() if v is not None)
        error = abs(indicator_mean - record["psr"])
        # Both indicator scores and PSR are exported at two decimal places.
        assert error <= 0.010001, (iso, error)
        assert abs(record["psr_by_weight"]["equal"] - record["psr"]) < 1e-9
        audit_rows.append({
            "iso3": iso, "published": record["psr"],
            "indicatorEqual": rounded(indicator_mean), "dimensionEqual": rounded(dim_mean),
            "roundingError": rounded(error),
        })

    comparisons = {}
    for target in targets:
        codes = hubs + [target]
        keys = common_keys(codes, all_keys, records)
        fresh = fresh_keys(codes, keys, records)
        assert len(keys) > 0 and len(fresh) > 0
        scores = {}
        for iso in codes:
            record = records[iso]
            scores[iso] = {
                "commonScore": rounded(average(record, keys)),
                "freshScore": rounded(average(record, fresh)),
                "originalScore": record["psr"],
                "originalByWeight": record["psr_by_weight"],
                "commonDims": dimensions(record, keys, indicators),
                "freshDims": dimensions(record, fresh, indicators),
                "commonYears": {k: record["years"][k] for k in keys},
            }
        paths = {}
        for hub in hubs:
            path = scenario(scores[hub]["commonScore"], scores[target]["commonScore"])
            path["fresh"] = scenario(scores[hub]["freshScore"], scores[target]["freshScore"])
            path["original"] = scenario(records[hub]["psr"], records[target]["psr"])
            path["originalByWeight"] = {
                w: scenario(records[hub]["psr_by_weight"][w], records[target]["psr_by_weight"][w])
                for w in meta["weights"]
            }
            # Per-indicator contributions sum exactly to delta before rounding.
            path["contributions"] = [
                {"key": k, "host": records[hub]["indicators"][k],
                 "target": records[target]["indicators"][k],
                 "contribution": rounded(ALPHA * (records[hub]["indicators"][k] - records[target]["indicators"][k]) / len(keys))}
                for k in keys
            ]
            assert abs(sum(x["contribution"] for x in path["contributions"]) - path["delta"]) < 0.00001
            deltas = {}
            for omitted in keys:
                remaining = [k for k in keys if k != omitted]
                deltas[omitted] = rounded(ALPHA * (average(records[hub], remaining) - average(records[target], remaining)))
            low, high = min(deltas.values()), max(deltas.values())
            path["leaveOneOut"] = {
                "deltas": deltas, "minDelta": low, "maxDelta": high,
                "directionStable": sign(low) == sign(high) == sign(path["delta"]),
                "description": "逐一删除一个共同指标后的确定性重算范围；不是置信区间。",
            }
            fresh_deltas = {
                omitted: rounded(ALPHA * (average(records[hub], [k for k in fresh if k != omitted])
                                           - average(records[target], [k for k in fresh if k != omitted])))
                for omitted in fresh
            }
            fresh_low, fresh_high = min(fresh_deltas.values()), max(fresh_deltas.values())
            path["fresh"]["leaveOneOut"] = {
                "deltas": fresh_deltas, "minDelta": fresh_low, "maxDelta": fresh_high,
                "directionStable": sign(fresh_low) == sign(fresh_high) == sign(path["fresh"]["delta"]),
                "description": "逐一删除一个统一时效指标后的确定性重算范围；不是置信区间。",
            }
            path["fresh"]["contributions"] = [
                {"key": k, "host": records[hub]["indicators"][k],
                 "target": records[target]["indicators"][k],
                 "contribution": rounded(ALPHA * (records[hub]["indicators"][k] - records[target]["indicators"][k]) / len(fresh))}
                for k in fresh
            ]
            path["originalDirection"] = sign(path["original"]["delta"])
            path["commonDirection"] = sign(path["delta"])
            path["directionChanged"] = path["originalDirection"] != path["commonDirection"]
            paths[hub] = path
        comparisons[target] = {
            "target": target, "countries": codes, "commonIndicators": keys,
            "freshIndicators": fresh, "scores": scores,
            "targetScore": scores[target]["commonScore"],
            "freshTargetScore": scores[target]["freshScore"],
            "commonSourceCount": len({indicators[k]["dataset"] for k in keys}),
            "hubOrder": sorted(hubs, key=lambda h: (scores[h]["commonScore"], h)),
            "paths": paths,
        }

    stored_errors = []
    for hub in hubs:
        for target in targets:
            published = source["springboard"]["premium"][hub][target]
            computed = comparisons[target]["paths"][hub]["original"]
            for key in ("direct", "host", "via"):
                stored_errors.append(abs(published[key] - computed[key]))
            stored_errors.append(abs(published["premium"] - computed["delta"]))
    assert max(stored_errors) <= 0.010001

    # Pairwise intersections answer individual comparisons only. Different pairs
    # must never be used as a single cross-hub ranking because the keys vary.
    pairwise = {}
    for hub in hubs:
        pairwise[hub] = {}
        for target in targets:
            keys = common_keys([hub, target], all_keys, records)
            fresh = fresh_keys([hub, target], keys, records)
            item = scenario(average(records[hub], keys), average(records[target], keys))
            item.update({
                "keys": keys, "freshKeys": fresh,
                "hostScore": item["host"], "targetScore": item["direct"],
                "fresh": scenario(average(records[hub], fresh), average(records[target], fresh)),
                "crossPairComparable": False,
            })
            pairwise[hub][target] = item

    anchor = comparisons["USA"]
    fixed_keys, fixed_fresh = anchor["commonIndicators"], anchor["freshIndicators"]
    country_out = {}
    for iso, record in records.items():
        observed = [k for k in all_keys if record["indicators"].get(k) is not None]
        stale = [{"key": k, "year": record["years"][k],
                  "age": BASE_YEAR - record["years"][k],
                  "ageAt2026": REFERENCE_YEAR - record["years"][k]}
                 for k in observed if record["years"].get(k) is not None and BASE_YEAR - record["years"][k] > MAX_AGE]
        country_out[iso] = {
            "iso3": iso, "name": LABELS.get(iso, iso),
            "commonScore": rounded(average(record, fixed_keys)),
            "freshScore": rounded(average(record, fixed_fresh)),
            "originalScore": record["psr"], "originalByWeight": record["psr_by_weight"],
            "coverage": record["coverage"], "nIndicators": len(observed),
            "missing": [k for k in all_keys if k not in observed],
            "stale": stale, "staleCount": len(stale),
            "unknownYear": [k for k in observed if record["years"].get(k) is None],
            "inCommonComparison": iso in anchor["countries"],
            "inPool": record["in_pool"], "dataSufficient": record["data_sufficient"],
            "commonDims": dimensions(record, fixed_keys, indicators) if average(record, fixed_keys) is not None else None,
        }

    original_order = sorted(hubs, key=lambda h: (records[h]["psr"], h))
    common_order = anchor["hubOrder"]
    changed = [h for h in hubs if anchor["paths"][h]["directionChanged"]]
    stable = [h for h in hubs if anchor["paths"][h]["leaveOneOut"]["directionStable"]]
    fresh_scores = {h: anchor["scores"][h]["freshScore"] for h in hubs}
    fresh_order = sorted(hubs, key=lambda h: (fresh_scores[h], h))
    # All nine comparisons share the same strict-age indicator set.
    assert all(c["freshIndicators"] == fixed_fresh for c in comparisons.values())
    global_countries = hubs + targets
    assert common_keys(global_countries, all_keys, records) == fixed_keys
    assert fresh_keys(global_countries, fixed_keys, records) == fixed_fresh
    assert len(pairwise) * len(targets) == 63
    result = {
        "schemaVersion": 1, "anchor": "USA", "alpha": ALPHA,
        "baseYear": BASE_YEAR, "referenceYear": REFERENCE_YEAR,
        "freshness": {"maxAge": MAX_AGE, "relativeTo": BASE_YEAR,
                      "label": "基准年时效对照（2020–2023）", "currentPolicyMeasure": False},
        "source": {"file": "research/original-data.json", "sha256": hashlib.sha256(source_bytes).hexdigest(),
                   "inputChanged": False, "usesRoundedExportedPercentiles": True},
        "commonIndicators": fixed_keys, "freshIndicators": fixed_fresh,
        "commonCountries": anchor["countries"], "hubs": hubs, "targets": targets,
        "countries": country_out, "comparisons": comparisons, "pairwise": pairwise,
        "summary": {
            "nOriginalCountries": len(records), "nScoredCountries": len(audit_rows),
            "nPoolCountries": sum(c["in_pool"] for c in records.values()),
            "nDeclaredIndicators": len(all_keys), "nDatasetsListed": len(meta["datasets"]),
            "nIndicatorDatasets": len({i["dataset"] for i in indicators.values()}),
            "commonIndicatorCount": len(fixed_keys), "commonSourceCount": anchor["commonSourceCount"],
            "omittedFromCommon": [k for k in all_keys if k not in fixed_keys],
            "originalHubOrder": original_order, "commonHubOrder": common_order, "freshHubOrder": fresh_order,
            "seaRankCorrelationOriginalCommon": spearman({h: records[h]["psr"] for h in hubs}, {h: country_out[h]["commonScore"] for h in hubs}),
            "changedDirectionUSA": changed, "leaveOneOutStableUSA": stable,
            "originalCommonSignFlips": [
                {"hub": hub, "target": target,
                 "originalDelta": comparisons[target]["paths"][hub]["original"]["delta"],
                 "commonDelta": comparisons[target]["paths"][hub]["delta"]}
                for target in targets for hub in hubs if comparisons[target]["paths"][hub]["directionChanged"]
            ],
            "sameFreshSetAcrossTargets": True,
            "globalCommonIndicators": fixed_fresh,
            "globalCountries": global_countries,
            "globalCommonScores": {c: rounded(average(records[c], fixed_fresh)) for c in global_countries},
            "deltaUnit": "分数点（指数差），不是税率百分点或概率百分点。",
            "commonPercentileLimit": "仅统一平均时的指标集合；原百分位各指标的有效国家池可能不同，缺少原始样本与变换脚本，未重排百分位。",
            "alphaEffect": "alpha > 0 时只能缩放差距，不会改变正负或路径排序；alpha = 0 时全部差距为 0。",
            "publishedEqualWeightAudit": {
                "n": len(audit_rows), "formula": "所有非缺失指标等权平均；不是三个维度等权平均。",
                "maxAbsoluteDifference": max(r["roundingError"] for r in audit_rows),
                "tolerance": 0.010001, "passes": True,
                "focus": [r for r in audit_rows if r["iso3"] in anchor["countries"]],
            },
            "publishedPathAudit": {"nPaths": 63, "maxAbsoluteDifference": rounded(max(stored_errors)),
                                   "passes": True, "tolerance": 0.010001},
        },
        "findings": [
            {"id": "comparison-basis", "title": "先统一尺子，再比较路径",
             "text": "美国与七个东南亚经济体共同拥有 8 个指标、来自 6 个数据集。主对照固定使用这 8 个既有百分位分数等权平均，不把缺失值当零。"},
            {"id": "direction-fragility", "title": "越南、马来西亚、菲律宾的方向对口径敏感",
             "countries": changed,
             "text": "这三个经济体相对美国的情景差距，从原始 PSR 的负值变成共同指标的正值。变化来自比较口径，不能解释成现实风险增加或减少。"},
            {"id": "sensitivity", "title": "微小分差不足以支持投资排序",
             "text": "逐项剔除共同指标后，越南、马来西亚、菲律宾和印度尼西亚的差距跨零。新加坡和柬埔寨保持负值，泰国保持正值；稳定性仅限此项指标删除检查。"},
            {"id": "freshness", "title": "历史基准与近期政策分层",
             "text": "共同 8 项均为 2021 或 2023 年观测。相对 2023 的三年时效筛选不改变美国对照；不能据此评估 2025–2026 年关税或产品原产地规则。"},
            {"id": "interpretation", "title": "分差是数学情景，不是风险概率",
             "text": "delta = alpha ×（中转地分数－目标市场分数）是研究者设定的加权情景。它没有观测到中转带来的因果效应、实际税率差、企业损失或预期投资收益。"},
        ],
    }
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text("// Generated by scripts/derive.py. Preserve original-data.json unchanged.\nwindow.PSR_DERIVED = " + json.dumps(result, ensure_ascii=False, separators=(",", ":")) + ";\n", encoding="utf-8")
    print(json.dumps({"output": str(OUTPUT), "commonKeys": fixed_keys,
                      "scoresUSA": {c: anchor["scores"][c]["commonScore"] for c in anchor["countries"]},
                      "changedDirectionUSA": changed, "maxRoundingError": result["summary"]["publishedEqualWeightAudit"]["maxAbsoluteDifference"]}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
