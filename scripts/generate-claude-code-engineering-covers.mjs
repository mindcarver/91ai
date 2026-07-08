#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";

const rootDir = "/Users/carver/workspace/mindcarver/91ai";
const seriesDir = path.join(rootDir, "docs/ai-coding/claude-code-engineering");
const assetsDir = path.join(rootDir, "assets/claude-code-engineering");

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

function wrapText(value, width = 14, maxLines = 4) {
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
      .replace(/Claude\s+Code/gi, "")
      .replace(/不是补全工具，而是/, "")
      .replace(/不是代码补全，而是/, "")
      .replace(/[：:]/g, " "),
  );
  return stripped || normalizeText(title);
}

function textBlock({ x, y, lines, size, weight = 700, fill = "#141414", anchor = "middle", lineHeight = 1.16 }) {
  const tspans = lines
    .map((line, index) => {
      const dy = index === 0 ? 0 : size * lineHeight;
      return `<tspan x="${x}" dy="${dy}">${escapeXml(line)}</tspan>`;
    })
    .join("");

  return `<text x="${x}" y="${y}" fill="${fill}" text-anchor="${anchor}" font-size="${size}" font-weight="${weight}" font-family="Hiragino Sans GB, PingFang SC, Microsoft YaHei, Helvetica, Arial, sans-serif">${tspans}</text>`;
}

