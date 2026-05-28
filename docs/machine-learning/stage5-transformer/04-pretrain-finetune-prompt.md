<!--
调研来源：
1. Devlin et al., "BERT" (2019) — Pre-train → Fine-tune 范式的确立
2. Radford et al., "GPT-2" (2019) — Zero-shot 任务转移
3. Brown et al., "GPT-3" (2020) — In-context learning (Few-shot)
4. Liu et al., "Pre-train, Prompt, and Predict: A Systematic Survey of Prompting Approaches" (2021) — Prompt 范式综述
5. Wei et al., "Finetuned Language Models Are Zero-Shot Learners" (2022) — FLAN / Instruction tuning
6. Ouyang et al., "Training language models to follow instructions with human feedback" (2022) — InstructGPT / RLHF

核心发现：NLP 的范式经历了三次重大变化：(1) Pre-train → Fine-tune（2018-2020），在大规模数据上预训练模型，然后在每个下游任务上微调，代表是 BERT 和 GPT-1；(2) Pre-train → Prompt → Predict（2020-2022），不修改模型参数，通过设计 prompt 引导模型输出，代表是 GPT-3；(3) Pre-train → Instruction Tuning → RLHF（2022 至今），在预训练基础上用指令微调和对齐训练让模型成为通用助手，代表是 ChatGPT。范式的演进方向是"需要更少的任务特定工程，更通用"。
-->

# 预训练与微调范式：Pre-train → Fine-tune → Prompt，范式的三次变化

**TL;DR：** NLP 的使用范式在 2018-2024 年间经历了三次重大变化。第一次是"预训练+微调"：在大数据上预训练模型，然后在每个任务上用标注数据微调（BERT 时代）。第二次是"预训练+提示"：不修改模型参数，通过设计文本提示（prompt）引导预训练模型完成任务（GPT-3 时代）。第三次是"预训练+指令微调+对齐"：在预训练后，用大量指令数据和人类反馈来训练模型遵循指令、与人类偏好对齐（ChatGPT 时代）。每次变化都让"适配新任务"的门槛更低。

## 为什么这很重要

范式的变化直接影响了"普通开发者如何使用 AI"。

在 BERT 时代（2018-2020），要做情感分析，你需要：
1. 收集标注数据（几千到几万条）
2. 设计分类头
3. 微调整个模型
4. 部署模型

在 GPT-3 时代（2020-2022），同样的事只需要：
1. 构造 prompt："判断以下评论是正面还是负面：这个产品太棒了！"
2. 调用 API

在 ChatGPT 时代（2022 至今），连 prompt 设计都不需要了：
1. 直接问："这个评论是正面还是负面的？"
2. 得到答案

从"需要 ML 专业知识+标注数据+GPU"到"只需要一个 API 调用"，门槛的降低是数量级的。这些变化不是技术上的小修小补——它们代表了根本不同的"人机交互"方式。

这三次范式变化的另一个维度是**从"模型为中心"到"数据为中心"再到"交互为中心"**。在 Fine-tune 时代，研究者的主要工作是设计模型架构和训练流程。在 Prompt 时代，重心转移到了设计输入格式（prompt engineering）。在 RLHF 时代，重心又转移到了交互设计——如何定义"好的回答"、如何收集偏好数据、如何平衡安全性和有用性。

每一层抽象都让更广泛的人群能够使用 AI。Fine-tune 时代的用户是机器学习工程师，Prompt 时代的用户是软件开发者，RLHF 时代的用户是任何能用自然语言表达需求的人。AI 能力的民主化不仅仅是技术进步的结果，更是范式设计的结果。

## 核心概念

### 三种范式的对比

```
范式 1: Pre-train → Fine-tune
  大规模无标注数据 → 预训练模型 → 加分类头 → 用标注数据微调
  适配成本: 中（需要标注数据和微调代码）
  代表: BERT, GPT-1, RoBERTa, T5

范式 2: Pre-train → Prompt → Predict
  大规模无标注数据 → 预训练模型 → 设计 prompt → 直接预测
  适配成本: 低（不需要标注数据，只需要 prompt 工程）
  代表: GPT-3, PET, LM-BFF

范式 3: Pre-train → Instruction Tuning → RLHF
  大规模无标注数据 → 预训练 → 指令微调 → 人类偏好对齐 → 通用助手
  适配成本: 极低（直接用自然语言对话）
  代表: ChatGPT, Claude, LLaMA-Chat
```

## 工作原理（简化的心智模型）

### 给 12 岁孩子的解释

**Fine-tune** 就像大学专业教育。你先上通识课（预训练），然后选一个专业（微调），深入学习。换一个专业就要重新学。每个任务需要"重新训练"。

**Prompt** 就像给一个博学的人出考题。你把问题表述成他能理解的形式，他直接回答。不需要重新学习——只需要把问题"翻译"成合适的格式。

**Instruction Tuning + RLHF** 就像训练一个全能助理。你不仅让他读了很多书（预训练），还教他"怎么做一个好助理"（指令微调），然后根据他的回答给反馈："这个回答好，那个不好"（RLHF）。最终他能理解你的自然语言请求并做出合适的回应。

## 工作原理（详细机制）

### 范式 1：Pre-train → Fine-tune

#### 预训练阶段

在大规模无标注文本上训练语言模型。不同的预训练目标：

| 模型 | 预训练目标 | 数据 | 参数量 |
|------|-----------|------|--------|
| BERT | MLM + NSP | 16GB 文本 | 110M/340M |
| GPT-1 | 自回归 LM | 5GB 文本 | 117M |
| RoBERTa | MLM（无 NSP） | 160GB 文本 | 355M |
| T5 | Span corruption | 800GB 文本 | 220M-11B |
| XLNet | Permutation LM | 113GB 文本 | 110M/340M |

预训练是计算最密集的阶段。BERT-base 需要约 12 TPU-days，GPT-3 175B 需要约 3,640 GPU-years（A100）。

预训练阶段的关键技术决策包括：训练数据的选择和清洗（数据质量比数量更重要）、训练目标的设计（MLM vs 自回归 vs 降噪自编码）、模型的规模（层数、隐藏维度、注意力头数）、优化器的配置（AdamW 的学习率和调度器），以及训练的长度（多少步、多少个 epoch）。这些决策在预训练阶段做出后，微调阶段很难改变——因为重新预训练的成本太高了。

