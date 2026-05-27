<!--
调研来源：
1. GeeksforGeeks "Tanh vs. Sigmoid vs. ReLU" — 三种经典激活函数的系统对比
2. IEEE "A Comparative Analysis of the Most Commonly Used Activation Functions" (2023) — 激活函数的学术比较分析
3. Salt Data Labs "Transformer Activation Functions Explainer" — GELU 在 Transformer 中的使用原因
4. Prodia Blog "Compare 4 Key Differences: GELU vs ReLU" — GELU 相对 ReLU 的优势分析
5. SuperAnnotate "Activation functions in neural networks [Updated 2024]" — 激活函数的全面综述

核心发现：
- ReLU 是现代深度学习的默认选择，因为正区间导数为 1（解决梯度消失），计算高效，经验效果好
- ReLU 的主要问题是 Dying ReLU（负区间永远输出 0），Leaky ReLU 和 ELU 是解决方案
- GELU 成为 Transformer 的标配（BERT、GPT），因为它在 0 附近有平滑的过渡，不是硬截断
- Sigmoid 几乎不再用于隐藏层（梯度消失严重），但仍用于输出层的二分类
- 没有全局最优的激活函数，选择取决于模型架构和任务
-->

# 激活函数：ReLU、Sigmoid、Tanh、GELU 的选择，以及为什么不用线性激活

**TL;DR：** 激活函数是神经网络的"非线性来源"——没有它，多层网络退化成线性变换。Sigmoid 曾经是默认选择，但梯度消失问题（导数最大才 0.25）让它几乎退出隐藏层舞台。ReLU 凭借正区间导数恒为 1（梯度不消失）和计算简单（就是 max(0, x)）成为现代深度学习的标配。GELU 是 Transformer 时代的明星，在 0 附近平滑过渡而不是硬截断，被 BERT、GPT 等模型采用。实用原则：隐藏层默认用 ReLU，Transformer 用 GELU，输出层根据任务选择（Sigmoid 用于二分类，Softmax 用于多分类）。

## 为什么这很重要

上一篇我们讨论了反向传播。反向传播要正常工作，需要梯度在网络中顺畅地流动。而激活函数的导数决定了梯度在通过每一层时被"放大"还是"缩小"。

如果激活函数的导数最大只有 0.25（Sigmoid），经过 10 层后梯度被乘以 $0.25^{10} \approx 10^{-6}$——第一层的参数几乎不会更新。这不是一个理论问题，而是 2000-2010 年代深度学习发展缓慢的主要原因之一。

2010 年代，ReLU 的广泛采用直接导致了深度学习的突破。这个改变极其简单——把 Sigmoid 换成 $\max(0, x)$——但它解决了梯度消失问题，让训练几十层甚至上百层的网络成为可能。

然后 GELU 的出现又带来了改进：它在负值区域不是硬截断到 0，而是平滑过渡。这使得 GELU 在 Transformer 架构中表现优于 ReLU，成为 BERT、GPT 等模型的标准选择。

理解不同激活函数的特性，能帮你做出正确的架构选择，避免训练不稳定的问题。

## 核心概念

### 为什么需要激活函数

上一篇文章我们已经证明了：**如果所有激活函数都是线性的（$\sigma(x) = x$），不管网络有多少层，整个网络等价于一个单层线性变换。**

```
线性激活的问题：

线性变换 1: h1 = W1·x + b1
线性变换 2: h2 = W2·h1 + b2
           = W2·(W1·x + b1) + b2
           = (W2·W1)·x + (W2·b1 + b2)
           = W'·x + b'  ← 还是一个线性变换

不管你堆多少层，结果都等价于一层。
网络的"深度"完全被浪费了。
```

**非线性激活函数让每一层都能对空间做"弯曲"和"折叠"**，从而产生复杂的决策边界。

```
无激活函数：              有非线性激活函数：

空间只被旋转和平移        空间被弯曲和折叠

  × ×                      × ×
 × × × → 线性分不开       × × × → 空间被扭曲后可以分开
● ● ●                     ● ● ●

  加一层没变化              每一层都增加了表达能力
```

### 激活函数的角色

在网络中，激活函数扮演两个角色：

**1. 引入非线性**：这是数学上必须的。没有非线性，深度就无意义。

