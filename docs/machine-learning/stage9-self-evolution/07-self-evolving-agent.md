# 自进化 Agent 与 Gödel 之梦：当代码层自进化照进现实

<!--
调研来源：
1. "Gödel Machines: Self-Referential Universal Problem Solvers Making Provably Optimal Self-Improvements" (Schmidhuber, arxiv cs/0309048) — 自指 + 可证明进步 + 证明验证器，自改进的理论极限
2. "Darwin Gödel Machine: Open-Ended Evolution of Self-Improving Agents" (Sakana AI + UBC, arxiv 2505.22954, 2025) — 放弃"可证明进步"，改用"实证评估 + 开放式探索"，agent 改写自己的 Python 代码
3. "The AI Scientist: Towards Fully Automated Open-Ended Scientific Discovery" (Sakana AI, 2024; v2 经同行评审，Nature 报道) — 自动科研 agent：生想法→实验→写论文→自评审
4. "Paired Open-Ended Trailblazer (POET)" (Wang/Lehman/Clune/Stanley, Uber AI Labs, arxiv 1901.01753) — 开放式进化：环境和 agent 共同进化，持续产生新颖性
5. "Gödel Agent: A Self-Referential Framework for Recursively Self-Improving Agents" (OpenReview) — 递归自改进 agent 框架
6. Yohei Nakajima "Better Ways to Build Self-Improving AI Agents" — 实践者视角的自改进 agent 分类

核心发现：代码层自进化是自进化五层级的最高层——修改对象是 agent 系统本身的实现代码，不是权重、不是 prompt。Schmidhuber 2003 年的 Gödel Machine 给出了理论上的理想形态：agent 改自己前必须先证明"改了之后确实更好"（用一个内嵌的证明验证器）。但这个理想在工程上几乎无法实现——证明"一个神经网络改了会更好"比登天还难。Darwin Gödel Machine（2025）的关键贡献是务实地放弃了"可证明"，改用"实证评估"：让 agent 改写自己的代码，然后在任务集上跑一遍看分数涨没涨，涨了就留。一个常被忽略的认知缺口：很多人把 Darwin Gödel 当成"Gödel Machine 的工程实现"，其实它在哲学上是对立的——Schmidhuber 要求"可证明的进步"恰恰是为了避免自我修改失控，DGM 放弃证明、纯靠实证，等于把安全开关从"证明"换成了"评估"，这背后是对"什么算进步"这个问题的根本重新定义（从形式正确到经验有效）。
-->

**TL;DR：** 当 agent 开始改写自己的实现代码，自进化到达最高层——代码层。Schmidhuber 2003 年的 Gödel Machine 是理论理想：改自己前必须先证明"改了更好"。Darwin Gödel Machine（Sakana AI，2025）务实放弃了"可证明"，改用"实证评估 + 开放式探索"，让 agent 改写自己的 Python 代码、跑任务、留更优版本。AI Scientist 把这套思路推到科研全流程，POET 则从另一个方向回答"进化为什么要收敛到最优"。本篇给一个最简的 self-modifying agent 骨架。

## 为什么这很重要

前面三篇讲的自进化，改的都是"模型的内部"：

- 参数层（STaR、Self-Rewarding）：改权重。
- 策略层（自博弈）：改行为策略。
- prompt 层（OPRO、DSPy）：改指令文本。

但一个真实的 agent 系统不只是模型——它还包括：怎么调用工具、怎么拆解任务、怎么管理记忆、怎么决定什么时候停止。这些是用**代码**写的。prompt 再怎么优化，如果 agent 的任务拆解逻辑（代码）本身是低效的，天花板就在那里。

代码层自进化问的是：**能不能让 agent 改自己的代码？**

```
┌──────────────────────────────────────────────────────────┐
│            自进化五层级：从微观到宏观                       │
│                                                          │
│   参数层      │→  改权重（STaR、Self-Rewarding）          │
│   结构层      │→  改网络架构（NEAT、NAS）                  │
│   策略层      │→  改行为策略（自博弈、AlphaZero）          │
│   prompt 层   │→  改指令（OPRO、DSPy、TextGrad）          │
│   代码层 ★    │→  改 agent 系统的实现代码                  │
│                                                          │
│   越往上，"修改对象"越接近系统的整体；                     │
│   越往上，自我修改的"杠杆"越大，风险也越大                  │
└──────────────────────────────────────────────────────────┘
```

