# 简要步骤报告: Step A1 — `survivor_horde` Golden Asset Fixture 与降级规则断言

> **交付物ID**: `step_A1_art_binder_fallback_rules`  
> **关联任务**: `task.md` Phase A1 (A1 美术生产接线 & Golden Fixture)  
> **完成时间**: 2026-07-23  

---

## 1. Golden Asset Fixture 建立

针对首张竖切关卡 `survivor_horde` 建立了标准的 Golden Asset Fixture 规范文件：
- **文件路径**: `minigame_master/gameplay/cards/fixtures/survivor_horde/golden_asset_fixture.json`
- **内容覆盖**:
  1. `playerClips`: `idle`, `walk`, `attack`, `hurt`, `death` 动画帧契约映射；
  2. `enemyKinds`: `mob` (wild_rhino), `elite` (green_scaled_eagle), `boss` (qiongqi_cub) 敌人种类语义绑定；
  3. `environments`: `bg_default` 场景背景图层；
  4. `audioCues`: `bgm_main`, `sfx_attack`, `sfx_hit`, `sfx_win`, `sfx_lose` 音频 Cue 映射。

---

## 2. 生产与原型降级 (Procedural Fallback) 策略规范与静态校验

在契约校验逻辑 `productize/jobs/check-runtime-art-binder.js` 中确立并强化了以下策略：

| 模式 | 策略定义 | 静态契约与暴露行为 |
| --- | --- | --- |
| **生产模式 (Production)** | `allowProceduralFallback: false` | 契约声明禁止关键角色/敌人/背景使用程序化占位矩形/圆形。 |
| **原型模式 (Prototype)** | `allowProceduralFallback: true` | 允许程序化图形降级，但必须在 `TestHooks` 与全局状态中暴露 `artSource: fallback` 或 `artSource: primitive` 标记，严禁假图伪装成生产图。 |

---

## 3. 校验结论与局限性说明

运行命令:
```bash
node productize/jobs/check-runtime-art-binder.js
```

**运行日志**:
```text
Running RuntimeArtBinder Asset Contract & Fallback Policy Checker...
[PASS] survivor_horde golden asset fixture validated (minigame_master/gameplay/cards/fixtures/survivor_horde/golden_asset_fixture.json)
RuntimeArtBinder Status: skipped_no_workspace_assets (Workspace Atlas Loaded: false)
RequiredAssets Contract Check: 23/23 cards have valid requiredAssets declarations.
```

> [!IMPORTANT]
> **验证结论澄清**:
> 1. **已验证项**: `requiredAssets` 结构契约完整性、`survivor_horde` Golden Fixture JSON 声明格式与 `RuntimeArtBinder.resolve()` 接口正确性。
> 2. **待验证项**: 由于无工作台 Atlas 时 `resolve()` 返回 `null`（仅静默触发程序化 Fallback 逻辑），**生产模式下缺失资产时的运行时抛错与强行阻断逻辑（Throw/Block）尚未在真实 Canvas/渲染层完成验证**，需在后续真实 Playwright E2E / 视觉 Hard Gate 步骤中进行测试。
