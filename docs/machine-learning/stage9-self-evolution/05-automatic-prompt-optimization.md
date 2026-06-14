# 让模型优化自己的 prompt：OPRO、DSPy 与 TextGrad——prompt 层的自进化

<!--
调研来源：
1. "Large Language Models as Optimizers" (OPRO, arxiv 2309.03409, Google DeepMind) — LLM 当优化器，把 prompt 当优化变量
2. DSPy 官方文档与 GEPA 优化器文档 (dspy.ai) — 声明式编程 + 编译 + 自动优化
3. "GEPA: Reflective Prompt Optimization" — DSPy 反思式 prompt 优化，比 MIPROv2 高 10%+、比 GRPO 高 20%（35× 更少 rollout）
4. "TextGrad: Automatic Differentiation via Text" (arxiv 2406.07496, Stanford Zou Group) — 文本反馈当梯度，反向传播到 prompt
5. Arize AI / Decagon 的 GEPA 基准实测 — 生产场景下 GEPA 的成本与收益
6. Stanford HAI "TextGrad: AutoGrad for Text" — PyTorch 式 API 的设计动机

核心发现：prompt 层自进化在 2023-2025 已经是三条独立成熟的技术路线。OPRO 把 LLM 当黑盒优化器，最直观、最容易复现；DSPy 把 prompt 工程变成可编译的声明式程序，工程化最强；TextGrad 把"文本反馈"抽象成可反向传播的梯度，最接近"端到端优化"的直觉。三者上手成本递增，自动化程度也递增。一个关键认知缺口：很多人以为"自动优化 prompt"是炼丹玄学，其实它和参数层训练一样遵循统一的四步循环（采集信号 → 生成变异 → 选择评估 → 回写自身），只是"回写自身"的对象从权重变成了指令文本。
-->

**TL;DR：** 让 LLM 自己改写自己的 prompt，是自进化五层级里最易上手的一层。本文对比三条主线：OPRO 把 LLM 当优化器迭代 prompt、DSPy 把 prompt 变成可编译的声明式程序并用 GEPA 自动优化、TextGrad 把文本反馈当梯度反向传播。三条路线都遵循统一的四步循环，区别只在"变异怎么生成、信号怎么采集、回写什么"。文末给一个不依赖任何框架、能直接跑的最简自动 prompt 优化循环。

## 为什么这很重要

写 prompt 这件事长期被当成手艺活。开发者反复试错：改个措辞，跑一遍 benchmark，看分数涨没涨，再改。一个稍微复杂的任务（让模型做数学推理、按格式抽字段、扮演客服按话术回答），调 prompt 花掉一两天很常见。

问题在于，手调 prompt 有两个硬伤：

- **没有梯度**。调神经网络有权重梯度告诉你"往哪改"，调 prompt 全靠人脑猜，方向常常是错的。
- **不可复现、不可版本化**。今天调出来的好 prompt，换了个模型版本可能就失效；团队成员之间也很难交接"为什么这么写"。

2023 年起，出现了一类反直觉的做法：**既然 LLM 本身就擅长理解自然语言指令，那为什么不直接让 LLM 来改 prompt？** 这就是 prompt 层自进化。它对应我们全系列定义的自进化五层级中的第 4 层——修改对象是 prompt（指令文本），信号是任务得分或反馈文本。

```
┌─────────────────────────────────────────────────────────┐
│              prompt 层自进化 vs 参数层自进化              │
│                                                        │
│   参数层（改权重）          prompt 层（改指令）           │
│   ┌──────────┐              ┌──────────┐               │
│   │  模型权重  │  ←梯度        │  prompt  │  ←LLM 反馈    │
│   │  θ (亿级) │              │ (几百字) │               │
│   └──────────┘              └──────────┘               │
│        ▲                        ▲                      │
│        │                        │                      │
│   需要算力/标注              只要 API + 评分函数          │
│   见效慢、不可逆             见效快、可随时回滚           │
│   适合基础能力提升          适合任务适配、格式控制         │
└─────────────────────────────────────────────────────────┘
```

