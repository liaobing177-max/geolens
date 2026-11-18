"""Package the local research page without external runtime dependencies."""
from pathlib import Path
import re
import shutil

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "dist"


def main():
    html = (ROOT / "index.html").read_text(encoding="utf-8")
    css = (ROOT / "assets/style.css").read_text(encoding="utf-8")
    html = html.replace('<link rel="stylesheet" href="assets/style.css">', '<style>\n' + css + '\n</style>')

    def inline(match):
        relative = match.group(1)
        content = (ROOT / relative).read_text(encoding="utf-8")
        content = re.sub(r"</script", r"<\\/script", content, flags=re.I)
        return '<script>\n' + content + '\n</script>'

    html = re.sub(r'<script src="(assets/[^\"]+)"></script>', inline, html)
    output = ROOT / "psr-refined-single-file.html"
    output.write_text(html, encoding="utf-8")
    DIST.mkdir(exist_ok=True)
    (DIST / "index.html").write_text(html, encoding="utf-8")
    print(f"Single-file page: {output} ({output.stat().st_size:,} bytes)")
    print(f"Preview root: {DIST}")


if __name__ == "__main__":
    main()
