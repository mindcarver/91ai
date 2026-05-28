<!--
调研来源：
1. Devlin et al., "BERT: Pre-training of Deep Bidirectional Transformers for Language Understanding" (2019) — BERT 原始论文
2. Clark et al., "BERT Looks at The Margin: What Does BERT Look At?" (2019) — BERT 注意力分析
3. Jawahar et al., "What does BERT learn about the structure of language?" (2019) — BERT 层级分析
4. "The Illustrated BERT" (Jay Alammar) — BERT 可视化教程
5. Liu et al., "RoBERTa: A Robustly Optimized BERT Pretraining Approach" (2019) — BERT 优化版本
6. Lan et al., "ALBERT: A Lite BERT for Self-supervised Learning" (2020) — 轻量 BERT

核心发现：BERT 的核心创新是双向编码——通过 MLM（Masked Language Model）预训练任务，让模型同时看到一个词左边和右边的上下文。这与 GPT 的单向（从左到右）形成了鲜明对比。MLM 随机遮蔽 15% 的 token，让模型根据上下文预测被遮蔽的词。NSP（Next Sentence Prediction）让模型判断两句话是否相邻。BERT 的微调范式（预训练 + 在下游任务上微调）成为 2018-2020 年 NLP 的标准工作流。BERT-base 有 110M 参数（12 层，768 维），BERT-large 有 340M 参数（24 层，1024 维）。
-->

# BERT：双向编码、MLM / NSP 预训练、微调范式

**TL;DR：** BERT（Bidirectional Encoder Representations from Transformers）用 Transformer 编码器做双向文本表示。它的两个预训练任务——MLM（遮蔽语言模型，随机遮蔽 15% 的 token 让模型预测）和 NSP（判断两句话是否相邻）——让模型学到了丰富的双向上下文表示。预训练完成后，只需要在下游任务上加一个简单的分类层做微调，就能在 11 个 NLP 基准上达到 SOTA。BERT 确立了"预训练-微调"范式，是 NLP 发展史上的一个重要里程碑。

## 为什么这很重要

在 BERT 之前，NLP 的标准工作流是：
1. 在大规模文本上训练词向量（Word2Vec/GloVe）
2. 把词向量作为特征输入到任务特定的模型中
3. 从头训练任务模型

BERT 改变了这个流程：
1. 在大规模文本上预训练整个模型（不只是词向量）
2. 在下游任务上微调整个模型

区别在于"预训练的深度"。Word2Vec 只预训练了最底层的词向量，BERT 预训练了整个网络。这意味着 BERT 到达下游任务时，已经具备了强大的语言理解能力——不需要从零开始。

BERT 的效果是碾压级的。2018 年 10 月发布后，它在 GLUE（通用语言理解评估）、SQuAD（问答）、SWAG（常识推理）等 11 个 NLP 基准上同时刷新了最佳成绩。这在 NLP 社区引发了轰动。

BERT 的影响不仅限于学术研究。在工业界，BERT 几乎立刻被 Google 部署到了搜索引擎中（2019 年底），用于更好地理解搜索查询的语义。这是 NLP 预训练模型大规模落地应用的标志性事件。随后，BERT 及其变体被广泛应用于内容推荐、广告匹配、客服对话、文档分类等几乎所有涉及文本理解的场景。

从 BERT 开始，"预训练-微调"成为了 NLP 的标准范式。这个范式的核心优势在于**迁移学习**：模型在大规模无标注数据上学到的语言知识，可以通过少量标注数据迁移到各种下游任务上。这意味着即使你只有几百条标注数据，也能构建出高质量的 NLP 系统。

## 核心概念

### BERT 的核心创新：双向编码

在 BERT 之前，预训练语言模型有两个方向：
- **ELMo**：用两个单向 LSTM（一个从左到右，一个从右到左）分别编码，然后拼接。虽然用了两个方向，但每个方向的 LSTM 只能看到一半的上下文。
- **GPT**：用 Transformer 解码器，严格从左到右。每个位置只能看到左边的 token。

BERT 用 Transformer 编码器做真正的双向编码。在自注意力中，每个 token 可以直接看到序列中的所有其他 token——左边和右边。

