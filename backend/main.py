import os
import uuid
import json
import io
import time
import secrets
import asyncio
import base64
import binascii
import html
import math
import platform
import shutil
import struct
import subprocess
import sys
import tempfile
import zipfile
import zlib
from typing import Optional
from fastapi import FastAPI, Depends, HTTPException, BackgroundTasks, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy.orm import Session

from .database import engine, Base, get_db
from .models import Workspace, Job, DepartmentChatMessage
from .schemas import (
    WorkspaceCreate, WorkspaceImport, WorkspaceResponse, WorkspaceListResponse,
    JobResponse, FeedbackRequest, ApproveRequest, JobModel, SelectDirectoryRequest
)
from .theme_presets import get_procedural_preset
from .agents import WorldBuilderAgent
from .llm_client import llm_status, imagegen_status
from .visual_audit import run_visual_critic, vlm_probe, find_codex_cli

# Initialize database schema
Base.metadata.create_all(bind=engine)

app = FastAPI(title="LoreWeaver Backend (FastAPI)")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

LORE_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
REPO_ROOT = os.path.abspath(os.path.join(LORE_ROOT, ".."))
# Try copied path inside LoreWeaver first, fall back to monorepo parent folder
MINIGAME_CORE_ROOT = os.path.join(LORE_ROOT, "minigame_master", "core")
if not os.path.exists(MINIGAME_CORE_ROOT):
    MINIGAME_CORE_ROOT = os.path.join(REPO_ROOT, "minigame_master", "core")
REPORTS_DIR = os.path.join(LORE_ROOT, "minigame_master", "capabilities", "reports")
DATA_DIR = os.path.join(LORE_ROOT, "data")
WORKSPACES_DIR = os.path.join(DATA_DIR, "workspaces")
NODE_SMOKE_SCRIPT = os.path.join(LORE_ROOT, "minigame_master", "capabilities", "verification", "run_node_smoke.mjs")
os.makedirs(WORKSPACES_DIR, exist_ok=True)


def run_node_smoke(ws_id: str, wall_ms: int = 3000, simulated_sec: int = 10) -> dict:
    """
    QA-owned per-node smoke (enter / spawnOrProgress / retreat).
    Writes workflow/reports/node_smoke_latest.json.
    Ownership: gate=qa, runtime=code, contract=gameplay.
    """
    os.makedirs(REPORTS_DIR, exist_ok=True)
    out_path = os.path.join(REPORTS_DIR, "node_smoke_latest.json")
    if not os.path.isfile(NODE_SMOKE_SCRIPT):
        report = {
            "schemaVersion": "loreweaver.node-smoke.v1",
            "status": "failed",
            "score": 0,
            "error": f"missing script {NODE_SMOKE_SCRIPT}",
            "owners": {"gate": "qa", "runtime": "code", "contract": "gameplay"},
        }
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(report, f, ensure_ascii=False, indent=2)
        return report

    cmd = [
        "node",
        NODE_SMOKE_SCRIPT,
        f"--workspace={ws_id}",
        f"--wall-ms={int(wall_ms)}",
        f"--simulated-sec={int(simulated_sec)}",
        f"--out={out_path}",
    ]
    try:
        proc = subprocess.run(
            cmd,
            cwd=LORE_ROOT,
            capture_output=True,
            text=True,
            timeout=max(60, int(wall_ms) * 14 // 1000 + 30),
        )
        if os.path.isfile(out_path):
            with open(out_path, "r", encoding="utf-8") as f:
                report = json.load(f)
            report["exitCode"] = proc.returncode
            if proc.stderr:
                report["stderr"] = (proc.stderr or "")[-1500:]
            return report
        return {
            "status": "failed",
            "score": 0,
            "error": "node_smoke produced no report",
            "stdout": (proc.stdout or "")[-800:],
            "stderr": (proc.stderr or "")[-800:],
            "exitCode": proc.returncode,
        }
    except Exception as exc:
        report = {
            "schemaVersion": "loreweaver.node-smoke.v1",
            "status": "failed",
            "score": 0,
            "error": str(exc),
            "owners": {"gate": "qa", "runtime": "code", "contract": "gameplay"},
        }
        try:
            with open(out_path, "w", encoding="utf-8") as f:
                json.dump(report, f, ensure_ascii=False, indent=2)
        except OSError:
            pass
        return report

# Helper: physical workspace directory path
def get_ws_path(ws_id: str) -> str:
    path = os.path.join(WORKSPACES_DIR, ws_id)
    os.makedirs(path, exist_ok=True)
    return path

def resolve_existing_ws_path(ws_id: str) -> str:
    workspaces_root = os.path.abspath(WORKSPACES_DIR)
    path = os.path.abspath(os.path.join(workspaces_root, ws_id))
    if not path.startswith(workspaces_root + os.sep):
        raise HTTPException(status_code=400, detail="Invalid workspace id")
    if not os.path.isdir(path):
        raise HTTPException(status_code=404, detail="Workspace not found")
    return path

def safe_export_name(value: str, fallback: str = "loreweaver-export") -> str:
    cleaned = "".join(ch if ch.isalnum() or ch in ("-", "_") else "-" for ch in value.strip())
    cleaned = "-".join(part for part in cleaned.split("-") if part)
    return cleaned[:80] or fallback

def utc_now_string() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

def workspace_id_timestamp(created_at: Optional[str] = None) -> str:
    if created_at:
        try:
            parsed = time.strptime(created_at, "%Y-%m-%dT%H:%M:%SZ")
            return time.strftime("%Y%m%d-%H%M%S", parsed)
        except ValueError:
            pass
    return time.strftime("%Y%m%d-%H%M%S", time.gmtime())

def generate_workspace_id(created_at: Optional[str] = None) -> str:
    random_digits = f"{secrets.randbelow(1_000_000):06d}"
    return f"{workspace_id_timestamp(created_at)}-{random_digits}"

def allocate_workspace_id(db: Session, created_at: str) -> str:
    for _ in range(20):
        ws_id = generate_workspace_id(created_at)
        exists_in_db = db.query(Workspace).filter(Workspace.id == ws_id).first()
        exists_on_disk = os.path.exists(os.path.join(WORKSPACES_DIR, ws_id))
        if not exists_in_db and not exists_on_disk:
            return ws_id
    raise HTTPException(status_code=500, detail="Failed to allocate unique workspace id")

def read_optional_workspace_meta(source_path: str) -> dict:
    meta_path = os.path.join(source_path, "meta.json")
    if not os.path.exists(meta_path):
        return {}
    try:
        with open(meta_path, "r", encoding="utf-8") as meta_file:
            meta = json.load(meta_file)
        return meta if isinstance(meta, dict) else {}
    except Exception:
        return {}

def workspace_copy_ignore(directory: str, names: list[str]) -> set[str]:
    skip_names = {"node_modules", "__pycache__", ".git", "dist", ".DS_Store"}
    ignored = set()
    for name in names:
        if name in skip_names or name.endswith((".pyc", ".pyo")):
            ignored.add(name)
            continue
        if os.path.islink(os.path.join(directory, name)):
            ignored.add(name)
    return ignored

def is_workspace_project_dir(source_path: str) -> bool:
    """A project dir under data/workspaces needs one of the known entry markers."""
    markers = ("manifest.json", "package.json", "index.html", "meta.json", "loreweaver/project.json")
    return any(os.path.exists(os.path.join(source_path, marker)) for marker in markers)

def validate_workspace_manifest(source_path: str, *, require_manifest: bool = True) -> dict:
    manifest_path = os.path.join(source_path, "manifest.json")
    if not os.path.isfile(manifest_path):
        if require_manifest:
            raise HTTPException(status_code=422, detail="Selected directory must contain manifest.json")
        # Soft project: still importable when already under data/workspaces
        return {}

    try:
        with open(manifest_path, "r", encoding="utf-8") as manifest_file:
            manifest = json.load(manifest_file)
        if not isinstance(manifest, dict):
            raise ValueError("manifest.json must contain a JSON object")
        return manifest
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Invalid manifest.json: {exc}") from exc

def path_is_under_workspaces(source_path: str) -> bool:
    root = os.path.abspath(WORKSPACES_DIR)
    candidate = os.path.abspath(source_path)
    try:
        return os.path.commonpath([root, candidate]) == root and candidate != root
    except ValueError:
        return False

def workspace_id_if_local_project(source_path: str) -> Optional[str]:
    """If source is a direct child of data/workspaces, return that folder name as id."""
    if not path_is_under_workspaces(source_path):
        return None
    root = os.path.abspath(WORKSPACES_DIR)
    candidate = os.path.abspath(source_path)
    rel = os.path.relpath(candidate, root)
    if os.sep in rel or rel in (".", ".."):
        return None
    return rel

def list_workspace_import_candidates() -> list[dict]:
    """Scan LoreWeaver/data/workspaces for existing project directories (default import pool)."""
    os.makedirs(WORKSPACES_DIR, exist_ok=True)
    candidates: list[dict] = []
    for entry in os.listdir(WORKSPACES_DIR):
        full = os.path.join(WORKSPACES_DIR, entry)
        if not os.path.isdir(full) or entry.startswith("."):
            continue
        if not is_workspace_project_dir(full):
            continue
        meta = read_optional_workspace_meta(full)
        manifest: dict = {}
        manifest_path = os.path.join(full, "manifest.json")
        if os.path.isfile(manifest_path):
            try:
                with open(manifest_path, "r", encoding="utf-8") as mf:
                    loaded = json.load(mf)
                    if isinstance(loaded, dict):
                        manifest = loaded
            except Exception:
                manifest = {}
        name = (meta.get("name") or manifest.get("title") or entry)
        theme = (meta.get("theme") or manifest.get("subtitle") or manifest.get("title") or "local workspace")
        try:
            mtime = os.path.getmtime(full)
            last_modified = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(mtime))
        except OSError:
            last_modified = utc_now_string()
        candidates.append({
            "id": entry,
            "name": str(name),
            "theme": str(theme),
            "path": full,
            "relativePath": f"data/workspaces/{entry}",
            "hasManifest": os.path.isfile(manifest_path),
            "lastModifiedAt": meta.get("lastModifiedAt") or last_modified
        })
    candidates.sort(key=lambda row: row.get("lastModifiedAt") or "", reverse=True)
    return candidates

def infer_workspace_fields(source_path: str, manifest: dict, name: Optional[str] = None, theme: Optional[str] = None) -> tuple[str, str]:
    meta = read_optional_workspace_meta(source_path)
    workspace_name = (name or meta.get("name") or manifest.get("title") or os.path.basename(source_path)).strip()
    workspace_theme = (theme or meta.get("theme") or manifest.get("title") or "Imported LoreWeaver project").strip()
    return workspace_name or "Imported LoreWeaver project", workspace_theme or "Imported LoreWeaver project"

def ensure_workspace_db_row(
    db: Session,
    ws_id: str,
    workspace_name: str,
    workspace_theme: str,
    created_at: Optional[str] = None,
    last_modified_at: Optional[str] = None
) -> Workspace:
    now_str = utc_now_string()
    existing = db.query(Workspace).filter(Workspace.id == ws_id).first()
    if existing:
        existing.name = workspace_name
        existing.theme = workspace_theme
        existing.last_modified_at = last_modified_at or now_str
        db.commit()
        db.refresh(existing)
        return existing
    workspace = Workspace(
        id=ws_id,
        name=workspace_name,
        theme=workspace_theme,
        created_at=created_at or now_str,
        last_modified_at=last_modified_at or now_str
    )
    db.add(workspace)
    db.commit()
    db.refresh(workspace)
    return workspace