**2. 特征过滤**：某些激活函数（如 ReLU）还有选择性地"关闭"某些神经元的功能。ReLU 把负值映射为 0，相当于说"这个特征不够强，忽略它"。这种稀疏激活有助于模型关注最重要的特征。

## 工作原理（简化的心智模型）

### 激活函数是"过滤器"

把激活函数想象成一个信息过滤器。

**ReLU**：一个严格的主编。"内容不够好的稿件（负值），直接扔掉（输出 0）。内容好的稿件（正值），原封不动地发表（输出原值）。"

**Sigmoid**：一个温和的编辑。"所有稿件都要经过'柔化处理'——极端的内容被拉向中间（0 或 1 被压缩到 0.5 附近），温和的内容保持不变。"

**Tanh**：一个有偏向的编辑。"和 Sigmoid 类似，但偏向于输出负值。极端的正面被拉到 +1，极端的负面被拉到 -1。"

**GELU**：一个概率论的主编。"稿件有 x 的概率被认为足够好而被保留。不是硬性的'够好/不够好'判断，而是基于概率的平滑过滤。"

### 每种激活函数的一句话总结

| 函数 | 一句话总结 |
|------|-----------|
| Sigmoid | 把任意值压缩到 (0, 1)，用于二分类输出 |
| Tanh | 把任意值压缩到 (-1, 1)，零中心化 |
| ReLU | 负数变 0，正数不变，简单粗暴但有效 |
| Leaky ReLU | ReLU 的改进，负数不完全变 0 |
| ELU | ReLU 的改进，负数区有平滑曲线 |
| GELU | 概率化 ReLU，Transformer 的标配 |
| Softmax | 多分类输出，把向量变成概率分布 |

## 工作原理（详细机制）

### Sigmoid

$$
\sigma(x) = \frac{1}{1 + e^{-x}}
$$

**特性**：
- 输出范围：(0, 1)
- 导数：$\sigma'(x) = \sigma(x)(1 - \sigma(x))$
- 导数最大值：0.25（在 $x = 0$ 时取到）

```
Sigmoid 函数和导数：

函数值:                   导数:
1.0 ┤     __________     0.25 ┤     ╱╲
    |   /                       |   ╱  ╲
0.5 ┤  /                  0.0  ┤──╱────╲──
    | /                         |╱      ╲
0.0 ┤/                    ──────┼────────────
    +──────┼──────             -4  0   4
          x
```

**优点**：
- 输出可以解释为概率（0 到 1 之间）
- 平滑可微
- 适合二分类的输出层

**缺点**：
- **梯度消失**：导数最大才 0.25，多层后梯度趋近于 0
- **非零中心化**：输出全是正数（0 到 1），导致下一层的梯度更新方向一致（zigzag 现象），收敛慢
- **计算昂贵**：涉及指数运算 $e^{-x}$

**何时使用**：二分类的输出层。**几乎不再用于隐藏层**。

### Tanh（双曲正切）

$$
\tanh(x) = \frac{e^x - e^{-x}}{e^x + e^{-x}} = 2\sigma(2x) - 1
$$

**特性**：
- 输出范围：(-1, 1)
- 导数：$\tanh'(x) = 1 - \tanh^2(x)$
- 导数最大值：1.0（在 $x = 0$ 时取到）

**相比 Sigmoid 的改进**：
- **零中心化**：输出在 (-1, 1) 之间，均值为 0。这避免了 Sigmoid 的 zigzag 问题
- **导数更大**：最大导数为 1.0（Sigmoid 只有 0.25），梯度消失不那么严重

**仍然存在的问题**：
- 两端饱和，梯度消失（虽然比 Sigmoid 好一些）
- 计算仍然昂贵（涉及指数运算）

**何时使用**：
- 需要零中心化输出的隐藏层
- RNN/LSTM 的门控单元（历史选择，现在也逐渐被 ReLU 替代）

### ReLU（Rectified Linear Unit）

$$
\text{ReLU}(x) = \max(0, x)
$$

**特性**：
- 输出范围：[0, +∞)
- 导数：$ReLU'(x) = \begin{cases} 1 & x > 0 \\ 0 & x \leq 0 \end{cases}$

```
ReLU 函数和导数：

函数值:                   导数:
  ↑    /                        ↑ 1 ┤────
  |   /                         |   |
  |  /                          |   |
0 ┤ /                     0 ┤────┤
  |/                            |
──┼──────→ x              ──┼──────→ x
  x=0                           x=0
```