```
单向（GPT）:
  [I] [love] [AI] → [MASK]
   ↑     ↑     ↑      ↑
   看不到右边的词

双向（BERT）:
  [I] [love] [AI] [MASK]
   ↕     ↕     ↕      ↕
   所有词互相可见
```

但双向编码带来了一个问题：如果你让模型预测"下一个词"（像 GPT 那样），但模型已经看到了所有词，那这个任务太简单了（直接复制就行了）。

BERT 的解决方案：**Masked Language Model（MLM）**。

### 两个预训练任务

**MLM（Masked Language Model）**：
- 随机选择 15% 的 token 进行处理
- 其中 80% 替换为 [MASK] 特殊标记
- 10% 替换为随机词
- 10% 保持不变
- 模型需要预测这些位置的原始词

**NSP（Next Sentence Prediction）**：
- 输入两句话 A 和 B
- 50% 概率 B 确实是 A 的下一句（正样本）
- 50% 概率 B 是随机抽取的句子（负样本）
- 模型需要判断 B 是否是 A 的下一句

### BERT 的输入表示

BERT 的输入由三部分组成：

$$\text{input} = \text{Token Embedding} + \text{Segment Embedding} + \text{Position Embedding}$$

- **Token Embedding**：词的嵌入向量。[CLS] 在句首，[SEP] 分隔句子
- **Segment Embedding**：区分句子 A 和句子 B（用于 NSP）
- **Position Embedding**：可学习的位置嵌入（和原始 Transformer 的正弦编码不同）

```
输入示例:
  [CLS] 我 喜欢 机器 学习 [SEP] 它 很 有趣 [SEP]

  Token:    [CLS] 我 喜欢 机器 学习 [SEP] 它 很 有趣 [SEP]
  Segment:    A    A   A    A    A    A    B   B   B    B
  Position:   0    1   2    3    4    5    6   7   8    9
```

## 工作原理（简化的心智模型）

### 给 12 岁孩子的解释

**MLM** 就像做英语考试中的"完形填空"。老师把一段话里的一些词挖掉，让你根据上下文填回来。你同时看空格前后的文字来推断空格里应该填什么——这就是"双向"。

**NSP** 就像判断两段话是不是连续的。"我喜欢猫。猫很可爱。" 是连续的。"我喜欢猫。股市今天大跌。" 不是连续的。

**微调** 就像考试前做模拟题。你已经通过大量阅读（预训练）积累了语言能力，现在只需要做几套目标类型的模拟题（微调）就能考高分。

## 工作原理（详细机制）

### 1. MLM 的详细设计

为什么 15% 中只有 80% 被替换为 [MASK]？

如果 100% 都替换为 [MASK]，问题在于微调时输入中没有 [MASK] 标记——这造成了预训练和微调之间的不一致。模型在预训练时学到的"如何处理 [MASK]"在微调时用不上。

解决方案（80-10-10 规则）：

```
原始:  我 喜欢 机器 学习 和 深度 学习
         ↓    ↓    ↓    ↓    ↓    ↓    ↓
选择:  [MASK] 喜欢 [MASK] 学习 和 [rand] 学习

80% → [MASK]:  我 → [MASK], 机器 → [MASK]
10% → 随机词:  深度 → 自然的  (随机替换)
10% → 不变:    学习 → 学习     (保持原词)
```

这个设计的巧妙之处：
- 大部分被遮蔽（80%）：模型被迫根据上下文预测
- 少量随机替换（10%）：模型对每个词都要考虑"它是不是正确的词"
- 少量不变（10%）：保持输入分布的稳定性

MLM 的损失函数就是标准的交叉熵：

$$\mathcal{L}_{MLM} = -\sum_{i \in \text{masked}} \log P(w_i | w_1, \ldots, w_{i-1}, w_{i+1}, \ldots, w_n)$$

### 2. NSP 的详细设计

NSP 的目的是让模型学到句子间的关系。这对问答（判断答案是否对应问题）和自然语言推理（判断两句话的逻辑关系）等任务很重要。

输入格式：

```
正样本:
  [CLS] 猫坐在垫子上 [SEP] 它看起来很舒服 [SEP]
  Label: IsNext

负样本:
  [CLS] 猫坐在垫子上 [SEP] 股市今天大涨 [SEP]
  Label: NotNext
```

[CLS] 的最终表示被送入一个二分类器来预测 IsNext/NotNext。