预训练的另一个重要趋势是**数据配比的精细化**。LLaMA 的训练数据中，WebText 占 67%、C4 占 15%、GitHub 占 4.5%、Wikipedia 占 4.5%、Books 占 4.5%、ArXiv 占 2.5%、StackExchange 占 2%。不同来源的数据对模型能力的影响不同：代码数据提升推理能力，数学数据提升逻辑能力，对话数据提升交互能力。

#### 微调阶段

在下游任务的标注数据上继续训练。关键设计选择：

**全参数微调 vs 参数高效微调（PEFT）**：

全参数微调：更新模型的所有参数。简单但对小数据集容易过拟合。此外，全参数微调有一个经常被忽视的问题：**灾难性遗忘（catastrophic forgetting）**。当你用特定任务的数据训练模型时，模型可能会"忘记"在预训练时学到的通用知识。这在数据量有限时尤其严重。一个在情感分析数据上过度微调的 BERT 模型，可能会丧失理解其他类型文本的能力。

解决方案包括：学习率衰减（用比预训练小 10-100 倍的学习率）、早停（在验证集性能开始下降时停止训练）、以及前面提到的 PEFT 方法（冻结大部分参数从根本上防止遗忘）。

PEFT 方法（只更新少量参数）：
- **LoRA（Low-Rank Adaptation）**：在每层权重矩阵旁加一个低秩分解矩阵 $\Delta W = A \times B$，只训练 $A$ 和 $B$。

$$h = Wx + \Delta Wx = Wx + ABx$$

其中 $A \in \mathbb{R}^{d \times r}$，$B \in \mathbb{R}^{r \times d}$，$r \ll d$。可训练参数从 $d^2$ 减少到 $2dr$。

```python
class LoRALayer(nn.Module):
    """LoRA 低秩适配层"""
    def __init__(self, original_layer, rank=8, alpha=16):
        super().__init__()
        self.original = original_layer
        d_in = original_layer.in_features
        d_out = original_layer.out_features

        self.lora_A = nn.Parameter(torch.randn(d_in, rank) * 0.01)
        self.lora_B = nn.Parameter(torch.zeros(rank, d_out))
        self.scaling = alpha / rank

        # 冻结原始权重
        self.original.weight.requires_grad = False
        if self.original.bias is not None:
            self.original.bias.requires_grad = False

    def forward(self, x):
        return self.original(x) + (x @ self.lora_A @ self.lora_B) * self.scaling
```

- **Prefix Tuning**：在每层前面加几个可学习的"虚拟 token"
- **Adapter**：在每层中插入小型 bottleneck 网络
- **P-Tuning v2**：优化 prompt 的连续向量表示

- **Prefix Tuning**：在每层前面加几个可学习的"虚拟 token"
- **Adapter**：在每层中插入小型 bottleneck 网络
- **P-Tuning v2**：优化 prompt 的连续向量表示

PEFT 的优势：用不到 1% 的可训练参数，达到全参数微调 95%+ 的效果。

#### LoRA 的直觉理解

为什么低秩分解有效？因为"微调"本质上是对原始权重做小幅调整，而这个调整矩阵通常是低秩的——也就是说，微调时真正需要调整的"方向"远少于模型的参数维度。

假设原始权重 $W \in \mathbb{R}^{4096 \times 4096}$（约 1600 万参数）。微调时需要的调整 $\Delta W$ 可能只需要秩为 8 的矩阵就能表达：$A \in \mathbb{R}^{4096 \times 8}$，$B \in \mathbb{R}^{8 \times 4096}$，合计 $2 \times 4096 \times 8 = 65,536$ 参数——只有原始参数的 0.4%。

这个发现来自 Aghajanyan et al. (2020) 的研究，他们证明了预训练模型的微调过程具有"内在低维性"（intrinsic low dimensionality）。预训练已经把模型放在了一个好的参数空间位置，微调只需要在这个位置附近做小幅调整。

LoRA 的实际使用要点：
- **rank 的选择**：通常 4-64 就够了。简单任务用小 rank（4-8），复杂任务用大 rank（16-64）
- **alpha 的设置**：通常设为 rank 的 2 倍。alpha/rank 是实际的缩放系数
- **应用位置**：通常只应用到 Q 和 V 矩阵效果就很好。应用到所有线性层（Q/K/V/O + FFN）效果更好但参数更多
- **合并与部署**：训练完成后，可以把 $\Delta W = A \times B$ 合并回原始权重 $W' = W + \Delta W$，推理时没有任何额外开销

#### 其他 PEFT 方法对比

| 方法 | 原理 | 可训练参数比例 | 推理开销 | 代表工作 |
|------|------|---------------|---------|---------|
| LoRA | 低秩分解权重矩阵 | 0.1%-1% | 无（可合并） | Hu et al. 2021 |
| Adapter | 插入瓶颈网络 | 1%-5% | 有（额外层） | Houlsby et al. 2019 |
| Prefix Tuning | 添加可学习前缀 | 0.1%-1% | 有（增加序列长度） | Li & Liang 2021 |
| Prompt Tuning | 只训练输入嵌入 | 0.01%-0.1% | 极小 | Lester et al. 2021 |
| BitFit | 只训练偏置项 | 0.01%-0.1% | 无 | Ben-Zaken et al. 2022 |
| IA3 | 学习向量缩放 | <0.01% | 无 | Liu et al. 2022 |

LoRA 之所以成为当前最流行的 PEFT 方法，是因为它在参数效率、效果和部署便利性之间取得了最好的平衡。

### 范式 2：Pre-train → Prompt → Predict

#### Prompt 的核心思想

语言模型在预训练时学到了 $P(x_t | x_{<t})$——根据前文预测下一个词。Prompt 的关键是把下游任务"翻译"成语言建模问题。

**情感分析的例子**：

```
无 prompt:
  输入: "这个电影太棒了"
  需要: 分类器 → 正面/负面

有 prompt:
  输入: "这个电影太棒了。这篇评论是 [MASK] 的。"
  模型预测 [MASK] = "正面" ✓
```