把 prompt 当作一个可优化的"软参数"，是这一层全部方法的共同前提。

## 核心概念

### 统一的四步循环

全系列的自进化都遵循一个循环。在 prompt 层，它长这样：

```
       ┌──────────────────────────────────────────┐
       │              prompt 层自进化循环            │
       └──────────────────────────────────────────┘
                        │
        ① 采集信号  ◀────┴────▶  ② 生成变异
        在任务集上跑          让 LLM 看历史得分，
        当前 prompt，         提议新 prompt 变体
        记录得分/反馈              │
              │                   │
              ▼                   ▼
        ④ 回写自身  ◀────┬────▶  ③ 选择评估
        把更优的 prompt   排序，保留 Top-K，
        设为当前版本      淘汰差的变体
```

OPRO、DSPy、TextGrad 的差异，全在这四步的具体实现上。

### 三条主线一句话区分

| 方法 | 一句话 | 把什么当"梯度" |
|------|--------|--------------|
| **OPRO** | 让 LLM 当黑盒优化器，看历史得分直接写新 prompt | 历史得分序列 |
| **DSPy** | 把 prompt 拆成声明式程序，编译时自动选 demos / 改指令 | 任务指标 + 反思 |
| **TextGrad** | 把文本反馈当梯度，像 PyTorch 一样反向传播到 prompt | LLM 生成的文本"批评" |

注意三者并非互斥。DSPy 的 GEPA 优化器内部就借鉴了"反思"这种文本反馈；TextGrad 也可以优化 DSPy 程序里的指令。它们更像是同一问题（怎么自动改 prompt）的三种不同抽象层级。

## 工作原理（简化的心智模型）

### 用"教练带运动员"来理解三种方法

想象你在训练一个运动员（LLM）跑某个项目（任务）。

**OPRO** = 你请了一个教练（另一个 LLM，或同一个 LLM 换个角色）。教练不看运动员的身体数据，只看一张成绩单：每次比赛跑了多少秒、用了什么姿势（prompt）。教练看完说："上次你让它'仔细想想再回答'跑了 60 分，这次让它'分步骤推理'试试。"教练靠的是语言直觉，不是力学公式。

**DSPy** = 你给运动员设计了一份标准训练手册（声明式程序）。手册里写清楚"做这个动作要用到这几个示范（demos）"。教练（编译器）的工作不是凭空想新动作，而是：从历史训练里挑出最有效的几个示范塞进手册，或者根据哪些动作失败了，反思后改写手册里的动作要领（GEPA）。手册是结构化的，谁都能读懂为什么这么训练。

**TextGrad** = 你给运动员装了个"反馈传感器"。每次跑完，传感器自动生成一份文字批评："起步太慢""最后 10 米姿势变形"。这份批评被一层层往回传——批评传到动作要领，动作要领再决定怎么改 prompt。整个流程模仿 PyTorch 的反向传播，只不过梯度是文字。

三种方法的共同点：**运动员自己不出力，是教练（LLM）在改它的训练方法**。这和参数层自进化（运动员自己长肌肉）是两回事。

## 工作原理（详细机制）

### 一、OPRO：把 prompt 当优化变量，LLM 当优化器

OPRO（Optimization by PROmpting，Google DeepMind，arxiv 2309.03409）的核心思路极为朴素：

1. 维护一个"元 prompt"（meta-prompt），里面列出历史上试过的 prompt 和它们在任务上的得分。
2. 把这个元 prompt 喂给 LLM，让它"提议一个新 prompt，要比之前的得分更高"。
3. 在任务集上评估新 prompt 的得分，把它加进元 prompt 的历史。
4. 循环若干轮，取历史最高分的 prompt。

