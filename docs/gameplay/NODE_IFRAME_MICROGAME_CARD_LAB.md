# H5 子游戏容器 Card Lab

第二十三张 `node_iframe_microgame` 经共享 RuntimeKernel / GameRunner 的真实 iframe 路径接入，入口 `?card=node_iframe_microgame`。附带“光点采集”子游戏，默认 15 秒内采集四次，支持鼠标、触屏和空格。它通过 URL 接收 NodePayload，通过 postMessage 返回结果；宿主实际应用奖励并保存完成节点。

容器检查当前 iframe 的发送窗口及来源，拒绝其他窗口、旧会话和重复结算。监听器先于挂载注册，销毁清除监听器、超时和 DOM，并恢复原画布。URLSearchParams 保留 Unicode、base64 加号、已有查询参数和锚点。file:// 的消息来源按 opaque origin 匹配，同时保留发送窗口身份检查。

支持 base64_json / plain_json、标准 NodeResult / 旧 reward、覆盖 / 文档流布局，以及 NODE_CLOSE / NODE_EXIT。默认宿主消息超时为 0（不限）；子游戏本身有真实倒计时。暂停需要子游戏先声明 NODE_READY supportsPause，支持时同时冻结宿主超时并发送暂停协议；暂停期间已在途结果只缓存一次。旧子游戏未声明能力时禁用暂停按钮，不能宣称它已暂停。

```sh
node productize/jobs/check-iframe-runtime.mjs
node productize/jobs/run-iframe-card-lab-e2e.mjs
npx tsc --noEmit
```

九项状态机测试覆盖编码、来源、重复消息、旧窗口/销毁、兼容消息、暂停、超时预算、解析错误和零节点编号。八个真实浏览器场景覆盖标准结果奖励去重、明文旧结果和文档流布局、子游戏自然超时、宿主消息超时、双倒计时暂停、伪造来源与三次重开/退出、390px 触控和离线文件通关。成功子游戏连续发送两次结果，断言宿主仅保存一次完成节点，资源增加 3，并解锁 iframe_focus 与 iframe_demo_clear。

这些证据仅认证所附示例与容器协议路径，不代表任意外部 H5 游戏具备正确暂停、结果或安全行为。卡片保留 runtime_ready，证据 synthetic:true / releaseEligible:false；没有正式美术或真机发布认证。构建 revision 仅为基点，实际文件 SHA-256 标识包含并行工作区修改的测试对象。原六卡云端矩阵未覆盖本卡。

报告和截图在 `workflow/reports/card-lab/node_iframe_microgame/`；[验收摘要](../reports/card_lab_23_2026-09-21.json) 保存最终构建哈希和场景结果。