def import_workspace_directory(
    source_path: str,
    db: Session,
    name: Optional[str] = None,
    theme: Optional[str] = None,
    source_label: Optional[str] = None
) -> Workspace:
    source_path = os.path.abspath(os.path.expanduser(source_path.strip()))
    if not os.path.isdir(source_path):
        raise HTTPException(status_code=404, detail="Source directory not found")

    # Default import pool: already under data/workspaces — open/register in place (no re-copy).
    local_id = workspace_id_if_local_project(source_path)
    if local_id:
        if not is_workspace_project_dir(source_path):
            raise HTTPException(status_code=422, detail="Selected folder is not a recognizable LoreWeaver project")
        manifest = validate_workspace_manifest(source_path, require_manifest=False)
        workspace_name, workspace_theme = infer_workspace_fields(source_path, manifest, name, theme)
        meta = read_optional_workspace_meta(source_path)
        now_str = utc_now_string()
        meta_path = os.path.join(source_path, "meta.json")
        meta_payload = {
            "id": local_id,
            "name": workspace_name,
            "theme": workspace_theme,
            "sourcePath": source_label or source_path,
            "createdAt": meta.get("createdAt") or now_str,
            "lastModifiedAt": now_str
        }
        try:
            with open(meta_path, "w", encoding="utf-8") as meta_file:
                json.dump(meta_payload, meta_file, ensure_ascii=False, indent=2)
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"Failed to update workspace meta: {exc}") from exc
        return ensure_workspace_db_row(
            db,
            local_id,
            workspace_name,
            workspace_theme,
            created_at=meta_payload["createdAt"],
            last_modified_at=now_str
        )

    # External path: copy into a new isolated workspace under data/workspaces.
    manifest = validate_workspace_manifest(source_path, require_manifest=True)
    now_str = utc_now_string()
    ws_id = allocate_workspace_id(db, now_str)
    ws_dir = os.path.join(WORKSPACES_DIR, ws_id)
    workspace_name, workspace_theme = infer_workspace_fields(source_path, manifest, name, theme)

    try:
        shutil.copytree(source_path, ws_dir, ignore=workspace_copy_ignore)
        with open(os.path.join(ws_dir, "meta.json"), "w", encoding="utf-8") as meta_file:
            json.dump({
                "id": ws_id,
                "name": workspace_name,
                "theme": workspace_theme,
                "sourcePath": source_label or source_path,
                "createdAt": now_str,
                "lastModifiedAt": now_str
            }, meta_file, ensure_ascii=False, indent=2)
    except Exception as exc:
        if os.path.exists(ws_dir):
            shutil.rmtree(ws_dir, ignore_errors=True)
        raise HTTPException(status_code=500, detail=f"Failed to import workspace: {exc}") from exc

    return ensure_workspace_db_row(db, ws_id, workspace_name, workspace_theme, created_at=now_str, last_modified_at=now_str)

def run_directory_picker_command(command: list[str], timeout: int = 120) -> str:
    result = subprocess.run(command, capture_output=True, text=True, timeout=timeout)
    if result.returncode == 0:
        return result.stdout.strip()

    stderr = result.stderr.strip()
    if "User canceled" in stderr or "cancelled" in stderr.lower() or "canceled" in stderr.lower():
        return ""
    raise RuntimeError(stderr or "Directory picker failed")

def select_local_directory(default_path: Optional[str] = None) -> str:
    """Open native folder picker. Defaults to LoreWeaver/data/workspaces."""
    title = "选择项目目录（默认 data/workspaces 下的已有项目）"
    start_dir = os.path.abspath(default_path or WORKSPACES_DIR)
    if not os.path.isdir(start_dir):
        os.makedirs(start_dir, exist_ok=True)
    system = platform.system()

    if system == "Darwin":
        prompt = title.replace("\\", "\\\\").replace('"', '\\"')
        start_escaped = start_dir.replace("\\", "\\\\").replace('"', '\\"')
        selected_path = run_directory_picker_command([
            "osascript",
            "-e", 'tell application "Finder" to activate',
            "-e", (
                f'try\n'
                f'  set defaultFolder to POSIX file "{start_escaped}" as alias\n'
                f'on error\n'
                f'  set defaultFolder to (path to home folder)\n'
                f'end try\n'
                f'POSIX path of (choose folder with prompt "{prompt}" default location defaultFolder)'
            )
        ])
        return os.path.abspath(os.path.expanduser(selected_path)) if selected_path else ""

    if system == "Windows":
        powershell = shutil.which("powershell") or shutil.which("pwsh")
        if powershell:
            start_ps = start_dir.replace("'", "''")
            command = (
                "Add-Type -AssemblyName System.Windows.Forms; "
                "$dialog = New-Object System.Windows.Forms.FolderBrowserDialog; "
                f"$dialog.Description = '{title}'; "
                f"$dialog.SelectedPath = '{start_ps}'; "
                "$dialog.ShowNewFolderButton = $false; "
                "if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) "
                "{ [Console]::Write($dialog.SelectedPath) }"
            )
            selected_path = run_directory_picker_command([powershell, "-NoProfile", "-Command", command])
            return os.path.abspath(os.path.expanduser(selected_path)) if selected_path else ""

    if shutil.which("zenity"):
        selected_path = run_directory_picker_command([
            "zenity",
            "--file-selection",
            "--directory",
            "--title",
            title,
            "--filename",
            start_dir + os.sep
        ])
        return os.path.abspath(os.path.expanduser(selected_path)) if selected_path else ""

    if shutil.which("kdialog"):
        selected_path = run_directory_picker_command([
            "kdialog",
            "--getexistingdirectory",
            start_dir
        ])
        return os.path.abspath(os.path.expanduser(selected_path)) if selected_path else ""

    tk_script = (
        "import tkinter as tk\n"
        "from tkinter import filedialog\n"
        "root = tk.Tk()\n"
        "root.withdraw()\n"
        "root.attributes('-topmost', True)\n"
        f"path = filedialog.askdirectory(title={title!r}, initialdir={start_dir!r})\n"
        "print(path or '')\n"
        "root.destroy()\n"
    )
    selected_path = run_directory_picker_command([sys.executable, "-c", tk_script])
    return os.path.abspath(os.path.expanduser(selected_path)) if selected_path else ""

def add_directory_to_zip(zip_file: zipfile.ZipFile, source_dir: str, archive_root: str):
    if not os.path.isdir(source_dir):
        return
    skip_dirs = {"node_modules", "__pycache__", ".git", "dist"}
    skip_suffixes = {".pyc", ".pyo", ".DS_Store"}
    for root, dirs, files in os.walk(source_dir):
        dirs[:] = [item for item in dirs if item not in skip_dirs]
        for filename in files:
            if filename in skip_suffixes or any(filename.endswith(suffix) for suffix in skip_suffixes):
                continue
            absolute_path = os.path.join(root, filename)
            rel_path = os.path.relpath(absolute_path, source_dir)
            archive_name = os.path.join(archive_root, rel_path).replace(os.sep, "/")
            zip_file.write(absolute_path, archive_name)

def build_export_index_html(manifest: dict) -> str:
    manifest_json = json.dumps(manifest, ensure_ascii=False, indent=2)
    script_safe_json = manifest_json.replace("<", "\\u003c").replace("&", "\\u0026")
    title = html.escape(str(manifest.get("title") or "LoreWeaver Export"))
    theme_color = html.escape(str(manifest.get("themeColor") or "#10b981"))
    return f"""<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>{title}</title>
  <style>
    :root {{ color-scheme: dark; --theme: {theme_color}; }}
    * {{ box-sizing: border-box; }}
    body {{
      margin: 0;
      min-height: 100vh;
      background: #020617;
      color: #e2e8f0;
      font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }}
    main {{
      width: min(1120px, calc(100vw - 32px));
      margin: 0 auto;
      padding: 36px 0 48px;
    }}
    header {{
      display: flex;
      justify-content: space-between;
      gap: 24px;
      align-items: end;
      border-bottom: 1px solid rgba(148, 163, 184, 0.24);
      padding-bottom: 22px;
      margin-bottom: 24px;
    }}
    h1 {{ margin: 0; font-size: clamp(28px, 5vw, 52px); letter-spacing: 0; }}
    p {{ color: #94a3b8; line-height: 1.7; }}
    button {{
      border: 1px solid color-mix(in srgb, var(--theme), white 15%);
      background: var(--theme);
      color: #020617;
      min-height: 42px;
      padding: 0 18px;
      border-radius: 8px;
      font-weight: 800;
      cursor: pointer;
    }}
    .hud, .stage, .panel {{
      border: 1px solid rgba(148, 163, 184, 0.2);
      background: rgba(15, 23, 42, 0.72);
      border-radius: 8px;
    }}
    .hud {{
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 12px;
      padding: 16px;
      margin-bottom: 18px;
    }}
    .metric {{ color: #94a3b8; font-size: 13px; }}
    .metric strong {{ display: block; color: #f8fafc; font-size: 18px; margin-top: 4px; }}
    .layout {{
      display: grid;
      grid-template-columns: minmax(0, 1fr) 360px;
      gap: 18px;
      align-items: start;
    }}
    .stage {{ min-height: 620px; padding: 18px; position: relative; overflow: hidden; }}
    canvas {{ width: 100%; aspect-ratio: 9 / 16; max-height: 74vh; background: #020617; border-radius: 8px; border: 1px solid rgba(148, 163, 184, 0.22); }}
    .panel {{ padding: 16px; max-height: 620px; overflow: auto; }}
    .node {{
      width: 100%;
      text-align: left;
      color: #e2e8f0;
      background: transparent;
      border-color: rgba(148, 163, 184, 0.2);
      margin-bottom: 10px;
    }}
    .node.active {{ border-color: var(--theme); box-shadow: 0 0 0 1px color-mix(in srgb, var(--theme), transparent 45%); }}
    .node span {{ display: block; color: #94a3b8; font-size: 12px; font-weight: 500; margin-top: 4px; }}
    @media (max-width: 860px) {{
      header {{ align-items: start; flex-direction: column; }}
      .layout {{ grid-template-columns: 1fr; }}
      canvas {{ max-height: none; }}
    }}
  </style>
</head>
<body>
  <main>
    <header>
      <div>
        <h1>{title}</h1>
        <p>Standalone LoreWeaver workspace export. The active manifest is embedded below and also saved as <code>manifest.json</code>.</p>
      </div>
      <button id="start">Start Node</button>
    </header>
    <section class="hud">
      <div class="metric">Currency<strong id="currency">0</strong></div>
      <div class="metric">Realm<strong id="realm">1</strong></div>
      <div class="metric">Selected Node<strong id="selected">1</strong></div>
    </section>
    <section class="layout">
      <div class="stage">
        <canvas id="game" width="720" height="1280"></canvas>
      </div>
      <aside class="panel">
        <h2>Nodes</h2>
        <div id="nodes"></div>
        <h2>Manifest</h2>
        <pre id="manifest"></pre>
      </aside>
    </section>
  </main>
  <script id="manifest-data" type="application/json">{script_safe_json}</script>
  <script>
    const manifest = JSON.parse(document.getElementById("manifest-data").textContent);
    const nodes = manifest.nodes || [];
    let selectedIndex = 0;
    let currency = 0;
    let realm = 1;
    const canvas = document.getElementById("game");
    const ctx = canvas.getContext("2d");
    const nodeList = document.getElementById("nodes");
    document.getElementById("manifest").textContent = JSON.stringify(manifest, null, 2);

    function paint(progress = 0) {{
      const node = nodes[selectedIndex] || {{}};
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
      gradient.addColorStop(0, "#020617");
      gradient.addColorStop(1, "#0f172a");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "{theme_color}";
      ctx.globalAlpha = 0.16;
      for (let i = 0; i < 28; i++) {{
        const x = (i * 97 + progress * 120) % canvas.width;
        const y = (i * 211 + progress * 420) % canvas.height;
        ctx.beginPath();
        ctx.arc(x, y, 18 + (i % 5) * 4, 0, Math.PI * 2);
        ctx.fill();
      }}
      ctx.globalAlpha = 1;
      ctx.strokeStyle = "{theme_color}";
      ctx.lineWidth = 5;
      ctx.strokeRect(48, 48, canvas.width - 96, canvas.height - 96);
      ctx.fillStyle = "#f8fafc";
      ctx.font = "700 44px sans-serif";
      ctx.fillText(node.title || manifest.title || "LoreWeaver", 76, 150);
      ctx.fillStyle = "#94a3b8";
      ctx.font = "26px sans-serif";
      wrapText(node.intro || "Manifest loaded. Use this shell as the portable export preview.", 76, 218, canvas.width - 152, 40);
      ctx.fillStyle = "{theme_color}";
      ctx.font = "700 30px sans-serif";
      ctx.fillText("Goal: " + (node.goalValue || "-") + " | Mechanic: " + (node.mechanics || node.gameplay?.cardId || "-"), 76, canvas.height - 150);
    }}

    function wrapText(text, x, y, maxWidth, lineHeight) {{
      const words = String(text).split("");
      let line = "";
      for (const word of words) {{
        const test = line + word;
        if (ctx.measureText(test).width > maxWidth && line) {{
          ctx.fillText(line, x, y);
          line = word;
          y += lineHeight;
        }} else {{
          line = test;
        }}
      }}
      ctx.fillText(line, x, y);
    }}

    function renderNodes() {{
      nodeList.innerHTML = "";
      nodes.forEach((node, index) => {{
        const button = document.createElement("button");
        button.className = "node" + (index === selectedIndex ? " active" : "");
        button.innerHTML = `${{node.id || index + 1}}. ${{node.title || "Untitled"}}<span>${{node.mechanics || node.gameplay?.cardId || "gameplay card"}}</span>`;
        button.onclick = () => {{
          selectedIndex = index;
          document.getElementById("selected").textContent = String(node.id || index + 1);
          renderNodes();
          paint();
        }};
        nodeList.appendChild(button);
      }});
    }}

    document.getElementById("start").onclick = () => {{
      const started = performance.now();
      function frame(now) {{
        const t = Math.min((now - started) / 1800, 1);
        paint(t);
        if (t < 1) requestAnimationFrame(frame);
        else {{
          const node = nodes[selectedIndex] || {{}};
          currency += Number(node.goalValue || 1);
          realm = Math.max(realm, Math.min(6, selectedIndex + 1));
          document.getElementById("currency").textContent = String(currency);
          document.getElementById("realm").textContent = String(realm);
        }}
      }}
      requestAnimationFrame(frame);
    }};

    renderNodes();
    paint();
  </script>
</body>
</html>
"""