```
┌─────────────────────────────────────────────────┐
│                  OPRO 循环                        │
│                                                 │
│   元 prompt（累积历史）                            │
│   ┌─────────────────────────────────────────┐   │
│   │ "你是一个 prompt 优化器。                  │   │
│   │  之前试过这些 prompt：                     │   │
│   │  - 'Let's think step by step' → 得分 0.55│   │
│   │  - 'Take a deep breath...'    → 得分 0.62│   │
│   │  请生成一个新 prompt。"                   │   │
│   └─────────────────────────────────────────┘   │
│              │                                   │
│              ▼                                   │
│   [LLM] 生成新 prompt 候选                        │
│              │                                   │
│              ▼                                   │
│   在任务集上跑，得到得分                          │
│              │                                   │
│              ▼                                   │
│   写回历史 → 下一轮                                │
└─────────────────────────────────────────────────┘
```

OPRO 论文里最出圈的结果：在 GSM8K（小学数学）上，PaLM-2 配 OPRO 找到的 prompt（"Take a deep breath and work through this problem step by step"）比人类手写的经典 chain-of-thought prompt 高了几个百分点；在 Big-Bench 的某些任务上提升高达 50%。

OPRO 的价值不在绝对分数（后来的模型本身变强了），而在它证明了：**"让 LLM 自己优化 prompt"这件事可行，而且能超过人**。它把 prompt 从"手艺"变成了"优化问题"。

OPRO 的局限也很明显：

- 每轮要跑整个任务集评估，开销大。
- 元 prompt 历史会越来越长，后期容易被早期低分 prompt 干扰。
- LLM 当优化器没有真正的梯度，本质是启发式搜索，容易卡在局部最优。

### 二、DSPy：声明式编程 + 编译/自动优化

DSPy（Declarative Self-improving Python，Stanford NLP）换了个更工程化的思路：与其每次都从零优化一整段 prompt，不如把 prompt 拆成可组合的部件，像写代码一样写"prompt 程序"，再用编译器自动优化。

DSPy 的三个核心抽象：

- **Signature（签名）**：声明输入输出，比如 `"question -> answer"`，不写具体指令。
- **Module（模块）**：像 PyTorch 的 `nn.Module`，把多个 signature 组合成流程，比如 `ChainOfThought`。
- **Optimizer（优化器/Teleprompter）**：编译时自动改写模块——挑选 few-shot 示例（`BootstrapFewShot`）、改写指令文本（`MIPROv2`、`GEPA`）。

```python
# DSPy 的"声明式"是什么意思：你只说做什么，不说怎么做
import dspy

# 不写 prompt，只声明签名
class QA(dspy.Signature):
    """回答数学问题。"""
    question: str = dspy.InputField()
    answer: str = dspy.OutputField()

# 组装成模块
solver = dspy.ChainOfThought(QA)

# 这一步之后，DSPy 会自动优化 solver 内部的 prompt
```

DSPy 的优化器演进路径值得记住：

- **BootstrapFewShot**（早期）：自动挑选在训练集上答对的例子作为 few-shot demos。
- **MIPROv2**：同时优化指令文本和 demos，用贝叶斯搜索。
- **GEPA**（Reflective Prompt Optimization，2024-2025）：让 LLM 反思"哪些例子答错了、为什么"，据此改写指令。根据 Decagon 和 Databricks 的实测，GEPA 比 MIPROv2 高 10% 以上，比 GRPO 这类 RL 方法高约 20%，且用的 rollout 少 35 倍；还能配合更小的模型把推理成本降到原来的几十分之一。

DSPy 的工程价值在于：**优化结果可保存、可加载、可版本化**。优化完的 `solver` 可以序列化成一个文件，团队成员直接复用，不用再"对 prompt"。

DSPy 的代价是学习曲线：要理解 Signature、Module、Optimizer 的概念，初期心智负担比 OPRO 重。

### 三、TextGrad：把文本反馈当梯度

TextGrad（Stanford Zou Group，arxiv 2406.07496）走的是另一条路：把"反向传播"这个隐喻做到极致。

TextGrad 的核心想法：

