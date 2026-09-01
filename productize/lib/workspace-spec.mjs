import fs from "node:fs";
import path from "node:path";

function readJson(filePath, label = filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new Error(`Failed to read ${label}: ${error instanceof Error ? error.message : error}`);
  }
}

/**
 * Assemble the authoring GameSpec from canonical workspace artifacts.
 * This is shared by release policy and the standalone exporter so both make
 * decisions against the same inputs.
 */
export function assembleWorkspaceSpec(workspacePath) {
  const manifestPath = path.join(workspacePath, "manifest.json");
  if (!fs.existsSync(manifestPath)) throw new Error("manifest.json missing");
  const source = readJson(manifestPath, "workspace manifest");

  const nodesDir = path.join(workspacePath, "loreweaver/nodes");
  if (fs.existsSync(nodesDir)) {
    const nodeFiles = fs.readdirSync(nodesDir)
      .filter((name) => name.endsWith(".json"))
      .sort();
    if (nodeFiles.length) {
      source.nodes = nodeFiles.map((name) => readJson(path.join(nodesDir, name), `node artifact ${name}`));
      source.nodes.sort((a, b) => Number(a.id || 0) - Number(b.id || 0));
    }
  }

  const catalogsDir = path.join(workspacePath, "loreweaver/catalogs");
  if (fs.existsSync(catalogsDir)) {
    for (const name of fs.readdirSync(catalogsDir).filter((item) => item.endsWith(".json")).sort()) {
      source[name.slice(0, -5)] = readJson(path.join(catalogsDir, name), `catalog ${name}`);
    }
  }
  return source;
}
