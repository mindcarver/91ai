#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";

const rootDir = "/Users/carver/workspace/mindcarver/91ai";
const seriesDir = path.join(rootDir, "docs/ai-coding/claude-code-engineering");
const sharedImgDir = path.join(seriesDir, "imgs");

const colors = {
  bg: "#F6F1E7",
  paper: "#FFFCF7",
  ink: "#1B1B1B",
  muted: "#7C7468",
  line: "#D8CFC1",
  accent: "#E58A5C",
  accentSoft: "#F2D1BD",
  mint: "#BCD9D0",
  gold: "#E7CB8F",
  shadow: "#E7DED0",
};

const codeFence = /^```/;
const articleFilePattern = /^\d{2}-.*\.md$/;
const generatedImagePattern = /^!\[[^\]]*]\((illustrations\/|imgs\/)/;
const generatedBlockStart = /^<!-- codex:illustration /;
const generatedBlockEnd = /^<!-- \/codex:illustration -->/;

function escapeXml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function splitMarkdownLines(content) {
  return content.replace(/\r\n/g, "\n").split("\n");
}

function normalizeText(value) {
  return value
    .replace(/[`*_>#-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function summarizeHeading(value, max = 18) {
  const cleaned = normalizeText(value)
    .replace(/：/g, " · ")
    .replace(/:/g, " · ");
  if (cleaned.length <= max) return cleaned;
  return `${cleaned.slice(0, max - 1)}…`;
}

function wrapText(value, width = 12, maxLines = 3) {
  const cleaned = normalizeText(value);
  if (!cleaned) return [""];
  const chunks = [];
  let current = "";

  for (const char of cleaned) {
    const nextLength = current.length + 1;
    if (nextLength > width) {
      chunks.push(current);
      current = char;
    } else {
      current += char;
    }
  }

  if (current) chunks.push(current);
  if (chunks.length <= maxLines) return chunks;

  const visible = chunks.slice(0, maxLines);
  const last = visible[maxLines - 1];
  visible[maxLines - 1] = last.length > 1 ? `${last.slice(0, -1)}…` : "…";
  return visible;
}

function slugFromFile(filename) {
  return filename.replace(/\.md$/, "");
}

function parseArticle(content) {
  const lines = splitMarkdownLines(content);
  let title = "";
  const sections = [];
  let inFence = false;
  let inFrontmatter = content.startsWith("---\n");

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];

    if (inFrontmatter) {
      if (index > 0 && line.trim() === "---") {
        inFrontmatter = false;
      }
      continue;
    }

    if (codeFence.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    if (!title && line.startsWith("# ")) {
      title = normalizeText(line.slice(2));
      continue;
    }

    if (line.startsWith("## ")) {
      sections.push({
        heading: normalizeText(line.slice(3)),
        lineIndex: index,
      });
    }
  }

  return { title, lines, sections };
}

function headingMatches(heading, pattern) {
  return pattern.test(heading);
}

function pickSectionIndex(sections, used, pattern, fallbackIndex) {
  const matchIndex = sections.findIndex((section, index) => {
    if (used.has(index)) return false;
    return headingMatches(section.heading, pattern);
  });
  if (matchIndex !== -1) {
    used.add(matchIndex);
    return matchIndex;
  }

  const normalizedFallback = Math.max(0, Math.min(sections.length - 1, fallbackIndex));
  for (let offset = 0; offset < sections.length; offset += 1) {
    const left = normalizedFallback - offset;
    if (left >= 0 && !used.has(left)) {
      used.add(left);
      return left;
    }
    const right = normalizedFallback + offset;
    if (right < sections.length && !used.has(right)) {
      used.add(right);
      return right;
    }
  }
  return 0;
}

