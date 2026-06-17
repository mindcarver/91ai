<!--
调研来源：
1. Kaplan et al., "Scaling Laws for Neural Language Models" (2020) — OpenAI 的原始 Scaling Law 论文
2. Hoffmann et al., "Training Compute-Optimal Large Language Models" (2022) — Chinchilla 论文
3. Fedus et al., "A Review of Sparse Expert Models in Deep Learning" (2022) — MoE 综述
4. Lepikhin et al., "GShard: Scaling Giant Models with Conditional Computation" (2021) — MoE 实践
5. Zhai et al., "Scaling Vision Transformers" (2022) — ViT 的缩放定律
6. Caballero et al., "Broken Neural Scaling Laws" (2023) — 缩放定律的修正

核心发现：Scaling Law 描述了模型性能如何随参数量 N、数据量 D 和计算量 C 的增加而提升。OpenAI 的原始发现是 L(N) ∝ N^{-0.076}（损失随参数量幂律下降）。Chinchilla 的修正发现是最优缩放应该是 N 和 D 同时增加，比例约为 1:20（每个参数需要约 20 个 token），这意味着许多大模型（如 GPT-3 175B）实际上训练不足。MoE（Mixture of Experts）通过条件计算实现了"参数量大但计算量小"的效果，是突破计算瓶颈的关键技术。Scaling Law 的实际意义在于：给定固定的计算预算，它可以告诉你最优的模型大小和数据量。
-->

# 大模型的缩放定律：Scaling Law、Chinchilla、MoE，为什么模型越大越好

**TL;DR：** Scaling Law 描述了语言模型损失如何随参数量（N）、数据量（D）和计算量（C）的幂律关系变化。OpenAI 在 2020 年发现 $L(N) \propto N^{-0.076}$——参数量每增加 10 倍，损失下降约 15%。但 Chinchilla 在 2022 年修正了这个结论：最优缩放是 N 和 D 同时增加，每个参数需要约 20 个 token，这意味着 GPT-3 175B 实际上训练不足。MoE（Mixture of Experts）通过条件计算让模型有更多参数但不增加每次推理的计算量。Scaling Law 的核心洞察是：在当前技术路线下，模型越大、数据越多，效果越好，而且这个趋势还没有饱和的迹象。

## 为什么这很重要

Scaling Law 不是一个理论发现，而是一个**工程指南**。它回答了一个极其实际的问题：**我有 1000 万美元的 GPU 预算，应该训练多大的模型、用多少数据？**

在 Scaling Law 之前，这个问题只能通过试错来回答。很多团队把大部分预算花在了训练更大的模型上，但数据量没有同步增加。Chinchilla 证明这种做法是低效的——一个用更多数据训练的较小模型（70B），可以超越用较少数据训练的大模型（175B）。

这个发现直接影响了 LLaMA 的设计决策：Meta 用了 1.4T tokens 训练 65B 的模型（每个参数约 20 个 token），而不是用更少的数据训练一个更大的模型。结果 LLaMA-65B 在很多任务上超越了 GPT-3 175B——参数量只有后者的 1/3。

Scaling Law 还告诉我们一件重要的事：**在当前的技术路线下，性能提升还没有遇到天花板。** 模型越大、数据越多，效果越好。这是一个经验事实，不需要新的理论突破——只需要更多的计算和数据。

## 核心概念

### 幂律关系（Power Law）

Scaling Law 的核心是幂律关系：

$$L(x) = \left(\frac{x_c}{x}\right)^{\alpha} + L_{\infty}$$

其中：
- $L(x)$ 是损失
- $x$ 是某个缩放变量（N、D 或 C）
- $x_c$ 是一个常数
- $\alpha$ 是缩放指数（决定"多快变好"）
- $L_{\infty}$ 是不可约损失（理论下限）

幂律关系在对数坐标系中是一条直线：

$$\log(L(x) - L_{\infty}) = -\alpha \log(x) + \text{const}$$

这意味着损失随缩放变量的增加而可预测地下降。更重要的是，这种可预测性允许你**从小模型的实验结果外推到大模型的性能**。

### 三个缩放变量