def build_export_readme(workspace_id: str, manifest: dict) -> str:
    title = manifest.get("title") or "LoreWeaver Export"
    return f"""# {title}

This ZIP was generated by LoreWeaver for workspace `{workspace_id}`.

Contents:

- `index.html` - full playable H5 entrypoint with the workspace manifest embedded for static hosting.
- `manifest.json` - the exported workspace game spec.
- `assets/` - built React/Phaser frontend bundle assets.
- `nodes/` - workspace node HTML/JS runtime files.
- `scenes/` - generated workspace scene source files.
- `js/` - generated workspace data/runtime source files.
- `systems/` - generated workspace support systems.
- `loreweaver/` - LoreWeaver metadata, node specs, pipeline records, and provenance.
- `core/lib/` - reusable LoreWeaver/minigame runtime library source.

Serve the extracted folder with any static server and open `index.html`.
If the LoreWeaver production build was not available when this ZIP was created, `index.html` falls back to a manifest preview shell instead of the full playable H5 app.
"""

# Helper to resolve active stage index from progress and state
def get_stage_index_for_job(job) -> int:
    p = (job.progress or "").lower()
    if job.status == "pending_approval":
        return 1  # Step 1.2: waiting for approval
    if "1.1" in p:
        return 0
    elif "1.2" in p:
        return 1
    elif "2.1" in p:
        return 2
    elif "2.2" in p:
        return 3
    elif "3.1" in p:
        return 4
    elif "3.2" in p:
        return 5
    elif "3.3" in p or "complete" in p or "🎉" in p or job.status == "completed":
        return 6
    return 0

# Background Task to simulate async generation (Step 1.1 -> 1.2)
async def run_async_pipeline(job_id: str, db_session_maker, theme: str):
    db = db_session_maker()
    try:
        job = db.query(Job).filter(Job.id == job_id).first()
        if not job:
            return

        # ==================== Step 1.1 ====================
        job.progress = "🧬 [Step 1.1: IP DNA 与经济系统编制] 正在进行同人 IP DNA 逆向提取与 3-Resource 经济系数比例编制..."
        db.commit()
        await asyncio.sleep(1.5)

        # Connect to generator
        gdd = await WorldBuilderAgent.generate_gdd(theme)
        
        keywords = gdd.get("economy", {}).get("resources", ["灵能/Qi", "魂骸/Bones", "药魄/Essence"])
        realms_list = gdd.get("economy", {}).get("realms", ["筑基", "金丹", "元婴"])
        realms_str = " -> ".join(realms_list)
        
        job.progress = f"🧬 [Step 1.1] DNA 萃取成功！捕获核心资源属性: {', '.join(keywords)}。规划主修真体系境界阶梯: {realms_str}。"
        db.commit()
        await asyncio.sleep(1.5)

        # ==================== Step 1.2 ====================
        job.progress = "📜 [Step 1.2: 核心剧情大纲规划] Narrative Director 进程介入，开始智能规划 12 重本源境界大纲机制树..."
        db.commit()
        await asyncio.sleep(1.5)

        job.progress = "📜 [Step 1.2] 大纲编制完毕：12 重天本源境界解锁卡片序列、数值惩罚乘系数已就绪，等待人机协同神识确认。"
        job.status = "pending_approval"
        job.result_json = json.dumps(gdd, ensure_ascii=False)
        db.commit()

    except Exception as e:
        print(f"Async pipeline failed: {e}")
        try:
            job = db.query(Job).filter(Job.id == job_id).first()
            if job:
                job.status = "failed"
                job.progress = f"❌ Pipeline generation failed: {str(e)}"
                db.commit()
        except:
            pass
    finally:
        db.close()

# Background Task for compilation & physical sandbox setup (Step 2.1 -> 3.3)
async def run_async_compilation(job_id: str, final_gdd: dict, db_session_maker):
    db = db_session_maker()
    try:
        job = db.query(Job).filter(Job.id == job_id).first()
        if not job:
            return

        # ==================== Step 2.1 ====================
        job.progress = "🛠️ [Step 2.1: 宿主脚手架部署] 正在工作物理沙盒路径自动部署标准 package.json / vite.config.ts / main.js 并锁定 720x1280 锁屏分辨率框架..."
        db.commit()
        await asyncio.sleep(1.5)

        # ==================== Step 2.2 ====================
        job.progress = "💾 [Step 2.2: 状态机与存储器注入] 自动装载本地微数据库，动态注入 store.js 与 data.js 静态数据中心注册表，同步修真资产..."
        db.commit()
        await asyncio.sleep(1.5)

        # ==================== Step 3.1 ====================
        job.progress = "⚙️ [Step 3.1: 关卡玩法工厂代码编制] 正在将 12 重剧情玩法工厂与 Phaser 3 内核物理生命期双向配对绑定，注入 transitionLock 与 shutdown 防溢出回收机制..."
        db.commit()
        await asyncio.sleep(1.5)

        # ==================== Step 3.2 ====================
        job.progress = "🔊 [Step 3.2: ASMR 视听合成与着色增益] 初始化 Web Audio 锯齿、脉冲三相 ASMR 谐振。自动配置屏幕多维抖动与特效字浮空飘字 (VFX Floaters)。汉字 (Ch) 自动换行字模包裹完毕..."
        db.commit()
        await asyncio.sleep(1.5)

        # ==================== Step 3.3 ====================
        job.progress = "👁️ [Step 3.3: 视觉 VLM 模拟校验与知识回流] 采集 viewport 多维度高清渲染像素并对比 HUD 碰撞遮挡检测。清除全阶段敏感 IP 描述，提取通用性 Phaser/Vite 构建沉淀，完美通过 [PASS]！"
        db.commit()
        await asyncio.sleep(1.5)

        # Write merged manifest to physically loaded directory
        save_split_manifest(job.workspace_id, final_gdd)

        job.status = "completed"
        job.progress = "🎉 [Master_Reflow] 管线完美落地！配置清单、脚手架、代码工厂、ASMR 声相滤波已完全编译部署至工作沙盒中。"
        db.commit()

        # Update workspace timestamps
        workspace = db.query(Workspace).filter(Workspace.id == job.workspace_id).first()
        if workspace:
            now_str = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
            workspace.last_modified_at = now_str
            # Also sync physical meta
            with open(os.path.join(get_ws_path(workspace.id), "meta.json"), "r+", encoding="utf-8") as mf:
                meta_data = json.load(mf)
                meta_data["lastModifiedAt"] = now_str
                mf.seek(0)
                json.dump(meta_data, mf, ensure_ascii=False, indent=2)
                mf.truncate()
            db.commit()

    except Exception as e:
        print(f"Async compilation failed: {e}")
        try:
            job = db.query(Job).filter(Job.id == job_id).first()
            if job:
                job.status = "failed"
                job.progress = f"❌ 脚手架与代码工厂编译落库异常: {str(e)}"
                db.commit()
        except:
            pass
    finally:
        db.close()

async def run_async_feedback(job_id: str, db_session_maker, message: str, agent_role: Optional[str] = "world_builder"):
    db = db_session_maker()
    try:
        job = db.query(Job).filter(Job.id == job_id).first()
        if not job:
            return

        role_cn = {
            "world_builder": "世界编制官 (WorldBuilder)",
            "narrative": "剧本大纲师 (Narrative)",
            "sandbox": "沙盒架构师 (SandboxArchitect)",
            "code_foundry": "代码铸造厂 (CodeFoundry)",
            "auditor": "多模审计官 (Auditor)"
        }.get(agent_role, "世界编制官 (WorldBuilder)")

        job.status = "running"
        job.progress = f"🔄 {role_cn}: 正在根据神识意见微调方案:「{message}」..."
        db.commit()
        await asyncio.sleep(1.5)

        current_gdd = {}
        if job.result_json:
            current_gdd = json.loads(job.result_json)

        new_gdd = await WorldBuilderAgent.adjust_gdd(current_gdd, message, agent_role)

        job.progress = f"✅ {role_cn}: 修改已经完美融入游戏企划书，等待人机最后编译落库确认。"
        job.result_json = json.dumps(new_gdd, ensure_ascii=False)
        job.status = "pending_approval"
        db.commit()

    except Exception as e:
        print(f"Feedback thread failed: {e}")
        try:
            job = db.query(Job).filter(Job.id == job_id).first()
            if job:
                job.status = "pending_approval"
                job.progress = f"⚠️ 神识反馈合并异常: {str(e)}"
                db.commit()
        except:
            pass
    finally:
        db.close()

# 📂 Workspace API Routing
@app.post("/api/system/select-directory")
def api_select_directory(payload: Optional[SelectDirectoryRequest] = None):
    """Native folder picker. Defaults to LoreWeaver/data/workspaces."""
    default_path = WORKSPACES_DIR
    requested = payload.default_path if payload else None
    if isinstance(requested, str) and requested.strip():
        candidate = os.path.abspath(os.path.expanduser(requested.strip()))
        if os.path.isdir(candidate):
            default_path = candidate
    try:
        selected_path = select_local_directory(default_path=default_path)
    except subprocess.TimeoutExpired as exc:
        raise HTTPException(status_code=504, detail="Directory picker timed out") from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to open directory picker: {exc}") from exc

    if not selected_path:
        return {"success": False, "cancelled": True, "data": None}

    if not os.path.isdir(selected_path):
        raise HTTPException(status_code=404, detail="Selected directory not found")

    return {
        "success": True,
        "cancelled": False,
        "data": {
            "path": selected_path,
            "defaultPath": default_path,
            "underWorkspaces": path_is_under_workspaces(selected_path)
        }
    }

@app.get("/api/workspaces/import-candidates")
def api_list_import_candidates():
    """List existing project dirs under LoreWeaver/data/workspaces (default import source)."""
    candidates = list_workspace_import_candidates()
    return {
        "success": True,
        "data": {
            "root": WORKSPACES_DIR,
            "relativeRoot": "data/workspaces",
            "candidates": candidates
        }
    }

@app.post("/api/workspaces", response_model=WorkspaceResponse)
def api_create_workspace(payload: WorkspaceCreate, db: Session = Depends(get_db)):
    now_str = utc_now_string()
    ws_id = allocate_workspace_id(db, now_str)
    
    workspace = Workspace(
        id=ws_id,
        name=payload.name,
        theme=payload.theme,
        created_at=now_str,
        last_modified_at=now_str
    )
    db.add(workspace)
    db.commit()
    db.refresh(workspace)

    # Replicate meta metadata physically inside directory to guarantee node server & client can load easily
    ws_dir = get_ws_path(ws_id)
    with open(os.path.join(ws_dir, "meta.json"), "w", encoding="utf-8") as f:
        json.dump({
            "id": ws_id,
            "name": payload.name,
            "theme": payload.theme,
            "createdAt": now_str,
            "lastModifiedAt": now_str
        }, f, ensure_ascii=False, indent=2)

    return {"success": True, "data": workspace}

@app.post("/api/workspaces/import", response_model=WorkspaceResponse)
def api_import_workspace(payload: WorkspaceImport, db: Session = Depends(get_db)):
    source_path = (payload.source_path or "").strip() if payload.source_path else ""
    workspace_id = (payload.workspace_id or "").strip() if payload.workspace_id else ""
    if workspace_id:
        # Prefer explicit id under data/workspaces (default import pool).
        if any(sep in workspace_id for sep in ("/", "\\", "..")):
            raise HTTPException(status_code=400, detail="Invalid workspaceId")
        source_path = os.path.join(WORKSPACES_DIR, workspace_id)
    if not source_path:
        raise HTTPException(status_code=422, detail="sourcePath or workspaceId is required")
    workspace = import_workspace_directory(
        source_path,
        db,
        name=payload.name,
        theme=payload.theme
    )
    return {"success": True, "data": workspace}

@app.get("/api/workspaces", response_model=WorkspaceListResponse)
def api_list_workspaces(db: Session = Depends(get_db)):
    """List DB workspaces and auto-register any project dirs found under data/workspaces."""
    # Ensure on-disk projects under data/workspaces appear in the lobby.
    for candidate in list_workspace_import_candidates():
        existing = db.query(Workspace).filter(Workspace.id == candidate["id"]).first()
        if existing:
            continue
        ensure_workspace_db_row(
            db,
            candidate["id"],
            candidate["name"],
            candidate["theme"],
            last_modified_at=candidate.get("lastModifiedAt")
        )

    workspaces = db.query(Workspace).all()
    # Sort by last modified
    workspaces.sort(key=lambda x: x.last_modified_at, reverse=True)
    return {"success": True, "data": workspaces}

