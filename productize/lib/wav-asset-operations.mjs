import fs from "node:fs";

export class WavAssetOperationError extends Error {
  constructor(reason, detail = null) {
    super(detail ? `${reason}:${detail}` : reason);
    this.name = "WavAssetOperationError";
    this.reason = reason;
    this.detail = detail;
  }
}

function requireInteger(value, min, max, reason) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) {
    throw new WavAssetOperationError(reason, value);
  }
  return number;
}

function chunkId(buffer, offset) {
  return buffer.subarray(offset, offset + 4).toString("ascii");
}

export function decodePcmWav(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 44) throw new WavAssetOperationError("wav_too_small");
  if (chunkId(buffer, 0) !== "RIFF" || chunkId(buffer, 8) !== "WAVE") {
    throw new WavAssetOperationError("wav_riff_header_invalid");
  }
  const declaredSize = buffer.readUInt32LE(4) + 8;
  if (declaredSize > buffer.length) throw new WavAssetOperationError("wav_declared_size_truncated");

  let offset = 12;
  let fmt = null;
  let pcm = null;
  while (offset + 8 <= buffer.length) {
    const id = chunkId(buffer, offset);
    const size = buffer.readUInt32LE(offset + 4);
    const start = offset + 8;
    const end = start + size;
    if (end > buffer.length) throw new WavAssetOperationError("wav_chunk_truncated", id);
    if (id === "fmt ") {
      if (size < 16) throw new WavAssetOperationError("wav_fmt_too_small");
      fmt = {
        audioFormat: buffer.readUInt16LE(start),
        channels: buffer.readUInt16LE(start + 2),
        sampleRate: buffer.readUInt32LE(start + 4),
        byteRate: buffer.readUInt32LE(start + 8),
        blockAlign: buffer.readUInt16LE(start + 12),
        bitsPerSample: buffer.readUInt16LE(start + 14)
      };
    } else if (id === "data" && pcm === null) {
      pcm = Buffer.from(buffer.subarray(start, end));
    }
    offset = end + (size % 2);
  }
  if (!fmt) throw new WavAssetOperationError("wav_fmt_missing");
  if (pcm === null) throw new WavAssetOperationError("wav_data_missing");
  if (fmt.audioFormat !== 1) throw new WavAssetOperationError("wav_only_pcm_supported", fmt.audioFormat);
  if (![1, 2].includes(fmt.channels)) throw new WavAssetOperationError("wav_channel_count_unsupported", fmt.channels);
  if (fmt.bitsPerSample !== 16) throw new WavAssetOperationError("wav_only_pcm16_supported", fmt.bitsPerSample);
  if (fmt.sampleRate < 8000 || fmt.sampleRate > 192000) throw new WavAssetOperationError("wav_sample_rate_out_of_bounds", fmt.sampleRate);
  const expectedBlockAlign = fmt.channels * 2;
  if (fmt.blockAlign !== expectedBlockAlign) throw new WavAssetOperationError("wav_block_align_invalid", fmt.blockAlign);
  if (fmt.byteRate !== fmt.sampleRate * fmt.blockAlign) throw new WavAssetOperationError("wav_byte_rate_invalid", fmt.byteRate);
  if (pcm.length % fmt.blockAlign !== 0) throw new WavAssetOperationError("wav_pcm_alignment_invalid");
  return {
    channels: fmt.channels,
    sampleRate: fmt.sampleRate,
    bitsPerSample: 16,
    frameCount: pcm.length / fmt.blockAlign,
    pcm
  };
}