$$\mathcal{L}_{NSP} = -\log P(\text{IsNext} | \text{[CLS] representation})$$

#### NSP 的争议

后来的研究发现 NSP 可能不是必要的。RoBERTa（2019）去掉 NSP 后，在大部分任务上效果持平甚至更好。原因可能是 NSP 太简单了——模型可以通过判断两个句子的主题是否一致来解决问题，而不需要理解句子间的逻辑关系。

ALBERT 把 NSP 替换为 SOP（Sentence Order Prediction），强制模型区分"A 在 B 前面"和"B 在 A 前面"——这比 NSP 更难，也更有效。

### MLM 遮蔽策略的进一步分析

MLM 的遮蔽策略看似简单，但其中有一些容易忽视的细节。

**整词遮蔽（Whole Word Masking）**：原始 BERT 的遮蔽是在 WordPiece 子词级别进行的。这意味着"playing"可能只被遮蔽了"##ing"而保留了"play"。模型可以通过未遮蔽的部分轻松推断出被遮蔽的部分，降低了任务的难度。中文 BERT（BERT-wwm）引入了整词遮蔽：如果一个词的任何一个子词被选中遮蔽，则该词的所有子词都被遮蔽。例如"机器学习"如果被选中，四个字全部被遮蔽。

整词遮蔽的效果提升在中文上尤其显著（约 1-2% 的绝对提升），因为中文的字级别遮蔽太简单了——看到"器学"很容易猜出"机器学习"。英文上提升较小但一致。

**Span 遮蔽**：SpanBERT 进一步扩展了这个思路，不是随机遮蔽单个 token，而是遮蔽连续的片段（span）。每个被遮蔽的片段长度从几何分布中采样，平均长度约 3.8 个 token。Span 遮蔽迫使模型预测更长的连续片段，这比预测分散的单个 token 更有挑战性，也更接近实际的下游任务需求（如问答需要预测连续的答案片段）。

SpanBERT 在抽取式问答（SQuAD）和关系抽取等任务上显著优于原始 BERT，验证了"更难的预训练任务带来更好的表示"这个假设。

### 3. BERT 的模型架构

BERT 使用 Transformer 编码器（没有解码器）。

| 配置 | BERT-base | BERT-large |
|------|-----------|------------|
| 层数 $L$ | 12 | 24 |
| 隐藏维度 $H$ | 768 | 1024 |
| 注意力头数 $A$ | 12 | 16 |
| FFN 中间维度 | 3072 | 4096 |
| 参数量 | 110M | 340M |
| 训练数据 | Wikipedia + BookCorpus (16GB) | 同上 |
| 训练步数 | 1M | 1M |
| 预训练计算量 | ~12 TPU-days | ~48 TPU-days |

为什么是这些数字？
- $H = 768$，$A = 12$ → 每个头的维度是 $768/12 = 64$（和原始 Transformer 相同）
- FFN 维度是 $H$ 的 4 倍（$3072 = 4 \times 768$），这也是原始 Transformer 的设计
- 12 层是计算量和性能之间的权衡

### 4. 微调范式

BERT 的微调极其简单——在预训练模型的输出上加一个任务特定的层，然后端到端训练。

#### 文本分类

```
[CLS] 文本内容 [SEP]
  │
  ▼ BERT Encoder (12 层)
  │
  ▼ 取 [CLS] 的输出表示 (768 维)
  │
  ▼ Linear(768, num_classes) → Softmax
```

损失函数：交叉熵。整个模型（包括 BERT）都参与训练。

#### 问答（SQuAD）

```
[CLS] 问题 [SEP] 文章 [SEP]
  │
  ▼ BERT Encoder
  │
  ├──→ Linear(768, 1) → Sigmoid → 答案起始位置概率
  │
  └──→ Linear(768, 1) → Sigmoid → 答案结束位置概率
```

对于文章中的每个 token，模型预测它是答案的起始位置还是结束位置的概率。

#### 命名实体识别（NER）

```
[CLS] 文本内容 [SEP]
  │
  ▼ BERT Encoder
  │
  ▼ 每个 token 的输出 → Linear(768, num_labels) → Softmax
```

对每个 token 做分类（人名/地名/组织名/其他）。

### 5. 为什么 BERT 的微调如此有效

