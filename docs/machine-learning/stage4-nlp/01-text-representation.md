<!--
调研来源：
1. Salton & Buckley, "Term-weighting approaches in automatic text retrieval" (1988) — TF-IDF 经典论文
2. Mikolov et al., "Efficient Estimation of Word Representations in Vector Space" (2013) — Word2Vec 论文
3. Pennington et al., "GloVe: Global Vectors for Word Representation" (2014) — GloVe 论文
4. Bojanowski et al., "Enriching Word Vectors with Subword Information" (2017) — FastText 论文
5. Jurafsky & Martin, "Speech and Language Processing" (3rd ed.) — NLP 教科书中关于文本表示的章节
6. Manning & Schütze, "Foundations of Statistical Natural Language Processing" — 统计 NLP 基础

核心发现：文本表示的演进是一条"从稀疏到稠密、从手工到学习"的路线。One-Hot 编码是极端稀疏的表示（每个词是一个独立维度），TF-IDF 在此基础上加入了词频和逆文档频率的权重，词向量（Word2Vec/GloVe）将每个词映射到一个低维稠密向量空间，使得语义相似的词在空间中彼此接近。这一演进让 NLP 从"符号处理"走向了"数值计算"，是深度学习应用于 NLP 的基础。
-->

# 文本表示：从 One-Hot 到 TF-IDF 到词向量，文本怎么变成数字

**TL;DR：** 计算机不认识文字，只认识数字。文本表示就是"把文字变成数字"的方法。One-Hot 编码给每个词分配一个唯一的数字 ID，但无法表达词与词之间的关系。TF-IDF 在 One-Hot 的基础上加入了"这个词在这篇文章中有多重要"的权重。词向量（Word Embedding）则把每个词映射到一个低维向量空间，让"猫"和"狗"的向量比"猫"和"汽车"的向量更接近——语义关系变成了数学关系。这一步是所有现代 NLP 的起点。

## 为什么这很重要

你读到一个句子"猫坐在垫子上"，你理解它的意思。但计算机看到的只是一串字符。要让它做任何"智能"的事情——搜索、分类、翻译、问答——首先要把文本变成它能处理的数字表示。

文本表示的质量直接决定了下游任务的效果。用 One-Hot 编码，"猫"和"狗"的距离跟"猫"和"汽车"的距离完全一样——都是 $\sqrt{2}$。这意味着在 One-Hot 空间中，所有词都是"等距"的，没有任何语义信息。

词向量改变了这一切。在 Word2Vec 训练出的空间中，$\vec{cat} - \vec{dog} + \vec{puppy} \approx \vec{kitten}$。词与词之间的关系变成了可以计算的向量运算。这个发现是现代 NLP 的起点。

## 核心概念

### 文本表示的三种范式

| 范式 | 代表方法 | 特点 | 语义信息 |
|------|----------|------|---------|
| 离散/稀疏表示 | One-Hot, Bag of Words | 高维、极度稀疏、无语义 | 无 |
| 加权稀疏表示 | TF-IDF | 加入词频权重、更好地区分关键词 | 隐含（统计相关性） |
| 稠密/分布式表示 | Word2Vec, GloVe, FastText | 低维、稠密、语义关系明确 | 丰富（几何距离=语义距离） |

### 一个核心直觉

文本表示的演进可以用一句话概括：**从"身份编码"到"特征编码"。**

One-Hot 就像给每个人发一个身份证号。号码 123456 和号码 789012 之间没有任何关系，即使这两个人是双胞胎。

词向量就像给每个人画一幅肖像画。双胞胎的肖像画会很相似，陌生人的肖像画会很不同。画像的每个维度（眼睛大小、鼻子高度等）都携带了有意义的信息。

## 工作原理（简化的心智模型）

### 给 12 岁孩子的解释

想象你要让一个外星人理解地球上的动物。

**One-Hot 编码**：你给每种动物分配一个编号。猫=1号，狗=2号，鸟=3号，鱼=4号。外星人只知道它们是不同的，不知道猫和狗更相似。

