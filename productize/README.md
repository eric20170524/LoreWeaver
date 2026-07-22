# LoreWeaver Universal Productize Pipeline

LoreWeaver 引擎通用产品化、质检与打包发布管线（Productization & Standalone Export Pipeline）。

此管线独立于任何特定的游戏业务逻辑，可接受任意符合规范的 Gameplay Workspace（如 `data/workspaces/<workspace-id>`），执行数据编译、资产防篡改校验、静态 Web 打包导出及自动化冒烟测试。

---

## 1. 核心命令表 (Generic CLI Commands)

所有导出与验证脚本显式要求通过 `--workspace=<path>` 参数指定目标工作空间：

| 命令 | 用途与目标 | 说明 / 参数示例 |
| --- | --- | --- |
| `npm run productize:export` | **导出独立 Web 发布包** | 必需指定 `--workspace` 参数。<br>`npm run productize:export -- --workspace=data/workspaces/<ws_id> --allow-unverified-browser` |
| `npm run productize:compile` | **编译冷启动工作空间** | 将 Gameplay Card V2 转化为冷启动 Web 工作空间。 |
| `npm run productize:card` | **校验 Gameplay Card 架构契约** | 验证卡片 JSON 结构合法性。 |
| `npm run productize:asset-job` | **静态资产无害化与完整性验证** | 检查音效/图集资源。<br>`npm run productize:asset-job -- --workspace=data/workspaces/<ws_id> --job=audio_verify` |
| `npm run productize:patch` | **源码补丁快照与应用** | 管理引擎核心机制补丁。 |
| `npm run productize:qa` | **通用全量 QA 编排** | `npm run productize:qa -- --workspace=data/workspaces/<ws_id>` |
| `npm run productize:accept` | **生成交付证据索引与机器验收报告** | `npm run productize:accept -- --workspace=data/workspaces/<ws_id>` |
| `npm run productize:runtime-spec-check` | **引擎运行时 Spec 编译器校验** | 通用引擎核心契约检查。 |
| `npm run productize:runtime-kernel-check` | **引擎内核契约校验** | 验证 Runtime Kernel 契约。 |

---

## 2. 导出包目录结构 (Standalone Export Package Layout)

执行 `productize:export` 导出的包将位于 `productize/exports/standalone-<ws_id>-<timestamp>.zip`，解压后目录结构如下：

```
standalone-<ws_id>/
├── index.html                   # 独立 Web 入口 (基于 productize/standalone 宿主)
├── standalone.css               # 入口样式
├── assets/                      # 静态资源 (音频, 纹理图集, 图像)
├── bundle.js                    # 包含解包后的 Runtime Spec & 引擎核心 bundle
├── manifest.json                # 导出源元数据
└── integrity_manifest.json      # 全包文件的 SHA-256 校验清单 (防篡改)
```

---

## 3. 人类验收关口 (Human Gates)

自动化管线跑通后，最终验收仍保留真人体验关口：
- `reports/human_playtest_latest.json` (ownerType=human)
- 在 `requirementStatus: accepted` 之前需要人类操作员完成最终确认。

---

## 4. 目录职责划分 (Layout)

- `productize/schemas/` — Gameplay Card V2 + source patch schemas
- `productize/standalone/` — 独立部署宿主模版 (HTML/CSS/TS)
- `productize/exports/` — 打包生成的独立 ZIP 发布包与解压冒烟目录
- `productize/jobs/` — 引擎核心通用契约与对齐检查 Job
- `productize/templates/` — 微引擎模板库（如 `campaign_phaser_v1`）
- `workflow/reports/` — 产品化质量证据与验收报告 JSON