1. 把整个 LLM 系统当成一个计算图，节点是文本变量（prompt、中间结果、最终输出）。
2. 定义一个"损失函数"——通常是用 LLM 对最终输出打分或批评。
3. 这个损失会以"文本梯度"（textual gradient）的形式反向传播：从输出层往回，每个文本节点都收到一份"应该怎么改"的文字反馈。
4. 用这份反馈让 LLM 改写对应的文本节点（比如 prompt）。

```python
# TextGrad 的 PyTorch 式 API（示意）
import textgrad as tg

# 文本变量，相当于 autograd 的 tensor，requires_grad=True
prompt = tg.Variable(
    "Solve the math problem.",
    requires_grad=True,
)

# 前向：用 prompt 跑任务
output = llm_forward(prompt, question)

# 定义损失：LLM 生成的文本批评
loss_fn = tg.TextLoss("Evaluate if the answer is correct and specific.")
loss = loss_fn(output)

# 反向传播：生成文本梯度，改写 prompt
loss.backward()

# 优化器应用梯度（实际是用 LLM 根据"梯度"重写 prompt）
optimizer.step()
```

TextGrad 的卖点是**通用性**：它可以优化任何文本节点，不只是 prompt——还能优化中间推理步骤、代码片段、甚至（论文里的实验）分子结构描述。它的 API 故意做得像 PyTorch，对熟悉深度学习的人非常友好。

TextGrad 的局限：它依赖"文本梯度"的质量，而 LLM 生成的批评本身可能不准、可能自相矛盾；反向传播链路一长，反馈噪声会累积。

### 三者对比

| 维度 | OPRO | DSPy | TextGrad |
|------|------|------|----------|
| 核心抽象 | 元 prompt + 黑盒优化 | 声明式程序 + 编译器 | 计算图 + 文本梯度 |
| 优化对象 | 整段 prompt | 指令 + few-shot demos | 任意文本节点 |
| 上手成本 | 最低 | 中（要学 Signature/Module） | 中高（要理解反向传播隐喻） |
| 可解释性 | 中（能看到历史 prompt） | 高（程序化、可序列化） | 中（能看到每层梯度） |
| 工程化 | 弱（脚本式） | 强（有保存/加载/版本） | 中（PyTorch 式 API） |
| 适合场景 | 快速实验、单任务 | 生产、复杂多步流程 | 需要优化中间步骤的系统 |

一个实用判断：

- 想快速试一下"自动改 prompt 行不行" → OPRO 思路，写个循环。
- 要上生产、prompt 里有多个步骤、团队协作 → DSPy。
- 系统里有多个文本环节都要优化、想要端到端 → TextGrad。

## 代码示例

下面这个示例**不依赖任何框架**，用纯 Python + 一个 LLM API（这里用 OpenAI 兼容接口的占位函数，换成任意 provider 都行），实现一个最简的 OPRO 式自动 prompt 优化循环。它能直接跑，输出每一轮的 prompt 变化和得分。

