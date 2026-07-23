import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const sharp = require("sharp");

const outDir = path.join(process.cwd(), "assets/codex-harness-engineering");
const font = "PingFang SC, Microsoft YaHei, Noto Sans CJK SC, sans-serif";
const mono = "SFMono-Regular, Menlo, Monaco, monospace";

const specs = [
  { id: "02-source-baseline", type: "compare", title: "先建立基线，再开始重写", subtitle: "原文与 Codex 版本使用同一口径核验", left: ["腾讯技术工程原文", "非空字符 25,087", "主体内容图 17 张", "正文图片元素 20 个"], right: ["Codex 重写验收线", "非空字符 ≥ 26,000", "主体图 / 截图 ≥ 24 张", "事实与引用必须可追溯"] },
  { id: "03-six-pillars", type: "six", title: "Codex Harness 的六根支柱", subtitle: "模型能力之外，可靠交付依赖完整控制系统", items: [["上下文", "让 Codex 看到正确事实"], ["工具", "连接代码与真实系统"], ["编排", "拆解、协作与汇合"], ["状态与记忆", "跨任务保持一致"], ["评估与观测", "用证据判断完成"], ["约束与恢复", "限制风险并支持回滚"]] },
  { id: "04-model-agent-harness", type: "layers", title: "模型、Agent 与 Harness：三层分工", subtitle: "强模型只有进入可控循环，才能成为工程生产力", items: [["应用层", "Codex App · CLI · IDE · Cloud Task"], ["Harness 层", "上下文 · 工具 · 权限 · 状态 · 验证 · 恢复"], ["模型层", "理解意图 · 推理 · 生成 · 决策"]] },
  { id: "05-vibe-coding-decay", type: "timeline", title: "没有 Harness：项目为什么从快变乱", subtitle: "速度会同时放大产出与技术债", items: [["起步极快", "文件少、上下文新鲜"], ["模式分叉", "同类功能出现多种写法"], ["上下文漂移", "命名、边界和决策被遗忘"], ["返工增加", "修一个问题又产生两个"], ["后期失控", "人类无法低成本接手"]], footer: "Harness 的作用：让错误更早出现、范围更小、恢复成本更低" },
  { id: "06-progressive-context", type: "tree", title: "AGENTS.md 是地图，不是百科全书", subtitle: "入口短而稳定，详细知识按任务逐层展开", root: "AGENTS.md\n约 100 行入口", branches: [["ARCHITECTURE.md", "架构边界与依赖方向"], ["docs/product/", "产品事实与用户流程"], ["docs/plans/", "计划、进度与决策"], ["docs/runbooks/", "发布、排障与恢复"], ["docs/references/", "外部库与内部系统"]] },
  { id: "07-pillars-to-controls", type: "table", title: "六根支柱如何落到 Codex 控制面", subtitle: "每个抽象概念都必须对应可执行机制", rows: [["上下文", "AGENTS.md · 架构文档 · 计划"], ["工具", "终端 · Git · MCP · 浏览器"], ["编排", "计划 · 子任务 · Review 汇合"], ["状态", "线程状态 · 计划文件 · Git"], ["评估", "测试 · 日志 · 截图 · Diff"], ["约束", "沙箱 · 审批 · 分支 · 回滚"]] },
  { id: "08-end-to-end-loop", type: "loop", title: "Codex 从需求到知识回写的完整闭环", subtitle: "完成一次任务，也要让下一次任务更容易", items: ["需求 / 问题", "读取当前事实", "形成可审查计划", "在边界内执行", "运行自动验证", "检查真实用户路径", "审查差异与风险", "知识写回仓库"] },
  { id: "09-source-of-truth", type: "zones", title: "三类信息，三种正确落点", subtitle: "不是把所有内容复制进 Git，而是保证 Codex 能抵达权威源", zones: [["仓库内长期事实", "架构 · 规范 · 测试 · Runbook", "版本化，可审查"], ["外部实时事实", "Issue · Schema · 日志 · 发布状态", "通过只读工具获取"], ["敏感信息", "令牌 · 密钥 · 用户隐私", "不进 Prompt，不进仓库"]] },
  { id: "10-permission-layers", type: "levels", title: "四级权限：把人类注意力留给高风险判断", subtitle: "边界越清楚，低风险动作越能自动执行", items: [["L0 读取", "搜索、查看文件、读取日志", "自动执行并保留来源"], ["L1 本地可逆", "改工作区、跑测试、生成报告", "自动执行，展示 Diff"], ["L2 外部可逆", "草稿 PR、评论草稿、预览", "明确授权后执行"], ["L3 高影响", "生产、删除、权限、外发", "精确确认目标与回滚"]] },
  { id: "11-three-stage-roadmap", type: "stages", title: "三阶段落地路线：先闭环，再扩工具", subtitle: "不要第一天就搭建庞大的 Agent 平台", items: [["阶段一", "基础可读、可跑、可验", "AGENTS.md · 统一检查 · 小任务闭环"], ["阶段二", "接入高价值事实与技能", "只读 Schema · 浏览器 · 团队 Skill"], ["阶段三", "提高自治并持续清理", "多 Agent · 自动 Review · 垃圾回收"]] },
  { id: "12-agents-md", type: "evidence", title: "真实证据：91ai 仓库入口规则", subtitle: "Codex 开工前读取的不是口号，而是可执行约束", lines: ["README.md          公开入口，保持简短并以导航为主", "docs/README.md     学习路径、雷达图和路线图", "assets/            README 与文章使用的媒体资源", "命名               新文档使用小写 kebab-case", "数据               禁止猜测、伪造或美化事实", "验证               修改后运行 ./scripts/check.sh all"] },
  { id: "13-check-command", type: "evidence", title: "真实证据：统一检查命令", subtitle: "把“注意格式和链接”变成机器可执行反馈", lines: ["$ ./scripts/check.sh all", "PASS  Markdown 标题、列表与空行", "PASS  文章内 26 个图片目标全部存在", "PASS  README badge 数量与仓库一致", "exit code: 0", "", "$ ./scripts/check.sh links-ext", "OpenAI 官方页对 curl 返回 403 → 单独说明，不伪装通过"] },
  { id: "14-task-contract", type: "contract", title: "把模糊需求改写成任务契约", subtitle: "六个字段把范围、风险与证据提前说清楚", fields: [["目标", "第一人称 Codex 公众号长文"], ["范围", "正文 · 新增配图 · 来源说明"], ["非目标", "不发布 · 不动现有 Claude 资产"], ["约束", "不虚构 · 字数和图片均超过原文"], ["验收", "字数 · 图片 · Markdown · 链接"], ["证据", "命令输出 · 文件路径 · 未验证项"]] },
  { id: "15-mcp-decision", type: "questions", title: "接入 MCP 前必须回答的七个问题", subtitle: "先证明增量价值，再增加工具和权限", items: ["它补充了什么关键事实？", "只读权限是否已经足够？", "一次响应会不会挤爆上下文？", "超时、空结果、无权限如何区分？", "凭据由谁保管和轮换？", "CLI 或生成文件是否更简单？", "怎样证明结果来自当前真实环境？"] },
  { id: "16-skill-trigger", type: "evidence", title: "真实证据：Skill 先确认输入，再开始写作", subtitle: "wos-content-rewrite 没有被当作一个模糊提示词", lines: ["SKILL               wos-content-rewrite", "必问 1              第一人称还是第三人称？", "用户确认            第一人称“我”", "必问 2              目标平台是什么？", "用户确认            微信公众号", "平台规则            场景开头 · 短段落 · 故事节奏", "事实边界            改编而非冒充，来源必须可追溯"] },
  { id: "17-browser-verification", type: "compare", title: "UI 验证必须从代码走到真实用户路径", subtitle: "最有价值的截图是前后状态与异常证据", left: ["只看代码", "编译通过", "组件测试通过", "无法证明真实页面", "可能遗漏控制台错误"], right: ["真实路径验证", "登录 → 页面 → 筛选 → 翻页", "桌面端 + 移动端", "全页截图 + 控制台摘要", "失败请求必须列出"] },
  { id: "18-multi-agent-contract", type: "agents", title: "多 Agent 只有在责任边界清楚时才并行", subtitle: "共享契约固定接口，主 Agent 负责最终汇合", agents: [["Agent A", "API 与服务层", "src/api · src/services"], ["Agent B", "迁移与仓储层", "migrations · repositories"], ["Agent C", "只读安全审查", "不修改代码，只报告问题"]], contract: "共享契约：operation-log-contract.md\n禁止回退他人改动；接口冲突先报告" },
  { id: "19-evidence-per-step", type: "steps", title: "每个计划步骤都要连接一个证据接口", subtitle: "有证据接口，Codex 才能独立循环", items: [["数据库迁移", "前进与回滚都成功 · Schema 正确"], ["查询 API", "正常 · 未授权 · 非法参数 · 空结果"], ["前端页面", "用户路径截图 · 控制台 · 网络请求"], ["文档更新", "Markdown lint · 内部链接检查"]] },
  { id: "20-bug-fix-loop", type: "loop", title: "Bug 修复：先证明问题，再证明修复", subtitle: "没有复现就直接改，往往只修到症状", items: ["收集现象", "建立稳定复现", "缩小原因范围", "写失败测试", "做最小修复", "目标测试通过", "运行回归检查", "重走真实路径"] },
  { id: "21-content-workflow", type: "steps", title: "内容重写同样需要 Harness", subtitle: "来源、执行与验收缺一不可", items: [["确认输入", "第一人称 · 微信公众号 · 长度与配图要求"], ["读取来源", "提取正文 · 标题层级 · 图片数量"], ["核对事实", "原文事实 · OpenAI 官方资料 · 真实经历"], ["改写与配图", "Codex 视角 · 新结构 · 新视觉证据"], ["最终验收", "字数 · 图片 · 链接 · 移动端预览"]] },
  { id: "22-team-red-lines", type: "redlines", title: "团队协作的十条红线", subtitle: "高速度不能以事实、权限和可恢复性为代价", items: ["没有来源的数字不写", "模糊指令不推断生产写权限", "秘密不进入仓库、Prompt 和截图", "不覆盖他人的未提交改动", "聊天记录不充当长期文档", "不以生成行数衡量价值", "工具成功不等于业务成功", "一个 Skill 不承包所有事情", "不可恢复动作不直接试错", "交付必须列出未验证项"] },
  { id: "23-dirty-worktree-scope", type: "evidence", title: "真实证据：脏工作区下的最小修改范围", subtitle: "不追求漂亮的 Git 状态，先保护他人工作", lines: ["$ git status --short", "M   assets/claude-code-engineering/...     用户已有修改", "D   post-to-wechat/...                    用户已有删除", "??  assets/claude-code-engineering/...    用户已有资产", "", "本任务只新增两个独立范围：", "+   docs/ai-coding/codex-harness-engineering-wechat.md", "+   assets/codex-harness-engineering/"] },
  { id: "24-audit-report", type: "audit", title: "Harness 审计：分数必须回到证据与行动", subtitle: "这次重写按七个维度逐项核验", rows: [["上下文", "规则与 Skill 已读取"], ["来源", "原文与官方资料可追溯"], ["任务契约", "人称、平台、字数、图片明确"], ["工具恢复", "网页抓取失败后安全换路"], ["内容质量", "Codex 真实视角，不冒充他人经历"], ["视觉证据", "26 张图片逐张重新验收"], ["验证", "字数、图片、Markdown、链接"]], footer: "结论必须同时报告：已验证 · 未验证 · 风险 · 下一步" },
  { id: "25-human-judgment-compounds", type: "conversion", title: "把人的重复提醒沉淀进 Harness", subtitle: "判断只表达一次，随后由系统持续执行", pairs: [["“先看项目规范”", "AGENTS.md 自动加载"], ["“不能反向依赖”", "架构测试与 Lint"], ["“改完记得检查”", "统一验证脚本"], ["“发布前逐项核对”", "可复用 Release Skill"], ["“页面到底修没修”", "浏览器路径与前后截图"], ["“失败以后怎么办”", "回滚手册与升级条件"]] },
  { id: "26-thirty-day-plan", type: "calendar", title: "Codex Harness：30 天落地计划", subtitle: "每周只解决一个层级，避免平台化冲动", weeks: [["第 1 周", "可读 · 可跑 · 可验", "AGENTS.md、统一检查、小 Bug 闭环"], ["第 2 周", "任务契约与证据", "四类模板、截图与未验证项标准"], ["第 3 周", "只接两个高价值工具", "默认只读、限制输出、测试失败语义"], ["第 4 周", "沉淀第一个团队 Skill", "触发样例、反例、输出一致性评估"]] }
];

