import fs from "node:fs";
import zlib from "node:zlib";

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const MAX_PIXELS = 16_777_216;

export class PngAssetOperationError extends Error {
  constructor(reason, detail = null) {
    super(detail ? `${reason}:${detail}` : reason);
    this.name = "PngAssetOperationError";
    this.reason = reason;
    this.detail = detail;
  }
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data = Buffer.alloc(0)) {
  const typeBuffer = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crcBuffer = Buffer.alloc(4);
  crcBuffer.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crcBuffer]);
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

function channelsForColorType(colorType) {
  if (colorType === 0) return 1;
  if (colorType === 2) return 3;
  if (colorType === 4) return 2;
  if (colorType === 6) return 4;
  throw new PngAssetOperationError("png_color_type_unsupported", colorType);
}

export function decodePng(buffer, { maxPixels = MAX_PIXELS } = {}) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 33 || !buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new PngAssetOperationError("png_signature_invalid");
  }
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  const idat = [];
  let seenIhdr = false;
  let seenIend = false;

  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString("ascii");
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    const crcEnd = dataEnd + 4;
    if (crcEnd > buffer.length) throw new PngAssetOperationError("png_chunk_truncated", type);
    const data = buffer.subarray(dataStart, dataEnd);
    const expectedCrc = buffer.readUInt32BE(dataEnd);
    const actualCrc = crc32(Buffer.concat([Buffer.from(type, "ascii"), data]));
    if (expectedCrc !== actualCrc) throw new PngAssetOperationError("png_chunk_crc_invalid", type);

    if (type === "IHDR") {
      if (length !== 13 || seenIhdr) throw new PngAssetOperationError("png_ihdr_invalid");
      seenIhdr = true;
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      const compression = data[10];
      const filter = data[11];
      interlace = data[12];
      if (!width || !height || width * height > maxPixels) throw new PngAssetOperationError("png_dimensions_out_of_bounds", `${width}x${height}`);
      if (bitDepth !== 8) throw new PngAssetOperationError("png_bit_depth_unsupported", bitDepth);
      if (compression !== 0 || filter !== 0 || interlace !== 0) throw new PngAssetOperationError("png_encoding_mode_unsupported", `${compression}/${filter}/${interlace}`);
      channelsForColorType(colorType);
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "IEND") {
      seenIend = true;
      break;
    }
    offset = crcEnd;
  }
  if (!seenIhdr || !seenIend || idat.length === 0) throw new PngAssetOperationError("png_required_chunks_missing");

  const channels = channelsForColorType(colorType);
  const bytesPerPixel = channels;
  const rowBytes = width * channels;
  let raw;
  try {
    raw = zlib.inflateSync(Buffer.concat(idat), { maxOutputLength: (rowBytes + 1) * height });
  } catch (error) {
    throw new PngAssetOperationError("png_inflate_failed", error?.message || String(error));
  }
  if (raw.length !== (rowBytes + 1) * height) throw new PngAssetOperationError("png_scanline_length_invalid", raw.length);

  const decoded = Buffer.alloc(rowBytes * height);
  let src = 0;
  for (let y = 0; y < height; y += 1) {
    const filterType = raw[src++];
    const rowStart = y * rowBytes;
    const previousRowStart = (y - 1) * rowBytes;
    for (let x = 0; x < rowBytes; x += 1) {
      const rawByte = raw[src++];
      const left = x >= bytesPerPixel ? decoded[rowStart + x - bytesPerPixel] : 0;
      const up = y > 0 ? decoded[previousRowStart + x] : 0;
      const upLeft = y > 0 && x >= bytesPerPixel ? decoded[previousRowStart + x - bytesPerPixel] : 0;
      let value;
      if (filterType === 0) value = rawByte;
      else if (filterType === 1) value = (rawByte + left) & 0xff;
      else if (filterType === 2) value = (rawByte + up) & 0xff;
      else if (filterType === 3) value = (rawByte + Math.floor((left + up) / 2)) & 0xff;
      else if (filterType === 4) value = (rawByte + paeth(left, up, upLeft)) & 0xff;
      else throw new PngAssetOperationError("png_filter_unsupported", filterType);
      decoded[rowStart + x] = value;
    }
  }

  const rgba = Buffer.alloc(width * height * 4);
  for (let index = 0, out = 0; index < decoded.length; index += channels, out += 4) {
    if (colorType === 6) {
      rgba[out] = decoded[index]; rgba[out + 1] = decoded[index + 1]; rgba[out + 2] = decoded[index + 2]; rgba[out + 3] = decoded[index + 3];
    } else if (colorType === 2) {
      rgba[out] = decoded[index]; rgba[out + 1] = decoded[index + 1]; rgba[out + 2] = decoded[index + 2]; rgba[out + 3] = 255;
    } else if (colorType === 0) {
      rgba[out] = decoded[index]; rgba[out + 1] = decoded[index]; rgba[out + 2] = decoded[index]; rgba[out + 3] = 255;
    } else if (colorType === 4) {
      rgba[out] = decoded[index]; rgba[out + 1] = decoded[index]; rgba[out + 2] = decoded[index]; rgba[out + 3] = decoded[index + 1];
    }
  }
  return { width, height, rgba, bitDepth, colorType, interlace };
}

