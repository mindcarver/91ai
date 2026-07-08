#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";

const rootDir = "/Users/carver/workspace/mindcarver/91ai";
const seriesDir = path.join(rootDir, "docs/ai-coding/claude-code-engineering");
const publishRoot = path.join(rootDir, "post-to-wechat/claude-code-engineering");
const wechatApiScript = "/Users/carver/.agents/skills/carver-post-to-wechat/scripts/wechat-api.ts";
const articlePattern = /^\d{2}-.*\.md$/;
const imageRefPattern = /!\[[^\]]*]\(([^)]+)\)/g;

function normalizeText(value) {
  return value.replace(/\s+/g, " ").trim();
}

function parseTitle(content) {
  const line = content.split(/\r?\n/).find((item) => item.startsWith("# "));
  return line ? normalizeText(line.slice(2)) : "";
}

function parseSummary(content) {
  const lines = content.split(/\r?\n/);
  for (const line of lines) {
    const match = line.match(/^\*\*TL;DR[：:]\*\*\s*(.+)$/);
    if (match) return normalizeText(match[1]);
  }

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith("<!--")) continue;
    if (trimmed.startsWith("<")) continue;
    if (trimmed.startsWith("#")) continue;
    if (trimmed.startsWith("![")) continue;
    if (trimmed.startsWith("**「阿新聊 AI」")) continue;
    return normalizeText(trimmed.replace(/^\*\*|\*\*$/g, ""));
  }

  return "";
}

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

function runOrThrow(cmd, args, options = {}) {
  const result = spawnSync(cmd, args, {
    encoding: "utf8",
    ...options,
  });
  if (result.status !== 0) {
    throw new Error(`${cmd} ${args.join(" ")} failed\nstdout:\n${result.stdout || ""}\nstderr:\n${result.stderr || ""}`);
  }
  return result;
}

async function convertOrCopyImage(sourcePath, destPath) {
  await ensureDir(path.dirname(destPath));
  const ext = path.extname(sourcePath).toLowerCase();
  if (ext === ".svg") {
    runOrThrow("/opt/homebrew/bin/rsvg-convert", [sourcePath, "-o", destPath]);
    return;
  }
  await fs.copyFile(sourcePath, destPath);
}

async function prepareArticle(articlePath) {
  const original = await fs.readFile(articlePath, "utf8");
  const articleName = path.basename(articlePath);
  const slug = articleName.replace(/\.md$/, "");
  const outDir = path.join(publishRoot, slug);
  await ensureDir(outDir);

  let rewritten = original;
  const seen = new Map();
  const replacements = [];
  let match;

  while ((match = imageRefPattern.exec(original)) !== null) {
    const rawRef = match[1];
    if (/^(https?:|data:)/i.test(rawRef)) continue;
    if (seen.has(rawRef)) continue;
    seen.set(rawRef, true);

    const sourcePath = path.resolve(path.dirname(articlePath), rawRef);
    const sourceExt = path.extname(sourcePath).toLowerCase();
    const destExt = sourceExt === ".svg" ? ".png" : sourceExt;
    const destRel = path.posix.join("media", `${String(replacements.length + 1).padStart(2, "0")}-${path.basename(sourcePath, sourceExt)}${destExt}`);
    const destPath = path.join(outDir, destRel);
    await convertOrCopyImage(sourcePath, destPath);
    replacements.push({ rawRef, destRel });
  }

  for (const item of replacements) {
    rewritten = rewritten.split(`](${item.rawRef})`).join(`](${item.destRel})`);
  }

  const markdownPath = path.join(outDir, articleName);
  await fs.writeFile(markdownPath, rewritten, "utf8");

  const refs = [...rewritten.matchAll(imageRefPattern)]
    .map((item) => item[1])
    .filter((item) => !/^(https?:|data:)/i.test(item));
  const coverRef = refs[0] || "";

  return {
    articleName,
    slug,
    markdownPath,
    title: parseTitle(rewritten),
    summary: parseSummary(rewritten),
    coverPath: coverRef ? path.resolve(outDir, coverRef) : "",
  };
}

function runWechatPublish(prepared, { dryRun = false } = {}) {
  const args = [
    "run",
    wechatApiScript,
    prepared.markdownPath,
    "--theme",
    "default",
  ];

  if (prepared.summary) {
    args.push("--summary", prepared.summary);
  }
  if (prepared.coverPath) {
    args.push("--cover", prepared.coverPath);
  }
  if (dryRun) {
    args.push("--dry-run");
  }

  const result = runOrThrow("bun", args, {
    cwd: rootDir,
  });

  const stdout = (result.stdout || "").trim();
  if (!stdout) return { raw: stdout };
  return JSON.parse(stdout);
}

async function main() {
  const onlyArgIndex = process.argv.indexOf("--only");
  const onlyValue = onlyArgIndex !== -1 ? process.argv[onlyArgIndex + 1] : "";
  const skipArgIndex = process.argv.indexOf("--skip");
  const skipValue = skipArgIndex !== -1 ? process.argv[skipArgIndex + 1] : "";
  const fromArgIndex = process.argv.indexOf("--from");
  const fromValue = fromArgIndex !== -1 ? process.argv[fromArgIndex + 1] : "";
  const toArgIndex = process.argv.indexOf("--to");
  const toValue = toArgIndex !== -1 ? process.argv[toArgIndex + 1] : "";
  const dryRun = process.argv.includes("--dry-run");

  const articleFiles = (await fs.readdir(seriesDir))
    .filter((entry) => articlePattern.test(entry))
    .filter((entry) => (onlyValue ? entry.startsWith(onlyValue) : true))
    .filter((entry) => (skipValue ? !entry.startsWith(skipValue) : true))
    .filter((entry) => (fromValue ? entry.slice(0, 2) >= fromValue : true))
    .filter((entry) => (toValue ? entry.slice(0, 2) <= toValue : true))
    .sort();

  const preparedList = [];
  for (const fileName of articleFiles) {
    preparedList.push(await prepareArticle(path.join(seriesDir, fileName)));
  }

  const results = [];
  for (const prepared of preparedList) {
    const publishResult = runWechatPublish(prepared, { dryRun });
    results.push({
      article: prepared.articleName,
      title: prepared.title,
      coverPath: prepared.coverPath,
      summary: prepared.summary,
      ...publishResult,
    });
  }

  const rangeSuffix = fromValue || toValue ? `-${fromValue || "start"}-${toValue || "end"}` : "";
  const outputPath = path.join(publishRoot, dryRun ? `dry-run-results${rangeSuffix}.json` : `publish-results${rangeSuffix}.json`);
  await fs.writeFile(outputPath, `${JSON.stringify(results, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ count: results.length, outputPath, results }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