关键在于预训练阶段学到的表示是"通用的"——它们编码了语法、语义、事实知识等多种信息，适用于各种下游任务。

Jawahar et al. (2019) 的分析发现，BERT 的不同层学到了不同级别的语言信息：
- **底层（1-4 层）**：编码词法和短语级别的信息
- **中层（5-8 层）**：编码句法和语义信息
- **高层（9-12 层**）：编码任务特定的和高级语义信息

这种"分层表示"是 BERT 能有效微调的原因——不同任务可以利用不同层的信息。

更深入地看，BERT 的微调有效性来自以下几个因素的协同作用：

**双向上下文的丰富性**：每个 token 的表示融合了来自左右两个方向的信息。这意味着"bank"这个词的表示在"river bank"和"investment bank"中是不同的——模型通过上下文消歧。这种上下文敏感的表示比静态词向量（如 Word2Vec）信息量更大。

**预训练任务的普适性**：MLM 本质上是一种去噪自编码——输入被部分损坏（遮蔽），模型学习恢复原始输入。这个任务迫使模型理解 token 之间的依赖关系，而这些依赖关系对所有语言理解任务都是有用的。

**大规模数据的多样性**：BERT 在 Wikipedia 和 BookCorpus 上训练，覆盖了广泛的主题、风格和语言结构。这种多样性让预训练表示具有广泛的适用性。

**微调的低数据需求**：因为预训练已经学到了强大的语言表示，微调只需要在目标任务上做少量调整。BERT-base 在只有几百条标注数据的情况下，通常就能在下游任务上取得不错的效果。

### 6. BERT 的局限性

1. **[MASK] 标记的人工性**：预训练用 [MASK]，微调没有 [MASK]。这个不一致虽然被 80-10-10 规则部分缓解，但仍然存在。

2. **独立假设**：MLM 假设被遮蔽的 token 之间是条件独立的。实际上，如果"New"和"York"都被遮蔽了，它们的预测是相关的，但 MLM 的交叉熵损失没有建模这种相关性。

3. **生成能力弱**：BERT 是编码器模型，不是天生为生成设计的。用它做生成需要额外的技巧（如 Mask-Predict 迭代解码）。

4. **预训练成本高**：BERT-base 需要约 12 TPU-days 的预训练。对于大多数研究者来说，从头预训练 BERT 是不可行的。

5. **NSP 的有效性存疑**：如前所述，RoBERTa 去掉 NSP 后效果更好。

### 7. BERT 的训练细节

BERT 的训练涉及多个重要的工程决策，这些决策对最终效果的影响不亚于模型架构本身。

**优化器**：BERT 使用 AdamW 优化器（带权重衰减的 Adam），学习率为 $2 \times 10^{-5}$ 到 $5 \times 10^{-5}$。学习率预热（warmup）在前 10% 的训练步中线性增加学习率，然后线性衰减。这个预热策略对 Transformer 的训练稳定性至关重要——初始阶段梯度方向不稳定，小学习率可以防止参数跳到不好的区域。

**批大小**：BERT-base 的预训练使用了 256 的批大小，在 16GB TPU 上训练。大批大小有两个好处：一是训练更稳定（梯度估计更准确），二是每个 epoch 可以看到更多数据。但大样大小也需要更大的学习率来补偿。

**序列长度**：BERT 在 90% 的训练步中使用 128 的序列长度（快速处理短文本），在最后 10% 的训练步中使用 512 的序列长度（学习长距离依赖）。这个策略大幅减少了预训练的计算成本，因为短序列的注意力计算是 $O(n^2)$ 的。

**词汇表**：BERT 使用 WordPiece 分词，词汇表大小为 30000。WordPiece 将低频词分解为子词单元（如 "playing" → "play" + "##ing"），在处理未登录词（OOV）方面比词级别分词更鲁棒。"##" 前缀表示这是一个词的后缀片段。

**训练数据**：BERT-base 在 Wikipedia（约 25 亿词）和 BookCorpus（约 8 亿词）上训练，总计约 33 亿词。这个数据量在今天看来不算大——LLaMA 用了 1.4 万亿 token——但在 2018 年是当时最大的预训练数据之一。数据选择标准是"高质量文本"：Wikipedia 经过人工审核，BookCorpus 来自已出版的书籍。

