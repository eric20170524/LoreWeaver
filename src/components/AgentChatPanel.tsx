import React, { useState, useEffect } from 'react';
import { Send, Bot, Check, HelpCircle, ChevronDown, MessageSquare, RefreshCw, Layers } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Locale } from '../types';

interface AgentChatPanelProps {
  jobId?: string;
  status?: string;
  stageName?: string;
  workspaceId: string;
  onRefreshJob: () => void;
  onUpdateSpec: (newSpec: any) => void;
  addLog: (msg: string) => void;
  compact?: boolean;
  locale?: Locale;
}

interface ChatMessage {
  sender: 'user' | 'agent';
  text: string;
  timestamp: string;
}

export function AgentChatPanel({
  jobId,
  status,
  stageName,
  workspaceId,
  onRefreshJob,
  onUpdateSpec,
  addLog,
  compact = false,
  locale = "zh"
}: AgentChatPanelProps) {
  const [selectedAgent, setSelectedAgent] = useState('world_builder');
  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const copy = locale === "zh" ? {
    title: "神识共鸣 · HITL 会商",
    badge: "协作确认",
    you: "你",
    send: "神识传输",
    sending: " 编译固化中...",
    approve: "确认无误，合成落库",
    placeholderPrefix: "告诉",
    placeholderSuffix: "你的修改意见 (Enter 发送)...",
    sendLogPrefix: "发送微调指令至",
    saveLog: "融合神识成功，规格蓝图已被微调热合！",
    fallbackError: "抱歉，我在融合时神识出现波动（无法连接 AI 服务），请稍后再试。"
  } : {
    title: "HITL Collaboration",
    badge: "Human Review",
    you: "You",
    send: "Send",
    sending: " Committing...",
    approve: "Approve and Merge",
    placeholderPrefix: "Tell",
    placeholderSuffix: "what to refine (Enter to send)...",
    sendLogPrefix: "Sent refinement request to",
    saveLog: "Refinement merged into the current spec.",
    fallbackError: "Sorry, the refinement service is unavailable. Please try again later."
  };
  
  // High-fidelity local conversation storage, indexed by agent_role
  const [conversations, setConversations] = useState<Record<string, ChatMessage[]>>({
    world_builder: [
      { sender: 'agent', text: '我是【世界编制官】，已为您逆向解构了同人IP的DNA与经济配置。如果您想微调游戏主标题、境界梯度、代币以及三类资源名称，请随时向我神识传输您的微调想法！', timestamp: '系统' }
    ],
    narrative: [
      { sender: 'agent', text: '我是【剧本大纲师】，掌控12重修真天劫关卡序列与数值。你可以对具体关卡的解锁关名、引入大纲、机制映射（tap/dodge/memory）或造化收益进行神识调整。', timestamp: '系统' }
    ],
    sandbox: [
      { sender: 'agent', text: '我是【沙盒架构师】，负责保障720x1280完美锁屏分辨率布局，以及本地存储状态寄存器（store.js）。我可以为您在背后注入额外的变量绑定与配方清单！', timestamp: '系统' }
    ],
    code_foundry: [
      { sender: 'agent', text: '我是【代码铸造厂】，将大纲编译配对成 Phaser 3 物理内核，并合成 Web Audio 三相 ASMR 谐振。你可以要求我调大声波、增加屏幕震动或字模包裹包裹长度限制。', timestamp: '系统' }
    ],
    auditor: [
      { sender: 'agent', text: '我是【多模审计官】，专门通过多模态视觉 QA 来扫描 HUD 文字碰撞并清洗版权敏感词汇。欢迎您将异常页面对齐、敏感文本净化要求发送给我。', timestamp: '系统' }
    ]
  });

  const activeAgentInfo = [
    {
      id: "world_builder",
      name: locale === "zh" ? "世界编制官" : "World Builder",
      title: locale === "zh" ? "Step 1.1 DNA & 经济编制" : "Step 1.1 DNA & Economy",
      avatar: "🧬",
      desc: locale === "zh" ? "逆向提取同人 IP 精髓，定义游戏主色、核心代币及 6 大修真阶段境界称谓。" : "Extracts theme DNA, palette, core currency, and six progression realms.",
      color: "border-emerald-500/30 text-emerald-400"
    },
    {
      id: "narrative",
      name: locale === "zh" ? "剧本大纲师" : "Narrative Planner",
      title: locale === "zh" ? "Step 1.2 故事脉络与天劫卡牌" : "Step 1.2 Storyline & Level Cards",
      avatar: "📜",
      desc: locale === "zh" ? "规划 12 核心神战节点大纲、BOSS 对白、机制玩法关联、以及数值通关奖赏。" : "Plans level beats, boss lines, mechanic links, and completion rewards.",
      color: "border-cyan-500/30 text-cyan-400"
    },
    {
      id: "sandbox",
      name: locale === "zh" ? "沙盒架构师" : "Sandbox Architect",
      title: locale === "zh" ? "Step 2.1-2.2 宿主框架与状态机" : "Step 2.1-2.2 Host & State",
      avatar: "🛠️",
      desc: locale === "zh" ? "强制 720x1280 锁屏对齐，并注入存储寄存器 store.js，实现修真财产本地持久化。" : "Maintains the host shell, viewport contract, and persistent state registry.",
      color: "border-amber-500/30 text-amber-400"
    },
    {
      id: "code_foundry",
      name: locale === "zh" ? "代码铸造厂" : "Code Foundry",
      title: locale === "zh" ? "Step 3.1-3.2 物理编译与声学ASMR" : "Step 3.1-3.2 Runtime & Audio",
      avatar: "⚙️",
      desc: locale === "zh" ? "热接 Phaser 3 运行池与 Web Audio 脉冲。负责 ASMR 调幅滤波、粒子消散及弹性碰撞。" : "Connects runtime adapters, Phaser behavior, audio pulses, and visual effects.",
      color: "border-indigo-500/30 text-indigo-400"
    },
    {
      id: "auditor",
      name: locale === "zh" ? "多模审计官" : "Visual Auditor",
      title: locale === "zh" ? "Step 3.3 视觉排版校验与合规" : "Step 3.3 Visual QA",
      avatar: "👁️",
      desc: locale === "zh" ? "基于多模态对齐检测 HUD 双重遮挡。提供净化版权敏感、自适应换行的高精审计。" : "Checks layout overlap, readable text flow, and content safety notes.",
      color: "border-rose-500/30 text-rose-400"
    }
  ].find(item => item.id === selectedAgent) || {
    id: "world_builder",
    name: locale === "zh" ? "世界编制官" : "World Builder",
    title: locale === "zh" ? "Step 1.1 DNA & 经济编制" : "Step 1.1 DNA & Economy",
    avatar: "🧬",
    desc: locale === "zh" ? "负责逆天同人 IP DNA 逆向提取、主配色方案定义及境界阶梯编制。" : "Extracts theme DNA, palette, currency, and progression realms.",
    color: "border-emerald-500/30 text-emerald-400"
  };

  const isPendingApproval = status === 'pending_approval';

  const handleSend = async () => {
    if (!message.trim() || isSending) return;
    
    const userMsgText = message.trim();
    setMessage('');
    setIsSending(true);

    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    // Append user message immediately
    setConversations(prev => ({
      ...prev,
      [selectedAgent]: [
        ...prev[selectedAgent],
        { sender: 'user', text: userMsgText, timestamp: timeStr }
      ]
    }));

    addLog(`💬 [HITL] ${copy.sendLogPrefix} ${activeAgentInfo.name}: ${userMsgText}`);

    try {
      // Determine request path
      // If there is an active job in pending_approval, route through job chat
      let res;
      if (jobId && (status === 'pending_approval' || status === 'running')) {
        res = await fetch(`/api/jobs/${jobId}/chat`, {
          method: 'POST',
          headers: { 'Content-type': 'application/json' },
          body: JSON.stringify({
            message: userMsgText,
            agent_role: selectedAgent
          })
        });
      } else {
        // Direct workspace refinement route
        res = await fetch(`/api/workspaces/${workspaceId}/refine`, {
          method: 'POST',
          headers: { 'Content-type': 'application/json' },
          body: JSON.stringify({
            message: userMsgText,
            agent_role: selectedAgent
          })
        });
      }

      const data = await res.json();
      
      if (res.ok && data.success) {
        addLog(`✨ [${activeAgentInfo.name}] ${copy.saveLog}`);
        
        // If workspace route, instantly propagate updated game spec
        if (data.data) {
          onUpdateSpec(data.data);
        }

        setConversations(prev => ({
          ...prev,
          [selectedAgent]: [
            ...prev[selectedAgent],
            {
              sender: 'agent',
              text: locale === "zh"
                ? `已根据您的修改意愿「${userMsgText}」进行了神识微调优化。您可以通过查看最新 GDD 企划或启动编制来体验变更。`
                : `I refined the spec based on: "${userMsgText}". You can review the GDD or run the build flow to test it.`,
              timestamp: timeStr
            }
          ]
        }));
        
        onRefreshJob();
      } else {
        throw new Error(data.error || "请求失败");
      }
    } catch (e: any) {
      console.error(e);
      addLog(`❌ [神识波动异常] 协同调整中断: ${e.message || e}`);
      setConversations(prev => ({
        ...prev,
        [selectedAgent]: [
          ...prev[selectedAgent],
          {
            sender: 'agent',
            text: `⚠️ ${copy.fallbackError}`,
            timestamp: timeStr
          }
        ]
      }));
    } finally {
      setIsSending(false);
    }
  };

  const handleApprove = async () => {
    if (!jobId || isApproving) return;
    setIsApproving(true);
    addLog("⚡ [Master_Commit] 开始下达五部合一、编译生产落库指令...");
    try {
      const res = await fetch(`/api/jobs/${jobId}/approve`, {
        method: 'POST',
        headers: { 'Content-type': 'application/json' },
        body: JSON.stringify({})
      });
      if (res.ok) {
        addLog("🧙‍♂️ 主控管线: GDD 已作为基准神格固化，编译车间已启动 ASMR 增频以及 Phaser 代码合成...");
        onRefreshJob();
      } else {
        throw new Error("合并落库异常");
      }
    } catch (e: any) {
      console.error(e);
      addLog(`❌ [生产线故障] 固化落库失败: ${e.message || e}`);
    } finally {
      setIsApproving(false);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      className={`bg-white/90 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-900 relative overflow-hidden transition-colors duration-250 ${
        compact
          ? "rounded-lg p-3 shadow-lg"
          : "rounded-xl p-4 shadow-2xl"
      }`}
    >
      {/* Dynamic Aura Accent */}
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-500 via-teal-500 to-indigo-500" />

      <div className="flex flex-col gap-4">
          {/* Header with Sub-agent selection dropdown */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <h3 className="text-xs font-mono font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
              {copy.title}
            </h3>
          </div>
          <span className="text-4xs px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 uppercase font-mono animate-pulse">
            {copy.badge}
          </span>
        </div>
        
        {/* Custom Agent Quick-Select Bar */}
        <div className="grid grid-cols-5 gap-1 bg-slate-100 dark:bg-slate-950 p-1 rounded-lg border border-slate-200 dark:border-slate-800/80">
          {[
            { id: "world_builder", shortName: locale === "zh" ? "世界" : "World", avatar: "🧬" },
            { id: "narrative", shortName: locale === "zh" ? "大纲" : "Story", avatar: "📜" },
            { id: "sandbox", shortName: locale === "zh" ? "沙盒" : "Shell", avatar: "🛠️" },
            { id: "code_foundry", shortName: locale === "zh" ? "代码" : "Code", avatar: "⚙️" },
            { id: "auditor", shortName: locale === "zh" ? "审计" : "Audit", avatar: "👁️" }
          ].map((agent) => {
            const isSelected = selectedAgent === agent.id;
            return (
              <button
                key={agent.id}
                onClick={() => setSelectedAgent(agent.id)}
                className={`py-1.5 flex flex-col items-center justify-center rounded transition-all duration-250 cursor-pointer text-center select-none ${
                  isSelected
                    ? "bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 font-bold"
                    : "border border-transparent text-slate-500 hover:text-slate-900 hover:bg-slate-200/70 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-900/40"
                }`}
              >
                <span className="text-sm shrink-0 mb-0.5">{agent.avatar}</span>
                <span className="text-[10px] tracking-tight whitespace-nowrap">{agent.shortName}</span>
              </button>
            );
          })}
        </div>

          {/* Selected Agent Description Card */}
          <div className={`p-2.5 rounded-lg bg-white dark:bg-slate-950 border ${activeAgentInfo.color} transition-all duration-300`}>
            <p className="text-4xs text-slate-600 dark:text-slate-400 leading-relaxed font-sans">{activeAgentInfo.desc}</p>
          </div>

      {/* Internal Agent dialogue display log */}
      <div className="bg-white/70 dark:bg-slate-950/60 rounded-lg border border-slate-200 dark:border-slate-900/60 p-3 overflow-y-auto flex flex-col gap-3 scrollbar-thin h-[180px]">
        {conversations[selectedAgent].map((chat, ci) => (
          <div key={ci} className={`flex flex-col gap-1 ${chat.sender === 'user' ? 'items-end' : 'items-start'}`}>
            <div className="flex items-center gap-1.5 text-4xs text-slate-500">
              <span>{chat.sender === 'user' ? copy.you : activeAgentInfo.name}</span>
              <span>•</span>
              <span>{chat.timestamp}</span>
            </div>
            <div className={`px-2.5 py-1.5 rounded-lg max-w-[90%] text-3xs ${chat.sender === 'user' ? 'bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-500/20 text-slate-800 dark:text-slate-200 rounded-tr-none' : 'bg-white dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 rounded-tl-none'}`}>
              {chat.text}
            </div>
          </div>
        ))}
      </div>

      {/* Message Prompt Input Field */}
      <div className="flex flex-col gap-2">
        <div className="relative">
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            disabled={isSending}
            placeholder={`${copy.placeholderPrefix} ${activeAgentInfo.name} ${copy.placeholderSuffix}`}
            rows={compact ? 4 : 5}
            className={`w-full bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 pt-3 pb-12 pr-24 text-2xs text-slate-800 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-600 focus:outline-none focus:border-emerald-500 max-h-[220px] resize-y disabled:opacity-50 font-sans leading-relaxed ${compact ? "min-h-[92px]" : "min-h-[116px]"}`}
          />
          <button 
            onClick={handleSend}
            disabled={!message.trim() || isSending}
            className="absolute bottom-2.5 right-2 px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-slate-950 rounded font-semibold text-3xs disabled:opacity-30 transition cursor-pointer flex items-center gap-1"
          >
            {isSending ? (
              <RefreshCw className="w-3 h-3 animate-spin" />
            ) : (
              <Send className="w-3 h-3" />
            )}
            {copy.send}
          </button>
        </div>

        {/* Master Pipeline Approve and Commit gate */}
        {isPendingApproval && jobId && (
          <button 
            onClick={handleApprove}
            disabled={isApproving}
            className="w-full mt-1 bg-gradient-to-r from-emerald-100 to-teal-100 hover:from-emerald-200 hover:to-teal-200 dark:from-emerald-950 dark:to-teal-950 dark:hover:from-emerald-900 dark:hover:to-teal-900 border border-emerald-500/50 text-emerald-700 dark:text-emerald-400 font-semibold py-2 rounded text-xs transition flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-emerald-200/60 dark:shadow-emerald-950/50"
          >
            <Check className="w-4 h-4" />
            {isApproving ? copy.sending : copy.approve}
          </button>
        )}
      </div>
      </div>
    </motion.div>
  );
}