代码层是最高层，也是杠杆最大的一层——改一行 agent 的调度逻辑，可能比改一万个权重参数效果还大。但它也是风险最大的一层：一旦 agent 改错自己的代码，整个系统可能崩。

这一层有两个里程碑：2003 年 Schmidhuber 的 Gödel Machine（理论）和 2025 年 Sakana AI 的 Darwin Gödel Machine（工程突破）。理解这两个的关系，是理解代码层自进化的钥匙。

## 核心概念

### Gödel Machine：理论理想——"可证明的进步"

Schmidhuber 2003 年提出的 Gödel Machine 是代码层自进化的理论原型。它的核心是一个看似苛刻的规则：**agent 可以修改自己的任何部分（包括改自己的代码、改自己的学习算法），但前提是它必须先用一个内置的证明验证器，证明"这次修改会让未来的总收益更大"。**

```
┌─────────────────────────────────────────────────────┐
│              Gödel Machine 的自我修改规则              │
│                                                     │
│   agent 想改自己的代码 C → C'                        │
│         │                                           │
│         ▼                                           │
│   【证明验证器】尝试证明定理：                        │
│   "从现在起，运行 C' 的期望总收益 > 运行 C"           │
│         │                                           │
│         ├── 证明成功 → 应用 C'（允许自我修改）         │
│         └── 证明失败 → 放弃 C'，保持 C                │
│                                                     │
│   关键：进步必须是"可证明的"，不是"看起来更好"          │
└─────────────────────────────────────────────────────┘
```

为什么要这么严？因为自我修改是危险的——agent 可能为了眼前的局部收益，改出一个长期灾难性的自己。Schmidhuber 的洞察是：**如果每一次自我修改都能被证明是"全局更优"的，那 agent 就永远不会倒退，只会单调变好。** 这是一种理论上的"安全开关"。

Gödel Machine 的优美在于它的自指性：证明验证器本身也是 agent 代码的一部分，所以 agent 也能改证明验证器——但改它同样需要先证明"改了更好"。这构成了一个自洽的、不会失控的自我修改框架。

Gödel Machine 的问题也很明显：**它几乎无法实现**。要证明"一个神经网络改了某行代码后会更好"，需要对这个网络的行为做形式化推理，而神经网络本质上是黑盒，做不了这种证明。所以 Gödel Machine 长期是一个思想实验，没有真实实现。

### Darwin Gödel Machine：工程突破——放弃证明，改用实证

Darwin Gödel Machine（DGM，Sakana AI + UBC，arxiv 2505.22954，2025）做了一个关键决断：**放弃"可证明的进步"，改用"实证评估"**。

DGM 是一个编程 agent。它的循环：

```
┌─────────────────────────────────────────────────────┐
│              Darwin Gödel Machine 循环                │
│                                                     │
│   当前 agent（一段 Python 代码 C）                     │
│         │                                           │
│         ▼                                           │
│   在一组编程任务上跑 C，记录分数                       │
│         │                                           │
│         ▼                                           │
│   让 LLM 看自己的代码 C + 任务表现，提议一个变体 C'     │
│   （开放式探索：不只优化单一指标，鼓励新颖性）           │
│         │                                           │
│         ▼                                           │
│   在同样的任务集上跑 C'，对比分数                      │
│         │                                           │
│         ├── C' 更好 → 保留 C'，成为新的当前 agent      │
│         └── C' 更差 → 放弃，但记录在"家谱"里           │
│         │                                           │
│         └────── 用新 agent 进入下一轮 ────▶           │
│                                                     │
│   关键：进步是"实证测出来"的，不是"证明出来"的          │
└─────────────────────────────────────────────────────┘
```

DGM 放弃证明换来的是**可工程化**。LLM 写代码、跑测试、看分数——这套流程今天就能做。DGM 论文的关键结果：经过若干代自我改写，agent 在编程任务上的表现持续提升，而且这种提升是"开放式"的——agent 不仅在具体任务上变强，它的"自我改进能力"本身也在变强（meta-improvement）。