| 变量 | 符号 | 含义 | 缩放关系 |
|------|------|------|---------|
| 参数量 | $N$ | 模型的可训练参数数量 | $L(N) \propto N^{-0.076}$ |
| 数据量 | $D$ | 训练 token 数量 | $L(D) \propto D^{-0.095}$ |
| 计算量 | $C$ | 总 FLOPs（= 6ND 近似） | $L(C) \propto C^{-0.050}$ |

这些指数看起来很小，但它们在对数空间中是有意义的：
- 参数量从 1B 增加到 100B（100 倍）：损失下降 $100^{0.076} \approx 1.42$ 倍
- 这在交叉熵损失上可能只是从 3.0 降到 2.1，但在实际任务中意味着质的差异

## 工作原理（简化的心智模型）

### 给 12 岁孩子的解释

**Scaling Law** 就像研究"练习时间和考试成绩的关系"。你发现了一个规律：练习时间每增加 10 倍，错误率下降约 15%。

这个规律告诉你：
- 从 10 小时增加到 100 小时，效果提升很大
- 从 1000 小时增加到 10000 小时，效果提升有但变小了（递减但不停滞）
- 这个规律让你可以预测："如果我练习 5000 小时，错误率大概是多少"

**Chinchilla 的修正**：原来的研究说"练习越久越好"。Chinchilla 发现，重要的是"练习题的数量"要和"你的脑容量"匹配。如果你的脑容量很大（大模型）但练习题太少（数据不足），你的潜力没有被发挥。最优的配比是：每个脑细胞需要做约 20 道练习题。

**MoE** 就像一个公司有很多专家（参数多），但每次只咨询最相关的几位专家（计算量少）。公司有 100 个专家，但每次只需要咨询 2 个——参数量大，但计算量不大。

## 工作原理（详细机制）

### 1. OpenAI 的原始 Scaling Law（2020）

Kaplan 等人在从 768 到 1.5B 参数的模型上做实验，发现了以下幂律关系：

**参数量缩放**（当数据充足时）：

$$L(N) = \left(\frac{N_c}{N}\right)^{\alpha_N}, \quad \alpha_N \approx 0.076, \quad N_c \approx 8.8 \times 10^{13}$$

**数据量缩放**（当模型足够大时）：

$$L(D) = \left(\frac{D_c}{D}\right)^{\alpha_D}, \quad \alpha_D \approx 0.095, \quad D_c \approx 5.4 \times 10^{13}$$

**计算量缩放**：

$$L(C) = \left(\frac{C_c}{C}\right)^{\alpha_C}, \quad \alpha_C \approx 0.050, \quad C_c \approx 1.6 \times 10^{10}$$

#### 关键发现 1：平滑的幂律

损失随 N、D、C 的变化是平滑的幂律关系。没有"突然变好"或"饱和"的迹象（至少在他们实验的范围内）。

#### 关键发现 2：计算量的最优分配

给定固定计算量 $C$，存在最优的模型大小 $N^*$ 和数据量 $D^*$：

$$N^* \propto C^{0.73}, \quad D^* \propto C^{0.27}$$

这意味着：当计算量增加时，应该把大部分增加的预算投入到更大的模型上（0.73），较少投入到更多数据上（0.27）。

**但 Chinchilla 修正了这个结论。**

#### 关键发现 3：过拟合的边界

当 $N$ 和 $D$ 不匹配时，会出现过拟合。经验法则：

$$D \geq 10 \times N$$

即数据量至少应该是参数量的 10 倍，才能避免严重过拟合。

### 2. Chinchilla：计算最优的缩放（2022）

DeepMind 的 Hoffmann 等人重新审视了 Scaling Law，发现了一个重要问题：**OpenAI 的原始实验没有在所有模型大小上训练到收敛。**

当他们确保所有模型都训练到收敛时，得到了不同的最优分配：

$$N^* \propto C^{0.50}, \quad D^* \propto C^{0.50}$$

计算量增加时，模型大小和数据量应该**等比例增加**。

具体数值：每个参数约需要 20 个 token。

$$D^* \approx 20 \times N^*$$

#### Chinchilla 的实验验证

DeepMind 训练了一系列模型，从 70M 到 16B 参数，都在约 300B tokens 上训练。然后训练了一个 70B 的 Chinchilla 模型，在 1.4T tokens 上训练。

结果：Chinchilla 70B 在几乎所有任务上超越了 GPT-3 175B（参数量只有 40%）。