```python
"""
最简自动 prompt 优化循环（OPRO 思路）
不依赖任何框架，只依赖一个 LLM 调用函数。

跑法：
  1. 把 llm_call 换成你自己的 API 封装
  2. python this_file.py
"""

import json
from typing import Callable, List, Tuple


# ============================================================
# 第 0 步：LLM 调用占位 —— 替换成你的真实 API
# ============================================================
def llm_call(prompt: str, model: str = "gpt-4o-mini") -> str:
    """
    占位实现。实际使用时替换成：
      - openai.chat.completions.create(...)
      - anthropic.Anthropic().messages.create(...)
      - 本地 ollama / vllm 的接口
    返回模型生成的文本。
    """
    # 这里用一个 mock，演示循环逻辑。真实跑请替换。
    raise NotImplementedError("请替换成你的 LLM API 调用")


# ============================================================
# 第 1 步：定义任务和评分函数
# ============================================================
# 任务：给一个单词，让 LLM 输出它的反义词。
# 评分：答案在期望集合里得分，否则 0 分。

TASKS: List[Tuple[str, str]] = [
    ("hot", {"cold", "cool"}),
    ("big", {"small", "little", "tiny"}),
    ("fast", {"slow"}),
    ("happy", {"sad", "unhappy"}),
    ("up", {"down"}),
    ("light", {"heavy", "dark"}),
    ("old", {"new", "young"}),
    ("rich", {"poor"}),
]

def score_prompt(prompt: str) -> Tuple[float, List[Tuple[str, str, str, bool]]]:
    """
    用给定 prompt 在所有任务上跑一遍，返回平均分和明细。

    这就是循环里的"采集信号"步骤。
    """
    details = []
    correct = 0
    for word, expected in TASKS:
        full_prompt = f"{prompt}\n单词：{word}\n反义词："
        try:
            answer = llm_call(full_prompt).strip().lower()
        except NotImplementedError:
            # 没接 API 时，用一个退化打分：检查 prompt 是否包含关键词
            answer = "cold" if "opposite" in prompt.lower() else "unknown"
        ok = any(exp in answer for exp in expected)
        details.append((word, "/".join(expected), answer, ok))
        correct += int(ok)
    return correct / len(TASKS), details


# ============================================================
# 第 2 步：OPRO 式优化器 —— 让 LLM 看历史，提议新 prompt
# ============================================================
def propose_prompt(history: List[Tuple[str, float]]) -> str:
    """
    把历史 prompt + 得分喂给 LLM，让它生成一个更好的 prompt。

    这就是循环里的"生成变异"步骤。
    """
    # 构造元 prompt（meta-prompt）
    history_text = "\n".join(
        f"- 「{p}」 → 得分 {s:.2f}"
        for p, s in history
    )
    meta_prompt = f"""你是一个 prompt 优化器。

任务：让 LLM 给出英语单词的反义词。

之前试过的 prompt 和它们的得分（1.0 为满分）：
{history_text}

请基于历史，生成一个**新的、不同的** prompt，目标是让它得分更高。
只输出新的 prompt 本身，不要任何解释。"""
    try:
        return llm_call(meta_prompt).strip()
    except NotImplementedError:
        # 没接 API 时的退化策略：拼关键词
        return f"Give the opposite of the word. ({len(history)}-th try)"


# ============================================================
# 第 3 步：主循环 —— 采集 → 变异 → 评估 → 回写
# ============================================================
def optimize_prompt(
    initial_prompt: str,
    n_rounds: int = 5,
    n_keep: int = 3,
) -> Tuple[str, List[Tuple[str, float]]]:
    """
    OPRO 式自动 prompt 优化。

    每轮：
      1. propose_prompt 生成若干新候选
      2. score_prompt 给每个候选打分
      3. 保留 Top-K，作为下一轮的历史
    """
    # 初始历史
    score0, _ = score_prompt(initial_prompt)
    history: List[Tuple[str, float]] = [(initial_prompt, score0)]
    best_prompt, best_score = initial_prompt, score0

    print(f"初始 prompt：「{initial_prompt}」 得分={score0:.2f}\n")

    for rnd in range(1, n_rounds + 1):
        # 生成变异：每轮提议 1 个新 prompt（实际 OPRO 会提议多个）
        candidate = propose_prompt(history)
        score, details = score_prompt(candidate)

        # 回写历史
        history.append((candidate, score))

        # 选择评估：只保留 Top-K，避免历史无限膨胀
        history = sorted(history, key=lambda x: -x[1])[:n_keep]

        if score > best_score:
            best_prompt, best_score = candidate, score
            tag = " ★ 新最优"
        else:
            tag = ""

        print(f"Round {rnd}: 得分={score:.2f}{tag}")
        print(f"  候选：「{candidate[:60]}{'...' if len(candidate) > 60 else ''}」")
        wrong = [(w, a) for w, _, a, ok in details if not ok]
        if wrong:
            print(f"  答错的：{wrong}")
        print()

    print("=" * 50)
    print(f"最终最优 prompt：「{best_prompt}」 得分={best_score:.2f}")
    return best_prompt, history


# ============================================================
# 运行
# ============================================================
if __name__ == "__main__":
    optimize_prompt(
        initial_prompt="给出下面单词的反义词。",
        n_rounds=5,
    )
```