DGM 维护一棵"家谱"（lineage）：每一代 agent 的代码版本都存着，形成一个不断分叉的进化树。这呼应了 Darwin 的名字——它不是梯度下降式的收敛到一个最优解，而是达尔文式的开放进化，保留多样性。

### 为什么 Gödel 和 Darwin 是对立的，又都不可或缺

这里要讲清楚一个容易被误读的点。很多人把 DGM 当成"Gödel Machine 的工程实现"。其实在哲学上，**两者是相反的**：

- **Gödel Machine**：进步必须是**形式上可证明**的。安全来自"证明保证不会倒退"。
- **Darwin Gödel Machine**：进步是**经验上测出来**的。安全来自"实证检验 + 只留更好的"。

Schmidhuber 要求证明，恰恰是因为他不信任"看起来更好"——一个修改可能短期涨分、长期崩盘。DGM 放弃证明、纯靠实证，等于接受了"我们没法形式化保证，只能尽量测准"。

这两种取向对应着对"什么算进步"这个根本问题的不同回答：形式正确 vs 经验有效。今天的工程实践（包括 DGM、AI Scientist）都倒向了后者，因为前者在神经网络时代不可行。但前者的价值在于它划出了安全的理论边界——告诉我们"理想的自改进应该长什么样"，即使现在达不到。

### AI Scientist：把自改进推到科研全流程

AI Scientist（Sakana AI，2024；v2 在 2025 年经同行评审）把代码层自进化的思路推到了一个完整的工作流：**自动做科研**。

AI Scientist 的流水线：

```
生想法（idea generation）
    ↓
写代码做实验（experiment execution）
    ↓
分析结果（result analysis）
    ↓
写论文（paper writing, LaTeX）
    ↓
自评审（automated review，模拟同行评审）
    ↓
根据评审意见修改 → 最终论文
```

AI Scientist v2 做到了一件里程碑式的事：它自动生成的一篇论文，经过真实的同行评审，被一个 workshop 接收。这是第一篇完全由 AI 生成、通过同行评审的论文。

但要诚实：独立评估（ACM 的 "Bold Claims, Mixed Results"）指出，AI Scientist 在**结构**上很强（论文格式、实验流程、写作规范都像模像样），但在**新颖性**上有限——它生成的想法大多是已有工作的组合或小改进，真正的突破性创新很少。这符合自进化的现状：自动化能放大已有能力，但凭空创造根本性新知识，目前还做不到。

### Open-Ended Evolution / POET：进化的另一种可能

DGM 和 AI Scientist 都隐含一个目标：让系统"变得更好"。但开放式进化（Open-Ended Evolution）问的是一个更根本的问题：**进化一定要收敛到某个"最优"吗？**

POET（Paired Open-Ended Trailblazer，Uber AI Labs，2019）给出了一个反直觉的答案：**不一定，而且不收敛可能更好**。

POET 的设计：同时进化**环境**和**agent**。环境是一组难度递增的地形，agent 是在这些地形上行走的小车神经网络。关键在于，POET 不只优化"走得多远"这个单一指标，而是优化"新颖性"——鼓励产生前所未见的地形和前所未见的行走方式。

```
传统优化：     固定目标 → 收敛到最优解
开放式进化：   目标本身也在变 → 持续产生新颖性，不收敛
              （像生物进化：没有"最优生物"，只有不断涌现的新物种）
```

POET 的灵感来自 Kenneth Stanley 的 novelty search：**有时候不追求目标、只追求新颖，反而能更好地找到好解**。因为死盯目标容易卡在局部最优，而探索新颖性能发现意想不到的"垫脚石"（stepping stones）。

POET 和 DGM 的联系：DGM 的"开放式探索"（不只优化单一指标，鼓励新颖的代码变体）正是受了 POET 这类开放式进化工作的影响。DGM 的家谱保留了多样性的分支，而不是收敛到单一最优 agent——这是开放式进化的特征。

把 POET 并入本篇的意义在于：它提醒我们，**自进化不等于"越来越强的优化"**。自进化的另一种形态是"越来越多样、越来越新颖"——这可能比单纯的"变强"更接近生物进化的真实样子。

## 工作原理（简化的心智模型）

