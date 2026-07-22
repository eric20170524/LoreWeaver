import { defineConfig, Plugin } from "vite";
import path from "node:path";
import fs from "node:fs";

function safeScriptJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

function embeddedRuntimeSpecPlugin(): Plugin {
  return {
    name: "loreweaver-embedded-runtime-spec",
    transformIndexHtml(html) {
      const specPath = process.env.LOREWEAVER_RUNTIME_SPEC_PATH;
      if (!specPath || !fs.existsSync(specPath)) {
        throw new Error("LOREWEAVER_RUNTIME_SPEC_PATH must point to a compiled runtime spec");
      }
      const resolvedSpec = JSON.parse(fs.readFileSync(specPath, "utf8"));
      return html.replace("__LOREWEAVER_RUNTIME_SPEC_JSON__", safeScriptJson(resolvedSpec));
    }
  };
}

export default defineConfig({
  root: path.resolve(__dirname, "productize/standalone"),
  base: "./",
  plugins: [embeddedRuntimeSpecPlugin()],
  build: {
    target: "es2022",
    emptyOutDir: true,
    outDir: process.env.LOREWEAVER_STANDALONE_OUT_DIR
      ? path.resolve(process.env.LOREWEAVER_STANDALONE_OUT_DIR)
      : path.resolve(__dirname, "productize/standalone-dist")
  }
});