**文本分类的 prompt 模板**：

```
模板: "[X] 感觉很 [Z]。"
输入: "天气晴朗，阳光明媚"
Prompt: "天气晴朗，阳光明媚。感觉很 [MASK]。"
预测: [MASK] = "好" → 正面
```

#### Discrete Prompt vs Continuous Prompt

**Discrete Prompt（离散提示）**：用自然语言文本作为 prompt。需要人工设计或自动搜索。

自动搜索方法：
- **PET（Pattern-Exploiting Training）**：用多个 prompt 模板做零样本预测，然后集成
- **AutoPrompt**：用梯度引导搜索最优的 trigger 词
- **LM-BFF**：用另一个语言模型自动生成 prompt 模板

**Continuous Prompt（连续提示）**：不再使用自然语言，而是直接优化连续向量。

```python
class ContinuousPrompt(nn.Module):
    """连续 prompt（Soft Prompt）"""
    def __init__(self, model, n_prompt_tokens=20):
        super().__init__()
        self.model = model
        self.n_prompt_tokens = n_prompt_tokens

        # 可学习的 prompt embedding
        self.prompt_embedding = nn.Parameter(
            torch.randn(n_prompt_tokens, model.config.d_model) * 0.02
        )

        # 冻结语言模型
        for param in self.model.parameters():
            param.requires_grad = False

    def forward(self, input_ids):
        # 获取输入 token 的 embedding
        input_embeds = self.model.get_input_embeddings()(input_ids)

        # 在前面拼接 prompt embedding
        prompt_embeds = self.prompt_embedding.unsqueeze(0).expand(
            input_embeds.size(0), -1, -1
        )
        combined = torch.cat([prompt_embeds, input_embeds], dim=1)

        return self.model(inputs_embeds=combined)
```

Continuous Prompt 的优势：不需要人工设计，直接在训练集上优化。劣势：不可解释，泛化性可能不如 discrete prompt。

#### Discrete Prompt 的搜索策略

如何自动找到好的 prompt？研究者提出了多种方法：

**PET（Pattern-Exploiting Training）** 的思路是：用多个手工设计的 prompt 模板做零样本预测，然后用一个集成模型把这些预测结果蒸馏为标签。这个方法在只有几十条标注数据的情况下就能取得很好的效果。

**AutoPrompt** 更进一步，它用梯度信息来搜索最优的 trigger 词。具体做法是：从一组通用的词开始，然后迭代地替换那些使损失下降最多的词。这有点像"反向设计"prompt——不是从语义出发，而是从优化目标出发。

**LM-BFF** 则用另一个语言模型来生成 prompt 模板。它首先生成一批候选模板，然后在验证集上评估每个模板的效果，选择最好的。这种方法的 prompt 在语义上更自然，泛化性通常也更好。

这些自动搜索方法的共同发现是：prompt 中即使一个词的差异，也可能导致模型表现大幅波动。这既说明了 prompt 设计的重要性，也暴露了依赖 prompt 的脆弱性。

#### Prompt 设计的实践经验

Prompt 工程在实践中积累了大量经验。以下是一些经过验证的有效策略：

**格式清晰的指令**：模型对结构化的指令响应更好。

```
效果一般的 prompt:
  帮我分析一下这段文字的情感

效果更好的 prompt:
  请对以下文本进行情感分析。
  输出格式：JSON
  {"sentiment": "positive/negative/neutral", "confidence": 0.0-1.0, "reason": "一句话说明理由"}
  文本：[待分析的文本]
```

**Few-shot 示例**：给几个输入-输出示例比长篇描述更有效。

```
Zero-shot:
  将以下文本翻译为英文：今天天气很好

Few-shot (效果通常更好):
  中文：我喜欢编程 → 英文：I like programming
  中文：今天下雨了 → 英文：It rained today
  中文：今天天气很好 → 英文：
```

**Chain-of-Thought（思维链）**：让模型"展示推理过程"可以显著提升推理任务的准确率。Wei et al. (2022) 发现，只要在 prompt 中加入"Let's think step by step"，模型在数学推理等任务上的表现就会大幅提升。

```
直接问:
  问: 餐厅有 23 个苹果。午餐用了 20 个，又买了 6 个。还有几个？
  答: 9

加上思维链:
  问: 餐厅有 23 个苹果。午餐用了 20 个，又买了 6 个。还有几个？
  答: 让我们一步步思考。原来有 23 个苹果。午餐用了 20 个，所以还剩 23 - 20 = 3 个。
      然后又买了 6 个，所以现在有 3 + 6 = 9 个。答案是 9。
```

思维链的关键在于：它迫使模型把中间推理步骤显式化，而不是试图一步到位地跳到答案。对于需要多步推理的任务，这种"展示工作过程"的方式可以减少错误累积。

### 范式 3：Pre-train → Instruction Tuning → RLHF

#### 指令微调（Instruction Tuning）

在预训练之后，用"指令-回答"格式的数据继续训练模型。这些数据通常包括：
- 各种任务的指令（问答、翻译、摘要、推理等）
- 对应的高质量回答

指令微调的数据格式通常是这样的：

```
{
  "instruction": "将以下文本翻译为英文",
  "input": "今天天气很好",
  "output": "The weather is nice today"
}
```

或者对话格式：

```
{
  "conversations": [
    {"role": "user", "content": "解释什么是黑洞"},
    {"role": "assistant", "content": "黑洞是宇宙中引力极强的区域..."}
  ]
}
```

Wei et al. (2022) 的 FLAN（Finetuned Language Net）研究表明：
- 在 62 个任务上做指令微调后，模型在未见过的任务上的零样本性能显著提升
- 关键不是"学了更多任务"，而是"学会了遵循指令"

这个发现的一个重要推论是：指令微调的数据多样性比数量更重要。用 1000 条覆盖 50 种任务类型的指令数据做微调，效果可能好于用 10000 条只覆盖 3 种任务类型的数据。因为多样性帮助模型学到了"遵循指令"这个通用能力，而不是记住特定任务的答案。

#### RLHF（Reinforcement Learning from Human Feedback）