function createPlans(article) {
  const { title, sections } = article;
  if (sections.length === 0) return [];

  const used = new Set();
  const count = sections.length;
  const frameworkPattern = /架构|系统|框架|地图|模型|architecture|project map|rules|hook|mcp|plugin|命令|技能|结构|四层|目录/i;
  const flowPattern = /流程|生命周期|步骤|工作流|安装|运行|部署|维护|治理|验证|设计|落地|质量|审计|策略|workflow|step|flow/i;
  const comparePattern = /对比|矩阵|边界|风险|误用|失败|权衡|清单|指标|关系|诊断|性能|责任|safety|verification|checklist/i;

  const overviewIndex = pickSectionIndex(sections, used, /.*/, 0);
  const frameworkIndex = pickSectionIndex(sections, used, frameworkPattern, Math.floor(count / 3));
  const flowIndex = pickSectionIndex(sections, used, flowPattern, Math.floor((count * 2) / 3));
  const compareIndex = pickSectionIndex(sections, used, comparePattern, count - 1);

  const planDefs = [
    {
      index: 1,
      type: "infographic",
      kind: "overview",
      sectionIndex: overviewIndex,
      filename: "01-overview-knowledge-map.svg",
      alt: `图解：${summarizeHeading(sections[overviewIndex].heading, 20)}`,
      purpose: "先给读者一张全局知识地图，快速建立主题边界与章节分层。",
    },
    {
      index: 2,
      type: "framework",
      kind: "framework",
      sectionIndex: frameworkIndex,
      filename: "02-framework-core-structure.svg",
      alt: `图解：${summarizeHeading(sections[frameworkIndex].heading, 20)}`,
      purpose: "把抽象概念改写成卡片式结构图，帮助读者理解核心组成与关系。",
    },
    {
      index: 3,
      type: "flowchart",
      kind: "flow",
      sectionIndex: flowIndex,
      filename: "03-flow-operating-loop.svg",
      alt: `图解：${summarizeHeading(sections[flowIndex].heading, 20)}`,
      purpose: "把步骤、运行链路或落地动作串成流程图，降低阅读跳转成本。",
    },
    {
      index: 4,
      type: "comparison",
      kind: "compare",
      sectionIndex: compareIndex,
      filename: "04-compare-guardrails.svg",
      alt: `图解：${summarizeHeading(sections[compareIndex].heading, 20)}`,
      purpose: "用对比与检查项呈现风险、边界和执行要点，方便文末复盘。",
    },
  ];

  return planDefs.map((plan) => ({
    ...plan,
    section: sections[plan.sectionIndex],
    articleTitle: title,
    cards: sections.map((section) => section.heading),
  }));
}

function buildPrompt(plan, articleTitle, sections) {
  const nearbyHeadings = sections.slice(0, 6).map((section) => `- ${section.heading}`).join("\n");

  if (plan.type === "framework") {
    return `Conceptual Framework\n\nLayout: centered node map with one central module and four surrounding cards.\n\nSTRUCTURE: notion-style rounded cards linked by thin connector lines.\n\nNODES:\n- Central card: ${plan.section.heading}\n- Supporting cards: ${sections.slice(0, 4).map((section) => section.heading).join(" / ")}\n\nRELATIONSHIPS: show how the article decomposes ${articleTitle} into coordinated modules.\nSTYLE: notion-style line art, warm paper background, coral and mint accent chips, light shadow, clean spacing.\nASPECT: 16:9\n\nArticle sections:\n${nearbyHeadings}\n`;
  }

  if (plan.type === "flowchart") {
    return `Process Flow\n\nLayout: horizontal flow with four major steps, rounded containers, thin arrows, dot markers.\n\nSTEPS:\n${sections.slice(0, 4).map((section, index) => `${index + 1}. ${section.heading} - concise operating stage`).join("\n")}\n\nCONNECTIONS: solid arrows for primary path, dashed loop for review or feedback.\nSTYLE: notion-style diagram, paper texture, black stroke icons, coral highlights, generous white space.\nASPECT: 16:9\n\nArticle context:\n${nearbyHeadings}\n`;
  }

  if (plan.type === "comparison") {
    const left = sections[0]?.heading ?? articleTitle;
    const right = sections[sections.length - 1]?.heading ?? plan.section.heading;
    return `Comparison View\n\nLEFT SIDE - ${left}:\n- key principle\n- important boundary\n- execution note\n\nRIGHT SIDE - ${right}:\n- key principle\n- important boundary\n- execution note\n\nDIVIDER: vertical line with small diamond marker.\nSTYLE: notion-style split cards, cream background, coral and mint highlights, balanced whitespace.\nASPECT: 16:9\n\nArticle anchors:\n${nearbyHeadings}\n`;
  }

  return `Data Visualization\n\nLayout: modular four-card overview with a compact header and supporting mini cards.\n\nZONES:\n- Zone 1: article theme card for ${articleTitle}\n- Zone 2: major concept cluster from ${plan.section.heading}\n- Zone 3: supporting section chips from nearby headings\n- Zone 4: closing takeaway strip\n\nLABELS:\n${nearbyHeadings}\nCOLORS: warm cream background, coral primary accent, mint secondary accent, muted gold support.\nSTYLE: notion-style cards, black line icons, rounded corners, light shadow, clean composition.\nASPECT: 16:9\n`;
}