**优点**：
- **解决梯度消失**：正区间导数恒为 1，梯度不衰减
- **计算极快**：只需要一个 max 操作，没有指数运算
- **稀疏激活**：负值输出为 0，意味着网络中很多神经元"关闭"了，产生稀疏表示。这有助于防止过拟合

**缺点**：

**Dying ReLU 问题**：如果一个神经元的输入始终为负（可能因为初始化不好或学习率太大），它的输出永远为 0，梯度也永远为 0。这个神经元"死了"——永远不会更新。

```
Dying ReLU 示例：

假设一个神经元的权重被更新得太偏，导致 W·x + b < 0 对所有训练样本成立。
→ ReLU 输出 0
→ 梯度为 0
→ 权重不会更新
→ 下一轮输出还是 0
→ 死循环：这个神经元永远"死了"
```

在大网络中，通常 20-40% 的神经元可能是"死"的。这通常不是大问题（因为有足够多的存活神经元），但如果死神经元太多，网络的容量会严重下降。

**非零中心化**：和 Sigmoid 类似，ReLU 的输出全是非负的（0 或正值）。

**无上界**：正区间输出可以无限大，可能导致激活值爆炸。

**何时使用**：**隐藏层的默认选择**。大多数 CNN、MLP 使用 ReLU。

### Leaky ReLU

$$
\text{LeakyReLU}(x) = \begin{cases} x & x > 0 \\ \alpha x & x \leq 0 \end{cases}
$$

其中 $\alpha$ 通常取 0.01。

```
Leaky ReLU (α=0.01):

函数值:
  ↑    /
  |   /
  |  /
  | /
0 ┤╲
  | ╲
  ↓   ╲
──┼──────→ x
  x=0

负区间不是 0，而是有一个小斜率
→ 神经元不会"死"
```

**优点**：解决了 Dying ReLU 问题——负区间也有非零梯度。

**实践中的效果**：有时候比 ReLU 好，有时候差不多。没有明确的定论。通常作为 ReLU 不工作时的备选方案。

**Parametric ReLU (PReLU)**：让 $\alpha$ 也成为可学习的参数。网络自动学习最优的负区间斜率。

### ELU（Exponential Linear Unit）

$$
\text{ELU}(x) = \begin{cases} x & x > 0 \\ \alpha(e^x - 1) & x \leq 0 \end{cases}
$$

```
ELU:

函数值:
  ↑    /
  |   /
  |  /
  | /
0 ┤╲
  |  ╲
-α ┤   ╲____  ← 平滑趋近 -α（不趋近 0）
  |
──┼──────→ x
```

**优点**：
- 负区间有非零梯度（解决 Dying ReLU）
- 负区间的输出均值接近 0（缓解非零中心化问题）
- 在 $x=0$ 处平滑过渡（不像 ReLU/Leaky ReLU 那样有尖角）

**缺点**：负区间涉及指数运算，比 ReLU 计算慢。

### GELU（Gaussian Error Linear Unit）

$$
\text{GELU}(x) = x \cdot \Phi(x) = x \cdot P(X \leq x), \quad X \sim \mathcal{N}(0, 1)
$$

其中 $\Phi(x)$ 是标准正态分布的累积分布函数（CDF）。

近似公式：

$$
\text{GELU}(x) \approx 0.5 x \left(1 + \tanh\left[\sqrt{2/\pi}(x + 0.044715 x^3)\right]\right)
$$

```
GELU vs ReLU:

GELU (蓝) vs ReLU (红):

  ↑    /
  |   / ╲  ← GELU 在 0 附近有平滑弯曲
  |  /   ╲
  | /    /
0 ┤╲   /
  | ╲ /
  |  ╲
  |   ╲___  ← GELU 负区间平滑趋近 0，不是硬截断
──┼──────→ x
  x=0
```

**直觉解释**：GELU 可以理解为"以输入值本身的大小为概率来保留该值"。当 $x$ 很大时，$\Phi(x) \approx 1$，GELU 输出约等于 $x$（和 ReLU 一样）。当 $x$ 很小时，$\Phi(x) \approx 0$，GELU 输出约等于 0。但在 $x$ 接近 0 的区域，GELU 有一个平滑的过渡，而不是 ReLU 的硬拐角。

