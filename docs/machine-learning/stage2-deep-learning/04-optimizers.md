<!--
调研来源：
1. Cameron R. Wolfe "The Best Learning Rate Schedules" — 实践中常用的学习率调度策略对比
2. arXiv (2024) "Why Warmup the Learning Rate? Underlying Mechanisms" — Warmup 为什么有效的系统分析
3. OptML Workshop "Adam vs. SGD: Closing the generalization gap" — SGD 泛化性通常优于 Adam 的分析
4. PyTorch 官方文档 CosineAnnealingLR — 余弦退火学习率调度的实现
5. D2L.ai "Learning Rate Scheduling" — 学习率调度的系统教程

核心发现：
- 学习率是深度学习中最重要的超参数，比模型架构选择影响更大
- SGD + Momentum 在图像分类等任务上泛化性能通常优于 Adam，但需要仔细调学习率
- Adam 对学习率更鲁棒（不 sensitive），适合快速实验和 NLP 任务
- AdamW（解耦权重衰减）在 Transformer 训练中是标配
- Cosine Annealing + Warmup 是 Transformer 训练的标准学习率调度
- 学习率 finder 技术（LR range test）是快速确定初始学习率的有效方法
-->

# 优化器：SGD、Adam、学习率调度，以及为什么学习率是最重要的超参数

**TL;DR：** 学习率决定了每一步参数更新的幅度——太大则训练震荡发散，太小则收敛缓慢甚至卡住。SGD 是最基础的优化器，加上动量后在大规模视觉任务上泛化性最好。Adam 为每个参数自适应调整学习率，对超参数更鲁棒，是快速实验和 NLP 任务的默认选择。AdamW（解耦权重衰减）是 Transformer 训练的标配。学习率调度（Cosine Annealing + Warmup）几乎和优化器本身一样重要——先用小学习率"热身"避免早期不稳定，然后逐渐衰减让模型收敛到更好的解。实用原则：默认用 AdamW + Cosine Schedule，视觉任务试 SGD + Momentum。

## 为什么这很重要

如果让我只给深度学习新手一个建议，那就是：**调好你的学习率。**

Andrej Karpathy 曾说过："每个说我尝试了某某方法不work的人，90%的情况是学习率没调对。"这不是夸张——学习率太大，训练直接发散（loss 变成 NaN）；学习率太小，训练几百个 epoch 损失也不怎么下降。

一个具体的例子：同一个模型（ResNet-18），在 CIFAR-10 上：
- 学习率 = 0.1：10 个 epoch 后准确率 85%
- 学习率 = 0.01：10 个 epoch 后准确率 72%（太慢了）
- 学习率 = 1.0：训练发散，loss 变成 NaN

选择正确的优化器和学习率调度，可以在不改变模型架构的情况下提升 5-10% 的性能。

## 核心概念

### 梯度下降的直觉

梯度下降就像蒙着眼睛下山。

你站在山坡上的某个位置（初始参数值），目标是到达谷底（最小化损失）。你看不到全貌，但能感觉到脚下的坡度（梯度）。你会朝着坡度下降最快的方向迈一步。

**学习率就是你每一步迈多大。**

```
学习率太大：               学习率太小：              学习率适中：

    ╲   ╱                     ╲                       ╲
     ╲ ╱                       ╲                       ╲
      * ← 在谷底两侧来回       *                        * → 稳步下坡
     ╱ ╲                        ╲                       ╲
    ╱   ╲  永远到不了谷底        ╲                      ╲
                                 ╲                       *
                                  ╲  走得太慢             到达谷底！
                                   ╲
```

### SGD、Mini-batch SGD、GD 的区别

**梯度下降（GD）**：用全部训练数据计算一次梯度，然后更新参数。数据量大时计算太慢。

**随机梯度下降（SGD）**：每次只用一条数据计算梯度。梯度噪声大，但更新快。

**Mini-batch SGD**：折中方案，每次用一小批数据（如 32、64、256 条）计算梯度。这是实际使用的版本，虽然大家都叫它"SGD"。

$$
\theta_{t+1} = \theta_t - \eta \cdot \frac{1}{|B|} \sum_{i \in B} \nabla_\theta L(x_i, y_i; \theta_t)
$$

其中 $\eta$ 是学习率，$B$ 是 mini-batch。

### 动量（Momentum）