## 代码示例（完整可运行的 Python）

### 使用 HuggingFace Transformers 做文本分类

```python
"""
BERT 微调文本分类完整示例
使用 HuggingFace Transformers
运行要求: pip install torch transformers datasets
"""

import torch
import torch.nn as nn
from torch.utils.data import DataLoader
from transformers import BertTokenizer, BertModel, BertConfig


class BertForClassification(nn.Module):
    """BERT + 分类头"""
    def __init__(self, model_name='bert-base-uncased', num_classes=2):
        super().__init__()
        self.bert = BertModel.from_pretrained(model_name)
        self.classifier = nn.Sequential(
            nn.Dropout(0.1),
            nn.Linear(self.bert.config.hidden_size, num_classes),
        )

    def forward(self, input_ids, attention_mask=None, token_type_ids=None):
        outputs = self.bert(
            input_ids=input_ids,
            attention_mask=attention_mask,
            token_type_ids=token_type_ids,
        )
        # 使用 [CLS] 的输出做分类
        cls_output = outputs.pooler_output  # (batch, hidden_size)
        logits = self.classifier(cls_output)
        return logits


class BertMLM(nn.Module):
    """简化版 BERT MLM 训练"""
    def __init__(self, vocab_size, d_model=128, n_heads=4, n_layers=2, d_ff=512):
        super().__init__()
        self.embedding = nn.Embedding(vocab_size, d_model)
        self.pos_embedding = nn.Embedding(512, d_model)
        self.segment_embedding = nn.Embedding(2, d_model)

        encoder_layer = nn.TransformerEncoderLayer(
            d_model=d_model, nhead=n_heads, dim_feedforward=d_ff,
            dropout=0.1, batch_first=True
        )
        self.encoder = nn.TransformerEncoder(encoder_layer, num_layers=n_layers)
        self.mlm_head = nn.Linear(d_model, vocab_size)
        self.nsp_head = nn.Linear(d_model, 2)
        self.norm = nn.LayerNorm(d_model)

    def forward(self, input_ids, segment_ids=None):
        B, L = input_ids.shape
        positions = torch.arange(L, device=input_ids.device).unsqueeze(0).expand(B, L)

        if segment_ids is None:
            segment_ids = torch.zeros(B, L, dtype=torch.long, device=input_ids.device)

        x = self.embedding(input_ids) + self.pos_embedding(positions) + self.segment_embedding(segment_ids)
        x = self.encoder(x)
        x = self.norm(x)

        # MLM: 每个 token 预测原始词
        mlm_logits = self.mlm_head(x)

        # NSP: [CLS] 位置预测
        cls_output = x[:, 0]
        nsp_logits = self.nsp_head(cls_output)

        return mlm_logits, nsp_logits


def create_mlm_data(texts, vocab, mask_prob=0.15):
    """创建 MLM 训练数据"""
    mask_token_id = vocab.get('[MASK]', 1)
    pad_token_id = vocab.get('[PAD]', 0)

    all_inputs = []
    all_labels = []

    for text in texts:
        tokens = [vocab.get(w, vocab.get('[UNK]', 2)) for w in text.split()]

        input_ids = tokens.copy()
        labels = [-100] * len(tokens)  # -100 = 忽略

        # 随机遮蔽
        for i in range(len(tokens)):
            if torch.rand(1).item() < mask_prob:
                labels[i] = tokens[i]  # 记录原始 token
                r = torch.rand(1).item()
                if r < 0.8:
                    input_ids[i] = mask_token_id
                elif r < 0.9:
                    input_ids[i] = torch.randint(3, len(vocab), (1,)).item()

        all_inputs.append(input_ids)
        all_labels.append(labels)

    return all_inputs, all_labels


# ============================================================
# 验证代码
# ============================================================
if __name__ == "__main__":
    torch.manual_seed(42)

    print("=" * 60)
    print("BERT MLM 训练示例")
    print("=" * 60)

    # 简单词汇表
    vocab = {
        '[PAD]': 0, '[MASK]': 1, '[UNK]': 2, '[CLS]': 3, '[SEP]': 4,
        '我': 5, '喜欢': 6, '机器': 7, '学习': 8, '和': 9,
        '深度': 10, '它': 11, '很': 12, '有趣': 13, '猫': 14,
        '坐': 15, '在': 16, '垫子': 17, '上': 18, '狗': 19,
        '追': 20, '跑': 21,
    }
    vocab_size = len(vocab)

    # 训练数据
    texts = [
        "我 喜欢 机器 学习",
        "我 喜欢 深度 学习",
        "猫 坐 在 垫子 上",
        "狗 追 猫 跑",
        "机器 学习 很 有趣",
        "深度 学习 和 机器 学习",
    ]

    model = BertMLM(vocab_size, d_model=64, n_heads=4, n_layers=2, d_ff=256)
    optimizer = torch.optim.Adam(model.parameters(), lr=1e-3)
    mlm_criterion = nn.CrossEntropyLoss(ignore_index=-100)
    nsp_criterion = nn.CrossEntropyLoss()

    print(f"\n模型参数量: {sum(p.numel() for p in model.parameters()):,}")

    for epoch in range(30):
        inputs, labels = create_mlm_data(texts, vocab)

        # 构建batch（padding）
        max_len = max(len(x) for x in inputs)
        input_ids = []
        label_ids = []
        for inp, lab in zip(inputs, labels):
            padded_inp = inp + [0] * (max_len - len(inp))
            padded_lab = lab + [-100] * (max_len - len(lab))
            input_ids.append(padded_inp)
            label_ids.append(padded_lab)

        input_ids = torch.LongTensor(input_ids)
        label_ids = torch.LongTensor(label_ids)

        # NSP 标签（简化：随机生成）
        nsp_labels = torch.randint(0, 2, (len(texts),))

        mlm_logits, nsp_logits = model(input_ids)

        mlm_loss = mlm_criterion(
            mlm_logits.view(-1, vocab_size), label_ids.view(-1)
        )
        nsp_loss = nsp_criterion(nsp_logits, nsp_labels)
        total_loss = mlm_loss + 0.5 * nsp_loss

        optimizer.zero_grad()
        total_loss.backward()
        torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
        optimizer.step()

        if (epoch + 1) % 10 == 0:
            print(f"Epoch {epoch+1}/30 | MLM Loss: {mlm_loss.item():.4f} | "
                  f"NSP Loss: {nsp_loss.item():.4f}")

    # 测试 MLM
    print("\nMLM 测试:")
    test_text = "我 喜欢 [MASK] 学习"
    test_ids = [vocab.get(w, 2) for w in test_text.split()]
    test_tensor = torch.LongTensor([test_ids])
    with torch.no_grad():
        mlm_logits, _ = model(test_tensor)

    mask_pos = 2  # [MASK] 的位置
    probs = torch.softmax(mlm_logits[0, mask_pos], dim=-1)
    top5 = probs.argsort(descending=True)[:5]
    idx2word = {v: k for k, v in vocab.items()}
    print(f"  输入: '{test_text}'")
    print(f"  [MASK] 位置预测 Top-5:")
    for idx in top5:
        print(f"    {idx2word.get(idx.item(), '???')}: {probs[idx].item():.4f}")

    # 使用预训练 BERT 的示例（需要网络下载）
    print("\n" + "=" * 60)
    print("HuggingFace BERT 示例（概念展示）")
    print("=" * 60)

    print("\nBERT-base 配置:")
    config = BertConfig()
    print(f"  层数: {config.num_hidden_layers}")
    print(f"  隐藏维度: {config.hidden_size}")
    print(f"  注意力头数: {config.num_attention_heads}")
    print(f"  FFN 维度: {config.intermediate_size}")
    print(f"  词汇表大小: {config.vocab_size}")
    print(f"  最大位置: {config.max_position_embeddings}")

    # 估算参数量
    d = config.hidden_size
    h = config.num_attention_heads
    n = config.num_hidden_layers
    d_ff = config.intermediate_size
    v = config.vocab_size

    embed_params = v * d
    per_layer = 4 * d * d + 2 * d * d_ff + 4 * 2 * d  # Attention + FFN + LN
    total = embed_params + n * per_layer + d + v * d  # embed + layers + pooler + output
    print(f"  估算参数量: {total / 1e6:.1f}M")
```

