#!/usr/bin/env python3
"""Build a local, offline listening sheet from the procedural audio provenance."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PROVENANCE = ROOT / "assets/audio/procedural/provenance.json"
OUTPUT = ROOT / "docs/fangame/audio_review.html"
BROWSER_REPORT = ROOT / "data/workspaces/xuanjie-shimu-local/reports/standalone_browser_report.json"


def main() -> None:
    browser_report = json.loads(BROWSER_REPORT.read_text(encoding="utf-8"))
    assert browser_report["status"] == "passed", "verified candidate required"
    artifact = ROOT / browser_report["artifact"]
    artifact_sha = hashlib.sha256(artifact.read_bytes()).hexdigest()
    assert artifact_sha == browser_report["artifactSha256"], "candidate identity mismatch"
    manifest = json.loads(PROVENANCE.read_text(encoding="utf-8"))
    items = manifest["items"]
    assert len(items) == 34, "expected 12 BGM and 22 SFX cues"
    for item in items:
        file = ROOT / item["path"]
        assert file.is_file(), file
        assert hashlib.sha256(file.read_bytes()).hexdigest() == item["sha256"], file

    rows = [
        {
            "id": item["id"],
            "kind": "配乐" if "/bgm/" in item["path"] else "音效",
            "src": "../../" + item["path"],
            "sha256": item["sha256"],
            "motifs": ", ".join(item.get("motifFamilies", [])),
            "ambience": item.get("ambienceFamily", ""),
        }
        for item in items
    ]
    data = json.dumps(rows, ensure_ascii=False).replace("</", "<\\/")
    html = """<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>石牧候选包 · 声音试听台</title>
<style>
:root{color-scheme:dark;font-family:system-ui,-apple-system,sans-serif;background:#0b1020;color:#e5e7eb}
*{box-sizing:border-box}body{margin:0 auto;max-width:980px;padding:24px 18px 60px;line-height:1.55}
h1{font-size:clamp(1.5rem,3vw,2rem);margin:0 0 8px}h2{margin:32px 0 12px;color:#c4b5fd}
.lead{color:#cbd5e1;max-width:70ch}.meta{font-size:.85rem;color:#94a3b8;overflow-wrap:anywhere}
.cue{border:1px solid #334155;border-radius:12px;background:#141b2d;padding:14px;margin:10px 0}
.cue header{display:flex;justify-content:space-between;gap:8px;align-items:start}.cue strong{font-size:1rem}
.tag{font-size:.8rem;color:#c4b5fd}.cue audio{display:block;width:100%;margin:10px 0}
.cue label{display:block;font-size:.83rem;color:#94a3b8}.cue textarea,#summary{width:100%;min-height:54px;resize:vertical;border:1px solid #475569;border-radius:7px;background:#0b1020;color:#f8fafc;padding:8px;font:inherit}
#summary{min-height:100px}.actions{position:sticky;bottom:0;background:#0b1020ee;padding:12px 0;border-top:1px solid #334155}
button{background:#6d28d9;color:#fff;border:0;border-radius:8px;padding:10px 16px;font:inherit;cursor:pointer}
</style>
</head>
<body>
<h1>石牧候选包 · 声音试听台</h1>
<p class="lead">按关卡播放配乐，再同时播放相应短音，记录辨识度、声量、时机与混音问题。页面和音频都在本地；“导出意见”只下载 JSON，不发送到网络。</p>
<p class="meta">候选 ZIP SHA-256：__ARTIFACT_SHA__。来源与文件哈希以 <a href="../../assets/audio/procedural/provenance.json">provenance.json</a> 为准。当前为待审核材料，不代表剩余音频交接已签收。</p>
<section id="bgm"><h2>12 段关卡配乐</h2></section>
<section id="sfx"><h2>22 个短音效</h2></section>
<h2>整体听感</h2><textarea id="summary" aria-label="整体听感" placeholder="例如：哪些关卡音量或母题衔接不合适？"></textarea>
<div class="actions"><button id="export" type="button">导出试听意见 JSON</button></div>
<script id="cues" type="application/json">__CUES__</script>
<script>
const cues=JSON.parse(document.querySelector('#cues').textContent);
for(const cue of cues){
  const card=document.createElement('article');card.className='cue';
  const header=document.createElement('header');const name=document.createElement('strong');name.textContent=cue.id;
  const tag=document.createElement('span');tag.className='tag';tag.textContent=cue.kind;
  header.append(name,tag);
  const motifs=document.createElement('div');motifs.className='meta';motifs.textContent=cue.motifs?`母题：${cue.motifs}${cue.ambience?`；环境层：${cue.ambience}`:''}`:`文件 SHA-256：${cue.sha256.slice(0,16)}…`;
  const audio=document.createElement('audio');audio.controls=true;audio.preload='none';audio.src=cue.src;
  const label=document.createElement('label');label.textContent='试听意见';
  const note=document.createElement('textarea');note.placeholder='无问题可留空；请写清声量、节奏或音色问题';note.dataset.cue=cue.id;label.append(note);
  card.append(header,motifs,audio,label);
  document.querySelector(cue.kind==='配乐'?'#bgm':'#sfx').append(card);
}
document.querySelector('#export').addEventListener('click',()=>{
  const payload={schemaVersion:'loreweaver.audio-review.v1',candidateSha256:'__ARTIFACT_SHA__',createdAt:new Date().toISOString(),summary:document.querySelector('#summary').value,notes:Object.fromEntries([...document.querySelectorAll('textarea[data-cue]')].map(node=>[node.dataset.cue,node.value]))};
  const blob=new Blob([JSON.stringify(payload,null,2)+'\\n'],{type:'application/json'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='xuanjie-audio-review.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
});
</script>
</body>
</html>
"""
    OUTPUT.write_text(html.replace("__ARTIFACT_SHA__", artifact_sha).replace("__CUES__", data), encoding="utf-8")
    print(f"wrote {OUTPUT.relative_to(ROOT)} with {len(rows)} verified audio files")


if __name__ == "__main__":
    main()