function renderCoverSvg(article) {
  const titleLines = wrapText(deriveCoverTitle(article.title), 14, 4);
  const titleSize = titleLines.length <= 2 ? 50 : titleLines.length === 3 ? 46 : 40;
  const titleY = titleLines.length === 4 ? 1188 : 1204;
  const infoY = titleLines.length === 4 ? 1498 : 1516;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1536" viewBox="0 0 1024 1536" fill="none">
  <defs>
    <filter id="shadow-lg" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="18" stdDeviation="18" flood-color="#AB9A87" flood-opacity="0.22"/>
    </filter>
    <filter id="shadow-sm" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="8" stdDeviation="8" flood-color="#B8A692" flood-opacity="0.18"/>
    </filter>
    <linearGradient id="bg-glow" x1="140" y1="120" x2="892" y2="1410" gradientUnits="userSpaceOnUse">
      <stop stop-color="#FFF9F1"/>
      <stop offset="1" stop-color="#F9F1E6"/>
    </linearGradient>
    <linearGradient id="tile-dark" x1="290" y1="454" x2="754" y2="1050" gradientUnits="userSpaceOnUse">
      <stop stop-color="#3B3834"/>
      <stop offset="1" stop-color="#1E1C1A"/>
    </linearGradient>
    <linearGradient id="accent-line" x1="0" y1="0" x2="64" y2="0" gradientUnits="userSpaceOnUse">
      <stop stop-color="#E78B63"/>
      <stop offset="1" stop-color="#F2AF87"/>
    </linearGradient>
    <pattern id="paper-noise" width="56" height="56" patternUnits="userSpaceOnUse">
      <circle cx="12" cy="10" r="1" fill="#EDE0D0" opacity="0.4"/>
      <circle cx="38" cy="18" r="1.1" fill="#EDE0D0" opacity="0.36"/>
      <circle cx="22" cy="34" r="1" fill="#EDE0D0" opacity="0.34"/>
      <circle cx="46" cy="44" r="0.9" fill="#EDE0D0" opacity="0.3"/>
    </pattern>
  </defs>

  <rect width="1024" height="1536" fill="url(#bg-glow)"/>
  <rect width="1024" height="1536" fill="url(#paper-noise)" opacity="0.72"/>
  <rect x="20" y="20" width="984" height="1496" rx="34" stroke="#E9DCCB" stroke-width="2"/>

  <g opacity="0.42">
    <circle cx="136" cy="156" r="86" fill="#FBF5EC"/>
    <circle cx="904" cy="1318" r="92" fill="#FBF5EC"/>
  </g>

  <g opacity="0.3" fill="#D9CCBD">
    <circle cx="148" cy="668" r="6"/>
    <circle cx="176" cy="668" r="6"/>
    <circle cx="204" cy="668" r="6"/>
    <circle cx="148" cy="696" r="6"/>
    <circle cx="176" cy="696" r="6"/>
    <circle cx="204" cy="696" r="6"/>
    <circle cx="148" cy="724" r="6"/>
    <circle cx="176" cy="724" r="6"/>
    <circle cx="204" cy="724" r="6"/>
    <circle cx="884" cy="1160" r="6"/>
    <circle cx="912" cy="1160" r="6"/>
    <circle cx="940" cy="1160" r="6"/>
    <circle cx="884" cy="1188" r="6"/>
    <circle cx="912" cy="1188" r="6"/>
    <circle cx="940" cy="1188" r="6"/>
    <circle cx="884" cy="1216" r="6"/>
    <circle cx="912" cy="1216" r="6"/>
    <circle cx="940" cy="1216" r="6"/>
  </g>

  <text x="512" y="116" fill="#151515" text-anchor="middle" font-size="52" font-weight="700" font-family="Hiragino Sans GB, PingFang SC, Microsoft YaHei, Helvetica, Arial, sans-serif">阿新聊AI</text>
  <line x1="480" y1="146" x2="544" y2="146" stroke="url(#accent-line)" stroke-width="5" stroke-linecap="round"/>

  <g transform="translate(0 -56)">
    <text x="512" y="404" fill="#111111" text-anchor="middle" font-size="82" font-weight="700" font-family="Hiragino Sans GB, PingFang SC, Microsoft YaHei, Helvetica, Arial, sans-serif">Claude Code 工程实战</text>

    <g filter="url(#shadow-lg)">
      <rect x="286" y="502" width="438" height="520" rx="78" fill="url(#tile-dark)" stroke="#4B4641" stroke-width="3"/>
      <rect x="298" y="514" width="414" height="496" rx="70" stroke="#58524C" stroke-width="1.5" opacity="0.42"/>
    </g>

    <g fill="#F89A6F" filter="url(#shadow-sm)">
      <rect x="420" y="620" width="184" height="18"/>
      <rect x="408" y="638" width="208" height="42"/>
      <rect x="408" y="680" width="208" height="46"/>
      <rect x="384" y="704" width="256" height="34"/>
      <rect x="412" y="726" width="200" height="54"/>
      <rect x="428" y="780" width="40" height="42"/>
      <rect x="556" y="780" width="40" height="42"/>
      <rect x="424" y="740" width="28" height="28"/>
      <rect x="572" y="740" width="28" height="28"/>
      <rect x="396" y="698" width="28" height="40"/>
      <rect x="600" y="698" width="28" height="40"/>
      <rect x="444" y="806" width="24" height="48"/>
      <rect x="492" y="806" width="40" height="48"/>
      <rect x="556" y="806" width="24" height="48"/>
      <rect x="432" y="842" width="20" height="24"/>
      <rect x="568" y="842" width="20" height="24"/>
    </g>

    <rect x="466" y="676" width="22" height="54" fill="#1D1B19"/>
    <rect x="540" y="676" width="22" height="54" fill="#1D1B19"/>

    <text x="505" y="942" fill="#F6F0E8" text-anchor="middle" font-size="42" font-weight="700" letter-spacing="4" font-family="Menlo, Monaco, Consolas, monospace">CLAUDE</text>
    <text x="515" y="998" fill="#F6F0E8" text-anchor="middle" font-size="42" font-weight="700" letter-spacing="4" font-family="Menlo, Monaco, Consolas, monospace">CODE</text>
    <line x1="494" y1="1046" x2="530" y2="1046" stroke="#F89A6F" stroke-width="8" stroke-linecap="round"/>

    ${textBlock({ x: 512, y: titleY, lines: titleLines, size: titleSize })}

    <line x1="338" y1="1448" x2="454" y2="1448" stroke="#141414" stroke-width="3"/>
    <line x1="570" y1="1448" x2="686" y2="1448" stroke="#141414" stroke-width="3"/>
    <path d="M 512 1436 l 12 12 l -12 12 l -12 -12 z" fill="#141414"/>

    <g filter="url(#shadow-sm)">
      <rect x="164" y="1478" width="696" height="56" rx="18" fill="#FFF9F1" stroke="#141414" stroke-width="3"/>
    </g>
    <text x="512" y="${infoY}" fill="#141414" text-anchor="middle" font-size="30" font-weight="700" font-family="Hiragino Sans GB, PingFang SC, Microsoft YaHei, Helvetica, Arial, sans-serif">史上最全AI资料 搜 mindcarver/91ai</text>
  </g>
</svg>
`;
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
  const entries = (await fs.readdir(seriesDir)).filter((entry) => articlePattern.test(entry)).sort();
  const summary = [];

  for (const fileName of entries) {
    const filePath = path.join(seriesDir, fileName);
    const content = await fs.readFile(filePath, "utf8");
    const article = parseArticle(content);

    if (!article.title) continue;

    const assetName = `${fileName.replace(/\.md$/, "")}-cover.svg`;
    const assetPath = path.join(assetsDir, assetName);
    const relativeAssetPath = `../../../assets/claude-code-engineering/${assetName}`;
    const altText = `Claude Code 系列文章封面：${article.title}`;

    await writeFile(assetPath, renderCoverSvg(article));
    await writeFile(filePath, insertCover(content, relativeAssetPath, altText));
    summary.push(`${fileName}: ${assetName}`);
  }

  await writeFile(path.join(assetsDir, "generation-summary.txt"), `${summary.join("\n")}\n`);
  console.log(summary.join("\n"));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