**GELU 相对 ReLU 的优势**：

1. **平滑性**：在 0 附近平滑过渡，不像 ReLU 有不连续的导数。这有助于优化过程的稳定性。

2. **非单调性**：GELU 在负区间有微小的凸起（先下降再趋近 0），这给网络提供了额外的表达能力。

3. **概率直觉**：GELU 的"保留概率"直觉比 ReLU 的硬阈值更符合现实。在很多场景下，"有多大可能是正的"比"是不是正的"是更好的问题。

**何时使用**：**Transformer 的标配**。BERT、GPT、ViT 等现代架构都使用 GELU。如果你的模型基于自注意力机制，用 GELU。

### Softmax

$$
\text{Softmax}(x_i) = \frac{e^{x_i}}{\sum_{j=1}^{K} e^{x_j}}
$$

Softmax 不是隐藏层的激活函数，而是**多分类任务的输出层激活函数**。它把一组实数转换成概率分布（所有输出在 0-1 之间，总和为 1）。

**何时使用**：多分类任务的输出层。

### Swish / SiLU

$$
\text{Swish}(x) = x \cdot \sigma(x)
$$

Swish 是 Google 在 2017 年通过自动搜索发现的激活函数。它和 GELU 非常相似（$\sigma(x)$ 是 Sigmoid，而 GELU 用 $\Phi(x)$）。在实验中，Swish 在很多深度模型上比 ReLU 效果稍好。

PyTorch 中的 `torch.nn.SiLU` 就是 Swish。

### 激活函数选择指南

| 场景 | 推荐激活函数 | 理由 |
|------|-------------|------|
| 隐藏层（通用） | ReLU | 默认选择，简单有效 |
| 隐藏层（CNN） | ReLU | 计算快，效果好 |
| 隐藏层（Transformer） | GELU | BERT/GPT 验证过的选择 |
| 隐藏层（ReLU 不工作） | Leaky ReLU / ELU | 解决 Dying ReLU |
| 输出层（二分类） | Sigmoid | 输出概率 [0, 1] |
| 输出层（多分类） | Softmax | 输出概率分布 |
| 输出层（回归） | 无 / 恒等函数 | 输出任意实数 |

## 代码示例