### 用"修改自己的工作手册"来理解代码层自进化

想象一个工人有一本《工作手册》（agent 的代码），手册里写着他怎么干活：先做什么、后做什么、遇到问题怎么办。

**参数层自进化**（前几篇）：工人反复练习同一个动作，让肌肉记忆（权重）更熟练。手册本身没变。

**prompt 层自进化**：工人在手册开头加一句"做事前先深呼吸"（prompt）。动作流程没变，但有了更好的引导。

**代码层自进化**（本篇）：**工人自己改写手册**。他觉得"先做 A 再做 B"效率低，改成"先做 B 再做 A"——这是改工作流程本身。

```
Gödel Machine 版工人：
  改手册前，先在脑子里用逻辑证明"改了之后总产量一定更高"。
  证明不出来就不改。
  （极度安全，但几乎改不动——证明太难了）

Darwin Gödel Machine 版工人：
  改手册后，先试做一天看产量。
  产量涨了就保留新手册，产量跌了就换回旧的。
  （实际能跑，但可能被短期波动骗）

AI Scientist 版工人：
  不只改自己的手册，还自己研究"怎么写更好的手册"，
  然后把研究成果（论文）发表出来。
  （把自改进本身变成了输出）
```

三种工人的共同点：**他们都在修改"怎么干活的方法"，而不是"干活的力气"**。这就是代码层自进化的本质——改的是元层面（meta-level），不是对象层面。

## 工作原理（详细机制）

### 一、self-modifying agent 的最小骨架

一个能改写自己的 agent，至少需要四个部件：

1. **可序列化的自身代码**：agent 的逻辑是一段可读、可改的代码（Python），不是黑盒。
2. **变异生成器**：一个 LLM，看着当前代码 + 任务表现，提议代码变体。
3. **评估器**：在任务集上跑代码变体，给出分数。
4. **版本管理**：保留历史版本，支持回滚，维护进化树。

```python
# self-modifying agent 的概念骨架（简化）

class SelfModifyingAgent:
    def __init__(self, code: str):
        self.code = code              # agent 自己的实现代码（字符串）
        self.history = [(code, None)] # 进化历史：(代码, 分数)

    def evaluate(self, tasks) -> float:
        """在任务集上跑当前代码，返回平均分。"""
        # 把 self.code 动态加载为一个可调用对象，在 tasks 上跑
        agent_fn = self._load_code(self.code)
        scores = [agent_fn(task) for task in tasks]
        return sum(scores) / len(scores)

    def propose_variant(self) -> str:
        """让 LLM 看当前代码 + 最近表现，提议一个变体。"""
        prompt = f"""你是一个 agent 代码优化器。

当前 agent 代码：
```
{self.code}
```

最近的任务得分：{[s for _, s in self.history[-3:]]}

请生成一个**修改后的** agent 代码版本，目标是让它在任务上表现更好。
只输出新代码，不要解释。"""
        return llm_call(prompt)

    def self_improve_step(self, tasks):
        """一步自我改进。"""
        current_score = self.evaluate(tasks)
        variant = self.propose_variant()
        # 临时切换到变体评估
        old_code = self.code
        self.code = variant
        variant_score = self.evaluate(tasks)

        if variant_score > current_score:
            self.history.append((variant, variant_score))
            return True   # 接受
        else:
            self.code = old_code
            self.history.append((variant, variant_score))  # 也记录，供分析
            return False  # 拒绝
```

这个骨架里你能看到本系列反复出现的统一四步循环：`evaluate` 是采集信号，`propose_variant` 是生成变异，分数比较是选择评估，覆盖 `self.code` 是回写自身。

### 二、开放式探索 vs 贪心优化

上面这个骨架是**贪心**的：只接受分数更高的变体。DGM 的关键改进是加入**开放式探索**——不只看分数，还看**新颖性**。

```python
# 贪心版（容易卡在局部最优）
def greedy_accept(variant_score, current_score):
    return variant_score > current_score

# 开放式版（鼓励新颖性，允许暂时"变差"但探索新方向）
def open_ended_accept(variant, history, variant_score, current_score,
                      novelty_weight=0.3):
    # 新颖性：变体和历史代码的差异程度（用编辑距离或语义相似度）
    novelty = compute_novelty(variant, [c for c, _ in history])
    # 综合分 = 任务分 + 新颖性加权
    combined = variant_score + novelty_weight * novelty
    return combined > current_score
```

