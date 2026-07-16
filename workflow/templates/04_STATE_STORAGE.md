# 04_STATE_STORAGE.md: 全局状态与静态数据存储规范模板

## 1. 核心状态字典 (Global State — Store.js)
定义游戏运行过程中的动态状态数据结构。该状态必须完全可序列化为 JSON，并依赖底层 Store.js 定期存储入 `localStorage` (如 `{project}_save`)。
**结构规范示例:**
```json
{
  "version": 1,
  "lastSaveTime": 0,
  "statistics": {
    "totalPlayTime": 0
  },
  "resources": {
    "currencyA": 0,
    "currencyB": 0
  },
  "progression": {
    "level": 1,
    "unlockedNodes": [1],
    "completedNodes": []
  },
  "nodeResults": {},
  "perks": {},
  "inventory": [],
  "storyFlags": []
}
```

## 2. 静态注册表结构 (Registries — data.js)
定义只读的配置文件，存放诸如关卡信息、武器面板、角色成长线等数据字典。
**常见分类:**
- `PROGRESSION_REGISTRY`: 定义每一级的经验/资源消耗及解锁内容。
- `NODE_REGISTRY`: 定义子节点的场景配置、Boss 信息、机制、奖励、失败惩罚及预设环境。
- `SKILL_POOL_REGISTRY`: 定义局内可供抽取的随机技能及能力修正池。
- `ENEMY_REGISTRY`: 定义各阶段敌人的生命、攻击及特殊 AI 行为。

`NODE_REGISTRY` 的最低字段标准：

```javascript
{
  id: 1,
  title: "Node 标题",
  intro: "战前动员文本",
  taunts: ["Boss 台词", "主角回应"],
  duration: 120,
  enemyPool: ["enemy_a"],
  boss: "boss_a",
  rewards: { currencyA: 50 },
  failPenalty: { rewardMultiplier: 0.5 },
  mechanics: { type: "survival" },
  sceneClass: "Node1Scene"
}
```

## 3. 跨场景通信协议载荷 (Node Communication Payload)
定义主界面与战斗(Node)场景之间的数据总线交互结构，保持松耦合。

### 3.1 启动场景 (INIT_NODE: Main -> Node)
发送玩家初始状态及外部增益的只读副本。
```json
{
  "nodeId": 1,
  "nodeConfig": {},
  "baseStats": {
    "hp": 100,
    "atk": 10
  },
  "artifacts": {
    "itemA_level": 1
  }
}
```

### 3.2 节点结算 (NODE_RESULT: Node -> Main)
将局内的战斗成果回传给主场景用于结算并持久化。
```json
{
  "nodeId": 1,
  "success": true,
  "duration": 120,
  "kills": 12,
  "rewards": {
    "currencyA": 50
  },
  "unlockNextNode": true,
  "flags": ["node1_cleared"]
}
```

结算写回要求：

- `Store` 统一处理奖励、通关记录、解锁、剧情 flag 和失败惩罚。
- Node 内不得直接写主干 HUD；只能生成 `nodeResult` 并返回 Main。
- 新增状态字段必须同步更新默认状态、存档迁移或兼容读取逻辑、E2E 断言。
