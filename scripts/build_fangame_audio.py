#!/usr/bin/env python3
"""Build deterministic, original game loops and short cues for the local Workspace.

The samples are synthesized from oscillators and seeded noise. No external
recording, sample pack, model output, or copyrighted melody is used.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import shutil
import subprocess
import tempfile
import wave
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
SAMPLE_RATE = 24000
WORKSPACE_ID = "xuanjie-shimu-local"

# A pentatonic vocabulary with independent rhythms and root registers. The
# arrangement changes by stage; these are compositions, not transcriptions.
STAGES = [
    ("node1_battle", 98.00, 108, "battle", [0, 3, 7, 10, 7, 3, 0, -2]),
    ("node2_treasure", 110.00, 94, "duel", [0, 7, 5, 3, 0, 3, 7, 5]),
    ("node3_rival", 82.41, 102, "rival", [0, 3, -2, 7, 5, 3, 0, -5]),
    ("node4_tide", 123.47, 116, "windfire", [0, 5, 7, 12, 10, 7, 3, 0]),
    ("node5_defense", 146.83, 100, "bow", [0, 7, 12, 7, 5, 10, 7, 3]),
    ("node6_poison", 92.50, 122, "siege", [0, -2, 3, 5, 0, 7, 3, -2]),
    ("node7_tournament", 174.61, 78, "moon", [0, 5, 7, 12, 7, 5, 3, 0]),
    ("node8_ruins", 103.83, 104, "ruins", [0, 3, 7, 3, -2, 0, 5, 7]),
    ("node9_escort", 116.54, 124, "horn", [0, 7, 10, 7, 5, 3, 0, -2]),
    ("node10_siege", 130.81, 88, "heartbeat", [0, 3, 0, -2, 0, 5, 3, 0]),
    ("node11_gauntlet", 77.78, 128, "blood", [0, 7, 3, 10, 7, 12, 10, 3]),
    ("node12_finale", 155.56, 126, "finale", [0, 7, 12, 10, 7, 5, 3, 0]),
]

# Reusable rhythmic identities; each stage states which themes it develops.
# The intervals and gestures are original and synthesized without samples.
STAGE_FAMILIES = {
    "node1_battle": ["fist_wind", "black_blade", "purple_bow"],
    "node2_treasure": ["fist_wind", "black_blade"],
    "node3_rival": ["black_blade", "purple_bow"],
    "node4_tide": ["black_blade", "fist_wind"],
    "node5_defense": ["purple_bow"],
    "node6_poison": ["fist_wind", "black_blade"],
    "node7_tournament": ["moon_silver"],
    "node8_ruins": ["black_blade", "moon_silver"],
    "node9_escort": ["fist_wind", "black_blade"],
    "node10_siege": ["blood_pulse"],
    "node11_gauntlet": ["blood_pulse", "black_blade"],
    "node12_finale": ["black_blade", "purple_bow", "moon_silver", "blood_pulse"],
}

# Quiet environmental beds are part of the authored loops. Keeping them inside
# each BGM avoids another autoplay channel and keeps pause/mute transitions in
# the existing AudioAssetResolver path.
AMBIENCE_FAMILIES = {
    "node3_rival": "corpse_tide",
    "node6_poison": "encirclement",
    "node8_ruins": "encirclement",
    "node9_escort": "tribal_front",
    "node11_gauntlet": "corpse_tide",
}

EXTRA_SFX = [
    ("sfx_black_blade", [310, 465], "黑刀挥斩的短促金属刀鸣。"),
    ("sfx_fire_slash", [196, 392, 587], "烈炎方向连招的上扬刀鸣与火响。"),
    ("sfx_wind_slash", [440, 660, 880], "疾风方向连招的轻快破风短音。"),
    ("sfx_awakening_heartbeat", [56, 48], "节点 10 反击成功的短促双拍异血心跳。"),
    ("sfx_arena_drum_warning", [92, 138], "节点 2 四馆重击预警的低鼓双拍。"),
    ("sfx_arena_counter_open", [330, 220], "节点 2 反击窗口亮起时的短促骨响。"),
    ("sfx_blood_heartbeat_window", [68, 102], "节点 11 六秒 OVERDRIVE 窗口的异血心跳层。"),
    ("sfx_war_horn", [116, 174], "节点 9 守线开场的短促双音号角。"),
    ("sfx_wall_breach", [86, 172], "节点 9 敌军冲破防线时的低频撞击。"),
    ("sfx_latent_heartbeat_window", [62, 93], "节点 1 白猿被动已解锁时的轻量六秒异血脉冲。"),
    ("sfx_wave_clear", [330, 495], "节点 1 三波清场后的短促结算音。"),
    ("sfx_horde_drum", [92, 138], "节点 6 围杀刷怪事件的密鼓提示。"),
]


def tone(signal: np.ndarray, start: float, length: float, hz: float, gain: float,
         *, kind: str = "pluck") -> None:
    offset = round(start * SAMPLE_RATE)
    size = min(round(length * SAMPLE_RATE), len(signal) - offset)
    if offset < 0 or size <= 0:
        return
    t = np.arange(size, dtype=np.float64) / SAMPLE_RATE
    if kind == "pad":
        wave_data = np.sin(2 * np.pi * hz * t) + 0.2 * np.sin(2 * np.pi * hz * 2 * t)
        envelope = np.minimum(1, t / 0.12) * np.minimum(1, (length - t) / 0.2)
    elif kind == "horn":
        wave_data = (np.sin(2 * np.pi * hz * t) + 0.38 * np.sin(2 * np.pi * hz * 2 * t)
                     + 0.14 * np.sin(2 * np.pi * hz * 3 * t))
        envelope = np.minimum(1, t / 0.055) * np.exp(-t * 1.8 / max(length, 0.1))
    elif kind == "bell":
        wave_data = np.sin(2 * np.pi * hz * t) + 0.25 * np.sin(2 * np.pi * hz * 2.01 * t)
        envelope = np.minimum(1, t / 0.009) * np.exp(-t * 4.2 / max(length, 0.1))
    else:
        wave_data = np.sin(2 * np.pi * hz * t) + 0.28 * np.sin(2 * np.pi * hz * 2 * t)
        envelope = np.minimum(1, t / 0.006) * np.exp(-t * 3.6 / max(length, 0.1))
    signal[offset:offset + size] += (gain * wave_data * np.maximum(0, envelope)).astype(np.float32)


def noise_hit(signal: np.ndarray, start: float, length: float, gain: float,
              seed: int, *, bright: bool = False) -> None:
    offset = round(start * SAMPLE_RATE)
    size = min(round(length * SAMPLE_RATE), len(signal) - offset)
    if offset < 0 or size <= 0:
        return
    rng = np.random.default_rng(seed)
    raw = rng.standard_normal(size).astype(np.float32)
    if bright:
        raw = raw - np.convolve(raw, np.ones(35, dtype=np.float32) / 35, mode="same")
    else:
        raw = np.convolve(raw, np.ones(15, dtype=np.float32) / 15, mode="same")
    t = np.arange(size, dtype=np.float64) / SAMPLE_RATE
    envelope = np.exp(-t * (20 if bright else 12) / max(length, 0.05))
    signal[offset:offset + size] += gain * raw * envelope


def note_hz(root: float, semitones: int, octave: int = 1) -> float:
    return root * octave * (2 ** (semitones / 12))


def render_family(signal: np.ndarray, start: float, beat: float, root: float,
                  family: str, seed: int) -> None:
    if family == "fist_wind":
        for offset in (0.0, 1.5, 2.75):
            noise_hit(signal, start + beat * offset, beat * 0.42, 0.035,
                      seed + round(offset * 100), bright=True)
            tone(signal, start + beat * offset, beat * 0.22, 72, 0.055)
    elif family == "black_blade":
        for offset, semitone in ((0.0, 0), (1.75, 3), (2.5, -2), (3.0, 0)):
            tone(signal, start + beat * offset, beat * 0.7,
                 note_hz(root, semitone, 2), 0.045, kind="bell")
    elif family == "purple_bow":
        for offset, semitone in ((0.5, 7), (1.0, 12), (2.5, 7), (3.0, 5)):
            tone(signal, start + beat * offset, beat * 0.44,
                 note_hz(root, semitone, 2), 0.045, kind="pluck")
    elif family == "moon_silver":
        for offset, semitone in ((0.0, 0), (1.0, 5), (2.0, 7), (3.0, 12)):
            tone(signal, start + beat * offset, beat * 1.1,
                 note_hz(root, semitone, 2), 0.038, kind="bell")
    elif family == "blood_pulse":
        for offset, hz, gain in ((0.0, 56, 0.075), (0.28, 84, 0.045),
                                 (2.0, 56, 0.075), (2.28, 84, 0.045)):
            tone(signal, start + beat * offset, beat * 0.4, hz, gain)
    else:
        raise ValueError(f"unknown motif family: {family}")


def render_ambience(signal: np.ndarray, beat: float, family: str, seed: int) -> None:
    """Mix a low, original soundscape beneath the melody and combat beat."""
    size = len(signal)
    rng = np.random.default_rng(seed)
    raw = rng.standard_normal(size).astype(np.float32)
    window = 83 if family == "corpse_tide" else 43 if family == "encirclement" else 59
    wash = np.convolve(raw, np.ones(window, dtype=np.float32) / window, mode="same")
    seconds = np.arange(size, dtype=np.float32) / SAMPLE_RATE
    sway = 0.62 + 0.38 * np.sin(2 * np.pi * (0.18 if family == "corpse_tide" else 0.27) * seconds)
    gain = {"corpse_tide": 0.085, "encirclement": 0.072, "tribal_front": 0.075}[family]
    bed = wash * sway * gain
    edge = min(round(0.18 * SAMPLE_RATE), size // 2)
    bed[:edge] *= np.linspace(0, 1, edge)
    bed[-edge:] *= np.linspace(1, 0, edge)
    signal += bed.astype(np.float32)

    if family == "corpse_tide":
        for offset in np.arange(1.4, size / SAMPLE_RATE - 0.3, beat * 5):
            tone(signal, float(offset), 0.42, 74, 0.022, kind="horn")
            noise_hit(signal, float(offset + 0.16), 0.18, 0.028,
                      seed + round(float(offset) * 100), bright=False)
    elif family == "encirclement":
        for offset in np.arange(0.8, size / SAMPLE_RATE - 0.3, beat * 4):
            tone(signal, float(offset), 0.31, 68, 0.033, kind="pluck")
            noise_hit(signal, float(offset + 0.11), 0.14, 0.035,
                      seed + round(float(offset) * 100), bright=False)
    elif family == "tribal_front":
        for offset in np.arange(2.0, size / SAMPLE_RATE - 0.6, beat * 8):
            tone(signal, float(offset), 0.62, 116, 0.028, kind="horn")
            tone(signal, float(offset + 0.18), 0.52, 174, 0.017, kind="horn")
    else:
        raise ValueError(f"unknown ambience family: {family}")


def render_stage(index: int, name: str, root: float, bpm: int, style: str,
                 motif: list[int], *, include_ambience: bool = True) -> np.ndarray:
    beat = 60 / bpm
    duration = beat * 32  # Eight four-beat measures; exact deterministic loop length.
    output = np.zeros(round(duration * SAMPLE_RATE), dtype=np.float32)
    for bar in range(8):
        start = bar * beat * 4
        families = STAGE_FAMILIES[name]
        render_family(output, start, beat, root,
                      families[(bar // 2) % len(families)], index * 10000 + bar * 100)
        chord = [0, 3, 7, 5][bar % 4]
        tone(output, start, beat * 3.85, note_hz(root, chord), 0.10, kind="pad")
        tone(output, start, beat * 3.85, note_hz(root, chord + 7), 0.035, kind="pad")
        for b in range(4):
            pos = start + b * beat
            note = motif[(bar * 4 + b) % len(motif)]
            if b in (0, 2) or style in {"battle", "bow", "windfire", "finale"}:
                kind = "bell" if style in {"moon", "ruins"} else "horn" if style == "horn" else "pluck"
                tone(output, pos, beat * (0.7 if kind != "horn" else 1.2), note_hz(root, note, 2),
                     0.10 if kind == "bell" else 0.085, kind=kind)
            if style in {"battle", "duel", "rival", "windfire", "siege", "blood", "finale"}:
                if b in (0, 2):
                    tone(output, pos, 0.22, 64, 0.16, kind="pluck")
                if b in (1, 3):
                    noise_hit(output, pos, 0.12, 0.10, seed=index * 1000 + bar * 4 + b, bright=True)
            if style in {"heartbeat", "blood", "finale"} and b in (0, 2):
                tone(output, pos + beat * 0.24, 0.18, 56, 0.11)
            if style in {"bow", "windfire", "moon", "ruins"} and b in (1, 3):
                tone(output, pos + beat * 0.48, 0.18, note_hz(root, note + 12, 2), 0.035, kind="bell")
            if style in {"windfire", "ruins"} and b == 3:
                noise_hit(output, pos, 0.3, 0.055, seed=index * 2000 + bar, bright=False)
    ambience = AMBIENCE_FAMILIES.get(name)
    if ambience and include_ambience:
        render_ambience(output, beat, ambience, index * 100_003)
    # Smooth the join. A small dip is preferable to a discontinuity on MP3 loop.
    edge = round(0.14 * SAMPLE_RATE)
    output[:edge] *= np.linspace(0, 1, edge)
    output[-edge:] *= np.linspace(1, 0, edge)
    return output


def render_sfx(name: str, index: int) -> np.ndarray:
    lengths = {
        "sfx_blade_sweep": 0.30, "sfx_bow_release": 0.27,
        "sfx_black_blade": 0.32, "sfx_fire_slash": 0.43,
        "sfx_wind_slash": 0.34,
        "sfx_stance_melee": 0.22, "sfx_stance_ranged": 0.22,
        "sfx_overdrive": 0.66, "sfx_growth": 0.54,
        "sfx_awakening_heartbeat": 0.48,
        "sfx_arena_drum_warning": 0.34,
        "sfx_arena_counter_open": 0.25,
        "sfx_blood_heartbeat_window": 6.0,
        "sfx_war_horn": 0.92,
        "sfx_wall_breach": 0.42,
        "sfx_latent_heartbeat_window": 6.0,
        "sfx_wave_clear": 0.62,
        "sfx_horde_drum": 0.64,
        "victory_sting": 0.90, "defeat_sting": 0.72,
        "defeat_timeout": 0.55, "defeat_death": 0.62,
    }
    length = lengths[name]
    output = np.zeros(round(length * SAMPLE_RATE), dtype=np.float32)
    if name == "sfx_black_blade":
        noise_hit(output, 0, 0.23, 0.23, 100 + index, bright=True)
        tone(output, 0.02, 0.28, 310, 0.20, kind="bell")
        tone(output, 0.055, 0.24, 465, 0.09, kind="bell")
    elif name == "sfx_fire_slash":
        noise_hit(output, 0, 0.35, 0.24, 100 + index, bright=False)
        for i, hz in enumerate((196, 392, 587)):
            tone(output, i * 0.055, 0.30, hz, 0.14, kind="horn")
    elif name == "sfx_wind_slash":
        noise_hit(output, 0, 0.26, 0.19, 100 + index, bright=True)
        for i, hz in enumerate((440, 660, 880)):
            tone(output, i * 0.045, 0.19, hz, 0.09, kind="bell")
    elif name == "sfx_blade_sweep":
        noise_hit(output, 0, 0.25, 0.30, 100 + index, bright=True)
        tone(output, 0.025, 0.20, 310, 0.13)
    elif name == "sfx_bow_release":
        tone(output, 0, 0.20, 520, 0.21)
        tone(output, 0.04, 0.17, 260, 0.11)
        noise_hit(output, 0, 0.08, 0.12, 100 + index, bright=True)
    elif name.startswith("sfx_stance"):
        freqs = (260, 390) if name.endswith("melee") else (520, 780)
        for i, hz in enumerate(freqs):
            tone(output, i * 0.055, 0.15, hz, 0.16, kind="bell")
    elif name == "sfx_overdrive":
        for i, hz in enumerate((82, 164, 246, 328)):
            tone(output, i * 0.10, 0.29, hz, 0.16, kind="horn")
    elif name == "sfx_awakening_heartbeat":
        for start, hz, gain in ((0.0, 56, 0.30), (0.17, 48, 0.24)):
            tone(output, start, 0.23, hz, gain, kind="pluck")
            noise_hit(output, start, 0.12, 0.08, 100 + index + round(start * 100))
    elif name == "sfx_arena_drum_warning":
        for start, hz, gain in ((0.0, 92, 0.27), (0.15, 138, 0.19)):
            tone(output, start, 0.17, hz, gain, kind="horn")
            noise_hit(output, start, 0.12, 0.11, 100 + index + round(start * 100))
    elif name == "sfx_arena_counter_open":
        noise_hit(output, 0, 0.18, 0.14, 100 + index, bright=True)
        tone(output, 0, 0.18, 330, 0.16, kind="pluck")
        tone(output, 0.06, 0.16, 220, 0.11, kind="pluck")
    elif name == "sfx_blood_heartbeat_window":
        for beat in range(12):
            start = beat * 0.5
            tone(output, start, 0.28, 68, 0.20, kind="pluck")
            tone(output, start + 0.17, 0.21, 102, 0.13, kind="pluck")
            noise_hit(output, start, 0.13, 0.06, 100 + index * 100 + beat)
        edge = round(0.12 * SAMPLE_RATE)
        output[:edge] *= np.linspace(0, 1, edge)
        output[-edge:] *= np.linspace(1, 0, edge)
    elif name == "sfx_latent_heartbeat_window":
        for beat in range(6):
            start = beat * 1.0
            tone(output, start, 0.25, 62, 0.10, kind="pluck")
            tone(output, start + 0.22, 0.18, 93, 0.055, kind="pluck")
        edge = round(0.12 * SAMPLE_RATE)
        output[:edge] *= np.linspace(0, 1, edge)
        output[-edge:] *= np.linspace(1, 0, edge)
    elif name == "sfx_wave_clear":
        noise_hit(output, 0, 0.16, 0.09, 100 + index, bright=True)
        tone(output, 0.0, 0.36, 330, 0.16, kind="bell")
        tone(output, 0.17, 0.40, 495, 0.14, kind="bell")
    elif name == "sfx_horde_drum":
        for beat, hz, gain in ((0.0, 92, 0.25), (0.14, 138, 0.16), (0.28, 92, 0.23), (0.43, 82, 0.18)):
            tone(output, beat, 0.17, hz, gain, kind="pluck")
            noise_hit(output, beat, 0.09, 0.07, 100 + index * 100 + round(beat * 100))
    elif name == "sfx_war_horn":
        tone(output, 0.0, 0.58, 116, 0.20, kind="horn")
        tone(output, 0.23, 0.58, 174, 0.16, kind="horn")
        tone(output, 0.46, 0.40, 232, 0.09, kind="horn")
    elif name == "sfx_wall_breach":
        noise_hit(output, 0, 0.30, 0.24, 100 + index, bright=False)
        tone(output, 0.015, 0.30, 86, 0.25, kind="pluck")
        tone(output, 0.08, 0.23, 172, 0.08, kind="horn")
    elif name == "sfx_growth":
        for i, hz in enumerate((440, 554, 659, 880)):
            tone(output, i * 0.105, 0.22, hz, 0.14, kind="bell")
    elif name == "victory_sting":
        for i, hz in enumerate((523, 659, 784, 1047)):
            tone(output, i * 0.19, 0.35, hz, 0.16, kind="bell")
    elif name == "defeat_sting":
        for i, hz in enumerate((220, 185, 147)):
            tone(output, i * 0.20, 0.35, hz, 0.17, kind="horn")
    elif name == "defeat_timeout":
        for i, hz in enumerate((330, 247, 165)):
            tone(output, i * 0.16, 0.20, hz, 0.13, kind="bell")
    elif name == "defeat_death":
        noise_hit(output, 0, 0.23, 0.18, 100 + index)
        tone(output, 0.06, 0.48, 82, 0.24, kind="horn")
    return output


def encode_mp3(samples: np.ndarray, destination: Path, *, bgm: bool = False) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    peak = float(np.max(np.abs(samples))) if len(samples) else 0
    if peak <= 0:
        raise ValueError(f"silent audio: {destination}")
    samples = np.tanh(samples * min(4.0, 0.78 / peak)).astype(np.float32)
    pcm = np.round(np.clip(samples, -1, 1) * 32767).astype("<i2")
    with tempfile.TemporaryDirectory(prefix="lw-audio-") as folder:
        wav_path = Path(folder) / "source.wav"
        with wave.open(str(wav_path), "wb") as wav:
            wav.setnchannels(1)
            wav.setsampwidth(2)
            wav.setframerate(SAMPLE_RATE)
            wav.writeframes(pcm.tobytes())
        command = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(wav_path)]
        if bgm:
            command += ["-af", "loudnorm=I=-16:TP=-2:LRA=9", "-ar", str(SAMPLE_RATE)]
        command += ["-codec:a", "libmp3lame", "-q:a", "5", str(destination)]
        subprocess.run(command, check=True)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--workspace-id", default=WORKSPACE_ID)
    args = parser.parse_args()
    if args.workspace_id != WORKSPACE_ID:
        parser.error("this authored score only targets xuanjie-shimu-local")
    workspace = ROOT / "data" / "workspaces" / args.workspace_id
    catalog_path = workspace / "loreweaver/catalogs/audioCueCatalog.json"
    if not catalog_path.exists():
        parser.error(f"missing catalog: {catalog_path}")
    repo_audio = ROOT / "assets/audio/procedural"
    workspace_audio = workspace / "assets/audio/procedural"
    cues = json.loads(catalog_path.read_text())
    existing_ids = {cue["id"] for cue in cues}
    for name, frequencies, description in EXTRA_SFX:
        if name not in existing_ids:
            cues.append({
                "id": name,
                "runtimeSkillId": (
                    "defend_line" if name in {"sfx_war_horn", "sfx_wall_breach"}
                    else "overdrive_transformation" if name in {"sfx_blood_heartbeat_window", "sfx_latent_heartbeat_window"}
                    else "arena_wave_boss" if name == "sfx_wave_clear"
                    else "horde_intensity" if name == "sfx_horde_drum"
                    else "dodge_counter_boss" if name in {"sfx_awakening_heartbeat", "sfx_arena_drum_warning", "sfx_arena_counter_open"}
                    else "side_scrolling_brawler"
                ),
                "synth": {"frequencies": frequencies, "wave": "triangle", "durationMs": 180, "volume": 0.11},
                "mixRole": "combat",
                "description": description,
            })
    paths: dict[str, str] = {}
    details = []
    for index, (name, root, bpm, style, motif) in enumerate(STAGES, 1):
        relative = f"assets/audio/procedural/bgm/{name}.mp3"
        destination = ROOT / relative
        encode_mp3(render_stage(index, name, root, bpm, style, motif), destination, bgm=True)
        paths[name] = relative
        details.append({"id": name, "path": relative, "bpm": bpm, "style": style,
                        "motifFamilies": STAGE_FAMILIES[name],
                        "ambienceFamily": AMBIENCE_FAMILIES.get(name),
                        "sha256": hashlib.sha256(destination.read_bytes()).hexdigest()})
    sfx_names = [cue["id"] for cue in cues if cue.get("mixRole") != "bgm"]
    for index, name in enumerate(sfx_names, 1):
        relative = f"assets/audio/procedural/sfx/{name}.mp3"
        destination = ROOT / relative
        encode_mp3(render_sfx(name, index), destination)
        paths[name] = relative
        details.append({"id": name, "path": relative,
                        "sha256": hashlib.sha256(destination.read_bytes()).hexdigest()})
    for cue in cues:
        if cue["id"] in paths:
            cue["assetPath"] = paths[cue["id"]]
    catalog_path.write_text(json.dumps(cues, ensure_ascii=False, indent=2) + "\n")
    shutil.copytree(repo_audio, workspace_audio, dirs_exist_ok=True)
    manifest = {
        "schemaVersion": "loreweaver.procedural-audio.v1",
        "source": "scripts/build_fangame_audio.py; original deterministic oscillators and seeded noise",
        "license": "Original composition and synthesis for this project; no third-party samples",
        "sampleRate": SAMPLE_RATE,
        "codec": "MP3",
        "items": details,
    }
    for folder in (repo_audio, workspace_audio):
        (folder / "provenance.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"status": "generated", "count": len(details), "workspaceId": args.workspace_id}))


if __name__ == "__main__":
    main()