| 模型 | 参数量 | 训练 Tokens | Tokens/参数 | 性能 |
|------|--------|-------------|-------------|------|
| GPT-3 175B | 175B | 300B | 1.7 | 基准 |
| Chinchilla 70B | 70B | 1.4T | 20 | 更好 |

GPT-3 每个参数只有 1.7 个 token——严重训练不足。Chinchilla 每个参数有 20 个 token——接近最优。

#### Chinchilla 对行业的影响

Chinchilla 的发现直接导致了以下变化：
- **LLaMA 系列**：严格遵循 20 tokens/参数 的配比。LLaMA-65B 用了 1.4T tokens
- **GPT-4**：据推测也大幅增加了训练数据量
- **Mistral 7B**：用大量数据训练小模型，效果出奇地好

### 3. MoE（Mixture of Experts）：参数多但计算少

MoE 的核心思想：**不是所有参数都在每次推理中被使用。**

#### 基本结构

在 MoE 的 Transformer 中，FFN 层被替换为多个"专家"FFN。每次推理时，一个路由（router）决定每个 token 由哪个专家处理：

```
标准 Transformer FFN:
  输入 x → FFN(x) → 输出
  所有参数每次都参与计算

MoE Transformer FFN:
  输入 x → Router(x) → 选择 Top-K 个专家
          → Expert_1(x), Expert_3(x), Expert_7(x)
          → 加权求和 → 输出
  只有 K 个专家的参数参与计算（K << 总专家数）
```

#### 路由机制

路由器是一个简单的线性层 + Softmax：

$$\text{router}(x) = \text{softmax}(W_r x)$$

$$\text{selected experts} = \text{Top-K}(\text{router}(x))$$

通常 $K = 1$ 或 $K = 2$。如果有 $E = 8$ 个专家，每次只有 2 个被激活——计算量是标准 FFN 的 2/8 = 25%。

#### MoE 的数学分析

对于一个 $E$ 个专家、Top-$K$ 路由的 MoE 层：

- **参数量**：$E \times d_{model} \times d_{ff}$（所有专家的参数总和）
- **每次推理的计算量**：$K \times d_{model} \times d_{ff}$（只有 K 个专家参与）
- **计算效率比**：$K / E$

例如，Switch Transformer 的配置：$E = 128, K = 1$，计算效率比 = $1/128 = 0.8\%$。参数量是标准模型的 128 倍，但计算量几乎不变。

#### 负载均衡问题

MoE 的一个实际问题：路由器可能把大部分 token 都分配给少数几个专家，导致其他专家闲置。

解决方案：**辅助损失（Auxiliary Loss）**：

$$\mathcal{L}_{aux} = \alpha \cdot \sum_{i=1}^{E} f_i \cdot P_i$$

其中 $f_i$ 是分配给专家 $i$ 的 token 比例，$P_i$ 是路由器分配给专家 $i$ 的平均概率。这个损失鼓励负载均匀分布。

#### 知名 MoE 模型

| 模型 | 总参数 | 活跃参数 | 专家数 | Top-K |
|------|--------|---------|--------|-------|
| GShard | 600B | ~10B | 2048 | 2 |
| Switch-C | 1.6T | ~10B | 2048 | 1 |
| Mixtral 8×7B | 46.7B | 12.9B | 8 | 2 |
| DeepSeek-V2 | 236B | 21B | 160 | 6 |

Mixtral 8×7B 是最成功的开源 MoE 模型之一。它有 8 个专家，每次选择 2 个。总参数 46.7B，但每次推理只使用约 12.9B 参数。它的性能接近 LLaMA-70B，但推理速度快约 3 倍。

### 4. Scaling Law 的局限和修正

#### 饱和问题

幂律关系不会永远成立。当 $L \to L_{\infty}$ 时，增长会放缓。Caballero et al. (2023) 提出"Broken Neural Scaling Laws"，用分段幂律来描述这种饱和：

$$L(x) = \sum_{i} a_i \left(\frac{x}{x_i}\right)^{b_i}$$

实际上，目前的语言模型损失还没有到达明显的饱和点。GPT-4 的训练损失仍然遵循幂律趋势。但数据质量可能成为比数量更重要的瓶颈。

#### 数据墙问题