export function encodePng({ width, height, rgba }) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0 || width * height > MAX_PIXELS) {
    throw new PngAssetOperationError("png_encode_dimensions_invalid", `${width}x${height}`);
  }
  if (!Buffer.isBuffer(rgba) || rgba.length !== width * height * 4) {
    throw new PngAssetOperationError("png_encode_rgba_length_invalid", rgba?.length);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const scanlines = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (width * 4 + 1);
    scanlines[rowStart] = 0;
    rgba.copy(scanlines, rowStart + 1, y * width * 4, (y + 1) * width * 4);
  }
  const compressed = zlib.deflateSync(scanlines, { level: 9 });
  return Buffer.concat([
    PNG_SIGNATURE,
    chunk("IHDR", ihdr),
    chunk("IDAT", compressed),
    chunk("IEND")
  ]);
}

function assertRect(image, rect, id) {
  const x = Number(rect?.x);
  const y = Number(rect?.y);
  const w = Number(rect?.w ?? rect?.width);
  const h = Number(rect?.h ?? rect?.height);
  if (![x, y, w, h].every(Number.isInteger) || x < 0 || y < 0 || w <= 0 || h <= 0 || x + w > image.width || y + h > image.height) {
    throw new PngAssetOperationError("png_frame_rect_invalid", `${id}:${x},${y},${w},${h}`);
  }
  return { x, y, w, h };
}

export function cropPngImage(image, rect, id = "frame") {
  const { x, y, w, h } = assertRect(image, rect, id);
  const rgba = Buffer.alloc(w * h * 4);
  for (let row = 0; row < h; row += 1) {
    const srcStart = ((y + row) * image.width + x) * 4;
    const dstStart = row * w * 4;
    image.rgba.copy(rgba, dstStart, srcStart, srcStart + w * 4);
  }
  return { width: w, height: h, rgba };
}

function normalizedColor(value, fallback) {
  const source = Array.isArray(value) ? value : fallback;
  if (!Array.isArray(source) || source.length < 3) throw new PngAssetOperationError("png_color_invalid");
  return [0, 1, 2, 3].map((index) => {
    const raw = index < source.length ? Number(source[index]) : (index === 3 ? 255 : 0);
    if (!Number.isInteger(raw) || raw < 0 || raw > 255) throw new PngAssetOperationError("png_color_channel_invalid", raw);
    return raw;
  });
}

export function alphaCleanupImage(image, threshold = 8) {
  const alphaThreshold = Number(threshold);
  if (!Number.isInteger(alphaThreshold) || alphaThreshold < 0 || alphaThreshold > 255) {
    throw new PngAssetOperationError("alpha_threshold_invalid", threshold);
  }
  const rgba = Buffer.from(image.rgba);
  let removedPixels = 0;
  for (let index = 0; index < rgba.length; index += 4) {
    if (rgba[index + 3] <= alphaThreshold) {
      if (rgba[index + 3] !== 0 || rgba[index] !== 0 || rgba[index + 1] !== 0 || rgba[index + 2] !== 0) removedPixels += 1;
      rgba[index] = 0; rgba[index + 1] = 0; rgba[index + 2] = 0; rgba[index + 3] = 0;
    }
  }
  return { width: image.width, height: image.height, rgba, removedPixels };
}

export function removeBackgroundByColor(image, color, tolerance = 0) {
  const [r, g, b] = normalizedColor(color, [255, 255, 255, 255]);
  const t = Number(tolerance);
  if (!Number.isFinite(t) || t < 0 || t > 255) throw new PngAssetOperationError("background_tolerance_invalid", tolerance);
  const rgba = Buffer.from(image.rgba);
  let removedPixels = 0;
  for (let index = 0; index < rgba.length; index += 4) {
    const distance = Math.max(Math.abs(rgba[index] - r), Math.abs(rgba[index + 1] - g), Math.abs(rgba[index + 2] - b));
    if (distance <= t) {
      rgba[index] = 0; rgba[index + 1] = 0; rgba[index + 2] = 0; rgba[index + 3] = 0;
      removedPixels += 1;
    }
  }
  return { width: image.width, height: image.height, rgba, removedPixels };
}

