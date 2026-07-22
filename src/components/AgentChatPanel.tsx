import React, { useEffect, useState, useRef } from "react";
import { Send, MessageSquare, Bot } from "lucide-react";
import { motion } from "motion/react";
import { Locale } from "../types";
import { CHAT_AGENT_LABELS } from "../utils/departmentPrep";

export interface AgentChatPanelProps {
  jobId?: string;
  status?: string;
  workspaceId: string;
  onRefreshJob: () => void;
  onUpdateSpec: (newSpec: any) => void;
  addLog: (msg: string) => void;
  locale?: Locale;
  /** Lock to one backend agent_role (department chatAgentId). Required for embedded mode. */
  agentRole: string;
  /** Department ID for chat history scoping (e.g. gameplay, narrative) */
  departmentId?: string;
  /** Display name of the department hosting this chat */
  departmentTitle?: string;
  /** Compact layout for department detail tab */
  embedded?: boolean;
}

interface ChatMessage {
  sender: "user" | "agent";
  text: string;
  timestamp: string;
}

const ROLE_GREETING: Record<string, { zh: string; en: string }> = {
  world_builder: {
    zh: "我是本部门对接的【世界编制】能力。可微调标题、配色、代币、境界与 progression 相关字段（受本部门 owns 约束）。",
    en: "World-building channel: refine title, palette, currency, realms, and progression fields."
  },
  narrative: {
    zh: "我是本部门对接的【叙事/玩法映射】能力。可微调关卡文案、节拍与节点规划说明。",
    en: "Narrative channel: refine node prose, beats, and planning notes."
  },
  sandbox: {
    zh: "我是本部门对接的【架构/宿主】能力。可讨论分辨率合同、store/registry 与 RFP 清单。",
    en: "Architecture channel: shell contracts, store/registry, feature packs."
  },
  code_foundry: {
    zh: "我是本部门对接的【代码/视听接线】能力。可讨论 adapter、juice、音频与运行时绑定。",
    en: "Code/runtime channel: adapters, juice, audio wiring."
  },
  auditor: {
    zh: "我是本部门对接的【质检/合规】能力。可讨论 gate、VLM 与内容安全风险。",
    en: "QA/compliance channel: gates, VLM, content safety."
  }
};