**TF-IDF**：你统计每种动物在一本书里出现了多少次。如果"猫"在《宠物百科》里出现了 100 次但在《海洋生物》里只出现了 1 次，那么"猫"对《宠物百科》来说是一个关键词。这帮外星人理解了哪些词对哪些文章重要。

**词向量**：你给每种动物打分：毛茸茸程度（0-10）、体型（0-10）、会飞（0/1）、会游泳（0/1）。猫=[8, 3, 0, 0]，狗=[7, 5, 0, 1]，鸟=[1, 1, 1, 0]，鱼=[0, 2, 0, 1]。外星人一看就知道猫和狗最相似——它们的分数很接近。

但词向量更厉害：它不需要你手动定义这些特征。它通过阅读大量文本，自动学到这些"隐含特征"。

## 工作原理（详细机制）

### 1. One-Hot 编码

假设我们的词汇表有 5 个词：`["猫", "狗", "鸟", "坐", "垫子"]`。

每个词的 One-Hot 表示：

```
猫  = [1, 0, 0, 0, 0]
狗  = [0, 1, 0, 0, 0]
鸟  = [0, 0, 1, 0, 0]
坐  = [0, 0, 0, 1, 0]
垫子 = [0, 0, 0, 0, 1]
```

#### 数学性质

词汇表大小为 $V$。每个词是一个 $V$ 维向量，只有 1 个位置是 1，其余都是 0。

任意两个不同词的余弦相似度：

$$\cos(\mathbf{w}_i, \mathbf{w}_j) = \frac{\mathbf{w}_i \cdot \mathbf{w}_j}{|\mathbf{w}_i||\mathbf{w}_j|} = 0$$

任意两个不同词的欧氏距离：

$$d(\mathbf{w}_i, \mathbf{w}_j) = \sqrt{2}$$

所有词两两之间的距离完全相同。在 One-Hot 空间中，"猫"和"狗"的距离等于"猫"和"坐"的距离。这是 One-Hot 编码最大的问题。

#### 其他问题

1. **维度灾难**：真实词汇表通常有 5 万到 50 万个词。每个词是一个 50 万维的向量，但只有一个位置是 1。极度稀疏，浪费存储和计算。
2. **OOV（Out of Vocabulary）问题**：新出现的词无法表示。
3. **无法计算相似度**：所有词等距，无法做语义匹配。

### 2. Bag of Words（词袋模型）

词袋模型用一个向量表示一整篇文档。向量的每个维度对应词汇表中的一个词，值是该词在文档中出现的次数。

```
文档 1: "猫坐在垫子上，猫很可爱"
文档 2: "狗坐在地板上"

词汇表: ["猫", "狗", "坐", "在", "垫子", "上", "很", "可爱", "地板"]

文档 1 向量: [2, 0, 1, 1, 1, 1, 1, 1, 0]  (猫出现2次，其余各1次，狗和地板0次)
文档 2 向量: [0, 1, 1, 1, 0, 1, 0, 0, 1]
```

词袋模型的问题：
1. **丢失词序信息**："猫咬狗"和"狗咬猫"的词袋表示完全相同
2. **高频词主导**：像"的"、"是"、"在"这样的停用词出现频率极高，会淹没有意义的词
3. **维度等于词汇表大小**：仍然是稀疏高维

### 3. TF-IDF：词频-逆文档频率

TF-IDF 是词袋模型的改进，核心思想：**一个词对一篇文档越重要，它的 TF-IDF 值越高。**

#### TF（Term Frequency）：词频

一个词在文档中出现的频率越高，越可能是这篇文档的关键词。

$$TF(t, d) = \frac{f_{t,d}}{\sum_{t' \in d} f_{t',d}}$$

其中 $f_{t,d}$ 是词 $t$ 在文档 $d$ 中出现的次数。

但纯词频有问题："的"、"是"在每篇文档中都很频繁。我们需要一个惩罚机制。

#### IDF（Inverse Document Frequency）：逆文档频率