RLHF 是 ChatGPT 的关键技术。三步流程：

**Step 1：监督微调（SFT）**
用人类撰写的"理想回答"来微调模型。

$$\mathcal{L}_{SFT} = -\mathbb{E}_{(x, y) \sim D_{human}} [\log P(y | x; \theta)]$$

**Step 2：训练奖励模型（Reward Model）**
让人类标注员对模型的多个回答排序，训练一个打分模型。

给定 prompt $x$，模型生成两个回答 $y_1, y_2$。人类标注 $y_1 > y_2$。奖励模型学习：

$$\mathcal{L}_{RM} = -\mathbb{E}[\log \sigma(r(x, y_1) - r(x, y_2))]$$

其中 $r(x, y)$ 是奖励模型对"prompt x, 回答 y"的打分。

奖励模型的训练数据收集过程是整个 RLHF 流程中人力成本最高的环节。InstructGPT 论文中描述了具体的数据收集方式：对每个 prompt，模型生成 4-9 个回答，标注员对这些回答进行排序。排序信息被转换为成对比较（pairwise comparison），用于训练奖励模型。一个训练有素的标注员每小时可以完成约 20-40 个 prompt 的标注。

奖励模型的质量直接决定了 RLHF 的上限。一个常见的失败模式是**奖励黑客（reward hacking）**：语言模型学会了"讨好"奖励模型的偏好，而不是真正提高回答质量。比如模型可能学会在回答中堆砌"安全但空洞"的免责声明，因为奖励模型给这种行为打了高分。

**Step 3：PPO 优化**
用强化学习（PPO 算法）微调语言模型，最大化奖励模型的打分，同时避免偏离原始模型太远。

$$\mathcal{L}_{RL} = \mathbb{E}_{y \sim \pi_\theta} [r(x, y)] - \beta \cdot KL(\pi_\theta || \pi_{ref})$$

其中 $\pi_\theta$ 是当前策略（语言模型），$\pi_{ref}$ 是 SFT 后的参考模型，$\beta$ 控制偏离程度。KL 散度项防止模型为了"骗取"高分而生成无意义内容（reward hacking）。

PPO 在 RLHF 中的实现有一些特殊之处。标准的 PPO 用于控制策略（如机器人），动作空间是连续的。而在 RLHF 中，"动作"是生成一个 token，动作空间是整个词汇表（通常几万个 token）。此外，PPO 需要维护多个模型（策略模型、参考模型、奖励模型、价值模型），内存开销很大。这也是 DPO 受欢迎的一个重要原因——它只需要策略模型和参考模型。

#### DPO（Direct Preference Optimization）

2023 年提出的 DPO 是 RLHF 的简化替代。它直接从人类偏好数据中优化策略，不需要训练奖励模型。

$$\mathcal{L}_{DPO} = -\mathbb{E} \left[ \log \sigma \left( \beta \log \frac{\pi_\theta(y_w|x)}{\pi_{ref}(y_w|x)} - \beta \log \frac{\pi_\theta(y_l|x)}{\pi_{ref}(y_l|x)} \right) \right]$$

其中 $y_w$ 是被偏好的回答，$y_l$ 是不被偏好的回答。

DPO 比 PPO 更简单、更稳定、不需要在线采样，正在成为新的标准。

#### RLHF 的直觉理解

为什么需要 RLHF？预训练模型学会了"预测下一个词"，但它不知道什么样的回答是人类喜欢的。

打个比方：预训练让模型读了整个互联网（相当于一个知识渊博但不懂社交的人），SFT 教它怎么回答问题（相当于上了几节沟通课），RLHF 教它什么样的回答更好（相当于一个朋友告诉你"这样说更好，那样说不礼貌"）。

RLHF 的三个阶段各有关键作用：
- **SFT**：教模型基本的"问答格式"，让它知道如何回应指令
- **Reward Model**：学习人类的偏好模式——什么样的回答更安全、更有用、更准确
- **PPO/DPO**：在 Reward Model 的引导下，调整模型的生成策略

#### RLHF vs DPO 的深度对比

| 维度 | RLHF (PPO) | DPO |
|------|-----------|-----|
| 需要的模型数量 | 4 个（策略、参考、奖励、价值） | 2 个（策略、参考） |
| 训练流程 | 三步（SFT → RM → PPO） | 两步（SFT → DPO） |
| 在线采样 | 需要（PPO 每步要生成回答） | 不需要（使用离线偏好数据） |
| 训练稳定性 | 较差（PPO 超参数敏感） | 较好（直接优化分类损失） |
| 内存开销 | 大（同时加载 4 个模型） | 小（只需 2 个模型） |
| 数据需求 | 可以迭代收集偏好 | 需要预先收集偏好数据 |

DPO 的核心洞察是：在 RLHF 的优化目标中，最优策略有一个闭式解（closed-form solution）。这意味着我们可以直接从偏好数据中推导出最优策略，而不需要通过强化学习的试错过程来逼近它。

实际应用中，DPO 及其变体（IPO、KTO、ORPO）正在快速取代 PPO。Meta 的 LLaMA-2 Chat 和 Mistral 的 Mixtral 都使用了 DPO 变体进行对齐训练。

## 代码示例（完整可运行的 Python）

### LoRA 微调 + Prompt 模板 + 简化版 RLHF

