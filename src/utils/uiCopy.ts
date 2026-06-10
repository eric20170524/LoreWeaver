import { Locale } from "../types";

export const UI_COPY = {
  zh: {
    subtitle: "自主同人 H5 游戏智能生成引擎 v3.0",
    languageLabel: "语言",
    languageValue: "中文",
    themePlaceholder: "输入你想生成的个人题材（例如：东方玄幻、星海学院、赛博修行...）",
    compiling: "正在编制世界...",
    compile: "编译小说 IP",
    pipelineTitle: "编排管线 (DAG)",
    pipelineBadge: "精确管线 1.1 ~ 3.3",
    reviewState: "等待人机确认",
    runningState: "正在编译组装",
    progressLabel: "主控进行进度",
    stages: [
      { name: "DNA 萃取 (1.1)", desc: "同人 IP DNA 逆向萃取与数值编制" },
      { name: "大纲规划 (1.2)", desc: "剧情大纲树、数值惩罚编制" },
      { name: "宿主架设 (2.1)", desc: "自动部署脚手架、锁定宽屏尺寸" },
      { name: "状态注入 (2.2)", desc: "动态导入 store / data 寄存配方" },
      { name: "物理编译 (3.1)", desc: "工厂代码与 Phaser 物理机制绑定" },
      { name: "声相强化 (3.2)", desc: "Web Audio 合成、多维抖动特效" },
      { name: "多模审计 (3.3)", desc: "视觉 VLM QA 诊断异常并沉淀知识" }
    ],
    tabs: {
      emulator: "WebGL H5 模拟器",
      prd: "作品设计方案",
      gameplay: "玩法卡工作台",
      manifest: "游戏配置清单",
      vlm: "VLM 视觉审计"
    },
    emulator: {
      status: "H5 沙盒运行状态",
      engine: "Phaser v3.60 • WebGL 运行中",
      unlocked: "已解锁",
      completed: "已通关",
      realm: "修仙境界",
      reset: "重置进度",
      sizeLabel: "模拟器尺寸",
      sizes: {
        compact: "小 (360px)",
        standard: "中 (440px)",
        large: "大 (520px)"
      },
      emptyTitle: "未检测到修真配置",
      emptyDesc: "请在页面上方自定义一个同人小说 IP 题材，然后点击“编译小说 IP”开始智能构置游玩的卡片关卡。"
    },
    prd: {
      badge: "游戏企划案 / GDD",
      file: "docs/01_PRD.md",
      desc: "系统自动生成的同人小说游戏设计文案与数值蓝图",
      edit: "编辑方案",
      preview: "预览方案",
      save: "保存修改",
      discard: "放弃修改",
      overview: "IP 特征指数与主要经济循环",
      title: "同人作品名称",
      currency: "主要等价值代币",
      themeColor: "智能配色方案",
      resources: "辅助资源",
      resource: "资源",
      realms: "修真境界等阶层级表",
      realm: "境界等阶",
      nodes: "主线十二关节点卡片配置",
      levelPrefix: "第",
      levelSuffix: "关",
      nodeTitle: "关卡标题",
      intro: "关卡简介",
      mechanics: "关卡玩法",
      goal: "目标分数",
      reward: "通关造化",
      empty: "尚未获得企划数据。请在页面上方一键编译同人 IP 题材。"
    },
    mechanics: {
      tap_reaction: "敏捷聚灵 (Tap)",
      collect_dodge: "虚空飞渡 (Dodge)",
      memory_sequence: "心魂律动 (Memory)"
    },
    gameplay: {
      desc: "每次修改先生成 L2 patch，确认后创建 revision，并只标记受影响 node 与 gate。",
      cards: "玩法卡",
      revisions: "修订",
      manual: "L3/L4 人工审阅",
      pendingPatch: "待确认 Patch",
      discard: "丢弃",
      apply: "确认应用",
      node: "节点",
      adapter: "适配器",
      baseCard: "基础玩法卡",
      patchPolicy: "Patch 策略",
      policy1: "L0/L1：文案与参数，可直接形成 patch。",
      policy2: "L2：玩法卡与 modifier 组合，需要确认后应用。",
      policy3: "L3/L4：adapter/core 修改，必须人工审阅后再进入实现。",
      latest: "最近修订",
      noRevision: "暂无 revision。确认第一个 gameplay patch 后会生成。",
      empty: "尚未加载 manifest，无法管理玩法卡。"
    },
    manifest: {
      desc: "数据持久化主数据注册列表",
      valid: "JSON 规范格式验证通过",
      empty: "尚未保存清单数据。请编译小说 IP 生成实时内容。"
    },
    vlm: {
      title: "双视口多模态视觉智能审计",
      desc: "通过大语言视觉模型自动高差对比分析、重叠检测与文本折行溢出评估",
      running: "正在抓取像素矩阵...",
      run: "运行实时视觉审计",
      result: "智能视觉多模态大模型判定结论",
      pass: "成功(PASS)",
      notice: "提示(NOTICE)",
      prompt: "向后传递之 Prompt 知识蒸馏重排",
      promptAdd: "+ 提示分支追加优化规约:",
      empty: "尚未执行视觉审计。点击“运行实时视觉审计”抓取游戏视窗渲染树检查。"
    },
    logs: {
      title: "后台编译器实时日志",
      collapse: "收起",
      button: "日志",
      empty: "编译器日志当前处于被动监听。",
      hint: "在上方输入同人主题，点击“编译小说 IP”启动编制管线。"
    },
    footer: "LoreWeaver 游戏编制案设计器及 H5 模拟器 • 在本地/容器沙盒中通过 Phaser v3 WebGL 引擎安全渲染运行"
  },
  en: {
    subtitle: "AI-assisted personal H5 game workbench v3.0",
    languageLabel: "Language",
    languageValue: "EN",
    themePlaceholder: "Enter a personal theme, e.g. academy fantasy, star cultivation, cyber trials...",
    compiling: "Weaving world...",
    compile: "Compile Story IP",
    pipelineTitle: "Orchestrator Pipeline (DAG)",
    pipelineBadge: "Pipeline 1.1 ~ 3.3",
    runningState: "Compiling",
    reviewState: "Needs review",
    progressLabel: "Pipeline progress",
    stages: [
      { name: "DNA Extraction (1.1)", desc: "Theme DNA and numeric design" },
      { name: "Outline Planning (1.2)", desc: "Story arc, node cards, and progression" },
      { name: "Host Setup (2.1)", desc: "Scaffold deployment and viewport contract" },
      { name: "State Injection (2.2)", desc: "Store/data registry and recipes" },
      { name: "Physics Build (3.1)", desc: "Adapter binding and Phaser runtime behavior" },
      { name: "Audio Polish (3.2)", desc: "Web Audio synthesis and feedback effects" },
      { name: "Visual Audit (3.3)", desc: "VLM QA, layout diagnosis, and learnings" }
    ],
    tabs: {
      emulator: "WebGL H5 Emulator",
      prd: "Design Brief",
      gameplay: "Gameplay Cards",
      manifest: "Manifest JSON",
      vlm: "VLM Visual Audit"
    },
    emulator: {
      status: "H5 sandbox status",
      engine: "Phaser v3.60 • WebGL active",
      unlocked: "Unlocked",
      completed: "Cleared",
      realm: "Realm",
      reset: "Reset progress",
      sizeLabel: "Simulator Size",
      sizes: {
        compact: "Small (360px)",
        standard: "Medium (440px)",
        large: "Large (520px)"
      },
      emptyTitle: "No game spec detected",
      emptyDesc: "Enter a personal theme above, then compile it into playable card-based levels."
    },
    prd: {
      badge: "Game Design Brief / GDD",
      file: "docs/01_PRD.md",
      desc: "Generated design copy, economy, and level blueprint",
      edit: "Edit Brief",
      preview: "Preview",
      save: "Save Edits",
      discard: "Discard",
      overview: "IP signals and economy loop",
      title: "Work title",
      currency: "Primary currency",
      themeColor: "Theme color",
      resources: "Auxiliary resources",
      resource: "Resource",
      realms: "Progression realms",
      realm: "Realm",
      nodes: "Main 12 level cards",
      levelPrefix: "Stage",
      levelSuffix: "",
      nodeTitle: "Level title",
      intro: "Level intro",
      mechanics: "Mechanic",
      goal: "Goal score",
      reward: "Reward",
      empty: "No design data yet. Compile a theme first."
    },
    mechanics: {
      tap_reaction: "Tap reaction",
      collect_dodge: "Collect & dodge",
      memory_sequence: "Memory sequence"
    },
    gameplay: {
      desc: "Each edit creates an L2 patch first; applying it creates a revision and marks only affected nodes/gates.",
      cards: "cards",
      revisions: "revisions",
      manual: "L3/L4 manual review",
      pendingPatch: "Pending Patch",
      discard: "Discard",
      apply: "Apply",
      node: "Node",
      adapter: "adapter",
      baseCard: "Base card",
      patchPolicy: "Patch Policy",
      policy1: "L0/L1: copy and numeric params can be patched directly.",
      policy2: "L2: gameplay card and modifier changes need confirmation.",
      policy3: "L3/L4: adapter/core edits require manual review before implementation.",
      latest: "Latest Revisions",
      noRevision: "No revision yet. Apply the first gameplay patch to create one.",
      empty: "Manifest is not loaded, so gameplay cards cannot be managed."
    },
    manifest: {
      desc: "Primary persisted game data registry",
      valid: "JSON schema format looks valid",
      empty: "No manifest saved yet. Compile a theme to generate content."
    },
    vlm: {
      title: "Dual-viewport multimodal visual audit",
      desc: "Checks contrast, overlap, and text wrapping with a visual model workflow",
      running: "Capturing pixel matrix...",
      run: "Run Visual Audit",
      result: "Visual model verdict",
      pass: "PASS",
      notice: "NOTICE",
      prompt: "Prompt reflow notes",
      promptAdd: "+ Added downstream prompt rule:",
      empty: "No visual audit yet. Run the audit to inspect the game viewport."
    },
    logs: {
      title: "Compiler Live Logs",
      collapse: "Collapse",
      button: "Logs",
      empty: "Compiler logs are idle.",
      hint: "Enter a theme above and run the compile pipeline."
    },
    footer: "LoreWeaver design workbench and H5 emulator • Safely rendered through Phaser v3 WebGL in a local/container sandbox"
  }
} as const;