export function upscaleNearest(image, scale) {
  const factor = Number(scale);
  if (!Number.isInteger(factor) || factor < 1 || factor > 8) throw new PngAssetOperationError("upscale_factor_invalid", scale);
  const width = image.width * factor;
  const height = image.height * factor;
  if (width * height > MAX_PIXELS) throw new PngAssetOperationError("upscale_dimensions_too_large", `${width}x${height}`);
  const rgba = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const srcX = Math.floor(x / factor);
      const srcY = Math.floor(y / factor);
      const src = (srcY * image.width + srcX) * 4;
      const dst = (y * width + x) * 4;
      image.rgba.copy(rgba, dst, src, src + 4);
    }
  }
  return { width, height, rgba };
}

function blit(target, source, offsetX, offsetY) {
  for (let y = 0; y < source.height; y += 1) {
    const srcStart = y * source.width * 4;
    const dstStart = ((offsetY + y) * target.width + offsetX) * 4;
    source.rgba.copy(target.rgba, dstStart, srcStart, srcStart + source.width * 4);
  }
}

export function concatenateImages(images, { direction = "horizontal", padding = 0, background = [0, 0, 0, 0] } = {}) {
  if (!Array.isArray(images) || images.length === 0) throw new PngAssetOperationError("concatenate_inputs_required");
  const gap = Number(padding);
  if (!Number.isInteger(gap) || gap < 0 || gap > 512) throw new PngAssetOperationError("concatenate_padding_invalid", padding);
  const horizontal = direction === "horizontal";
  if (!horizontal && direction !== "vertical") throw new PngAssetOperationError("concatenate_direction_invalid", direction);
  const width = horizontal ? images.reduce((sum, image) => sum + image.width, 0) + gap * (images.length - 1) : Math.max(...images.map((image) => image.width));
  const height = horizontal ? Math.max(...images.map((image) => image.height)) : images.reduce((sum, image) => sum + image.height, 0) + gap * (images.length - 1);
  if (width * height > MAX_PIXELS) throw new PngAssetOperationError("concatenate_dimensions_too_large", `${width}x${height}`);
  const [r, g, b, a] = normalizedColor(background, [0, 0, 0, 0]);
  const rgba = Buffer.alloc(width * height * 4);
  for (let index = 0; index < rgba.length; index += 4) {
    rgba[index] = r; rgba[index + 1] = g; rgba[index + 2] = b; rgba[index + 3] = a;
  }
  const target = { width, height, rgba };
  let cursor = 0;
  for (const image of images) {
    const x = horizontal ? cursor : 0;
    const y = horizontal ? 0 : cursor;
    blit(target, image, x, y);
    cursor += (horizontal ? image.width : image.height) + gap;
  }
  return target;
}

export function buildAtlas(images, { columns = null, padding = 0, background = [0, 0, 0, 0] } = {}) {
  if (!Array.isArray(images) || images.length === 0) throw new PngAssetOperationError("atlas_inputs_required");
  const cols = columns == null ? Math.ceil(Math.sqrt(images.length)) : Number(columns);
  const gap = Number(padding);
  if (!Number.isInteger(cols) || cols < 1 || cols > images.length) throw new PngAssetOperationError("atlas_columns_invalid", columns);
  if (!Number.isInteger(gap) || gap < 0 || gap > 512) throw new PngAssetOperationError("atlas_padding_invalid", padding);
  const cellWidth = Math.max(...images.map((image) => image.width));
  const cellHeight = Math.max(...images.map((image) => image.height));
  const rows = Math.ceil(images.length / cols);
  const width = cols * cellWidth + Math.max(0, cols - 1) * gap;
  const height = rows * cellHeight + Math.max(0, rows - 1) * gap;
  if (width * height > MAX_PIXELS) throw new PngAssetOperationError("atlas_dimensions_too_large", `${width}x${height}`);
  const [r, g, b, a] = normalizedColor(background, [0, 0, 0, 0]);
  const rgba = Buffer.alloc(width * height * 4);
  for (let index = 0; index < rgba.length; index += 4) {
    rgba[index] = r; rgba[index + 1] = g; rgba[index + 2] = b; rgba[index + 3] = a;
  }
  const target = { width, height, rgba };
  const frames = {};
  images.forEach((image, index) => {
    const col = index % cols;
    const row = Math.floor(index / cols);
    const x = col * (cellWidth + gap);
    const y = row * (cellHeight + gap);
    blit(target, image, x, y);
    frames[image.id || `frame_${index}`] = { x, y, w: image.width, h: image.height };
  });
  return { ...target, frames };
}

