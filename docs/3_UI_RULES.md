# 3_UI_RULES.md: 本轮 UI 约定

## 1. 两套文案源

- 工作台 React：继续用 `src/utils/uiCopy.ts` 的 `UI_COPY[locale]`。本轮不新增工作台可见字符串则不改字典。
- Phaser 游戏：可见文案来自当前 `GameSpec`（境界、货币、被动名、按钮 label）。modifier 默认英文通用词（MELEE/RANGED），preset 可覆盖为黑刀/紫钢弓。

## 2. 测试定位

Phaser 画在 canvas 上，无法挂 `data-testid`。本轮交互通过：

- `adapter.handleSemanticInput({ action: "toggle_stance" })`
- `adapter.getTestState()` / modifier `getTestState()`
- 既有 canvas 坐标点击（修炼按钮沿用 `perkBtn.getCenter()`）

禁止用旧 IP 字符串当选择器。

## 3. 切态控件

手动架势必须有桌面键位与移动端右侧按钮，按钮文案反映当前架势。