function xmlLine(x1, y1, x2, y2, options = "") {
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" ${options} />`;
}

function xmlRect(x, y, width, height, radius, fill, stroke, strokeWidth = 2, extra = "") {
  return `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${radius}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" ${extra} />`;
}

function xmlCircle(cx, cy, radius, fill, stroke = colors.ink, strokeWidth = 2, extra = "") {
  return `<circle cx="${cx}" cy="${cy}" r="${radius}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" ${extra} />`;
}

function xmlTextBlock({ x, y, lines, size = 28, weight = 700, fill = colors.ink, lineHeight = 1.28, anchor = "start" }) {
  const tspans = lines
    .map((line, index) => {
      const dy = index === 0 ? 0 : size * lineHeight;
      return `<tspan x="${x}" dy="${dy}">${escapeXml(line)}</tspan>`;
    })
    .join("");

  return `<text x="${x}" y="${y}" fill="${fill}" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}" font-family="PingFang SC, Hiragino Sans GB, Microsoft YaHei, Helvetica, Arial, sans-serif">${tspans}</text>`;
}

function decorateCanvas() {
  return [
    xmlCircle(1330, 110, 16, colors.accentSoft, colors.accent, 1.5),
    xmlCircle(1368, 110, 8, colors.paper, colors.ink, 1.5),
    xmlCircle(1394, 110, 8, colors.paper, colors.ink, 1.5),
    xmlCircle(182, 760, 6, colors.accentSoft, colors.accent, 1.5),
    xmlCircle(1220, 758, 6, colors.mint, colors.ink, 1.5),
    xmlLine(118, 178, 220, 178, `stroke="${colors.accent}" stroke-width="4" stroke-linecap="round"`),
    xmlLine(1106, 756, 1198, 756, `stroke="${colors.line}" stroke-width="3" stroke-linecap="round"`),
  ].join("\n");
}

function renderHeader(articleTitle, sectionTitle, badge) {
  const badgeLines = wrapText(badge, 14, 2);
  const titleLines = wrapText(articleTitle, 22, 2);
  const sectionLines = wrapText(sectionTitle, 30, 2);

  return [
    xmlRect(88, 78, 172, 48, 18, colors.paper, colors.line, 1.5),
    xmlTextBlock({ x: 118, y: 110, lines: badgeLines, size: 20, weight: 700, fill: colors.muted }),
    xmlTextBlock({ x: 88, y: 212, lines: titleLines, size: 44, weight: 700 }),
    xmlTextBlock({ x: 90, y: 284, lines: sectionLines, size: 22, weight: 500, fill: colors.muted }),
  ].join("\n");
}