export function encodePcmWav({ channels, sampleRate, pcm }) {
  const channelCount = requireInteger(channels, 1, 2, "wav_channel_count_unsupported");
  const rate = requireInteger(sampleRate, 8000, 192000, "wav_sample_rate_out_of_bounds");
  if (!Buffer.isBuffer(pcm)) throw new WavAssetOperationError("wav_pcm_buffer_required");
  const blockAlign = channelCount * 2;
  if (pcm.length % blockAlign !== 0) throw new WavAssetOperationError("wav_pcm_alignment_invalid");
  const fmtSize = 16;
  const dataPad = pcm.length % 2;
  const total = 12 + 8 + fmtSize + 8 + pcm.length + dataPad;
  const out = Buffer.alloc(total);
  out.write("RIFF", 0, "ascii");
  out.writeUInt32LE(total - 8, 4);
  out.write("WAVE", 8, "ascii");
  out.write("fmt ", 12, "ascii");
  out.writeUInt32LE(fmtSize, 16);
  out.writeUInt16LE(1, 20);
  out.writeUInt16LE(channelCount, 22);
  out.writeUInt32LE(rate, 24);
  out.writeUInt32LE(rate * blockAlign, 28);
  out.writeUInt16LE(blockAlign, 32);
  out.writeUInt16LE(16, 34);
  out.write("data", 36, "ascii");
  out.writeUInt32LE(pcm.length, 40);
  pcm.copy(out, 44);
  return out;
}

function sampleAt(pcm, sampleIndex) {
  return pcm.readInt16LE(sampleIndex * 2);
}
function writeSample(pcm, sampleIndex, value) {
  pcm.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(value))), sampleIndex * 2);
}

export function normalizePcmWav(audio, { peak = 0.95 } = {}) {
  const targetPeak = Number(peak);
  if (!Number.isFinite(targetPeak) || targetPeak <= 0 || targetPeak > 1) {
    throw new WavAssetOperationError("wav_normalize_peak_invalid", peak);
  }
  const samples = audio.pcm.length / 2;
  let max = 0;
  for (let index = 0; index < samples; index += 1) max = Math.max(max, Math.abs(sampleAt(audio.pcm, index)));
  const target = Math.floor(32767 * targetPeak);
  const gain = max > 0 ? target / max : 1;
  const pcm = Buffer.alloc(audio.pcm.length);
  for (let index = 0; index < samples; index += 1) writeSample(pcm, index, sampleAt(audio.pcm, index) * gain);
  return { ...audio, pcm, gain, sourcePeak: max, targetPeak: target };
}

export function trimPcmWav(audio, { startMs = 0, endMs = null, durationMs = null } = {}) {
  const start = Number(startMs);
  if (!Number.isFinite(start) || start < 0) throw new WavAssetOperationError("wav_trim_start_invalid", startMs);
  const totalMs = audio.frameCount * 1000 / audio.sampleRate;
  let end = endMs == null ? null : Number(endMs);
  const duration = durationMs == null ? null : Number(durationMs);
  if (end !== null && (!Number.isFinite(end) || end < 0)) throw new WavAssetOperationError("wav_trim_end_invalid", endMs);
  if (duration !== null && (!Number.isFinite(duration) || duration <= 0)) throw new WavAssetOperationError("wav_trim_duration_invalid", durationMs);
  if (end !== null && duration !== null) throw new WavAssetOperationError("wav_trim_end_and_duration_mutually_exclusive");
  if (duration !== null) end = start + duration;
  if (end === null) end = totalMs;
  if (end <= start || start >= totalMs || end > totalMs + 0.001) {
    throw new WavAssetOperationError("wav_trim_range_invalid", `${start}-${end}/${totalMs}`);
  }
  const startFrame = Math.floor(start * audio.sampleRate / 1000);
  const endFrame = Math.min(audio.frameCount, Math.ceil(end * audio.sampleRate / 1000));
  const blockAlign = audio.channels * 2;
  const pcm = Buffer.from(audio.pcm.subarray(startFrame * blockAlign, endFrame * blockAlign));
  return { ...audio, pcm, frameCount: endFrame - startFrame, startFrame, endFrame };
}