```python
import numpy as np
import matplotlib.pyplot as plt
from sklearn.datasets import make_moons
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score
import warnings
warnings.filterwarnings('ignore')

np.random.seed(42)

# ============================================================
# 1. 激活函数定义和可视化
# ============================================================
print("=" * 70)
print("1. 激活函数定义和可视化")
print("=" * 70)

# 定义激活函数及其导数
def sigmoid(x):
    return 1 / (1 + np.exp(-np.clip(x, -500, 500)))

def sigmoid_deriv(x):
    s = sigmoid(x)
    return s * (1 - s)

def tanh(x):
    return np.tanh(x)

def tanh_deriv(x):
    return 1 - np.tanh(x) ** 2

def relu(x):
    return np.maximum(0, x)

def relu_deriv(x):
    return (x > 0).astype(float)

def leaky_relu(x, alpha=0.01):
    return np.where(x > 0, x, alpha * x)

def leaky_relu_deriv(x, alpha=0.01):
    return np.where(x > 0, 1, alpha)

def elu(x, alpha=1.0):
    return np.where(x > 0, x, alpha * (np.exp(x) - 1))

def elu_deriv(x, alpha=1.0):
    return np.where(x > 0, 1, elu(x, alpha) + alpha)

def gelu(x):
    return 0.5 * x * (1 + np.tanh(np.sqrt(2 / np.pi) * (x + 0.044715 * x**3)))

def gelu_deriv(x):
    # 数值近似
    cdf = 0.5 * (1 + np.tanh(np.sqrt(2 / np.pi) * (x + 0.044715 * x**3)))
    pdf = np.exp(-0.5 * x**2) / np.sqrt(2 * np.pi)
    return cdf + x * pdf

# 可视化
x = np.linspace(-5, 5, 500)

fig, axes = plt.subplots(2, 4, figsize=(20, 8))

activations = [
    ('Sigmoid', sigmoid, sigmoid_deriv),
    ('Tanh', tanh, tanh_deriv),
    ('ReLU', relu, relu_deriv),
    ('Leaky ReLU', leaky_relu, leaky_relu_deriv),
    ('ELU', elu, elu_deriv),
    ('GELU', gelu, gelu_deriv),
]

for i, (name, func, deriv) in enumerate(activations):
    row, col = i // 3, i % 3
    ax = axes[row][col]
    
    ax.plot(x, func(x), 'b-', linewidth=2, label=f'{name}')
    ax_twin = ax.twinx()
    ax_twin.plot(x, deriv(x), 'r--', linewidth=1.5, alpha=0.7, label=f"{name}'(x)")
    
    ax.set_title(name, fontsize=12, fontweight='bold')
    ax.set_xlabel('x')
    ax.set_ylabel('f(x)', color='blue')
    ax_twin.set_ylabel("f'(x)", color='red')
    ax.grid(True, alpha=0.3)
    ax.set_ylim(-2, 5)
    
    # 标注关键导数值
    if name == 'Sigmoid':
        ax.annotate(f"最大导数=0.25", xy=(0, 0.5), fontsize=8, color='red')
    elif name == 'ReLU':
        ax.annotate(f"正区间导数=1", xy=(2, 2), fontsize=8, color='red')

# 隐藏多余的子图
for i in range(len(activations), 8):
    row, col = i // 4, i % 4
    if row < 2 and col < 4:
        axes[row][col].set_visible(False)

plt.tight_layout()
plt.savefig('activation_functions.png', dpi=150)
plt.show()
print("激活函数可视化已保存")

# ============================================================
# 2. 导数对比（梯度消失的关键）
# ============================================================
print("\n" + "=" * 70)
print("2. 激活函数导数对比（梯度消失的关键）")
print("=" * 70)

print(f"\n各激活函数在不同输入下的导数值:")
print(f"{'x':<8} {'Sigmoid':<12} {'Tanh':<12} {'ReLU':<12} {'GELU':<12}")
print("-" * 56)
for x_val in [-4, -2, -1, 0, 1, 2, 4]:
    print(f"{x_val:<8.0f} {sigmoid_deriv(x_val):<12.4f} {tanh_deriv(x_val):<12.4f} "
          f"{relu_deriv(x_val):<12.4f} {gelu_deriv(x_val):<12.4f}")

print(f"\n关键观察:")
print(f"  Sigmoid 在 x=0 时导数最大(0.25)，其他地方更小 → 严重梯度消失")
print(f"  Tanh 在 x=0 时导数为 1.0，但两端衰减 → 中等梯度消失")
print(f"  ReLU 在正区间导数恒为 1.0 → 无梯度消失（但有 Dying ReLU）")
print(f"  GELU 在正区间导数约 1.0，负区间有非零梯度 → 综合最优")

# ============================================================
# 3. Dying ReLU 演示
# ============================================================
print("\n" + "=" * 70)
print("3. Dying ReLU 演示")
print("=" * 70)

np.random.seed(42)
n_neurons = 100
n_samples = 500

# 生成随机数据
X_demo = np.random.randn(n_samples, 10)
W = np.random.randn(10, n_neurons) * 2  # 较大的初始化
b = np.random.randn(n_neurons) * 2

z = X_demo @ W + b
relu_output = relu(z)

# 统计死神经元
dead_ratio = (relu_output.sum(axis=0) == 0).mean()
print(f"100 个 ReLU 神经元中:")
print(f"  '死'神经元比例: {dead_ratio:.0%}")
print(f"  （对所有训练样本输出均为 0 的神经元）")
print(f"  这意味着 {dead_ratio:.0%} 的网络容量被浪费了")

# Leaky ReLU 没有这个问题
leaky_output = leaky_relu(z)
leaky_dead_ratio = (leaky_output.sum(axis=0) == 0).mean()
print(f"\nLeaky ReLU 的死神经元比例: {leaky_dead_ratio:.0%}")
print(f"→ Leaky ReLU 通过给负值一个小斜率避免了 Dying ReLU 问题")

# ============================================================
# 4. 激活函数对训练的影响
# ============================================================
print("\n" + "=" * 70)
print("4. 不同激活函数对训练的影响")
print("=" * 70)

class SimpleNet:
    """简单的多层网络，支持不同激活函数"""
    def __init__(self, sizes, activation='relu', lr=0.01):
        self.sizes = sizes
        self.lr = lr
        self.activation = activation
        
        self.W = []
        self.b = []
        for i in range(len(sizes) - 1):
            if activation == 'relu' or activation == 'leaky_relu':
                scale = np.sqrt(2.0 / sizes[i])  # He 初始化
            else:
                scale = np.sqrt(1.0 / sizes[i])  # Xavier 初始化
            self.W.append(np.random.randn(sizes[i], sizes[i+1]) * scale)
            self.b.append(np.zeros((1, sizes[i+1])))
    
    def _activate(self, z):
        if self.activation == 'relu': return relu(z)
        elif self.activation == 'sigmoid': return sigmoid(z)
        elif self.activation == 'tanh': return tanh(z)
        elif self.activation == 'leaky_relu': return leaky_relu(z)
        elif self.activation == 'gelu': return gelu(z)
    
    def _activate_deriv(self, z):
        if self.activation == 'relu': return relu_deriv(z)
        elif self.activation == 'sigmoid': return sigmoid_deriv(z)
        elif self.activation == 'tanh': return tanh_deriv(z)
        elif self.activation == 'leaky_relu': return leaky_relu_deriv(z)
        elif self.activation == 'gelu': return gelu_deriv(z)
    
    def forward(self, X):
        self.zs = []
        self.activations = [X]
        a = X
        for i in range(len(self.W) - 1):
            z = a @ self.W[i] + self.b[i]
            self.zs.append(z)
            a = self._activate(z)
            self.activations.append(a)
        z = a @ self.W[-1] + self.b[-1]
        self.zs.append(z)
        output = sigmoid(z)  # 输出层统一用 sigmoid
        self.activations.append(output)
        return output
    
    def train_step(self, X, y):
        m = X.shape[0]
        output = self.forward(X)
        
        eps = 1e-8
        loss = -np.mean(y * np.log(output + eps) + (1 - y) * np.log(1 - output + eps))
        
        # 反向传播
        delta = output - y
        for i in range(len(self.W) - 1, -1, -1):
            dW = self.activations[i].T @ delta / m
            db = np.mean(delta, axis=0, keepdims=True)
            if i > 0:
                delta = (delta @ self.W[i].T) * self._activate_deriv(self.zs[i-1])
            self.W[i] -= self.lr * dW
            self.b[i] -= self.lr * db
        
        return loss, output

# 生成数据
X_data, y_data = make_moons(n_samples=1000, noise=0.2, random_state=42)
X_tr, X_te, y_tr, y_te = train_test_split(X_data, y_data, test_size=0.2, random_state=42)
y_tr_2d = y_tr.reshape(-1, 1)
y_te_2d = y_te.reshape(-1, 1)

# 用不同激活函数训练 5 层网络
activations_to_test = ['sigmoid', 'tanh', 'relu', 'leaky_relu', 'gelu']
layer_sizes = [2, 32, 32, 32, 1]

results = {}
print(f"\n训练 5 层网络（各隐藏层 32 神经元），不同激活函数:")
print(f"{'激活函数':<15} {'最终Loss':<12} {'测试准确率':<12} {'备注'}")
print("-" * 60)

for act_name in activations_to_test:
    np.random.seed(42)
    net = SimpleNet(layer_sizes, activation=act_name, lr=0.01 if act_name != 'sigmoid' else 0.1)
    
    for epoch in range(2000):
        loss, output = net.train_step(X_tr, y_tr_2d)
    
    y_pred = (net.forward(X_te) > 0.5).astype(int)
    acc = accuracy_score(y_te, y_pred)
    
    results[act_name] = {'loss': loss, 'acc': acc}
    
    if act_name == 'sigmoid':
        note = "梯度消失，学习慢"
    elif act_name == 'tanh':
        note = "比 sigmoid 好"
    elif act_name == 'relu':
        note = "默认选择"
    elif act_name == 'leaky_relu':
        note = "解决 Dying ReLU"
    else:
        note = "Transformer 标配"
    
    print(f"{act_name:<15} {loss:<12.4f} {acc:<12.4f} {note}")

# ============================================================
# 5. GELU vs ReLU 详细对比
# ============================================================
print("\n" + "=" * 70)
print("5. GELU vs ReLU：深入对比")
print("=" * 70)

print("""
关键区别：

1. 负值区域处理：
   ReLU:  硬截断，负值 → 0（完全丢弃信息）
   GELU:  平滑过渡，负值 → 接近 0 但不完全是 0（保留少量信息）

2. 在 x=0 附近：
   ReLU:  不连续的导数（左导数=0，右导数=1）
   GELU:  平滑连续的导数

3. 数学直觉：
   ReLU:  "x 是正的吗？是 → 保留；否 → 丢弃"（确定性门控）
   GELU:  "x 作为正态分布的分位数，它有多大可能在右半边？"（概率门控）

4. 计算成本：
   ReLU:  max(0, x)，几乎免费
   GELU:  需要 tanh 近似，比 ReLU 贵约 2-3 倍

5. 实践效果：
   CNN:   ReLU 通常足够好
   Transformer: GELU 几乎总是优于 ReLU

为什么 Transformer 偏好 GELU？
- 自注意力机制对微小的输入变化敏感
- GELU 的平滑性让梯度更稳定
- BERT/GPT 的成功验证了 GELU 在 Transformer 中的有效性
""")

# ============================================================
# 6. 实用选择指南
# ============================================================
print("=" * 70)
print("6. 激活函数实用选择指南")
print("=" * 70)

guide = """
╔════════════════════════════════════════════════════════════════════════╗
║                    激活函数选择决策树                                  ║
╠════════════════════════════════════════════════════════════════════════╣
║                                                                      ║
║  在隐藏层中：                                                         ║
║  ├── 模型是 Transformer？ → GELU                                     ║
║  ├── 模型是 CNN / MLP？   → ReLU（默认选择）                          ║
║  ├── ReLU 有 Dying 问题？ → Leaky ReLU 或 ELU                        ║
║  └── 想要最好的性能？     → 试 GELU 和 ReLU，选更好的                 ║
║                                                                      ║
║  在输出层中：                                                         ║
║  ├── 二分类？     → Sigmoid（输出概率）                               ║
║  ├── 多分类？     → Softmax（输出概率分布）                           ║
║  ├── 回归？       → 无激活函数（线性输出）                            ║
║  └── 回归（正数）？ → ReLU 或 Softplus                               ║
║                                                                      ║
║  不要做的事：                                                         ║
║  ├── 不要在隐藏层用 Sigmoid（梯度消失）                               ║
║  ├── 不要全部用线性激活（失去非线性能力）                             ║
║  └── 不要随意更换激活函数（先用 ReLU，只在有理由时换）               ║
║                                                                      ║
╚════════════════════════════════════════════════════════════════════════╝
"""
print(guide)
```