标准的 SGD 在"峡谷"地形（一个方向陡峭、另一个方向平缓）中会震荡。动量通过积累历史梯度方向来抑制这种震荡。

$$
\begin{aligned}
v_{t+1} &= \beta v_t + (1 - \beta) \nabla_\theta L \\
\theta_{t+1} &= \theta_t - \eta \cdot v_{t+1}
\end{aligned}
$$

其中 $\beta$ 通常取 0.9。

**直觉**：动量就像一个球从山坡滚下来。它不仅受当前坡度影响，还积累了之前的"惯性"。如果前面几步都是朝一个方向走的，它会继续朝那个方向前进，不会被小的波动干扰。

```
没有动量：                有动量：

  ↗↙↗↙↗↙  震荡            →→→→→→  平滑前进
→→→→→→→→→               →→→→→→→→→
  ↗↙↗↙↗↙  震荡            →→→→→→  平滑前进
```

### Adam：自适应学习率

Adam（Adaptive Moment Estimation）的核心思想：**为每个参数单独调整学习率。**

如果一个参数的梯度一直很大（频繁更新），Adam 会减小它的学习率（"你已经走了很多了，慢一点"）。如果一个参数的梯度一直很小（很少更新），Adam 会增大它的学习率（"你需要走快一点才能跟上"）。

$$
\begin{aligned}
m_t &= \beta_1 m_{t-1} + (1 - \beta_1) g_t & \text{(一阶矩估计 = 梯度的指数移动平均)}\\
v_t &= \beta_2 v_{t-1} + (1 - \beta_2) g_t^2 & \text{(二阶矩估计 = 梯度平方的指数移动平均)}\\
\hat{m}_t &= \frac{m_t}{1 - \beta_1^t} & \text{(偏差校正)}\\
\hat{v}_t &= \frac{v_t}{1 - \beta_2^t} & \text{(偏差校正)}\\
\theta_{t+1} &= \theta_t - \frac{\eta}{\sqrt{\hat{v}_t} + \epsilon} \hat{m}_t
\end{aligned}
$$

默认参数：$\beta_1 = 0.9$，$\beta_2 = 0.999$，$\epsilon = 10^{-8}$。

**这些参数几乎不需要调整。** 你只需要设置全局学习率 $\eta$。这就是 Adam 如此受欢迎的原因。

**Adam 的直觉**：

想象你在一个地形复杂的山区下山。

- SGD：所有方向迈同样的步长。在陡峭的方向可能迈得太小（进展慢），在平缓的方向可能迈得太大（震荡）。
- Adam：根据你在每个方向的历史经验，自动调整步长。经常走的、梯度稳定的方向——放心大步走。梯度变化剧烈的方向——小心走小步。

### AdamW：解耦权重衰减

Adam 的一个重要变体是 AdamW。区别在于权重衰减（L2 正则化）的实现方式。

**标准 Adam + L2 正则化**：把正则化项加到损失函数里。但 Adam 的自适应学习率会"抵消"正则化的效果——对于梯度大的参数，Adam 自动降低了学习率，正则化的惩罚也被削弱了。

**AdamW**：直接从参数中减去权重衰减项，不经过 Adam 的自适应调整。

$$
\theta_{t+1} = \theta_t - \eta \left(\frac{\hat{m}_t}{\sqrt{\hat{v}_t} + \epsilon} + \lambda \theta_t\right)
$$

其中 $\lambda$ 是权重衰减系数。

Loshchilov 和 Hutter 在 2019 年的论文中证明，这种解耦方式比标准 Adam + L2 正则化在几乎所有任务上效果更好。

**实用建议**：**永远使用 AdamW 而不是 Adam**。PyTorch 中的 `AdamW` 已经是标准实现。

## 工作原理（简化的心智模型）

### 优化器是一个"导航系统"

把训练过程想象成开车导航到目的地（最小化损失）。

**SGD**：导航系统只告诉你"往南走"（当前梯度方向）。你每走一步就看一次地图。在蜿蜒的山路上可能来回绕弯。

**SGD + Momentum**：导航系统记住了你之前的方向。如果之前几步都在往南走，即使当前位置说"往东"，你也会继续偏南走。这让你在"之字形"的山路上更高效。

**Adam**：导航系统不仅记住了方向，还记住了"每条路的陡峭程度"。对于之前很陡的路，它会自动缩小步幅（避免冲过头）。对于之前很平的路，它会自动加大步幅（避免走太慢）。