function renderOverviewSvg(plan, article) {
  const cards = article.sections.slice(0, 4).map((section) => summarizeHeading(section.heading, 18));
  const cardPositions = [
    [96, 358],
    [742, 358],
    [96, 610],
    [742, 610],
  ];
  const cardColors = [colors.accentSoft, colors.mint, "#F3E4BE", "#E9DCCC"];
  const cardsSvg = cardPositions
    .map(([x, y], index) => {
      const label = wrapText(cards[index] ?? plan.section.heading, 12, 2);
      return [
        xmlRect(x, y, 530, 186, 28, colors.paper, colors.line, 2),
        xmlRect(x + 22, y + 22, 92, 32, 16, cardColors[index], "none", 0),
        xmlTextBlock({ x: x + 34, y: y + 45, lines: [`0${index + 1}`], size: 18, weight: 700, fill: colors.ink }),
        xmlTextBlock({ x: x + 36, y: y + 96, lines: label, size: 30, weight: 700 }),
        xmlTextBlock({
          x: x + 36,
          y: y + 145,
          lines: wrapText(index === 0 ? "问题与入口" : index === 1 ? "结构与组件" : index === 2 ? "流程与动作" : "边界与检查", 14, 2),
          size: 18,
          weight: 500,
          fill: colors.muted,
        }),
      ].join("\n");
    })
    .join("\n");

  return buildSvgDocument(
    renderHeader(plan.articleTitle, plan.section.heading, "Knowledge Map"),
    cardsSvg,
    [
      xmlRect(628, 454, 184, 232, 36, "#FFF8F1", colors.accent, 2.5),
      xmlTextBlock({ x: 720, y: 534, lines: wrapText("Claude Code", 11, 2), size: 34, weight: 700, anchor: "middle" }),
      xmlTextBlock({ x: 720, y: 610, lines: wrapText("Engineering", 10, 2), size: 28, weight: 600, fill: colors.muted, anchor: "middle" }),
      xmlCircle(720, 642, 12, colors.accent, colors.accent, 1),
      xmlLine(626, 572, 542, 452, `stroke="${colors.line}" stroke-width="2.4" stroke-dasharray="7 9"`),
      xmlLine(812, 572, 898, 452, `stroke="${colors.line}" stroke-width="2.4" stroke-dasharray="7 9"`),
      xmlLine(628, 628, 540, 704, `stroke="${colors.line}" stroke-width="2.4" stroke-dasharray="7 9"`),
      xmlLine(812, 628, 898, 704, `stroke="${colors.line}" stroke-width="2.4" stroke-dasharray="7 9"`),
    ].join("\n"),
  );
}

function renderFrameworkSvg(plan, article) {
  const nearby = article.sections.slice(0, 5).map((section) => summarizeHeading(section.heading, 16));
  const nodes = [
    { x: 184, y: 430, title: nearby[0] ?? plan.section.heading, note: "输入上下文" },
    { x: 1070, y: 430, title: nearby[1] ?? plan.section.heading, note: "运行约束" },
    { x: 184, y: 690, title: nearby[2] ?? plan.section.heading, note: "执行动作" },
    { x: 1070, y: 690, title: nearby[3] ?? plan.section.heading, note: "验证闭环" },
  ];

  const nodeSvg = nodes
    .map((node, index) => {
      const chipFill = index % 2 === 0 ? colors.accentSoft : colors.mint;
      return [
        xmlRect(node.x, node.y, 272, 136, 26, colors.paper, colors.line, 2),
        xmlRect(node.x + 18, node.y + 18, 86, 28, 14, chipFill, "none", 0),
        xmlTextBlock({ x: node.x + 30, y: node.y + 38, lines: [node.note], size: 16, weight: 700, fill: colors.muted }),
        xmlTextBlock({ x: node.x + 24, y: node.y + 82, lines: wrapText(node.title, 11, 2), size: 24, weight: 700 }),
      ].join("\n");
    })
    .join("\n");

  return buildSvgDocument(
    renderHeader(plan.articleTitle, plan.section.heading, "Core Framework"),
    nodeSvg,
    [
      xmlRect(494, 436, 452, 286, 44, "#FFF8F1", colors.ink, 2.5),
      xmlRect(534, 474, 126, 36, 18, colors.accentSoft, "none", 0),
      xmlTextBlock({ x: 558, y: 500, lines: ["核心模块"], size: 20, weight: 700, fill: colors.muted }),
      xmlTextBlock({ x: 720, y: 570, lines: wrapText(plan.section.heading, 14, 3), size: 34, weight: 700, anchor: "middle" }),
      xmlTextBlock({ x: 720, y: 668, lines: wrapText("Cards, rules, flow, guardrails", 22, 2), size: 20, weight: 500, fill: colors.muted, anchor: "middle" }),
      xmlLine(456, 498, 494, 498, `stroke="${colors.line}" stroke-width="3"`),
      xmlLine(946, 498, 1070, 498, `stroke="${colors.line}" stroke-width="3"`),
      xmlLine(456, 758, 494, 650, `stroke="${colors.line}" stroke-width="3"`),
      xmlLine(946, 650, 1070, 758, `stroke="${colors.line}" stroke-width="3"`),
      xmlCircle(494, 498, 8, colors.accentSoft),
      xmlCircle(946, 498, 8, colors.mint),
      xmlCircle(494, 650, 8, colors.gold),
      xmlCircle(946, 650, 8, colors.accentSoft),
    ].join("\n"),
  );
}