## 真实案例

### 案例 1：从 Sigmoid 到 ReLU——AlexNet 的突破

2012 年的 AlexNet 是深度学习历史上的里程碑。Krizhevsky 等人在论文中明确指出，用 ReLU 替换 Sigmoid 是他们能成功训练深度网络的关键因素之一。

他们的实验显示：
- 使用 ReLU 的 CNN 在 CIFAR-10 上达到 25% 的训练误差，需要大约 6 个 epoch
- 使用 Tanh 的 CNN 达到同样的训练误差需要大约 36 个 epoch
- ReLU 快了大约 6 倍

这个速度优势（加上 GPU 训练）让训练更深的网络成为可能，直接导致了深度学习革命的开始。

### 案例 2：BERT 为什么选 GELU

BERT（2018）的论文选择了 GELU 而不是 ReLU。虽然论文没有详细解释原因，但后续的研究和分析表明：

1. **GELU 在 Transformer 架构上始终优于 ReLU**。Google 内部的实验表明，GELU 在 BERT 的预训练任务（Masked Language Model）上比 ReLU 的 perplexity 低 2-3%。

2. **GELU 的平滑性有助于自注意力机制**。自注意力涉及 softmax 操作，对输入的微小变化很敏感。GELU 的平滑过渡比 ReLU 的硬截断更适合这种场景。