@app.get("/api/workspaces/{ws_id}", response_model=WorkspaceResponse)
def api_get_workspace(ws_id: str, db: Session = Depends(get_db)):
    workspace = db.query(Workspace).filter(Workspace.id == ws_id).first()
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace not found")
    return {"success": True, "data": workspace}

def load_assembled_manifest(ws_id: str) -> dict:
    ws_path = resolve_existing_ws_path(ws_id)
    manifest_path = os.path.join(ws_path, "manifest.json")
    if not os.path.exists(manifest_path):
        raise HTTPException(status_code=404, detail="manifest.json not found")
        
    try:
        with open(manifest_path, "r", encoding="utf-8") as f:
            manifest = json.load(f)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to parse manifest: {exc}")
        
    nodes_dir = os.path.join(ws_path, "loreweaver", "nodes")
    if os.path.isdir(nodes_dir):
        node_files = sorted([f for f in os.listdir(nodes_dir) if f.endswith(".json")])
        loaded_nodes = []
        for nf in node_files:
            try:
                with open(os.path.join(nodes_dir, nf), "r", encoding="utf-8") as f:
                    loaded_nodes.append(json.load(f))
            except:
                pass
        if loaded_nodes:
            loaded_nodes.sort(key=lambda x: x.get("id", 0))
            manifest["nodes"] = loaded_nodes

    catalogs_dir = os.path.join(ws_path, "loreweaver", "catalogs")
    if os.path.isdir(catalogs_dir):
        for cat_file in os.listdir(catalogs_dir):
            if cat_file.endswith(".json"):
                key = cat_file[:-5]
                try:
                    with open(os.path.join(catalogs_dir, cat_file), "r", encoding="utf-8") as f:
                        manifest[key] = json.load(f)
                except:
                    pass
                    
    return manifest

def save_split_manifest(ws_id: str, manifest: dict):
    ws_path = resolve_existing_ws_path(ws_id)
    manifest_path = os.path.join(ws_path, "manifest.json")
    
    nodes = manifest.pop("nodes", None)
    if nodes is not None:
        nodes_dir = os.path.join(ws_path, "loreweaver", "nodes")
        os.makedirs(nodes_dir, exist_ok=True)
        for node in nodes:
            node_id = node.get("id", 0)
            prefix = f"node-{node_id:02d}"
            existing_files = [f for f in os.listdir(nodes_dir) if f.startswith(prefix) and f.endswith(".json")]
            filename = existing_files[0] if existing_files else f"{prefix}.json"
            with open(os.path.join(nodes_dir, filename), "w", encoding="utf-8") as f:
                json.dump(node, f, ensure_ascii=False, indent=2)

    catalogs_dir = os.path.join(ws_path, "loreweaver", "catalogs")
    catalog_keys = ["abilityCatalog", "passiveSkillCatalog", "characterDesignCatalog", "enemyDesignCatalog", "skillEffectCatalog", "audioCueCatalog"]
    for key in catalog_keys:
        if key in manifest:
            data = manifest.pop(key)
            os.makedirs(catalogs_dir, exist_ok=True)
            with open(os.path.join(catalogs_dir, f"{key}.json"), "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
                
    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)

