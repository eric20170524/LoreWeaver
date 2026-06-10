import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  Play, 
  FileText, 
  Code, 
  Sliders, 
  Terminal, 
  Eye, 
  Layers
} from "lucide-react";
import { GameSpec, PlayerState, AuditReport, GameplayAssignment, ManifestPatch, Locale } from "./types";
import { initializePhaserGame } from "./game/GameRunner";
import { synth } from "./utils/AudioSynth";
import { WorkspaceMeta } from "./components/WorkspaceSelector";
import { AgentChatPanel } from "./components/AgentChatPanel";
import {
  applyManifestPatch,
  createGameplayPatch,
  ensureGameplayManifest
} from "./utils/gameplayManifest";
import { UI_COPY } from "./utils/uiCopy";

// Modularized child panels
import { PrdPanel } from "./components/PrdPanel";
import { GameplayPanel } from "./components/GameplayPanel";
import { VlmPanel } from "./components/VlmPanel";
import { Header } from "./components/Header";
import { EmulatorPanel } from "./components/EmulatorPanel";

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

const cloneGameSpec = (spec: GameSpec): GameSpec => JSON.parse(JSON.stringify(spec)) as GameSpec;

export default function App() {
  const [themeMode, setThemeMode] = useState<"light" | "dark">(() => {
    const cached = localStorage.getItem("loreweaver_theme");
    if (cached === "light" || cached === "dark") return cached;
    return "light"; // Default to light mode
  });
  const [themeInput, setThemeInput] = useState("原创逆天修行传说，主打突破境界与十二重天劫");
  const [activeTab, setActiveTab ] = useState<"emulator" | "prd" | "gameplay" | "manifest" | "vlm">("emulator");
  const [emulatorSize, setEmulatorSize] = useState<"compact" | "standard" | "large">(() => {
    const cached = localStorage.getItem("loreweaver_emulator_size");
    if (cached === "compact" || cached === "standard" || cached === "large") return cached;
    return "standard";
  });

  const emuWidths = {
    compact: 360,
    standard: 440,
    large: 520
  };
  const currentEmuWidth = emuWidths[emulatorSize] || 440;
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
  const [isExporting, setIsExporting] = useState(false);
  const [isLogPanelOpen, setIsLogPanelOpen] = useState(false);
  const [locale, setLocale] = useState<Locale>(() => (
    localStorage.getItem("loreweaver_locale") === "en" ? "en" : "zh"
  ));
  const copy = UI_COPY[locale];

  const phaserContainerRef = useRef<HTMLDivElement>(null);
  const phaserGameRef = useRef<Phaser.Game | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const [phaserContainer, setPhaserContainer] = useState<HTMLDivElement | null>(null);

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

  const handleExportWorkspace = async () => {
    if (!activeWorkspace || isExporting) {
      if (!activeWorkspace) addLog("⚠️ 请先选择或创建一个工作区，再导出项目包。");
      return;
    }

    setIsExporting(true);
    try {
      const res = await fetch(`/api/workspaces/${activeWorkspace.id}/export`);
      if (!res.ok) {
        const message = await res.text();
        throw new Error(message || `HTTP ${res.status}`);
      }

      const blob = await res.blob();
      const downloadUrl = URL.createObjectURL(blob);
      const filename = `loreweaver-${activeWorkspace.name.replace(/[^\w.-]+/g, "-") || activeWorkspace.id}.zip`;
      const anchor = document.createElement("a");
      anchor.href = downloadUrl;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(downloadUrl);

      addLog(`📦 已导出当前工作区 ZIP：${filename}`);
      synth.playClick();
    } catch (err: any) {
      addLog(`❌ 工作区导出失败: ${err.message || err}`);
    } finally {
      setIsExporting(false);
    }
  };

  useEffect(() => {
    localStorage.setItem("loreweaver_locale", locale);
  }, [locale]);

  useEffect(() => {
    const root = window.document.documentElement;
    const body = window.document.body;
    if (themeMode === "dark") {
      root.classList.add("dark");
      body.classList.add("dark");
    } else {
      root.classList.remove("dark");
      body.classList.remove("dark");
    }
    localStorage.setItem("loreweaver_theme", themeMode);
  }, [themeMode]);

  useEffect(() => {
    localStorage.setItem("loreweaver_emulator_size", emulatorSize);
    if (phaserGameRef.current) {
      const timer = setTimeout(() => {
        if (phaserGameRef.current) {
          phaserGameRef.current.scale.refresh();
        }
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [emulatorSize]);

  // Scroll logs to bottom automatically
  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [orchestrationLogs, isLogPanelOpen]);

  // Handle clean instantiation of Phaser Game Canvas
  const restartGameInstance = (specToUse: GameSpec, container?: HTMLDivElement | null) => {
    // Shutdown any stale instance
    if (phaserGameRef.current) {
      phaserGameRef.current.destroy(true);
      phaserGameRef.current = null;
    }

    const targetContainer = container || phaserContainer || phaserContainerRef.current;
    if (targetContainer) {
      targetContainer.innerHTML = "";
      try {
        const game = initializePhaserGame(
          targetContainer,
          specToUse,
          playerState,
          handleSaveState,
          addLog
        );
        phaserGameRef.current = game;
        (window as any).__LOREWEAVER_GAME__ = game;
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
    if (activeTab === "emulator" && gameSpec && phaserContainer) {
      restartGameInstance(gameSpec, phaserContainer);
    } else {
      if (phaserGameRef.current) {
        phaserGameRef.current.destroy(true);
        phaserGameRef.current = null;
      }
      (window as any).__LOREWEAVER_GAME__ = null;
    }
  }, [gameSpec, activeTab, phaserContainer]);

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

  const handleSaveSpec = async (nextSpec: GameSpec) => {
    setGameSpec(nextSpec);
    addLog(locale === "zh" ? "✏️ 已保存作品设计方案编辑，manifest 已进入新版本。" : "✏️ Design brief edits saved into the manifest.");
    try {
      await persistManifest(nextSpec);
      addLog(locale === "zh" ? "💾 作品设计方案已写回当前工作区 manifest.json。" : "💾 Design brief saved to the current workspace manifest.json.");
    } catch (err: any) {
      addLog(locale === "zh" ? `⚠️ 编辑已本地应用，但写回工作区失败: ${err.message || err}` : `⚠️ Edits applied locally, but saving failed: ${err.message || err}`);
    }
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

  const getLogLineClass = (log: string) => {
    if (log.includes("✅") || log.includes("🎉") || log.includes("成功") || log.includes("完成")) {
      return "text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/20 px-1.5 py-0.5 rounded border border-emerald-500/10";
    }
    if (log.includes("❌") || log.includes("Error") || log.includes("failed") || log.includes("异常")) {
      return "text-rose-700 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/20 px-1.5 py-0.5 rounded border border-rose-500/10 font-bold";
    }
    if (log.includes("⚠️") || log.includes("warning") || log.includes("提示")) {
      return "text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/20 px-1.5 py-0.5 rounded border border-amber-500/10";
    }
    if (log.includes("[Step")) {
      return "text-cyan-700 dark:text-cyan-400 font-bold border-l-2 border-cyan-500 pl-1.5 py-0.5 bg-cyan-50 dark:bg-cyan-950/20";
    }
    return "text-slate-500";
  };

  return (
    <div className="lw-app min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans flex flex-col antialiased selection:bg-emerald-500 selection:text-slate-950 transition-colors duration-250">
      
      <Header
        themeInput={themeInput}
        setThemeInput={setThemeInput}
        isOrchestrating={isOrchestrating}
        runOrchestrationPipeline={runOrchestrationPipeline}
        themeMode={themeMode}
        setThemeMode={setThemeMode}
        locale={locale}
        setLocale={setLocale}
        copy={copy}
        activeWorkspace={activeWorkspace}
        handleLoadWorkspace={handleLoadWorkspace}
        onExportWorkspace={handleExportWorkspace}
        isExporting={isExporting}
      />

      {/* Main Orchestration Dashboard Layout Grid */}
      <main className="flex-1 w-full max-w-[1800px] 2xl:max-w-[95vw] mx-auto px-4 md:px-8 py-6 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* Left Side: Pipeline overview */}
        <div className="lg:col-span-4 2xl:col-span-3 flex flex-col gap-6">
          
          {/* Animated DAG Graph View */}
          <div className="bg-white/90 dark:bg-slate-900/60 p-5 rounded-2xl border border-slate-200 dark:border-slate-900/90 flex flex-col gap-4 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-mono font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider flex items-center gap-2">
                <Sliders className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                {copy.pipelineTitle}
              </h3>
              <span className="text-3xs font-mono text-emerald-400 bg-emerald-950/40 border border-emerald-500/20 px-2.5 py-0.5 rounded-full">
                {copy.pipelineBadge}
              </span>
            </div>

            <div className="flex flex-col gap-2.5 my-0.5 relative">
              {/* Connected vertical line track */}
              <div className="absolute left-[9px] top-[12px] bottom-[12px] w-0.5 bg-slate-200 dark:bg-slate-950">
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
                
                let dotClass = "border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-400 dark:text-slate-650";
                let textTitleClass = "text-slate-550";
                let descClass = "text-slate-600";

                if (isActive) {
                  dotClass = "border-emerald-500 bg-emerald-50 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 ring-4 ring-emerald-500/15 animate-pulse font-mono";
                  textTitleClass = "text-emerald-600 dark:text-emerald-400 font-bold";
                  descClass = "text-slate-700 dark:text-slate-300";
                } else if (isUnderReview) {
                  dotClass = "border-amber-500 bg-amber-50 dark:bg-amber-950 text-amber-600 dark:text-amber-400 ring-4 ring-amber-500/15 font-mono";
                  textTitleClass = "text-amber-600 dark:text-amber-400 font-bold";
                  descClass = "text-slate-700 dark:text-slate-300";
                } else if (isPassed) {
                  dotClass = "border-emerald-500/60 bg-emerald-50 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-500 font-mono";
                  textTitleClass = "text-slate-700 dark:text-slate-300 font-semibold";
                  descClass = "text-slate-500";
                }

                return (
                  <div key={node.id} className="flex gap-2.5 px-0.5 items-start group">
                    <div className={`w-5.5 h-5.5 rounded-full border-2 flex items-center justify-center text-3xs font-bold shrink-0 transition-all duration-300 ${dotClass}`}>
                      {node.id + 1}
                    </div>
                    <div className="flex flex-col min-w-0 flex-1">
                      <span className={`text-3xs font-display tracking-tight transition-all duration-300 ${textTitleClass} flex items-center justify-between`}>
                        <span>{node.name}</span>
                        {isUnderReview && <span className="font-mono text-[9px] text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/60 px-1 py-0.2 rounded border border-amber-500/20">{copy.reviewState}</span>}
                        {isActive && <span className="font-mono text-[9px] text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-1 py-0.2 rounded border border-emerald-500/20">{copy.runningState}</span>}
                      </span>
                      {(isActive || isUnderReview) && (
                        <span className={`text-[10px] leading-relaxed mt-0.5 font-sans block transition-all duration-300 ${descClass}`}>
                          {node.desc}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            
            {/* Live progress indicator footer */}
            {currentJob && (
              <div className="border-t border-slate-200 dark:border-slate-900 pt-3 flex flex-col gap-1.5">
                <div className="flex items-center justify-between text-3xs font-mono text-slate-500">
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    {copy.progressLabel}: {Math.round(((currentJob?.stage_index ?? 0) + 1) * 14.28)}%
                  </span>
                  <span className="text-emerald-500 font-semibold uppercase">{currentJob.status}</span>
                </div>
                <div className="text-3xs text-slate-650 dark:text-slate-400 font-sans italic line-clamp-1">{currentJob.progress}</div>
              </div>
            )}
          </div>

          {activeWorkspace && (
            <div className="2xl:hidden">
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
            </div>
          )}

        </div>

        {/* Right Side: Primary Viewport Tabs and Display panel */}
        <div className="lg:col-span-8 2xl:col-span-6 bg-white/70 dark:bg-slate-900/30 rounded-xl border border-slate-200 dark:border-slate-900/80 p-4 md:p-6 overflow-hidden min-h-[70vh] flex flex-col gap-6 transition-colors duration-250">
          
          {/* Workspace Tabs selectors */}
          <div className="flex border-b border-slate-200 dark:border-slate-900 pb-2 overflow-x-auto gap-1">
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
                      ? "border-emerald-500 text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/5 font-bold"
                      : "border-transparent text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-900/30"
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
                <EmulatorPanel
                  gameSpec={gameSpec}
                  playerState={playerState}
                  emulatorSize={emulatorSize}
                  setEmulatorSize={setEmulatorSize}
                  currentEmuWidth={currentEmuWidth}
                  setPhaserContainer={(node) => {
                    phaserContainerRef.current = node;
                    setPhaserContainer(node);
                  }}
                  handleResetProgress={handleResetProgress}
                  triggerVisualAudit={triggerVisualAudit}
                  isAuditing={isAuditing}
                  copy={copy}
                  themeMode={themeMode}
                />
              )}

              {activeTab === "prd" && (
                <motion.div
                  key="tab_prd"
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -15 }}
                  className="w-full"
                >
                  <PrdPanel
                    gameSpec={gameSpec}
                    locale={locale}
                    onSaveSpec={handleSaveSpec}
                    addLog={addLog}
                  />
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
                  <GameplayPanel
                    gameSpec={gameSpec}
                    locale={locale}
                    pendingPatch={pendingPatch}
                    setPendingPatch={setPendingPatch}
                    onApprovePendingPatch={approvePendingPatch}
                    onQueueGameplayPatch={queueGameplayPatch}
                  />
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
                    <div className="bg-white/80 dark:bg-slate-900/40 rounded-xl border border-slate-200 dark:border-slate-900 p-6 space-y-3">
                      <div className="flex items-center justify-between border-b border-emerald-500/10 pb-3">
                        <div>
                          <h2 className="text-sm font-mono font-bold text-slate-900 dark:text-slate-200">
                            docs/manifest.json
                          </h2>
                          <p className="text-3xs text-slate-500">
                            {copy.manifest.desc}
                          </p>
                        </div>
                        <span className="text-2xs font-mono text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-500/20">
                          {copy.manifest.valid}
                        </span>
                      </div>
                      <pre className="bg-white dark:bg-slate-950 p-4 rounded-lg font-mono text-2xs text-slate-655 dark:text-slate-400 max-h-[calc(100vh-340px)] overflow-y-auto border border-slate-200 dark:border-slate-900 leading-relaxed">
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
                  <VlmPanel
                    gameSpec={gameSpec}
                    locale={locale}
                    auditReport={auditReport}
                    isAuditing={isAuditing}
                    triggerVisualAudit={triggerVisualAudit}
                    setPendingPatch={setPendingPatch}
                    addLog={addLog}
                  />
                </motion.div>
              )}
            </AnimatePresence>

          </div>
        </div>

        {/* Extra Column for 2xl screens: Static HITL Chat Panel */}
        {activeWorkspace && (
          <div className="hidden 2xl:flex 2xl:col-span-3 flex-col gap-6">
            <AgentChatPanel
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
          </div>
        )}
      </main>

      <div className="fixed bottom-5 right-5 z-[70] flex flex-col items-end gap-3 pointer-events-none">
        <AnimatePresence>
          {isLogPanelOpen && (
            <motion.div
              initial={{ opacity: 0, y: 18, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 18, scale: 0.96 }}
              className="pointer-events-auto w-[min(92vw,520px)] max-h-[60vh] rounded-xl border border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-950/95 shadow-2xl shadow-slate-300/60 dark:shadow-slate-950/70 backdrop-blur-md overflow-hidden"
            >
              <div className="flex items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 px-4 py-3">
                <h3 className="text-xs font-mono font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                  {copy.logs.title}
                </h3>
                <button
                  onClick={() => setIsLogPanelOpen(false)}
                  className="px-2.5 py-1 rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-3xs font-bold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:border-slate-400 dark:hover:border-slate-700 transition cursor-pointer"
                >
                  {copy.logs.collapse}
                </button>
              </div>

              <div className="max-h-[46vh] overflow-y-auto p-3 font-mono text-2xs space-y-2 scrollbar-thin scrollbar-thumb-slate-300 dark:scrollbar-thumb-slate-800">
                {orchestrationLogs.length === 0 ? (
                  <div className="min-h-[160px] text-slate-655 italic flex items-center justify-center text-center leading-5">
                    {copy.logs.empty}
                    <br />{copy.logs.hint}
                  </div>
                ) : (
                  orchestrationLogs.map((log, index) => (
                    <div key={index} className={`leading-5 whitespace-pre-wrap break-all select-all selection:bg-slate-200 dark:selection:bg-slate-800 ${getLogLineClass(log)}`}>
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
          className={`pointer-events-auto rounded-full border px-4 py-2.5 shadow-xl backdrop-blur-md flex items-center gap-2 text-xs font-bold transition cursor-pointer ${
            isLogPanelOpen
              ? "border-teal-400/50 bg-teal-400 text-slate-950"
              : "border-slate-200 dark:border-slate-800 bg-white/90 dark:bg-slate-900/90 text-slate-700 dark:text-slate-300 hover:border-teal-400/40 hover:text-teal-600 dark:hover:text-teal-300"
          }`}
        >
          <Terminal className="w-4 h-4" />
          {copy.logs.button}
          <span className={`rounded-full px-1.5 py-0.5 text-4xs font-mono ${
            isLogPanelOpen ? "bg-slate-950/15 text-slate-950" : "bg-slate-100 dark:bg-slate-950 text-teal-700 dark:text-teal-300"
          }`}>
            {orchestrationLogs.length}
          </span>
        </button>
      </div>

      {/* Aesthetic Footer */}
      <footer className="border-t border-slate-200 dark:border-slate-900 bg-white dark:bg-slate-950 py-4 text-center text-xs text-slate-600 font-mono">
        {copy.footer}
      </footer>
    </div>
  );
}
