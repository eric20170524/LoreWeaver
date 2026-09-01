#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  createBuiltinAssetOperationHandlers,
  executeAssetRecipe
} from "../lib/asset-operation-executor.mjs";
import {
  createDeterministicPngAssetOperationHandlers,
  decodePng,
  encodePng
} from "../lib/png-asset-operations.mjs";

function assert(value, message) {
  if (!value) throw new Error(message);
}

async function expectError(fn, contains) {
  try {
    await fn();
  } catch (error) {
    assert(String(error?.message || error).includes(contains), `expected '${contains}', got '${error?.message || error}'`);
    return;
  }
  throw new Error(`expected error containing: ${contains}`);
}

function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function setPixel(rgba, width, x, y, [r, g, b, a = 255]) {
  const index = (y * width + x) * 4;
  rgba[index] = r;
  rgba[index + 1] = g;
  rgba[index + 2] = b;
  rgba[index + 3] = a;
}

function pixel(image, x, y) {
  const index = (y * image.width + x) * 4;
  return [...image.rgba.subarray(index, index + 4)];
}

function handlers() {
  const merged = createBuiltinAssetOperationHandlers();
  for (const [port, handler] of createDeterministicPngAssetOperationHandlers()) merged.set(port, handler);
  return merged;
}

function recipe(sourceHash) {
  return {
    schemaVersion: "loreweaver.asset-recipe.v1",
    id: "png-port-fixture",
    title: "Deterministic PNG Port Fixture",
    status: "candidate",
    assetKind: "atlas",
    source: {
      mode: "procedural",
      provider: "deterministic-test-fixture",
      model: null,
      license: "test-original",
      rawPrompt: "Two colored blocks on explicit white background.",
      negativePrompt: null,
      references: [],
      rawArtifacts: [
        {
          id: "raw-sheet",
          path: "assets/source/raw-sheet.png",
          sha256: sourceHash,
          license: "test-original",
          mime: "image/png"
        }
      ],
      notes: []
    },
    operations: [
      {
        id: "remove-white",
        type: "remove_background",
        port: "asset.remove_background",
        provider: "deterministic-png",
        model: null,
        inputs: ["raw-sheet"],
        outputs: ["transparent-sheet"],
        parameters: { backgroundColor: [255, 255, 255], tolerance: 0 }
      },
      {
        id: "cut-sprites",
        type: "cut_frames",
        port: "asset.cut_frames",
        provider: "deterministic-png",
        model: null,
        inputs: ["transparent-sheet"],
        outputs: ["red-frame", "blue-frame"],
        parameters: {
          frames: [
            { id: "red-frame", x: 0, y: 0, w: 2, h: 2 },
            { id: "blue-frame", x: 4, y: 0, w: 2, h: 2 }
          ]
        }
      },
      {
        id: "clean-red",
        type: "edge_cleanup",
        port: "asset.edge_cleanup",
        provider: "deterministic-png",
        model: null,
        inputs: ["red-frame"],
        outputs: ["red-clean"],
        parameters: { alphaThreshold: 8 }
      },
      {
        id: "upscale-blue",
        type: "upscale",
        port: "asset.upscale",
        provider: "deterministic-png",
        model: null,
        inputs: ["blue-frame"],
        outputs: ["blue-upscaled"],
        parameters: { scale: 2 }
      },
      {
        id: "concat-preview",
        type: "concatenate",
        port: "asset.concatenate",
        provider: "deterministic-png",
        model: null,
        inputs: ["red-clean", "blue-frame"],
        outputs: ["strip-preview"],
        parameters: { direction: "horizontal", padding: 2, background: [0, 0, 0, 0] }
      },
      {
        id: "build-atlas",
        type: "build_atlas",
        port: "asset.build_atlas",
        provider: "deterministic-png",
        model: null,
        inputs: ["red-clean", "blue-frame"],
        outputs: ["runtime-atlas"],
        parameters: { columns: 2, padding: 1, background: [0, 0, 0, 0] }
      }
    ],
    outputs: {
      manifestPath: "assets/imagegen/manifest.json",
      finalAssets: [
        {
          key: "runtime-atlas",
          path: "loreweaver/asset-recipe-execution/png-port-fixture/build-atlas/runtime-atlas.png",
          sha256: "0".repeat(64),
          bytes: 1,
          mime: "image/png",
          usedByRuntime: false,
          usageRefs: []
        }
      ],
      finalManifestKeys: ["runtime-atlas"]
    },
    verification: [],
    promotion: {
      approvedBy: null,
      approvedAt: null,
      destination: null,
      conflictChecked: false
    }
  };
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), "lw-png-ports-"));
try {
  const width = 6;
  const height = 2;
  const rgba = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (x < 2) setPixel(rgba, width, x, y, [240, 40, 40, 255]);
      else if (x >= 4) setPixel(rgba, width, x, y, [30, 80, 240, 255]);
      else setPixel(rgba, width, x, y, [255, 255, 255, 255]);
    }
  }
  const raw = encodePng({ width, height, rgba });
  const sourceDir = path.join(root, "assets/source");
  fs.mkdirSync(sourceDir, { recursive: true });
  fs.writeFileSync(path.join(sourceDir, "raw-sheet.png"), raw);
  const sourceHash = sha256(raw);

  const firstRecipe = recipe(sourceHash);
  const first = await executeAssetRecipe({
    recipe: firstRecipe,
    workspaceDir: root,
    handlers: handlers(),
    enforceDeclaredFinalIdentity: false,
    reportPath: "reports/png-port-execution.json"
  });
  assert(first.status === "passed" && first.operationCount === 6, "all deterministic PNG operations execute in recipe order");

  const transparentPath = first.operations.find((item) => item.id === "remove-white").outputs[0].path;
  const transparent = decodePng(fs.readFileSync(path.join(root, transparentPath)));
  assert(pixel(transparent, 2, 0)[3] === 0 && pixel(transparent, 3, 1)[3] === 0, "explicit white background is actually made transparent");
  assert(pixel(transparent, 0, 0)[3] === 255 && pixel(transparent, 5, 1)[3] === 255, "foreground colors remain opaque");

  const redPath = first.operations.find((item) => item.id === "cut-sprites").outputs.find((output) => output.id === "red-frame").path;
  const bluePath = first.operations.find((item) => item.id === "cut-sprites").outputs.find((output) => output.id === "blue-frame").path;
  const red = decodePng(fs.readFileSync(path.join(root, redPath)));
  const blue = decodePng(fs.readFileSync(path.join(root, bluePath)));
  assert(red.width === 2 && red.height === 2 && pixel(red, 1, 1)[0] === 240, "cut_frames produces the requested red rectangle");
  assert(blue.width === 2 && blue.height === 2 && pixel(blue, 0, 0)[2] === 240, "cut_frames produces the requested blue rectangle");

  const upscaledPath = first.operations.find((item) => item.id === "upscale-blue").outputs[0].path;
  const upscaled = decodePng(fs.readFileSync(path.join(root, upscaledPath)));
  assert(upscaled.width === 4 && upscaled.height === 4, "nearest-neighbor upscale changes real output dimensions");
  assert(pixel(upscaled, 3, 3)[2] === 240, "nearest-neighbor upscale preserves source pixels");

  const stripPath = first.operations.find((item) => item.id === "concat-preview").outputs[0].path;
  const strip = decodePng(fs.readFileSync(path.join(root, stripPath)));
  assert(strip.width === 6 && strip.height === 2, "horizontal concatenate respects explicit padding");
  assert(pixel(strip, 2, 0)[3] === 0 && pixel(strip, 3, 1)[3] === 0, "concatenate padding remains transparent");

  const atlas = decodePng(fs.readFileSync(path.join(root, first.finalAssets[0].path)));
  assert(atlas.width === 5 && atlas.height === 2, "atlas uses deterministic cells and padding");
  assert(pixel(atlas, 0, 0)[0] === 240 && pixel(atlas, 3, 0)[2] === 240, "atlas places inputs deterministically");
  assert(pixel(atlas, 2, 0)[3] === 0, "atlas padding is transparent");

  // Candidate observation becomes a strict exact-identity replay after hashes are recorded.
  const strictRecipe = recipe(sourceHash);
  strictRecipe.outputs.finalAssets[0].sha256 = first.finalAssets[0].sha256;
  strictRecipe.outputs.finalAssets[0].bytes = first.finalAssets[0].bytes;
  const strict = await executeAssetRecipe({
    recipe: strictRecipe,
    workspaceDir: root,
    handlers: handlers(),
    enforceDeclaredFinalIdentity: true
  });
  assert(strict.finalAssets[0].sha256 === first.finalAssets[0].sha256, "deterministic PNG replay reproduces exact atlas SHA-256");
  assert(strict.finalAssets[0].bytes === first.finalAssets[0].bytes, "deterministic PNG replay reproduces exact atlas byte size");

  const invalidRect = recipe(sourceHash);
  invalidRect.operations.find((item) => item.id === "cut-sprites").parameters.frames[1].x = 5;
  await expectError(
    () => executeAssetRecipe({ recipe: invalidRect, workspaceDir: root, handlers: handlers(), enforceDeclaredFinalIdentity: false }),
    "png_frame_rect_invalid"
  );

  // VLM remains an explicit external-provider port; the deterministic image layer
  // must never masquerade as a real visual model.
  const vlmRecipe = recipe(sourceHash);
  vlmRecipe.id = "vlm-port-missing";
  vlmRecipe.operations = [
    {
      id: "vlm-review",
      type: "manual_review",
      port: "asset.vlm",
      provider: "real-vlm-required",
      model: null,
      inputs: ["raw-sheet"],
      outputs: ["runtime-atlas"],
      parameters: {}
    }
  ];
  vlmRecipe.outputs.finalAssets[0].path = "loreweaver/asset-recipe-execution/vlm-port-missing/vlm-review/runtime-atlas.png";
  await expectError(
    () => executeAssetRecipe({ recipe: vlmRecipe, workspaceDir: root, handlers: handlers(), enforceDeclaredFinalIdentity: false }),
    "asset_operation_port_unregistered"
  );

  console.log(JSON.stringify({
    schemaVersion: "loreweaver.png-asset-operations-check.v1",
    status: "passed",
    sourceHash,
    finalAtlasHash: first.finalAssets[0].sha256,
    finalAtlasBytes: first.finalAssets[0].bytes,
    checks: [
      "rgba_png_codec_round_trips_real_pixels",
      "explicit_color_key_background_removal",
      "deterministic_cut_frames",
      "alpha_edge_cleanup_port_executes",
      "nearest_neighbor_upscale",
      "deterministic_concatenate_with_padding",
      "deterministic_atlas_build",
      "strict_replay_reproduces_exact_hash_and_bytes",
      "invalid_frame_rect_fails_closed",
      "vlm_port_remains_unregistered_without_real_provider"
    ]
  }, null, 2));
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
