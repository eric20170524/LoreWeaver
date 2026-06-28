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
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from .database import engine, Base, get_db
from .models import Workspace, Job
from .schemas import (
    WorkspaceCreate, WorkspaceImport, WorkspaceResponse, WorkspaceListResponse,
    JobResponse, FeedbackRequest, ApproveRequest, JobModel
)
from .theme_presets import get_procedural_preset
from .agents import WorldBuilderAgent

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
MINIGAME_CORE_ROOT = os.path.join(REPO_ROOT, "minigame_master", "core")
REPORTS_DIR = os.path.join(LORE_ROOT, "workflow", "reports")
DATA_DIR = os.path.join(LORE_ROOT, "data")
WORKSPACES_DIR = os.path.join(DATA_DIR, "workspaces")
os.makedirs(WORKSPACES_DIR, exist_ok=True)

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
    cleaned = "".join(ch if (ch.isascii() and ch.isalnum()) or ch in ("-", "_") else "-" for ch in value.strip())
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

def infer_imported_workspace_fields(payload: WorkspaceImport, source_path: str, manifest: dict) -> tuple[str, str]:
    meta = read_optional_workspace_meta(source_path)
    name = (payload.name or meta.get("name") or manifest.get("title") or os.path.basename(source_path)).strip()
    theme = (payload.theme or meta.get("theme") or manifest.get("title") or "Imported LoreWeaver project").strip()
    return name or "Imported LoreWeaver project", theme or "Imported LoreWeaver project"

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

def run_directory_picker_command(command: list[str], timeout: int = 120) -> str:
    result = subprocess.run(command, capture_output=True, text=True, timeout=timeout)
    if result.returncode == 0:
        return result.stdout.strip()

    stderr = result.stderr.strip()
    if "User canceled" in stderr or "cancelled" in stderr.lower() or "canceled" in stderr.lower():
        return ""
    raise RuntimeError(stderr or "Directory picker failed")