这个循环里你能看到的，正是本系列定义的统一四步循环：`score_prompt` 是采集信号，`propose_prompt` 是生成变异，`history[:n_keep]` 是选择评估，覆盖 `best_prompt` 是回写自身。把 OPRO 换成 DSPy 或 TextGrad，循环骨架不变，变的是每一步的实现。

如果要用 DSPy 实现同样的事，代码会更短（声明式），但需要 `pip install dspy`：

```python
"""
DSPy 等价实现（示意，需要 dspy 库）。
"""
import dspy

# 1. 配置 LM
lm = dspy.LM("openai/gpt-4o-mini")
dspy.configure(lm=lm)

# 2. 声明签名：只说做什么，不说怎么做
class Antonym(dspy.Signature):
    """给出英语单词的反义词。"""
    word: str = dspy.InputField()
    antonym: str = dspy.OutputField()

# 3. 组装模块
solver = dspy.Predict(Antonym)

# 4. 定义评估指标
def antonym_metric(example, pred, trace=None):
    expected = example.antonym.lower().split("/")
    return any(e in pred.antonym.lower() for e in expected)

# 5. 准备训练/评估集（这里省略数据构造）
# trainset = [dspy.Example(word=..., antonym=...).with_inputs("word") ...]

# 6. 用 BootstrapFewShot 编译（自动选 demos）
# from dspy.teleprompt import BootstrapFewShot
# optimizer = BootstrapFewShot(metric=antonym_metric)
# compiled = optimizer.compile(solver, trainset=trainset)

# 7. compiled 即优化后的程序，可保存/加载/版本化
```

注意 DSPy 版本里**完全没出现"写一段 prompt"这件事**——你只声明了输入输出，编译器自己决定怎么措辞、塞哪些示例。这就是声明式自进化的核心：把 prompt 的"写"这一步，从人手里拿走，交给编译器。

## 真实案例

### 案例 1：OPRO 在 GSM8K 上的"深呼吸" prompt

OPRO 论文最常被引用的发现：让 PaLM-2 解数学题时，OPRO 找到的最优 prompt 是"Take a deep breath and work through this problem step by step. If you're unsure, try to find a good way to solve the problem."。这个 prompt 比人类常用的"Let's think step by step"在 GSM8K 上高了几个百分点。

有意思的是，"深呼吸"这个措辞本身和数学无关，是 LLM 在搜索过程中碰巧发现的——人很难想到这么写。这正好说明：LLM 当优化器能探索到人想不到的 prompt 空间。

### 案例 2：DSPy 自动超过手写 prompt

DSPy 团队在多个 benchmark 上做过对比：给定同样的训练集，DSPy 编译出的程序，准确率经常超过领域专家手写的 prompt。原因不神秘——DSPy 会自动挑那些"在训练集上答对且能稳定复现"的例子做 few-shot，并据反思改写指令，这两件事人工做既慢又容易遗漏。

### 案例 3：GEPA 在生产里降本

Decagon（客服 agent 公司）和 Databricks 都公开过 GEPA 的生产实测：用 GEPA 优化后，可以把任务从大模型（GPT-4 级）切到小模型（GPT-4o-mini 级）而几乎不掉点，推理成本降到原来的几十分之一。GEPA 的反思机制让它比早期优化器更省 rollout——这对生产环境（按调用次数计费）是实打实的钱。

### 案例 4：TextGrad 优化代码生成 prompt

TextGrad 论文里有一个实验：优化一段"让 LLM 生成 Python 函数"的 prompt。前向跑出来的代码在测试用例上失败，TextGrad 把失败反馈作为文本梯度反向传播，改写 prompt。几轮后，生成的代码通过率明显提升。这演示了 TextGrad 和 OPRO/DSPy 的区别：它能优化**中间的代码节点**，不只是最终的 prompt 文本。