### 学习率调度的直觉

学习率调度就是"先快后慢"的策略。

想象你在用 GPS 导航到一个不熟悉的城市。

**阶段 1（探索阶段，高学习率）**：你不熟悉路线，但需要快速接近目标。用较大的步幅快速移动。

**阶段 2（精确定位阶段，低学习率）**：你已经接近目标了，需要精确找到入口。放慢速度，仔细看路标。

**Warmup（热身阶段）**：刚出发时，GPS 还在定位，信号不稳定。先用很慢的速度走几步（避免一开始就走错方向），等 GPS 信号稳定了再加速。

## 工作原理（详细机制）

### SGD with Momentum 的完整算法

```
输入：学习率 η, 动量 β, 初始参数 θ₀
初始化：v₀ = 0

For t = 1, 2, ..., T:
    1. 从训练集采样 mini-batch B_t
    2. 计算梯度：g_t = ∇θ L(B_t; θ_t)
    3. 更新速度：v_t = β·v_{t-1} + (1-β)·g_t
    4. 更新参数：θ_{t+1} = θ_t - η·v_t
```

### Adam 的完整算法

```
输入：学习率 η, β₁=0.9, β₂=0.999, ε=10⁻⁸, 初始参数 θ₀
初始化：m₀ = 0, v₀ = 0

For t = 1, 2, ..., T:
    1. 从训练集采样 mini-batch B_t
    2. 计算梯度：g_t = ∇θ L(B_t; θ_t)
    3. 更新一阶矩：m_t = β₁·m_{t-1} + (1-β₁)·g_t
    4. 更新二阶矩：v_t = β₂·v_{t-1} + (1-β₂)·g_t²
    5. 偏差校正：m̂_t = m_t / (1-β₁ᵗ)
                    v̂_t = v_t / (1-β₂ᵗ)
    6. 更新参数：θ_{t+1} = θ_t - η·m̂_t / (√v̂_t + ε)
```

**偏差校正为什么需要**：初始时 $m_0 = 0$，所以 $m_1 = 0.1 \cdot g_1$（很小）。如果不校正，前期的梯度估计会偏小，导致训练初期参数更新太慢。校正公式 $\hat{m}_t = m_t / (1-\beta_1^t)$ 在前期放大估计值（$1-0.9^1 = 0.1$，所以 $\hat{m}_1 = m_1/0.1 = g_1$），在后期几乎不变（$1-0.9^{1000} \approx 1$）。

### SGD vs Adam：何时选哪个

**SGD + Momentum 的优势**：
- 泛化性通常更好（尤其在图像分类上）
- 计算开销更小
- 对噪声数据更鲁棒

**SGD + Momentum 的劣势**：
- 需要仔细调学习率（对学习率敏感）
- 在稀疏梯度场景下表现差
- 在 NLP 和 Transformer 任务上不如 Adam

**Adam/AdamW 的优势**：
- 对学习率更鲁棒（不 sensitive）
- 在稀疏梯度场景下表现好
- 训练初期收敛更快
- NLP/Transformer 的标配

**Adam/AdamW 的劣势**：
- 有时泛化性不如 SGD（在图像分类上）
- 内存开销更大（需要存储 m 和 v）
- 需要存储更多的状态变量

**实用建议**：

| 任务 | 推荐优化器 | 典型学习率 |
|------|-----------|-----------|
| 图像分类 | SGD + Momentum (0.9) | 0.1 |
| 目标检测 | SGD + Momentum | 0.02 |
| NLP / Transformer | AdamW | 1e-4 ~ 5e-5 |
| 快速实验 | Adam / AdamW | 1e-3 ~ 1e-4 |
| 稀疏特征 | Adam / AdamW | 1e-3 |
| GAN | Adam (β₁=0.5) | 1e-4 ~ 2e-4 |

### 学习率调度

学习率调度是在训练过程中动态调整学习率的策略。

#### Step Decay（阶梯衰减）

每过 N 个 epoch，学习率乘以衰减因子。

$$
\eta_t = \eta_0 \cdot \gamma^{\lfloor t / N \rfloor}
$$

比如每 30 个 epoch 乘以 0.1：
```
epoch 0-29:   lr = 0.1
epoch 30-59:  lr = 0.01
epoch 60-89:  lr = 0.001
```