export function mixPcmWavs(inputs, { gains = null, normalizePeak = 0.95 } = {}) {
  if (!Array.isArray(inputs) || inputs.length < 2) throw new WavAssetOperationError("wav_mix_requires_multiple_inputs");
  const first = inputs[0];
  if (inputs.some((input) => input.channels !== first.channels || input.sampleRate !== first.sampleRate)) {
    throw new WavAssetOperationError("wav_mix_format_mismatch");
  }
  const weights = gains == null ? inputs.map(() => 1) : gains.map(Number);
  if (weights.length !== inputs.length || weights.some((value) => !Number.isFinite(value) || value < 0 || value > 8)) {
    throw new WavAssetOperationError("wav_mix_gains_invalid");
  }
  const frameCount = Math.max(...inputs.map((input) => input.frameCount));
  const sampleCount = frameCount * first.channels;
  const pcm = Buffer.alloc(sampleCount * 2);
  for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex += 1) {
    let sum = 0;
    for (let inputIndex = 0; inputIndex < inputs.length; inputIndex += 1) {
      const input = inputs[inputIndex];
      if (sampleIndex < input.pcm.length / 2) sum += sampleAt(input.pcm, sampleIndex) * weights[inputIndex];
    }
    writeSample(pcm, sampleIndex, sum);
  }
  return normalizePcmWav({
    channels: first.channels,
    sampleRate: first.sampleRate,
    bitsPerSample: 16,
    frameCount,
    pcm
  }, { peak: normalizePeak });
}

function requireWavInputs(context, min = 1) {
  if (!Array.isArray(context.inputs) || context.inputs.length < min) {
    throw new WavAssetOperationError("wav_operation_input_count_invalid", `${context.operation.id}:${context.inputs?.length || 0}`);
  }
  return context.inputs.map((input) => ({
    ...decodePcmWav(fs.readFileSync(input.absolutePath)),
    id: input.id,
    sourcePath: input.path
  }));
}

function writeWavOutput(context, outputId, audio, metadata = null) {
  const out = context.resolveOutputPath(outputId, ".wav");
  fs.writeFileSync(out.absolutePath, encodePcmWav(audio));
  return {
    id: outputId,
    path: out.relativePath,
    mime: "audio/wav",
    metadata: {
      channels: audio.channels,
      sampleRate: audio.sampleRate,
      frameCount: audio.frameCount,
      durationMs: audio.frameCount * 1000 / audio.sampleRate,
      ...(metadata || {})
    }
  };
}

export function createDeterministicWavAssetOperationHandlers() {
  const handlers = new Map();
  handlers.set("asset.normalize_audio", async (context) => {
    const [audio] = requireWavInputs(context, 1);
    if (context.inputs.length !== 1 || context.operation.outputs.length !== 1) {
      throw new WavAssetOperationError("normalize_audio_single_io_required", context.operation.id);
    }
    const normalized = normalizePcmWav(audio, context.operation.parameters || {});
    return { outputs: [writeWavOutput(context, context.operation.outputs[0], normalized, { gain: normalized.gain })] };
  });
  handlers.set("asset.trim_audio", async (context) => {
    const [audio] = requireWavInputs(context, 1);
    if (context.inputs.length !== 1 || context.operation.outputs.length !== 1) {
      throw new WavAssetOperationError("trim_audio_single_io_required", context.operation.id);
    }
    const trimmed = trimPcmWav(audio, context.operation.parameters || {});
    return { outputs: [writeWavOutput(context, context.operation.outputs[0], trimmed, { startFrame: trimmed.startFrame, endFrame: trimmed.endFrame })] };
  });
  handlers.set("asset.mix_audio", async (context) => {
    const inputs = requireWavInputs(context, 2);
    if (context.operation.outputs.length !== 1) throw new WavAssetOperationError("mix_audio_single_output_required", context.operation.id);
    const mixed = mixPcmWavs(inputs, context.operation.parameters || {});
    return { outputs: [writeWavOutput(context, context.operation.outputs[0], mixed, { sourceIds: inputs.map((item) => item.id) })] };
  });
  return handlers;
}
