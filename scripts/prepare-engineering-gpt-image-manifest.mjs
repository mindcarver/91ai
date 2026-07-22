#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";

const rootDir = "/Users/carver/workspace/mindcarver/91ai";
const assetsRoot = path.join(rootDir, "assets/ai-coding-engineering-illustrations");
const manifestPath = path.join(assetsRoot, "gpt-image-manifest.json");

const targets = {
  "claude-code-engineering": [
    "35-background-agents-control-plane",
    "36-agent-teams",
    "37-worktree-isolation",
    "38-memory-and-enforcement",
    "39-chrome-visual-verification",
    "40-channels-external-events",
    "41-routines-goals-long-running",
    "42-skills-plugins-distribution",
    "43-headless-sdk-observability",
    "44-claude-tag-team-entrypoint",
  ],
  "codex-engineering": [
    "39-thread-history-memory-import",
    "40-multi-agent-v2",
    "41-goal-mode-long-running",
    "42-app-browser-review-visualization",
    "43-remote-handoff",
    "44-hooks-trust-lifecycle",
    "45-skills-plugins-record-replay",
    "46-app-server-json-rpc",
    "47-mcp-server-agents-sdk",
    "48-auto-review-approval-chain",
    "49-codex-security",
  ],
};

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function buildManifest() {
  const tasks = [];
  for (const [series, articles] of Object.entries(targets)) {
    for (const article of articles) {
      const articleDir = path.join(assetsRoot, series, article);
      const promptDir = path.join(articleDir, "prompts");
      const promptFiles = (await fs.readdir(promptDir))
        .filter((fileName) => /^\d{2}-.*\.md$/.test(fileName))
        .sort();

      if (promptFiles.length !== 6) {
        throw new Error(`${series}/${article}: expected 6 prompts, found ${promptFiles.length}`);
      }

      for (const promptFile of promptFiles) {
        const promptPath = path.join(promptDir, promptFile);
        const imagePath = path.join(articleDir, promptFile.replace(/\.md$/, ".png"));
        const prompt = await fs.readFile(promptPath, "utf8");
        if (!prompt.includes("style: notion") || !prompt.includes("VISIBLE LABELS")) {
          throw new Error(`${promptPath}: missing notion style or visible-label instructions`);
        }
        tasks.push({
          id: `${series}/${article}/${promptFile.replace(/\.md$/, "")}`,
          series,
          article,
          prompt: path.relative(rootDir, promptPath),
          image: path.relative(rootDir, imagePath),
          generated: await exists(imagePath),
        });
      }
    }
  }
  return { generator: "GPT Image", style: "notion", image_count: tasks.length, tasks };
}

async function main() {
  const manifest = await buildManifest();
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  const completed = manifest.tasks.filter((task) => task.generated).length;
  console.log(`Manifest: ${path.relative(rootDir, manifestPath)}`);
  console.log(`Prompts: ${manifest.tasks.length}`);
  console.log(`Generated PNG: ${completed}/${manifest.tasks.length}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