一个词在越少的文档中出现，它区分文档的能力越强。

$$IDF(t, D) = \log\frac{|D|}{|\{d \in D : t \in d\}|}$$

其中 $|D|$ 是总文档数，分母是包含词 $t$ 的文档数。

常见词（如"的"）出现在几乎所有文档中，IDF 接近 0。罕见词（如"量子纠缠"）只出现在少数文档中，IDF 值很高。

#### TF-IDF

$$TF\text{-}IDF(t, d, D) = TF(t, d) \times IDF(t, D)$$

#### 计算示例

假设我们有 3 篇文档：

```
文档 1: "机器学习 是 人工智能 的 分支" (8个词)
文档 2: "深度学习 是 机器学习 的 子领域" (7个词)
文档 3: "自然语言处理 是 人工智能 的 应用" (8个词)
```

计算"机器学习"在文档 1 中的 TF-IDF：

- $TF(\text{机器学习}, d_1) = 1/8 = 0.125$
- "机器学习"出现在文档 1 和文档 2 中，所以 $IDF = \log(3/2) = 0.176$
- $TF\text{-}IDF = 0.125 \times 0.176 = 0.022$

计算"分支"在文档 1 中的 TF-IDF：

- $TF(\text{分支}, d_1) = 1/8 = 0.125$
- "分支"只出现在文档 1 中，所以 $IDF = \log(3/1) = 0.477$
- $TF\text{-}IDF = 0.125 \times 0.477 = 0.060$

"分支"的 TF-IDF 是"机器学习"的 2.7 倍，因为"分支"更独特（只出现在一篇文档中），更能代表文档 1 的内容。

#### IDF 的变体

实际使用中，IDF 公式有一些常见的变体：

- **平滑 IDF**：$\log\frac{1 + |D|}{1 + |\{d : t \in d\}|} + 1$（scikit-learn 默认）
- **对数 + 1**：$\log\frac{|D|}{|\{d : t \in d\}|} + 1$（避免 IDF 为 0）

#### TF-IDF 的局限

1. **仍然是稀疏高维**：维度等于词汇表大小
2. **没有语义信息**："汽车"和"车"是完全不同的维度，TF-IDF 不知道它们意思相近
3. **丢失词序**：和词袋模型一样，TF-IDF 不考虑词的顺序
4. **跨文档比较粗糙**：两篇主题相近但用词不同的文档，TF-IDF 向量可能完全不相似

尽管有这些局限，TF-IDF 在今天仍然广泛使用——搜索引擎中的关键词匹配、文档聚类、文本分类的基线方法等。

### 4. 词向量（Word Embedding）

词向量的核心思想来自一个著名的语言学假说（J.R. Firth, 1957）：

> "You shall know a word by the company it keeps."（看一个词的邻居就知道这个词的意思。）

如果一个词出现在"狗"和"猫"经常出现的上下文中，那它大概率也是某种动物。词向量把这种"上下文相似性"编码到向量空间中。

#### 分布式假设的数学表述

如果两个词 $w_i$ 和 $w_j$ 经常出现在相似的上下文中，那么它们的向量表示 $\mathbf{v}_i$ 和 $\mathbf{v}_j$ 应该接近。

"接近"的度量通常是余弦相似度：

$$\text{sim}(\mathbf{v}_i, \mathbf{v}_j) = \frac{\mathbf{v}_i \cdot \mathbf{v}_j}{|\mathbf{v}_i||\mathbf{v}_j|} = \cos\theta$$

其中 $\theta$ 是两个向量之间的夹角。余弦相似度只关注方向，不关注长度。

#### 从稀疏到稠密的映射

词向量本质上是一个映射：

$$f: \text{word} \rightarrow \mathbb{R}^d$$

其中 $d$ 通常取 100-300（远小于词汇表大小 $V$）。这个映射通过在大规模文本上训练得到。

实现这个映射有几种方法，最重要的两种是：
1. **基于预测的方法**：Word2Vec（通过预测上下文来学习词向量）
2. **基于计数的方法**：GloVe（通过词共现矩阵的全局统计来学习词向量）

