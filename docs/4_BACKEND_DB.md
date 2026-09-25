# 4_BACKEND_DB.md: 本轮持久化约定

本轮不改 SQLite schema、不写迁移。

## 玩家存档

- 键：`loreweaver_player_state_${workspaceId}`；无工作区时回退 `loreweaver_player_state`。
- 读写封装在 `src/runtime/playerState.ts`。
- 切换工作区读取对应键；缺失则用 `INITIAL_PLAYER_STATE`，不把全局旧档迁入新项目。
- 重置只删当前工作区键。

## 工作区文件

`data/workspaces/<id>/manifest.json` 仍是项目规格源。本轮不改 workspace API，也不改 SQLite。

## 编排生成

- 入口是现有 `backend/agents.py` 的 `WorldBuilderAgent.generate_gdd`。
- 有 Grok 密钥时返回模型 JSON，调用方不得把它写回 `xuanjiezhimen_fangame_preset.json` 或石牧 workspace。
- 没有 `XAI_API_KEY` 和 `GROK_API_KEY` 时返回 `get_procedural_preset`。`OLLAMA_API_BASE` 不切换 provider。

## 本阶段已核对

- 有密钥的一次 `generate_gdd` 返回 provider `grok`、标题 `Clockwork Harbor Ascension`、12 个节点。石牧预设文件字节未改。
- 去掉密钥并设置 `OLLAMA_API_BASE` 后连跑两次，两次都是程序预设《玄界之门·石牧武途（同人原型）》，provider 为 `null`，日志没有 `generated via grok`。
- 玩家存档仍是浏览器 `localStorage`，没有新表。主界面若和关卡结算抢写，必须合并 `completedNodeIds`、`unlockedNodeIds`、`unlockedAbilities`、`unlockedPassives`，不能用旧列表覆盖。