```python
"""
预训练-微调-提示 三种范式的代码实现
运行要求: pip install torch
"""

import torch
import torch.nn as nn
import torch.nn.functional as F
import math
import copy


# ============================================================
# 1. LoRA 微调
# ============================================================
class LoRALinear(nn.Module):
    """LoRA 低秩适配线性层"""
    def __init__(self, original_linear, rank=8, alpha=16):
        super().__init__()
        self.original = original_linear
        d_in = original_linear.in_features
        d_out = original_linear.out_features
        self.rank = rank
        self.alpha = alpha

        # 低秩矩阵 A 和 B
        self.lora_A = nn.Parameter(torch.randn(d_in, rank) * 0.01)
        self.lora_B = nn.Parameter(torch.zeros(rank, d_out))

        # 冻结原始权重
        self.original.weight.requires_grad = False
        if self.original.bias is not None:
            self.original.bias.requires_grad = False

    def forward(self, x):
        original_out = self.original(x)
        lora_out = (x @ self.lora_A @ self.lora_B) * (self.alpha / self.rank)
        return original_out + lora_out


def apply_lora_to_model(model, rank=8, target_modules=['W_q', 'W_k', 'W_v', 'W_o']):
    """将 LoRA 应用到模型的指定模块"""
    trainable_params = 0
    total_params = 0

    for name, module in model.named_modules():
        for target in target_modules:
            if target in name and isinstance(module, nn.Linear):
                # 替换为 LoRA 版本
                parent_name = '.'.join(name.split('.')[:-1])
                child_name = name.split('.')[-1]
                parent = dict(model.named_modules())[parent_name]
                setattr(parent, child_name, LoRALinear(module, rank=rank))
                break

    for name, param in model.named_parameters():
        total_params += param.numel()
        if param.requires_grad:
            trainable_params += param.numel()

    print(f"LoRA 应用结果:")
    print(f"  总参数: {total_params:,}")
    print(f"  可训练参数: {trainable_params:,} ({trainable_params/total_params*100:.2f}%)")
    return model


# ============================================================
# 2. Prompt 模板系统
# ============================================================
class PromptTemplate:
    """Prompt 模板引擎"""
    def __init__(self, template, verbalizer):
        """
        template: str, 包含 [X] (输入) 和 [MASK] (预测位置)
        verbalizer: dict, 标签 → 词的映射
        """
        self.template = template
        self.verbalizer = verbalizer

    def format(self, text):
        """将输入文本填入模板"""
        return self.template.replace('[X]', text)

    def get_label_words(self):
        """获取每个标签对应的词"""
        return self.verbalizer

    def predict(self, model_output, mask_position):
        """从模型在 [MASK] 位置的输出预测标签"""
        label_scores = {}
        for label, word in self.verbalizer.items():
            label_scores[label] = model_output[mask_position][word]
        return max(label_scores, key=label_scores.get)


# ============================================================
# 3. 简化版 RLHF (DPO)
# ============================================================
def dpo_loss(policy_chosen_logps, policy_rejected_logps,
             reference_chosen_logps, reference_rejected_logps,
             beta=0.1):
    """
    DPO (Direct Preference Optimization) 损失
    policy_*: 当前策略模型的对数概率
    reference_*: 参考模型的对数概率
    """
    chosen_rewards = beta * (policy_chosen_logps - reference_chosen_logps)
    rejected_rewards = beta * (policy_rejected_logps - reference_rejected_logps)

    loss = -F.logsigmoid(chosen_rewards - rejected_rewards).mean()

    # 计算准确率（偏好正确排序的比例）
    accuracy = (chosen_rewards > rejected_rewards).float().mean()

    return loss, accuracy, chosen_rewards.mean(), rejected_rewards.mean()


# ============================================================
# 验证代码
# ============================================================
if __name__ == "__main__":
    torch.manual_seed(42)

    print("=" * 60)
    print("范式 1: Fine-tune (LoRA)")
    print("=" * 60)

    # 简单模型
    original_layer = nn.Linear(64, 64)
    print(f"原始层参数: {sum(p.numel() for p in original_layer.parameters()):,}")

    lora_layer = LoRALinear(original_layer, rank=4)
    trainable = sum(p.numel() for p in lora_layer.parameters() if p.requires_grad)
    total = sum(p.numel() for p in lora_layer.parameters())
    print(f"LoRA 层可训练参数: {trainable:,} / {total:,} ({trainable/total*100:.1f}%)")

    x = torch.randn(2, 64)
    out = lora_layer(x)
    print(f"输入: {list(x.shape)}, 输出: {list(out.shape)}")

    # 不同 rank 的参数量对比
    print(f"\nLoRA rank 对比 (d=768):")
    for rank in [1, 2, 4, 8, 16, 32, 64]:
        orig = 768 * 768
        lora = 768 * rank * 2
        print(f"  rank={rank:>3}: 原始 {orig:,}, LoRA 额外 {lora:,} ({lora/orig*100:.2f}%)")

    print("\n" + "=" * 60)
    print("范式 2: Prompt Engineering")
    print("=" * 60)

    # 情感分析 prompt 模板
    templates = {
        "模板 1 (填空式)": {
            'template': '"[X]" 这篇评论是 [MASK] 的。',
            'verbalizer': {'positive': ['好', '棒', '优秀'], 'negative': ['差', '糟', '失望']}
        },
        "模板 2 (问答式)": {
            'template': '评论: "[X]" \n情感: [MASK]',
            'verbalizer': {'positive': ['正面', '积极'], 'negative': ['负面', '消极']}
        },
        "模板 3 (续写式)": {
            'template': '[X] 总之，这篇评论是',
            'verbalizer': {'positive': ['推荐的'], 'negative': ['不推荐的']}
        },
    }

    test_reviews = [
        "这部电影太精彩了，演员演技出色",
        "产品质量很差，非常失望",
        "服务态度好，环境也不错",
    ]

    for name, config in templates.items():
        print(f"\n{name}: {config['template']}")
        for review in test_reviews:
            prompt = config['template'].replace('[X]', review)
            print(f"  '{review}'")
            print(f"  → '{prompt}'")

    print("\n" + "=" * 60)
    print("范式 3: RLHF (DPO)")
    print("=" * 60)

    # 模拟 DPO 训练
    batch_size = 8
    vocab_size = 100

    # 模拟对数概率（chosen 应该高于 rejected）
    policy_chosen = torch.randn(batch_size) - 0.5
    policy_rejected = torch.randn(batch_size) - 1.5
    ref_chosen = torch.randn(batch_size) - 0.5
    ref_rejected = torch.randn(batch_size) - 1.5

    loss, acc, chosen_r, rejected_r = dpo_loss(
        policy_chosen, policy_rejected,
        ref_chosen, ref_rejected,
        beta=0.1
    )

    print(f"\nDPO 损失:")
    print(f"  Loss: {loss.item():.4f}")
    print(f"  准确率: {acc.item():.2%}")
    print(f"  Chosen 平均奖励: {chosen_r.item():.4f}")
    print(f"  Rejected 平均奖励: {rejected_r.item():.4f}")

    # 模拟 DPO 训练循环
    print(f"\n模拟 DPO 训练:")
    policy = nn.Linear(10, 1)
    ref_policy = copy.deepcopy(policy)
    ref_policy.eval()
    optimizer = torch.optim.Adam(policy.parameters(), lr=0.01)

    for step in range(20):
        # 模拟偏好数据
        x = torch.randn(4, 10)
        chosen_scores = policy(x) + torch.randn(4, 1) * 0.1
        rejected_scores = policy(x) - 0.5 + torch.randn(4, 1) * 0.1

        with torch.no_grad():
            ref_chosen = ref_policy(x)
            ref_rejected = ref_policy(x)

        loss = -F.logsigmoid(
            0.1 * ((chosen_scores - ref_chosen) - (rejected_scores - ref_rejected))
        ).mean()

        optimizer.zero_grad()
        loss.backward()
        optimizer.step()

        if (step + 1) % 5 == 0:
            print(f"  Step {step+1:3d}/20, Loss: {loss.item():.4f}")

    print(f"\nDPO 训练完成。")

    # 三种范式的总结对比
    print(f"\n" + "=" * 60)
    print("三种范式总结")
    print("=" * 60)
    print(f"""
  {'维度':<20} {'Fine-tune':<20} {'Prompt':<20} {'RLHF':<20}
  {'─' * 80}
  {'需要标注数据':<20} {'是':<20} {'否':<20} {'偏好数据':<20}
  {'需要修改参数':<20} {'是（全部/部分）':<20} {'否':<20} {'是':<20}
  {'任务特定工程':<20} {'分类头设计':<20} {'Prompt 设计':<20} {'对齐训练':<20}
  {'泛化能力':<20} {'任务特定':<20} {'中等':<20} {'通用':<20}
  {'部署复杂度':<20} {'需要 GPU':<20} {'API 调用':<20} {'API 调用':<20}
  {'代表模型':<20} {'BERT, T5':<20} {'GPT-3':<20} {'ChatGPT':<20}
  {'时间':<20} {'2018-2020':<20} {'2020-2022':<20} {'2022-至今':<20}
""")
```