function renderFlowSvg(plan, article) {
  const steps = article.sections.slice(0, 4).map((section) => summarizeHeading(section.heading, 14));
  const stepColors = [colors.accentSoft, colors.mint, colors.gold, "#E6D9CA"];
  const startX = 116;
  const gap = 314;

  const stepSvg = steps
    .map((step, index) => {
      const x = startX + gap * index;
      const y = index % 2 === 0 ? 438 : 560;
      return [
        xmlRect(x, y, 248, 138, 26, colors.paper, colors.line, 2),
        xmlRect(x + 18, y + 18, 72, 32, 16, stepColors[index], "none", 0),
        xmlTextBlock({ x: x + 34, y: y + 42, lines: [`0${index + 1}`], size: 18, weight: 700, fill: colors.ink }),
        xmlTextBlock({ x: x + 24, y: y + 86, lines: wrapText(step || plan.section.heading, 10, 2), size: 24, weight: 700 }),
      ].join("\n");
    })
    .join("\n");

  const arrows = [
    xmlLine(364, 508, 430, 508, `stroke="${colors.ink}" stroke-width="3" marker-end="url(#arrow)"`),
    xmlLine(678, 630, 744, 630, `stroke="${colors.ink}" stroke-width="3" marker-end="url(#arrow)"`),
    xmlLine(992, 508, 1058, 508, `stroke="${colors.ink}" stroke-width="3" marker-end="url(#arrow)"`),
    `<path d="M 1186 640 C 1288 708, 1280 780, 988 792" fill="none" stroke="${colors.line}" stroke-width="2.4" stroke-dasharray="9 9" marker-end="url(#arrow-soft)" />`,
  ].join("\n");

  return buildSvgDocument(
    renderHeader(plan.articleTitle, plan.section.heading, "Operating Loop"),
    stepSvg,
    [
      `<defs>
        <marker id="arrow" markerWidth="10" markerHeight="10" refX="7" refY="3" orient="auto">
          <path d="M0,0 L0,6 L8,3 z" fill="${colors.ink}" />
        </marker>
        <marker id="arrow-soft" markerWidth="10" markerHeight="10" refX="7" refY="3" orient="auto">
          <path d="M0,0 L0,6 L8,3 z" fill="${colors.line}" />
        </marker>
      </defs>`,
      xmlRect(88, 332, 1264, 42, 18, "#FFF8F1", colors.line, 1.5),
      xmlTextBlock({
        x: 720,
        y: 360,
        lines: wrapText("从理解到执行，再到校验与复盘的工程回路", 24, 2),
        size: 20,
        weight: 600,
        fill: colors.muted,
        anchor: "middle",
      }),
      arrows,
    ].join("\n"),
  );
}