const esc = (s) => String(s).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
const txt = (x, y, value, size = 24, color = "#334155", weight = 400, anchor = "start") => `<text x="${x}" y="${y}" font-family="${font}" font-size="${size}" fill="${color}" font-weight="${weight}" text-anchor="${anchor}">${esc(value)}</text>`;
const lines = (x, y, values, size = 23, color = "#334155", gap = 38, weight = 400) => values.map((v, i) => txt(x, y + i * gap, v, size, color, weight)).join("");
const card = (x, y, w, h, stroke = "#E2E8F0", fill = "#FFFFFF") => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="24" fill="${fill}" stroke="${stroke}" stroke-width="2" filter="url(#shadow)"/>`;
const badge = (x, y, label, color = "#2563EB") => `${txt(x, y, label, 18, color, 700)}<rect x="${x - 12}" y="${y - 25}" width="${label.length * 20 + 24}" height="36" rx="18" fill="${color}" opacity="0.10"/>`;

function frame(spec) {
  return `<defs><filter id="shadow"><feDropShadow dx="0" dy="6" stdDeviation="10" flood-color="#0F172A" flood-opacity="0.08"/></filter><marker id="arrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto"><path d="M0,0 L0,6 L9,3 z" fill="#64748B"/></marker></defs><rect width="1200" height="800" fill="#F8FAFC"/><circle cx="1110" cy="60" r="180" fill="#DBEAFE" opacity="0.55"/><circle cx="60" cy="760" r="170" fill="#F3E8FF" opacity="0.45"/>${txt(70, 82, spec.title, 42, "#0F172A", 750)}${txt(72, 124, spec.subtitle, 22, "#64748B", 400)}<line x1="70" y1="146" x2="1130" y2="146" stroke="#E2E8F0" stroke-width="2"/>`;
}

function render(spec) {
  let s = frame(spec);
  if (spec.type === "compare") {
    s += card(70, 185, 500, 500, "#BFDBFE") + card(630, 185, 500, 500, "#DDD6FE");
    s += badge(105, 235, spec.left[0], "#2563EB") + badge(665, 235, spec.right[0], "#7C3AED");
    s += lines(110, 310, spec.left.slice(1).map(v => `• ${v}`), 25, "#334155", 68) + lines(670, 310, spec.right.slice(1).map(v => `• ${v}`), 25, "#334155", 68);
  } else if (spec.type === "six") {
    spec.items.forEach(([a,b], i) => { const x=70+(i%3)*360, y=185+Math.floor(i/3)*245; s += card(x,y,320,205,"#DCE7F5") + `<circle cx="${x+42}" cy="${y+45}" r="19" fill="${["#2563EB","#7C3AED","#0891B2","#D97706","#059669","#DC2626"][i]}"/>` + txt(x+75,y+55,a,28,"#0F172A",700) + txt(x+32,y+120,b,21,"#475569",400); });
  } else if (spec.type === "layers") {
    spec.items.forEach(([a,b],i)=>{const x=120+i*55,y=220+i*150,w=960-i*110;s+=card(x,y,w,105,["#93C5FD","#C4B5FD","#67E8F9"][i],"#FFFFFF")+txt(x+35,y+48,a,27,"#0F172A",700)+txt(x+220,y+48,b,22,"#475569",400);});
  } else if (spec.type === "timeline") {
    s += `<line x1="120" y1="390" x2="1080" y2="390" stroke="#94A3B8" stroke-width="6" marker-end="url(#arrow)"/>`;
    spec.items.forEach(([a,b],i)=>{const x=120+i*230;s+=`<circle cx="${x}" cy="390" r="25" fill="${i<2?"#2563EB":i<4?"#F59E0B":"#DC2626"}"/>`+card(x-90,i%2?430:200,180,130)+txt(x,i%2?475:245,a,23,"#0F172A",700,"middle")+txt(x,i%2?515:285,b,17,"#64748B",400,"middle");}); s+=card(155,650,890,70,"#BFDBFE","#EFF6FF")+txt(600,695,spec.footer,23,"#1D4ED8",650,"middle");
  } else if (spec.type === "tree") {
    spec.branches.forEach((_,i)=>{const x=420+(i%2)*365,y=175+Math.floor(i/2)*175;s+=`<line x1="310" y1="370" x2="${x}" y2="${y+60}" stroke="#94A3B8" stroke-width="3" marker-end="url(#arrow)"/>`;});
    s += card(70,285,240,170,"#93C5FD")+lines(190,350,spec.root.split("\n"),27,"#0F172A",42,700);
    spec.branches.forEach(([a,b],i)=>{const x=420+(i%2)*365,y=175+Math.floor(i/2)*175;s+=card(x,y,310,125)+txt(x+25,y+45,a,23,"#1D4ED8",700)+txt(x+25,y+84,b,19,"#475569");});
  } else if (spec.type === "table" || spec.type === "audit") {
    const rows=spec.rows; s+=card(90,180,1020,spec.type==="audit"?500:490); rows.forEach((r,i)=>{const y=230+i*62;s+=`<rect x="110" y="${y-34}" width="980" height="52" rx="12" fill="${i%2?"#F8FAFC":"#EFF6FF"}"/>`+txt(135,y,r[0],22,"#0F172A",700)+txt(380,y,r[1],21,"#475569");}); if(spec.footer)s+=txt(600,735,spec.footer,21,"#1D4ED8",650,"middle");
  } else if (spec.type === "loop") {
    const n=spec.items.length; spec.items.forEach((v,i)=>{const a=i*Math.PI*2/n-Math.PI/2,x=600+Math.cos(a)*255,y=430+Math.sin(a)*230;s+=card(x-105,y-43,210,86,"#BFDBFE")+txt(x,y+8,v,20,"#0F172A",650,"middle"); if(i<n-1){const a2=(i+1)*Math.PI*2/n-Math.PI/2,x2=600+Math.cos(a2)*255,y2=430+Math.sin(a2)*230;s+=`<line x1="${x}" y1="${y}" x2="${x2}" y2="${y2}" stroke="#64748B" stroke-width="3" marker-end="url(#arrow)"/>`;}}); s+=`<circle cx="600" cy="430" r="82" fill="#2563EB" opacity="0.12"/>`+lines(600,415,["反馈", "闭环"],27,"#1D4ED8",38,750);
  } else if (spec.type === "zones") {
    spec.zones.forEach(([a,b,c],i)=>{const x=70+i*370;s+=card(x,205,320,450,["#93C5FD","#67E8F9","#FCA5A5"][i])+`<circle cx="${x+160}" cy="285" r="45" fill="${["#2563EB","#0891B2","#DC2626"][i]}" opacity="0.14"/>`+txt(x+160,295,String(i+1),32,["#2563EB","#0891B2","#DC2626"][i],750,"middle")+txt(x+160,375,a,27,"#0F172A",700,"middle")+lines(x+35,445,b.split(" · ").map(v=>`• ${v}`),21,"#475569",42)+txt(x+160,610,c,19,["#1D4ED8","#0E7490","#B91C1C"][i],650,"middle");});
  } else if (spec.type === "levels") {
    spec.items.forEach(([a,b,c],i)=>{const x=90+i*270,y=210+i*45;s+=card(x,y,235,400,["#A7F3D0","#BFDBFE","#DDD6FE","#FCA5A5"][i])+txt(x+28,y+55,a,26,"#0F172A",750)+lines(x+28,y+125,b.split("、"),20,"#475569",40)+`<line x1="${x+25}" y1="${y+275}" x2="${x+210}" y2="${y+275}" stroke="#E2E8F0"/>`+lines(x+28,y+325,c.split("，"),18,"#1D4ED8",34,600);});
  } else if (spec.type === "stages") {
    spec.items.forEach(([a,b,c],i)=>{const x=80+i*380;s+=card(x,220,340,420,["#93C5FD","#67E8F9","#C4B5FD"][i])+badge(x+35,275,a,["#2563EB","#0891B2","#7C3AED"][i])+txt(x+35,360,b,26,"#0F172A",700)+lines(x+35,435,c.split(" · ").map(v=>`• ${v}`),20,"#475569",45); if(i<2)s+=`<line x1="${x+340}" y1="430" x2="${x+380}" y2="430" stroke="#64748B" stroke-width="4" marker-end="url(#arrow)"/>`;});
  } else if (spec.type === "evidence") {
    s+=`<rect x="70" y="180" width="1060" height="520" rx="28" fill="#0F172A" filter="url(#shadow)"/><circle cx="110" cy="220" r="8" fill="#F87171"/><circle cx="138" cy="220" r="8" fill="#FBBF24"/><circle cx="166" cy="220" r="8" fill="#4ADE80"/>`; spec.lines.forEach((v,i)=>{const color=v.startsWith("$")?"#7DD3FC":v.startsWith("PASS")||v.startsWith("+")?"#86EFAC":v.includes("403")?"#FBBF24":"#E2E8F0";s+=`<text x="110" y="${280+i*50}" font-family="${mono}" font-size="21" fill="${color}">${esc(v||" ")}</text>`;});
  } else if (spec.type === "contract") {
    spec.fields.forEach(([a,b],i)=>{const x=70+(i%2)*550,y=180+Math.floor(i/2)*165;s+=card(x,y,510,130,i%2?"#DDD6FE":"#BFDBFE")+badge(x+30,y+48,a,i%2?"#7C3AED":"#2563EB")+txt(x+30,y+98,b,20,"#475569");});
  } else if (spec.type === "questions") {
    spec.items.forEach((v,i)=>{const col=i<4?0:1,row=i<4?i:i-4,x=80+col*560,y=185+row*120;s+=card(x,y,510,88)+`<circle cx="${x+44}" cy="${y+44}" r="23" fill="${col?"#7C3AED":"#2563EB"}"/>`+txt(x+44,y+52,String(i+1),20,"#FFFFFF",750,"middle")+txt(x+85,y+53,v,20,"#334155",600);});
  } else if (spec.type === "agents") {
    spec.agents.forEach(([a,b,c],i)=>{const x=65+i*380;s+=card(x,190,310,300,["#93C5FD","#67E8F9","#C4B5FD"][i])+txt(x+30,250,a,27,"#0F172A",750)+txt(x+30,310,b,22,"#1D4ED8",650)+lines(x+30,370,c.split(" · ").map(v=>`• ${v}`),19,"#475569",38);}); s+=card(240,545,720,110,"#FCD34D","#FFFBEB")+lines(600,590,spec.contract.split("\n"),20,"#92400E",34,650);
  } else if (spec.type === "steps") {
    spec.items.forEach(([a,b],i)=>{const y=180+i*110;s+=`<circle cx="120" cy="${y+40}" r="28" fill="#2563EB"/>`+txt(120,y+49,String(i+1),21,"#FFFFFF",750,"middle")+card(175,y,925,82)+txt(205,y+34,a,22,"#0F172A",700)+txt(430,y+34,b,19,"#475569");});
  } else if (spec.type === "redlines") {
    spec.items.forEach((v,i)=>{const col=i%2,row=Math.floor(i/2),x=75+col*550,y=170+row*105;s+=card(x,y,510,78,i<4?"#FCA5A5":"#E2E8F0")+`<circle cx="${x+38}" cy="${y+39}" r="17" fill="#DC2626"/>`+txt(x+38,y+46,"!",20,"#FFFFFF",750,"middle")+txt(x+72,y+48,v,19,"#334155",600);});
  } else if (spec.type === "conversion") {
    spec.pairs.forEach(([a,b],i)=>{const y=175+i*88;s+=card(80,y,420,64,"#E2E8F0")+card(700,y,420,64,"#BFDBFE","#EFF6FF")+txt(290,y+41,a,19,"#475569",600,"middle")+`<line x1="520" y1="${y+32}" x2="680" y2="${y+32}" stroke="#2563EB" stroke-width="4" marker-end="url(#arrow)"/>`+txt(910,y+41,b,19,"#1D4ED8",700,"middle");});
  } else if (spec.type === "calendar") {
    spec.weeks.forEach(([a,b,c],i)=>{const x=70+i*280;const titleParts=b.includes(" Skill")?[b.replace(" Skill",""),"Skill"]:b.length>10?[b.slice(0,10),b.slice(10)]:[b];s+=card(x,200,250,455,["#93C5FD","#67E8F9","#C4B5FD","#FCD34D"][i])+badge(x+30,255,a,["#2563EB","#0891B2","#7C3AED","#D97706"][i])+lines(x+30,330,titleParts,22,"#0F172A",34,700)+lines(x+30,420,c.split("、").map(v=>`• ${v}`),18,"#475569",42);});
  }
  s += txt(1130,765,"内容已核验 · 2026-07-18",16,"#94A3B8",400,"end");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800">${s}</svg>`;
}

await fs.mkdir(outDir, { recursive: true });
const requestedIds = new Set(process.argv.slice(2));
const selectedSpecs = requestedIds.size ? specs.filter((spec) => requestedIds.has(spec.id)) : specs;
for (const spec of selectedSpecs) {
  await sharp(Buffer.from(render(spec))).png({ compressionLevel: 9 }).toFile(path.join(outDir, `${spec.id}.png`));
}
console.log(`Generated ${selectedSpecs.length} content-rich visuals in ${outDir}`);