这是 ResNet 论文中使用的调度方式。

#### Cosine Annealing（余弦退火）

学习率按余弦曲线从初始值平滑衰减到接近零。

$$
\eta_t = \eta_{\min} + \frac{1}{2}(\eta_{\max} - \eta_{\min})(1 + \cos(\frac{t}{T}\pi))
$$

```
lr
0.1 ┤╲
    | ╲
    |  ╲
    |   ╲
    |    ╲
    |     ╲
    |      ╲
    |       ╲________
0   ┤                ╲___________
    +────────────────────────────→ epoch
    0                         T
```

优点：平滑衰减，避免阶梯衰减中的突然下降。是 Transformer 训练的标准选择。

#### Warmup + Cosine Decay

这是 Transformer 训练最常用的调度。先用 $N_w$ 步线性增加学习率（warmup），然后按余弦曲线衰减。

```
lr
    |     ╲
    |    ╲ ╲
    |   ╲   ╲
    |  ╲     ╲
    | ╲       ╲
    |╲          ╲________
    +────────────────────→ step
    0  N_w              T

    warmup    cosine decay
```

**Warmup 为什么有效**：

训练初期，模型的参数是随机初始化的。此时梯度方向不稳定（几乎随机），如果学习率太大，参数更新可能把模型推到一个不好的区域，后续很难恢复。

arXiv (2024) 的一项系统研究表明，warmup 的主要好处在于：
1. 让 Adam 的二阶矩估计 $v_t$ 在训练初期有足够的时间积累准确值
2. 避免初始阶段的大更新把 BatchNorm 的统计量破坏

典型的 warmup 步数：总训练步数的 1-10%（如 BERT 训练 100 万步，warmup 1 万步）。

#### One Cycle Policy

在 Leslie Smith 的 Super-Convergence 论文中提出。学习率先从低到高（warmup），再从高到低（annealing），在一个周期内完成。

```
lr
    |    ╱╲
    |   ╱  ╲
    |  ╱    ╲
    | ╱      ╲
    |╱        ╲
    +────────────→ step
    0          T
```

优点：训练速度快（通常只需要标准训练 1/5 到 1/10 的 epoch），能达到接近甚至超过标准训练的最终性能。

#### 学习率 Finder（LR Range Test）

一种快速找到合理学习率范围的方法：

1. 从一个很小的学习率开始（如 1e-7）
2. 每个 mini-batch 把学习率乘以一个因子（如 1.1）
3. 记录每个学习率下的 loss
4. 画 loss vs learning rate 曲线
5. 选择 loss 下降最快区域的学习率

```
loss
  |
  |╲
  | ╲
  |  ╲  ← loss 下降最快
  |   ╲________
  |            ╲___ ← loss 开始上升
  |
  +────────────────→ lr
  1e-7  ...   最佳区间
```

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
# 0. 准备数据
# ============================================================
print("=" * 70)
print("优化器对比实验")
print("=" * 70)

X, y = make_moons(n_samples=2000, noise=0.2, random_state=42)
X_tr, X_te, y_tr, y_te = train_test_split(X, y, test_size=0.2, random_state=42)

# ============================================================
# 1. 从零实现 SGD、SGD+Momentum、Adam
# ============================================================
print("\n" + "=" * 70)
print("1. 从零实现优化器")
print("=" * 70)

class LinearModel:
    """简单的 2 层网络"""
    def __init__(self, input_dim=2, hidden_dim=32, output_dim=1):
        scale1 = np.sqrt(2.0 / input_dim)
        scale2 = np.sqrt(2.0 / hidden_dim)
        self.W1 = np.random.randn(input_dim, hidden_dim) * scale1
        self.b1 = np.zeros((1, hidden_dim))
        self.W2 = np.random.randn(hidden_dim, output_dim) * scale2
        self.b2 = np.zeros((1, output_dim))
    
    def forward(self, X):
        self.z1 = X @ self.W1 + self.b1
        self.a1 = np.maximum(0, self.z1)  # ReLU
        self.z2 = self.a1 @ self.W2 + self.b2
        self.out = 1 / (1 + np.exp(-np.clip(self.z2, -500, 500)))  # Sigmoid
        return self.out
    
    def compute_loss(self, y):
        eps = 1e-8
        return -np.mean(y * np.log(self.out + eps) + (1 - y) * np.log(1 - self.out + eps))
    
    def compute_gradients(self, X, y):
        m = X.shape[0]
        dz2 = self.out - y
        dW2 = self.a1.T @ dz2 / m
        db2 = np.mean(dz2, axis=0, keepdims=True)
        da1 = dz2 @ self.W2.T
        dz1 = da1 * (self.z1 > 0).astype(float)
        dW1 = X.T @ dz1 / m
        db1 = np.mean(dz1, axis=0, keepdims=True)
        return {'W1': dW1, 'b1': db1, 'W2': dW2, 'b2': db2}
    
    def get_params(self):
        return {'W1': self.W1, 'b1': self.b1, 'W2': self.W2, 'b2': self.b2}
    
    def set_params(self, params):
        for k in params:
            setattr(self, k, params[k])