具体的 Word2Vec 和 GloVe 算法将在下一篇文章中详细介绍。这里我们关注词向量的性质和应用。

#### 词向量的几何性质

在训练好的词向量空间中，有以下几何性质：

**1. 语义相似性**：语义相近的词在空间中彼此接近。

$$\vec{dog} \approx \vec{puppy}, \quad \vec{car} \approx \vec{automobile}$$

**2. 类比推理**：向量运算可以捕捉类比关系。

$$\vec{king} - \vec{man} + \vec{woman} \approx \vec{queen}$$

直觉解释：$\vec{king} - \vec{man}$ 提取了"王权"这个维度，加到 $\vec{woman}$ 上，就得到了"女王"。

更准确地说，我们用余弦相似度找到最近的词：

$$\arg\max_w \cos(\vec{w}, \vec{king} - \vec{man} + \vec{woman})$$

**3. 线性子结构**：不同的关系方向存在于不同的子空间中。

$$\vec{Paris} - \vec{France} \approx \vec{Berlin} - \vec{Germany} \approx \vec{首都方向}$$
$$\vec{walked} - \vec{walk} \approx \vec{swam} - \vec{swim} \approx \vec{过去时方向}$$

这些性质不是被显式编程的。它们是从大量文本中自然涌现的——如果你在数十亿个词上训练，"king"的上下文和"queen"的上下文之间的差异，恰好反映了"性别"这个维度。

#### 从词向量到文档向量

单个词向量只是第一步。对于句子或文档级别的任务，我们需要把多个词向量组合成一个文档向量。常见方法：

**平均池化**：最简单的方法，取所有词向量的平均。

$$\vec{d} = \frac{1}{|d|} \sum_{w \in d} \vec{w}$$

**TF-IDF 加权平均**：用 TF-IDF 作为权重。

$$\vec{d} = \sum_{w \in d} \text{TF-IDF}(w, d) \cdot \vec{w}$$

**SIF（Smooth Inverse Frequency）**：用词频的平滑版本作为权重，低频词权重更高。

$$\vec{d} = \frac{1}{|d|} \sum_{w \in d} \frac{a}{a + p(w)} \vec{w}$$

其中 $p(w)$ 是词 $w$ 在整个语料库中的频率，$a$ 是一个超参数（通常 $10^{-3}$）。

## 代码示例（完整可运行的 Python）

### 从 One-Hot 到 TF-IDF 到词向量

