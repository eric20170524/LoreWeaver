# 08_SCENE_LIFECYCLE.md: 单页面架构场景生命周期与卫生规范 (Scene Hygiene)

## 背景与痛点
在 H5 同人微端游戏中，为了避免传统多页面应用 (MPA) 切换带来的“白屏”、“音乐中断”和“性能损耗”，我们采用单页面/单画布 (SPA) 架构。整个游戏的流转依托于 Phaser 的 `Scene Manager` (`this.scene.start()`)。

**失去的代价**：浏览器不再替我们进行全盘的垃圾回收和状态物理隔离。若处理不当，极易出现“幽灵 UI 残留”、“旧定时器报错”、“同一帧触发多次切换导致死锁”等致命 Bug。

为了确保 SPA 架构达到原生客户端一样的绝对稳定性，所有开发人员必须遵循以下 **Scene Hygiene (场景卫生)** 准则：

---

## 准则 1：幂等性切换锁 (Transition Lock)
在离开当前场景（如死亡、撤退、通关）时，必须防止 Phaser 的物理引擎在同一帧内多次触发碰撞回调，从而导致并发调用破坏场景栈。
- **强制规范**：所有导致场景退出的入口函数（如 `endGame()`），首行必须加入防重入锁。
```javascript
endGame(success) {
    if (this.isTransitioning) return;
    this.isTransitioning = true;
    
    // ... 后续的暂停与跳转逻辑
    this.physics.pause();
    this.scene.start('NextScene');
}
```
*另外注意：状态变量必须在 `init()` 或 `create()` 中被重置为 `false`。*

## 准则 2：UI 平行场景的显式陪葬 (Explicit Parallel Shutdown)
如果局内拉起了一个平行 Scene 用于显示 UI 或弹窗 (`this.scene.launch('Node1UI')`)，引擎在关闭主场景时**不会**自动帮你关闭并行的 UI 场景。
- **强制规范**：谁创建，谁销毁。在退出主场景前，必须显式将其停止。
```javascript
// 正确做法：
this.scene.stop(this.uiSceneKey); // 杀掉平行的 UI 场景
this.scene.start('MainScene');    // 再启动新场景
```

## 准则 3：渲染对象的按需重建 (State & Display Object Reset)
`this.scene.start()` 会重用现有的 Scene 实例，但会彻底清空其底层的 Display List (显示列表)。
- **强制规范**：**绝对不要**缓存 Phaser 渲染对象（如 `this.container`）并在重新进入时使用 `if(!this.container)` 来跳过创建。它只会保留一个已经被销毁的指针，导致画面不可见！
- **正确做法**：`create()` 生命周期就是用来绘图的，所有显示的元素必须在每次进入时重新 `this.add...`。只需保留纯粹的数值状态（如分页下标 `this.currentPage`）。

## 准则 4：独立数据通信 (Payload Bridge)
场景之间严禁通过修改对方实例的方法来传递数据（即禁用 `scene.get('...').xxx = yyy`）。
- **强制规范**：严格使用 `store.js` 写入持久化数据，或使用 `this.scene.start('Next', { payload: data })` 单向传递只读的副本。
  * **主干向关卡切入 (Main -> Node)**：使用 `NodeBridge.launchNode(mainScene, nodeId)` 触发，封装带有境界洞天加成后的实时玩家属性载荷 `playerStats` 并传递。
  * **关卡向主干结算 (Node -> Main)**：Node 历练结束（胜利/失败/撤退）后，调用 `parentScene.endGame(success)` 触发，构造统一结算载荷，调用 `store.applyNodeResult(result)` 写入，并由单向流转切入 `GameOverScene` 展示后，最终 `scene.start('MainScene')` 返回主场景，自动唤起挂机 Tick 与重绘。

## 准则 5：离线模块的自动注销
如果场景内启动了与 Phaser 生命周期无关的业务引擎（如挂机引擎、全局事件监听），当场景 Shutdown 时它们依然会偷偷运行并可能报错。
- **强制规范**：在 `create()` 中使用 `.once('shutdown', ...)` 进行后事处理。
```javascript
this.events.once('shutdown', () => {
    if (this.idleEngine) this.idleEngine.stop();
});
```