function renderCompareSvg(plan, article) {
  const leftTitle = summarizeHeading(article.sections[0]?.heading ?? plan.section.heading, 16);
  const rightTitle = summarizeHeading(article.sections[article.sections.length - 1]?.heading ?? plan.section.heading, 16);
  const middleTitle = summarizeHeading(plan.section.heading, 18);

  const listLeft = article.sections.slice(0, 3).map((section) => summarizeHeading(section.heading, 18));
  const listRight = article.sections.slice(-3).map((section) => summarizeHeading(section.heading, 18));

  const bulletList = (items, x, y, chipFill) =>
    items
      .map((item, index) => {
        const top = y + index * 72;
        return [
          xmlCircle(x, top - 8, 8, chipFill, chipFill, 1),
          xmlTextBlock({ x: x + 24, y: top, lines: wrapText(item, 14, 2), size: 22, weight: 600, fill: colors.ink }),
        ].join("\n");
      })
      .join("\n");

  return buildSvgDocument(
    renderHeader(plan.articleTitle, plan.section.heading, "Guardrails"),
    [
      xmlRect(96, 376, 516, 454, 30, colors.paper, colors.line, 2),
      xmlRect(830, 376, 516, 454, 30, colors.paper, colors.line, 2),
      xmlRect(120, 404, 140, 34, 17, colors.accentSoft, "none", 0),
      xmlRect(854, 404, 140, 34, 17, colors.mint, "none", 0),
      xmlTextBlock({ x: 146, y: 428, lines: ["关注点 A"], size: 18, weight: 700, fill: colors.muted }),
      xmlTextBlock({ x: 880, y: 428, lines: ["关注点 B"], size: 18, weight: 700, fill: colors.muted }),
      xmlTextBlock({ x: 122, y: 492, lines: wrapText(leftTitle, 14, 2), size: 30, weight: 700 }),
      xmlTextBlock({ x: 856, y: 492, lines: wrapText(rightTitle, 14, 2), size: 30, weight: 700 }),
      bulletList(listLeft, 134, 574, colors.accent),
      bulletList(listRight, 868, 574, colors.ink),
      xmlLine(720, 402, 720, 810, `stroke="${colors.line}" stroke-width="2.6" stroke-dasharray="8 10"`),
      xmlCircle(720, 524, 14, colors.gold, colors.ink, 1.5),
      xmlCircle(720, 642, 14, colors.accentSoft, colors.ink, 1.5),
      xmlCircle(720, 760, 14, colors.mint, colors.ink, 1.5),
      xmlTextBlock({ x: 720, y: 472, lines: wrapText(middleTitle, 12, 3), size: 24, weight: 700, anchor: "middle" }),
    ].join("\n"),
  );
}

function buildSvgDocument(headerSvg, bodySvg, overlaySvg) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1440" height="900" viewBox="0 0 1440 900" fill="none">
  <rect width="1440" height="900" fill="${colors.bg}" />
  <rect x="40" y="36" width="1360" height="828" rx="44" fill="${colors.bg}" stroke="${colors.shadow}" stroke-width="1.5" />
  ${decorateCanvas()}
  ${headerSvg}
  ${bodySvg}
  ${overlaySvg}
</svg>
`;
}

function renderSvg(plan, article) {
  if (plan.kind === "framework") return renderFrameworkSvg(plan, article);
  if (plan.kind === "flow") return renderFlowSvg(plan, article);
  if (plan.kind === "compare") return renderCompareSvg(plan, article);
  return renderOverviewSvg(plan, article);
}

function createOutline(articleSlug, plans) {
  const entries = plans
    .map((plan) => {
      return [
        `## Illustration ${plan.index}`,
        "",
        `**Position**: ${plan.section.heading}`,
        `**Purpose**: ${plan.purpose}`,
        `**Visual Content**: ${plan.kind === "overview" ? "用四张知识卡片概括主题、结构、流程和边界。" : plan.kind === "framework" ? "用中心节点和四个卫星卡片呈现系统结构与关键关系。" : plan.kind === "flow" ? "用四步流程和回环箭头展示执行闭环。" : "用双栏对比和检查点表达风险、边界与落地动作。"}`,
        `**Filename**: ${plan.filename}`,
        "",
      ].join("\n");
    })
    .join("\n");

  return `---
type: mixed
density: balanced
style: notion
image_count: ${plans.length}
article: ${articleSlug}
---

# ${articleSlug} Illustration Outline

${entries}`;
}