3. **GELU 的"概率门控"直觉匹配了注意力的概率解释**。注意力权重本身就是概率分布，GELU 的概率化门控在概念上更一致。

### 案例 3：Swish 在移动端的应用

Google 在 2017 年通过自动搜索发现了 Swish 激活函数（$\text{Swish}(x) = x \cdot \sigma(x)$），并在 MobileNet 和 EfficientNet 中采用了 Hard Swish 变体：

$$
\text{HardSwish}(x) = x \cdot \frac{\text{ReLU6}(x+3)}{6}
$$

Hard Swish 是 Swish 的分段线性近似，计算更快，特别适合移动端的低精度计算（int8）。在 MobileNetV3 中，Hard Swish 比 ReLU 在 ImageNet 上的 top-1 准确率提高了约 1-2%，同时保持了低延迟。

## 权衡取舍以及何时不该使用

### 不同激活函数的代价

**ReLU 的代价**：
- Dying ReLU 问题：可能导致网络容量浪费
- 非零中心化：输出全为正，可能导致优化效率降低
- 在 $x=0$ 处不可微（实践中这不是问题，因为恰好等于 0 的概率极低）

**GELU 的代价**：
- 计算成本比 ReLU 高 2-3 倍
- 实现更复杂（需要 tanh 或 sigmoid 近似）
- 在某些 CNN 上不一定比 ReLU 好