开放式探索的价值：避免卡在局部最优。纯贪心的 agent 会收敛到一个"在当前任务集上最好"的版本，丧失适应性。加入新颖性后，agent 会保留一些"分数没那么高但行为很不一样"的分支——这些分支在面对新任务时可能反而更好。

这是 POET / novelty search 的核心洞察：**有时候不追求眼前的最优，反而能在长期找到更好的解**。

### 三、为什么代码层自进化比参数层"杠杆更大"

一个直觉：改一行 agent 代码的效果，可能比微调一万个参数还大。为什么？

参数微调改的是"模型对输入的响应方式"——这是连续的、小幅的。改 agent 代码改的是"系统怎么组织模型"——这是离散的、结构性的。比如：

- 把"模型一次生成完整答案"改成"模型先生成草稿，再自我批评，再修正"——这是加了一个反思环节，可能让准确率提升几十个百分点。
- 把"模型读完所有上下文再回答"改成"模型先检索再回答"——这是从直答变成 RAG，能力上限完全不同。

这些改动用参数微调做不到（它们是结构性的，不是连续的），但用代码层自进化可以做到。这就是代码层的杠杆——它改的是"怎么用模型"，而不是"模型本身"。

代价是风险也更大：参数微调改坏了，最多模型变笨一点；代码改坏了，整个 agent 可能崩溃或做出危险行为。这也是为什么 Schmidhuber 当年坚持要"可证明的进步"。

## 代码示例

下面实现一个**最简的 self-modifying agent 骨架**，完整演示"agent 改写自己的代码→评估→保留更优的→迭代"。为了让它能真正跑起来，我们用一个极简的 agent 代码（就是一个数学计算的函数），并安全地动态加载。