高质量文本数据的总量是有限的。估计互联网上的高质量英文文本约 10T tokens。如果训练一个 10T 参数的 Chinchilla 最优模型，需要约 200T tokens——远超可用数据。

解决方案：
- **多语言数据**：扩展到非英文文本
- **合成数据**：用强模型生成训练数据（但存在"模型坍缩"风险）
- **数据质量**：用更少但更高质量的数据（如 Phi 系列模型）
- **课程学习**：按难度排序训练数据

#### Emergent Abilities（涌现能力）

Wei et al. (2022) 观察到某些能力在模型达到一定规模前几乎为零，然后突然出现：

- **少样本学习**：在 ~10B 参数时开始有效
- **链式思维推理**：在 ~100B 参数时开始出现
- **低资源语言理解**：在更大规模时出现

这些"涌现"是否是真实的认知能力，还是评估指标的伪影（如非线性指标的阈值效应），目前仍有争议。但无论如何，大模型能做到小模型做不到的事，这是一个事实。

## 代码示例（完整可运行的 Python）

### Scaling Law 拟合和 MoE 实现

```python
"""
Scaling Law 拟合 + MoE 实现演示
运行要求: pip install torch numpy matplotlib
"""

import torch
import torch.nn as nn
import torch.nn.functional as F
import numpy as np


# ============================================================
# 1. Scaling Law 拟合
# ============================================================
class ScalingLaw:
    """Scaling Law 拟合器"""
    def __init__(self):
        self.alpha = None
        self.x_c = None
        self.L_inf = None

    def fit(self, x_data, loss_data, L_inf=1.0):
        """用最小二乘法拟合幂律关系"""
        x = np.array(x_data)
        y = np.maximum(np.array(loss_data) - L_inf, 1e-10)

        # 对数空间的线性回归: log(y) = -alpha * log(x) + const
        log_x = np.log(x)
        log_y = np.log(y)

        # 最小二乘
        A = np.vstack([log_x, np.ones(len(log_x))]).T
        slope, intercept = np.linalg.lstsq(A, log_y, rcond=None)[0]

        self.alpha = -slope
        self.L_inf = L_inf
        self.x_c = np.exp(intercept) ** (1 / self.alpha)

        return self

    def predict(self, x):
        """预测给定 x 的损失"""
        return self.L_inf + self.x_c / (np.array(x) ** self.alpha)

    def __repr__(self):
        return (f"ScalingLaw(alpha={self.alpha:.4f}, "
                f"x_c={self.x_c:.2e}, L_inf={self.L_inf:.4f})")


def chinchilla_optimal(compute_budget_flops):
    """
    根据 Chinchilla Scaling Law 计算最优模型大小和数据量
    N* ∝ C^0.5, D* ∝ C^0.5, D* ≈ 20 * N*
    """
    # 近似: C ≈ 6 * N * D (训练一个 token 的计算量约为 6N)
    # 最优: D = 20N, C = 6 * N * 20N = 120 * N^2
    N_star = (compute_budget_flops / 120) ** 0.5
    D_star = 20 * N_star
    return N_star, D_star


# ============================================================
# 2. MoE (Mixture of Experts) 实现
# ============================================================
class Expert(nn.Module):
    """单个专家 FFN"""
    def __init__(self, d_model, d_ff):
        super().__init__()
        self.w1 = nn.Linear(d_model, d_ff)
        self.w2 = nn.Linear(d_ff, d_model)

    def forward(self, x):
        return self.w2(F.relu(self.w1(x)))


class MoELayer(nn.Module):
    """MoE 层：多个专家 + Top-K 路由"""
    def __init__(self, d_model, d_ff, num_experts=8, top_k=2):
        super().__init__()
        self.num_experts = num_experts
        self.top_k = top_k

        self.experts = nn.ModuleList([
            Expert(d_model, d_ff) for _ in range(num_experts)
        ])
        self.router = nn.Linear(d_model, num_experts)

    def forward(self, x):
        batch_size, seq_len, d_model = x.shape
        x_flat = x.view(-1, d_model)  # (B*T, D)

        # 路由分数
        router_logits = self.router(x_flat)  # (B*T, E)
        router_probs = F.softmax(router_logits, dim=-1)

        # Top-K 选择
        top_k_probs, top_k_indices = router_probs.topk(self.top_k, dim=-1)
        top_k_probs = top_k_probs / top_k_probs.sum(dim=-1, keepdim=True)  # 归一化

        # 计算专家输出
        output = torch.zeros_like(x_flat)

        for i in range(self.top_k):
            for b in range(x_flat.size(0)):
                expert_idx = top_k_indices[b, i].item()
                expert_output = self.experts[expert_idx](x_flat[b:b+1])
                output[b] += top_k_probs[b, i] * expert_output.squeeze(0)

        # 辅助损失（负载均衡）
        if self.training:
            # 每个专家被选中的频率
            expert_counts = torch.zeros(self.num_experts, device=x.device)
            for idx in top_k_indices.flatten():
                expert_counts[idx] += 1
            expert_freq = expert_counts / expert_counts.sum()

            # 路由器给每个专家的平均概率
            router_avg = router_probs.mean(dim=0)

            aux_loss = (expert_freq * router_avg).sum() * self.num_experts
        else:
            aux_loss = 0

        return output.view(batch_size, seq_len, d_model), aux_loss


class MoEEfficient(nn.Module):
    """高效的 MoE 实现（向量化）"""
    def __init__(self, d_model, d_ff, num_experts=8, top_k=2):
        super().__init__()
        self.num_experts = num_experts
        self.top_k = top_k

        # 所有专家参数合并为大矩阵（更高效）
        self.w1 = nn.Parameter(torch.randn(num_experts, d_model, d_ff) * 0.01)
        self.w2 = nn.Parameter(torch.randn(num_experts, d_ff, d_model) * 0.01)
        self.router = nn.Linear(d_model, num_experts)

    def forward(self, x):
        B, T, D = x.shape
        x_flat = x.view(-1, D)  # (N, D), N = B*T

        # 路由
        router_logits = self.router(x_flat)
        top_k_probs, top_k_indices = router_logits.topk(self.top_k, dim=-1)
        top_k_probs = F.softmax(top_k_probs, dim=-1)

        # 计算输出
        output = torch.zeros_like(x_flat)
        for k in range(self.top_k):
            for e in range(self.num_experts):
                mask = (top_k_indices[:, k] == e)
                if mask.any():
                    expert_input = x_flat[mask]
                    # 批量矩阵乘法
                    h = F.relu(expert_input @ self.w1[e])
                    expert_output = h @ self.w2[e]
                    output[mask] += top_k_probs[mask, k].unsqueeze(-1) * expert_output

        return output.view(B, T, D)


# ============================================================
# 验证代码
# ============================================================
if __name__ == "__main__":
    np.random.seed(42)
    torch.manual_seed(42)

    print("=" * 60)
    print("Scaling Law 拟合")
    print("=" * 60)

    # 模拟不同模型大小的实验结果
    model_sizes = np.array([10e6, 50e6, 100e6, 500e6, 1e9, 5e9, 10e9])
    # 模拟损失（带一些噪声）
    true_alpha = 0.076
    losses = 1.8 + 5.0 / (model_sizes ** true_alpha) + np.random.randn(len(model_sizes)) * 0.01

    # 拟合 Scaling Law
    law = ScalingLaw().fit(model_sizes, losses, L_inf=1.8)
    print(f"\n拟合结果: {law}")

    # 预测更大模型的性能
    predict_sizes = [50e9, 100e9, 175e9, 500e9, 1e12]
    print(f"\n性能预测:")
    print(f"  {'参数量':>15} {'预测损失':>12} {'相对提升':>12}")
    ref_loss = law.predict([10e9])[0]
    for size in predict_sizes:
        pred = law.predict([size])[0]
        improvement = (ref_loss - pred) / ref_loss * 100
        print(f"  {size/1e9:>12.0f}B {pred:>12.4f} {improvement:>11.1f}%")

    # Chinchilla 最优分配
    print(f"\n" + "=" * 60)
    print("Chinchilla 最优分配")
    print("=" * 60)

    budgets = [
        ("1 GPU-month (A100)", 1e21),
        ("10 GPU-months", 1e22),
        ("100 GPU-months", 1e23),
        ("1 GPU-year", 1e22 * 12),
        ("GPT-3 级别", 3.1e23),
        ("GPT-4 级别 (估计)", 2e25),
    ]

    print(f"\n  {'预算':>25} {'最优模型':>15} {'最优数据':>15} {'Tokens/参数':>15}")
    for name, budget in budgets:
        N, D = chinchilla_optimal(budget)
        print(f"  {name:>25} {N/1e9:>12.1f}B {D/1e9:>12.1f}B {D/N:>15.1f}")

    # MoE 测试
    print(f"\n" + "=" * 60)
    print("MoE (Mixture of Experts) 测试")
    print("=" * 60)

    d_model = 64
    d_ff = 256
    num_experts = 8

    # 标准 FFN
    standard_ffn = nn.Sequential(
        nn.Linear(d_model, d_ff),
        nn.ReLU(),
        nn.Linear(d_ff, d_model),
    )

    # MoE FFN
    moe = MoELayer(d_model, d_ff, num_experts=num_experts, top_k=2)

    # 参数量对比
    standard_params = sum(p.numel() for p in standard_ffn.parameters())
    moe_params = sum(p.numel() for p in moe.parameters())
    moe_active = standard_params * 2  # Top-2: 每次 2 个专家参与

    print(f"\n参数量对比:")
    print(f"  标准 FFN: {standard_params:,}")
    print(f"  MoE (8 专家): {moe_params:,} ({moe_params/standard_params:.1f}x)")
    print(f"  MoE 活跃参数 (Top-2): {moe_active:,} ({moe_active/standard_params:.1f}x)")

    # 前向传播测试
    x = torch.randn(2, 10, d_model)

    std_out = standard_ffn(x)
    moe_out, aux_loss = moe(x)

    print(f"\n前向传播:")
    print(f"  输入: {list(x.shape)}")
    print(f"  标准 FFN 输出: {list(std_out.shape)}")
    print(f"  MoE 输出: {list(moe_out.shape)}")
    print(f"  MoE 辅助损失: {aux_loss:.4f}")

    # 不同 MoE 配置的对比
    print(f"\nMoE 配置对比 (d_model=4096, d_ff=16384):")
    print(f"  {'专家数':>8} {'总参数':>15} {'Top-1 活跃':>15} {'Top-2 活跃':>15} {'Top-1 效率':>12}")

    d, d_ff_large = 4096, 16384
    base_ffn_params = d * d_ff_large * 2
    for E in [4, 8, 16, 32, 64, 128]:
        total = base_ffn_params * E + d * E  # 专家参数 + 路由参数
        top1_active = base_ffn_params + d * E  # 1 个专家 + 路由
        top2_active = base_ffn_params * 2 + d * E  # 2 个专家 + 路由
        efficiency = top1_active / total * 100
        print(f"  {E:>8} {total/1e6:>12.0f}M {top1_active/1e6:>12.0f}M "
              f"{top2_active/1e6:>12.0f}M {efficiency:>11.1f}%")

    # Scaling Law 实用计算器
    print(f"\n" + "=" * 60)
    print("Scaling Law 实用计算器")
    print("=" * 60)

    # 给定模型大小，计算需要的最优数据量
    print(f"\n给定模型大小，Chinchilla 最优数据量:")
    for N_b in [7, 13, 30, 65, 175]:
        D_optimal = 20 * N_b * 1e9  # tokens
        C_total = 6 * N_b * 1e9 * D_optimal  # FLOPs
        gpu_hours = C_total / (312e12 * 3600)  # A100 = 312 TFLOPs
        print(f"  {N_b:>4}B 参数 → {D_optimal/1e12:.1f}T tokens, "
              f"~{C_total/1e23:.1f} × 10^23 FLOPs, "
              f"~{gpu_hours/1000:.0f}k A100-hours")

    # GPT 系列的缩放轨迹
    print(f"\nGPT 系列缩放轨迹:")
    models = [
        ("GPT-1", 0.117, 5, "~5GB"),
        ("GPT-2", 1.5, 40, "~40GB"),
        ("GPT-3", 175, 300, "~570GB"),
        ("GPT-4 (估计)", 1800, 13000, "~13TB"),
    ]
    for name, n_b, d_b, raw in models:
        ratio = d_b / n_b
        optimal = "✓ 接近最优" if 15 < ratio < 30 else "✗ 训练不足" if ratio < 10 else "偏多"
        print(f"  {name:>15}: {n_b:>7.1f}B 参数, {d_b:>6.0f}B tokens, "
              f"tokens/param={ratio:.1f}, {optimal}")

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