class SGDOptimizer:
    def __init__(self, lr=0.01):
        self.lr = lr
    def step(self, model, grads):
        for key in grads:
            param = getattr(model, key)
            param -= self.lr * grads[key]

class SGDMomentumOptimizer:
    def __init__(self, lr=0.01, beta=0.9):
        self.lr = lr
        self.beta = beta
        self.velocity = None
    
    def step(self, model, grads):
        if self.velocity is None:
            self.velocity = {k: np.zeros_like(v) for k, v in grads.items()}
        for key in grads:
            self.velocity[key] = self.beta * self.velocity[key] + (1 - self.beta) * grads[key]
            param = getattr(model, key)
            param -= self.lr * self.velocity[key]

class AdamOptimizer:
    def __init__(self, lr=0.001, beta1=0.9, beta2=0.999, eps=1e-8):
        self.lr = lr
        self.beta1 = beta1
        self.beta2 = beta2
        self.eps = eps
        self.m = None
        self.v = None
        self.t = 0
    
    def step(self, model, grads):
        self.t += 1
        if self.m is None:
            self.m = {k: np.zeros_like(v) for k, v in grads.items()}
            self.v = {k: np.zeros_like(v) for k, v in grads.items()}
        for key in grads:
            self.m[key] = self.beta1 * self.m[key] + (1 - self.beta1) * grads[key]
            self.v[key] = self.beta2 * self.v[key] + (1 - self.beta2) * grads[key]**2
            m_hat = self.m[key] / (1 - self.beta1**self.t)
            v_hat = self.v[key] / (1 - self.beta2**self.t)
            param = getattr(model, key)
            param -= self.lr * m_hat / (np.sqrt(v_hat) + self.eps)

# ============================================================
# 2. 优化器对比
# ============================================================
print("\n" + "=" * 70)
print("2. SGD vs SGD+Momentum vs Adam 对比")
print("=" * 70)

def train_model(optimizer_class, opt_params, X, y, epochs=500, batch_size=64):
    np.random.seed(42)
    model = LinearModel()
    optimizer = optimizer_class(**opt_params)
    losses = []
    
    for epoch in range(epochs):
        # Mini-batch
        indices = np.random.permutation(len(X))
        for start in range(0, len(X), batch_size):
            batch_idx = indices[start:start+batch_size]
            X_batch = X[batch_idx]
            y_batch = y[batch_idx].reshape(-1, 1)
            
            model.forward(X_batch)
            grads = model.compute_gradients(X_batch, y_batch)
            optimizer.step(model, grads)
        
        # 记录全量 loss
        model.forward(X)
        loss = model.compute_loss(y.reshape(-1, 1))
        losses.append(loss)
    
    return model, losses

configs = {
    'SGD (lr=0.1)': (SGDOptimizer, {'lr': 0.1}),
    'SGD (lr=1.0)': (SGDOptimizer, {'lr': 1.0}),
    'SGD+Momentum (lr=0.1)': (SGDMomentumOptimizer, {'lr': 0.1, 'beta': 0.9}),
    'Adam (lr=0.01)': (AdamOptimizer, {'lr': 0.01}),
    'Adam (lr=0.001)': (AdamOptimizer, {'lr': 0.001}),
}

results = {}
print(f"\n{'优化器':<25} {'最终Loss':<12} {'测试准确率'}")
print("-" * 50)

for name, (opt_cls, opt_params) in configs.items():
    model, losses = train_model(opt_cls, opt_params, X_tr, y_tr, epochs=300)
    
    y_pred = (model.forward(X_te) > 0.5).astype(int).flatten()
    acc = accuracy_score(y_te, y_pred)
    
    results[name] = {'losses': losses, 'acc': acc, 'final_loss': losses[-1]}
    print(f"{name:<25} {losses[-1]:<12.4f} {acc:.4f}")

