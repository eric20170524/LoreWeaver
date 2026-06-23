import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { FolderGit2, FolderOpen, Plus, Upload, X, Server } from 'lucide-react';
import { Locale } from '../types';

export interface WorkspaceMeta {
  id: string;
  name: string;
  theme: string;
  createdAt: string;
  lastModifiedAt: string;
}

interface WorkspaceSelectorProps {
  activeWorkspaceId: string | null;
  onSelectWorkspace: (ws: WorkspaceMeta) => void;
  locale?: Locale;
}

const WORKSPACE_COPY = {
  zh: {
    emptySelection: "未选择工作区",
    lobby: "服务器工作区大厅",
    empty: "无历史项目",
    theme: "主题",
    modifiedAt: "修改于",
    importTitle: "导入已有项目目录",
    importPathPlaceholder: "粘贴包含 manifest.json 的本地目录路径",
    importNamePlaceholder: "显示名（可选）",
    importHelp: "导入会复制到隔离工作区，不会修改原目录。",
    chooseFolder: "选择目录",
    choosingFolder: "选择中",
    chooseFolderFailed: "无法打开本地目录选择器，请手动粘贴路径。",
    importAction: "导入并继续",
    importing: "导入中",
    createTitle: "新建隔离工作区",
    namePlaceholder: "工作区标识 (e.g. 遮天同人)",
    themePlaceholder: "设定主轴 (e.g. 九龙拉棺，星空古路)",
    create: "初始化后端目录",
    requestFailed: "请求失败"
  },
  en: {
    emptySelection: "No workspace",
    lobby: "Server Workspaces",
    empty: "No saved projects",
    theme: "Theme",
    modifiedAt: "Modified",
    importTitle: "Import Existing Project Folder",
    importPathPlaceholder: "Paste a local folder path containing manifest.json",
    importNamePlaceholder: "Display name (optional)",
    importHelp: "Import copies it into an isolated workspace and leaves the original folder unchanged.",
    chooseFolder: "Choose Folder",
    choosingFolder: "Choosing",
    chooseFolderFailed: "Could not open the local folder picker. Paste the path manually.",
    importAction: "Import and Continue",
    importing: "Importing",
    createTitle: "Create Isolated Workspace",
    namePlaceholder: "Workspace name (e.g. Star Archive)",
    themePlaceholder: "Theme axis (e.g. academy, trial, relics)",
    create: "Initialize Backend Folder",
    requestFailed: "Request failed"
  }
} as const;

type WorkspaceApiMeta = WorkspaceMeta & {
  created_at?: string;
  last_modified_at?: string;
};

function normalizeWorkspace(ws: WorkspaceApiMeta): WorkspaceMeta {
  return {
    id: ws.id,
    name: ws.name,
    theme: ws.theme,
    createdAt: ws.createdAt || ws.created_at || "",
    lastModifiedAt: ws.lastModifiedAt || ws.last_modified_at || ws.createdAt || ws.created_at || ""
  };
}