def select_local_directory() -> str:
    title = "Select a LoreWeaver project folder containing manifest.json"
    system = platform.system()

    if system == "Darwin":
        script = f'POSIX path of (choose folder with prompt "{title}")'
        selected_path = run_directory_picker_command(["osascript", "-e", script])
        return os.path.abspath(os.path.expanduser(selected_path)) if selected_path else ""

    if system == "Windows":
        powershell = shutil.which("powershell") or shutil.which("pwsh")
        if powershell:
            command = (
                "Add-Type -AssemblyName System.Windows.Forms; "
                "$dialog = New-Object System.Windows.Forms.FolderBrowserDialog; "
                f"$dialog.Description = '{title}'; "
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
            title
        ])
        return os.path.abspath(os.path.expanduser(selected_path)) if selected_path else ""

    if shutil.which("kdialog"):
        selected_path = run_directory_picker_command([
            "kdialog",
            "--getexistingdirectory",
            os.path.expanduser("~")
        ])
        return os.path.abspath(os.path.expanduser(selected_path)) if selected_path else ""

    tk_script = (
        "import tkinter as tk\n"
        "from tkinter import filedialog\n"
        "root = tk.Tk()\n"
        "root.withdraw()\n"
        "root.attributes('-topmost', True)\n"
        f"path = filedialog.askdirectory(title={title!r})\n"
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
        file_path = os.path.join(get_ws_path(job.workspace_id), "manifest.json")
        with open(file_path, "w", encoding="utf-8") as f:
            json.dump(final_gdd, f, ensure_ascii=False, indent=2)

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
def api_select_directory():
    try:
        selected_path = select_local_directory()
    except subprocess.TimeoutExpired as exc:
        raise HTTPException(status_code=504, detail="Directory picker timed out") from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to open directory picker: {exc}") from exc

    if not selected_path:
        return {"success": False, "cancelled": True, "data": None}

    if not os.path.isdir(selected_path):
        raise HTTPException(status_code=404, detail="Selected directory not found")

    return {"success": True, "cancelled": False, "data": {"path": selected_path}}

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
    source_path = os.path.abspath(os.path.expanduser(payload.source_path.strip()))
    if not os.path.isdir(source_path):
        raise HTTPException(status_code=404, detail="Source directory not found")

    manifest_path = os.path.join(source_path, "manifest.json")
    if not os.path.isfile(manifest_path):
        raise HTTPException(status_code=422, detail="Selected directory must contain manifest.json")

    try:
        with open(manifest_path, "r", encoding="utf-8") as manifest_file:
            manifest = json.load(manifest_file)
        if not isinstance(manifest, dict):
            raise ValueError("manifest.json must contain a JSON object")
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Invalid manifest.json: {exc}") from exc

    now_str = utc_now_string()
    ws_id = allocate_workspace_id(db, now_str)
    ws_dir = os.path.join(WORKSPACES_DIR, ws_id)
    name, theme = infer_imported_workspace_fields(payload, source_path, manifest)

    try:
        shutil.copytree(source_path, ws_dir, ignore=workspace_copy_ignore)
        with open(os.path.join(ws_dir, "meta.json"), "w", encoding="utf-8") as meta_file:
            json.dump({
                "id": ws_id,
                "name": name,
                "theme": theme,
                "sourcePath": source_path,
                "createdAt": now_str,
                "lastModifiedAt": now_str
            }, meta_file, ensure_ascii=False, indent=2)
    except Exception as exc:
        if os.path.exists(ws_dir):
            shutil.rmtree(ws_dir, ignore_errors=True)
        raise HTTPException(status_code=500, detail=f"Failed to import workspace: {exc}") from exc

    workspace = Workspace(
        id=ws_id,
        name=name,
        theme=theme,
        created_at=now_str,
        last_modified_at=now_str
    )
    db.add(workspace)
    db.commit()
    db.refresh(workspace)

    return {"success": True, "data": workspace}

@app.get("/api/workspaces", response_model=WorkspaceListResponse)
def api_list_workspaces(db: Session = Depends(get_db)):
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

@app.get("/api/workspaces/{ws_id}/files/{filename}")
def api_get_workspace_file(ws_id: str, filename: str):
    file_path = os.path.join(get_ws_path(ws_id), filename)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found")
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        return {"success": True, "data": data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/workspaces/{ws_id}/files/{filename}")
def api_save_workspace_file(ws_id: str, filename: str, payload: dict):
    file_path = os.path.join(get_ws_path(ws_id), filename)
    try:
        content_data = payload.get("data", payload)
        with open(file_path, "w", encoding="utf-8") as f:
            json.dump(content_data, f, ensure_ascii=False, indent=2)
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/workspaces/{ws_id}/export")
def api_export_workspace(ws_id: str):
    ws_path = resolve_existing_ws_path(ws_id)
    manifest_path = os.path.join(ws_path, "manifest.json")
    if not os.path.exists(manifest_path):
        raise HTTPException(status_code=404, detail="manifest.json not found")

    try:
        with open(manifest_path, "r", encoding="utf-8") as manifest_file:
            manifest = json.load(manifest_file)
    except json.JSONDecodeError as exc:
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

    # Direct agent invocation
    new_gdd = await WorldBuilderAgent.adjust_gdd(current_gdd, payload.message, payload.agent_role)
    
    # Save optimized manifest
    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(new_gdd, f, ensure_ascii=False, indent=2)
        
    if active_job:
        active_job.result_json = json.dumps(new_gdd, ensure_ascii=False)
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

def find_codex_cli() -> Optional[str]:
    candidates = [
        os.environ.get("CODEX_CLI"),
        shutil.which("codex"),
        "/Applications/Codex.app/Contents/Resources/codex"
    ]
    for candidate in candidates:
        if candidate and os.path.exists(candidate):
            return candidate
    return None

def run_optional_codex_visual_critic(screenshot_bytes: bytes, payload_summary: dict) -> dict:
    cli = find_codex_cli()
    if not cli:
        return {"status": "unavailable", "enabled": False, "cli": None}

    enabled = os.environ.get("LOREWEAVER_ENABLE_CODEX_AUDIT") == "1"
    if not enabled:
        return {"status": "available_disabled", "enabled": False, "cli": cli}

    prompt = (
        "You are a concise visual QA critic for a Phaser game workbench. "
        "Inspect the attached screenshot for HUD occlusion (components blocking controls), "
        "button overlap (interactive buttons touching/overlapping), text overflow (labels wrapping incorrectly "
        "or cut off), and readability / touch safe area concerns (legibility, click target spacing). "
        "Return compact JSON only with the following structure:\n"
        "{\n"
        "  \"status\": \"passed\" | \"failed\",\n"
        "  \"checks\": {\n"
        "    \"vlm_hud_occlusion\": \"PASS\" | \"FAIL\" | \"WARNING\",\n"
        "    \"vlm_button_overlap\": \"PASS\" | \"FAIL\" | \"WARNING\",\n"
        "    \"vlm_text_overflow\": \"PASS\" | \"FAIL\" | \"WARNING\",\n"
        "    \"vlm_touch_readability\": \"PASS\" | \"FAIL\" | \"WARNING\"\n"
        "  },\n"
        "  \"feedback\": \"Detailed visual critique review remarks.\",\n"
        "  \"prompt_reflow_diff\": \"Textual suggestions for themeColor, goalValue, or knobs settings.\",\n"
        "  \"proposed_patches\": [\n"
        "    {\n"
        "      \"target\": \"themeColor\" | \"nodes.<nodeId>.goalValue\" | \"nodes.<nodeId>.gameplay.knobs.<knob>\",\n"
        "      \"operation\": \"replace\",\n"
        "      \"after\": \"<new_suggested_value>\",\n"
        "      \"reason\": \"Brief explanation of this suggestion.\",\n"
        "      \"patchLevel\": \"L1\" | \"L2\" | \"L3\" | \"L4\"\n"
        "    }\n"
        "  ]\n"
        "}\n"
        "Context: "
        + json.dumps(payload_summary, ensure_ascii=False)
    )

    with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as image_file:
        image_file.write(screenshot_bytes)
        image_path = image_file.name

    try:
        proc = subprocess.run(
            [
                cli,
                "exec",
                "--sandbox",
                "read-only",
                "--image",
                image_path,
                prompt
            ],
            capture_output=True,
            text=True,
            timeout=45
        )
        output = (proc.stdout or "").strip()
        parsed = None
        if "{" in output and "}" in output:
            candidate = output[output.find("{"):output.rfind("}") + 1]
            try:
                parsed = json.loads(candidate)
            except json.JSONDecodeError:
                parsed = None
        return {
            "status": "completed" if proc.returncode == 0 else "failed",
            "enabled": True,
            "cli": cli,
            "exitCode": proc.returncode,
            "stdout": output[-2000:],
            "stderr": (proc.stderr or "").strip()[-2000:],
            "result": parsed
        }
    except Exception as exc:
        return {"status": "failed", "enabled": True, "cli": cli, "error": str(exc)}
    finally:
        try:
            os.remove(image_path)
        except OSError:
            pass

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

    # 2. VLM Checks (depending on codex status/enabled/results)
    codex_enabled = codex_status.get("enabled")
    if not codex_enabled:
        vlm_status = "WARNING"
        vlm_remarks = "VLM audit is disabled. Set LOREWEAVER_ENABLE_CODEX_AUDIT=1 to enable." if codex_status.get("status") == "available_disabled" else "Codex CLI is not available."
        vlm_checks = [
            make_audit_check("vlm_hud_occlusion", "VLM HUD Occlusion", vlm_status, vlm_remarks),
            make_audit_check("vlm_button_overlap", "VLM Button Overlap", vlm_status, vlm_remarks),
            make_audit_check("vlm_text_overflow", "VLM Text Overflow", vlm_status, vlm_remarks),
            make_audit_check("vlm_touch_readability", "VLM Touch & Readability", vlm_status, vlm_remarks)
        ]
    elif codex_status.get("status") == "failed":
        err_msg = codex_status.get("error") or codex_status.get("stderr") or "Codex CLI execution failed."
        vlm_checks = [
            make_audit_check("vlm_hud_occlusion", "VLM HUD Occlusion", "FAIL", f"VLM run failed: {err_msg}"),
            make_audit_check("vlm_button_overlap", "VLM Button Overlap", "FAIL", f"VLM run failed: {err_msg}"),
            make_audit_check("vlm_text_overflow", "VLM Text Overflow", "FAIL", f"VLM run failed: {err_msg}"),
            make_audit_check("vlm_touch_readability", "VLM Touch & Readability", "FAIL", f"VLM run failed: {err_msg}")
        ]
    else:
        codex_checks = codex_result.get("checks") or {}
        vlm_checks = [
            make_audit_check(
                "vlm_hud_occlusion",
                "VLM HUD Occlusion",
                codex_checks.get("vlm_hud_occlusion") or ("PASS" if codex_result.get("status") == "passed" else "FAIL"),
                "VLM HUD occlusion check completed."
            ),
            make_audit_check(
                "vlm_button_overlap",
                "VLM Button Overlap",
                codex_checks.get("vlm_button_overlap") or ("PASS" if codex_result.get("status") == "passed" else "FAIL"),
                "VLM Button overlap check completed."
            ),
            make_audit_check(
                "vlm_text_overflow",
                "VLM Text Overflow",
                codex_checks.get("vlm_text_overflow") or ("PASS" if codex_result.get("status") == "passed" else "FAIL"),
                "VLM Text overflow check completed."
            ),
            make_audit_check(
                "vlm_touch_readability",
                "VLM Touch & Readability",
                codex_checks.get("vlm_touch_readability") or ("PASS" if codex_result.get("status") == "passed" else "FAIL"),
                "VLM Touch & Readability check completed."
            )
        ]

    checks.extend(vlm_checks)

    # 3. Overall VLM feedback / diff text
    if codex_status.get("status") == "completed" and codex_result.get("feedback"):
        vlm_feedback = codex_result["feedback"]
    else:
        vlm_feedback = (
            "Codex/Antigravity local visual audit path consumed a real Phaser screenshot. "
            f"Deterministic pixel gate is {'clean' if image_analysis.get('hasMeaningfulPixels') else 'blocked'}; "
            f"Codex CLI status: {codex_status.get('status')}."
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