# ============================================================
# 3. 学习率影响演示
# ============================================================
print("\n" + "=" * 70)
print("3. 学习率的影响")
print("=" * 70)

lrs = [0.001, 0.01, 0.1, 0.5, 1.0, 5.0]
print(f"\n{'学习率':<10} {'最终Loss':<12} {'测试准确率':<12} {'备注'}")
print("-" * 55)

for lr in lrs:
    try:
        model, losses = train_model(SGDOptimizer, {'lr': lr}, X_tr, y_tr, epochs=300)
        y_pred = (model.forward(X_te) > 0.5).astype(int).flatten()
        acc = accuracy_score(y_te, y_pred)
        
        if losses[-1] > 10:
            note = "训练发散!"
        elif losses[-1] > 0.5:
            note = "学习太慢"
        elif acc > 0.9:
            note = "效果好"
        else:
            note = "尚可"
        
        print(f"{lr:<10.3f} {losses[-1]:<12.4f} {acc:<12.4f} {note}")
    except:
        print(f"{lr:<10.3f} {'NaN':<12} {'NaN':<12} 训练崩溃!")

# ============================================================
# 4. 学习率调度可视化
# ============================================================
print("\n" + "=" * 70)
print("4. 学习率调度策略可视化")
print("=" * 70)

total_steps = 1000
warmup_steps = 100