function removeGeneratedArtifacts(lines) {
  const output = [];
  let inGeneratedBlock = false;
  let inFence = false;

  for (const line of lines) {
    if (codeFence.test(line)) {
      inFence = !inFence;
    }

    if (!inFence && generatedBlockStart.test(line)) {
      inGeneratedBlock = true;
      continue;
    }

    if (inGeneratedBlock) {
      if (generatedBlockEnd.test(line)) {
        inGeneratedBlock = false;
      }
      continue;
    }

    if (!inFence && generatedImagePattern.test(line)) {
      continue;
    }

    output.push(line);
  }

  return output;
}

function findInsertionIndex(lines, headingLineIndex) {
  let inFence = false;
  let seenContent = false;

  for (let index = headingLineIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (codeFence.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    if (line.startsWith("## ")) {
      return index;
    }

    if (line.trim() === "") {
      if (seenContent) {
        return index + 1;
      }
      continue;
    }

    seenContent = true;
  }

  return lines.length;
}

function insertIllustrations(content, articleSlug, plans) {
  const lines = removeGeneratedArtifacts(splitMarkdownLines(content));
  const parsed = parseArticle(lines.join("\n"));
  const blocks = [];

  for (const plan of plans) {
    const actualSection = parsed.sections.find((section) => section.heading === plan.section.heading);
    if (!actualSection) continue;

    blocks.push({
      insertAt: findInsertionIndex(parsed.lines, actualSection.lineIndex),
      lines: [
        `<!-- codex:illustration ${articleSlug}/${plan.filename} -->`,
        `![${plan.alt}](imgs/${articleSlug}/${plan.filename})`,
        `<!-- /codex:illustration -->`,
        "",
      ],
    });
  }

  blocks.sort((left, right) => right.insertAt - left.insertAt);
  for (const block of blocks) {
    parsed.lines.splice(block.insertAt, 0, ...block.lines);
  }

  const normalized = parsed.lines.join("\n").replace(/\n{3,}/g, "\n\n");
  return normalized.endsWith("\n") ? normalized : `${normalized}\n`;
}

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

async function writeFile(filePath, content) {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, content, "utf8");
}

async function processArticle(fileName) {
  const filePath = path.join(seriesDir, fileName);
  const original = await fs.readFile(filePath, "utf8");
  const article = parseArticle(original);
  const plans = createPlans(article);
  if (plans.length === 0) return null;

  const articleSlug = slugFromFile(fileName);
  const articleImgDir = path.join(sharedImgDir, articleSlug);
  const promptsDir = path.join(articleImgDir, "prompts");

  await ensureDir(promptsDir);
  await writeFile(path.join(articleImgDir, "outline.md"), createOutline(articleSlug, plans));

  for (const plan of plans) {
    const promptPath = path.join(promptsDir, `${String(plan.index).padStart(2, "0")}-${plan.type}-${plan.kind}.md`);
    const svgPath = path.join(articleImgDir, plan.filename);
    const promptContent = `---
illustration_id: ${String(plan.index).padStart(2, "0")}
type: ${plan.type}
style: notion
---

${buildPrompt(plan, article.title, article.sections)}
`;

    await writeFile(promptPath, promptContent);
    await writeFile(svgPath, renderSvg(plan, article));
  }

  const updatedArticle = insertIllustrations(original, articleSlug, plans);
  await writeFile(filePath, updatedArticle);

  return {
    fileName,
    imageCount: plans.length,
    articleSlug,
  };
}

async function main() {
  const entries = await fs.readdir(seriesDir);
  const onlyArgIndex = process.argv.indexOf("--only");
  const onlyValue = onlyArgIndex !== -1 ? process.argv[onlyArgIndex + 1] : "";
  const articleFiles = entries
    .filter((entry) => articleFilePattern.test(entry))
    .filter((entry) => (onlyValue ? entry.startsWith(onlyValue) : true))
    .sort();
  const results = [];

  for (const fileName of articleFiles) {
    const result = await processArticle(fileName);
    if (result) results.push(result);
  }

  const summaryLines = results.map((result) => `${result.fileName}: ${result.imageCount} images`);
  const summary = `${summaryLines.join("\n")}\nTotal articles: ${results.length}\nTotal images: ${results.reduce((sum, item) => sum + item.imageCount, 0)}\n`;
  await writeFile(path.join(sharedImgDir, "generation-summary.txt"), summary);
  console.log(summary);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