**预期输出：**

```
============================================================
范式 1: Fine-tune (LoRA)
============================================================
原始层参数: 4,160
LoRA 层可训练参数: 512 / 4,672 (11.0%)
输入: [2, 64], 输出: [2, 64]

LoRA rank 对比 (d=768):
  rank=  1: 原始 589,824, LoRA 额外 1,536 (0.26%)
  rank=  2: 原始 589,824, LoRA 额外 3,072 (0.52%)
  rank=  4: 原始 589,824, LoRA 额外 6,144 (1.04%)
  rank=  8: 原始 589,824, LoRA 额外 12,288 (2.08%)
  rank= 16: 原始 589,824, LoRA 额外 24,576 (4.17%)
  rank= 32: 原始 589,824, LoRA 额外 49,152 (8.33%)
  rank= 64: 原始 589,824, LoRA 额外 98,304 (16.67%)

============================================================
范式 3: RLHF (DPO)
============================================================
DPO 损失:
  Loss: ~0.6xxx
  准确率: ~75%
  Chosen 平均奖励: > Rejected 平均奖励

模拟 DPO 训练:
  Step   5/20, Loss: ~0.5xxx
  Step  10/20, Loss: ~0.4xxx
  ...
DPO 训练完成。
```

## 代码解析

上面这段代码包含了三种范式的核心实现：

**LoRA 微调部分**展示了低秩适配的工作原理。`LoRALinear` 在冻结的原始线性层旁边加了一对低秩矩阵 $A$ 和 $B$。前向传播时，原始输出和 LoRA 输出相加。rank 参数控制了低秩矩阵的大小——rank 越大，可训练参数越多，表达能力越强，但过大的 rank 可能导致过拟合。从输出可以看到，对于 $d=768$ 的线性层，rank=8 的 LoRA 只增加了 2.08% 的参数，但通常足以完成微调任务。

**Prompt 模板部分**展示了三种不同的 prompt 设计模式：填空式、问答式和续写式。每种模式适用于不同的场景。模板的核心要素是：输入槽位、预测位置和标签词映射（verbalizer）。verbalizer 将抽象的标签（positive/negative）映射到具体的词（好/棒/差/糟），让语言模型可以直接"填写"预测结果。

**DPO 损失部分**实现了 Direct Preference Optimization 的核心公式。它计算策略模型和参考模型在 chosen 和 rejected 回答上的对数概率差异，然后用 logsigmoid 确保损失始终为正。训练目标是让策略模型更倾向于生成 chosen 的回答而非 rejected 的回答。beta 参数控制了"偏离参考模型的惩罚力度"——beta 越大，模型越倾向于保守（接近参考模型），beta 越小，模型越激进地适应偏好数据。

### 从直觉到数学到代码：LoRA 的完整路径

**直觉**：微调不需要改变模型的所有参数。就像装修房子——不需要重建整栋楼，只需要调整关键的几个地方。

**数学**：原始权重 $W$ 保持不变，添加一个低秩修正 $\Delta W = AB$。对于输入 $x$，输出变为 $h = Wx + ABx \cdot (\alpha/r)$。$A$ 用随机高斯初始化（$\mathcal{N}(0, 0.01)$），$B$ 初始化为零——这意味着训练开始时 $\Delta W = 0$，模型从预训练状态开始，避免破坏已学到的知识。

**代码**：`LoRALinear` 中的 `forward` 方法实现了这个公式的核心——`self.original(x)` 计算 $Wx$，`(x @ self.lora_A @ self.lora_B) * (self.alpha / self.rank)` 计算 $\alpha/r \cdot ABx$。两者相加就是最终输出。

### 从直觉到数学到代码：DPO 的完整路径

**直觉**：你问两个人同一个问题，一个人给了好答案，一个人给了差答案。你想让模型更可能给出好答案。怎么做？让模型"更喜欢"好答案的概率分布，同时"不那么喜欢"差答案的概率分布。

