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

### 6. BERT 的局限性

1. **[MASK] 标记的人工性**：预训练用 [MASK]，微调没有 [MASK]。这个不一致虽然被 80-10-10 规则部分缓解，但仍然存在。

2. **独立假设**：MLM 假设被遮蔽的 token 之间是条件独立的。实际上，如果"New"和"York"都被遮蔽了，它们的预测是相关的，但 MLM 的交叉熵损失没有建模这种相关性。

3. **生成能力弱**：BERT 是编码器模型，不是天生为生成设计的。用它做生成需要额外的技巧（如 Mask-Predict 迭代解码）。

4. **预训练成本高**：BERT-base 需要约 12 TPU-days 的预训练。对于大多数研究者来说，从头预训练 BERT 是不可行的。

5. **NSP 的有效性存疑**：如前所述，RoBERTa 去掉 NSP 后效果更好。

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