**Sigmoid/Tanh 的代价**：
- 严重的梯度消失（这是致命的）
- 计算慢（涉及指数运算）
- 在深层网络中几乎不可用

### 常见的错误做法

**错误 1：在隐藏层使用 Sigmoid**

新手最常犯的错误。Sigmoid 的梯度消失问题会让你以为"网络学不动了"，实际上只是激活函数选错了。

**错误 2：频繁更换激活函数**

看到一篇文章说 GELU 好，就换成 GELU；又看到一篇说 Swish 好，就换 Swish。正确做法：先用 ReLU 建立基线，只有当有明确理由时才考虑更换。

**错误 3：忽略初始化和激活函数的配合**

不同的激活函数需要不同的权重初始化策略：
- ReLU → He 初始化（$\sqrt{2/n}$）
- Sigmoid/Tanh → Xavier 初始化（$\sqrt{1/n}$ 或 $\sqrt{2/(n_{in}+n_{out})}$）

用错了初始化，即使激活函数选对了，训练也可能不收敛。

## 关键要点

1. **非线性激活函数是多层网络有效的前提**。没有非线性，不管堆多少层都等价于一个线性变换。激活函数是"深度"的灵魂。

2. **ReLU 是隐藏层的默认选择**。正区间导数恒为 1（解决梯度消失），计算极快（max 操作），实践效果经过大量验证。除非有特殊原因，先用 ReLU。

3. **Sigmoid 不应该用于隐藏层**。导数最大才 0.25，多层后梯度几乎为零。只在二分类的输出层使用 Sigmoid。

4. **GELU 是 Transformer 的标配**。BERT、GPT、ViT 等模型都使用 GELU。它的平滑过渡和概率直觉比 ReLU 的硬截断更适合自注意力机制。

5. **Dying ReLU 是 ReLU 的主要问题**。负区间梯度为零，某些神经元可能永远"死亡"。Leaky ReLU 和 ELU 是解决方案。在大网络中，20-40% 的死神经元通常不影响性能。

6. **初始化和激活函数要配合**。ReLU 配 He 初始化，Sigmoid/Tanh 配 Xavier 初始化。配错了可能导致训练不收敛。

7. **输出层的激活函数取决于任务**。二分类用 Sigmoid，多分类用 Softmax，回归用线性输出。这不是选择题，而是确定性的。

## 延伸阅读

1. Nair, V., & Hinton, G. E. (2010). "Rectified Linear Units Improve Restricted Boltzmann Machines." *ICML*. — ReLU 在深度学习中的首次大规模应用

2. Hendrycks, D., & Gimpel, K. (2016). "Gaussian Error Linear Units (GELUs)." *arXiv*. — GELU 的原始论文

3. Ramachandran, P., Zoph, B., & Le, Q. V. (2017). "Searching for Activation Functions." *arXiv*. — Swish 的发现（通过自动搜索）

4. Clevert, D. A., Unterthiner, T., & Hochreiter, S. (2016). "Fast and Accurate Deep Network Learning by Exponential Linear Units (ELUs)." *ICLR*. — ELU 激活函数

5. Maas, A. L., Hannun, A. Y., & Ng, A. Y. (2013). "Rectifier Nonlinearities Improve Neural Network Acoustic Models." *ICML Workshop*. — Leaky ReLU

6. Glorot, X., & Bengio, Y. (2010). "Understanding the difficulty of training deep feedforward neural networks." *AISTATS*. — Xavier 初始化和激活函数配合的分析
