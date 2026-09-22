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

手动架势必须有桌面键位与移动端右侧按钮，按钮文案反映当前架势。石牧路线上每一关刀弓都写 `controlMode: "manual"`，标签用黑刀 / 紫钢弓。主界面列出节点 1–12；未通关的下一关锁定，结算成功才解锁。

## 4. 本阶段

主界面滚动列表就是 12 关入口，不另做选关页。关卡场景启动时停掉 MainScene，避免挂机计时器还在画旧的通关勾。试玩断言读 `completedNodeIds` 和 modifier `config`，不靠按钮文案猜成长。