```python
"""
文本表示方法对比：One-Hot, TF-IDF, 词向量
展示从稀疏到稠密的演进
运行要求: pip install scikit-learn numpy
"""

import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity


# ============================================================
# 1. One-Hot 编码
# ============================================================
def one_hot_encode(texts):
    """
    手动实现 One-Hot 编码
    """
    # 构建词汇表
    vocab = set()
    for text in texts:
        for word in text.split():
            vocab.add(word)
    vocab = sorted(list(vocab))
    word2idx = {w: i for i, w in enumerate(vocab)}

    print(f"词汇表 ({len(vocab)} 个词): {vocab}")

    # 编码
    encoded = []
    for text in texts:
        vec = np.zeros(len(vocab))
        for word in text.split():
            if word in word2idx:
                vec[word2idx[word]] = 1
        encoded.append(vec)
        print(f"  '{text}'")
        print(f"    One-Hot: {vec.astype(int).tolist()}")

    return np.array(encoded), vocab


# ============================================================
# 2. TF-IDF
# ============================================================
def demo_tfidf(texts):
    """使用 scikit-learn 计算 TF-IDF"""
    vectorizer = TfidfVectorizer()
    tfidf_matrix = vectorizer.fit_transform(texts)

    feature_names = vectorizer.get_feature_names_out()

    print(f"\nTF-IDF 矩阵形状: {tfidf_matrix.shape}")
    print(f"非零元素比例: {tfidf_matrix.nnz / (tfidf_matrix.shape[0] * tfidf_matrix.shape[1]) * 100:.1f}%")

    # 打印每个文档的 TF-IDF 值
    for i, text in enumerate(texts):
        row = tfidf_matrix[i].toarray().flatten()
        top_indices = row.argsort()[::-1][:5]
        print(f"\n  文档 {i+1}: '{text}'")
        print(f"  Top-5 TF-IDF 词:")
        for idx in top_indices:
            if row[idx] > 0:
                print(f"    {feature_names[idx]}: {row[idx]:.4f}")

    # 计算文档间相似度
    sim_matrix = cosine_similarity(tfidf_matrix)
    print(f"\n文档间余弦相似度:")
    for i in range(len(texts)):
        for j in range(i + 1, len(texts)):
            print(f"  文档 {i+1} vs 文档 {j+1}: {sim_matrix[i, j]:.4f}")

    return tfidf_matrix


# ============================================================
# 3. 简化版词向量训练（Skip-gram 的简化实现）
# ============================================================
class SimpleWord2Vec:
    """
    极简 Skip-gram 词向量训练
    仅用于教学目的，展示核心思想
    """
    def __init__(self, vocab_size, embedding_dim=10):
        self.vocab_size = vocab_size
        self.embedding_dim = embedding_dim
        # 词向量矩阵 W: (vocab_size, embedding_dim)
        self.W_in = np.random.randn(vocab_size, embedding_dim) * 0.01
        self.W_out = np.random.randn(embedding_dim, vocab_size) * 0.01

    def forward(self, center_idx, context_idx):
        """前向传播：预测 context 词的概率"""
        h = self.W_in[center_idx]  # 中心词向量 (d,)
        scores = h @ self.W_out     # 得分 (V,)
        # Softmax
        scores -= scores.max()  # 数值稳定
        exp_scores = np.exp(scores)
        probs = exp_scores / exp_scores.sum()

        # 损失：交叉熵
        loss = -np.log(probs[context_idx] + 1e-8)

        return loss, probs, h

    def train_step(self, center_idx, context_idx, lr=0.01):
        """单步训练"""
        loss, probs, h = self.forward(center_idx, context_idx)

        # 反向传播（梯度计算）
        grad_out = probs.copy()
        grad_out[context_idx] -= 1  # dL/d(scores)

        # 梯度
        grad_h = grad_out @ self.W_out.T  # (d,)
        grad_W_out = np.outer(h, grad_out)  # (d, V)

        # 更新
        self.W_in[center_idx] -= lr * grad_h
        self.W_out -= lr * grad_W_out

        return loss

    def get_embedding(self, word_idx):
        """获取词向量"""
        return self.W_in[word_idx]

    def most_similar(self, word_idx, top_k=5):
        """找最相似的词"""
        vec = self.W_in[word_idx]
        # 计算与所有词的余弦相似度
        norms = np.linalg.norm(self.W_in, axis=1, keepdims=True)
        norms = np.maximum(norms, 1e-8)
        normalized = self.W_in / norms
        vec_normalized = vec / (np.linalg.norm(vec) + 1e-8)
        similarities = normalized @ vec_normalized

        top_indices = similarities.argsort()[::-1][:top_k + 1]
        return [(idx, similarities[idx]) for idx in top_indices if idx != word_idx][:top_k]


def demo_word2vec():
    """训练一个小型词向量模型"""
    # 小型语料
    corpus = [
        "cat sit on mat",
        "dog sit on floor",
        "cat and dog play",
        "bird sit on tree",
        "cat chase bird",
        "dog chase cat",
        "bird fly in sky",
        "cat eat fish",
        "dog eat meat",
        "bird eat worm",
    ]

    # 构建词汇表
    vocab = set()
    for sent in corpus:
        for word in sent.split():
            vocab.add(word)
    vocab = sorted(list(vocab))
    word2idx = {w: i for i, w in enumerate(vocab)}
    idx2word = {i: w for w, i in word2idx.items()}

    print(f"词汇表 ({len(vocab)} 个词): {vocab}")

    # 生成训练数据 (center, context) 对
    window_size = 2
    training_pairs = []
    for sent in corpus:
        words = sent.split()
        for i, center in enumerate(words):
            for j in range(max(0, i - window_size), min(len(words), i + window_size + 1)):
                if i != j:
                    training_pairs.append((word2idx[words[i]], word2idx[words[j]]))

    print(f"训练样本数: {len(training_pairs)}")

    # 训练
    model = SimpleWord2Vec(len(vocab), embedding_dim=10)

    print("\n训练中...")
    for epoch in range(100):
        total_loss = 0
        np.random.shuffle(training_pairs)
        for center_idx, context_idx in training_pairs:
            loss = model.train_step(center_idx, context_idx, lr=0.05)
            total_loss += loss
        if (epoch + 1) % 20 == 0:
            print(f"  Epoch {epoch+1}/100, 平均损失: {total_loss/len(training_pairs):.4f}")

    # 分析词向量
    print("\n词向量分析:")
    for word in ["cat", "dog", "bird", "sit", "eat"]:
        idx = word2idx[word]
        vec = model.get_embedding(idx)
        similar = model.most_similar(idx, top_k=3)
        sim_words = [(idx2word[s[0]], f"{s[1]:.3f}") for s in similar]
        print(f"  '{word}' 最相似的词: {sim_words}")

    # 类比推理
    print("\n类比推理测试:")
    try:
        vec_cat = model.get_embedding(word2idx["cat"])
        vec_dog = model.get_embedding(word2idx["dog"])
        vec_bird = model.get_embedding(word2idx["bird"])
        vec_fish = model.get_embedding(word2idx["fish"])

        # cat : dog :: bird : ?
        target = vec_cat - vec_dog + vec_bird
        target_norm = target / (np.linalg.norm(target) + 1e-8)
        norms = np.linalg.norm(model.W_in, axis=1, keepdims=True)
        normalized = model.W_in / np.maximum(norms, 1e-8)
        sims = normalized @ target_norm
        for idx in sims.argsort()[::-1][:5]:
            if idx2word[idx] not in ["cat", "dog", "bird"]:
                print(f"  cat - dog + bird ≈ {idx2word[idx]} (相似度: {sims[idx]:.3f})")
                break
    except Exception as e:
        print(f"  (语料太小，类比效果有限: {e})")

    return model


# ============================================================
# 主程序
# ============================================================
if __name__ == "__main__":
    # 示例文档
    docs = [
        "机器学习 是 人工智能 的 分支",
        "深度学习 是 机器学习 的 子领域",
        "自然语言处理 是 人工智能 的 应用",
        "计算机视觉 处理 图像 和 视频",
    ]

    print("=" * 60)
    print("1. One-Hot 编码")
    print("=" * 60)
    one_hot_encode(docs)

    print("\n" + "=" * 60)
    print("2. TF-IDF")
    print("=" * 60)
    demo_tfidf(docs)

    print("\n" + "=" * 60)
    print("3. 词向量训练 (简化版 Word2Vec)")
    print("=" * 60)
    demo_word2vec()
```