```python
"""
最简 self-modifying agent
- agent 是一段 Python 代码（一个函数 solve(task) -> answer）
- 每轮：让 LLM 提议一个改写版本 → 在任务集上评估 → 保留更优的
- 安全地动态加载代码（沙箱化）

替换 llm_call 即可真实运行。
"""

import ast
import textwrap
from typing import List, Tuple, Callable, Optional


# ============================================================
# 第 0 步：LLM 调用占位
# ============================================================
def llm_call(prompt: str) -> str:
    """替换成你的 API 调用。"""
    raise NotImplementedError("请替换成你的 LLM API 调用")


# ============================================================
# 第 1 步：agent 的初始代码（一段可改写的 Python）
# ============================================================
# agent 就是一个函数：solve(task) -> answer
# task 是一个 dict，比如 {"q": "12+7=?", "a": "19"}
# answer 是模型/agent 给出的答案

INITIAL_AGENT_CODE = '''
def solve(task):
    """最朴素的 agent：直接返回一个固定答案。"""
    # 初始版本：很笨，什么都不算
    return "0"
'''


# ============================================================
# 第 2 步：安全的代码加载（沙箱化）
# ============================================================
def safe_load_agent(code: str) -> Optional[Callable]:
    """
    安全地把一段代码字符串加载成可调用的 solve 函数。

    安全措施：
    1. 用 ast.parse 检查语法（拒绝恶意代码）
    2. 在受限的命名空间里 exec
    3. 禁止 import（真实场景要做更严格的沙箱，比如 subprocess + 容器）
    """
    try:
        tree = ast.parse(code)
    except SyntaxError:
        return None

    # 检查：不允许 import 语句（简化版沙箱，真实场景要用容器隔离）
    for node in ast.walk(tree):
        if isinstance(node, (ast.Import, ast.ImportFrom)):
            return None

    namespace = {"__builtins__": {"len": len, "range": range, "int": int,
                                   "str": str, "float": float, "sum": sum,
                                   "abs": abs, "min": min, "max": max,
                                   "print": print}}
    try:
        exec(code, namespace)
        return namespace.get("solve")
    except Exception:
        return None


# ============================================================
# 第 3 步：评估器 —— 在任务集上跑 agent，算准确率
# ============================================================
TASKS: List[dict] = [
    {"q": "12+7=?", "a": "19"},
    {"q": "25-9=?", "a": "16"},
    {"q": "6*8=?", "a": "48"},
    {"q": "100/4=?", "a": "25"},
    {"q": "3**2+4**2=?", "a": "25"},
]


def evaluate_agent(solve_fn: Callable, tasks: List[dict]) -> Tuple[float, List]:
    """跑任务集，返回 (准确率, 明细)。"""
    if solve_fn is None:
        return 0.0, []
    details = []
    correct = 0
    for task in tasks:
        try:
            answer = str(solve_fn(task)).strip()
            ok = answer == task["a"]
        except Exception:
            answer, ok = "ERROR", False
        details.append((task["q"], task["a"], answer, ok))
        correct += int(ok)
    return correct / len(tasks), details


# ============================================================
# 第 4 步：变异生成器 —— 让 LLM 改写 agent 代码
# ============================================================
def propose_variant(current_code: str, recent_scores: List[float],
                    recent_details: List) -> str:
    """让 LLM 看当前代码 + 表现，提议一个改写版本。"""
    wrong_examples = [
        f"题:{q} 正确:{a} agent答:{ans}"
        for q, a, ans, ok in recent_details
        if not ok
    ][:3]

    prompt = f"""你是一个 agent 代码优化器。

当前 agent 的 Python 代码：
```python
{textwrap.indent(current_code, '    ')}
```

最近的任务准确率：{recent_scores[-3:] if recent_scores else '无'}

agent 答错的例子：
{chr(10).join(wrong_examples) if wrong_examples else '无'}

任务格式：每个 task 是一个 dict，有 "q"（问题，含算式）和 "a"（标准答案，字符串）。
solve(task) 必须返回答案字符串。

请生成一个**改进后的** agent 代码。只输出完整的 Python 代码（def solve(task): ...），
不要任何解释或 markdown 标记。"""
    try:
        return llm_call(prompt)
    except NotImplementedError:
        # 没接 API 的退化：拼一个稍微聪明点的版本
        return '''
def solve(task):
    q = task["q"]
    # 尝试提取算式并计算
    expr = q.replace("=?", "").replace("=", "")
    try:
        return str(int(eval(expr)))
    except Exception:
        return "0"
'''


# ============================================================
# 第 5 步：主循环
# ============================================================
def self_modify(n_rounds: int = 4):
    """agent 自我改进主循环。"""
    current_code = INITIAL_AGENT_CODE
    solve_fn = safe_load_agent(current_code)
    score, details = evaluate_agent(solve_fn, TASKS)
    history = [(current_code, score)]

    print("Self-Modifying Agent")
    print("=" * 60)
    print(f"初始准确率: {score:.2f}")
    for q, a, ans, ok in details:
        print(f"  {'✓' if ok else '✗'} {q} → agent答:{ans} (正确:{a})")

    for rnd in range(1, n_rounds + 1):
        # 变异
        variant_code = propose_variant(current_code,
                                        [s for _, s in history], details)
        # 清理 markdown 标记
        variant_code = variant_code.strip()
        if variant_code.startswith("```"):
            variant_code = variant_code.split("\n", 1)[1].rsplit("```", 1)[0]

        variant_fn = safe_load_agent(variant_code)
        variant_score, variant_details = evaluate_agent(variant_fn, TASKS)

        # 选择
        if variant_score > score:
            current_code = variant_code
            score = variant_score
            details = variant_details
            tag = " ★ 接受"
        else:
            tag = " 拒绝"

        history.append((variant_code, variant_score))
        print(f"\nRound {rnd}: 变体准确率={variant_score:.2f}{tag} "
              f"(当前最优={score:.2f})")

    print("\n" + "=" * 60)
    print(f"最终准确率: {score:.2f}")
    print("最终 agent 代码:")
    print(current_code)
    return current_code, history


if __name__ == "__main__":
    self_modify(n_rounds=4)
