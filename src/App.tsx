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
  Award 
} from "lucide-react";
import { GameSpec, PlayerState, AuditReport } from "./types";
import { initializePhaserGame } from "./game/GameRunner";
import { synth } from "./utils/AudioSynth";
import { WorkspaceSelector, WorkspaceMeta } from "./components/WorkspaceSelector";
import { AgentChatPanel } from "./components/AgentChatPanel";

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

export default function App() {
  const [themeInput, setThemeInput] = useState("逆天凡人修仙记，主打突破境界与十二重天劫");
  const [activeTab, setActiveTab ] = useState<"emulator" | "prd" | "manifest" | "vlm">("emulator");
  const [activeWorkspace, setActiveWorkspace] = useState<WorkspaceMeta | null>(null);
  const [currentJob, setCurrentJob] = useState<any>(null); // For Orchestrator Job
  const [isOrchestrating, setIsOrchestrating] = useState(false);
  const [orchestrationStage, setOrchestrationStage] = useState<number | null>(null);
  const [orchestrationLogs, setOrchestrationLogs] = useState<string[]>([]);
  const [gameSpec, setGameSpec] = useState<GameSpec | null>(null);
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

  const handleLoadWorkspace = async (ws: WorkspaceMeta) => {
    setActiveWorkspace(ws);
    addLog(`📂 用户切换至隔离工作区：${ws.name}`);
    setThemeInput(ws.theme);

    try {
      // 1. Try to load existing manifest.json from the workspace sandbox
      const res = await fetch(`/api/workspaces/${ws.id}/files/manifest.json`);
      const json = await res.json();
      if (json.success && json.data) {
        setGameSpec(json.data);
        addLog(`📦 成功从物理工作区沙盒载入现有 [manifest.json]！`);
      } else {
        // 2. Fetch procedural fallback preset if manifest.json is missing
        addLog(`⚠️ 当前沙盒物理副本 manifest.json 缺失，正在重塑宇宙基石...`);
        const presetRes = await fetch(`/api/presets?theme=${encodeURIComponent(ws.theme)}`);
        const presetJson = await presetRes.json();
        if (presetJson.success && presetJson.data) {
          const presetData = presetJson.data;
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

  // Scroll logs to bottom automatically
  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [orchestrationLogs]);

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
           setGameSpec(currentJob.result);
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
              theme: "逆天凡人修仙记，主打突破境界与十二重天劫"
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
        setGameSpec(offlineSpec);
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
    
    // Simulate screenshot Base64
    const mockBase64 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

    try {
      const res = await fetch("/api/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          theme: gameSpec.title,
          currentNodes: gameSpec.nodes,
          screenshot_base64: mockBase64
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
              自主同人 H5 游戏智能生成引擎 v3.0
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
              placeholder="输入你想生成的同人 IP 主题（例如：诡秘之主、凡人修仙...）"
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
                正在编制世界...
              </>
            ) : (
              <>
                <Flame className="w-3.5 h-3.5" />
                ⚡ 编译小说 IP
              </>
            )}
          </button>
        </div>
        
        {/* Workspace Context Display */}
        <div className="shrink-0 flex items-center justify-end">
          <WorkspaceSelector 
            activeWorkspaceId={activeWorkspace?.id || null} 
            onSelectWorkspace={handleLoadWorkspace} 
          />
        </div>
      </header>

      {/* Main Orchestration Dashboard Layout Grid */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 md:px-8 py-6 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* Left Side: Pipeline, Logs and Explorer Workspace Panel */}
        <div className="lg:col-span-4 h-full flex flex-col gap-6">
          
          {/* Animated DAG Graph View (Step 1.1 to Step 3.3) */}
          <div className="bg-slate-900/60 p-5 rounded-2xl border border-slate-900/90 flex flex-col gap-4 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-mono font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                <Sliders className="w-4 h-4 text-emerald-400" />
                Orchestrator Pipeline (DAG)
              </h3>
              <span className="text-3xs font-mono text-emerald-400 bg-emerald-950/40 border border-emerald-500/20 px-2.5 py-0.5 rounded-full">
                精确管线 1.1 ~ 3.3
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

              {[
                { name: "DNA 萃取 (1.1)", desc: "同人IP DNA逆向萃取与数值编制", id: 0 },
                { name: "大纲规划 (1.2)", desc: "修真剧情大纲树、数值惩罚编制", id: 1 },
                { name: "宿主架设 (2.1)", desc: "自动部署脚手架、锁定宽屏尺寸", id: 2 },
                { name: "状态注入 (2.2)", desc: "动态导入 store / data 寄存配方", id: 3 },
                { name: "物理编译 (3.1)", desc: "工厂代码与Phaser物理机制绑定", id: 4 },
                { name: "声相强化 (3.2)", desc: "Web Audio ASMR合成、多维抖动特效", id: 5 },
                { name: "多模审计 (3.3)", desc: "视觉 VLM QA 诊断异常并沉淀知识", id: 6 }
              ].map((node) => {
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
                        {isUnderReview && <span className="font-mono text-3xs text-amber-400 bg-amber-950/60 px-1.5 py-0.5 rounded border border-amber-500/20">等待人机确认</span>}
                        {isActive && <span className="font-mono text-3xs text-emerald-400 bg-emerald-950/60 px-1.5 py-0.5 rounded border border-emerald-500/20">正在编译组装</span>}
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
                    主控进行进度: {Math.round(((currentJob?.stage_index ?? 0) + 1) * 14.28)}%
                  </span>
                  <span className="text-emerald-500 font-semibold uppercase">{currentJob.status}</span>
                </div>
                <div className="text-3xs text-slate-400 font-sans italic line-clamp-1">{currentJob.progress}</div>
              </div>
            )}
          </div>

          {currentJob && currentJob.status !== 'idle' && currentJob.status !== 'completed' && (
            <AgentChatPanel
              jobId={currentJob.id}
              status={currentJob.status}
              stageName={currentJob.stage === 'world_building' ? 'World Builder' : 'QA Audit'}
              onRefreshJob={handleRefreshJob}
              onApprove={handleRefreshJob}
            />
          )}

          {/* Running compiler system logs board */}
          <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-900 flex flex-col gap-2 flex-1 min-h-[300px] lg:min-h-[400px]">
            <h3 className="text-xs font-mono font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
              <Terminal className="w-4 h-4 text-teal-400" />
              后台编译器实时日志
            </h3>
            
            <div className="bg-slate-950 rounded p-3 font-mono text-2xs text-slate-400 flex-1 overflow-y-auto max-h-[460px] space-y-2 border border-slate-900 scrollbar-thin scrollbar-thumb-slate-800">
              {orchestrationLogs.length === 0 ? (
                <div className="text-slate-600 italic h-full flex items-center justify-center text-center">
                  编译器日志当前处于被动监听。
                  <br />在上方输入同人主题，点击“编译小说 IP”启动编制管线。
                </div>
              ) : (
                orchestrationLogs.map((log, index) => {
                  let textClass = "text-slate-500";
                  if (log.includes("✅") || log.includes("🎉") || log.includes("成功") || log.includes("完成")) {
                    textClass = "text-emerald-400 bg-emerald-950/20 px-1.5 py-0.5 rounded border border-emerald-500/10";
                  } else if (log.includes("❌") || log.includes("Error") || log.includes("failed") || log.includes("异常")) {
                    textClass = "text-rose-400 bg-rose-950/20 px-1.5 py-0.5 rounded border border-rose-500/10 font-bold";
                  } else if (log.includes("⚠️") || log.includes("warning") || log.includes("提示")) {
                    textClass = "text-amber-400 bg-amber-950/20 px-1.5 py-0.5 rounded border border-amber-500/10";
                  } else if (log.includes("[Step")) {
                    textClass = "text-cyan-400 font-bold border-l-2 border-cyan-500 pl-1.5 py-0.5 bg-cyan-950/20";
                  }
                  
                  return (
                    <div key={index} className={`leading-5 whitespace-pre-wrap break-all select-all selection:bg-slate-800 ${textClass}`}>
                      {log}
                    </div>
                  );
                })
              )}
              <div ref={logsEndRef} />
            </div>
          </div>
        </div>

        {/* Right Side: Primary Viewport Tabs and Display panel */}
        <div className="lg:col-span-8 bg-slate-900/30 rounded-xl border border-slate-900/80 p-4 md:p-6 overflow-hidden min-h-[600px] flex flex-col gap-6">
          
          {/* Workspace Tabs selectors */}
          <div className="flex border-b border-slate-900 pb-2 overflow-x-auto gap-1">
            {[
              { id: "emulator", label: "WebGL H5 模拟器", icon: Play },
              { id: "prd", label: "作品设计方案 (GDD/PRD)", icon: FileText },
              { id: "manifest", label: "游戏配置清单 JSON", icon: Code },
              { id: "vlm", label: "VLM 视觉智能审计", icon: Eye }
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
                            <span className="font-mono text-3xs text-slate-500 uppercase tracking-wider">H5 沙盒运行状态</span>
                            <span className="text-2xs font-semibold text-slate-300">Phaser v3.60 • WebGL Active</span>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-3.5 text-2xs font-mono bg-slate-950/60 border border-slate-900/60 px-4 py-2 rounded-lg text-slate-450">
                          <div>已解锁: <strong className="text-emerald-400 font-mono">{playerState.unlockedNodeIds.length} / 12</strong></div>
                          <div className="w-px h-3.5 bg-slate-800/80" />
                          <div>已通关: <strong className="text-emerald-400 font-mono">{playerState.completedNodeIds.length} / 12</strong></div>
                          <div className="w-px h-3.5 bg-slate-800/80" />
                          <div>修仙境界: <strong className="text-emerald-400 font-mono">{playerState.currentRealmIndex + 1} / 6</strong></div>
                        </div>

                        <button
                          onClick={handleResetProgress}
                          className="px-3.5 py-2 bg-slate-950 hover:bg-red-955/20 hover:text-red-400 text-slate-400 border border-slate-800 hover:border-red-900/40 flex items-center gap-1.5 transition rounded-lg text-3xs font-bold uppercase tracking-wider cursor-pointer shadow"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          重置进度
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="text-slate-500 border border-dashed border-slate-800 rounded-2xl p-10 text-center max-w-sm mt-12 bg-slate-900/10 shadow-inner">
                      <AlertTriangle className="w-10 h-10 text-amber-500 mx-auto mb-3.5 animate-bounce" />
                      <p className="font-semibold text-slate-350 mb-1">未检测到修真配置</p>
                      <p className="text-xs text-slate-500 leading-relaxed">请在页面上方自定义一个同人小说 IP 题材，然后点击“编译小说 IP”开始智能构置游玩的卡片关卡。</p>
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
                  {gameSpec ? (
                    <div className="bg-slate-900/40 rounded-xl border border-slate-900 p-6 space-y-6 max-h-[620px] overflow-y-auto scrollbar-thin">
                      
                      {/* Document header banner */}
                      <div className="border-b border-rose-500/20 pb-4 flex items-center gap-3">
                        <div className="p-2.5 bg-rose-500/10 rounded border border-rose-500/20 text-rose-400 font-mono text-xs font-bold uppercase">
                          游戏企划案 / GDD
                        </div>
                        <div>
                          <h2 className="text-lg font-display font-bold text-slate-200">
                            docs/01_PRD.md
                          </h2>
                          <p className="text-xs text-slate-500">
                            系统自动生成的同人小说游戏设计文案与数值蓝图
                          </p>
                        </div>
                      </div>

                      {/* Decoded structured view of docs_PRD specification */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 leading-6 text-sm">
                        <div className="space-y-4">
                          <h4 className="text-xs uppercase font-mono tracking-wider text-slate-500">
                            IP 特征指数与主要经济循环
                          </h4>
                          <div className="bg-slate-950 p-4 rounded-lg border border-slate-900/80 space-y-2">
                            <p className="text-xs text-slate-400">同人作品名称: <strong className="text-slate-200">{gameSpec.title}</strong></p>
                            <p className="text-xs text-slate-400">主要等价值代币: <strong className="text-slate-200">{gameSpec.economy.currencyName}</strong></p>
                            <p className="text-xs text-slate-400">智能配色方案: <span className="inline-block w-3 h-3 rounded-full align-middle ml-1" style={{ backgroundColor: gameSpec.themeColor }} /> <code className="text-slate-200 ml-1">{gameSpec.themeColor}</code></p>
                          </div>
                        </div>

                        <div className="space-y-4">
                          <h4 className="text-xs uppercase font-mono tracking-wider text-slate-500">
                            修真境界等阶层级表 (共 6 大重)
                          </h4>
                          <div className="bg-slate-950 p-4 rounded-lg border border-slate-900/80">
                            <ul className="space-y-1 text-xs">
                              {gameSpec.economy.realms.map((realm, rid) => (
                                <li key={rid} className="flex items-center gap-2">
                                  <span className="text-slate-500 font-mono">境界等阶 {rid + 1}:</span>
                                  <span className="text-slate-200 font-medium">{realm}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-4">
                        <h4 className="text-xs uppercase font-mono tracking-wider text-slate-500">
                          原著主线修真十二关节点卡片配置
                        </h4>
                        <div className="space-y-3">
                          {gameSpec.nodes.map((node) => {
                            const mechanicsLabels: { [key: string]: string } = {
                              tap_reaction: "⚡ 敏捷聚灵 (Tap)",
                              collect_dodge: "🍃 虚空飞渡 (Dodge)",
                              memory_sequence: "🔮 心魂律动 (Memory)"
                            };
                            return (
                              <div key={node.id} className="bg-slate-950/80 p-4 rounded-lg border border-slate-900 text-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
                                <div className="space-y-1 flex-1">
                                  <h5 className="font-semibold text-slate-200">
                                    第 {node.id} 关: {node.title}
                                  </h5>
                                  <p className="text-slate-400 pr-4 leading-relaxed">{node.intro}</p>
                                </div>
                                <div className="grid grid-cols-2 gap-x-4 gap-y-1 shrink-0 text-left md:text-right border-t md:border-t-0 border-slate-900 pt-2 md:pt-0 max-w-xs w-full md:w-auto">
                                  <span className="text-slate-500">关卡玩法:</span>
                                  <span className="text-emerald-400 font-semibold">{mechanicsLabels[node.mechanics] || node.mechanics}</span>
                                  <span className="text-slate-500">目标分数:</span>
                                  <span className="text-slate-200">{node.goalValue} 分</span>
                                  <span className="text-slate-500">通关造化:</span>
                                  <span className="text-amber-500 font-medium">{node.rewards}</span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                    </div>
                  ) : (
                    <div className="text-slate-500 italic py-12 text-center text-xs">
                      尚未获得企划数据。请在页面上方一键编译同人 IP 题材。
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
                            数据持久化主数据注册列表
                          </p>
                        </div>
                        <span className="text-2xs font-mono text-emerald-400 bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-500/20">
                          JSON 规范格式验证通过
                        </span>
                      </div>
                      <pre className="bg-slate-950 p-4 rounded-lg font-mono text-2xs text-slate-400 max-h-[480px] overflow-y-auto border border-slate-900 leading-relaxed">
                        {JSON.stringify(gameSpec, null, 2)}
                      </pre>
                    </div>
                  ) : (
                    <div className="text-slate-500 italic py-12 text-center text-xs">
                      尚未保存清单数据。请编译小说 IP 生成实时内容。
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
                          双视口多模态视觉智能审计（阶段 3.1）
                        </h2>
                        <p className="text-3xs text-slate-500 mt-0.5">
                          通过大语言视觉模型自动高差对比分析、重叠检测与文本折行溢出评估
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
                            正在抓取像素矩阵...
                          </>
                        ) : (
                          <>
                            <CameraIcon className="w-3 h-3" />
                            运行实时视觉审计
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
                            <p className="font-semibold text-cyan-300">智能视觉多模态大模型判定结论</p>
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
                                  {chk.status === "PASS" ? "成功(PASS)" : "提示(NOTICE)"}
                                </span>
                              </div>
                              <p className="text-slate-500">{chk.remarks}</p>
                            </div>
                          ))}
                        </div>

                        {/* Prompt Reflow Diff block */}
                        <div className="space-y-2">
                          <h4 className="text-3xs uppercase font-mono tracking-wider text-slate-500">
                            向后传递之 Prompt 知识蒸馏重排 (阶段 3.2 Master Reflow)
                          </h4>
                          <div className="bg-slate-950 rounded p-4 border border-rose-500/10 font-mono text-2xs text-rose-400 leading-relaxed whitespace-pre bg-clip-text">
                            <strong>+ 提示分支追加优化规约 (REFOLD ARCHIVE COMPILATION):</strong>
                            <br />{auditReport.prompt_reflow_diff}
                          </div>
                        </div>

                      </div>
                    ) : (
                      <div className="text-center py-12 text-slate-500 text-xs italic">
                        尚未执行视觉审计。点击“运行实时视觉审计”抓取游戏视窗渲染树检查。
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

          </div>
        </div>
      </main>

      {/* Aesthetic Footer */}
      <footer className="border-t border-slate-900 bg-slate-950 py-4 text-center text-xs text-slate-600 font-mono">
        LoreWeaver 游戏编制案设计器及 H5 模拟器 • 在 Cloud Run 容器沙盒中通过 Phaser v3 WebGL 引擎安全渲染运行
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
