# 4_BACKEND_DB.md: 本轮持久化约定

本轮不改 SQLite schema、不写迁移。

## 玩家存档

- 键：`loreweaver_player_state_${workspaceId}`；无工作区时回退 `loreweaver_player_state`。
- 读写封装在 `src/runtime/playerState.ts`。
- 切换工作区读取对应键；缺失则用 `INITIAL_PLAYER_STATE`，不把全局旧档迁入新项目。
- 重置只删当前工作区键。

## 工作区文件

`data/workspaces/<id>/manifest.json` 仍是项目规格源。本轮不改 workspace API。