```

这个实现里有几个关键的工程细节，正是 DGM 这类系统真正要处理的：

- **代码的安全加载**。agent 改出来的代码是字符串，要变成可执行函数。真实系统会用容器隔离、资源限制、超时控制，避免恶意/错误代码搞崩宿主。这里的 `safe_load_agent` 是极简版。
- **变异的清理**。LLM 经常在代码外面包 markdown 标记或加解释，要做后处理。
- **失败容错**。变体代码可能有语法错、运行时崩，评估器必须捕获异常，给 0 分而不是崩掉整个循环。
- **历史的保留**。即使变体被拒绝，也记录下来——DGM 的家谱就是这样，被拒绝的变体可能在未来提供灵感（开放式探索）。

把这个骨架扩展，加上多任务、新颖性指标、并行变异、进化树管理，就接近 DGM 的形态了。

## 真实案例

### 案例 1：Darwin Gödel Machine 的开放式自我改进

Sakana AI 的 DGM 论文（arxiv 2505.22954）展示了：一个编程 agent 经过若干代自我改写，在编程 benchmark 上的表现持续提升。值得注意的两点：

- 提升是**开放式**的，没有预设的收敛目标——agent 持续探索新的代码变体。
- 出现了 **meta-improvement**：agent 不仅在具体任务上变强，它"自我改进的效率"也在提升（比如它学会了自己写出更高效的自我评估逻辑）。

DGM 的局限（论文诚实写了）：算力消耗大（每代要在任务集上跑很多次）、评估有噪声（任务集小，分数波动）、目前只在编程任务上验证过。

### 案例 2：AI Scientist 通过同行评审

AI Scientist v2（2025）自动生成的一篇论文，经过真实的同行评审，被一个 ICML workshop 接收。这是代码层自进化的一个里程碑——不只是 agent 在改自己的代码，而是 agent 在自动化整个知识生产流程。

但独立评估（"Bold Claims, Mixed Results"）指出：AI Scientist 的论文在**结构和执行**上专业，但在**新颖性**上有限。它擅长组合已有方法，不擅长提出根本性新思想。这划出了当前代码层自进化的一个边界：自动化能放大已有能力，凭空创造新知识还做不到。

### 案例 3：POET 的环境-agent 共同进化

POET（Uber AI Labs）展示了开放式进化的另一种形态：环境（地形）和 agent（小车神经网络）同时进化。结果是产生了一系列越来越复杂的地形，以及能在这些地形上行走的、行为各异的 agent。关键发现是，**有些在简单地形上表现一般的 agent，被迁移到复杂地形后反而表现最好**——因为它们探索了不同的行走策略。

POET 的启示：纯贪心的优化会丢掉这些"看起来一般但有潜力"的解。开放式进化通过保留多样性，为未来的适应性留下了空间。这个思路直接影响了后来的 DGM。

### 案例 4：Yohei Nakajima 的自改进 agent 分类

Yohei Nakajima（AutoGPT 作者）在《Better Ways to Build Self-Improving AI Agents》里把自改进 agent 分成几类：优化 prompt 的、优化工具使用的、优化代码的、优化记忆的。这个分类和本系列的自进化五层级是呼应的——不同的"修改对象"对应不同的自改进路径。他的实践观察是：**目前最实用的是优化 prompt 和工具使用，优化代码（DGM 路线）最有潜力但也最难控制**。

## 权衡取舍以及何时不该使用

### 算力墙

代码层自进化每代要在任务集上跑很多次评估，成本高。DGM 跑一代可能要几百到几千次 LLM 调用。任务集一大、代数一多，账单会很大。这是目前代码层自进化上不了大规模生产的主要原因。

### 评估困难

"agent 变好了吗"这个问题比"模型变好了吗"难回答得多。模型有标准 benchmark，agent 的好坏依赖具体任务场景。评估集设计得不好，自改进可能往错误方向走（下一篇会详细讲 reward hacking）。

### 自我改进收益递减

DGM 等系统的实测显示，前几代提升明显，后面会进入平台期——容易改的都被改了，剩下的都是难啃的。这和所有优化算法的收益递减规律一致。指望"无限自我改进直到 AGI"是不现实的（见下一篇的边界讨论）。

### 安全性

代码层自进化最让人担心的地方：agent 改出来的代码可能做意料之外的事。Schmidhuber 当年坚持"可证明的进步"，就是为了这个。DGM 放弃证明后，安全主要靠沙箱（限制代码能访问什么）和评估（只留分数更高的）。但如果评估指标本身有问题，agent 可能改出一个"分数高但行为危险"的自己。这是下一篇要讲的核心风险。

### 何时不该用

- **任务简单、固定**：手写 agent 代码更可靠，自改进的收益不抵风险。
- **没有可靠的评估集**：自改进转不动——不知道什么是"更好"。
- **安全要求极高**：在医疗、金融、自动驾驶这类领域，让 agent 改自己的代码风险太大，目前不可接受。

## 关键要点

1. **代码层是自进化的最高层，杠杆最大、风险也最大**。它改的是"agent 系统怎么组织模型"，是结构性的、离散的改动，效果可能比参数微调大得多，但也可能让整个系统崩。

2. **Gödel Machine 是理论理想：改自己前必须先证明"改了更好"**。Schmidhuber 用一个内置证明验证器保证自我修改单调变好。它优美但几乎无法实现——神经网络的黑盒性质让形式化证明不可行。

3. **Darwin Gödel Machine 务实放弃了"可证明"，改用"实证评估 + 开放式探索"**。它让 agent 改写自己的 Python 代码、跑任务、留更优版本，维护一棵进化树。这和 Gödel Machine 在哲学上是对立的——从"形式正确"转向"经验有效"。

4. **AI Scientist 把代码层自进化推到科研全流程**：生想法→实验→写论文→自评审。v2 通过了同行评审，但独立评估显示新颖性有限——自动化能放大已有能力，凭空创造新知识还做不到。

5. **POET 和开放式进化提供了另一个视角：自进化不一定要收敛到最优，持续产生新颖性可能是更好的目标**。novelty search 的洞察是：死盯目标容易卡局部最优，探索新颖性反而能找到垫脚石。

6. **代码层自进化目前的天花板是算力、评估和安全**。下一篇（边界与风险）会系统讨论这些——尤其是 agent 改自己改出 reward hacking 和自我欺骗的根本风险。

## 延伸阅读

**Gödel Machine**：
- "Gödel Machines: Self-Referential Universal Problem Solvers Making Provably Optimal Self-Improvements"（Schmidhuber, arxiv cs/0309048）
- IDSIA Gödel Machine 主页（idsia.ch/~juergen/goedelmachine.html）

**Darwin Gödel Machine**：
- "Darwin Gödel Machine: Open-Ended Evolution of Self-Improving Agents"（arxiv 2505.22954, Sakana AI + UBC）
- sakana.ai/dgm —— 官方博客与可视化
- jennyzzt/dgm（GitHub）—— 官方实现

**AI Scientist**：
- "The AI Scientist: Towards Fully Automated Open-Ended Scientific Discovery"（Sakana AI, 2024）
- AI Scientist v2（2025）—— 通过同行评审的版本，Nature 有报道
- "Bold Claims, Mixed Results"（ACM）—— 独立评估，诚实指出局限

**开放式进化**：
- "Paired Open-Ended Trailblazer (POET)"（arxiv 1901.01753, Uber AI Labs）
- Kenneth Stanley "Why Greatness Cannot Be Planned"—— novelty search 的通俗读物
- Enhanced POET（Wang et al., PMLR 2020）—— POET 的扩展

**综述与实践**：
- "A Survey of Self-Evolving Agents"（arxiv 2507.21046）
- Yohei Nakajima "Better Ways to Build Self-Improving AI Agents"（yoheinakajima.com）
- "Gödel Agent: A Self-Referential Framework for Recursively Self-Improving Agents"（OpenReview）

<!-- CONTACT-START -->
<!-- Auto-generated by scripts/inject-contact.sh — 单一真实源: docs/_snippets/contact.html -->
<div align="center">

**「阿新聊 AI」同步更新，欢迎关注**

<br>

<table>
<tr>
<td align="center">📢<br><b>微信公众号</b><br>阿新聊ai</td>
<td align="center">🎵<br><b>抖音</b><br>阿新聊ai</td>
<td align="center">📕<br><b>小红书</b><br>阿新聊ai</td>
<td align="center">💬<br><b>微信</b><br>mindcarver</td>
</tr>
</table>

🌐 AI 社区 · <a href="https://91aihub.com/">91aihub.com</a>

</div>
<!-- CONTACT-END -->
