#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";

const rootDir = "/Users/carver/workspace/mindcarver/91ai";
const seriesDir = path.join(rootDir, "docs/ai-coding/claude-code-engineering");
const assetsDir = path.join(rootDir, "assets/claude-code-engineering");
const templateImageName = "cover-template-base.png";
const bottomBannerText = "史上最全 免费AI 资料 https://91aihub.com/";

const articlePattern = /^\d{2}-.*\.md$/;
const generatedCoverStart = /^<!-- codex:cover /;
const generatedCoverEnd = /^<!-- \/codex:cover -->/;
const coverImagePattern = /^!\[.*\]\((\.\.\/)+assets\/.*cover\.(svg|png)\)$/i;

function splitLines(text) {
  return text.replace(/\r\n/g, "\n").split("\n");
}

function escapeXml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function normalizeText(value) {
  return value
    .replace(/[`*_>#]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^[：:;,\-—\s]+|[：:;,\-—\s]+$/g, "")
    .trim();
}

function parseArticle(content) {
  const lines = splitLines(content);
  let inFrontmatter = content.startsWith("---\n");
  let inFence = false;
  let title = "";

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];

    if (inFrontmatter) {
      if (index > 0 && line.trim() === "---") inFrontmatter = false;
      continue;
    }

    if (line.startsWith("```")) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    if (!title && line.startsWith("# ")) {
      title = normalizeText(line.slice(2));
      break;
    }
  }

  return { title };
}

