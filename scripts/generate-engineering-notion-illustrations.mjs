#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";

const rootDir = "/Users/carver/workspace/mindcarver/91ai";
const outputRoot = path.join(rootDir, "assets/ai-coding-engineering-illustrations");

const targets = {
  "claude-code-engineering": [
    "35-background-agents-control-plane.md",
    "36-agent-teams.md",
    "37-worktree-isolation.md",
    "38-memory-and-enforcement.md",
    "39-chrome-visual-verification.md",
    "40-channels-external-events.md",
    "41-routines-goals-long-running.md",
    "42-skills-plugins-distribution.md",
    "43-headless-sdk-observability.md",
    "44-claude-tag-team-entrypoint.md",
  ],
  "codex-engineering": [
    "39-thread-history-memory-import.md",
    "40-multi-agent-v2.md",
    "41-goal-mode-long-running.md",
    "42-app-browser-review-visualization.md",
    "43-remote-handoff.md",
    "44-hooks-trust-lifecycle.md",
    "45-skills-plugins-record-replay.md",
    "46-app-server-json-rpc.md",
    "47-mcp-server-agents-sdk.md",
    "48-auto-review-approval-chain.md",
    "49-codex-security.md",
  ],
};

const palette = {
  bg: "#FFFFFF",
  paper: "#FAFAFA",
  ink: "#1A1A1A",
  muted: "#4A4A4A",
  line: "#D9D9D9",
  blue: "#A8D4F0",
  yellow: "#F9E79F",
  pink: "#FADBD8",
  mint: "#BFE3D0",
  lavender: "#D8CFF0",
};

const typeDefinitions = [
  {
    type: "infographic",
    slug: "concept-map",
    pattern: /分清|名词|定位|组成|保存|是什么|能力|工具面|盒子|入口|视图|控制面/i,
    purpose: "把本节的关键概念拆成一张模块化知识地图。",
  },
  {
    type: "framework",
    slug: "system-framework",
    pattern: /架构|系统|拓扑|分层|责任|结构|策略栈|执行面|生命周期事件|控制面|角色/i,
    purpose: "把组件、角色或层级关系画成可扫描的框架图。",
  },
  {
    type: "flowchart",
    slug: "operating-flow",
    pattern: /流程|路径|顺序|协议|运行|恢复|接管|交接|连接|落地|验收|导入|请求/i,
    purpose: "把动作顺序和反馈关系转换成端到端流程。",
  },
  {
    type: "comparison",
    slug: "boundary-comparison",
    pattern: /差别|不是|关系|何时|选|区分|两种|三个|反例|边界|权衡|局限|限制/i,
    purpose: "并排呈现容易混淆的选项、边界与取舍。",
  },
  {
    type: "timeline",
    slug: "lifecycle-timeline",
    pattern: /长期|周期|历史|记忆|更新|演进|暂停|重启|版本|每轮|新环境|状态/i,
    purpose: "沿时间轴说明状态如何变化，以及何时需要人工介入。",
  },
  {
    type: "infographic",
    slug: "verification-guardrails",
    kind: "guardrail",
    pattern: /安全|信任|权限|审批|风险|验证|通知|凭据|清理|强制|审计|故障|失败/i,
    purpose: "用门禁与检查点总结验证证据和安全护栏。",
  },
];

const excludedHeading = /^(读者|这篇文章适合谁|谁需要这层接口|延伸阅读|官方延伸阅读|资料|参考)/i;
const generatedStart = /^<!-- wos:illustration /;
const generatedEnd = /^<!-- \/wos:illustration -->/;
const fence = /^\s*(```|~~~)/;

function normalizeText(value) {
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/[`*_>#\[\]()|]/g, " ")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function slugFromFile(fileName) {
  return fileName.replace(/\.md$/, "");
}

function seededNumber(value) {
  let hash = 2166136261;
  for (const char of value) {
    hash ^= char.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0);
}