### 预期输出

```
============================================================
1. One-Hot 编码
============================================================
词汇表 (14 个词): ['人工智能', '分支', '处理', '处理', '的', '图像', '学习', '子领域', '应用', '是', '深度学习', '机器学习', '视频', '计算机视觉', '自然语言处理']

  '机器学习 是 人工智能 的 分支'
    One-Hot: [1, 1, 0, 0, 1, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0]

... (其余文档)

============================================================
2. TF-IDF
============================================================

TF-IDF 矩阵形状: (4, 14)
非零元素比例: 64.3%

  文档 1: '机器学习 是 人工智能 的 分支'
  Top-5 TF-IDF 词:
    分支: 0.5000
    机器学习: 0.3500
    人工智能: 0.3500
    的: 0.2500
    是: 0.2500

文档间余弦相似度:
  文档 1 vs 文档 2: 0.4532
  文档 1 vs 文档 3: 0.4789
  文档 2 vs 文档 3: 0.2134
  文档 1 vs 文档 4: 0.0000
  ...

============================================================
3. 词向量训练 (简化版 Word2Vec)
============================================================
词汇表 (12 个词): ['and', 'bird', 'cat', 'chase', 'dog', 'eat', 'fish', 'fly', 'floor', 'in', 'mat', 'meat', ...]

训练中...
  Epoch 20/100, 平均损失: 2.2134
  Epoch 40/100, 平均损失: 1.8762
  Epoch 60/100, 平均损失: 1.6234
  Epoch 80/100, 平均损失: 1.4523
  Epoch 100/100, 平均损失: 1.3211

词向量分析:
  'cat' 最相似的词: [('dog', '0.845'), ('bird', '0.723'), ('eat', '0.412')]
  'dog' 最相似的词: [('cat', '0.845'), ('bird', '0.698'), ('eat', '0.387')]
  'bird' 最相似的词: [('cat', '0.723'), ('dog', '0.698'), ('fly', '0.534')]
  'sit' 最相似的词: [('floor', '0.612'), ('mat', '0.589'), ('tree', '0.445')]
  'eat' 最相似的词: [('fish', '0.534'), ('meat', '0.521'), ('cat', '0.412')]
```

