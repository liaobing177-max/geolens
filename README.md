# 研究报告

最终交付位于 `output/`：可编辑 Word 与同版 PDF。

- 正文来源：`research-report.json`。
- 文档生成：`scripts/build_report.py`，包含原生 Word 公式与三线表。
- 图表生成：`scripts/make_figures.py`，`figures/` 保留 PNG、PDF、SVG。
- 独立审查：`review.md`。统计复算使用项目内 `research/original-data.json` 与 `assets/derived.js`。

报告以原 PSR 为主口径，共同八项仅作替代口径与逐项剔除检验。路径结果为设定权重下的国别分数比较，不表示税负、概率、因果效应或投资回报。

## 重新生成

使用 Codex workspace dependency loader 返回的 Python 运行 `scripts/build_report.py`，再用 documents 技能中的 `render_docx.py` 导出 PDF 与页图。

在本机 bundled LibreOffice 的 headless 环境中，需令 `FONTCONFIG_FILE` 指向本目录 `fontconfig.xml`，以读取系统宋体、黑体并使用可写字体缓存。移动项目后须同步修改配置中的缓存目录。此配置仅用于本次渲染，不安装字体或改变系统设置。

导出命令形态：

```sh
FONTCONFIG_FILE="/absolute/project/report/fontconfig.xml" \
  /bundled/python3 /documents/skill/render_docx.py \
  report/output/东南亚布局政策风险研究报告.docx \
  --output_dir report/render --emit_pdf
```

以逐页 PNG 目视确认字体、公式、图表、分页后，将导出的 PDF 复制至 `output/`。`render/` 为内部排版校验文件。
