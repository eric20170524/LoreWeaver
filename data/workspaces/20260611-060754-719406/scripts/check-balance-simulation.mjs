import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(SCRIPT_DIR, '..');
const CONFIG_PATH = path.join(ROOT_DIR, 'loreweaver', 'balance-simulation-config.json');

if (!fs.existsSync(CONFIG_PATH)) {
  console.error('Balance simulation config missing.');
  process.exit(1);
}

try {
  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  if (config.schemaVersion !== 'loreweaver.balance-simulation-config.v1') {
      throw new Error('Invalid schema version');
  }
  if (!config.thresholds || typeof config.thresholds.minimumBossTtkSeconds !== 'number') {
      throw new Error('Invalid thresholds config');
  }
} catch (e) {
  console.error('Invalid JSON or schema in balance config: ' + e.message);
  process.exit(1);
}

console.log('Balance simulation self-check passed.');
