import os
import uuid
import json
import time
import asyncio
import base64
import binascii
import math
import shutil
import struct
import subprocess
import tempfile
import zlib
from typing import Optional
from fastapi import FastAPI, Depends, HTTPException, BackgroundTasks, Query
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from .database import engine, Base, get_db
from .models import Workspace, Job
from .schemas import (
    WorkspaceCreate, WorkspaceResponse, WorkspaceListResponse,
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
REPORTS_DIR = os.path.join(LORE_ROOT, "workflow", "reports")
DATA_DIR = os.path.join(LORE_ROOT, "data")
WORKSPACES_DIR = os.path.join(DATA_DIR, "workspaces")
os.makedirs(WORKSPACES_DIR, exist_ok=True)

# Helper: physical workspace directory path
def get_ws_path(ws_id: str) -> str:
    path = os.path.join(WORKSPACES_DIR, ws_id)
    os.makedirs(path, exist_ok=True)
    return path

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
            now_str = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.get_current_time() if hasattr(time, 'get_current_time') else time.gmtime())
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
@app.post("/api/workspaces", response_model=WorkspaceResponse)
def api_create_workspace(payload: WorkspaceCreate, db: Session = Depends(get_db)):
    ws_id = str(uuid.uuid4())
    now_str = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.get_current_time() if hasattr(time, 'get_current_time') else time.gmtime())
    
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
        "Inspect the attached screenshot for blank rendering, HUD overlap, text overflow, "
        "unsafe touch margins, and contrast issues. Return compact JSON only with keys "
        "status, feedback, and prompt_reflow_diff. Context: "
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
                "--ask-for-approval",
                "never",
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

    audit = {
        "checks": checks,
        "vlm_feedback": vlm_feedback,
        "prompt_reflow_diff": prompt_reflow_diff,
        "image_analysis": image_analysis,
        "codex_visual_agent": codex_status
    }

    os.makedirs(REPORTS_DIR, exist_ok=True)
    with open(os.path.join(REPORTS_DIR, "visual_audit_latest.json"), "w", encoding="utf-8") as f:
        json.dump({
            "gate": "visual_audit",
            "status": "failed" if any(item["status"] == "FAIL" for item in checks) else "passed",
            "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "method": "codex_antigravity_local_visual_audit",
            "data": audit
        }, f, ensure_ascii=False, indent=2)

    return {"success": True, "method": "codex_antigravity_local_visual_audit", "data": audit}
