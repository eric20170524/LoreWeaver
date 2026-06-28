import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const LORE_ROOT = path.resolve(SCRIPT_DIR, "../..");
const DOCS_DIR = path.join(LORE_ROOT, "docs_collab");

function readRequired(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing required collaboration file: ${path.relative(LORE_ROOT, filePath)}`);
  }
  return fs.readFileSync(filePath, "utf8");
}

function parseTasks(tasksText) {
  const matches = [...tasksText.matchAll(/^## (LW-\d+):\s*(.+)$/gm)];
  return matches.map((match, index) => {
    const start = match.index;
    const end = matches[index + 1]?.index ?? tasksText.length;
    return {
      id: match[1],
      title: match[2].trim(),
      body: tasksText.slice(start, end)
    };
  });
}

function fieldValue(body, fieldName) {
  const match = body.match(new RegExp(`^- ${fieldName}:\\s*(.+)$`, "m"));
  return match?.[1]?.trim() || "";
}

function assertVerifiedEvidence(task, reviewText) {
  const errors = [];

  if (!task.body.includes("- verificationEvidence:")) {
    errors.push(`${task.id} is verified but has no verificationEvidence block.`);
  }
  if (!task.body.includes("- residualRisk:")) {
    errors.push(`${task.id} is verified but has no residualRisk block.`);
  }
  if (!/result:\s*passed/.test(task.body)) {
    errors.push(`${task.id} verificationEvidence has no passed result.`);
  }
  if (!/runAt:\s*\d{4}-\d{2}-\d{2}/.test(task.body)) {
    errors.push(`${task.id} verificationEvidence has no YYYY-MM-DD runAt.`);
  }
  if (!/report:\s*/.test(task.body)) {
    errors.push(`${task.id} verificationEvidence has no report field.`);
  }
  if (!reviewText.includes(`## ${task.id}`)) {
    errors.push(`${task.id} is verified but review.md has no matching review section.`);
  }

  return errors;
}

function main() {
  const tasksPath = path.join(DOCS_DIR, "tasks.md");
  const reviewPath = path.join(DOCS_DIR, "review.md");
  const statePath = path.join(DOCS_DIR, "state.md");

  const tasksText = readRequired(tasksPath);
  const reviewText = readRequired(reviewPath);
  const stateText = readRequired(statePath);
  const tasks = parseTasks(tasksText);
  const errors = [];

  if (tasks.length === 0) {
    errors.push("tasks.md does not contain any LW-* task sections.");
  }

  const verifiedTasks = [];
  for (const task of tasks) {
    const status = fieldValue(task.body, "status");
    if (!status) {
      errors.push(`${task.id} has no status field.`);
      continue;
    }

    if (status === "verified") {
      verifiedTasks.push(task.id);
      errors.push(...assertVerifiedEvidence(task, reviewText));
    }
  }

  if (verifiedTasks.length === tasks.length && !/currentTask:\s*`?none`?/m.test(stateText)) {
    errors.push("All tasks are verified, but state.md currentTask is not none.");
  }

  if (errors.length > 0) {
    console.error("Docs collaboration evidence check failed:");
    for (const error of errors) {
      console.error(`- ${error}`);
    }
    process.exit(1);
  }

  console.log(`Docs collaboration evidence check passed: ${verifiedTasks.length}/${tasks.length} tasks verified with evidence.`);
}

main();