function parseArticle(content) {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const headings = [];
  let title = "";
  let inFence = false;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (fence.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    const match = line.match(/^(#{1,3})\s+(.+)$/);
    if (!match) continue;
    const level = match[1].length;
    const heading = normalizeText(match[2]);
    if (level === 1 && !title) title = heading;
    if (level >= 2 && !excludedHeading.test(heading)) {
      headings.push({ heading, level, lineIndex: index });
    }
  }

  for (let index = 0; index < headings.length; index += 1) {
    const current = headings[index];
    let end = lines.length;
    for (let cursor = current.lineIndex + 1; cursor < lines.length; cursor += 1) {
      const match = lines[cursor].match(/^(#{1,3})\s+/);
      if (match && match[1].length <= current.level) {
        end = cursor;
        break;
      }
    }
    current.body = lines.slice(current.lineIndex + 1, end).join("\n");
  }

  return { title, lines, headings };
}

function sectionScore(section, definition, position, total) {
  let score = definition.pattern.test(section.heading) ? 100 : 0;
  score += definition.pattern.test(section.body) ? 18 : 0;
  const preferred = (position / Math.max(1, typeDefinitions.length - 1)) * Math.max(1, total - 1);
  score -= Math.abs(section.lineIndex - preferred) / Math.max(1, total);
  if (section.level === 2) score += 6;
  return score;
}

function createPlans(article) {
  if (article.headings.length < 6) {
    throw new Error(`Article has fewer than six usable headings: ${article.title}`);
  }

  const selected = [];
  const used = new Set();
  for (let typeIndex = 0; typeIndex < typeDefinitions.length; typeIndex += 1) {
    const definition = typeDefinitions[typeIndex];
    const ranked = article.headings
      .map((section, sectionIndex) => ({
        section,
        sectionIndex,
        score: sectionScore(section, definition, typeIndex, article.headings.length),
      }))
      .filter(({ sectionIndex }) => !used.has(sectionIndex))
      .sort((left, right) => right.score - left.score || left.section.lineIndex - right.section.lineIndex);
    const winner = ranked[0];
    used.add(winner.sectionIndex);
    selected.push({ ...definition, section: winner.section });
  }

  selected.sort((left, right) => left.section.lineIndex - right.section.lineIndex);
  return selected.map((plan, index) => ({
    ...plan,
    index: index + 1,
    filename: `${String(index + 1).padStart(2, "0")}-${plan.type}-${plan.slug}.svg`,
    promptFilename: `${String(index + 1).padStart(2, "0")}-${plan.type}-${plan.slug}.md`,
    alt: `Notion 图解：${plan.section.heading}`,
  }));
}

function extractAnchors(section, article) {
  const inlineCode = [...section.body.matchAll(/`([^`\n]+)`/g)].map((match) => match[1]);
  const numbers = [...section.body.matchAll(/(?:v?\d+(?:\.\d+){0,3}|\d+%|\d{4}-\d{2}-\d{2})/g)].map((match) => match[0]);
  const sentences = section.body
    .split(/\n|。|；/)
    .map(normalizeText)
    .filter((value) => value.length >= 4 && !value.startsWith("http"));
  return [...new Set([section.heading, ...inlineCode, ...numbers, ...sentences.slice(0, 2), article.title])].slice(0, 8);
}

function createPrompt(plan, article) {
  const anchors = extractAnchors(plan.section, article);
  const common = `LABELS (semantic anchors from the article; use them to choose symbols, but DO NOT render any words or letters):\n${anchors.map((anchor) => `- ${anchor}`).join("\n")}\n\nCOLORS:\n- Pure white background #FFFFFF\n- Near-black hand-drawn outlines #1A1A1A\n- Pastel blue #A8D4F0 for primary emphasis\n- Pastel yellow #F9E79F for transition or caution\n- Pastel pink #FADBD8 for exceptions\n- Pale mint #BFE3D0 and lavender #D8CFF0 for supporting modules\n\nSTYLE: Notion-like minimalist hand-drawn line art. Slight intentional wobble, rounded modular cards, sparse pastel fills, soft shadows, generous whitespace, simple conceptual icons, no logos, no realistic people, no robots, no decorative scenery. Absolutely no visible text, letters, numbers, code, product names, or pseudo-text in the image.\nASPECT: 16:9, clean knowledge-card composition.`;

  let structure = "";
  if (plan.kind === "guardrail") {
    structure = `Guardrail Infographic\n\nLayout: one central shield surrounded by four independent verification gates.\n\nZONES:\n- Center: protected execution boundary represented by a simple shield and check mark\n- Upper left: permission gate represented by a keyhole icon\n- Upper right: evidence gate represented by a document-and-check icon\n- Lower left: isolation gate represented by nested boxes\n- Lower right: recovery gate represented by a curved return arrow\n\nCONNECTIONS: thin dashed lines connect each gate to the central shield; no arrows cross.`;
  } else if (plan.type === "framework") {
    structure = `Conceptual Framework\n\nSTRUCTURE: hierarchical hub-and-spoke arrangement with one central module and five surrounding cards.\n\nNODES:\n- Central node: the section's governing mechanism\n- Five outer nodes: roles, state, tools, evidence, and boundaries inferred from the semantic anchors\n\nRELATIONSHIPS: thin hand-drawn connectors show coordination without implying shared identity.`;
  } else if (plan.type === "flowchart") {
    structure = `Process Flow\n\nLayout: left-to-right flow with five rounded step cards.\n\nSTEPS:\n1. trigger or input\n2. prepare context\n3. execute action\n4. verify evidence\n5. hand off, recover, or close\n\nCONNECTIONS: solid arrows for the primary path and one dashed feedback loop from verification to preparation.`;
  } else if (plan.type === "comparison") {
    structure = `Comparison View\n\nLayout: balanced split composition.\n\nLEFT SIDE: three stacked cards representing one operating boundary.\nRIGHT SIDE: three stacked cards representing the alternative boundary.\nDIVIDER: a centered balance marker and vertical hand-drawn line.\nRELATIONSHIPS: mirrored icon grammar makes similarities visible; contrasting pastel chips mark differences.`;
  } else if (plan.type === "timeline") {
    structure = `Chronological View\n\nDIRECTION: horizontal from left to right.\n\nEVENTS:\n- initial state\n- task start\n- active execution\n- interruption or decision point\n- recovery and verification\n- retained result\n\nMARKERS: six distinct hand-drawn milestone symbols connected by one gently curved line.`;
  } else {
    structure = `Knowledge Map Infographic\n\nLayout: modular 3-by-2 card grid with one subtle visual center.\n\nZONES:\n- Six cards represent the section's main concepts and evidence anchors\n- Each card contains one simple icon and two or three abstract status bars\n- Thin connectors reveal only the strongest relationships\n\nHIERARCHY: one pastel-blue primary card, two supporting cards, and three neutral detail cards.`;
  }

  return `---\nillustration_id: ${String(plan.index).padStart(2, "0")}\ntype: ${plan.type}\nstyle: notion\narticle: "${article.title.replaceAll('"', "'")}"\nposition: "${plan.section.heading.replaceAll('"', "'")}"\n---\n\n${structure}\n\n${common}\n`;
}

function createOutline(plans) {
  const entries = plans.map((plan) => `## Illustration ${plan.index}\n\n**Position**: ${plan.section.heading} / 首个说明段落之后\n\n**Purpose**: ${plan.purpose}\n\n**Visual Content**: 将本节真实术语映射为无文字的 Notion 知识卡片、图标和连接关系。\n\n**Type Application**: ${plan.kind === "guardrail" ? "infographic (guardrail)" : plan.type}\n\n**Filename**: ${plan.filename}\n`).join("\n");
  return `---\ntype: mixed\ndensity: rich\nstyle: notion\npalette: default\nimage_count: 6\n---\n\n${entries}`;
}

function rect(x, y, width, height, radius = 22, fill = palette.paper, stroke = palette.ink, opacity = 1) {
  return `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${radius}" fill="${fill}" stroke="${stroke}" stroke-width="3" opacity="${opacity}"/>`;
}

function circle(cx, cy, radius, fill = palette.paper, stroke = palette.ink, width = 3) {
  return `<circle cx="${cx}" cy="${cy}" r="${radius}" fill="${fill}" stroke="${stroke}" stroke-width="${width}"/>`;
}

function line(x1, y1, x2, y2, dashed = false, width = 3) {
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${palette.ink}" stroke-width="${width}" stroke-linecap="round"${dashed ? ' stroke-dasharray="9 12"' : ""}/>`;
}

function arrow(x1, y1, x2, y2, dashed = false) {
  const head = 13;
  return `${line(x1, y1, x2, y2, dashed)}<path d="M ${x2 - head} ${y2 - head / 2} L ${x2} ${y2} L ${x2 - head} ${y2 + head / 2}" fill="none" stroke="${palette.ink}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`;
}

function check(x, y, scale = 1) {
  return `<path d="M ${x} ${y} l ${18 * scale} ${18 * scale} l ${38 * scale} ${-45 * scale}" fill="none" stroke="${palette.ink}" stroke-width="${5 * scale}" stroke-linecap="round" stroke-linejoin="round"/>`;
}

function icon(kind, x, y, color) {
  const variants = [
    `${circle(x, y, 30, color)}${circle(x, y, 8, palette.bg, palette.ink, 3)}`,
    `${rect(x - 31, y - 31, 62, 62, 16, color)}${line(x - 14, y, x + 14, y)}${line(x, y - 14, x, y + 14)}`,
    `<path d="M ${x} ${y - 38} L ${x + 38} ${y} L ${x} ${y + 38} L ${x - 38} ${y} Z" fill="${color}" stroke="${palette.ink}" stroke-width="3"/>${circle(x, y, 8, palette.bg, palette.ink, 3)}`,
    `${circle(x, y - 11, 20, color)}<path d="M ${x - 34} ${y + 34} Q ${x} ${y + 3} ${x + 34} ${y + 34}" fill="none" stroke="${palette.ink}" stroke-width="3" stroke-linecap="round"/>`,
    `<path d="M ${x - 32} ${y + 28} L ${x} ${y - 32} L ${x + 32} ${y + 28} Z" fill="${color}" stroke="${palette.ink}" stroke-width="3" stroke-linejoin="round"/>${line(x - 14, y + 8, x + 14, y + 8)}`,
    `${rect(x - 36, y - 28, 72, 56, 12, color)}${check(x - 15, y + 2, 0.55)}`,
  ];
  return variants[kind % variants.length];
}

function statusBars(x, y, widths = [86, 62, 74]) {
  return widths.map((width, index) => `<rect x="${x}" y="${y + index * 18}" width="${width}" height="7" rx="4" fill="${index === 0 ? palette.muted : palette.line}" opacity="${index === 0 ? 0.55 : 0.9}"/>`).join("");
}

function doodles(seed) {
  const offset = seed % 34;
  return `<g opacity="0.7">
    <path d="M ${95 + offset} 112 l 18 -8 l -8 18" fill="none" stroke="${palette.ink}" stroke-width="2.5" stroke-linecap="round"/>
    <path d="M ${1290 - offset} 690 l 15 15 m -15 0 l 15 -15" fill="none" stroke="${palette.ink}" stroke-width="2.5" stroke-linecap="round"/>
    ${circle(1330, 116 + offset, 8, palette.yellow, palette.ink, 2)}
    ${circle(110 + offset, 710, 6, palette.pink, palette.ink, 2)}
  </g>`;
}

function renderInfographic(seed) {
  const colors = [palette.blue, palette.yellow, palette.pink, palette.mint, palette.lavender, palette.paper];
  const positions = [[160, 145], [560, 145], [960, 145], [160, 465], [560, 465], [960, 465]];
  const cards = positions.map(([x, y], index) => {
    const color = colors[(index + seed) % colors.length];
    return `<g filter="url(#wobble)">${rect(x, y, 320, 210, 26, palette.bg, palette.line)}${icon(index + seed, x + 78, y + 78, color)}${statusBars(x + 145, y + 58, [110, 82, 96])}${circle(x + 277, y + 174, 11, color, palette.ink, 2)}</g>`;
  }).join("");
  return `${cards}${line(480, 250, 560, 250, true, 2)}${line(880, 250, 960, 250, true, 2)}${line(480, 570, 560, 570, true, 2)}${line(880, 570, 960, 570, true, 2)}`;
}

function renderFramework(seed) {
  const colors = [palette.blue, palette.yellow, palette.pink, palette.mint, palette.lavender];
  const nodes = [[720, 105], [1120, 290], [970, 650], [470, 650], [320, 290]];
  const connectors = nodes.map(([x, y]) => line(720, 400, x, y, true, 3)).join("");
  const nodeSvg = nodes.map(([x, y], index) => `<g filter="url(#wobble)">${rect(x - 115, y - 70, 230, 140, 26, palette.bg, palette.line)}${icon(index + seed, x - 52, y, colors[index])}${statusBars(x + 5, y - 23, [72, 54, 63])}</g>`).join("");
  return `${connectors}<g filter="url(#wobble)">${circle(720, 400, 122, palette.paper, palette.ink, 4)}${circle(720, 400, 73, colors[seed % colors.length], palette.ink, 3)}${icon(seed + 2, 720, 400, palette.bg)}</g>${nodeSvg}`;
}

function renderFlowchart(seed) {
  const colors = [palette.blue, palette.mint, palette.yellow, palette.pink, palette.lavender];
  const positions = [100, 365, 630, 895, 1160];
  const cards = positions.map((x, index) => `<g filter="url(#wobble)">${rect(x, 285 + (index % 2) * 34, 180, 210, 28, palette.bg, palette.line)}${icon(index + seed, x + 90, 355 + (index % 2) * 34, colors[index])}${statusBars(x + 47, 420 + (index % 2) * 34, [88, 64, 76])}</g>`).join("");
  const arrows = positions.slice(0, -1).map((x, index) => arrow(x + 186, 390 + (index % 2) * 34, positions[index + 1] - 12, 390 + ((index + 1) % 2) * 34)).join("");
  const loop = `<path d="M 1250 535 C 1120 690, 440 700, 185 535" fill="none" stroke="${palette.ink}" stroke-width="3" stroke-dasharray="10 13" stroke-linecap="round"/><path d="M 191 535 l -18 -5 l 8 18" fill="none" stroke="${palette.ink}" stroke-width="3" stroke-linecap="round"/>`;
  return `${cards}${arrows}${loop}`;
}

function renderComparison(seed) {
  const leftColor = seed % 2 ? palette.blue : palette.mint;
  const rightColor = seed % 2 ? palette.pink : palette.yellow;
  const side = (x, color, flip) => `<g filter="url(#wobble)">${rect(x, 130, 500, 550, 34, palette.bg, palette.line)}${circle(x + 250, 235, 76, color, palette.ink, 3)}${icon(seed + (flip ? 3 : 0), x + 250, 235, palette.bg)}${[0, 1, 2].map((index) => `${circle(x + 86, 385 + index * 82, 13, index === 1 ? color : palette.paper, palette.ink, 2)}${rect(x + 125, 360 + index * 82, 300 - index * 28, 50, 14, palette.paper, palette.line, 1)}`).join("")}</g>`;
  return `${side(120, leftColor, false)}${side(820, rightColor, true)}${line(720, 160, 720, 650, true, 2)}${circle(720, 405, 54, palette.bg, palette.ink, 3)}<path d="M 690 420 Q 720 380 750 420" fill="none" stroke="${palette.ink}" stroke-width="4" stroke-linecap="round"/>${circle(695, 425, 11, leftColor, palette.ink, 2)}${circle(745, 425, 11, rightColor, palette.ink, 2)}`;
}

function renderTimeline(seed) {
  const colors = [palette.blue, palette.mint, palette.yellow, palette.pink, palette.lavender, palette.blue];
  const points = [[130, 500], [360, 390], [590, 480], [820, 330], [1050, 420], [1280, 245]];
  const pathData = points.map(([x, y], index) => `${index === 0 ? "M" : "L"} ${x} ${y}`).join(" ");
  const events = points.map(([x, y], index) => {
    const upper = index % 2 === 0;
    const cardY = upper ? y - 185 : y + 55;
    return `<g filter="url(#wobble)">${circle(x, y, 21, colors[(index + seed) % colors.length], palette.ink, 3)}${line(x, upper ? y - 22 : y + 22, x, upper ? cardY + 115 : cardY, true, 2)}${rect(x - 80, cardY, 160, 115, 22, palette.bg, palette.line)}${icon(index + seed, x, cardY + 42, colors[(index + seed) % colors.length])}${statusBars(x - 42, cardY + 82, [84, 58], 2)}</g>`;
  }).join("");
  return `<path d="${pathData}" fill="none" stroke="${palette.ink}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>${events}`;
}

function renderGuardrail(seed) {
  const colors = [palette.blue, palette.yellow, palette.pink, palette.mint];
  const gates = [[175, 135], [975, 135], [175, 535], [975, 535]];
  const gateSvg = gates.map(([x, y], index) => `<g filter="url(#wobble)">${rect(x, y, 290, 150, 28, palette.bg, palette.line)}${icon(index + seed, x + 80, y + 75, colors[index])}${statusBars(x + 145, y + 48, [102, 77, 91])}${check(x + 233, y + 110, 0.42)}</g>`).join("");
  const connectors = gates.map(([x, y]) => line(x + 145, y + 75, 720, 405, true, 2)).join("");
  const shield = `<g><path d="M 720 235 Q 815 275 835 300 L 820 460 Q 795 545 720 585 Q 645 545 620 460 L 605 300 Q 625 275 720 235 Z" fill="${palette.bg}" stroke="${palette.ink}" stroke-width="6" stroke-linejoin="round"/><path d="M 720 285 Q 780 310 790 330 L 780 445 Q 760 500 720 525 Q 680 500 660 445 L 650 330 Q 660 310 720 285 Z" fill="${colors[seed % colors.length]}" stroke="${palette.ink}" stroke-width="4"/>${check(690, 420, 1.05)}</g>`;
  return `${connectors}${gateSvg}${shield}`;
}

function renderSvg(plan, article) {
  const seed = seededNumber(`${article.title}-${plan.section.heading}`);
  let content;
  if (plan.kind === "guardrail") content = renderGuardrail(seed);
  else if (plan.type === "framework") content = renderFramework(seed);
  else if (plan.type === "flowchart") content = renderFlowchart(seed);
  else if (plan.type === "comparison") content = renderComparison(seed);
  else if (plan.type === "timeline") content = renderTimeline(seed);
  else content = renderInfographic(seed);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1440" height="810" viewBox="0 0 1440 810" role="img" aria-label="${plan.alt.replaceAll('"', "&quot;")}">
  <defs>
    <filter id="wobble" x="-5%" y="-5%" width="110%" height="110%">
      <feTurbulence type="fractalNoise" baseFrequency="0.008" numOctaves="1" seed="${seed % 97}" result="noise"/>
      <feDisplacementMap in="SourceGraphic" in2="noise" scale="1.35" xChannelSelector="R" yChannelSelector="G"/>
    </filter>
    <filter id="shadow" x="-10%" y="-10%" width="120%" height="130%">
      <feDropShadow dx="0" dy="8" stdDeviation="10" flood-color="#1A1A1A" flood-opacity="0.08"/>
    </filter>
  </defs>
  <rect width="1440" height="810" fill="${palette.bg}"/>
  <rect x="50" y="50" width="1340" height="710" rx="42" fill="${palette.bg}" stroke="${palette.line}" stroke-width="2" filter="url(#shadow)"/>
  <g stroke-linecap="round" stroke-linejoin="round">${content}${doodles(seed)}</g>
</svg>
`;
}

function removeGeneratedBlocks(lines) {
  const output = [];
  let inGenerated = false;
  for (const lineValue of lines) {
    if (generatedStart.test(lineValue)) {
      inGenerated = true;
      continue;
    }
    if (inGenerated && generatedEnd.test(lineValue)) {
      inGenerated = false;
      continue;
    }
    if (!inGenerated) output.push(lineValue);
  }
  return output;
}

function findInsertionIndex(lines, target) {
  let inFence = false;
  let seenContent = false;
  for (let index = target.lineIndex + 1; index < lines.length; index += 1) {
    const lineValue = lines[index];
    if (fence.test(lineValue)) {
      inFence = !inFence;
      seenContent = true;
      continue;
    }
    if (inFence) continue;
    const headingMatch = lineValue.match(/^(#{1,3})\s+/);
    if (headingMatch && headingMatch[1].length <= target.level) return index;
    if (lineValue.trim() === "") {
      if (seenContent) return index + 1;
      continue;
    }
    seenContent = true;
  }
  return lines.length;
}

function insertImages(content, series, articleSlug, plans) {
  const cleanLines = removeGeneratedBlocks(content.replace(/\r\n/g, "\n").split("\n"));
  const parsed = parseArticle(cleanLines.join("\n"));
  const blocks = [];
  for (const plan of plans) {
    const actual = parsed.headings.find((heading) => heading.heading === plan.section.heading && heading.level === plan.section.level);
    if (!actual) throw new Error(`Cannot find insertion heading: ${plan.section.heading}`);
    blocks.push({
      at: findInsertionIndex(parsed.lines, actual),
      lines: [
        `<!-- wos:illustration ${series}/${articleSlug}/${plan.filename} -->`,
        `![${plan.alt}](../../../assets/ai-coding-engineering-illustrations/${series}/${articleSlug}/${plan.filename})`,
        "<!-- /wos:illustration -->",
        "",
      ],
    });
  }
  blocks.sort((left, right) => right.at - left.at);
  for (const block of blocks) parsed.lines.splice(block.at, 0, ...block.lines);
  return `${parsed.lines.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd()}\n`;
}

async function ensureDir(directory) {
  await fs.mkdir(directory, { recursive: true });
}

async function writeText(filePath, content) {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, content, "utf8");
}

async function buildArticlePlan(series, fileName) {
  const articlePath = path.join(rootDir, "docs/ai-coding", series, fileName);
  const rawSource = await fs.readFile(articlePath, "utf8");
  const source = removeGeneratedBlocks(rawSource.replace(/\r\n/g, "\n").split("\n")).join("\n");
  const article = parseArticle(source);
  const plans = createPlans(article);
  const articleSlug = slugFromFile(fileName);
  const articleOutput = path.join(outputRoot, series, articleSlug);

  await fs.rm(articleOutput, { recursive: true, force: true });
  await writeText(path.join(articleOutput, "outline.md"), createOutline(plans));
  for (const plan of plans) {
    await writeText(path.join(articleOutput, "prompts", plan.promptFilename), createPrompt(plan, article));
  }

  return { series, fileName, articlePath, articleSlug, articleOutput, source, article, plans };
}

async function verifyPrompts(work) {
  const missing = [];
  for (const item of work) {
    for (const plan of item.plans) {
      const promptPath = path.join(item.articleOutput, "prompts", plan.promptFilename);
      try {
        await fs.access(promptPath);
      } catch {
        missing.push(promptPath);
      }
    }
  }
  if (missing.length) throw new Error(`Prompt verification failed:\n${missing.join("\n")}`);
}

async function renderAndInsert(item) {
  for (const plan of item.plans) {
    await writeText(path.join(item.articleOutput, plan.filename), renderSvg(plan, item.article));
  }
  const updated = insertImages(item.source, item.series, item.articleSlug, item.plans);
  await writeText(item.articlePath, updated);
}

async function main() {
  const work = [];
  for (const [series, files] of Object.entries(targets)) {
    for (const fileName of files) work.push(await buildArticlePlan(series, fileName));
  }

  await verifyPrompts(work);
  console.log(`Prompt Files: ${work.length * 6}/126 verified`);

  for (const item of work) {
    await renderAndInsert(item);
    console.log(`Generated 6/6: ${item.series}/${item.fileName}`);
  }

  const summary = [
    "Writer OS Illustration Generation Summary",
    "Style: notion",
    "Density: rich",
    `Articles: ${work.length}`,
    `Images: ${work.length * 6}`,
    "Visible text in images: none",
    "",
    ...work.map((item) => `${item.series}/${item.fileName}: 6 images`),
    "",
  ].join("\n");
  await writeText(path.join(outputRoot, "generation-summary.txt"), summary);
  console.log(`\n${summary}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