## 权衡取舍以及何时不该使用

### prompt 优化的天花板

prompt 层自进化改的是"怎么问"，改不了"模型本身会不会"。如果任务是模型能力盲区（比如让一个小模型解 IMO 级数学题），再怎么优化 prompt 也救不回来——这时候要回到参数层（微调）或换更强的模型。

### 优化目标漂移

自动优化的 prompt 容易"过拟合"到评估集。你在 100 道题上调出来的好 prompt，换一批同分布的题可能就掉分。解法和机器学习里一样：留一份验证集，别在评估集上选最终 prompt。

### 成本不便宜

每轮要跑整个评估集，评估集一大就很贵。OPRO 式循环跑 20 轮、每轮评估 200 题，就是 4000 次 LLM 调用起步。生产场景要做 prompt 优化前，先估算账单。

### 何时不该用

- **任务简单、prompt 一两版就稳定**：手动调更快，引入优化框架是过度工程。
- **没有可靠的评分函数**：自动优化必须有可量化的信号。如果"好坏"只能靠人主观判断、没法定义打分函数，prompt 优化转不动——这时候要么先做标注，要么用 TextGrad 这种能把"批评文本"当信号的方案。
- **模型版本经常变**：换一次模型，之前优化的 prompt 可能就废了，要重新跑。如果模型迭代很频繁，优化收益会被反复的重新优化成本吃掉。

## 关键要点

1. **prompt 层自进化是五层级里最易上手的一层**。它不碰模型权重，只要一个 LLM API 和一个评分函数，就能让系统自动改写自己的指令。代价是改不了模型本身的能力上限。

2. **三条主线对应三种抽象**。OPRO 把 LLM 当黑盒优化器（最直观）、DSPy 把 prompt 变成可编译的声明式程序（工程化最强）、TextGrad 把文本反馈当梯度反向传播（最接近端到端优化的直觉）。三者都遵循统一的四步循环：采集信号 → 生成变异 → 选择评估 → 回写自身。

3. **OPRO 证明了"让 LLM 优化 prompt"可行且能超过人**。GSM8K 上的"深呼吸" prompt 是经典案例。它的价值是打开了"prompt 是可优化变量"这个观念。

4. **DSPy 把 prompt 工程变成了软件工程**。声明式编程 + 编译/优化 + 保存加载，让 prompt 可版本化、可协作。GEPA 优化器在 2024-2025 的实测里比 MIPROv2 高 10%+、比 GRPO 高约 20%，且更省 rollout。

5. **TextGrad 的杀手锏是通用性**。它能优化任意文本节点，不只是 prompt，还能优化中间推理、代码片段。代价是依赖"文本梯度"的质量，噪声会随链路累积。

6. **prompt 层自进化是参数层自进化的前置阶梯**。下一篇（自进化的大模型）会看到，STaR、Self-Rewarding 这些方法本质上是"先在 prompt/推理层产生变异（生成推理链、生成偏好判断），再回流到参数层训练"——两层在这个意义上是连续的。

## 延伸阅读

**OPRO**：
- "Large Language Models as Optimizers"（arxiv 2309.03409）—— OPRO 原论文
- google-deepmind/opro（GitHub）—— 官方实现

**DSPy**：
- DSPy 官方文档（dspy.ai）—— Signature、Module、Optimizer 全流程
- "GEPA: Reflective Prompt Optimization"—— DSPy 当前主力优化器
- Arize AI / Decagon 的 GEPA 基准实测—— 生产场景的成本收益

**TextGrad**：
- "TextGrad: Automatic Differentiation via Text"（arxiv 2406.07496）—— 原论文
- zou-group/textgrad（GitHub）—— 官方实现
- Stanford HAI "TextGrad: AutoGrad for Text"—— 设计动机的通俗解释

**对比与综述**：
- "TextGrad vs DSPy"（Medium）—— 两种抽象的工程对比
- LessWrong "Prompt Optimization Can Enable AI Control Research"—— prompt 优化在安全方向的应用