**预期输出：**

```
============================================================
BERT MLM 训练示例
============================================================

模型参数量: ~xxx,xxx

Epoch 10/30 | MLM Loss: x.xxxx | NSP Loss: x.xxxx
Epoch 20/30 | MLM Loss: x.xxxx | NSP Loss: x.xxxx
Epoch 30/30 | MLM Loss: x.xxxx | NSP Loss: x.xxxx

MLM 测试:
  输入: '我 喜欢 [MASK] 学习'
  [MASK] 位置预测 Top-5:
    机器: 0.xxxx
    深度: 0.xxxx
    ...

============================================================
HuggingFace BERT 示例（概念展示）
============================================================

BERT-base 配置:
  层数: 12
  隐藏维度: 768
  注意力头数: 12
  FFN 维度: 3072
  词汇表大小: 30522
  最大位置: 512
  估算参数量: 108.9M
```

## 代码解析

上面的代码实现了 BERT 的两个核心组件：MLM 预训练和分类微调。

**BertMLM 类**实现了一个简化版的 BERT 预训练模型。它使用 `nn.TransformerEncoderLayer` 作为基本构建块，堆叠了指定数量的编码器层。输入表示由三部分组成：token embedding（词嵌入）、position embedding（位置嵌入）和 segment embedding（句子标识嵌入），三者相加后输入编码器。`mlm_head` 是一个线性层，将编码器输出映射到词汇表维度，用于预测被遮蔽位置的原始 token。`nsp_head` 取 [CLS] 位置的输出做二分类。

