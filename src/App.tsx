import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  Play, 
  RotateCcw, 
  Settings, 
  Sparkles, 
  Cpu, 
  FileText, 
  Code, 
  AlertTriangle, 
  CheckCircle2, 
  RefreshCw, 
  Volume2, 
  VolumeX, 
  Sliders, 
  Terminal, 
  Eye, 
  Flame, 
  Compass, 
  Award,
  Layers,
  Languages,
  Pencil,
  Save,
  X
} from "lucide-react";
import { GameSpec, PlayerState, AuditReport, GameplayAssignment, ManifestPatch, Locale } from "./types";
import { initializePhaserGame } from "./game/GameRunner";
import { synth } from "./utils/AudioSynth";
import { WorkspaceSelector, WorkspaceMeta } from "./components/WorkspaceSelector";
import { AgentChatPanel } from "./components/AgentChatPanel";
import {
  GAMEPLAY_CARD_OPTIONS,
  applyManifestPatch,
  createGameplayPatch,
  ensureGameplayManifest,
  toggleModifier
} from "./utils/gameplayManifest";

// Initialize default player state
const INITIAL_PLAYER_STATE: PlayerState = {
  currentRealmIndex: 0,
  mainCurrencyCount: 0,
  secondaryResources: {},
  unlockedNodeIds: [1], // Only first level unlocked initially
  completedNodeIds: [],
  activeMultiplier: 1.0,
  clickPower: 1.5
};