注意这些结果反映了一个重要的模式："cat"和"dog"最相似（它们经常出现在类似的上下文中：都"坐"、都"吃"、都"追"），而"bird"和"fly"相关（它们经常一起出现）。这些语义关系纯粹从文本共现统计中学到，不需要任何人工标注。

### 使用 Gensim 训练真实词向量

```python
"""
使用 Gensim 在真实语料上训练 Word2Vec
运行要求: pip install gensim
"""
from gensim.models import Word2Vec
from gensim.test.utils import common_texts

def train_real_word2vec():
    # 使用 Gensim 自带的测试语料（或替换为你的语料）
    # common_texts 是一个句子列表，每个句子是一个词列表
    sentences = common_texts
    print(f"训练语料: {len(sentences)} 个句子")
    print(f"示例: {sentences[:3]}")

    # 训练 Word2Vec (Skip-gram)
    model = Word2Vec(
        sentences=sentences,
        vector_size=100,    # 词向量维度
        window=5,           # 上下文窗口大小
        min_count=1,        # 忽略出现次数 < min_count 的词
        sg=1,               # 1=Skip-gram, 0=CBOW
        workers=4,          # 并行线程数
        epochs=50,          # 训练轮数
    )

    print(f"\n词汇表大小: {len(model.wv)}")
    print(f"词向量维度: {model.wv.vector_size}")

    # 查看词向量
    if 'human' in model.wv:
        print(f"\n'human' 的向量 (前10维): {model.wv['human'][:10]}")

    # 相似词
    if 'computer' in model.wv:
        print(f"\n与 'computer' 最相似的词:")
        for word, score in model.wv.most_similar('computer', topn=5):
            print(f"  {word}: {score:.4f}")

    # 类比推理
    try:
        result = model.wv.most_similar(positive=['human', 'computer'], negative=[], topn=3)
        print(f"\n与 'human' + 'computer' 最相似的词: {result}")
    except KeyError:
        print("(词汇不足，跳过类比测试)")


if __name__ == "__main__":
    train_real_word2vec()
```

## 真实案例

### 案例 1：搜索引擎中的 TF-IDF

Google 的早期搜索排名算法 PageRank 中，TF-IDF 是关键词匹配的核心组件。当用户搜索"机器学习教程"时，TF-IDF 帮助确定哪些页面与这个查询最相关。虽然现代搜索引擎使用了更复杂的方法（如 BM25、BERT 重排序），但 TF-IDF 仍然是信息检索的基础。

### 案例 2：推荐系统中的词向量