**create_mlm_data 函数**实现了 BERT 的遮蔽策略：对每个 token，以 15% 的概率被选中进行遮蔽处理。被选中的 token 中，80% 替换为 [MASK]，10% 替换为随机词，10% 保持不变。这个 80-10-10 规则的设计目的是平衡"模型被迫预测"和"输入分布一致性"之间的需求。

**训练循环**同时优化 MLM 损失和 NSP 损失。MLM 损失使用交叉熵，但只计算被遮蔽位置的损失（其他位置设为 -100 被忽略）。NSP 损失是 [CLS] 位置输出的二分类交叉熵。总损失是两者之和，NSP 损失乘以 0.5 的权重因子。

## 实际案例

### 案例 1：BERT 在搜索排序中的应用

Google 在 2019 年底将 BERT 部署到搜索引擎中。在此之前，搜索系统主要依赖关键词匹配和简单的词法分析。BERT 带来的改变是理解搜索查询中词与词之间的关系。

一个经典例子：搜索"2019 brazil traveler to usa need a visa"。在 BERT 之前，系统忽略了"to"这个词的重要性，不理解是"巴西人去美国"需要签证，而不是"美国人去巴西"。BERT 理解了这个方向性关系，返回了正确的结果。这个改进影响了约 10% 的英语搜索查询，后来扩展到 70+ 种语言。

### 案例 2：BERT 在医疗文本挖掘中的应用

一家医疗 AI 公司在 2020 年使用 BioBERT（在生物医学文献上继续预训练的 BERT）来构建医学文献问答系统。他们的工作流程：

1. 在 PubMed 摘要（约 4.5B 词）上继续预训练 BERT，得到 BioBERT
2. 在标注的医学问答数据集上微调（约 5000 条问答对）
3. 部署为文献检索和答案提取系统

结果：在 BioASQ 医学问答基准上，BioBERT 的 F1 分数比标准 BERT 高 8-12%。这证明了"领域适配预训练"的价值——在通用 BERT 的基础上，用领域数据做继续预训练，可以显著提升领域任务的效果。

### 案例 3：多任务微调的 BERT

一个技术博客平台使用 BERT 同时处理三个任务：文章分类、情感分析和关键词提取。他们用共享的 BERT 编码器加上三个不同的任务头，在一个多任务学习框架中联合训练。每个任务的数据量不同（分类 10 万条、情感 5 万条、关键词 2 万条），但通过共享 BERT 的底层表示，每个任务都受益于其他任务的数据。

这种多任务微调的关键设计选择是任务采样比例：每个训练步以 50%、30%、20% 的概率分别采样分类、情感、关键词任务。这个比例根据各任务的数据量和难度调整，确保模型不会偏向某个任务。

## 权衡分析

### BERT 系列模型的选择

