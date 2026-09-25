const params = new URLSearchParams(location.search);
const target = document.getElementById('target') as HTMLButtonElement;
const statusLabel = document.getElementById('status')!;
let payload: any = null;
try {
  const encoded = params.get('data');
  payload = JSON.parse(encoded ? new TextDecoder().decode(Uint8Array.from(atob(encoded), c => c.charCodeAt(0))) : params.get('payload') || '{}');
} catch { statusLabel.textContent = '无法读取游戏载荷'; target.disabled = true; }
const knobs = payload?.nodeConfig?.gameplay?.knobs || {};
const needed = Math.max(1, Math.min(12, Number(knobs.demoTarget) || 4));
let left = Math.max(3, Math.min(60, Number(knobs.demoTimeLimitSec) || 15));
let hits = 0, status = payload ? 'running' : 'error', last = performance.now();
const positions = [[25, 25], [75, 35], [35, 75], [70, 70]];
const send = (data: any) => parent.postMessage(data, '*'); // file:// also has an opaque origin; parent verifies source and origin.
function render() {
  statusLabel.textContent = `${status === 'paused' ? '已暂停 · ' : ''}${hits}/${needed} · ${Math.ceil(left)} 秒`;
  const position = positions[hits % positions.length];
  target.style.left = `${position[0]}%`; target.style.top = `${position[1]}%`; target.disabled = status !== 'running';
}
function finish(success: boolean) {
  if (status !== 'running') return;
  status = 'ended'; render();
  const reason = success ? 'objective_met' : 'timer_expired';
  const reply = knobs.responseFormat === 'legacy'
    ? { type: 'NODE_RESULT', reward: { success, reason, ...(success ? { qi: 3, xp: 30, skill: 'iframe_focus', relic: 'iframe_jade', flag: 'iframe_demo_clear' } : {}) } }
    : { type: 'NODE_RESULT', result: { success, reason, rewards: success ? { qi: 3, xp: 30, skill: 'iframe_focus', relic: 'iframe_jade' } : {}, unlocks: { flags: success ? ['iframe_demo_clear'] : [] }, telemetry: { hits, needed } } };
  // Model at-least-once delivery: the host must still reward exactly once.
  send(reply); send(reply);
}
target.addEventListener('click', () => { if (status !== 'running') return; hits++; if (hits >= needed) finish(true); else render(); });
document.addEventListener('keydown', event => { if (event.code === 'Space') { event.preventDefault(); if (!event.repeat && status === 'running') target.click(); } });
document.getElementById('close')!.addEventListener('click', () => { if (status !== 'ended') { status = 'ended'; send({ type: 'NODE_CLOSE' }); } });
window.addEventListener('message', event => {
  if (event.source !== parent || !payload || String(event.data?.nodeId) !== String(payload.nodeId)) return;
  if (event.data.type === 'NODE_PAUSE' && status === 'running') status = 'paused';
  if (event.data.type === 'NODE_RESUME' && status === 'paused') { status = 'running'; last = performance.now(); }
  render();
});
Object.defineProperty(window, '__IFRAME_GAME__', { value: Object.freeze({ snapshot: () => structuredClone({ status, hits, needed, left, nodeId: payload?.nodeId, title: payload?.nodeConfig?.title, encoding: params.has('data') ? 'base64_json' : 'plain_json' }) }) });
if (payload) {
  document.getElementById('payload')!.textContent = `节点 ${payload.nodeId} · ${payload.nodeConfig?.title || ''}`;
  render(); send({ type: 'NODE_READY', supportsPause: true });
  const frame = (now: number) => { const dt = (now - last) / 1000; last = now; if (status === 'running') { left = Math.max(0, left - dt); if (left <= 0) finish(false); else render(); } if (status !== 'ended') requestAnimationFrame(frame); };
  requestAnimationFrame(frame);
}