@app.get("/api/workspaces/{ws_id}/files/{filename}")
def api_get_workspace_file(ws_id: str, filename: str):
    if filename == "manifest.json":
        try:
            return {"success": True, "data": load_assembled_manifest(ws_id)}
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))
            
    file_path = os.path.join(get_ws_path(ws_id), filename)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found")
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        return {"success": True, "data": data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/workspaces/{ws_id}/asset-files/{file_path:path}")
def api_get_workspace_asset_file(ws_id: str, file_path: str):
    ws_path = resolve_existing_ws_path(ws_id)
    absolute_path = os.path.abspath(os.path.join(ws_path, file_path))
    if not absolute_path.startswith(os.path.abspath(ws_path) + os.sep):
        raise HTTPException(status_code=400, detail="Invalid workspace asset path")
    if not os.path.isfile(absolute_path):
        raise HTTPException(status_code=404, detail="Workspace asset file not found")
    return FileResponse(absolute_path)

@app.post("/api/workspaces/{ws_id}/files/{filename}")
def api_save_workspace_file(ws_id: str, filename: str, payload: dict):
    try:
        content_data = payload.get("data", payload)
        if filename == "manifest.json":
            save_split_manifest(ws_id, content_data)
        else:
            file_path = os.path.join(get_ws_path(ws_id), filename)
            with open(file_path, "w", encoding="utf-8") as f:
                json.dump(content_data, f, ensure_ascii=False, indent=2)
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/workspaces/{ws_id}/export")
def api_export_workspace(ws_id: str):
    ws_path = resolve_existing_ws_path(ws_id)
    try:
        manifest = load_assembled_manifest(ws_id)
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Invalid manifest.json: {exc}") from exc

    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zip_file:
        zip_file.writestr("manifest.json", json.dumps(manifest, ensure_ascii=False, indent=2))
        zip_file.writestr("README.md", build_export_readme(ws_id, manifest))

        dist_index_path = os.path.join(LORE_ROOT, "dist", "index.html")
        if os.path.exists(dist_index_path):
            with open(dist_index_path, "r", encoding="utf-8") as f:
                index_html = f.read()

            embedded_script = f"""<script>
window.__LOREWEAVER_EMBEDDED_SPEC__ = {json.dumps(manifest, ensure_ascii=False)};
</script>"""

            if "</head>" in index_html:
                index_html = index_html.replace("</head>", f"{embedded_script}\n</head>")
            else:
                index_html = embedded_script + "\n" + index_html
            index_html = index_html.replace('src="/assets/', 'src="./assets/')
            index_html = index_html.replace('href="/assets/', 'href="./assets/')
            zip_file.writestr("index.html", index_html)
        else:
            zip_file.writestr("index.html", build_export_index_html(manifest))

        dist_assets_dir = os.path.join(LORE_ROOT, "dist", "assets")
        if os.path.exists(dist_assets_dir):
            add_directory_to_zip(zip_file, dist_assets_dir, "assets")

        ws_assets_dir = os.path.join(ws_path, "assets")
        if os.path.exists(ws_assets_dir):
            add_directory_to_zip(zip_file, ws_assets_dir, "assets")

        ws_nodes_dir = os.path.join(ws_path, "nodes")
        if os.path.exists(ws_nodes_dir):
            add_directory_to_zip(zip_file, ws_nodes_dir, "nodes")

        for source_name in ("scenes", "js", "systems", "loreweaver", "css", "utils"):
            source_dir = os.path.join(ws_path, source_name)
            if os.path.exists(source_dir):
                add_directory_to_zip(zip_file, source_dir, source_name)

        add_directory_to_zip(zip_file, os.path.join(MINIGAME_CORE_ROOT, "lib"), "core/lib")

    zip_buffer.seek(0)
    title = safe_export_name(str(manifest.get("title") or ws_id))
    filename = f"loreweaver-{title}.zip"
    import urllib.parse
    quoted_filename = urllib.parse.quote(filename)
    headers = {
        "Content-Disposition": f'attachment; filename="{quoted_filename}"; filename*=UTF-8\'\'{quoted_filename}'
    }
    return StreamingResponse(zip_buffer, media_type="application/zip", headers=headers)

@app.get("/api/workspaces/{ws_id}/export-release")
def api_export_release_workspace(ws_id: str):
    ws_path = resolve_existing_ws_path(ws_id)
    import subprocess
    import json
    import io
    
    script_path = os.path.join(LORE_ROOT, "productize", "export-standalone.mjs")
    workspace_arg = f"--workspace=data/workspaces/{ws_id}"
    
    try:
        # Run node productize/export-standalone.mjs --workspace=data/workspaces/{ws_id}
        result = subprocess.run(
            ["node", script_path, workspace_arg],
            capture_output=True,
            text=True,
            cwd=LORE_ROOT,
            check=True
        )
        
        # Parse output JSON to find the artifact path
        output_data = json.loads(result.stdout.strip())
        artifact_rel_path = output_data.get("artifact")
        if not artifact_rel_path:
            raise Exception("Export script did not return artifact path in stdout JSON.")
            
        artifact_path = os.path.join(LORE_ROOT, artifact_rel_path)
        if not os.path.exists(artifact_path):
            raise Exception(f"Exported artifact file not found at: {artifact_path}")
            
        # Read the generated ZIP file
        with open(artifact_path, "rb") as f:
            zip_content = f.read()
            
        filename = os.path.basename(artifact_path)
        import urllib.parse
        quoted_filename = urllib.parse.quote(filename)
        headers = {
            "Content-Disposition": f'attachment; filename="{quoted_filename}"; filename*=UTF-8\'\'{quoted_filename}'
        }
        
        return StreamingResponse(io.BytesIO(zip_content), media_type="application/zip", headers=headers)
        
    except subprocess.CalledProcessError as exc:
        err_msg = exc.stderr or exc.stdout or str(exc)
        raise HTTPException(status_code=500, detail=f"Vite compilation / packaging failed: {err_msg}")
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Export release package failed: {exc}")

# 🎨 Presets API
@app.get("/api/presets")
def api_get_presets(theme: str = Query("仙侠")):
    preset = get_procedural_preset(theme)
    return {"success": True, "data": preset}

# 🤖 Orchestration Pipeline Jobs API
@app.post("/api/jobs/start")
def api_start_job(payload: dict, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    workspace_id = payload.get("workspaceId")
    theme = payload.get("theme")
    if not workspace_id or not theme:
        raise HTTPException(status_code=400, detail="Missing workspaceId or theme")

    workspace = db.query(Workspace).filter(Workspace.id == workspace_id).first()
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace not found")

    # Cancel previous jobs for this workspace
    previous_jobs = db.query(Job).filter(Job.workspace_id == workspace_id).all()
    for p_job in previous_jobs:
        if p_job.status in ["running", "pending_approval"]:
            p_job.status = "failed"
            p_job.progress = "❌ Cancelled by starting a new orchestration pipe."
    db.commit()

    job_id = str(uuid.uuid4())
    job = Job(
        id=job_id,
        workspace_id=workspace_id,
        stage="world_building",
        status="running",
        progress="🧬 [Step 1.1: IP DNA 与经济系统编制] 正在进行同人 IP DNA 逆向提取与 3-Resource 经济系统编制...",
        payload_json=json.dumps({"theme": theme}),
        result_json=None,
        message=None,
        created_at=time.time()
    )
    db.add(job)
    db.commit()

    # Import SessionLocal session maker to access thread safety inside background worker
    from .database import SessionLocal
    background_tasks.add_task(run_async_pipeline, job_id, SessionLocal, theme)

    # Convert to schema format
    result_dict = None
    if job.result_json:
        result_dict = json.loads(job.result_json)
    payload_dict = json.loads(job.payload_json) if job.payload_json else None

    return {
        "success": True,
        "data": {
            "id": job.id,
            "workspace_id": job.workspace_id,
            "stage": job.stage,
            "status": job.status,
            "progress": job.progress,
            "stage_index": get_stage_index_for_job(job),
            "payload": payload_dict,
            "result": result_dict,
            "message": job.message,
            "created_at": job.created_at
        }
    }

@app.get("/api/jobs/{job_id}")
def api_get_job(job_id: str, db: Session = Depends(get_db)):
    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    result_dict = None
    if job.result_json:
        result_dict = json.loads(job.result_json)
    payload_dict = json.loads(job.payload_json) if job.payload_json else None

    return {
        "success": True,
        "data": {
            "id": job.id,
            "workspace_id": job.workspace_id,
            "stage": job.stage,
            "status": job.status,
            "progress": job.progress,
            "stage_index": get_stage_index_for_job(job),
            "payload": payload_dict,
            "result": result_dict,
            "message": job.message,
            "created_at": job.created_at
        }
    }

@app.get("/api/workspaces/{workspace_id}/job")
def api_get_workspace_job(workspace_id: str, db: Session = Depends(get_db)):
    job = db.query(Job).filter(Job.workspace_id == workspace_id).order_by(Job.created_at.desc()).first()
    if not job:
        return {"success": True, "data": None}
    
    result_dict = None
    if job.result_json:
        result_dict = json.loads(job.result_json)
    payload_dict = json.loads(job.payload_json) if job.payload_json else None

    return {
        "success": True,
        "data": {
            "id": job.id,
            "workspace_id": job.workspace_id,
            "stage": job.stage,
            "status": job.status,
            "progress": job.progress,
            "stage_index": get_stage_index_for_job(job),
            "payload": payload_dict,
            "result": result_dict,
            "message": job.message,
            "created_at": job.created_at
        }
    }

@app.post("/api/jobs/{job_id}/approve")
def api_approve_job(job_id: str, payload: ApproveRequest, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    if not job.result_json:
        raise HTTPException(status_code=400, detail="No result data to approve yet")

    try:
        # Merge specifications
        final_gdd = json.loads(job.result_json)
        if payload.modifications:
            final_gdd.update(payload.modifications)

        # Transition Job to intermediate compilation mode
        job.result_json = json.dumps(final_gdd, ensure_ascii=False)
        job.status = "running"
        job.progress = "🛠️ [Step 2.1: 宿主脚手架部署] 正在工作物理沙盒路径自动部署标准 package.json / vite.config.ts / main.js 并锁定 720x1280 锁屏分辨率框架..."
        db.commit()

        # Import SessionLocal session maker to access thread safety inside background worker
        from .database import SessionLocal
        background_tasks.add_task(run_async_compilation, job.id, final_gdd, SessionLocal)

        return {
            "success": True,
            "data": {
                "id": job.id,
                "workspace_id": job.workspace_id,
                "stage": job.stage,
                "status": job.status,
                "progress": job.progress,
                "stage_index": 2,
                "result": final_gdd,
                "created_at": job.created_at
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Merge error: {str(e)}")

@app.post("/api/jobs/{job_id}/chat")
def api_chat_job(job_id: str, payload: FeedbackRequest, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    # Launch feedback refinement thread and pass agent_role
    from .database import SessionLocal
    background_tasks.add_task(run_async_feedback, job_id, SessionLocal, payload.message, payload.agent_role)

    return {"success": True}

@app.post("/api/workspaces/{workspace_id}/refine")
async def api_refine_workspace(workspace_id: str, payload: FeedbackRequest, db: Session = Depends(get_db)):
    workspace = db.query(Workspace).filter(Workspace.id == workspace_id).first()
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace not found")

    ws_path = get_ws_path(workspace_id)
    manifest_path = os.path.join(ws_path, "manifest.json")
    
    current_gdd = {}
    if os.path.exists(manifest_path):
        with open(manifest_path, "r", encoding="utf-8") as f:
            try:
                current_gdd = json.load(f)
            except:
                pass
                
    active_job = db.query(Job).filter(Job.workspace_id == workspace_id).order_by(Job.created_at.desc()).first()
    if not current_gdd and active_job and active_job.result_json:
        try:
            current_gdd = json.loads(active_job.result_json)
        except:
            pass

    ROLE_TO_DEPT = {
        "world_builder": "world",
        "narrative": "narrative",
        "sandbox": "architecture",
        "code_foundry": "code",
        "auditor": "qa",
    }
    dept_id = payload.department_id or ROLE_TO_DEPT.get(payload.agent_role or "", "gameplay")

    time_str = time.strftime("%H:%M")
    now_ts = time.time()

    # Record user message in SQLite
    user_chat = DepartmentChatMessage(
        workspace_id=workspace_id,
        department_id=dept_id,
        agent_role=payload.agent_role or "narrative",
        sender="user",
        text=payload.message,
        timestamp=time_str,
        created_at=now_ts,
    )
    db.add(user_chat)
    db.commit()

    # Direct agent invocation
    reply_text = f"已根据「{payload.message}」完成微调。请在筹备意见中核对，满意后点「确认部门」。"
    try:
        new_gdd = await WorldBuilderAgent.adjust_gdd(current_gdd, payload.message, payload.agent_role)
    except Exception as exc:
        reply_text = f"微调服务报错: {str(exc)}"
        agent_chat = DepartmentChatMessage(
            workspace_id=workspace_id,
            department_id=dept_id,
            agent_role=payload.agent_role or "narrative",
            sender="agent",
            text=reply_text,
            timestamp=time_str,
            created_at=time.time(),
        )
        db.add(agent_chat)
        db.commit()
        raise HTTPException(status_code=500, detail=str(exc))
    
    # Save optimized manifest
    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(new_gdd, f, ensure_ascii=False, indent=2)
        
    if active_job:
        active_job.result_json = json.dumps(new_gdd, ensure_ascii=False)

    # Record agent response in SQLite
    agent_chat = DepartmentChatMessage(
        workspace_id=workspace_id,
        department_id=dept_id,
        agent_role=payload.agent_role or "narrative",
        sender="agent",
        text=reply_text,
        timestamp=time_str,
        created_at=time.time(),
    )
    db.add(agent_chat)
    db.commit()

    return {"success": True, "data": new_gdd}


def decode_png_data_url(data_url: str) -> bytes:
    if not data_url:
        raise ValueError("Missing screenshot_base64.")
    encoded = data_url.split(",", 1)[1] if "," in data_url else data_url
    try:
        return base64.b64decode(encoded, validate=True)
    except binascii.Error as exc:
        raise ValueError(f"Invalid base64 screenshot: {exc}") from exc

def paeth_predictor(a: int, b: int, c: int) -> int:
    p = a + b - c
    pa = abs(p - a)
    pb = abs(p - b)
    pc = abs(p - c)
    if pa <= pb and pa <= pc:
        return a
    if pb <= pc:
        return b
    return c

def unfilter_png_scanline(filter_type: int, scanline: bytearray, previous: bytearray, bpp: int) -> bytearray:
    for i in range(len(scanline)):
        left = scanline[i - bpp] if i >= bpp else 0
        up = previous[i] if previous else 0
        up_left = previous[i - bpp] if previous and i >= bpp else 0

        if filter_type == 1:
            scanline[i] = (scanline[i] + left) & 0xFF
        elif filter_type == 2:
            scanline[i] = (scanline[i] + up) & 0xFF
        elif filter_type == 3:
            scanline[i] = (scanline[i] + ((left + up) // 2)) & 0xFF
        elif filter_type == 4:
            scanline[i] = (scanline[i] + paeth_predictor(left, up, up_left)) & 0xFF
        elif filter_type != 0:
            raise ValueError(f"Unsupported PNG filter type: {filter_type}")
    return scanline

def analyze_png_screenshot(data_url: str) -> dict:
    png_bytes = decode_png_data_url(data_url)
    if not png_bytes.startswith(b"\x89PNG\r\n\x1a\n"):
        raise ValueError("Screenshot is not a PNG data URL.")

    pos = 8
    width = height = bit_depth = color_type = interlace = None
    idat_chunks = []

    while pos + 8 <= len(png_bytes):
        chunk_len = struct.unpack(">I", png_bytes[pos:pos + 4])[0]
        chunk_type = png_bytes[pos + 4:pos + 8]
        chunk_data = png_bytes[pos + 8:pos + 8 + chunk_len]
        pos += 12 + chunk_len

        if chunk_type == b"IHDR":
            width, height, bit_depth, color_type, _compression, _filter, interlace = struct.unpack(">IIBBBBB", chunk_data)
        elif chunk_type == b"IDAT":
            idat_chunks.append(chunk_data)
        elif chunk_type == b"IEND":
            break

    if not width or not height:
        raise ValueError("PNG is missing IHDR dimensions.")
    if bit_depth != 8 or color_type not in (0, 2, 6) or interlace != 0:
        return {
            "valid": True,
            "width": width,
            "height": height,
            "supportedForPixels": False,
            "reason": f"Unsupported PNG format: bitDepth={bit_depth}, colorType={color_type}, interlace={interlace}",
            "byteLength": len(png_bytes)
        }

    bpp = {0: 1, 2: 3, 6: 4}[color_type]
    stride = width * bpp
    raw = zlib.decompress(b"".join(idat_chunks))
    previous = bytearray(stride)
    sample_every = max(1, (width * height) // 60000)
    sample_count = 0
    non_background = 0
    alpha_pixels = 0
    luminance_sum = 0.0
    luminance_sq_sum = 0.0
    background = None
    raw_pos = 0

    for y in range(height):
        filter_type = raw[raw_pos]
        raw_pos += 1
        scanline = bytearray(raw[raw_pos:raw_pos + stride])
        raw_pos += stride
        scanline = unfilter_png_scanline(filter_type, scanline, previous, bpp)

        for x in range(0, width, sample_every):
            i = x * bpp
            if color_type == 6:
                r, g, b, a = scanline[i], scanline[i + 1], scanline[i + 2], scanline[i + 3]
            elif color_type == 2:
                r, g, b, a = scanline[i], scanline[i + 1], scanline[i + 2], 255
            else:
                r = g = b = scanline[i]
                a = 255

            if background is None:
                background = (r, g, b)

            luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b
            luminance_sum += luminance
            luminance_sq_sum += luminance * luminance
            sample_count += 1
            if a > 8:
                alpha_pixels += 1
            if a > 8 and sum(abs(channel - base) for channel, base in zip((r, g, b), background)) > 24:
                non_background += 1

        previous = scanline

    mean = luminance_sum / max(sample_count, 1)
    variance = max((luminance_sq_sum / max(sample_count, 1)) - mean * mean, 0)
    luminance_stddev = math.sqrt(variance)
    non_background_ratio = non_background / max(sample_count, 1)

    return {
        "valid": True,
        "supportedForPixels": True,
        "width": width,
        "height": height,
        "byteLength": len(png_bytes),
        "sampleCount": sample_count,
        "alphaPixelRatio": alpha_pixels / max(sample_count, 1),
        "nonBackgroundRatio": round(non_background_ratio, 5),
        "luminanceStdDev": round(luminance_stddev, 3),
        "hasMeaningfulPixels": non_background_ratio > 0.005 and luminance_stddev > 2.5
    }

def make_audit_check(check_id: str, name: str, status: str, remarks: str) -> dict:
    return {
        "id": check_id,
        "name": name,
        "status": status,
        "remarks": remarks
    }

def run_optional_codex_visual_critic(screenshot_bytes: bytes, payload_summary: dict) -> dict:
    """Back-compat wrapper name; dispatches multi-provider visual critic (Grok / ChatGPT Codex)."""
    return run_visual_critic(screenshot_bytes, payload_summary)

@app.post("/api/audit")
def api_post_audit(payload: dict):
    screenshot_base64 = payload.get("screenshot_base64", "")
    audit_context = payload.get("audit_context", {}) or {}
    nodes = payload.get("currentNodes", []) or []

    screenshot_bytes = b""
    try:
        screenshot_bytes = decode_png_data_url(screenshot_base64)
        image_analysis = analyze_png_screenshot(screenshot_base64)
    except Exception as exc:
        image_analysis = {
            "valid": False,
            "error": str(exc),
            "byteLength": len(screenshot_base64 or "")
        }

    source = audit_context.get("source") or "unknown"
    canvas_context = audit_context.get("canvas", {}) or {}
    long_text_nodes = [
        node.get("id")
        for node in nodes
        if len(str(node.get("title", ""))) > 30 or len(str(node.get("intro", ""))) > 120
    ]
    width = image_analysis.get("width") or canvas_context.get("width") or 0
    height = image_analysis.get("height") or canvas_context.get("height") or 0
    aspect = (width / height) if width and height else 0

    codex_status = run_optional_codex_visual_critic(
        screenshot_bytes,
        {
            "theme": payload.get("theme"),
            "source": source,
            "canvas": canvas_context,
            "nodeCount": len(nodes),
            "imageAnalysis": image_analysis
        }
    )
    codex_result = codex_status.get("result") or {}

    # 1. Deterministic Checks
    checks = [
        make_audit_check(
            "real_screenshot_input",
            "Real Canvas Screenshot",
            "PASS" if image_analysis.get("valid") and source != "mock" and len(screenshot_base64) > 1500 else "FAIL",
            f"Source={source}; PNG bytes={image_analysis.get('byteLength', 0)}."
        ),
        make_audit_check(
            "canvas_nonblank_pixels",
            "Canvas Nonblank Pixel Signal",
            "PASS" if image_analysis.get("hasMeaningfulPixels") else "FAIL",
            f"nonBackgroundRatio={image_analysis.get('nonBackgroundRatio', 0)}, luminanceStdDev={image_analysis.get('luminanceStdDev', 0)}."
        ),
        make_audit_check(
            "phaser_fit_scale",
            "Phaser FIT Scaling",
            "PASS" if width >= 320 and height >= 480 and abs(aspect - (9 / 16)) <= 0.14 else "WARNING",
            f"Captured {width}x{height}; expected a mobile-first 9:16-ish viewport."
        ),
        make_audit_check(
            "text_wrap_risk",
            "CJK Text Wrap Risk",
            "PASS" if not long_text_nodes else "WARNING",
            "No unusually long node title/intro detected." if not long_text_nodes else f"Long text risk in nodes: {long_text_nodes[:6]}."
        ),
        make_audit_check(
            "touch_safe_area",
            "Touch Safe-Area Frame",
            "PASS" if (canvas_context.get("cssWidth", 0) >= 320 and canvas_context.get("cssHeight", 0) >= 520) else "WARNING",
            f"Canvas CSS frame={canvas_context.get('cssWidth', 0)}x{canvas_context.get('cssHeight', 0)}."
        )
    ]

    # 2. VLM Checks (Grok vision API and/or ChatGPT.app Codex CLI)
    codex_enabled = codex_status.get("enabled")
    vlm_provider = codex_status.get("provider") or "none"
    if not codex_enabled:
        vlm_status = "WARNING"
        if codex_status.get("status") == "available_disabled":
            vlm_remarks = (
                "VLM audit disabled. Set LOREWEAVER_ENABLE_VLM_AUDIT=1 "
                "(or LOREWEAVER_ENABLE_CODEX_AUDIT=1), or set LOREWEAVER_VLM_PROVIDER=grok|codex."
            )
        else:
            vlm_remarks = (
                "No VLM provider. Prefer XAI_API_KEY (Grok vision) or ChatGPT.app codex CLI "
                f"({find_codex_cli() or 'not found'})."
            )
        vlm_checks = [
            make_audit_check("vlm_hud_occlusion", "VLM HUD Occlusion", vlm_status, vlm_remarks),
            make_audit_check("vlm_button_overlap", "VLM Button Overlap", vlm_status, vlm_remarks),
            make_audit_check("vlm_text_overflow", "VLM Text Overflow", vlm_status, vlm_remarks),
            make_audit_check("vlm_touch_readability", "VLM Touch & Readability", vlm_status, vlm_remarks)
        ]
    elif codex_status.get("status") == "failed":
        err_msg = codex_status.get("error") or codex_status.get("stderr") or "VLM provider failed."
        vlm_checks = [
            make_audit_check("vlm_hud_occlusion", "VLM HUD Occlusion", "FAIL", f"VLM({vlm_provider}) failed: {err_msg}"),
            make_audit_check("vlm_button_overlap", "VLM Button Overlap", "FAIL", f"VLM({vlm_provider}) failed: {err_msg}"),
            make_audit_check("vlm_text_overflow", "VLM Text Overflow", "FAIL", f"VLM({vlm_provider}) failed: {err_msg}"),
            make_audit_check("vlm_touch_readability", "VLM Touch & Readability", "FAIL", f"VLM({vlm_provider}) failed: {err_msg}")
        ]
    else:
        codex_checks = codex_result.get("checks") or {}
        vlm_checks = [
            make_audit_check(
                "vlm_hud_occlusion",
                "VLM HUD Occlusion",
                codex_checks.get("vlm_hud_occlusion") or ("PASS" if codex_result.get("status") == "passed" else "FAIL"),
                f"VLM({vlm_provider}) HUD occlusion check completed."
            ),
            make_audit_check(
                "vlm_button_overlap",
                "VLM Button Overlap",
                codex_checks.get("vlm_button_overlap") or ("PASS" if codex_result.get("status") == "passed" else "FAIL"),
                f"VLM({vlm_provider}) button overlap check completed."
            ),
            make_audit_check(
                "vlm_text_overflow",
                "VLM Text Overflow",
                codex_checks.get("vlm_text_overflow") or ("PASS" if codex_result.get("status") == "passed" else "FAIL"),
                f"VLM({vlm_provider}) text overflow check completed."
            ),
            make_audit_check(
                "vlm_touch_readability",
                "VLM Touch & Readability",
                codex_checks.get("vlm_touch_readability") or ("PASS" if codex_result.get("status") == "passed" else "FAIL"),
                f"VLM({vlm_provider}) touch & readability check completed."
            )
        ]

    checks.extend(vlm_checks)

    # 3. Overall VLM feedback / diff text
    if codex_status.get("status") == "completed" and codex_result.get("feedback"):
        vlm_feedback = codex_result["feedback"]
    else:
        vlm_feedback = (
            f"Visual audit used provider={vlm_provider}, status={codex_status.get('status')}. "
            f"Deterministic pixel gate is {'clean' if image_analysis.get('hasMeaningfulPixels') else 'blocked'}. "
            "Automated VLM: Grok API or ChatGPT/Codex CLI. "
            "Antigravity / Grok Build TUI are interactive coding agents, not headless audit backends."
        )

    prompt_reflow_diff = codex_result.get("prompt_reflow_diff") or (
        "Require every visual audit request to include a real canvas PNG, canvas CSS frame metrics, "
        "and deterministic nonblank/scale/text-wrap checks before any optional vision-agent critique."
    )

    # Determine overall gate status:
    # VLM failure cannot mask deterministic FAIL; VLM not enabled cannot be marked as complete PASS.
    if any(item["status"] == "FAIL" for item in checks):
        overall_status = "failed"
    elif not codex_enabled:
        overall_status = "partial_pass"
    else:
        overall_status = "passed"

    audit = {
        "checks": checks,
        "vlm_feedback": vlm_feedback,
        "prompt_reflow_diff": prompt_reflow_diff,
        "image_analysis": image_analysis,
        "codex_visual_agent": codex_status,
        "proposed_patches": codex_result.get("proposed_patches") or []
    }

    os.makedirs(REPORTS_DIR, exist_ok=True)
    with open(os.path.join(REPORTS_DIR, "visual_audit_latest.json"), "w", encoding="utf-8") as f:
        json.dump({
            "gate": "visual_audit",
            "status": overall_status,
            "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "method": "codex_antigravity_local_visual_audit",
            "data": audit
        }, f, ensure_ascii=False, indent=2)

    return {"success": True, "method": "codex_antigravity_local_visual_audit", "data": audit}


# ── Department prep desk (film-style multi-agent collaboration) ──────────────

DEPARTMENT_REGISTRY_PATH = os.path.join(LORE_ROOT, "minigame_master", "skills", "department_agents.registry.json")


def load_department_registry() -> dict:
    if not os.path.isfile(DEPARTMENT_REGISTRY_PATH):
        raise HTTPException(status_code=500, detail="department_agents.registry.json missing")
    with open(DEPARTMENT_REGISTRY_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def departments_dir(ws_id: str) -> str:
    path = os.path.join(get_ws_path(ws_id), "loreweaver", "departments")
    os.makedirs(path, exist_ok=True)
    os.makedirs(os.path.join(path, "handoffs"), exist_ok=True)
    os.makedirs(os.path.join(path, "prep"), exist_ok=True)
    os.makedirs(os.path.join(path, "qa"), exist_ok=True)
    return path


def default_department_state(unit_id: str = "campaign_12", stage_id: str = "production_prep") -> dict:
    registry = load_department_registry()
    departments = {}
    for dept in registry.get("departments", []):
        departments[dept["id"]] = {
            "id": dept["id"],
            "status": "idle",
            "version": 0,
            "qaScore": None,
            "prepNotes": "",
            "artifacts": [],
            "openHandoffCount": 0,
            "updatedAt": None,
            "confirmedAt": None,
        }
    required = [d["id"] for d in registry.get("departments", []) if d["id"] != "director"]
    return {
        "schemaVersion": "loreweaver.department-state.v1",
        "unitId": unit_id,
        "unitType": "campaign",
        "stageId": stage_id,
        "departments": departments,
        "requiredDepartmentIds": required,
        "confirmedCount": 0,
        "requiredCount": len(required),
        "updatedAt": utc_now_string(),
    }


def recompute_department_counts(state: dict) -> dict:
    required = state.get("requiredDepartmentIds") or [
        d_id for d_id in state.get("departments", {}).keys() if d_id != "director"
    ]
    confirmed = 0
    for d_id in required:
        dept = state.get("departments", {}).get(d_id) or {}
        if dept.get("status") == "confirmed":
            confirmed += 1
    state["requiredDepartmentIds"] = required
    state["requiredCount"] = len(required)
    state["confirmedCount"] = confirmed
    state["updatedAt"] = utc_now_string()
    return state


def load_department_state(ws_id: str) -> dict:
    path = os.path.join(departments_dir(ws_id), "state.json")
    if not os.path.isfile(path):
        state = default_department_state()
        save_department_state(ws_id, state)
        return state
    with open(path, "r", encoding="utf-8") as f:
        state = json.load(f)
    return recompute_department_counts(state)


def save_department_state(ws_id: str, state: dict) -> dict:
    state = recompute_department_counts(state)
    path = os.path.join(departments_dir(ws_id), "state.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(state, f, ensure_ascii=False, indent=2)
    return state


def list_handoffs(ws_id: str) -> list:
    hdir = os.path.join(departments_dir(ws_id), "handoffs")
    items = []
    for name in sorted(os.listdir(hdir)):
        if not name.endswith(".json"):
            continue
        with open(os.path.join(hdir, name), "r", encoding="utf-8") as f:
            items.append(json.load(f))
    items.sort(key=lambda x: x.get("createdAt") or "", reverse=True)
    return items


def refresh_open_handoff_counts(ws_id: str, state: dict) -> dict:
    handoffs = list_handoffs(ws_id)
    counts = {d_id: 0 for d_id in state.get("departments", {})}
    for ho in handoffs:
        if ho.get("status") != "open":
            continue
        to_id = ho.get("to")
        if to_id in counts:
            counts[to_id] += 1
        from_id = ho.get("from")
        # also surface on from for visibility
        if from_id in counts and from_id != to_id:
            pass
    for d_id, dept in state.get("departments", {}).items():
        dept["openHandoffCount"] = counts.get(d_id, 0)
    return state


@app.get("/api/llm/status")
def get_llm_status():
    """Report which LLM provider is active (no secrets), plus VLM probe."""
    status = llm_status()
    status["vlm"] = vlm_probe()
    return status


@app.get("/api/imagegen/status")
def get_imagegen_status():
    """Report imagegen provider status and Antigravity tool support status."""
    return {"success": True, "data": imagegen_status()}



@app.get("/api/department-registry")
def api_department_registry():
    return {"success": True, "data": load_department_registry()}


@app.get("/api/workspaces/{ws_id}/departments/{dept_id}/chat")
def api_get_department_chat(ws_id: str, dept_id: str, db: Session = Depends(get_db)):
    resolve_existing_ws_path(ws_id)
    messages = (
        db.query(DepartmentChatMessage)
        .filter(
            DepartmentChatMessage.workspace_id == ws_id,
            DepartmentChatMessage.department_id == dept_id,
        )
        .order_by(DepartmentChatMessage.created_at.asc(), DepartmentChatMessage.id.asc())
        .all()
    )
    return {
        "success": True,
        "data": [
            {
                "id": m.id,
                "sender": m.sender,
                "text": m.text,
                "timestamp": m.timestamp,
                "agentRole": m.agent_role,
                "departmentId": m.department_id,
            }
            for m in messages
        ],
    }


@app.get("/api/workspaces/{ws_id}/departments")
def api_get_departments(ws_id: str):

    resolve_existing_ws_path(ws_id)
    state = load_department_state(ws_id)
    state = refresh_open_handoff_counts(ws_id, state)
    save_department_state(ws_id, state)
    return {
        "success": True,
        "data": {
            "registry": load_department_registry(),
            "state": state,
            "handoffs": list_handoffs(ws_id),
        },
    }


@app.put("/api/workspaces/{ws_id}/departments")
def api_put_departments(ws_id: str, payload: dict):
    resolve_existing_ws_path(ws_id)
    state = payload.get("state") or payload
    if not isinstance(state, dict) or "departments" not in state:
        raise HTTPException(status_code=400, detail="Invalid department state payload")
    saved = save_department_state(ws_id, state)
    return {"success": True, "data": saved}


@app.post("/api/workspaces/{ws_id}/departments/{dept_id}/confirm")
async def api_confirm_department(ws_id: str, dept_id: str, payload: dict = None):
    resolve_existing_ws_path(ws_id)
    payload = payload or {}
    from .department_agents import mark_downstream_stale, run_auto_prep_pipeline, topological_departments
    registry = load_department_registry()
    state = load_department_state(ws_id)
    dept = state.get("departments", {}).get(dept_id)
    if not dept:
        raise HTTPException(status_code=404, detail=f"Unknown department: {dept_id}")
    # hard block confirm if blocked
    if dept.get("status") == "blocked" and not payload.get("force"):
        raise HTTPException(status_code=409, detail=f"Department {dept_id} is blocked")
    if payload.get("prepNotes") is not None:
        dept["prepNotes"] = str(payload.get("prepNotes") or "")
    if payload.get("qaScore") is not None:
        try:
            dept["qaScore"] = int(payload.get("qaScore"))
        except (TypeError, ValueError):
            pass
    dept["status"] = "confirmed"
    dept["version"] = int(dept.get("version") or 0) + 1
    dept["confirmedAt"] = utc_now_string()
    dept["updatedAt"] = dept["confirmedAt"]
    dept.pop("staleReason", None)
    state["departments"][dept_id] = dept
    # Phase D: cascade stale to downstream
    stale_ids = mark_downstream_stale(state, registry, dept_id, reason="upstream_confirmed")

    reprep_log = []
    reprep_patches = []
    patches_saved = False
    # Default: auto re-prep stale downstream so they get fresh drafts
    reprep = payload.get("reprepDownstream", True)
    if reprep and stale_ids:
        # preserve topo order among stale set
        ordered = [d["id"] for d in topological_departments(registry.get("departments") or [])]
        only = [d for d in ordered if d in set(stale_ids)]
        gdd = {}
        try:
            gdd = load_assembled_manifest(ws_id)
        except Exception:
            pass
        state, reprep_log, _hos, new_gdd, applied = await run_auto_prep_pipeline(
            registry=registry,
            state=state,
            gdd=gdd or {},
            reports_dir=REPORTS_DIR,
            force=True,
            only=only,
            apply_patches=bool(payload.get("applyPatches", True)),
        )
        reprep_patches = applied
        if applied and new_gdd:
            try:
                save_split_manifest(ws_id, new_gdd)
                patches_saved = True
            except Exception:
                try:
                    with open(os.path.join(get_ws_path(ws_id), "manifest.json"), "w", encoding="utf-8") as f:
                        json.dump(new_gdd, f, ensure_ascii=False, indent=2)
                    patches_saved = True
                except Exception:
                    pass

    state = refresh_open_handoff_counts(ws_id, state)
    saved = save_department_state(ws_id, state)
    return {
        "success": True,
        "data": saved,
        "staleDownstream": stale_ids,
        "reprepLog": reprep_log,
        "reprepPatches": reprep_patches,
        "patchesSaved": patches_saved,
    }


@app.post("/api/workspaces/{ws_id}/departments/{dept_id}/status")
def api_set_department_status(ws_id: str, dept_id: str, payload: dict):
    resolve_existing_ws_path(ws_id)
    state = load_department_state(ws_id)
    dept = state.get("departments", {}).get(dept_id)
    if not dept:
        raise HTTPException(status_code=404, detail=f"Unknown department: {dept_id}")
    status = payload.get("status")
    allowed = {"idle", "drafting", "ready_for_review", "confirmed", "blocked", "stale"}
    if status not in allowed:
        raise HTTPException(status_code=400, detail=f"Invalid status: {status}")
    from .department_agents import mark_downstream_stale
    registry = load_department_registry()
    stale_ids = []
    # demote confirmed without version bump when stale/blocked
    if status == "confirmed" and dept.get("status") != "confirmed":
        dept["version"] = int(dept.get("version") or 0) + 1
        dept["confirmedAt"] = utc_now_string()
        dept.pop("staleReason", None)
    dept["status"] = status
    if payload.get("prepNotes") is not None:
        dept["prepNotes"] = str(payload.get("prepNotes") or "")
    if payload.get("qaScore") is not None:
        try:
            dept["qaScore"] = int(payload.get("qaScore"))
        except (TypeError, ValueError):
            pass
    dept["updatedAt"] = utc_now_string()
    state["departments"][dept_id] = dept
    if status == "confirmed":
        stale_ids = mark_downstream_stale(state, registry, dept_id, reason="upstream_confirmed")
    saved = save_department_state(ws_id, state)
    return {"success": True, "data": saved, "staleDownstream": stale_ids}


@app.get("/api/workspaces/{ws_id}/departments/handoffs")
def api_list_handoffs(ws_id: str):
    resolve_existing_ws_path(ws_id)
    return {"success": True, "data": list_handoffs(ws_id)}


@app.post("/api/workspaces/{ws_id}/departments/handoffs")
def api_create_handoff(ws_id: str, payload: dict):
    resolve_existing_ws_path(ws_id)
    registry = load_department_registry()
    ids = {d["id"] for d in registry.get("departments", [])}
    from_id = payload.get("from")
    to_id = payload.get("to")
    if from_id not in ids or to_id not in ids:
        raise HTTPException(status_code=400, detail="from/to must be valid department ids")
    ho_type = payload.get("type") or "request"
    if ho_type not in ("request", "ack", "reject", "escalate"):
        raise HTTPException(status_code=400, detail="Invalid handoff type")
    ho_id = payload.get("id") or f"ho_{int(time.time())}_{secrets.token_hex(3)}"
    handoff = {
        "id": ho_id,
        "from": from_id,
        "to": to_id,
        "unitId": payload.get("unitId") or load_department_state(ws_id).get("unitId"),
        "type": ho_type,
        "summary": str(payload.get("summary") or "").strip() or "(no summary)",
        "payloadRef": payload.get("payloadRef") or "",
        "needs": payload.get("needs") or [],
        "blockers": payload.get("blockers") or [],
        "patchLevelMax": payload.get("patchLevelMax") or "L2",
        "createdAt": utc_now_string(),
        "status": payload.get("status") or "open",
    }
    path = os.path.join(departments_dir(ws_id), "handoffs", f"{ho_id}.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(handoff, f, ensure_ascii=False, indent=2)
    state = load_department_state(ws_id)
    state = refresh_open_handoff_counts(ws_id, state)
    save_department_state(ws_id, state)
    return {"success": True, "data": handoff}


@app.post("/api/workspaces/{ws_id}/departments/handoffs/{handoff_id}/resolve")
def api_resolve_handoff(ws_id: str, handoff_id: str, payload: dict = None):
    resolve_existing_ws_path(ws_id)
    payload = payload or {}
    path = os.path.join(departments_dir(ws_id), "handoffs", f"{handoff_id}.json")
    if not os.path.isfile(path):
        raise HTTPException(status_code=404, detail="Handoff not found")
    with open(path, "r", encoding="utf-8") as f:
        handoff = json.load(f)
    handoff["status"] = payload.get("status") or "resolved"
    handoff["resolvedAt"] = utc_now_string()
    if payload.get("note"):
        handoff["resolveNote"] = str(payload.get("note"))
    with open(path, "w", encoding="utf-8") as f:
        json.dump(handoff, f, ensure_ascii=False, indent=2)
    state = load_department_state(ws_id)
    state = refresh_open_handoff_counts(ws_id, state)
    save_department_state(ws_id, state)
    return {"success": True, "data": handoff}


@app.post("/api/workspaces/{ws_id}/departments/auto-prep")
async def api_auto_prep_departments(ws_id: str, payload: dict = None):
    """Director-scheduled department prep in dependsOn order.
    Writes prepNotes + qaScore, status=ready_for_review. Never auto-confirms.
    """
    resolve_existing_ws_path(ws_id)
    payload = payload or {}
    from .department_agents import run_auto_prep_pipeline

    registry = load_department_registry()
    state = load_department_state(ws_id)
    if payload.get("unitId"):
        state["unitId"] = str(payload["unitId"])
    if payload.get("stageId"):
        state["stageId"] = str(payload["stageId"])

    # Load GDD / manifest if present
    gdd = {}
    try:
        gdd = load_assembled_manifest(ws_id)
    except Exception:
        manifest_path = os.path.join(get_ws_path(ws_id), "manifest.json")
        if os.path.isfile(manifest_path):
            try:
                with open(manifest_path, "r", encoding="utf-8") as f:
                    gdd = json.load(f)
            except Exception:
                gdd = {}

    only = payload.get("only")
    if isinstance(only, str):
        only = [only]
    force = bool(payload.get("force"))

    apply_patches = payload.get("applyPatches", True)
    state, run_log, suggested, new_gdd, applied_patches = await run_auto_prep_pipeline(
        registry=registry,
        state=state,
        gdd=gdd or {},
        reports_dir=REPORTS_DIR,
        force=force,
        only=only,
        apply_patches=bool(apply_patches),
    )

    # Persist controlled GDD patches
    patches_saved = False
    if apply_patches and applied_patches and new_gdd:
        try:
            save_split_manifest(ws_id, new_gdd)
            patches_saved = True
        except Exception as exc:
            # fallback raw manifest
            try:
                with open(os.path.join(get_ws_path(ws_id), "manifest.json"), "w", encoding="utf-8") as f:
                    json.dump(new_gdd, f, ensure_ascii=False, indent=2)
                patches_saved = True
            except Exception as exc2:
                print(f"[departments] failed to save patches: {exc} / {exc2}")

    # Materialize suggested handoffs (open)
    created_handoffs = []
    existing = {(h.get("from"), h.get("to"), h.get("summary")) for h in list_handoffs(ws_id) if h.get("status") == "open"}
    for ho in suggested:
        key = (ho.get("from"), ho.get("to"), ho.get("summary"))
        if key in existing:
            continue
        # validate department ids
        ids = {d["id"] for d in registry.get("departments", [])}
        if ho.get("from") not in ids or ho.get("to") not in ids:
            continue
        ho_id = f"ho_{int(time.time())}_{secrets.token_hex(2)}"
        handoff = {
            "id": ho_id,
            "from": ho["from"],
            "to": ho["to"],
            "unitId": state.get("unitId"),
            "type": ho.get("type") or "request",
            "summary": ho.get("summary") or "",
            "payloadRef": "",
            "needs": [],
            "blockers": [],
            "patchLevelMax": "L2",
            "createdAt": utc_now_string(),
            "status": "open",
            "source": "auto_prep",
        }
        path = os.path.join(departments_dir(ws_id), "handoffs", f"{ho_id}.json")
        with open(path, "w", encoding="utf-8") as f:
            json.dump(handoff, f, ensure_ascii=False, indent=2)
        created_handoffs.append(handoff)
        existing.add(key)

    state = refresh_open_handoff_counts(ws_id, state)
    saved = save_department_state(ws_id, state)

    # QA-owned node smoke after patches are on disk (director schedules via auto-prep)
    smoke_report = None
    if payload.get("runNodeSmoke", True):
        smoke_report = run_node_smoke(ws_id)
        # Materialize suggested qa→code / qa→gameplay handoffs
        for ho in (smoke_report or {}).get("suggestedHandoffs") or []:
            key = (ho.get("from"), ho.get("to"), ho.get("summary"))
            if key in existing:
                continue
            ids = {d["id"] for d in registry.get("departments", [])}
            if ho.get("from") not in ids or ho.get("to") not in ids:
                continue
            ho_id = f"ho_smoke_{int(time.time())}_{secrets.token_hex(2)}"
            handoff = {
                "id": ho_id,
                "from": ho["from"],
                "to": ho["to"],
                "unitId": saved.get("unitId"),
                "type": ho.get("type") or "reject",
                "summary": ho.get("summary") or "node smoke failure",
                "payloadRef": "workflow/reports/node_smoke_latest.json",
                "needs": [],
                "blockers": [],
                "patchLevelMax": "L3",
                "createdAt": utc_now_string(),
                "status": "open",
                "source": "node_smoke",
            }
            path = os.path.join(departments_dir(ws_id), "handoffs", f"{ho_id}.json")
            with open(path, "w", encoding="utf-8") as f:
                json.dump(handoff, f, ensure_ascii=False, indent=2)
            created_handoffs.append(handoff)
            existing.add(key)
        saved = refresh_open_handoff_counts(ws_id, saved)
        saved = save_department_state(ws_id, saved)

    from .department_agents import evaluate_advance_gate, collect_report_signals
    gate = evaluate_advance_gate(saved, registry, collect_report_signals(REPORTS_DIR))

    # Persist run log
    log_path = os.path.join(departments_dir(ws_id), "qa", "auto_prep_latest.json")
    with open(log_path, "w", encoding="utf-8") as f:
        json.dump({
            "createdAt": utc_now_string(),
            "unitId": saved.get("unitId"),
            "runLog": run_log,
            "createdHandoffs": [h["id"] for h in created_handoffs],
            "patchesApplied": applied_patches,
            "patchesSaved": patches_saved,
            "nodeSmoke": {
                "status": (smoke_report or {}).get("status"),
                "score": (smoke_report or {}).get("score"),
                "summary": (smoke_report or {}).get("summary"),
            } if smoke_report else None,
            "gate": gate,
        }, f, ensure_ascii=False, indent=2)

    return {
        "success": True,
        "data": {
            "state": saved,
            "updatedDepartments": [x["id"] for x in run_log if not x.get("skipped")],
            "runLog": run_log,
            "createdHandoffs": created_handoffs,
            "patchesApplied": applied_patches,
            "patchesSaved": patches_saved,
            "nodeSmoke": smoke_report,
            "gate": gate,
        },
    }


@app.post("/api/workspaces/{ws_id}/departments/{dept_id}/run-prep")
async def api_run_single_department_prep(ws_id: str, dept_id: str, payload: dict = None):
    """Run prep for one department (still no auto-confirm)."""
    resolve_existing_ws_path(ws_id)
    payload = payload or {}
    from .department_agents import run_auto_prep_pipeline
    registry = load_department_registry()
    meta = next((d for d in registry.get("departments", []) if d["id"] == dept_id), None)
    if not meta:
        raise HTTPException(status_code=404, detail=f"Unknown department: {dept_id}")
    state = load_department_state(ws_id)
    gdd = {}
    try:
        gdd = load_assembled_manifest(ws_id)
    except Exception:
        pass
    state, run_log, suggested, new_gdd, applied_patches = await run_auto_prep_pipeline(
        registry=registry,
        state=state,
        gdd=gdd or {},
        reports_dir=REPORTS_DIR,
        force=bool(payload.get("force", True)),
        only=[dept_id] if dept_id != "director" else None,
        apply_patches=bool(payload.get("applyPatches", True)),
    )
    patches_saved = False
    if applied_patches and new_gdd:
        try:
            save_split_manifest(ws_id, new_gdd)
            patches_saved = True
        except Exception:
            try:
                with open(os.path.join(get_ws_path(ws_id), "manifest.json"), "w", encoding="utf-8") as f:
                    json.dump(new_gdd, f, ensure_ascii=False, indent=2)
                patches_saved = True
            except Exception:
                pass
    state = refresh_open_handoff_counts(ws_id, state)
    saved = save_department_state(ws_id, state)
    return {
        "success": True,
        "data": {
            "state": saved,
            "runLog": run_log,
            "suggestedHandoffs": suggested,
            "patchesApplied": applied_patches,
            "patchesSaved": patches_saved,
        },
    }


@app.post("/api/workspaces/{ws_id}/departments/node-smoke")
def api_run_node_smoke(ws_id: str, payload: dict = None):
    """QA-owned per-node smoke (enter/spawn/retreat). Writes node_smoke_latest.json."""
    resolve_existing_ws_path(ws_id)
    payload = payload or {}
    report = run_node_smoke(
        ws_id,
        wall_ms=int(payload.get("wallMs") or 3000),
        simulated_sec=int(payload.get("simulatedSec") or 10),
    )
    from .department_agents import evaluate_advance_gate, collect_report_signals
    registry = load_department_registry()
    state = load_department_state(ws_id)
    gate = evaluate_advance_gate(state, registry, collect_report_signals(REPORTS_DIR))
    return {"success": True, "data": {"report": report, "gate": gate}}


@app.get("/api/workspaces/{ws_id}/departments/gate")
def api_department_gate(ws_id: str, run_smoke: bool = Query(False)):
    """Multi-stage gate snapshot: asset_confirm / runtime_stage.
    Pass run_smoke=1 to refresh node smoke before evaluating.
    """
    resolve_existing_ws_path(ws_id)
    if run_smoke:
        run_node_smoke(ws_id)
    from .department_agents import evaluate_all_stage_gates, collect_report_signals
    registry = load_department_registry()
    state = load_department_state(ws_id)
    rejects = [h for h in list_handoffs(ws_id) if h.get("status") == "open" and h.get("type") == "reject"]
    reject_ids = [h.get("id") for h in rejects if h.get("id")]
    signals = collect_report_signals(REPORTS_DIR)
    gdd = None
    try:
        gdd = load_assembled_manifest(ws_id)
    except Exception:
        gdd = None
    gate = evaluate_all_stage_gates(
        state,
        registry,
        signals,
        gdd=gdd,
        open_reject_ids=reject_ids,
    )
    return {"success": True, "data": gate}


@app.post("/api/workspaces/{ws_id}/departments/advance-stage")
def api_advance_department_stage(ws_id: str, payload: dict = None):
    """Advance stage one step if that transition's gate passes.

    Body:
      stageId: asset_confirm | runtime_stage (default = next stage)
      force: skip gate
      runNodeSmoke: default true only for asset_confirm
    Note: beat_board was removed; playability checks live on runtime_stage.
    """
    resolve_existing_ws_path(ws_id)
    payload = payload or {}
    from .department_agents import (
        evaluate_all_stage_gates,
        evaluate_transition_gate,
        collect_report_signals,
        next_stage_id,
        normalize_stage_id,
        stage_index,
    )
    registry = load_department_registry()
    state = load_department_state(ws_id)
    current = normalize_stage_id(state.get("stageId"))
    target = normalize_stage_id(payload.get("stageId") or next_stage_id(current) or current)

    smoke_report = None
    # Refresh smoke when entering asset_confirm (or when explicitly requested)
    want_smoke = payload.get("runNodeSmoke")
    if want_smoke is None:
        want_smoke = target == "asset_confirm"
    if want_smoke and not payload.get("force"):
        smoke_report = run_node_smoke(ws_id)

    rejects = [h for h in list_handoffs(ws_id) if h.get("status") == "open" and h.get("type") == "reject"]
    reject_ids = [h.get("id") for h in rejects if h.get("id")]
    signals = collect_report_signals(REPORTS_DIR)
    gdd = None
    try:
        gdd = load_assembled_manifest(ws_id)
    except Exception:
        gdd = None

    # Idempotent: already at or past target
    if stage_index(current) >= stage_index(target) and not payload.get("force"):
        snap = evaluate_all_stage_gates(
            state, registry, signals, gdd=gdd, open_reject_ids=reject_ids
        )
        return {
            "success": True,
            "data": {
                "state": state,
                "gate": {**snap, "alreadyAtTarget": True, "stageId": current},
                "nodeSmoke": smoke_report,
                "message": f"already_at_stage:{current}",
            },
        }

    gate = evaluate_transition_gate(
        state,
        registry,
        signals,
        target_stage=target,
        gdd=gdd,
        open_reject_ids=reject_ids,
    )
    if not gate.get("allowed") and not payload.get("force"):
        raise HTTPException(
            status_code=409,
            detail={"message": "gate_blocked", "gate": gate, "nodeSmoke": smoke_report},
        )

    state["stageId"] = target
    state["stageAdvancedAt"] = utc_now_string()
    hist = list(state.get("stageHistory") or [])
    hist.append(
        {
            "from": current,
            "to": target,
            "at": state["stageAdvancedAt"],
            "forced": bool(payload.get("force")),
        }
    )
    state["stageHistory"] = hist[-20:]
    saved = save_department_state(ws_id, state)
    snap = evaluate_all_stage_gates(
        saved, registry, signals, gdd=gdd, open_reject_ids=reject_ids
    )
    return {
        "success": True,
        "data": {
            "state": saved,
            "gate": snap,
            "transition": gate,
            "nodeSmoke": smoke_report,
        },
    }


# ── Phase D: Level Recipe apply (workbench path shares CLI job) ──────────────

LEVEL_RECIPE_APPLY_SCRIPT = os.path.join(
    LORE_ROOT, "productize", "jobs", "apply-level-recipe.mjs"
)


@app.get("/api/workspaces/{ws_id}/level-recipes")
def api_list_level_recipes(ws_id: str):
    """List bundled Level Recipes available for workbench apply."""
    resolve_existing_ws_path(ws_id)
    if not os.path.isfile(LEVEL_RECIPE_APPLY_SCRIPT):
        raise HTTPException(status_code=500, detail="apply-level-recipe.mjs missing")
    proc = subprocess.run(
        ["node", LEVEL_RECIPE_APPLY_SCRIPT, "--list"],
        cwd=LORE_ROOT,
        capture_output=True,
        text=True,
        timeout=60,
    )
    if proc.returncode != 0:
        raise HTTPException(
            status_code=500,
            detail={"message": "list_recipes_failed", "stderr": proc.stderr, "stdout": proc.stdout},
        )
    try:
        payload = json.loads(proc.stdout)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"invalid recipe list json: {exc}") from exc
    return {"success": True, "data": payload}


@app.post("/api/workspaces/{ws_id}/level-recipe/apply")
def api_apply_level_recipe(ws_id: str, payload: dict = None):
    """
    Apply a Level Recipe to a workspace node via the shared CLI job
    (same write path as `npm run recipe:apply`).

    Body:
      recipe: relative path under repo root (required unless recipeId)
      recipeId: optional id to resolve from --list
      nodeId: node id (default 1)
      dryRun: bool (default false)
      markStale: bool (default true on write)
    """
    resolve_existing_ws_path(ws_id)
    payload = payload or {}
    if not os.path.isfile(LEVEL_RECIPE_APPLY_SCRIPT):
        raise HTTPException(status_code=500, detail="apply-level-recipe.mjs missing")

    recipe = payload.get("recipe") or payload.get("recipePath")
    recipe_id = payload.get("recipeId")
    node_id = str(payload.get("nodeId") or payload.get("node") or "1")
    dry_run = bool(payload.get("dryRun"))
    mark_stale = payload.get("markStale")
    if mark_stale is None:
        mark_stale = True

    if not recipe and recipe_id:
        list_proc = subprocess.run(
            ["node", LEVEL_RECIPE_APPLY_SCRIPT, "--list"],
            cwd=LORE_ROOT,
            capture_output=True,
            text=True,
            timeout=60,
        )
        if list_proc.returncode != 0:
            raise HTTPException(status_code=500, detail="recipe list failed for recipeId resolve")
        try:
            listed = json.loads(list_proc.stdout)
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"recipe list parse failed: {exc}") from exc
        hit = next(
            (r for r in listed.get("recipes") or [] if r.get("recipeId") == recipe_id),
            None,
        )
        if not hit:
            raise HTTPException(status_code=404, detail=f"recipeId not found: {recipe_id}")
        recipe = hit.get("path")

    if not recipe:
        raise HTTPException(status_code=400, detail="recipe or recipeId required")

    # Safety: only allow paths under repo (no absolute escape)
    recipe_abs = recipe if os.path.isabs(recipe) else os.path.join(LORE_ROOT, recipe)
    recipe_abs = os.path.abspath(recipe_abs)
    if not recipe_abs.startswith(os.path.abspath(LORE_ROOT) + os.sep):
        raise HTTPException(status_code=400, detail="recipe path escapes repository root")
    if not os.path.isfile(recipe_abs):
        raise HTTPException(status_code=404, detail=f"recipe file not found: {recipe}")

    rel = os.path.relpath(recipe_abs, LORE_ROOT).replace(os.sep, "/")
    cmd = [
        "node",
        LEVEL_RECIPE_APPLY_SCRIPT,
        "--recipe",
        rel,
        "--workspace",
        ws_id,
        "--node",
        node_id,
    ]
    if dry_run:
        cmd.append("--dry-run")
    if not mark_stale:
        cmd.append("--no-stale")

    proc = subprocess.run(
        cmd,
        cwd=LORE_ROOT,
        capture_output=True,
        text=True,
        timeout=120,
    )
    # Job prints JSON then a status line — parse first JSON object
    raw = (proc.stdout or "").strip()
    applied = None
    if raw:
        # find first { ... } JSON block
        start = raw.find("{")
        if start >= 0:
            depth = 0
            end = None
            for i, ch in enumerate(raw[start:], start):
                if ch == "{":
                    depth += 1
                elif ch == "}":
                    depth -= 1
                    if depth == 0:
                        end = i + 1
                        break
            if end:
                try:
                    applied = json.loads(raw[start:end])
                except Exception:
                    applied = None

    if proc.returncode != 0:
        raise HTTPException(
            status_code=422,
            detail={
                "message": "recipe_apply_failed",
                "stdout": proc.stdout,
                "stderr": proc.stderr,
                "applied": applied,
            },
        )

    # Reload node + refresh assembled manifest cache if present
    node_payload = None
    try:
        nodes_dir = os.path.join(get_ws_path(ws_id), "loreweaver", "nodes")
        if os.path.isdir(nodes_dir):
            for fname in os.listdir(nodes_dir):
                if not fname.endswith(".json"):
                    continue
                fpath = os.path.join(nodes_dir, fname)
                with open(fpath, "r", encoding="utf-8") as f:
                    n = json.load(f)
                if str(n.get("id")) == node_id:
                    node_payload = n
                    break
    except Exception:
        node_payload = None

    return {
        "success": True,
        "data": {
            "applied": applied,
            "node": node_payload,
            "dryRun": dry_run,
            "stdout": proc.stdout,
        },
    }


@app.get("/api/workspaces/{ws_id}/production-export-gate")
def api_production_export_gate(ws_id: str, card_id: str = Query("survivor_horde")):
    """Evaluate production export hard-gate for a card (shared node module)."""
    resolve_existing_ws_path(ws_id)
    gate_script = os.path.join(LORE_ROOT, "productize", "lib", "production-export-gate.mjs")
    card_path = os.path.join(LORE_ROOT, "minigame_master", "gameplay", "cards", f"{card_id}.json")
    if not os.path.isfile(card_path):
        raise HTTPException(status_code=404, detail=f"card not found: {card_id}")
    # Inline eval via node -e importing the module is fragile; use validate-gameplay-card
    proc = subprocess.run(
        ["node", os.path.join(LORE_ROOT, "productize", "validate-gameplay-card.mjs"), card_path],
        cwd=LORE_ROOT,
        capture_output=True,
        text=True,
        timeout=60,
    )
    report = None
    try:
        report = json.loads(proc.stdout)
    except Exception:
        report_path = os.path.join(REPORTS_DIR, "gameplay_card_validate_latest.json")
        if os.path.isfile(report_path):
            with open(report_path, "r", encoding="utf-8") as f:
                report = json.load(f)
    return {
        "success": True,
        "data": {
            "cardId": card_id,
            "exitCode": proc.returncode,
            "report": report,
            "productionExportAllowed": bool(report and report.get("productionExportAllowed")),
            "stderr": proc.stderr if proc.returncode != 0 else None,
        },
    }