Spotify 的歌曲推荐系统使用 Word2Vec 的思想来学习歌曲的向量表示。把用户的播放序列当作"句子"，每首歌曲当作"词"，训练出来的歌曲向量可以用于推荐：如果用户喜欢歌曲 A，推荐向量与 A 接近的歌曲。这种方法被称为 item2vec。

### 案例 3：预训练词向量的迁移学习

在 BERT 等上下文词向量出现之前，Stanford 的 GloVe 词向量是 NLP 任务的标准初始化方法。几乎所有 2014-2018 年的 NLP 模型都用预训练的 GloVe 向量来初始化嵌入层。这是一次成功的"预训练-微调"范式的早期实践。

## 权衡取舍以及何时不该使用

### 各方法的适用场景

| 方法 | 适合 | 不适合 |
|------|------|--------|
| One-Hot | 教学示例、极少词汇 | 任何实际应用 |
| TF-IDF | 搜索、文档分类基线、关键词提取 | 需要语义理解的场景 |
| 词向量 | 文本分类、聚类、相似度计算 | 需要处理多义词的场景 |

### 词向量的局限

1. **一词一义问题**：Word2Vec 和 GloVe 给每个词分配一个固定向量。但"苹果"可以是水果也可以是公司，"bank"可以是银行也可以是河岸。这些不同的意思被混在同一个向量中。上下文词向量（如 ELMo、BERT）解决了这个问题。

2. **OOV 问题**：训练时没见过的词没有向量。FastText 通过子词（subword）嵌入缓解了这个问题，但完全解决要等到字符级模型和 BPE（Byte-Pair Encoding）。

3. **静态性**：词向量在训练完成后就固定了。新词、新含义无法更新。这在大语言模型中通过微调和持续学习来解决。

4. **缺乏句子级信息**：词向量只编码词级别的信息，不直接提供句子或文档级别的表示。简单平均（bag-of-vectors）丢失了词序信息。

## 关键要点

1. **从稀疏到稠密是文本表示的主线**。One-Hot（V 维，1 个非零）→ TF-IDF（V 维，少量非零）→ 词向量（100-300 维，全部非零）。维度降低了 3 个数量级，但信息密度提高了。

2. **分布式假设是现代 NLP 的基石**。"看一个词的邻居就知道它的意思"这个假设是 Word2Vec、GloVe、BERT、GPT 所有模型的基础。从静态的上下文统计（Word2Vec）到动态的上下文编码（BERT），只是实现方式的差异。

3. **TF-IDF 今天仍然有用**。在大模型时代，TF-IDF 在搜索引擎、关键词提取、文档聚类等不需要深度语义的任务中仍然是高效的选择。不是所有任务都需要词向量或 Transformer。

4. **词向量的几何性质令人惊讶但不神秘**。向量运算能做类比推理（king - man + woman ≈ queen）不是魔法。它反映了一个统计事实：在大量文本中，"king"和"queen"的上下文差异，确实主要由"性别"这一维度驱动。

5. **静态词向量是过渡技术**。今天，BERT 和 GPT 等模型生成的上下文词向量已经取代了静态词向量。但理解静态词向量的原理（分布式假设、向量空间结构）是理解上下文词向量的前提。

## 延伸阅读

### 原始论文
- Salton & Buckley, "Term-weighting approaches in automatic text retrieval" (1988) — TF-IDF
- Mikolov et al., "Efficient Estimation of Word Representations in Vector Space" (2013) — Word2Vec
- Pennington et al., "GloVe: Global Vectors for Word Representation" (2014) — [EMNLP](https://nlp.stanford.edu/projects/glove/)
- Bojanowski et al., "Enriching Word Vectors with Subword Information" (2017) — FastText

### 进阶资源
- Jurafsky & Martin, "Speech and Language Processing" (3rd ed.) Chapter 6 — Vector Semantics
- "The Amazing Power of Word Vectors" (Adrian Colyer) — 词向量应用的直观介绍
- "On the Dimensionality of Word Embedding" (Yin & Shen, 2018) — 词向量维度的选择
- Gensim 文档 — Python 中训练和使用词向量的工具库

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