function wrapText(value, width = 12, maxLines = 4) {
  const cleaned = normalizeText(value);
  if (!cleaned) return [""];

  const tokens = cleaned.match(/[A-Za-z0-9.+/#-]+|[\u4e00-\u9fff]|[^\s]/g) ?? [];
  const lines = [];
  let current = "";

  for (const token of tokens) {
    const spacer = /[A-Za-z0-9]/.test(token) && current && /[A-Za-z0-9]$/.test(current) ? " " : "";
    const candidate = `${current}${spacer}${token}`;
    if (candidate.length > width && current) {
      lines.push(current);
      current = token;
    } else {
      current = candidate;
    }
  }

  if (current) lines.push(current);
  if (lines.length <= maxLines) return lines;

  const visible = lines.slice(0, maxLines);
  const last = visible[maxLines - 1];
  visible[maxLines - 1] = last.length > 1 ? `${last.slice(0, -1)}…` : "…";
  return visible;
}

function deriveCoverTitle(title) {
  const stripped = normalizeText(
    title
      .replace(/^Claude Code[：:\s-]*/i, "")
      .replace(/^Claude\s+Code[：:\s-]*/i, "")
      .replace(/不是补全工具，而是/, "")
      .replace(/不是代码补全，而是/, "")
      .replace(/[：:]/g, " "),
  );
  return stripped || normalizeText(title);
}

function textBlock({ x, y, lines, size, weight = 700, fill = "#141414", anchor = "middle", lineHeight = 1.18 }) {
  const tspans = lines
    .map((line, index) => {
      const dy = index === 0 ? 0 : size * lineHeight;
      return `<tspan x="${x}" dy="${dy}">${escapeXml(line)}</tspan>`;
    })
    .join("");

  return `<text x="${x}" y="${y}" fill="${fill}" text-anchor="${anchor}" font-size="${size}" font-weight="${weight}" font-family="Hiragino Sans GB, PingFang SC, Microsoft YaHei, Helvetica, Arial, sans-serif">${tspans}</text>`;
}

function renderCoverSvg(article) {
  const titleLines = wrapText(deriveCoverTitle(article.title), 11, 4);
  const titleSize = titleLines.length <= 2 ? 52 : titleLines.length === 3 ? 46 : 40;
  const titleX = 1000;
  const titleTopY = titleLines.length === 4 ? 422 : titleLines.length === 3 ? 468 : 520;
  const accentY = titleTopY + titleSize * ((titleLines.length - 1) * 1.18) + 72;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1448" height="1086" viewBox="0 0 1448 1086" fill="none">
  <defs>
    <linearGradient id="accent-line" x1="0" y1="0" x2="82" y2="0" gradientUnits="userSpaceOnUse">
      <stop stop-color="#E78B63"/>
      <stop offset="1" stop-color="#F2AF87"/>
    </linearGradient>
    <linearGradient id="title-mask" x1="620" y1="320" x2="1420" y2="780" gradientUnits="userSpaceOnUse">
      <stop stop-color="#FBF5EC"/>
      <stop offset="1" stop-color="#FAF2E7"/>
    </linearGradient>
    <filter id="soft-shadow" x="0" y="0" width="1448" height="1086" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
      <feDropShadow dx="0" dy="10" stdDeviation="22" flood-color="#D7B99D" flood-opacity="0.12"/>
    </filter>
  </defs>

  <image href="${templateImageName}" width="1448" height="1086"/>
  <g filter="url(#soft-shadow)">
    <rect x="620" y="330" width="800" height="430" rx="28" fill="url(#title-mask)"/>
  </g>
  <circle cx="1278" cy="760" r="66" fill="#FBF5EC"/>
  <rect x="272" y="904" width="904" height="76" rx="18" fill="#FFF9F1"/>

  ${textBlock({ x: titleX, y: titleTopY, lines: titleLines, size: titleSize })}
  <text x="724" y="944" fill="#141414" text-anchor="middle" font-size="24" font-weight="700" font-family="Hiragino Sans GB, PingFang SC, Microsoft YaHei, Helvetica, Arial, sans-serif">${escapeXml(bottomBannerText)}</text>
  <line x1="${titleX - 40}" y1="${accentY}" x2="${titleX + 40}" y2="${accentY}" stroke="url(#accent-line)" stroke-width="6" stroke-linecap="round"/>
</svg>
`;
}

function runOrThrow(cmd, args) {
  const result = spawnSync(cmd, args, {
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(`${cmd} ${args.join(" ")} failed\nstdout:\n${result.stdout || ""}\nstderr:\n${result.stderr || ""}`);
  }
}

function removeGeneratedCover(lines) {
  const output = [];
  let inGenerated = false;

  for (const line of lines) {
    if (generatedCoverStart.test(line)) {
      inGenerated = true;
      continue;
    }
    if (inGenerated) {
      if (generatedCoverEnd.test(line)) inGenerated = false;
      continue;
    }
    output.push(line);
  }

  return output;
}

function removeLegacyCover(lines, h1Index) {
  const output = [...lines];
  let cursor = h1Index + 1;

  while (cursor < output.length && output[cursor].trim() === "") cursor += 1;
  if (cursor < output.length && coverImagePattern.test(output[cursor].trim())) {
    let end = cursor + 1;
    while (end < output.length && output[end].trim() === "") end += 1;
    output.splice(cursor, end - cursor);
  }

  return output;
}

function insertCover(content, relativeAssetPath, altText) {
  const lines = removeGeneratedCover(splitLines(content));
  const h1Index = lines.findIndex((line) => line.startsWith("# "));
  if (h1Index === -1) return content;

  const cleaned = removeLegacyCover(lines, h1Index);
  const block = [
    "",
    `<!-- codex:cover ${relativeAssetPath} -->`,
    `![${altText}](${relativeAssetPath})`,
    `<!-- /codex:cover -->`,
    "",
  ];

  cleaned.splice(h1Index + 1, 0, ...block);
  return `${cleaned.join("\n").replace(/\n{3,}/g, "\n\n")}\n`;
}

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

async function writeFile(filePath, content) {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, content, "utf8");
}

async function main() {
  const fromArgIndex = process.argv.indexOf("--from");
  const toArgIndex = process.argv.indexOf("--to");
  const fromValue = fromArgIndex !== -1 ? process.argv[fromArgIndex + 1] : "";
  const toValue = toArgIndex !== -1 ? process.argv[toArgIndex + 1] : "";
  const entries = (await fs.readdir(seriesDir)).filter((entry) => articlePattern.test(entry)).sort();
  const summary = [];

  for (const fileName of entries) {
    const prefix = fileName.slice(0, 2);
    if (fromValue && prefix < fromValue) continue;
    if (toValue && prefix > toValue) continue;

    const filePath = path.join(seriesDir, fileName);
    const content = await fs.readFile(filePath, "utf8");
    const article = parseArticle(content);

    if (!article.title) continue;

    const baseName = `${fileName.replace(/\.md$/, "")}-cover`;
    const svgAssetName = `${baseName}.svg`;
    const pngAssetName = `${baseName}.png`;
    const svgAssetPath = path.join(assetsDir, svgAssetName);
    const pngAssetPath = path.join(assetsDir, pngAssetName);
    const relativeAssetPath = `../../../assets/claude-code-engineering/${pngAssetName}`;
    const altText = `Claude Code 系列文章封面：${article.title}`;

    await writeFile(svgAssetPath, renderCoverSvg(article));
    runOrThrow("/opt/homebrew/bin/rsvg-convert", [svgAssetPath, "-o", pngAssetPath]);
    await writeFile(filePath, insertCover(content, relativeAssetPath, altText));
    summary.push(`${fileName}: ${pngAssetName}`);
  }

  await writeFile(path.join(assetsDir, "generation-summary.txt"), `${summary.join("\n")}\n`);
  console.log(summary.join("\n"));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