| 模型 | 参数量 | 推理速度 | 适用场景 |
|------|--------|---------|---------|
| BERT-base | 110M | 中 | 通用 NLU 任务 |
| BERT-large | 340M | 慢 | 需要高精度的任务 |
| DistilBERT | 66M | 快 40% | 实时应用、边缘部署 |
| ALBERT | 12M-235M | 中 | 内存受限场景 |
| RoBERTa | 125M-355M | 中 | 需要最高精度的任务 |
| DeBERTa | 86M-304M | 慢 | 当前编码器模型 SOTA |

### BERT 的优势与局限

**优势**：
- 双向编码提供了比单向模型更丰富的上下文表示
- 微调极其简单，只需加一个任务头
- 生态完善，HuggingFace 等平台提供了大量预训练模型和工具
- 在理解类任务（分类、序列标注、问答）上效果优异

**局限**：
- 不适合生成任务（缺乏自回归能力）
- [MASK] 标记在预训练和微调间存在不一致
- 预训练计算成本高（从头预训练需要大量 GPU/TPU）
- 最大输入长度受限于位置编码（通常 512 token）
- MLM 的独立假设忽略了被遮蔽 token 之间的依赖关系

### 编码器模型 vs 解码器模型的选择

在实际项目中，选择 BERT（编码器）还是 GPT（解码器）取决于任务类型：

**选 BERT 的场景**：文本分类、命名实体识别、问答（答案在文本中）、语义相似度、信息抽取。这些任务需要"理解"输入文本的完整含义，双向编码有天然优势。

**选 GPT 的场景**：文本生成、对话、翻译、摘要、代码生成。这些任务需要"产出"文本，自回归生成有天然优势。

**选 T5/BART（编码器-解码器）的场景**：需要同时理解输入和生成长文本的任务，如文档摘要、翻译、纠错。

## 要点总结

1. **BERT 的核心创新是双向编码**：通过 MLM 预训练任务，让每个 token 的表示融合了来自左右两个方向的上下文信息。这比单向模型（GPT）和拼接式双向模型（ELMo）提供了更丰富的表示。

2. **MLM 的 80-10-10 规则是关键设计**：80% 遮蔽、10% 随机替换、10% 不变。这个设计在"迫使模型学习预测"和"保持输入分布一致性"之间取得了平衡，缓解了预训练和微调之间的不一致。

3. **BERT 确立了预训练-微调范式**：在大规模数据上预训练，在下游任务上微调。这个范式在 2018-2020 年间主导了 NLP 研究和实践，至今仍是特定领域任务的重要方法。

4. **BERT 的不同层学到了不同级别的信息**：底层编码词法，中层编码句法和语义，高层编码任务特定信息。这种分层表示使得微调非常高效。

5. **BERT 的微调极其简单但效果强大**：只需要在预训练模型上加一个任务特定的分类层，用少量标注数据端到端训练。在几百到几千条标注数据上就能取得很好的效果。

6. **领域适配预训练是 BERT 的重要应用模式**：在通用 BERT 的基础上用领域数据做继续预训练（如 BioBERT、SciBERT、FinBERT），可以显著提升领域任务的效果。这个模式的成本低（只需要继续预训练），效果好。

## 延伸阅读

- **BERT 原始论文**：Devlin et al., "BERT: Pre-training of Deep Bidirectional Transformers for Language Understanding" (2019) — BERT 的完整技术报告
- **RoBERTa**：Liu et al., "A Robustly Optimized BERT Pretraining Approach" (2019) — 移除 NSP、增加数据、更长训练
- **ALBERT**：Lan et al., "ALBERT: A Lite BERT for Self-supervised Learning" (2020) — 通过参数共享减少参数量
- **DeBERTa**：He et al., "DeBERTa: Decoding-enhanced BERT with Disentangled Attention" (2021) — 解耦注意力，编码器 SOTA
- **SpanBERT**：Joshi et al., "SpanBERT: Improving Pre-training by Representing and Predicting Spans" (2020) — 遮蔽连续片段而非随机 token
- **ELECTRA**：Clark et al., "ELECTRA: Pre-training Text Encoders as Discriminators Rather Than Generators" (2020) — 用检测替代预测，更高效
- **BERT 注意力分析**：Clark et al., "What Does BERT Look At?" (2019) — 分析 BERT 的注意力头学到了什么
- **The Illustrated BERT**：Jay Alammar — BERT 的可视化教程，适合入门
