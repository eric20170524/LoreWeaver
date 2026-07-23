# 主题换皮验证 — survivor_horde demo

> **时间**: 2026-07-23  
> **命令**: `npm run check:survivor-theme-skin`

## 能力

| Query | 内容包 | 标题示例 |
| --- | --- | --- |
| `?theme=wasteland`（默认） | `theme_content_pack.fixture.json` | 荒域生存试炼 |
| `?theme=cyber` | `theme_content_pack.cyber_pulse.json` | 霓虹脉冲清场 |
| `?locale=en` | 同上 | 英文 locale |

Demo 菜单标题 / intro / 操作提示 / HUD 标签 / 胜败撤退文案均来自 Theme Content Pack，**不改 adapter 源码**。

本地预览：

```text
# 需用 survivor demo 的 Vite 端口（E2E 临时端口或单独起 demo）
# 工作台仍用 http://localhost:3000
```

## 结果

自动化：`survivor_theme_skin_latest.json` → **passed**（两主题标题/HUD/胜负文案均不同）。

## 边界

- 仅 **demo 文案换皮**；工作台 IDE 全链路注入尚未做。  
- **不**因此提升 `production_ready`。  