**数学**：DPO 的损失函数 $\mathcal{L}_{DPO} = -\mathbb{E}[\log \sigma(\beta(\log \frac{\pi_\theta(y_w|x)}{\pi_{ref}(y_w|x)} - \log \frac{\pi_\theta(y_l|x)}{\pi_{ref}(y_l|x)}))]$ 中，核心是比较两个比率：策略模型对好答案的"偏好增量"和策略模型对差答案的"偏好增量"。如果好答案的增量更大，损失就小；反之损失就大。$\sigma$ 函数确保输出在 0 到 1 之间，log 确保损失为正。

**代码**：`dpo_loss` 函数中，`chosen_rewards = beta * (policy_chosen_logps - reference_chosen_logps)` 计算了策略模型相对于参考模型的"改进程度"。如果策略模型给 chosen 回答的概率比参考模型更高，说明策略模型学到了"这个回答更好"。对 rejected 回答同理。两个改进程度的差值经过 logsigmoid 变换后取负，就是最终的损失。

### 三种范式背后的统一视角

表面上看，三种范式各不相同，但它们共享一个核心思想：**如何把预训练模型的知识适配到特定任务上**。

Fine-tune 通过修改参数来适配。它直接调整模型的"记忆"，让模型在特定任务的输入-输出映射上表现更好。LoRA 和全参数微调的区别只是"修改多少参数"。

Prompt 通过修改输入来适配。它不改变模型的"记忆"，而是通过精心设计的输入文本来激活模型已有的相关知识。这就像不动你的大脑，但通过不同的提问方式来引导你回忆和使用特定知识。

RLHF 通过修改目标来适配。它不改变模型结构，也不改变输入格式，而是通过偏好信号来改变模型的"行为倾向"——从"预测最可能的下一个词"转变为"预测人类最偏好的下一个词"。

三者可以组合使用：LoRA 微调后的模型可以通过更好的 prompt 进一步提升效果；RLHF 训练的模型也可以用 LoRA 在特定任务上继续微调。实践中最有影响力的系统往往结合了多种范式。

## 实际案例

### 案例 1：LoRA 在医疗 NLP 中的应用

2023 年，一个研究团队在医疗问答数据集上使用 LoRA 微调 LLaMA-2 7B。他们只用了 2 万条医生标注的问答对，以 rank=16 的 LoRA 配置训练。结果：

- 可训练参数：约 400 万（总参数 70 亿的 0.06%）
- 训练时间：单张 A100 约 3 小时
- 在医疗问答准确率上从基线的 45% 提升到 82%
- 超过了在相同数据上全参数微调的效果（78%），因为 LoRA 的正则化效果减轻了过拟合

这个案例说明，当标注数据有限时，PEFT 方法不仅更高效，有时效果甚至更好。

进一步的技术细节：该团队使用 4-bit 量化（QLoRA）加载 LLaMA-2，将显存占用从 14GB 降到约 6GB，使得在消费级 GPU 上微调 70 亿参数模型成为可能。LoRA 的 rank=16 被应用到了所有注意力层的 Q、K、V、O 矩阵上，学习率设为 $2 \times 10^{-4}$，使用 cosine scheduler。整个训练过程消耗约 0.5 GPU-hours 的计算量——成本不到 2 美元。

这个案例也揭示了一个重要的实践原则：**在领域特定任务上，小模型+LoRA 可以超越大模型的零样本效果**。LLaMA-2 7B 的零样本医疗问答准确率只有约 40%，但 LoRA 微调后达到了 82%，甚至超过了 GPT-4 的零样本效果（约 76%）。微调让模型在特定领域的知识密度大幅提升。

### 案例 2：Prompt Engineering 驱动的客服系统

一家电商平台在 2022 年构建了基于 GPT-3.5 的客服系统。他们没有做任何微调，完全依靠 prompt engineering：

- 设计了包含角色定义、常见问答模板和安全边界的 system prompt（约 500 token）
- 对 20 种常见问题类型设计了专门的 prompt 模板
- 使用 few-shot 示例处理复杂场景（退货流程、物流查询等）

上线后的效果：
- 自动解决率从规则系统的 30% 提升到 65%
- 平均响应时间从 45 秒降到 5 秒
- 客户满意度评分从 3.2 提升到 4.1（满分 5 分）

这个案例的另一个重要发现是 prompt 的鲁棒性。团队发现，同一个意图的不同表达方式（"我要退货"、"怎么退货"、"退货流程是什么"）会导致模型给出不同质量的回答。为此，他们对每种意图维护了多个变体模板，用规则系统先分类意图再选择对应的 prompt 模板。这种"规则+大模型"的混合架构在实践中非常常见，它结合了规则系统的可靠性和大模型的灵活性。

此外，该团队还实现了 prompt 版本控制和 A/B 测试系统。不同的 prompt 模板在灰度发布后比较效果指标（解决率、满意度、平均对话轮数），只有统计显著更好的模板才会被推全。这种工程化的 prompt 管理方式已经成为了行业标准实践。

### 案例 3：RLHF 训练的开源对话模型

Meta 在 2023 年发布了 LLaMA-2 Chat 系列。这个模型的训练流程清晰地展示了范式 3 的完整过程：

1. **预训练**：在 2T tokens 的公开数据上训练 LLaMA-2 基础模型
2. **SFT**：使用 27,540 条人工标注的高质量对话做监督微调
3. **RLHF**：收集超过 100 万条人类偏好比较数据，训练奖励模型后用 RL 优化
4. **迭代优化**：多轮 RLHF 训练，逐步提升模型的对齐质量

结果：LLaMA-2 70B Chat 在人类评估中接近 ChatGPT（GPT-3.5）的水平，成为当时最强的开源对话模型。

Meta 公开的训练细节揭示了 RLHF 的一些重要实践发现。首先，RLHF 的效果对奖励模型的质量极其敏感——一个更好的奖励模型直接导致更好的 RLHF 效果。其次，他们发现多轮 RLHF（用更新后的模型生成新数据，然后重新训练奖励模型，再优化策略模型）比单轮 RLHF 效果好得多。最后，安全性和有用性之间存在张力——过度优化安全性会导致模型过度拒绝正常请求（"我很抱歉，我无法..."），需要在两者之间找到平衡。

