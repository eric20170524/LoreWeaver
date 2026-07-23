# C7 真人试玩签字单 — `survivor_horde`

> **用途**: `production_ready` 硬门槛之一。未签字前不得将 `exportPolicy.productionReady` 设为 true。  
> **自动化状态**: `signoff_status: pending`

---

## 元数据

| 字段 | 值 |
| --- | --- |
| cardId | `survivor_horde` |
| signoff_status | pending |
| 试玩人 | _待填_ |
| 日期 | _待填_ |
| 构建 / specHash | _填写与 standalone 或 demo 报告一致的 hash_ |
| 平台 | Desktop / Mobile（请勾选实际试玩端） |

---

## 试玩清单（全部勾选并签字后改为 approved）

- [ ] 可进入关卡，首帧非黑屏，操作提示可理解  
- [ ] 移动 / 自动攻击流畅，无明显卡顿（主观 OK）  
- [ ] 可胜利（撑过时长或击败 Boss）  
- [ ] 可失败（HP 归零）且结算正确  
- [ ] 可撤退并返回外壳  
- [ ] 暂停 / 恢复正常，无双 BGM、无残留 timer  
- [ ] 文案无明显溢出遮挡（肉眼）  
- [ ] 角色与敌人可辨识（真 atlas 或可接受原型）  
- [ ] 未发现阻断级 bug（崩溃、卡死、无法结算）  

---

## 结论

- 试玩结论：_通过 / 有条件通过 / 不通过_  
- 已知问题：_列表_  
- **签字**：_姓名 / 日期_  

将本文件顶部 `signoff_status: pending` 改为 `signoff_status: approved` 后，  
`npm run check:survivor-c7-readiness` 才会把 `human_playtest_approved` 记为通过。