export function AgentChatPanel({
  jobId,
  status,
  workspaceId,
  onRefreshJob,
  onUpdateSpec,
  addLog,
  locale = "zh",
  agentRole,
  departmentId,
  departmentTitle,
  embedded = true
}: AgentChatPanelProps) {
  const zh = locale === "zh";
  const [message, setMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [showDoubleEnterHint, setShowDoubleEnterHint] = useState(false);
  const lastEnterTimeRef = useRef<number>(0);
  const hintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const targetDept = departmentId || agentRole;

  const clearHintTimer = () => {
    if (hintTimerRef.current) {
      clearTimeout(hintTimerRef.current);
      hintTimerRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      clearHintTimer();
    };
  }, []);

  const roleLabel =
    CHAT_AGENT_LABELS[agentRole]?.[zh ? "zh" : "en"] || agentRole;
  const greeting =
    ROLE_GREETING[agentRole]?.[zh ? "zh" : "en"] ||
    (zh
      ? "向本部门 Agent 发送微调意见，会写回当前 workspace 的设计规格。"
      : "Send refinement notes; updates apply to the current workspace spec.");

  // Fetch or reset thread when switching department / role
  useEffect(() => {
    let canceled = false;
    const fetchHistory = async () => {
      if (!workspaceId || !targetDept) return;
      try {
        const res = await fetch(
          `/api/workspaces/${workspaceId}/departments/${targetDept}/chat`
        );
        if (res.ok) {
          const data = await res.json();
          if (!canceled && data.success && Array.isArray(data.data) && data.data.length > 0) {
            setMessages(
              data.data.map((m: any) => ({
                sender: m.sender,
                text: m.text,
                timestamp: m.timestamp
              }))
            );
            setMessage("");
            return;
          }
        }
      } catch (e) {
        // Fallback to greeting
      }
      if (!canceled) {
        setMessages([
          {
            sender: "agent",
            text: greeting,
            timestamp: zh ? "系统" : "System"
          }
        ]);
        setMessage("");
      }
    };

    fetchHistory();
    return () => {
      canceled = true;
    };
  }, [agentRole, targetDept, workspaceId, greeting, zh]);

  const handleSend = async () => {
    if (!message.trim() || isSending || !workspaceId) return;

    clearHintTimer();
    setShowDoubleEnterHint(false);
    lastEnterTimeRef.current = 0;

    const userMsgText = message.trim();
    setMessage("");
    setIsSending(true);
    const timeStr = new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit"
    });

    setMessages((prev) => [
      ...prev,
      { sender: "user", text: userMsgText, timestamp: timeStr }
    ]);

    const deptTag = departmentTitle || roleLabel;
    addLog(
      zh
        ? `💬 [部门神识] ${deptTag} ← ${userMsgText}`
        : `💬 [Dept chat] ${deptTag}: ${userMsgText}`
    );

    try {
      let res: Response;
      if (jobId && (status === "pending_approval" || status === "running")) {
        res = await fetch(`/api/jobs/${jobId}/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: userMsgText,
            agent_role: agentRole,
            department_id: targetDept
          })
        });
      } else {
        res = await fetch(`/api/workspaces/${workspaceId}/refine`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: userMsgText,
            agent_role: agentRole,
            department_id: targetDept
          })
        });
      }


      const data = await res.json();
      if (res.ok && data.success) {
        addLog(
          zh
            ? `✨ [${deptTag}] 微调已写回规格`
            : `✨ [${deptTag}] Spec refined`
        );
        if (data.data) {
          onUpdateSpec(data.data);
        }
        setMessages((prev) => [
          ...prev,
          {
            sender: "agent",
            text: zh
              ? `已根据「${userMsgText}」完成微调。请在筹备意见中核对，满意后点「确认部门」。整包冷启动请用顶栏「生成蓝图」。`
              : `Refined based on: "${userMsgText}". Review prep notes, then Confirm department. Use header cold-start to rebuild the whole blueprint.`,
            timestamp: timeStr
          }
        ]);
        onRefreshJob();
      } else {
        throw new Error(data.error || (zh ? "请求失败" : "Request failed"));
      }
    } catch (e: any) {
      addLog(
        zh
          ? `❌ [神识异常] ${e.message || e}`
          : `❌ [Chat error] ${e.message || e}`
      );
      setMessages((prev) => [
        ...prev,
        {
          sender: "agent",
          text: zh
            ? "抱歉，微调服务暂时不可用（检查 XAI_API_KEY / 后端）。可先手写筹备意见并确认。"
            : "Refinement service unavailable. Edit prep notes manually and confirm.",
          timestamp: timeStr
        }
      ]);
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!message.trim() || isSending) return;

      const now = Date.now();
      const timeDiff = now - lastEnterTimeRef.current;

      if (timeDiff < 600) {
        lastEnterTimeRef.current = 0;
        clearHintTimer();
        setShowDoubleEnterHint(false);
        handleSend();
      } else {
        lastEnterTimeRef.current = now;
        setShowDoubleEnterHint(true);
        clearHintTimer();
        hintTimerRef.current = setTimeout(() => {
          setShowDoubleEnterHint(false);
          lastEnterTimeRef.current = 0;
        }, 1200);
      }
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`relative overflow-hidden border border-slate-200 dark:border-slate-800 bg-white/90 dark:bg-slate-950/50 ${
        embedded ? "rounded-lg" : "rounded-xl shadow-xl"
      }`}
    >
      <div className="absolute top-0 left-0 w-full h-0.5 bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500" />

      <div className="flex items-center justify-between gap-2 px-3 py-2.5 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-2 min-w-0">
          <MessageSquare className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
          <div className="min-w-0">
            <h4 className="text-[11px] font-mono font-bold text-slate-700 dark:text-slate-200 truncate">
              {zh ? "神识共鸣 · 部门对话" : "Dept HITL Chat"}
            </h4>
            <p className="text-[10px] text-slate-500 truncate">
              {departmentTitle || roleLabel}
              <span className="opacity-60"> · {agentRole}</span>
            </p>
          </div>
        </div>
        <span className="text-[9px] font-mono px-1.5 py-0.5 rounded border border-emerald-500/25 text-emerald-600 dark:text-emerald-400 shrink-0">
          {zh ? "绑定本部门" : "Scoped"}
        </span>
      </div>

      <div
        className={`flex flex-col gap-2 px-3 py-2 overflow-y-auto ${
          embedded ? "max-h-[280px] min-h-[160px]" : "max-h-[360px]"
        }`}
      >
        {messages.map((m, i) => (
          <div
            key={`${m.timestamp}-${i}`}
            className={`flex gap-2 ${m.sender === "user" ? "justify-end" : "justify-start"}`}
          >
            {m.sender === "agent" && (
              <div className="w-6 h-6 rounded-md bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
                <Bot className="w-3.5 h-3.5 text-emerald-500" />
              </div>
            )}
            <div
              className={`max-w-[85%] rounded-lg px-2.5 py-1.5 text-xs leading-relaxed ${
                m.sender === "user"
                  ? "bg-emerald-600 text-white"
                  : "bg-slate-100 dark:bg-slate-900 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-800"
              }`}
            >
              <p>{m.text}</p>
              <p
                className={`text-[9px] mt-1 font-mono ${
                  m.sender === "user" ? "text-emerald-100/80" : "text-slate-400"
                }`}
              >
                {m.timestamp}
              </p>
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-1.5 p-2.5 border-t border-slate-200 dark:border-slate-800">
        {showDoubleEnterHint && (
          <div className="text-[10px] text-emerald-600 dark:text-emerald-400 font-mono font-medium px-1 flex items-center gap-1 animate-pulse">
            <span>⚡ {zh ? "再按一次 Enter 发送神识" : "Press Enter again to send"}</span>
          </div>
        )}
        <div className="flex gap-2">
          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              zh
                ? `向「${departmentTitle || roleLabel}」发送微调意见 (双击 Enter 发送)…`
                : `Message ${departmentTitle || roleLabel} (Double Enter to send)…`
            }
            disabled={isSending}
            className="flex-1 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-2 focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:opacity-50"
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={isSending || !message.trim()}
            className="shrink-0 inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold disabled:opacity-40"
          >
            <Send className="w-3.5 h-3.5" />
            {isSending ? (zh ? "传输中…" : "…") : zh ? "发送" : "Send"}
          </button>
        </div>
      </div>
    </motion.div>
  );
}