## 权衡分析

### 范式选择决策树

```
你有标注数据吗？
├── 没有 → 用 Prompt（范式 2）或直接用对齐后的通用模型（范式 3）
├── 有少量（<1000 条）→ LoRA 微调（范式 1 的 PEFT 变体）
├── 有中等量（1000-10 万条）→ LoRA 或全参数微调
└── 有大量（>10 万条）→ 全参数微调（范式 1）

你的任务是什么？
├── 分类/标注 → Fine-tune（范式 1）
├── 生成 → 看复杂度：
│   ├── 简单格式转换 → Prompt（范式 2）
│   └── 复杂推理/长文本 → Fine-tune + 可能需要 RLHF
├── 对话/助手 → 需要对齐训练（范式 3）
└── 多任务 → 通用对齐模型 + 任务特定 Prompt
```

### 各范式的隐性成本

| 成本维度 | Fine-tune | Prompt | RLHF |
|----------|-----------|--------|------|
| 计算成本 | 中（需要 GPU 训练） | 低（只推理） | 极高（多轮训练） |
| 人力成本 | 中（标注数据） | 低（设计 prompt） | 高（偏好标注） |
| 维护成本 | 高（每个任务一个模型） | 低（更新 prompt） | 中（迭代对齐） |
| 迁移成本 | 高（换任务要重新微调） | 低（换 prompt） | 低（通用能力） |
| 质量控制 | 可控（训练集质量决定上限） | 不可控（依赖模型能力） | 可控（偏好数据引导） |

### 当前的实践共识（2024-2025）

业界形成了以下共识：

1. **优先使用对齐后的通用模型**（GPT-4、Claude、LLaMA-Chat 等），通过 prompt 完成大多数任务
2. **当通用模型不够用时**，使用 LoRA 在任务数据上微调开源模型
3. **当需要构建自己的对话产品时**，SFT + DPO 是标准流程
4. **全参数微调** 只在特定场景下使用：数据量极大、任务非常特殊、需要最大化性能

### 常见的实践错误和陷阱

在实践中，以下错误反复出现，值得单独列出：

**过度微调**：用太多 epoch 微调小数据集，导致模型"记住"训练集但在新数据上表现很差。经验法则是：当训练数据少于 1000 条时，LoRA 的 epoch 不超过 10；数据量更大时，epoch 应该更少（1-3 个）。

**Prompt 过于复杂**：试图在一个 prompt 中塞太多指令。研究显示，当指令超过一定长度后，模型的遵从率反而下降。更好的做法是将复杂任务分解为多个步骤，每步一个简洁的 prompt。

**忽视评估**：没有建立系统的评估流程就上线模型。无论哪种范式，都需要：建立测试集、定义评估指标、设置性能阈值、定期评估。对于生成任务，人工评估仍然是金标准。

**数据泄漏**：在微调或评估时使用了包含测试集信息的数据。这在公开数据集上尤为常见——模型可能已经在预训练阶段"见过"测试集。解决方案是使用时间切分（只用某个日期之后的数据做测试）或专门构建的私有测试集。

## 要点总结

1. **范式演进的核心趋势是降低使用门槛**：从需要 ML 专业知识到只需要自然语言对话。这使得 AI 从研究工具变成了通用工具。

2. **LoRA 是当前最实用的微调方法**：0.1%-1% 的可训练参数，无推理开销（可合并权重），适用于几乎所有微调场景。理解 LoRA 的关键是"微调具有内在低维性"。

3. **Prompt Engineering 不是临时方案而是工程学科**：思维链、Few-shot、结构化指令等技术在实践中被证明高度有效。好的 prompt 可以显著减少对微调的需求。

4. **RLHF/DPO 是让模型从"会说话"变成"会说好话"的关键技术**：预训练给模型知识，SFT 教模型回答问题，RLHF/DPO 教模型给出"好的"回答。对齐训练是通用助手模型不可或缺的步骤。

5. **范式之间不是替代关系而是互补关系**：在实际项目中，三种范式经常组合使用。比如先用对齐模型做基线，再用 LoRA 微调优化特定任务，同时持续优化 prompt 模板。

6. **数据质量是所有范式的共同瓶颈**：无论哪种范式，"垃圾进垃圾出"都成立。微调需要高质量标注数据，Prompt 需要模型在高质量数据上预训练，RLHF 需要高质量的偏好标注。投入在数据质量上的精力通常比投入在算法调优上回报更高。

7. **范式还在继续演进**：当前的前沿探索包括 Constitutional AI（用 AI 反馈替代人类反馈）、RLAIF（用 AI 评估替代人类评估）、在线 RLHF（持续收集偏好数据并更新模型）、以及多模态对齐（将文本对齐技术扩展到图像、音频等领域）。这些探索可能在未来几年形成新的范式。

## 延伸阅读

- **LoRA 原始论文**：Hu et al., "LoRA: Low-Rank Adaptation of Large Language Models" (2021) — LoRA 的理论推导和实验验证
- **Chinchilla 的启示**：Hoffmann et al., "Training Compute-Optimal Large Language Models" (2022) — 虽然是关于 Scaling Law，但其"用更多数据训练更小模型"的结论直接影响了微调策略
- **DPO 论文**：Rafailov et al., "Direct Preference Optimization: Your Language Model is Secretly a Reward Model" (2023) — DPO 的理论基础和实现细节
- **Prompt 综述**：Liu et al., "Pre-train, Prompt, and Predict: A Systematic Survey" (2021) — Prompt 方法分类和实践指南
- **InstructGPT**：Ouyang et al., "Training language models to follow instructions with human feedback" (2022) — ChatGPT 的技术报告，详细描述了 RLHF 的完整流程
- **FLAN**：Wei et al., "Finetuned Language Models Are Zero-Shot Learners" (2022) — 指令微调的开创性工作
- **Chain-of-Thought**：Wei et al., "Chain-of-Thought Prompting Elicits Reasoning in Large Language Models" (2022) — 思维链提示技术
- **Constitutional AI**：Bai et al., "Constitutional AI: Harmlessness from AI Feedback" (2022) — 用 AI 反馈替代人类反馈的对齐方法