export function WorkspaceSelector({ activeWorkspaceId, onSelectWorkspace, locale = "zh" }: WorkspaceSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [workspaces, setWorkspaces] = useState<WorkspaceMeta[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isChoosingDirectory, setIsChoosingDirectory] = useState(false);
  const [newName, setNewName] = useState('');
  const [newTheme, setNewTheme] = useState('');
  const [importPath, setImportPath] = useState('');
  const [importName, setImportName] = useState('');
  const [importError, setImportError] = useState('');
  const copy = WORKSPACE_COPY[locale];

  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId);

  const loadWorkspaces = async () => {
    try {
      const res = await fetch('/api/workspaces');
      const json = await res.json();
      if (json.success) {
        setWorkspaces(json.data.map(normalizeWorkspace));
      }
    } catch (e) {
      console.error('Failed to load workspaces', e);
    }
  };

  useEffect(() => {
    loadWorkspaces();
  }, []);

  const handleCreate = async () => {
    if (!newName || !newTheme) return;
    setIsCreating(true);
    try {
      const res = await fetch('/api/workspaces', {
        method: 'POST',
        headers: { 'Content-type': 'application/json' },
        body: JSON.stringify({ name: newName, theme: newTheme })
      });
      const json = await res.json();
      if (json.success) {
        await loadWorkspaces();
        onSelectWorkspace(normalizeWorkspace(json.data));
        setIsOpen(false);
        setNewName('');
        setNewTheme('');
      }
    } catch (e) {
      console.error('Create error', e);
    } finally {
      setIsCreating(false);
    }
  };

  const handleChooseDirectory = async () => {
    setIsChoosingDirectory(true);
    setImportError('');
    try {
      const res = await fetch('/api/system/select-directory', {
        method: 'POST',
        headers: { 'Content-type': 'application/json' }
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.detail || json.error || copy.chooseFolderFailed);
      }
      if (json.cancelled) {
        return;
      }
      const selectedPath = json.data?.path || json.path;
      if (!selectedPath) {
        throw new Error(copy.chooseFolderFailed);
      }
      setImportPath(selectedPath);
    } catch (e: any) {
      setImportError(e.message || copy.chooseFolderFailed);
      console.error('Choose directory error', e);
    } finally {
      setIsChoosingDirectory(false);
    }
  };

  const handleImport = async () => {
    const sourcePath = importPath.trim();
    if (!sourcePath) return;
    setIsImporting(true);
    setImportError('');
    try {
      const res = await fetch('/api/workspaces/import', {
        method: 'POST',
        headers: { 'Content-type': 'application/json' },
        body: JSON.stringify({
          sourcePath,
          name: importName.trim() || undefined
        })
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.detail || json.error || copy.requestFailed);
      }
      const importedWorkspace = normalizeWorkspace(json.data);
      await loadWorkspaces();
      onSelectWorkspace(importedWorkspace);
      setIsOpen(false);
      setImportPath('');
      setImportName('');
    } catch (e: any) {
      setImportError(e.message || copy.requestFailed);
      console.error('Import error', e);
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="relative">
      <button 
        onClick={() => { setIsOpen(!isOpen); loadWorkspaces(); }}
        className="flex items-center gap-2 bg-slate-200 dark:bg-slate-900 border border-slate-300 dark:border-slate-800 hover:border-emerald-500/50 text-slate-800 dark:text-slate-300 px-3 py-1.5 rounded transition font-mono text-xs cursor-pointer"
      >
        <FolderGit2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
        <span className="truncate max-w-[120px]">
          {activeWorkspace ? activeWorkspace.name : copy.emptySelection}
        </span>
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="absolute top-full right-0 mt-2 w-[420px] max-w-[calc(100vw-2rem)] bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xl z-[100] overflow-hidden flex flex-col max-h-[620px]"
          >
            <div className="p-3 border-b border-slate-200 dark:border-slate-900 flex justify-between items-center bg-slate-50 dark:bg-slate-900/50">
              <span className="font-semibold text-xs tracking-wider uppercase text-slate-700 dark:text-slate-300 flex items-center gap-2">
                <Server className="w-3.5 h-3.5" />
                {copy.lobby}
              </span>
              <button onClick={() => setIsOpen(false)} className="text-slate-500 hover:text-slate-900 dark:hover:text-slate-300 cursor-pointer p-1">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 overflow-y-auto min-h-[100px] flex-1">
              {workspaces.length === 0 ? (
                <div className="text-center text-slate-500 text-xs py-4">{copy.empty}</div>
              ) : (
                <div className="space-y-2">
                  {workspaces.map((ws) => (
                    <div 
                      key={ws.id}
                      onClick={() => { onSelectWorkspace(ws); setIsOpen(false); }}
                      className={`p-3 rounded-lg border transition cursor-pointer flex flex-col gap-1 ${activeWorkspaceId === ws.id ? 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-500/50' : 'bg-white dark:bg-slate-900/30 border-slate-200 dark:border-slate-800 hover:border-slate-400 dark:hover:border-slate-700'}`}
                    >
                      <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-200">{ws.name}</h4>
                      <p className="text-3xs text-slate-500 truncate">{copy.theme}: {ws.theme}</p>
                      <p className="text-3xs text-slate-600 mt-1">
                        {copy.modifiedAt} {new Date(ws.lastModifiedAt).toLocaleString(locale === "zh" ? "zh-CN" : "en-US")}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="p-3 border-t border-slate-200 dark:border-slate-900 bg-white dark:bg-slate-950 flex flex-col gap-2">
              <span className="text-3xs text-slate-500 uppercase tracking-wider font-semibold mb-1 flex items-center gap-1.5">
                <FolderOpen className="w-3.5 h-3.5" />
                {copy.importTitle}
              </span>
              <div className="flex gap-2">
                <input
                  value={importPath}
                  onChange={e => setImportPath(e.target.value)}
                  placeholder={copy.importPathPlaceholder}
                  className="min-w-0 flex-1 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded px-2 py-1.5 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-cyan-500"
                />
                <button
                  type="button"
                  onClick={handleChooseDirectory}
                  disabled={isChoosingDirectory || isImporting}
                  title={copy.chooseFolder}
                  className="shrink-0 w-28 flex items-center justify-center gap-1 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-cyan-500 text-slate-700 dark:text-slate-200 text-xs font-semibold px-2 py-1.5 rounded disabled:opacity-50 transition cursor-pointer"
                >
                  <FolderOpen className="w-3.5 h-3.5" />
                  <span className="truncate">{isChoosingDirectory ? copy.choosingFolder : copy.chooseFolder}</span>
                </button>
              </div>
              <input
                value={importName}
                onChange={e => setImportName(e.target.value)}
                placeholder={copy.importNamePlaceholder}
                className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded px-2 py-1.5 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-cyan-500"
              />
              <p className="text-3xs text-slate-500 leading-relaxed">{copy.importHelp}</p>
              {importError && (
                <p className="text-3xs text-rose-600 dark:text-rose-400 leading-relaxed">{importError}</p>
              )}
              <button
                onClick={handleImport}
                disabled={isImporting || !importPath.trim()}
                className="mt-1 w-full flex items-center justify-center gap-1 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold py-1.5 rounded disabled:opacity-50 transition cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5" />
                {isImporting ? copy.importing : copy.importAction}
              </button>
            </div>

            <div className="p-3 border-t border-slate-200 dark:border-slate-900 bg-slate-50 dark:bg-slate-900/30 flex flex-col gap-2">
              <span className="text-3xs text-slate-500 uppercase tracking-wider font-semibold mb-1">{copy.createTitle}</span>
              <input 
                value={newName} onChange={e => setNewName(e.target.value)}
                placeholder={copy.namePlaceholder}
                className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded px-2 py-1.5 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-emerald-500"
              />
              <input 
                value={newTheme} onChange={e => setNewTheme(e.target.value)}
                placeholder={copy.themePlaceholder}
                className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded px-2 py-1.5 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-emerald-500"
              />
              <button 
                onClick={handleCreate} disabled={isCreating || !newName || !newTheme}
                className="mt-1 w-full flex items-center justify-center gap-1 bg-emerald-600 hover:bg-emerald-500 text-slate-950 text-xs font-semibold py-1.5 rounded disabled:opacity-50 transition cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                {copy.create}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
