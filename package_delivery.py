"""Assemble a self-contained handoff with documented inputs and checksums."""
from pathlib import Path
import csv
import hashlib
import json
import shutil
import subprocess
import zipfile

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'delivery'
NAME = '东南亚政策风险研究交付包-20261012'
STAGE = OUT / NAME


def read_js(path):
    if path.name == 'evidence.js':
        node = shutil.which('node') or '/Users/zhiminwang/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node'
        script = "const fs=require('fs'),vm=require('vm');const c={window:{}};vm.runInNewContext(fs.readFileSync(process.argv[1],'utf8'),c,{timeout:1000});process.stdout.write(JSON.stringify(c.window.PSR_EVIDENCE));"
        return json.loads(subprocess.run([node, '-e', script, str(path)], check=True, capture_output=True, text=True).stdout)
    return json.JSONDecoder().raw_decode(path.read_text().split('=', 1)[1].lstrip())[0]


def write_csv(path, fields, rows):
    with path.open('w', encoding='utf-8-sig', newline='') as stream:
        writer = csv.DictWriter(stream, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)


def main():
    OUT.mkdir(exist_ok=True)
    STAGE.mkdir(exist_ok=True)
    files = ['psr-refined-single-file.html', 'index.html', 'README.md']
    for directory in ['assets', 'research', 'scripts', 'exports', 'report/output', 'report/figures', 'report/scripts']:
        files.extend(str(p.relative_to(ROOT)) for p in (ROOT / directory).rglob('*')
                     if p.is_file() and '__pycache__' not in p.parts)
    files.extend(['report/README.md', 'report/research-report.json', 'report/fontconfig.xml'])
    files.append('reference/psr-original.html')
    for name in files:
        dest = STAGE / name
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(ROOT / name, dest)
    data_dir = STAGE / 'data'
    data_dir.mkdir(exist_ok=True)
    original = json.loads((ROOT / 'research/original-data.json').read_text())
    derived = read_js(ROOT / 'assets/derived.js')
    for name, value in [('original-data.json', original), ('derived-results.json', derived),
                        ('policy-evidence.json', read_js(ROOT / 'assets/evidence.js')),
                        ('source-catalog.json', original['meta']['datasets']),
                        ('indicator-dictionary.json', original['meta']['indicators'])]:
        (data_dir / name).write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding='utf-8')
    common = set(derived['summary']['globalCommonIndicators'])
    meta = original['meta']['indicators']
    country_rows, indicator_rows = [], []
    for iso, c in original['countries']['countries'].items():
        country_rows.append({'iso3':iso, 'psr':c.get('psr'), 'n_indicators':c.get('n_indicators'),
                             'coverage':c.get('coverage'), 'in_main_sample':c.get('in_pool'),
                             'rank':c.get('rank'), **{i['key']:c['indicators'].get(i['key']) for i in meta}})
        for i in meta:
            key = i['key']
            indicator_rows.append({'iso3':iso, 'indicator':key, 'dataset':i['dataset'],
                                   'raw_value':c.get('indicator_raw',{}).get(key),
                                   'risk_percentile':c['indicators'].get(key), 'year':c.get('years',{}).get(key),
                                   'risk_direction':i['direction'], 'in_common8':key in common})
    write_csv(data_dir / 'country-scores.csv', list(country_rows[0]), country_rows)
    write_csv(data_dir / 'indicator-observations.csv', list(indicator_rows[0]), indicator_rows)
    for p in (ROOT / 'exports').glob('*.csv'):
        shutil.copy2(p, data_dir / p.name)
    (data_dir / '数据说明.md').write_text('''# 数据说明

`original-data.json` 是从团队提供的原始 HTML 提取的完整交接数据，保留国别、时序、元数据、原模型与验证记录；不是此次重新下载的各数据库全量原始记录。

`country-scores.csv` 包含 230 个包内实体的原 PSR、有效指标数量、覆盖率、样本标记和 14 项风险百分位。`in_main_sample` 为原研究的 51 个主样本标记。排名沿用原数据。

`indicator-observations.csv` 为 230 × 14 = 3220 条指标记录，保留原始变量、风险百分位、观测年份、来源和共同八项标记。空单元格表示缺失，不表示零。`risk_direction` 的 +1 表示原始变量越高风险越高，-1 相反；`risk_percentile` 已统一为高分表示相对风险较高，不应再次逆向。

`source-catalog.json` 为 15 个来源的元数据、来源 URL 与许可标记；11 个来源参与原 PSR 的 14 项。`indicator-dictionary.json` 沿用交接元数据，部分原命名表达风险概念，解读原始变量与方向时请同时参照研究报告表 1。

`derived-results.json` 为共同八项、63 条路径、指标贡献和逐项剔除结果；`policy-evidence.json` 为网页政策证据与出处。两个路径 CSV 对应原 PSR 和共同八项，均采用 α = 0.45。

数据基准为 2023 年，包含较早观测；政策核验截至 2026-10-12。共同八项仅是稳健性对照。分数与模型分差不是税率、损失概率、因果效应或收益率。复算方法见根目录 README 和 research/measurement.md。
''', encoding='utf-8')
    (STAGE / '交付说明.md').write_text('''# 东南亚政策风险研究交付包

## 打开网页

解压后双击根目录 `psr-refined-single-file.html`。代码、图表库、数据均内嵌，离线可用；查看外部政策来源需要网络。`index.html` 与 `assets/` 是可维护版本，移动时请保持相对目录完整。

## 内容

- `data/`：完整 JSON、国别与指标 CSV、两种口径的路径 CSV、来源目录及数据说明。CSV 为 UTF-8 BOM，可用 Excel 打开。
- `report/output/`：六页中文研究报告，Word 可编辑，PDF 为同版阅读稿。
- `report/figures/`：四张报告图的 PNG、SVG 和 PDF。
- `research/`：原输入 JSON、指标方法和研究审计说明。
- `scripts/`：计算、校验、单文件网页构建与打包脚本。
- `reference/psr-original.html`：团队提供的原始网页，供溯源。
- `README.md`：研究方法、运行与复算说明。
- `文件校验清单.json`：包内文件大小与 SHA-256。

报告采用原 PSR 为主指标，共同八项仅用于稳健性检验。数据来自已有交接包；上游原始采集尚未复现。正式参赛前请对照主办方模板补充作者与队伍信息。
''', encoding='utf-8')
    manifest = [{'path':str(p.relative_to(STAGE)), 'bytes':p.stat().st_size,
                 'sha256':hashlib.sha256(p.read_bytes()).hexdigest()}
                for p in sorted(STAGE.rglob('*')) if p.is_file() and p.name != '文件校验清单.json']
    (STAGE / '文件校验清单.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
    archive = OUT / (NAME + '.zip')
    with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED) as z:
        for p in sorted(STAGE.rglob('*')):
            if p.is_file():
                z.write(p, arcname=str(Path(NAME) / p.relative_to(STAGE)))
    with zipfile.ZipFile(archive) as z:
        assert z.testzip() is None
        for entry in manifest:
            content = z.read(str(Path(NAME) / entry['path']))
            assert hashlib.sha256(content).hexdigest() == entry['sha256']
    print(f'{archive}\n{archive.stat().st_size:,} bytes; {len(manifest)+1} files; ZIP CRC and SHA-256 verified.')


if __name__ == '__main__':
    main()