# Step Decay
step_lrs = []
for t in range(total_steps):
    lr = 0.1 * (0.1 ** (t // 300))
    step_lrs.append(lr)

# Cosine Annealing
cosine_lrs = []
for t in range(total_steps):
    lr = 0.5 * 0.1 * (1 + np.cos(np.pi * t / total_steps))
    cosine_lrs.append(lr)

# Warmup + Cosine
warmup_cosine_lrs = []
for t in range(total_steps):
    if t < warmup_steps:
        lr = 0.1 * t / warmup_steps
    else:
        progress = (t - warmup_steps) / (total_steps - warmup_steps)
        lr = 0.5 * 0.1 * (1 + np.cos(np.pi * progress))
    warmup_cosine_lrs.append(lr)

# One Cycle
one_cycle_lrs = []
for t in range(total_steps):
    if t < total_steps // 2:
        lr = 0.001 + (0.1 - 0.001) * t / (total_steps // 2)
    else:
        lr = 0.001 + (0.1 - 0.001) * (1 - (t - total_steps // 2) / (total_steps // 2))
    one_cycle_lrs.append(lr)

fig, axes = plt.subplots(2, 2, figsize=(14, 8))
schedules = [
    ('Step Decay', step_lrs),
    ('Cosine Annealing', cosine_lrs),
    ('Warmup + Cosine', warmup_cosine_lrs),
    ('One Cycle', one_cycle_lrs),
]

for ax, (name, lrs_list) in zip(axes.flatten(), schedules):
    ax.plot(lrs_list, linewidth=2)
    ax.set_title(name, fontsize=12, fontweight='bold')
    ax.set_xlabel('Training Step')
    ax.set_ylabel('Learning Rate')
    ax.grid(True, alpha=0.3)

plt.tight_layout()
plt.savefig('lr_schedules.png', dpi=150)
plt.show()
print("学习率调度可视化已保存")

# ============================================================
# 5. 训练曲线对比
# ============================================================
fig, axes = plt.subplots(1, 2, figsize=(14, 5))

# 所有优化器的训练曲线
for name, data in results.items():
    axes[0].plot(data['losses'], label=f"{name} (acc={data['acc']:.3f})")

axes[0].set_title('优化器训练曲线对比')
axes[0].set_xlabel('Epoch')
axes[0].set_ylabel('Loss')
axes[0].legend(fontsize=8)
axes[0].grid(True, alpha=0.3)
axes[0].set_ylim(0, 1)

# Adam 的学习率敏感性
adam_results = {}
for lr in [0.0001, 0.001, 0.01, 0.1]:
    model, losses = train_model(AdamOptimizer, {'lr': lr}, X_tr, y_tr, epochs=300)
    adam_results[f'lr={lr}'] = losses

for name, losses in adam_results.items():
    axes[1].plot(losses, label=name)

axes[1].set_title('Adam: 学习率敏感性')
axes[1].set_xlabel('Epoch')
axes[1].set_ylabel('Loss')
axes[1].legend()
axes[1].grid(True, alpha=0.3)
axes[1].set_ylim(0, 1)

plt.tight_layout()
plt.savefig('optimizer_comparison.png', dpi=150)
plt.show()
print("优化器对比可视化已保存")

# ============================================================
# 6. 实用指南
# ============================================================
print("\n" + "=" * 70)
print("6. 优化器和学习率实用指南")
print("=" * 70)

guide = """
╔════════════════════════════════════════════════════════════════════════╗
║                 优化器和学习率实用指南                                  ║
╠════════════════════════════════════════════════════════════════════════╣
║                                                                      ║
║  默认选择：                                                           ║
║  ├── NLP / Transformer  → AdamW + Cosine Schedule + Warmup          ║
║  │   lr=1e-4~5e-5, weight_decay=0.01, warmup=总步数的1~10%           ║
║  ├── 图像分类 (CNN)      → SGD + Momentum(0.9) + Step Decay         ║
║  │   lr=0.1, momentum=0.9, 每30 epoch × 0.1                         ║
║  └── 快速实验 / 原型     → Adam, lr=1e-3（对超参数最鲁棒）            ║
║                                                                      ║
║  学习率选择方法：                                                     ║
║  ├── LR Range Test (学习率 finder)                                   ║
║  │   从 1e-7 开始，逐步增大到 10，画 loss vs lr 曲线                 ║
║  │   选 loss 下降最快区域的 lr                                        ║
║  ├── 经验法则：Adam 默认 1e-3~1e-4，SGD 默认 0.1                    ║
║  └── 从大往小试：先试大的，如果发散就缩小 10 倍                       ║
║                                                                      ║
║  常见问题的解法：                                                     ║
║  ├── Loss 不下降 → 学习率太大或太小，先用 LR Range Test              ║
║  ├── Loss 震荡   → 学习率太大，减小 10 倍                            ║
║  ├── 训练发散 NaN → 学习率太大或梯度爆炸，减小 + 梯度裁剪            ║
║  ├── 训练太慢   → 学习率太小，增大 10 倍                             ║
║  └── 泛化不好   → 试用 SGD + Momentum，或加学习率调度                 ║
║                                                                      ║
╚════════════════════════════════════════════════════════════════════════╝
"""
print(guide)
```

## 真实案例

### 案例 1：BERT 的训练配置

BERT 的训练配置是 NLP 领域的经典参考：

- **优化器**：Adam
- **学习率**：5e-5（微调），1e-4（预训练）
- **β₁ = 0.9，β₂ = 0.999**
- **学习率调度**：Linear Warmup（前 10% 的步数从 0 线性增加到目标 lr），然后线性衰减到 0
- **Batch Size**：256
- **训练步数**：预训练 100 万步，微调 3-4 个 epoch

这个配置几乎成为了后续所有 Transformer 模型的标准模板。GPT-2、GPT-3、T5 等模型都使用类似的配置，主要区别在于训练步数和 batch size。

### 案例 2：ResNet 的训练配置

ResNet 论文中的训练配置是 CV 领域的经典：

- **优化器**：SGD + Momentum (0.9)
- **学习率**：0.1
- **学习率调度**：Step Decay——在 epoch 30、60、90 时学习率乘以 0.1
- **Weight Decay**：1e-4
- **Batch Size**：256
- **训练 epoch**：120

关键观察：初始学习率 0.1 对于 SGD 来说非常大。但由于使用了：
1. 合适的权重初始化（He 初始化）
2. Batch Normalization（稳定训练）
3. 大 batch size（梯度更准确）

这个配置能稳定训练，并且在 ImageNet 上达到了当时的 SOTA 性能。

### 案例 3：学习率调度对 GPT 训练的影响

OpenAI 在训练 GPT 系列模型时发现，学习率调度对最终性能有显著影响：

- **无调度（恒定 lr）**：训练后期 loss 不再下降，模型可能在较粗糙的解附近震荡
- **Step Decay**：性能提升明显，但在 step 点 loss 会暂时上升
- **Cosine Decay**：最平滑的衰减，最终 loss 最低
- **Warmup + Cosine**：和不用 warmup 相比，最终 loss 低 2-5%，训练更稳定

GPT-3 的训练配置：
- 优化器：Adam（β₁=0.9, β₂=0.95, ε=1e-8）
- 学习率：峰值 6e-5
- 调度：Warmup 3.75 亿 token，然后 Cosine Decay 到 6e-6
- Batch Size：0.5M token
- Weight Decay：0.1

## 权衡取舍以及何时不该使用

### Adam 的代价

**内存开销**：Adam 需要为每个参数存储两个额外的状态变量（一阶矩 m 和二阶矩 v）。对于一个有 10 亿参数的模型，Adam 需要额外 8 GB 的 GPU 内存（float32 下每个变量 4 bytes，两个变量）。

**泛化差距**：Wilson 等人在 2017 年的研究中发现，自适应方法（Adam、RMSprop）在测试集上的泛化性能通常不如 SGD + Momentum，尤其是在图像分类任务上。原因可能是 Adam 的自适应学习率让优化过程走了一条"更短但更窄"的路径到局部最小值。

### 常见的错误做法

**错误 1：不使用学习率调度**

用恒定的学习率从头训练到尾。这意味着：要么学习率太大使训练后期无法精确收敛，要么学习率太小使训练初期太慢。

**错误 2：用 Adam 但不调学习率**

虽然 Adam 对学习率更鲁棒，但 "1e-3 对所有任务都好" 并不是真的。不同任务的最优学习率可能差 10-100 倍。至少用 LR Range Test 确定一个合理的范围。

**错误 3：SGD 用了太大的学习率但没有 warmup**

SGD 在训练初期对学习率很敏感（因为参数还随机，梯度方向不稳定）。如果学习率太大，前几个 epoch 就可能让模型进入一个不好的区域。

**错误 4：忽视 weight decay**

Weight decay（权重衰减）和优化器紧密相关。AdamW 的 weight decay 系数通常设为 0.01-0.1。不用 weight decay 的 Adam 容易过拟合。

## 关键要点

1. **学习率是深度学习中最重要的超参数**。选错了学习率，再好的模型架构也训练不出来。先用 LR Range Test 找到合理范围，再精细调整。

2. **Adam/AdamW 是最省心的优化器**。对学习率鲁棒，收敛快，不需要太多调参。默认选择 AdamW + Cosine Schedule + Warmup。

3. **SGD + Momentum 在视觉任务上泛化性通常更好**。如果追求最好的测试集性能（如竞赛），SGD 值得一试。但需要更多调参经验。

4. **学习率调度几乎和优化器本身一样重要**。不用调度，模型的最终性能可能差 5-10%。Cosine Annealing + Warmup 是当前最通用的选择。

5. **Warmup 在 Transformer 训练中是必须的**。Adam 的二阶矩估计在训练初期不准确，大学习率会导致不稳定的更新。Warmup 给 Adam 时间"校准"。

6. **AdamW 应该替代 Adam**。解耦的权重衰减比 Adam + L2 正则化在几乎所有场景下效果更好。直接用 `AdamW` 就对了。

7. **优化器的默认参数通常不需要改**。Adam 的 $\beta_1=0.9$，$\beta_2=0.999$，$\epsilon=10^{-8}$ 对绝大多数任务都是好选择。你只需要调学习率和 weight decay。

## 延伸阅读

1. Kingma, D. P., & Ba, J. (2015). "Adam: A Method for Stochastic Optimization." *ICLR*. — Adam 优化器的原始论文

2. Loshchilov, I., & Hutter, F. (2019). "Decoupled Weight Decay Regularization." *ICLR*. — AdamW 的原始论文

3. Smith, L. N. (2018). "A disciplined approach to neural network hyper-parameters: Part 1." *arXiv*. — 学习率选择和调参的系统方法

4. Loshchilov, I., & Hutter, F. (2017). "SGDR: Stochastic Gradient Descent with Warm Restarts." *ICLR*. — Cosine Annealing 的原始论文

5. Wilson, A. C., Roelofs, R., Stern, M., Srebro, N., & Recht, B. (2017). "The Marginal Value of Adaptive Gradient Methods in Deep Learning." *NeurIPS*. — SGD vs Adam 泛化性对比

6. Goyal, P., et al. (2017). "Accurate, Large Minibatch SGD: Training ImageNet in 1 Hour." *arXiv*. — 大 batch SGD 训练的最佳实践