function requirePngInput(context, count = 1) {
  if (context.inputs.length < count) throw new PngAssetOperationError("png_operation_input_count_invalid", `${context.operation.id}:${context.inputs.length}`);
  return context.inputs.map((input) => ({
    ...decodePng(fs.readFileSync(input.absolutePath)),
    id: input.id,
    sourcePath: input.path
  }));
}

function writePngOutput(context, outputId, image, metadata = null) {
  const out = context.resolveOutputPath(outputId, ".png");
  fs.writeFileSync(out.absolutePath, encodePng(image));
  return { id: outputId, path: out.relativePath, mime: "image/png", metadata };
}

function frameDefinitions(context) {
  const frames = context.operation.parameters?.frames;
  if (!Array.isArray(frames) || frames.length === 0) throw new PngAssetOperationError("cut_frames_parameters_required", context.operation.id);
  const byId = new Map(frames.map((frame) => [String(frame.id || ""), frame]));
  return context.operation.outputs.map((outputId) => {
    const frame = byId.get(outputId);
    if (!frame) throw new PngAssetOperationError("cut_frame_definition_missing", `${context.operation.id}:${outputId}`);
    return frame;
  });
}

export function createDeterministicPngAssetOperationHandlers() {
  const handlers = new Map();

  const cutHandler = async (context) => {
    const [image] = requirePngInput(context, 1);
    if (context.inputs.length !== 1) throw new PngAssetOperationError("cut_frames_requires_single_input", context.operation.id);
    const definitions = frameDefinitions(context);
    return {
      outputs: definitions.map((frame, index) => {
        const outputId = context.operation.outputs[index];
        const cropped = cropPngImage(image, frame, outputId);
        return writePngOutput(context, outputId, cropped, { sourceFrame: { x: frame.x, y: frame.y, w: frame.w ?? frame.width, h: frame.h ?? frame.height } });
      })
    };
  };
  handlers.set("asset.cut_frames", cutHandler);
  handlers.set("asset.decompose", cutHandler);

  handlers.set("asset.remove_background", async (context) => {
    const [image] = requirePngInput(context, 1);
    if (context.inputs.length !== 1 || context.operation.outputs.length !== 1) throw new PngAssetOperationError("remove_background_single_io_required", context.operation.id);
    const result = removeBackgroundByColor(image, context.operation.parameters?.backgroundColor, context.operation.parameters?.tolerance ?? 0);
    return { outputs: [writePngOutput(context, context.operation.outputs[0], result, { removedPixels: result.removedPixels, method: "explicit_color_key" })] };
  });

  const cleanup = async (context) => {
    const [image] = requirePngInput(context, 1);
    if (context.inputs.length !== 1 || context.operation.outputs.length !== 1) throw new PngAssetOperationError("alpha_cleanup_single_io_required", context.operation.id);
    const result = alphaCleanupImage(image, context.operation.parameters?.alphaThreshold ?? 8);
    return { outputs: [writePngOutput(context, context.operation.outputs[0], result, { removedPixels: result.removedPixels })] };
  };
  handlers.set("asset.alpha_cleanup", cleanup);
  handlers.set("asset.edge_cleanup", cleanup);

  handlers.set("asset.upscale", async (context) => {
    const [image] = requirePngInput(context, 1);
    if (context.inputs.length !== 1 || context.operation.outputs.length !== 1) throw new PngAssetOperationError("upscale_single_io_required", context.operation.id);
    const result = upscaleNearest(image, context.operation.parameters?.scale ?? 2);
    return { outputs: [writePngOutput(context, context.operation.outputs[0], result, { method: "nearest_neighbor", scale: context.operation.parameters?.scale ?? 2 })] };
  });

  handlers.set("asset.concatenate", async (context) => {
    const images = requirePngInput(context, 1);
    if (context.operation.outputs.length !== 1) throw new PngAssetOperationError("concatenate_single_output_required", context.operation.id);
    const result = concatenateImages(images, context.operation.parameters || {});
    return { outputs: [writePngOutput(context, context.operation.outputs[0], result, { inputIds: images.map((image) => image.id) })] };
  });

  handlers.set("asset.build_atlas", async (context) => {
    const images = requirePngInput(context, 1);
    if (context.operation.outputs.length !== 1) throw new PngAssetOperationError("build_atlas_single_output_required", context.operation.id);
    const result = buildAtlas(images, context.operation.parameters || {});
    return { outputs: [writePngOutput(context, context.operation.outputs[0], result, { frames: result.frames })] };
  });

  handlers.set("asset.convert", async (context) => {
    const [image] = requirePngInput(context, 1);
    if (context.inputs.length !== 1 || context.operation.outputs.length !== 1) throw new PngAssetOperationError("convert_single_io_required", context.operation.id);
    return { outputs: [writePngOutput(context, context.operation.outputs[0], image, { format: "png_rgba8" })] };
  });

  return handlers;
}