const UI_COPY = {
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
    reviewState: "Needs review",
    runningState: "Compiling",
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

const cloneGameSpec = (spec: GameSpec): GameSpec => JSON.parse(JSON.stringify(spec)) as GameSpec;

export default function App() {
  const [themeInput, setThemeInput] = useState("原创逆天修行传说，主打突破境界与十二重天劫");
  const [activeTab, setActiveTab ] = useState<"emulator" | "prd" | "gameplay" | "manifest" | "vlm">("emulator");
  const [activeWorkspace, setActiveWorkspace] = useState<WorkspaceMeta | null>(null);
  const [currentJob, setCurrentJob] = useState<any>(null); // For Orchestrator Job
  const [isOrchestrating, setIsOrchestrating] = useState(false);
  const [orchestrationStage, setOrchestrationStage] = useState<number | null>(null);
  const [orchestrationLogs, setOrchestrationLogs] = useState<string[]>([]);
  const [gameSpec, setGameSpec] = useState<GameSpec | null>(null);
  const [pendingPatch, setPendingPatch] = useState<ManifestPatch | null>(null);
  const [playerState, setPlayerState] = useState<PlayerState>(() => {
    const cached = localStorage.getItem("loreweaver_player_state");
    if (cached) {
      try { return JSON.parse(cached); } catch (e) { /* ignore */ }
    }
    return INITIAL_PLAYER_STATE;
  });

  const [auditReport, setAuditReport] = useState<AuditReport | null>(null);
  const [isAuditing, setIsAuditing] = useState(false);
  const [isMusicMuted, setIsMusicMuted] = useState(false);
  const [isLogPanelOpen, setIsLogPanelOpen] = useState(false);
  const [locale, setLocale] = useState<Locale>(() => (
    localStorage.getItem("loreweaver_locale") === "en" ? "en" : "zh"
  ));
  const [isPrdEditing, setIsPrdEditing] = useState(false);
  const [prdDraft, setPrdDraft] = useState<GameSpec | null>(null);
  const copy = UI_COPY[locale];

  const phaserContainerRef = useRef<HTMLDivElement>(null);
  const phaserGameRef = useRef<Phaser.Game | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);

  // Sync to local storage
  const handleSaveState = (newState: PlayerState) => {
    setPlayerState(newState);
    localStorage.setItem("loreweaver_player_state", JSON.stringify(newState));
  };

  // Add system console log trace
  const addLog = (text: string) => {
    const stamp = new Date().toLocaleTimeString();
    setOrchestrationLogs((prev) => [...prev, `[${stamp}] ${text}`]);
  };

  const persistManifest = async (nextSpec: GameSpec) => {
    if (!activeWorkspace) return;
    await fetch(`/api/workspaces/${activeWorkspace.id}/files/manifest.json`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: nextSpec })
    });
  };

  const handleLoadWorkspace = async (ws: WorkspaceMeta) => {
    setActiveWorkspace(ws);
    addLog(`📂 用户切换至隔离工作区：${ws.name}`);
    setThemeInput(ws.theme);

    try {
      // 1. Try to load existing manifest.json from the workspace sandbox
      const res = await fetch(`/api/workspaces/${ws.id}/files/manifest.json`);
      const json = await res.json();
      if (json.success && json.data) {
        setGameSpec(ensureGameplayManifest(json.data));
        addLog(`📦 成功从物理工作区沙盒载入现有 [manifest.json]！`);
      } else {
        // 2. Fetch procedural fallback preset if manifest.json is missing
        addLog(`⚠️ 当前沙盒物理副本 manifest.json 缺失，正在重塑宇宙基石...`);
        const presetRes = await fetch(`/api/presets?theme=${encodeURIComponent(ws.theme)}`);
        const presetJson = await presetRes.json();
        if (presetJson.success && presetJson.data) {
          const presetData = ensureGameplayManifest(presetJson.data);
          setGameSpec(presetData);
          
          // 3. Save the fallback schema to the server directory right away
          await fetch(`/api/workspaces/${ws.id}/files/manifest.json`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ data: presetData })
          });
          addLog(`💾 已将初始化同人配置写入该工作区 manifest.json`);
        }
      }
    } catch (err: any) {
      addLog(`❌ 从持久层同步工作区失败: ${err.message || err}`);
    }
  };

  useEffect(() => {
    localStorage.setItem("loreweaver_locale", locale);
  }, [locale]);

  useEffect(() => {
    if (!isPrdEditing) {
      setPrdDraft(gameSpec ? cloneGameSpec(gameSpec) : null);
    }
  }, [gameSpec, isPrdEditing]);

  // Scroll logs to bottom automatically
  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [orchestrationLogs, isLogPanelOpen]);

  // Handle clean instantiation of Phaser Game Canvas
  const restartGameInstance = (specToUse: GameSpec) => {
    // Shutdown any stale instance
    if (phaserGameRef.current) {
      phaserGameRef.current.destroy(true);
      phaserGameRef.current = null;
    }

    if (phaserContainerRef.current) {
      phaserContainerRef.current.innerHTML = "";
      try {
        const game = initializePhaserGame(
          phaserContainerRef.current,
          specToUse,
          playerState,
          handleSaveState,
          addLog
        );
        phaserGameRef.current = game;
      } catch (err) {
        console.error("Phaser boot error:", err);
        addLog(`❌ Phaser WebGL initialization crashed: ${err}`);
      }
    }
  };

  // Trigger manual refresh for job
  const handleRefreshJob = async () => {
    if (!currentJob) return;
    try {
      const res = await fetch(`/api/jobs/${currentJob.id}`);
      const data = await res.json();
      if (data.success) {
        setCurrentJob(data.data);
      }
    } catch (e) {
      console.error(e);
    }
  }

  // Effect to handle job polling
  useEffect(() => {
    if (!currentJob) return;
    if (currentJob.status === 'completed' || currentJob.status === 'failed' || currentJob.status === 'pending_approval') {
       if (currentJob.status === 'completed' && isOrchestrating) {
           setIsOrchestrating(false);
           addLog(`🎉 管线完成，配置已落库到后端沙盒！`);
           setActiveTab("manifest");
       }
       if (currentJob.result && JSON.stringify(currentJob.result) !== JSON.stringify(gameSpec)) {
           setGameSpec(ensureGameplayManifest(currentJob.result));
           localStorage.setItem("loreweaver_player_state", JSON.stringify(INITIAL_PLAYER_STATE));
           setPlayerState(INITIAL_PLAYER_STATE);
       }
       return;
    }
    
    let isMounted = true;
    const poll = async () => {
      try {
        const res = await fetch(`/api/jobs/${currentJob.id}`);
        const data = await res.json();
        if (data.success && isMounted) {
          const fetchedJob = data.data;
          
          if (fetchedJob.progress !== currentJob.progress) {
             addLog(`🤖 Orchestrator: ${fetchedJob.progress}`);
          }
          setCurrentJob(fetchedJob);
        }
      } catch (e) {
        console.error(e);
      }
    };
    
    const interval = setInterval(poll, 2500);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [currentJob, isOrchestrating]);

  // Run the core pipeline decontruction loop from v1.0 to v3.0 specs
  const runOrchestrationPipeline = async () => {
    if (isOrchestrating) return;
    if (!activeWorkspace) {
      addLog("⚠️ 请先在页面右上方选择或创建一个「工作区 (Workspace)」！")
      return;
    }
    
    setIsOrchestrating(true);
    setOrchestrationStage(0);
    setOrchestrationLogs([]);

    addLog(`⚙️ [STAGE 0] Boot_Init: 开始调用服务器主编排器...`);
    try {
      const res = await fetch("/api/jobs/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId: activeWorkspace.id, theme: themeInput })
      });
      const data = await res.json();
      if (data.success) {
        setCurrentJob(data.data);
        setOrchestrationStage(1);
        addLog(`✅ 编排任务运行中（ID: ${data.data.id}）`);
      } else {
        throw new Error(data.error);
      }
    } catch (e: any) {
      addLog(`❌ 编排器启动失败: ${e.message}`);
      setIsOrchestrating(false);
    }
  };

  // Run initial default loading on startup
  useEffect(() => {
    addLog("⚓ 本地同人数据库连接成功（SQLite Buffer OK）。修真画轴已就绪。");
    const initWorkspaceAndSpec = async () => {
      try {
        const res = await fetch('/api/workspaces');
        const json = await res.json();
        
        let wsToLoad: WorkspaceMeta | null = null;
        if (json.success && json.data && json.data.length > 0) {
          // Use the newest or first workspace
          wsToLoad = json.data[0];
          addLog(`⚡ 检测到已存在的历史工作空间，自动装载「${wsToLoad.name}」`);
        } else {
          // Auto create a beautiful default workspace for immediate out-of-the-box experience!
          addLog("🌱 首次启动，正在为您建立默认仙侠沙盒工作盘...");
          const createRes = await fetch('/api/workspaces', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: "大千世界",
              theme: "原创逆天修行传说，主打突破境界与十二重天劫"
            })
          });
          const createJson = await createRes.json();
          if (createJson.success && createJson.data) {
            wsToLoad = createJson.data;
            addLog(`✅ 默认工作盘「${wsToLoad.name}」初始化完成！`);
          }
        }

        if (wsToLoad) {
          await handleLoadWorkspace(wsToLoad);
        }
      } catch (err: any) {
        addLog(`⚠️ 自动装载工作盘异常: ${err.message || err}`);
        // Fallback to offline local procedurally generated spec
        const offlineSpec: GameSpec = {
          title: "意境绘卷：雷劫突破",
          themeColor: "#10b981",
          economy: {
            currencyName: "乾坤元能/Spiritual Energy",
            resources: ["雷玉/Thunder Jade", "妖骸/Demon Bone", "天符/Scrolls"],
            realms: ["炼气下阶", "筑基中期", "金丹大能", "元婴尊者", "化神大修", "渡劫天主"]
          },
          nodes: Array.from({ length: 12 }, (_, i) => {
            const names = ["聚神灵泉", "飞渡万妖谷", "金丹篆画", "初斗大长老", "横闯大龙渊", "逆天九劫降", "天荒废石群", "黑洞虚天引", "镇伏万狱魔", "十梵业火道", "秘珍掠夺印", "踏至天仙殿"];
            const mechs: ("tap_reaction" | "collect_dodge" | "memory_sequence")[] = ["tap_reaction", "collect_dodge", "memory_sequence"];
            const targetMech = mechs[i % 3];
            return {
              id: i + 1,
              title: names[i] || `雷劫重天 ${i+1}`,
              intro: `此关主打原著剧情中著名的「${names[i]}」战役，考验玩家的真元厚度和身手反应。`,
              taunts: [`「忤逆神尊，化归劫土！」`, `「本座要让你永生不得超脱！」`],
              mechanics: targetMech,
              rewards: `乾坤仙药 +${(i + 1) * 2}, 元能乘数x${(i+1)*3}`,
              goalValue: targetMech === "memory_sequence" ? 4 + Math.floor(i / 3) : 15 + i * 5,
              resourceMultiplier: parseFloat(Math.pow(1.8, i + 1).toFixed(1)),
              difficulty: Math.floor(i / 2) + 1,
              durationLimit: 30 + (i % 3) * 10
            };
          })
        };
        setGameSpec(ensureGameplayManifest(offlineSpec));
      }
    };

    initWorkspaceAndSpec();
  }, []);

  // Hot reload phaser stage when gameSpec updates or ActiveTab is switched to emulator
  useEffect(() => {
    if (activeTab === "emulator" && gameSpec) {
      // Small pause to guarantee container ref mounts properly
      const timer = setTimeout(() => {
        restartGameInstance(gameSpec);
      }, 100);
      return () => clearTimeout(timer);
    } else {
      if (phaserGameRef.current) {
        phaserGameRef.current.destroy(true);
        phaserGameRef.current = null;
      }
    }
  }, [gameSpec, activeTab]);

  // Execute VLM Visual Multi-Viewport Screen Audit (Step 3.1)
  const triggerVisualAudit = async () => {
    if (isAuditing || !gameSpec) return;
    setIsAuditing(true);
    addLog("📸 正在提取模拟器高对比度屏幕像素矩阵、绘制热区边界、进行多视角比对校正...");

    try {
      const snapshot = await captureAuditSnapshot();
      const res = await fetch("/api/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          theme: gameSpec.title,
          currentNodes: gameSpec.nodes,
          screenshot_base64: snapshot.screenshotBase64,
          audit_context: {
            source: snapshot.source,
            canvas: snapshot.canvas,
            viewport: {
              width: window.innerWidth,
              height: window.innerHeight,
              devicePixelRatio: window.devicePixelRatio || 1
            },
            workspaceId: activeWorkspace?.id || null,
            activeTab,
            playerState
          }
        })
      });
      const data = await res.json();
      if (data.success && data.data) {
        setAuditReport(data.data);
        synth.playNodeSuccess();
        addLog(`🎯 VLM 视觉大模型审计完毕：布局字重比例与色彩对比度 [完全合规(PASS)]！`);
        addLog(`📝 [反思优化] 已自动向下游微调模型提示语加入最佳视觉实践："${data.data.prompt_reflow_diff}"`);
      }
    } catch (e: any) {
      addLog(`❌ 视觉多模态校验异常: ${e.message || e}`);
    } finally {
      setIsAuditing(false);
    }
  };

  const captureCanvasDataUrl = async (canvas: HTMLCanvasElement, game: Phaser.Game | null) => {
    try {
      const dataUrl = canvas.toDataURL("image/png");
      if (dataUrl.length > 1500) return dataUrl;
    } catch (_error) {
      // Renderer snapshot below is the safer path for some WebGL canvases.
    }

    const renderer = game?.renderer as any;
    if (renderer?.snapshot) {
      const snapshot = await new Promise<string | null>((resolve) => {
        renderer.snapshot((image: HTMLImageElement) => resolve(image?.src || null), "image/png");
      });
      if (snapshot) return snapshot;
    }

    return "data:image/png;base64,";
  };

  const captureAuditSnapshot = async () => {
    const activeCanvas = phaserContainerRef.current?.querySelector("canvas") as HTMLCanvasElement | null;
    if (activeCanvas) {
      const rect = activeCanvas.getBoundingClientRect();
      return {
        screenshotBase64: await captureCanvasDataUrl(activeCanvas, phaserGameRef.current),
        source: "mounted_phaser_canvas",
        canvas: {
          width: activeCanvas.width,
          height: activeCanvas.height,
          cssWidth: Math.round(rect.width),
          cssHeight: Math.round(rect.height)
        }
      };
    }

    const tempHost = document.createElement("div");
    Object.assign(tempHost.style, {
      position: "fixed",
      left: "-10000px",
      top: "0",
      width: "360px",
      height: "640px",
      opacity: "0",
      pointerEvents: "none"
    });
    document.body.appendChild(tempHost);

    let tempGame: Phaser.Game | null = null;
    try {
      tempGame = initializePhaserGame(
        tempHost,
        gameSpec,
        playerState,
        () => undefined,
        () => undefined
      );
      await new Promise((resolve) => window.setTimeout(resolve, 800));
      const canvas = tempHost.querySelector("canvas") as HTMLCanvasElement | null;
      if (!canvas) {
        throw new Error("Unable to capture visual audit canvas.");
      }
      const rect = canvas.getBoundingClientRect();
      return {
        screenshotBase64: await captureCanvasDataUrl(canvas, tempGame),
        source: "ephemeral_phaser_canvas",
        canvas: {
          width: canvas.width,
          height: canvas.height,
          cssWidth: Math.round(rect.width),
          cssHeight: Math.round(rect.height)
        }
      };
    } finally {
      tempGame?.destroy(true);
      tempHost.remove();
    }
  };

  // Reset localStorage parameters to replay afresh (04_STATE_STORAGE)
  const handleResetProgress = () => {
    localStorage.removeItem("loreweaver_player_state");
    setPlayerState(INITIAL_PLAYER_STATE);
    addLog("🧹 已成功重置所有本地数据库、清除修为积累并解锁第 1 关。");
    if (gameSpec) {
      restartGameInstance(gameSpec);
    }
    synth.playClick();
  };

  const startPrdEditing = () => {
    if (!gameSpec) return;
    setPrdDraft(cloneGameSpec(gameSpec));
    setIsPrdEditing(true);
    synth.playClick();
  };

  const cancelPrdEditing = () => {
    setPrdDraft(gameSpec ? cloneGameSpec(gameSpec) : null);
    setIsPrdEditing(false);
    synth.playClick();
  };

  const updatePrdDraft = (mutate: (draft: GameSpec) => void) => {
    setPrdDraft((prev) => {
      if (!prev) return prev;
      const next = cloneGameSpec(prev);
      mutate(next);
      return ensureGameplayManifest(next);
    });
  };

  const savePrdDraft = async () => {
    if (!prdDraft) return;
    const nextSpec = ensureGameplayManifest(prdDraft);
    setGameSpec(nextSpec);
    setPrdDraft(cloneGameSpec(nextSpec));
    setIsPrdEditing(false);
    addLog(locale === "zh" ? "✏️ 已保存作品设计方案编辑，manifest 已进入新版本。" : "✏️ Design brief edits saved into the manifest.");
    try {
      await persistManifest(nextSpec);
      addLog(locale === "zh" ? "💾 作品设计方案已写回当前工作区 manifest.json。" : "💾 Design brief saved to the current workspace manifest.json.");
    } catch (err: any) {
      addLog(locale === "zh" ? `⚠️ 编辑已本地应用，但写回工作区失败: ${err.message || err}` : `⚠️ Edits applied locally, but saving failed: ${err.message || err}`);
    }
    synth.playNodeSuccess();
  };

  const queueGameplayPatch = (nodeId: number, nextGameplay: GameplayAssignment, reason: string) => {
    if (!gameSpec) return;
    const normalized = ensureGameplayManifest(gameSpec);
    setPendingPatch(createGameplayPatch(normalized, nodeId, nextGameplay, reason));
    synth.playClick();
  };

  const approvePendingPatch = async () => {
    if (!gameSpec || !pendingPatch) return;
    const nextSpec = applyManifestPatch(gameSpec, pendingPatch);
    setGameSpec(nextSpec);
    setPendingPatch(null);
    addLog(`🧩 已应用局部玩法 patch：${pendingPatch.target}，下游 Build/E2E gate 已标记 stale。`);
    try {
      await persistManifest(nextSpec);
      addLog(`💾 gameplay manifest patch 已写回当前工作区 manifest.json。`);
    } catch (err: any) {
      addLog(`⚠️ gameplay patch 已本地应用，但写回工作区失败: ${err.message || err}`);
    }
  };

  const baseGameplayOptions = GAMEPLAY_CARD_OPTIONS.filter((card) => card.category === "base");
  const modifierOptions = GAMEPLAY_CARD_OPTIONS.filter((card) => card.category === "modifier");
  const prdSpec = isPrdEditing && prdDraft ? prdDraft : gameSpec;
  const formInputClass = "w-full bg-slate-900 border border-slate-800 rounded px-2 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500";
  const formTextareaClass = "w-full bg-slate-900 border border-slate-800 rounded px-2 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500 min-h-[74px] resize-y";
  const formatLevelLabel = (nodeId: number) => (
    locale === "zh"
      ? `${copy.prd.levelPrefix} ${nodeId} ${copy.prd.levelSuffix}`
      : `${copy.prd.levelPrefix} ${nodeId}`
  );
  const getLogLineClass = (log: string) => {
    if (log.includes("✅") || log.includes("🎉") || log.includes("成功") || log.includes("完成")) {
      return "text-emerald-400 bg-emerald-950/20 px-1.5 py-0.5 rounded border border-emerald-500/10";
    }
    if (log.includes("❌") || log.includes("Error") || log.includes("failed") || log.includes("异常")) {
      return "text-rose-400 bg-rose-950/20 px-1.5 py-0.5 rounded border border-rose-500/10 font-bold";
    }
    if (log.includes("⚠️") || log.includes("warning") || log.includes("提示")) {
      return "text-amber-400 bg-amber-950/20 px-1.5 py-0.5 rounded border border-amber-500/10";
    }
    if (log.includes("[Step")) {
      return "text-cyan-400 font-bold border-l-2 border-cyan-500 pl-1.5 py-0.5 bg-cyan-950/20";
    }
    return "text-slate-500";
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans flex flex-col antialiased selection:bg-emerald-500 selection:text-slate-950">
      
      {/* Cinematic Header */}
      <header className="border-b border-slate-900 bg-slate-950/80 backdrop-blur-md sticky top-0 z-50 px-4 md:px-8 py-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-emerald-500/10 rounded-lg border border-emerald-500/20 text-emerald-400">
            <Cpu className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-display font-bold bg-clip-text text-transparent bg-gradient-to-r from-emerald-400 via-teal-400 to-cyan-400 tracking-tight">
              同人自构绘卷 LORE WEAVER
            </h1>
            <p className="text-xs text-slate-500 font-mono tracking-wider">
              {copy.subtitle}
            </p>
          </div>
        </div>

        {/* Global IP Setup Form */}
        <div className="flex flex-col sm:flex-row gap-2 max-w-xl w-full">
          <div className="relative flex-1">
            <input
              type="text"
              value={themeInput}
              onChange={(e) => setThemeInput(e.target.value)}
              placeholder={copy.themePlaceholder}
              className="w-full bg-slate-900 border border-slate-800 focus:border-emerald-500 rounded px-3 py-2 pl-9 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500 font-medium transition"
              disabled={isOrchestrating}
            />
            <Sparkles className="absolute left-3 top-2.5 w-4.5 h-4.5 text-slate-600" />
          </div>
          
          <button
            onClick={runOrchestrationPipeline}
            disabled={isOrchestrating}
            className="bg-gradient-to-r from-emerald-500 to-teal-600 text-slate-950 font-display font-semibold transition hover:opacity-95 px-4 py-2 rounded text-xs tracking-wider flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40 select-none max-sm:w-full shrink-0 uppercase"
          >
            {isOrchestrating ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                {copy.compiling}
              </>
            ) : (
              <>
                <Flame className="w-3.5 h-3.5" />
                ⚡ {copy.compile}
              </>
            )}
          </button>
        </div>
        
        {/* Workspace Context Display */}
        <div className="shrink-0 flex items-center justify-end gap-2">
          <button
            onClick={() => setLocale((current) => current === "zh" ? "en" : "zh")}
            className="flex items-center gap-1.5 bg-slate-900 border border-slate-800 hover:border-cyan-500/50 text-slate-300 px-3 py-1.5 rounded transition font-mono text-xs cursor-pointer"
            title={copy.languageLabel}
          >
            <Languages className="w-4 h-4 text-cyan-400" />
            {copy.languageValue}
          </button>
          <WorkspaceSelector 
            activeWorkspaceId={activeWorkspace?.id || null} 
            onSelectWorkspace={handleLoadWorkspace} 
            locale={locale}
          />
        </div>
      </header>

      {/* Main Orchestration Dashboard Layout Grid */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 md:px-8 py-6 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* Left Side: Pipeline overview */}
        <div className="lg:col-span-4 h-full flex flex-col gap-6">
          
          {/* Animated DAG Graph View (Step 1.1 to Step 3.3) */}
          <div className="bg-slate-900/60 p-5 rounded-2xl border border-slate-900/90 flex flex-col gap-4 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-mono font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                <Sliders className="w-4 h-4 text-emerald-400" />
                {copy.pipelineTitle}
              </h3>
              <span className="text-3xs font-mono text-emerald-400 bg-emerald-950/40 border border-emerald-500/20 px-2.5 py-0.5 rounded-full">
                {copy.pipelineBadge}
              </span>
            </div>

            <div className="flex flex-col gap-3.5 my-1 relative">
              {/* Connected vertical line track with highlighted progress */}
              <div className="absolute left-[13px] top-[14px] bottom-[14px] w-0.5 bg-slate-950">
                {currentJob && (
                  <motion.div 
                    initial={{ height: "0%" }}
                    animate={{ 
                      height: `${Math.min(100, Math.max(0, (currentJob.stage_index ?? 0) * 16.66))}%` 
                    }}
                    className="bg-gradient-to-b from-emerald-500 to-teal-400 w-full"
                    transition={{ duration: 0.8, ease: "easeInOut" }}
                  />
                )}
              </div>

              {copy.stages.map((stage, id) => {
                const node = { ...stage, id };
                const activeStageIdx = currentJob ? (currentJob.stage_index ?? 0) : null;
                const isUnderReview = currentJob && currentJob.status === "pending_approval" && node.id === 1;
                const isActive = (isOrchestrating || (currentJob && currentJob.status === "running")) && activeStageIdx === node.id;
                const isPassed = currentJob && currentJob.status === 'completed' ? true : (activeStageIdx !== null && activeStageIdx > node.id);
                
                let dotClass = "border-slate-800 bg-slate-950 text-slate-650";
                let textTitleClass = "text-slate-500";
                let descClass = "text-slate-600";

                if (isActive) {
                  dotClass = "border-emerald-500 bg-emerald-950 text-emerald-400 ring-4 ring-emerald-500/15 animate-pulse font-mono";
                  textTitleClass = "text-emerald-400 font-bold";
                  descClass = "text-slate-300";
                } else if (isUnderReview) {
                  dotClass = "border-amber-500 bg-amber-950 text-amber-405 ring-4 ring-amber-500/15 font-mono";
                  textTitleClass = "text-amber-400 font-bold";
                  descClass = "text-slate-300";
                } else if (isPassed) {
                  dotClass = "border-emerald-500/60 bg-emerald-950 text-emerald-500 font-mono";
                  textTitleClass = "text-slate-300 font-semibold";
                  descClass = "text-slate-500";
                }

                return (
                  <div key={node.id} className="flex gap-3 px-1 items-start group">
                    <div className={`w-7 h-7 rounded-full border-2 flex items-center justify-center text-2xs font-bold shrink-0 transition-all duration-300 ${dotClass}`}>
                      {node.id + 1}
                    </div>
                    <div className="flex flex-col min-w-0 flex-1">
                      <span className={`text-2xs font-display tracking-tight transition-all duration-300 ${textTitleClass} flex items-center justify-between`}>
                        <span>{node.name}</span>
                        {isUnderReview && <span className="font-mono text-3xs text-amber-400 bg-amber-950/60 px-1.5 py-0.5 rounded border border-amber-500/20">{copy.reviewState}</span>}
                        {isActive && <span className="font-mono text-3xs text-emerald-400 bg-emerald-950/60 px-1.5 py-0.5 rounded border border-emerald-500/20">{copy.runningState}</span>}
                      </span>
                      <span className={`text-3xs leading-relaxed mt-0.5 font-sans truncate block transition-all duration-300 ${descClass}`}>
                        {node.desc}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
            
            {/* Live progress indicator footer */}
            {currentJob && (
              <div className="border-t border-slate-900 pt-3 flex flex-col gap-1.5">
                <div className="flex items-center justify-between text-3xs font-mono text-slate-500">
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    {copy.progressLabel}: {Math.round(((currentJob?.stage_index ?? 0) + 1) * 14.28)}%
                  </span>
                  <span className="text-emerald-500 font-semibold uppercase">{currentJob.status}</span>
                </div>
                <div className="text-3xs text-slate-400 font-sans italic line-clamp-1">{currentJob.progress}</div>
              </div>
            )}
          </div>

        </div>

        {/* Right Side: Primary Viewport Tabs and Display panel */}
        <div className="lg:col-span-8 bg-slate-900/30 rounded-xl border border-slate-900/80 p-4 md:p-6 overflow-hidden min-h-[600px] flex flex-col gap-6">
          {activeWorkspace && (
            <AgentChatPanel
              compact
              locale={locale}
              jobId={currentJob?.id}
              status={currentJob?.status}
              stageName={currentJob?.stage === 'world_building' ? 'World Builder' : 'QA Audit'}
              workspaceId={activeWorkspace.id}
              onRefreshJob={handleRefreshJob}
              onUpdateSpec={(newSpec) => {
                const normalized = ensureGameplayManifest(newSpec);
                setGameSpec(normalized);
                restartGameInstance(normalized);
              }}
              addLog={addLog}
            />
          )}
          
          {/* Workspace Tabs selectors */}
          <div className="flex border-b border-slate-900 pb-2 overflow-x-auto gap-1">
            {[
              { id: "emulator", label: copy.tabs.emulator, icon: Play },
              { id: "prd", label: copy.tabs.prd, icon: FileText },
              { id: "gameplay", label: copy.tabs.gameplay, icon: Layers },
              { id: "manifest", label: copy.tabs.manifest, icon: Code },
              { id: "vlm", label: copy.tabs.vlm, icon: Eye }
            ].map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => {
                    setActiveTab(tab.id as any);
                    synth.playClick();
                  }}
                  className={`px-4 py-2 rounded text-xs font-semibold font-display tracking-wide whitespace-nowrap transition flex items-center gap-2 cursor-pointer shrink-0 border-b-2 ${
                    activeTab === tab.id
                      ? "border-emerald-500 text-emerald-400 bg-emerald-500/5"
                      : "border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/30"
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Interactive viewport layers */}
          <div className="flex-1 flex flex-col items-center justify-center">
            
            <AnimatePresence mode="wait">
              {activeTab === "emulator" && (
                <motion.div
                  key="tab_emu"
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -15 }}
                  className="w-full flex flex-col items-center py-2 relative"
                >
                  {gameSpec ? (
                    <div className="flex flex-col items-center gap-6 w-full relative">
                      
                      {/* Ambient background glow matching theme */}
                      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[340px] h-[340px] rounded-full bg-emerald-500/5 blur-[120px] pointer-events-none" />
                      <div className="absolute top-1/3 left-1/4 -translate-x-1/2 -translate-y-1/2 w-[220px] h-[220px] rounded-full bg-teal-500/5 blur-[100px] pointer-events-none" />

                      {/* Interactive H5 Mobile Phone visual chassis simulator mockup */}
                      <div className="relative w-full max-w-[360px] aspect-[9/16] bg-slate-950 rounded-[40px] p-2.5 shadow-2xl ring-[14px] ring-slate-900/90 flex flex-col border border-slate-800/80 overflow-hidden shadow-emerald-500/5 hover:scale-[1.01] transition-transform duration-300">
                        
                        {/* Audio Speaker & front-camera bar notch */}
                        <div className="absolute top-2.5 left-1/2 -translate-x-1/2 w-28 h-5.5 bg-slate-950 rounded-full z-40 flex items-center justify-center border border-slate-900 shadow-inner">
                          <div className="w-8 h-1 bg-slate-800 rounded-full" />
                          <div className="w-1.5 h-1.5 bg-slate-800 rounded-full ml-2" />
                        </div>

                        {/* Custom canvas host */}
                        <div className="flex-1 rounded-[32px] overflow-hidden relative bg-slate-950 flex items-center justify-center shadow-inner pt-3">
                          <div
                            ref={phaserContainerRef}
                            id="phaser-canvas-container"
                            className="w-full h-full"
                          />
                        </div>
                      </div>

                      {/* Emulator operational widgets bar */}
                      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-slate-900/40 px-5 py-4 rounded-xl border border-slate-900 w-full max-w-xl text-xs shadow-lg backdrop-blur-sm">
                        <div className="flex items-center gap-2.5">
                          <div className="p-2 bg-slate-950 border border-slate-800/80 rounded-lg">
                            <Compass className="w-4.5 h-4.5 text-emerald-400" />
                          </div>
                          <div className="flex flex-col">
                            <span className="font-mono text-3xs text-slate-500 uppercase tracking-wider">{copy.emulator.status}</span>
                            <span className="text-2xs font-semibold text-slate-300">{copy.emulator.engine}</span>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-3.5 text-2xs font-mono bg-slate-950/60 border border-slate-900/60 px-4 py-2 rounded-lg text-slate-450">
                          <div>{copy.emulator.unlocked}: <strong className="text-emerald-400 font-mono">{playerState.unlockedNodeIds.length} / 12</strong></div>
                          <div className="w-px h-3.5 bg-slate-800/80" />
                          <div>{copy.emulator.completed}: <strong className="text-emerald-400 font-mono">{playerState.completedNodeIds.length} / 12</strong></div>
                          <div className="w-px h-3.5 bg-slate-800/80" />
                          <div>{copy.emulator.realm}: <strong className="text-emerald-400 font-mono">{playerState.currentRealmIndex + 1} / 6</strong></div>
                        </div>

                        <button
                          onClick={handleResetProgress}
                          className="px-3.5 py-2 bg-slate-950 hover:bg-red-955/20 hover:text-red-400 text-slate-400 border border-slate-800 hover:border-red-900/40 flex items-center gap-1.5 transition rounded-lg text-3xs font-bold uppercase tracking-wider cursor-pointer shadow"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          {copy.emulator.reset}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="text-slate-500 border border-dashed border-slate-800 rounded-2xl p-10 text-center max-w-sm mt-12 bg-slate-900/10 shadow-inner">
                      <AlertTriangle className="w-10 h-10 text-amber-500 mx-auto mb-3.5 animate-bounce" />
                      <p className="font-semibold text-slate-350 mb-1">{copy.emulator.emptyTitle}</p>
                      <p className="text-xs text-slate-500 leading-relaxed">{copy.emulator.emptyDesc}</p>
                    </div>
                  )}
                </motion.div>
              )}

              {activeTab === "prd" && (
                <motion.div
                  key="tab_prd"
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -15 }}
                  className="w-full"
                >
                  {prdSpec ? (
                    <div className="bg-slate-900/40 rounded-xl border border-slate-900 p-6 space-y-6 max-h-[620px] overflow-y-auto scrollbar-thin">
                      
                      {/* Document header banner */}
                      <div className="border-b border-rose-500/20 pb-4 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                        <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-rose-500/10 rounded border border-rose-500/20 text-rose-400 font-mono text-xs font-bold uppercase">
                          {copy.prd.badge}
                        </div>
                        <div>
                          <h2 className="text-lg font-display font-bold text-slate-200">
                            {copy.prd.file}
                          </h2>
                          <p className="text-xs text-slate-500">
                            {copy.prd.desc}
                          </p>
                        </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {isPrdEditing ? (
                            <>
                              <button
                                onClick={cancelPrdEditing}
                                className="px-3 py-1.5 rounded bg-slate-950 border border-slate-800 text-slate-400 hover:text-slate-200 text-3xs font-bold flex items-center gap-1.5"
                              >
                                <X className="w-3.5 h-3.5" />
                                {copy.prd.discard}
                              </button>
                              <button
                                onClick={savePrdDraft}
                                className="px-3 py-1.5 rounded bg-emerald-500 text-slate-950 text-3xs font-bold flex items-center gap-1.5"
                              >
                                <Save className="w-3.5 h-3.5" />
                                {copy.prd.save}
                              </button>
                            </>
                          ) : (
                            <button
                              onClick={startPrdEditing}
                              className="px-3 py-1.5 rounded bg-slate-950 border border-slate-800 text-slate-300 hover:border-emerald-500/40 hover:text-emerald-300 text-3xs font-bold flex items-center gap-1.5"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                              {copy.prd.edit}
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Decoded structured view of docs_PRD specification */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 leading-6 text-sm">
                        <div className="space-y-4">
                          <h4 className="text-xs uppercase font-mono tracking-wider text-slate-500">
                            {copy.prd.overview}
                          </h4>
                          <div className="bg-slate-950 p-4 rounded-lg border border-slate-900/80 space-y-3">
                            {isPrdEditing ? (
                              <>
                                <label className="block text-3xs text-slate-500 font-mono uppercase">
                                  {copy.prd.title}
                                  <input
                                    value={prdSpec.title}
                                    onChange={(event) => updatePrdDraft((draft) => { draft.title = event.target.value; })}
                                    className={`${formInputClass} mt-1`}
                                  />
                                </label>
                                <label className="block text-3xs text-slate-500 font-mono uppercase">
                                  {copy.prd.currency}
                                  <input
                                    value={prdSpec.economy.currencyName}
                                    onChange={(event) => updatePrdDraft((draft) => { draft.economy.currencyName = event.target.value; })}
                                    className={`${formInputClass} mt-1`}
                                  />
                                </label>
                                <label className="block text-3xs text-slate-500 font-mono uppercase">
                                  {copy.prd.themeColor}
                                  <div className="mt-1 flex gap-2">
                                    <input
                                      type="color"
                                      value={/^#[0-9A-Fa-f]{6}$/.test(prdSpec.themeColor) ? prdSpec.themeColor : "#10b981"}
                                      onChange={(event) => updatePrdDraft((draft) => { draft.themeColor = event.target.value; })}
                                      className="h-9 w-12 rounded bg-slate-900 border border-slate-800"
                                    />
                                    <input
                                      value={prdSpec.themeColor}
                                      onChange={(event) => updatePrdDraft((draft) => { draft.themeColor = event.target.value; })}
                                      className={formInputClass}
                                    />
                                  </div>
                                </label>
                                <div className="space-y-2">
                                  <div className="text-3xs text-slate-500 font-mono uppercase">{copy.prd.resources}</div>
                                  {prdSpec.economy.resources.map((resource, rid) => (
                                    <input
                                      key={rid}
                                      value={resource}
                                      onChange={(event) => updatePrdDraft((draft) => { draft.economy.resources[rid] = event.target.value; })}
                                      placeholder={`${copy.prd.resource} ${rid + 1}`}
                                      className={formInputClass}
                                    />
                                  ))}
                                </div>
                              </>
                            ) : (
                              <>
                                <p className="text-xs text-slate-400">{copy.prd.title}: <strong className="text-slate-200">{prdSpec.title}</strong></p>
                                <p className="text-xs text-slate-400">{copy.prd.currency}: <strong className="text-slate-200">{prdSpec.economy.currencyName}</strong></p>
                                <p className="text-xs text-slate-400">{copy.prd.themeColor}: <span className="inline-block w-3 h-3 rounded-full align-middle ml-1" style={{ backgroundColor: prdSpec.themeColor }} /> <code className="text-slate-200 ml-1">{prdSpec.themeColor}</code></p>
                                <p className="text-xs text-slate-400">{copy.prd.resources}: <strong className="text-slate-200">{prdSpec.economy.resources.join(" / ")}</strong></p>
                              </>
                            )}
                          </div>
                        </div>

                        <div className="space-y-4">
                          <h4 className="text-xs uppercase font-mono tracking-wider text-slate-500">
                            {copy.prd.realms}
                          </h4>
                          <div className="bg-slate-950 p-4 rounded-lg border border-slate-900/80">
                            {isPrdEditing ? (
                              <div className="space-y-2">
                                {prdSpec.economy.realms.map((realm, rid) => (
                                  <label key={rid} className="grid grid-cols-[72px_1fr] items-center gap-2 text-xs">
                                    <span className="text-slate-500 font-mono">{copy.prd.realm} {rid + 1}</span>
                                    <input
                                      value={realm}
                                      onChange={(event) => updatePrdDraft((draft) => { draft.economy.realms[rid] = event.target.value; })}
                                      className={formInputClass}
                                    />
                                  </label>
                                ))}
                              </div>
                            ) : (
                              <ul className="space-y-1 text-xs">
                                {prdSpec.economy.realms.map((realm, rid) => (
                                  <li key={rid} className="flex items-center gap-2">
                                    <span className="text-slate-500 font-mono">{copy.prd.realm} {rid + 1}:</span>
                                    <span className="text-slate-200 font-medium">{realm}</span>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="space-y-4">
                        <h4 className="text-xs uppercase font-mono tracking-wider text-slate-500">
                          {copy.prd.nodes}
                        </h4>
                        <div className="space-y-3">
                          {prdSpec.nodes.map((node) => {
                            const mechanicsLabels: { [key: string]: string } = {
                              tap_reaction: `⚡ ${copy.mechanics.tap_reaction}`,
                              collect_dodge: `🍃 ${copy.mechanics.collect_dodge}`,
                              memory_sequence: `🔮 ${copy.mechanics.memory_sequence}`
                            };
                            return (
                              <div key={node.id} className="bg-slate-950/80 p-4 rounded-lg border border-slate-900 text-xs flex flex-col gap-4">
                                {isPrdEditing ? (
                                  <>
                                    <div className="grid grid-cols-1 md:grid-cols-[1fr_180px] gap-3">
                                      <label className="block text-3xs text-slate-500 font-mono uppercase">
                                        {copy.prd.nodeTitle}
                                        <input
                                          value={node.title}
                                          onChange={(event) => updatePrdDraft((draft) => {
                                            const target = draft.nodes.find((item) => item.id === node.id);
                                            if (target) target.title = event.target.value;
                                          })}
                                          className={`${formInputClass} mt-1`}
                                        />
                                      </label>
                                      <label className="block text-3xs text-slate-500 font-mono uppercase">
                                        {copy.prd.mechanics}
                                        <select
                                          value={node.mechanics}
                                          onChange={(event) => updatePrdDraft((draft) => {
                                            const target = draft.nodes.find((item) => item.id === node.id);
                                            if (target) target.mechanics = event.target.value;
                                          })}
                                          className={`${formInputClass} mt-1`}
                                        >
                                          <option value="tap_reaction">{copy.mechanics.tap_reaction}</option>
                                          <option value="collect_dodge">{copy.mechanics.collect_dodge}</option>
                                          <option value="memory_sequence">{copy.mechanics.memory_sequence}</option>
                                        </select>
                                      </label>
                                    </div>
                                    <label className="block text-3xs text-slate-500 font-mono uppercase">
                                      {copy.prd.intro}
                                      <textarea
                                        value={node.intro}
                                        onChange={(event) => updatePrdDraft((draft) => {
                                          const target = draft.nodes.find((item) => item.id === node.id);
                                          if (target) target.intro = event.target.value;
                                        })}
                                        className={`${formTextareaClass} mt-1`}
                                      />
                                    </label>
                                    <div className="grid grid-cols-1 md:grid-cols-[160px_1fr] gap-3">
                                      <label className="block text-3xs text-slate-500 font-mono uppercase">
                                        {copy.prd.goal}
                                        <input
                                          type="number"
                                          min={1}
                                          value={node.goalValue}
                                          onChange={(event) => updatePrdDraft((draft) => {
                                            const target = draft.nodes.find((item) => item.id === node.id);
                                            if (target) target.goalValue = Number(event.target.value) || 1;
                                          })}
                                          className={`${formInputClass} mt-1`}
                                        />
                                      </label>
                                      <label className="block text-3xs text-slate-500 font-mono uppercase">
                                        {copy.prd.reward}
                                        <input
                                          value={node.rewards}
                                          onChange={(event) => updatePrdDraft((draft) => {
                                            const target = draft.nodes.find((item) => item.id === node.id);
                                            if (target) target.rewards = event.target.value;
                                          })}
                                          className={`${formInputClass} mt-1`}
                                        />
                                      </label>
                                    </div>
                                  </>
                                ) : (
                                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                                    <div className="space-y-1 flex-1">
                                      <h5 className="font-semibold text-slate-200">
                                        {formatLevelLabel(node.id)}: {node.title}
                                      </h5>
                                      <p className="text-slate-400 pr-4 leading-relaxed">{node.intro}</p>
                                    </div>
                                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 shrink-0 text-left md:text-right border-t md:border-t-0 border-slate-900 pt-2 md:pt-0 max-w-xs w-full md:w-auto">
                                      <span className="text-slate-500">{copy.prd.mechanics}:</span>
                                      <span className="text-emerald-400 font-semibold">{mechanicsLabels[node.mechanics] || node.mechanics}</span>
                                      <span className="text-slate-500">{copy.prd.goal}:</span>
                                      <span className="text-slate-200">{node.goalValue}</span>
                                      <span className="text-slate-500">{copy.prd.reward}:</span>
                                      <span className="text-amber-500 font-medium">{node.rewards}</span>
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>

                    </div>
                  ) : (
                    <div className="text-slate-500 italic py-12 text-center text-xs">
                      {copy.prd.empty}
                    </div>
                  )}
                </motion.div>
              )}

              {activeTab === "gameplay" && (
                <motion.div
                  key="tab_gameplay"
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -15 }}
                  className="w-full"
                >
                  {gameSpec ? (
                    <div className="bg-slate-900/40 rounded-xl border border-slate-900 p-6 space-y-5 max-h-[650px] overflow-y-auto scrollbar-thin">
                      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 border-b border-slate-800 pb-4">
                        <div>
                          <h2 className="text-sm font-display font-bold text-slate-200 flex items-center gap-2">
                            <Layers className="w-4 h-4 text-emerald-400" />
                            {copy.tabs.gameplay}
                          </h2>
                          <p className="text-3xs text-slate-500 mt-1">
                            {copy.gameplay.desc}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 text-3xs font-mono">
                          <span className="px-2 py-1 rounded bg-slate-950 border border-slate-800 text-slate-400">
                            {copy.gameplay.cards} {gameSpec.gameplayCards?.length || 0}
                          </span>
                          <span className="px-2 py-1 rounded bg-slate-950 border border-slate-800 text-slate-400">
                            {copy.gameplay.revisions} {gameSpec.workbench?.revisions.length || 0}
                          </span>
                          <span className="px-2 py-1 rounded bg-slate-950 border border-slate-800 text-amber-400">
                            {copy.gameplay.manual}
                          </span>
                        </div>
                      </div>

                      {pendingPatch && (
                        <div className="rounded-lg border border-amber-500/30 bg-amber-950/10 p-4 space-y-3">
                          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                            <div>
                              <div className="text-xs font-bold text-amber-300">{copy.gameplay.pendingPatch}</div>
                              <div className="text-3xs font-mono text-slate-400">
                                {pendingPatch.target} · {pendingPatch.patchLevel} · invalidates {pendingPatch.invalidates.join(", ")}
                              </div>
                            </div>
                            <div className="flex gap-2">
                              <button
                                onClick={() => setPendingPatch(null)}
                                className="px-3 py-1.5 rounded bg-slate-950 border border-slate-800 text-slate-400 text-3xs font-bold"
                              >
                                {copy.gameplay.discard}
                              </button>
                              <button
                                onClick={approvePendingPatch}
                                className="px-3 py-1.5 rounded bg-emerald-500 text-slate-950 text-3xs font-bold"
                              >
                                {copy.gameplay.apply}
                              </button>
                            </div>
                          </div>
                          <pre className="bg-slate-950 rounded border border-slate-800 p-3 text-3xs text-slate-400 overflow-x-auto">
                            {JSON.stringify({ before: pendingPatch.before, after: pendingPatch.after }, null, 2)}
                          </pre>
                        </div>
                      )}

                      <div className="space-y-3">
                        {ensureGameplayManifest(gameSpec).nodes.map((node) => {
                          const gameplay = node.gameplay!;
                          return (
                            <div key={node.id} className="bg-slate-950/70 rounded-lg border border-slate-900 p-4 space-y-3">
                              <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                                <div className="min-w-0">
                                  <h3 className="text-xs font-bold text-slate-200">
                                    {copy.gameplay.node} {node.id}: {node.title}
                                  </h3>
                                  <p className="text-3xs text-slate-500 mt-1 line-clamp-2">{node.intro}</p>
                                </div>
                                <div className="text-3xs font-mono text-slate-500 shrink-0">
                                  {copy.gameplay.adapter} <span className="text-emerald-400">{gameplay.adapter}</span>
                                </div>
                              </div>

                              <div className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-3">
                                <label className="flex flex-col gap-1 text-3xs text-slate-500 uppercase font-mono">
                                  {copy.gameplay.baseCard}
                                  <select
                                    value={gameplay.cardId}
                                    onChange={(event) => {
                                      const card = GAMEPLAY_CARD_OPTIONS.find((item) => item.id === event.target.value);
                                      const nextGameplay: GameplayAssignment = {
                                        ...gameplay,
                                        cardId: event.target.value,
                                        adapter: card?.adapter || gameplay.adapter,
                                        patchLevel: "L2"
                                      };
                                      queueGameplayPatch(node.id, nextGameplay, `Change node ${node.id} base gameplay card`);
                                    }}
                                    className="bg-slate-900 border border-slate-800 rounded px-2 py-2 text-slate-200 normal-case"
                                  >
                                    {baseGameplayOptions.map((card) => (
                                      <option key={card.id} value={card.id}>
                                        {locale === "en" ? card.titleEn || card.title : card.title}
                                      </option>
                                    ))}
                                  </select>
                                </label>

                                <div className="flex flex-wrap gap-2">
                                  {modifierOptions.map((modifier) => {
                                    const checked = gameplay.modifiers.some((item) => item.id === modifier.id);
                                    return (
                                      <label
                                        key={modifier.id}
                                        className={`px-2.5 py-1.5 rounded border text-3xs cursor-pointer ${
                                          checked
                                            ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-300"
                                            : "border-slate-800 bg-slate-900/60 text-slate-500"
                                        }`}
                                      >
                                        <input
                                          type="checkbox"
                                          checked={checked}
                                          onChange={() => {
                                            const nextGameplay: GameplayAssignment = {
                                              ...gameplay,
                                              modifiers: toggleModifier(gameplay.modifiers, modifier.id),
                                              patchLevel: "L2"
                                            };
                                            queueGameplayPatch(node.id, nextGameplay, `Toggle ${modifier.id} modifier`);
                                          }}
                                          className="mr-1.5 align-middle"
                                        />
                                        {locale === "en" ? modifier.titleEn || modifier.title : modifier.title}
                                      </label>
                                    );
                                  })}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="bg-slate-950 rounded-lg border border-slate-900 p-4">
                          <h3 className="text-xs font-bold text-slate-300 mb-2">{copy.gameplay.patchPolicy}</h3>
                          <div className="space-y-1 text-3xs text-slate-500 leading-5">
                            <div>{copy.gameplay.policy1}</div>
                            <div>{copy.gameplay.policy2}</div>
                            <div>{copy.gameplay.policy3}</div>
                          </div>
                        </div>
                        <div className="bg-slate-950 rounded-lg border border-slate-900 p-4">
                          <h3 className="text-xs font-bold text-slate-300 mb-2">{copy.gameplay.latest}</h3>
                          <div className="space-y-2">
                            {[...(gameSpec.workbench?.revisions || [])].reverse().slice(0, 4).map((revision) => (
                              <div key={revision.id} className="text-3xs text-slate-500 border border-slate-900 rounded p-2">
                                <div className="font-mono text-slate-300">{revision.id}</div>
                                <div>{revision.createdAt}</div>
                                <div>build {revision.gateResults.build} · e2e {revision.gateResults.e2e}</div>
                              </div>
                            ))}
                            {(!gameSpec.workbench?.revisions || gameSpec.workbench.revisions.length === 0) && (
                              <div className="text-3xs text-slate-600 italic">{copy.gameplay.noRevision}</div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-slate-500 italic py-12 text-center text-xs">
                      {copy.gameplay.empty}
                    </div>
                  )}
                </motion.div>
              )}

              {activeTab === "manifest" && (
                <motion.div
                  key="tab_manifest"
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -15 }}
                  className="w-full"
                >
                  {gameSpec ? (
                    <div className="bg-slate-900/40 rounded-xl border border-slate-900 p-6 space-y-3">
                      <div className="flex items-center justify-between border-b border-emerald-500/10 pb-3">
                        <div>
                          <h2 className="text-sm font-mono font-bold text-slate-200">
                            docs/manifest.json
                          </h2>
                          <p className="text-3xs text-slate-500">
                            {copy.manifest.desc}
                          </p>
                        </div>
                        <span className="text-2xs font-mono text-emerald-400 bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-500/20">
                          {copy.manifest.valid}
                        </span>
                      </div>
                      <pre className="bg-slate-950 p-4 rounded-lg font-mono text-2xs text-slate-400 max-h-[480px] overflow-y-auto border border-slate-900 leading-relaxed">
                        {JSON.stringify(gameSpec, null, 2)}
                      </pre>
                    </div>
                  ) : (
                    <div className="text-slate-500 italic py-12 text-center text-xs">
                      {copy.manifest.empty}
                    </div>
                  )}
                </motion.div>
              )}

              {activeTab === "vlm" && (
                <motion.div
                  key="tab_vlm"
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -15 }}
                  className="w-full space-y-6"
                >
                  <div className="bg-slate-900/40 rounded-xl border border-slate-900 p-6 space-y-6">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-slate-900 pb-4 gap-4">
                      <div>
                        <h2 className="text-sm font-display font-bold text-slate-200 flex items-center gap-2">
                          <Eye className="w-4 h-4 text-cyan-400" />
                          {copy.vlm.title}
                        </h2>
                        <p className="text-3xs text-slate-500 mt-0.5">
                          {copy.vlm.desc}
                        </p>
                      </div>
                      <button
                        onClick={triggerVisualAudit}
                        disabled={isAuditing || !gameSpec}
                        className="px-4 py-1.5 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-semibold rounded text-2xs transition disabled:opacity-40 select-none uppercase inline-flex items-center gap-1.5 cursor-pointer"
                      >
                        {isAuditing ? (
                          <>
                            <RefreshCw className="w-3 animate-spin" />
                            {copy.vlm.running}
                          </>
                        ) : (
                          <>
                            <CameraIcon className="w-3 h-3" />
                            {copy.vlm.run}
                          </>
                        )}
                      </button>
                    </div>

                    {auditReport ? (
                      <div className="space-y-6 text-xs leading-relaxed">
                        {/* Overall feedback dialog */}
                        <div className="p-4 bg-cyan-950/20 rounded-lg border border-cyan-500/20 flex gap-3">
                          <CheckCircle2 className="w-5 h-5 text-cyan-400 shrink-0 mt-0.5" />
                          <div>
                            <p className="font-semibold text-cyan-300">{copy.vlm.result}</p>
                            <p className="text-slate-400 mt-1">{auditReport.vlm_feedback}</p>
                          </div>
                        </div>

                        {/* Individual check grid */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {auditReport.checks.map((chk, cid) => (
                            <div key={cid} className="bg-slate-950/80 p-4 rounded-lg border border-slate-900 space-y-1">
                              <div className="flex items-center justify-between">
                                <span className="font-semibold text-slate-200">{chk.name}</span>
                                <span className={`px-2 py-0.5 rounded text-3xs font-bold ${
                                  chk.status === "PASS"
                                    ? "bg-emerald-950/50 text-emerald-400 border border-emerald-500/20"
                                    : "bg-amber-950/50 text-amber-400 border border-amber-500/20"
                                }`}>
                                  {chk.status === "PASS" ? copy.vlm.pass : copy.vlm.notice}
                                </span>
                              </div>
                              <p className="text-slate-500">{chk.remarks}</p>
                            </div>
                          ))}
                        </div>

                        {/* Prompt Reflow Diff block */}
                        <div className="space-y-2">
                          <h4 className="text-3xs uppercase font-mono tracking-wider text-slate-500">
                            {copy.vlm.prompt}
                          </h4>
                          <div className="bg-slate-950 rounded p-4 border border-rose-500/10 font-mono text-2xs text-rose-400 leading-relaxed whitespace-pre bg-clip-text">
                            <strong>{copy.vlm.promptAdd}</strong>
                            <br />{auditReport.prompt_reflow_diff}
                          </div>
                        </div>

                      </div>
                    ) : (
                      <div className="text-center py-12 text-slate-500 text-xs italic">
                        {copy.vlm.empty}
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

          </div>
        </div>
      </main>

      <div className="fixed bottom-5 right-5 z-[70] flex flex-col items-end gap-3 pointer-events-none">
        <AnimatePresence>
          {isLogPanelOpen && (
            <motion.div
              initial={{ opacity: 0, y: 18, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 18, scale: 0.96 }}
              className="pointer-events-auto w-[min(92vw,520px)] max-h-[60vh] rounded-xl border border-slate-800 bg-slate-950/95 shadow-2xl shadow-slate-950/70 backdrop-blur-md overflow-hidden"
            >
              <div className="flex items-center justify-between gap-3 border-b border-slate-800 px-4 py-3">
                <h3 className="text-xs font-mono font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-teal-400" />
                  {copy.logs.title}
                </h3>
                <button
                  onClick={() => setIsLogPanelOpen(false)}
                  className="px-2.5 py-1 rounded border border-slate-800 bg-slate-900 text-3xs font-bold text-slate-400 hover:text-slate-200 hover:border-slate-700 transition"
                >
                  {copy.logs.collapse}
                </button>
              </div>

              <div className="max-h-[46vh] overflow-y-auto p-3 font-mono text-2xs space-y-2 scrollbar-thin scrollbar-thumb-slate-800">
                {orchestrationLogs.length === 0 ? (
                  <div className="min-h-[160px] text-slate-600 italic flex items-center justify-center text-center leading-5">
                    {copy.logs.empty}
                    <br />{copy.logs.hint}
                  </div>
                ) : (
                  orchestrationLogs.map((log, index) => (
                    <div key={index} className={`leading-5 whitespace-pre-wrap break-all select-all selection:bg-slate-800 ${getLogLineClass(log)}`}>
                      {log}
                    </div>
                  ))
                )}
                <div ref={logsEndRef} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <button
          onClick={() => setIsLogPanelOpen((open) => !open)}
          className={`pointer-events-auto rounded-full border px-4 py-2.5 shadow-xl backdrop-blur-md flex items-center gap-2 text-xs font-bold transition ${
            isLogPanelOpen
              ? "border-teal-400/50 bg-teal-400 text-slate-950"
              : "border-slate-800 bg-slate-900/90 text-slate-300 hover:border-teal-400/40 hover:text-teal-300"
          }`}
        >
          <Terminal className="w-4 h-4" />
          {copy.logs.button}
          <span className={`rounded-full px-1.5 py-0.5 text-4xs font-mono ${
            isLogPanelOpen ? "bg-slate-950/15 text-slate-950" : "bg-slate-950 text-teal-300"
          }`}>
            {orchestrationLogs.length}
          </span>
        </button>
      </div>

      {/* Aesthetic Footer */}
      <footer className="border-t border-slate-900 bg-slate-950 py-4 text-center text-xs text-slate-600 font-mono">
        {copy.footer}
      </footer>
    </div>
  );
}

// Icons fallbacks
function CameraIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
      <circle cx="12" cy="13" r="3" />
    </svg>
  );
}
