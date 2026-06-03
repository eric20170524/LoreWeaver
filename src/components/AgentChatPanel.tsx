import React, { useState } from 'react';
import { Send, Bot, Check, AlertTriangle } from 'lucide-react';
import { motion } from 'motion/react';

interface AgentChatPanelProps {
  jobId: string;
  status: string;
  stageName: string;
  onRefreshJob: () => void;
  onApprove: () => void;
}

export function AgentChatPanel({ jobId, status, stageName, onRefreshJob, onApprove }: AgentChatPanelProps) {
  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isApproving, setIsApproving] = useState(false);

  const isPendingApproval = status === 'pending_approval';

  const handleSend = async () => {
    if (!message.trim() || isSending) return;
    setIsSending(true);
    try {
      await fetch(`/api/jobs/${jobId}/chat`, {
        method: 'POST',
        headers: { 'Content-type': 'application/json' },
        body: JSON.stringify({ message })
      });
      setMessage('');
      onRefreshJob();
    } catch (e) {
      console.error(e);
    } finally {
      setIsSending(false);
    }
  };

  const handleApprove = async () => {
    setIsApproving(true);
    try {
      await fetch(`/api/jobs/${jobId}/approve`, {
        method: 'POST',
        headers: { 'Content-type': 'application/json' },
        body: JSON.stringify({})
      });
      onRefreshJob();
    } catch (e) {
      console.error(e);
    } finally {
      setIsApproving(false);
    }
  };

  if (!isPendingApproval && status !== 'running') return null;

  return (
    <motion.div 
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      className="bg-slate-900 border border-emerald-500/30 rounded-xl p-4 flex flex-col gap-4 relative overflow-hidden shadow-2xl shadow-emerald-900/10"
    >
      {/* Decorative gradient */}
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-500 to-cyan-500" />
      
      <div className="flex items-start gap-3">
        <div className="p-2 bg-emerald-950 rounded-lg text-emerald-400 shrink-0">
          <Bot className="w-5 h-5" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-slate-200">
            {stageName} 代理
          </h3>
          <p className="text-xs text-slate-400 mt-1">
            {isPendingApproval 
              ? "我已经完成了当前阶段的设计方案。请在预览区（PRD/Manifest标签页）检查结果。你可以提出修改意见，也可以点击批准落库。" 
              : "正在分析处理你的反馈，请稍候..."}
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <div className="relative">
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            disabled={!isPendingApproval || isSending}
            placeholder="告诉 Agent 你的修改意见..."
            className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-xs text-slate-200 focus:outline-none focus:border-emerald-500 min-h-[80px] resize-none disabled:opacity-50"
          />
          <button 
            onClick={handleSend}
            disabled={!isPendingApproval || !message.trim() || isSending}
            className="absolute bottom-2 right-2 p-1.5 bg-emerald-600 hover:bg-emerald-500 text-slate-950 rounded disabled:opacity-30 transition cursor-pointer"
          >
            <Send className="w-3 h-3" />
          </button>
        </div>

        {isPendingApproval && (
          <button 
            onClick={handleApprove}
            disabled={isApproving}
            className="w-full mt-2 bg-emerald-950 hover:bg-emerald-900 border border-emerald-500/50 text-emerald-400 font-semibold py-2 rounded text-xs transition flex items-center justify-center gap-2 cursor-pointer"
          >
            <Check className="w-4 h-4" />
            {isApproving ? " 落库合并中..." : "确认无误，合成落库 (Approve & Merge)"}
          </button>
        )}
      </div>

      {status === 'running' && (
        <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center z-10">
          <div className="bg-slate-900 border border-slate-700 px-4 py-2 rounded shadow-xl flex items-center gap-2 text-xs text-emerald-400 animate-pulse">
            <Bot className="w-4 h-4" /> 处理中...
          </div>
        </div>
      )}
    </motion.div>
  );
}
