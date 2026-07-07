<!--
调研来源：
1. Colah's Blog "Calculus on Computational Graphs: Backpropagation" — 计算图视角的反向传播解释，最清晰的教程之一
2. Stanford CS224n Lecture 4 "Backpropagation" — 下游梯度 = 上游梯度 × 局部梯度 的规则
3. Columbia University "Computational Graphs, and Backpropagation" — 形式化的反向传播算法推导
4. MIT Foundations of Computer Vision "Backpropagation" — 反向传播作为计算图上的高效梯度计算算法
5. Wikipedia "Vanishing gradient problem" — 梯度消失问题的形式化描述和解决方案

核心发现：
- 反向传播的核心是链式法则在计算图上的高效应用，复杂度与图中边数成正比
- 计算图的前向传播计算函数值，反向传播从输出向输入反向传播梯度
- 梯度消失的根本原因：Sigmoid/Tanh 的导数最大值为 0.25/1.0，多层连乘后梯度指数衰减
- ReLU 解决梯度消失的原理：正区间导数恒为 1，梯度不会衰减
- 残差连接（ResNet）通过加法让梯度直接流过，是训练超深网络的关键
-->

# 反向传播：计算图、链式法则，以及梯度如何一层层传回去

**TL;DR：** 反向传播（Backpropagation）不是一个新算法，它就是链式法则在计算图上的高效应用。前向传播把数据从输入推向输出，计算出预测值和损失。反向传播把梯度从输出拉回输入，告诉你每个参数该怎么调。核心规则只有一条：**下游梯度 = 上游梯度 × 局部梯度**。梯度消失和爆炸是深层网络最头疼的问题——Sigmoid 的导数最大才 0.25，多层连乘后梯度几乎为零。ReLU、BatchNorm、残差连接是三大解法。

## 为什么这很重要

假设你在训练一个 10 层的神经网络。每一层有几百个参数。总共有几千个参数需要更新。每次更新，你都需要知道：**每个参数对最终损失的贡献有多大？**

这就是梯度的作用。梯度告诉你："如果把某个参数稍微增大一点，损失会增加还是减少？增加/减少多少？"

最直觉的计算方法是对每个参数分别计算梯度。如果有 N 个参数，你需要做 N 次前向传播。对于一个有 100 万参数的网络（很小的网络），这意味着 100 万次前向传播来计算一次梯度更新。这完全不可行。

反向传播算法的精妙之处在于：**只需要一次前向传播和一次反向传播，就能计算出所有参数的梯度。** 不管你有 100 个参数还是 1 亿个参数，计算量都是两次遍历网络（一次向前，一次向后）。

这个效率上的突破是深度学习能够在实践中训练大规模网络的基础。没有反向传播，深度学习就不可能存在。

## 核心概念

### 链式法则：反向传播的数学基础

链式法则（Chain Rule）是微积分中处理复合函数求导的基本规则。

如果 $y = f(g(x))$，那么：

$$
\frac{dy}{dx} = \frac{dy}{dg} \cdot \frac{dg}{dx}
$$

**直觉**：如果 $g$ 变化 1 单位会导致 $y$ 变化 $\frac{dy}{dg}$ 单位，而 $x$ 变化 1 单位会导致 $g$ 变化 $\frac{dg}{dx}$ 单位，那么 $x$ 变化 1 单位最终导致 $y$ 变化 $\frac{dy}{dg} \times \frac{dg}{dx}$ 单位。

**日常类比**：假设你在开车。
- 踩油门的力度（$x$）决定了速度（$g$）：$\frac{dg}{dx} = 10$ km/h 每单位力度
- 速度（$g$）决定了油耗（$y$）：$\frac{dy}{dg} = 0.1$ 升每 km/h
- 那么踩油门的力度（$x$）和油耗（$y$）的关系是：$\frac{dy}{dx} = 0.1 \times 10 = 1$ 升每单位力度

链式法则告诉你"力度 → 速度 → 油耗"这条链上，首尾（力度和油耗）之间的关系。

### 计算图：反向传播的数据结构

计算图（Computational Graph）是把计算过程表示为有向无环图（DAG）的方式。

- **节点**：表示一个操作（加法、乘法、函数应用）
- **边**：表示数据的流动方向

一个简单的例子：$f(x, y, z) = (x + y) \cdot z$

```
计算图：

    x ──→ [+] ──→ [×] ──→ f
          ↑         ↑
    y ──→┘    z ──→┘

前向传播（从左到右）：
  a = x + y    (加法节点)
  f = a · z    (乘法节点)
```

**前向传播**：从输入节点开始，按照拓扑序依次计算每个节点的值，直到输出节点。

**反向传播**：从输出节点开始，沿着反方向传递梯度，直到输入节点。

### 反向传播的核心规则

反向传播只有一条核心规则：

$$
\text{下游梯度} = \text{上游梯度} \times \text{局部梯度}
$$

- **上游梯度**：从后面（更靠近输出的层）传来的梯度，表示"输出对这个节点的输出的变化有多敏感"
- **局部梯度**：这个节点本身对其输入的导数，表示"这个节点的输出对输入的变化有多敏感"
- **下游梯度**：传给前面层的梯度，表示"输出对这个节点的输入的变化有多敏感"

```
前向传播方向 →
输入 → [节点] → 输出
  a      f(a)      b = f(a)

← 反向传播方向
       上游梯度 ∂L/∂b
           ↓
输入 ← [节点] ← 输出
  a      f(a)      b

下游梯度 = 上游梯度 × 局部梯度
∂L/∂a = ∂L/∂b × ∂b/∂a = ∂L/∂b × f'(a)
```

## 工作原理（简化的心智模型）

### 反向传播像一个公司里的信息流动

把神经网络想象成一家公司。

**前向传播**：客户需求从销售部门传到生产部门。
- 销售部门接到订单 → 传给设计部门 → 设计方案传给生产部门 → 产品出厂
- 每个部门根据自己的输入做自己的工作，把结果传给下一个部门

**反向传播**：客户投诉从销售部门反向传到生产部门。
- 客户投诉（损失值）→ 销售部门分析："这个问题有多少是因为产品设计的？有多少是因为原材料选择的？"
- 销售部门把"责任分配"传给设计部门 → 设计部门分析："这个问题有多少是因为生产环节的？有多少是因为设计方案的？"
- 每个部门只需要知道自己做了什么（局部梯度），就能算出自己应该承担多少"责任"（下游梯度）

**关键洞察**：每个部门不需要了解整个公司的运作方式。它只需要知道：
1. 上游传来的"责任分配"（上游梯度）
2. 自己做了什么操作（局部梯度）

然后就能算出自己应该传递给下游多少责任。这就是反向传播的美妙之处——**每个节点只需要局部信息就能参与全局计算**。

### 反向传播为什么高效

如果你对每个参数单独求导（朴素的链式法则），很多计算会被重复。反向传播通过**从输出到输入的反向遍历**，让每个中间梯度只计算一次，然后被所有需要它的下游节点共享。

对于一个有 $N$ 个参数的网络：
- 朴素方法：$O(N)$ 次前向传播（每个参数一次）
- 反向传播：1 次前向传播 + 1 次反向传播

反向传播的复杂度大约是前向传播的 2-3 倍（因为需要存储中间值和计算反向梯度），但与参数数量 $N$ 无关。

## 工作原理（详细机制）

### 一个完整的反向传播例子

让我们一步步计算 $f(x, y, z) = (x + y) \cdot z$ 的梯度。

假设 $x = 2, y = -3, z = 4$。

**第一步：前向传播**

```
    x = 2 ──→ [+] ──→ a ──→ [×] ──→ f
              ↑         ↑
    y = -3 ─→┘    z = 4 ─→┘

a = x + y = 2 + (-3) = -1
f = a · z = (-1) · 4 = -4
```

**第二步：反向传播**

从输出 $f$ 开始，初始上游梯度 = $\frac{\partial f}{\partial f} = 1$。

```
反向传播：

    x ←── [+] ←── a ←── [×] ←── f (上游梯度 = 1)
              ↑         ↑
    y ←──────┘    z ←──┘

乘法节点 [×]：
  局部梯度：∂f/∂a = z = 4,  ∂f/∂z = a = -1
  传给 a 的梯度：1 × 4 = 4
  传给 z 的梯度：1 × (-1) = -1

加法节点 [+]：
  上游梯度（从乘法节点传来）= 4
  局部梯度：∂a/∂x = 1,  ∂a/∂y = 1
  传给 x 的梯度：4 × 1 = 4
  传给 y 的梯度：4 × 1 = 4
```

最终结果：
- $\frac{\partial f}{\partial x} = 4$
- $\frac{\partial f}{\partial y} = 4$
- $\frac{\partial f}{\partial z} = -1$

验证：
- $\frac{\partial f}{\partial x} = z = 4$ ✓
- $\frac{\partial f}{\partial y} = z = 4$ ✓
- $\frac{\partial f}{\partial z} = x + y = -1$ ✓

### 常用操作的反向传播规则

**加法节点** $c = a + b$：
- $\frac{\partial L}{\partial a} = \frac{\partial L}{\partial c} \cdot 1 = \frac{\partial L}{\partial c}$
- $\frac{\partial L}{\partial b} = \frac{\partial L}{\partial c} \cdot 1 = \frac{\partial L}{\partial c}$
- 规则：**加法的梯度分配器**——上游梯度原封不动地传给每个输入

**乘法节点** $c = a \cdot b$：
- $\frac{\partial L}{\partial a} = \frac{\partial L}{\partial c} \cdot b$
- $\frac{\partial L}{\partial b} = \frac{\partial L}{\partial c} \cdot a$
- 规则：**乘法的梯度交换器**——每个输入的梯度是上游梯度乘以另一个输入的值

**ReLU 节点** $c = \max(0, a)$：
- $\frac{\partial L}{\partial a} = \frac{\partial L}{\partial c} \cdot \begin{cases} 1 & a > 0 \\ 0 & a \leq 0 \end{cases}$
- 规则：**ReLU 的梯度开关**——正值区域梯度直接通过，负值区域梯度被截断

**Sigmoid 节点** $c = \sigma(a) = \frac{1}{1 + e^{-a}}$：
- $\frac{\partial L}{\partial a} = \frac{\partial L}{\partial c} \cdot \sigma(a)(1 - \sigma(a))$
- 注意：$\sigma(a)(1 - \sigma(a))$ 的最大值是 0.25（在 $a=0$ 时取到）

### 多层网络的反向传播

对于一个 $L$ 层网络：

$$
\mathbf{h}^{(l)} = \sigma(W^{(l)} \mathbf{h}^{(l-1)} + \mathbf{b}^{(l)})
$$

反向传播计算 $\frac{\partial L}{\partial W^{(l)}}$ 和 $\frac{\partial L}{\partial \mathbf{b}^{(l)}}$ 对每一层 $l$。

**从第 $L$ 层开始，反向逐层计算**：

$$
\frac{\partial L}{\partial \mathbf{h}^{(l-1)}} = \left(\frac{\partial L}{\partial \mathbf{h}^{(l)}} \odot \sigma'(\mathbf{z}^{(l)})\right) {W^{(l)}}^T
$$

$$
\frac{\partial L}{\partial W^{(l)}} = {\mathbf{h}^{(l-1)}}^T \left(\frac{\partial L}{\partial \mathbf{h}^{(l)}} \odot \sigma'(\mathbf{z}^{(l)})\right)
$$

$$
\frac{\partial L}{\partial \mathbf{b}^{(l)}} = \sum_{i} \left(\frac{\partial L}{\partial \mathbf{h}^{(l)}} \odot \sigma'(\mathbf{z}^{(l)})\right)_i
$$

其中 $\odot$ 是逐元素乘法（Hadamard 积），$\mathbf{z}^{(l)} = W^{(l)} \mathbf{h}^{(l-1)} + \mathbf{b}^{(l)}$。

### 梯度消失和爆炸

当网络很深时，反向传播需要把梯度通过很多层传回去。如果每一层都把梯度乘以一个小于 1 的数，经过多层后梯度会衰减到接近 0——这就是**梯度消失**。

**数学分析**：

假设每层的激活函数是 Sigmoid，其导数最大值为 0.25。对于 10 层网络：

$$
\frac{\partial L}{\partial W^{(1)}} \propto \prod_{l=1}^{10} \sigma'(\mathbf{z}^{(l)}) \cdot {W^{(l)}}^T
$$

如果每个 $\sigma'(z) \approx 0.25$，那么经过 10 层后梯度被乘以 $0.25^{10} \approx 10^{-6}$。第一层的梯度几乎为零，参数基本不更新。

```
梯度在反向传播中的变化：

第 10 层 → 梯度 × 0.25 → 第 9 层 → × 0.25 → 第 8 层 → ... → 第 1 层

原始梯度: 1.0
第 9 层:  0.25
第 8 层:  0.0625
第 7 层:  0.016
...
第 1 层:  0.000001  ← 几乎为零，参数不会更新
```

**梯度爆炸**是相反的问题：如果权重矩阵的值太大，每层的梯度被放大，经过多层后变成天文数字。

**解决方案**：

1. **ReLU 激活函数**：正区间的导数恒为 1（不是 0.25），梯度不会在传递过程中衰减。这是最简单有效的解决方案。

2. **权重初始化**：Xavier 初始化和 He 初始化确保初始时各层的激活值和梯度方差大致相同，避免梯度消失或爆炸。

3. **Batch Normalization**：通过归一化每层的输出，使得梯度的分布更加稳定。

4. **残差连接（ResNet）**：通过加法让梯度可以直接"跳过"某些层，不经过激活函数的衰减。

$$
\mathbf{h}^{(l+1)} = \sigma(W^{(l)} \mathbf{h}^{(l)} + \mathbf{b}^{(l)}) + \mathbf{h}^{(l)}
$$

反向传播时：$\frac{\partial \mathbf{h}^{(l+1)}}{\partial \mathbf{h}^{(l)}} = \sigma'(\cdot) W^{(l)} + I$

即使 $\sigma'(\cdot) W^{(l)}$ 很小，还有 $+I$（单位矩阵）保底，梯度不会消失。

5. **梯度裁剪（Gradient Clipping）**：限制梯度的最大值，防止梯度爆炸。

```python
# 梯度裁剪
torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)
```

### 自动微分

现代深度学习框架（PyTorch、TensorFlow）使用**自动微分（Automatic Differentiation）**来实现反向传播。你不需要手动推导梯度——框架会自动构建计算图并计算梯度。

```python
import torch

# PyTorch 的自动微分
x = torch.tensor([2.0], requires_grad=True)
y = torch.tensor([-3.0], requires_grad=True)
z = torch.tensor([4.0], requires_grad=True)

# 前向传播
a = x + y
f = a * z

# 反向传播（一行代码！）
f.backward()

print(f"∂f/∂x = {x.grad}")  # 输出: 4.0
print(f"∂f/∂y = {y.grad}")  # 输出: 4.0
print(f"∂f/∂z = {z.grad}")  # 输出: -1.0
```

PyTorch 使用**动态计算图**（Define-by-Run）：每次前向传播都构建一个新的计算图。TensorFlow 2.x 默认也使用动态图（Eager Execution）。

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
# 1. 手动实现反向传播（完整版）
# ============================================================
print("=" * 70)
print("1. 手动实现反向传播")
print("=" * 70)

class NeuralNetwork:
    """从零实现的前馈神经网络，带手动反向传播"""
    
    def __init__(self, layer_sizes, learning_rate=0.01):
        self.layer_sizes = layer_sizes
        self.lr = learning_rate
        self.n_layers = len(layer_sizes) - 1
        
        # He 初始化（适用于 ReLU）
        self.weights = []
        self.biases = []
        for i in range(self.n_layers):
            W = np.random.randn(layer_sizes[i], layer_sizes[i+1]) * np.sqrt(2.0 / layer_sizes[i])
            b = np.zeros((1, layer_sizes[i+1]))
            self.weights.append(W)
            self.biases.append(b)
    
    def relu(self, z):
        return np.maximum(0, z)
    
    def relu_derivative(self, z):
        return (z > 0).astype(float)
    
    def sigmoid(self, z):
        return 1 / (1 + np.exp(-np.clip(z, -500, 500)))
    
    def forward(self, X):
        """前向传播：存储所有中间值"""
        self.z_list = []  # 线性变换结果
        self.a_list = [X]  # 激活值（第一层是输入）
        
        a = X
        for i in range(self.n_layers - 1):
            z = a @ self.weights[i] + self.biases[i]
            self.z_list.append(z)
            a = self.relu(z)
            self.a_list.append(a)
        
        # 输出层用 sigmoid
        z = a @ self.weights[-1] + self.biases[-1]
        self.z_list.append(z)
        a = self.sigmoid(z)
        self.a_list.append(a)
        
        return a
    
    def backward(self, y):
        """反向传播：计算所有梯度"""
        m = y.shape[0]
        
        # 存储梯度
        self.dW = [None] * self.n_layers
        self.db = [None] * self.n_layers
        
        # 输出层梯度（sigmoid + BCE loss 的简化形式）
        delta = self.a_list[-1] - y  # ∂L/∂z_L
        
        for i in range(self.n_layers - 1, -1, -1):
            # 参数梯度
            self.dW[i] = self.a_list[i].T @ delta / m
            self.db[i] = np.mean(delta, axis=0, keepdims=True)
            
            # 传播到前一层（如果不是第一层）
            if i > 0:
                delta = (delta @ self.weights[i].T) * self.relu_derivative(self.z_list[i-1])
    
    def update(self):
        """梯度下降更新"""
        for i in range(self.n_layers):
            self.weights[i] -= self.lr * self.dW[i]
            self.biases[i] -= self.lr * self.db[i]
    
    def train(self, X, y, epochs=1000, verbose=True):
        """训练循环"""
        losses = []
        for epoch in range(epochs):
            # 前向传播
            output = self.forward(X)
            
            # 计算 loss
            eps = 1e-8
            loss = -np.mean(y * np.log(output + eps) + (1 - y) * np.log(1 - output + eps))
            losses.append(loss)
            
            # 反向传播
            self.backward(y)
            
            # 更新参数
            self.update()
            
            if verbose and (epoch + 1) % 200 == 0:
                acc = accuracy_score(y.flatten(), (output > 0.5).flatten())
                print(f"  Epoch {epoch+1}: loss={loss:.4f}, accuracy={acc:.4f}")
        
        return losses

# ============================================================
# 2. 梯度消失演示
# ============================================================
print("\n" + "=" * 70)
print("2. 梯度消失/爆炸演示")
print("=" * 70)

# 用 Sigmoid 激活函数的深层网络，观察梯度变化
def check_gradient_magnitude(layer_sizes, activation='sigmoid', n_trials=100):
    """检查不同层的梯度量级"""
    np.random.seed(42)
    
    # 生成随机数据
    X = np.random.randn(50, layer_sizes[0])
    y = np.random.randint(0, 2, (50, 1)).astype(float)
    
    # 初始化网络
    weights = []
    biases = []
    for i in range(len(layer_sizes) - 1):
        W = np.random.randn(layer_sizes[i], layer_sizes[i+1]) * 0.5
        b = np.zeros((1, layer_sizes[i+1]))
        weights.append(W)
        biases.append(b)
    
    # 前向传播
    z_list = []
    a_list = [X]
    a = X
    for i in range(len(layer_sizes) - 1):
        z = a @ weights[i] + biases[i]
        z_list.append(z)
        if activation == 'sigmoid':
            a = 1 / (1 + np.exp(-np.clip(z, -500, 500)))
        elif activation == 'relu':
            a = np.maximum(0, z)
        a_list.append(a)
    
    # 反向传播
    delta = a_list[-1] - y  # 输出层梯度
    
    layer_gradient_norms = [np.linalg.norm(delta)]
    
    for i in range(len(weights) - 1, 0, -1):
        if activation == 'sigmoid':
            s = 1 / (1 + np.exp(-np.clip(z_list[i-1], -500, 500)))
            delta = (delta @ weights[i].T) * s * (1 - s)
        elif activation == 'relu':
            delta = (delta @ weights[i].T) * (z_list[i-1] > 0).astype(float)
        layer_gradient_norms.append(np.linalg.norm(delta))
    
    layer_gradient_norms.reverse()  # 从第 1 层到最后一层
    return layer_gradient_norms

# 对比 Sigmoid 和 ReLU 在 10 层网络中的梯度
layers = [20] + [64] * 10 + [1]  # 10 个隐藏层

sigmoid_grads = check_gradient_magnitude(layers, activation='sigmoid')
relu_grads = check_gradient_magnitude(layers, activation='relu')

print(f"10 层网络中各层的梯度范数:")
print(f"\n{'层':<8} {'Sigmoid 梯度范数':<25} {'ReLU 梯度范数':<25}")
print("-" * 60)
for i in range(len(sigmoid_grads)):
    print(f"  层 {i+1:<3} {sigmoid_grads[i]:<25.6f} {relu_grads[i]:<25.6f}")

sigmoid_ratio = sigmoid_grads[0] / sigmoid_grads[-1] if sigmoid_grads[-1] > 0 else float('inf')
relu_ratio = relu_grads[0] / relu_grads[-1] if relu_grads[-1] > 0 else float('inf')

print(f"\n第 1 层 vs 最后层梯度比:")
print(f"  Sigmoid: {sigmoid_ratio:.2f}x  ← 梯度严重衰减")
print(f"  ReLU:    {relu_ratio:.2f}x  ← 梯度保持得更好")

# ============================================================
# 3. 梯度消失可视化
# ============================================================
fig, axes = plt.subplots(1, 2, figsize=(14, 5))

# Sigmoid 导数
z = np.linspace(-6, 6, 200)
sigmoid_deriv = (1 / (1 + np.exp(-z))) * (1 - (1 / (1 + np.exp(-z))))
relu_deriv = (z > 0).astype(float)

axes[0].plot(z, sigmoid_deriv, 'b-', linewidth=2, label='Sigmoid 导数')
axes[0].axhline(0.25, color='r', linestyle='--', alpha=0.5, label='最大值 = 0.25')
axes[0].set_title('Sigmoid 导数（最大值 0.25，导致梯度消失）')
axes[0].set_xlabel('z')
axes[0].set_ylabel('σ\'(z)')
axes[0].legend()
axes[0].grid(True, alpha=0.3)

# 各层梯度
layer_indices = range(1, len(sigmoid_grads) + 1)
axes[1].semilogy(layer_indices, sigmoid_grads, 'ro-', label='Sigmoid', linewidth=2)
axes[1].semilogy(layer_indices, relu_grads, 'bs-', label='ReLU', linewidth=2)
axes[1].set_title('各层梯度范数（10 层网络）')
axes[1].set_xlabel('层编号（1 = 最靠近输入）')
axes[1].set_ylabel('梯度范数（log scale）')
axes[1].legend()
axes[1].grid(True, alpha=0.3)

plt.tight_layout()
plt.savefig('gradient_vanishing.png', dpi=150)
plt.show()
print("\n梯度消失可视化已保存")

# ============================================================
# 4. 在真实数据上训练
# ============================================================
print("\n" + "=" * 70)
print("4. 在 Moons 数据集上训练")
print("=" * 70)

X_moons, y_moons = make_moons(n_samples=1000, noise=0.2, random_state=42)
X_tr, X_te, y_tr, y_te = train_test_split(X_moons, y_moons, test_size=0.2, random_state=42)

# 训练网络
nn = NeuralNetwork([2, 32, 16, 1], learning_rate=0.1)
y_tr_2d = y_tr.reshape(-1, 1)
losses = nn.train(X_tr, y_tr_2d, epochs=2000)

# 评估
y_pred = (nn.forward(X_te) > 0.5).astype(int).flatten()
print(f"\n测试集准确率: {accuracy_score(y_te, y_pred):.4f}")

# 可视化训练过程和决策边界
fig, axes = plt.subplots(1, 2, figsize=(14, 5))

# Loss 曲线
axes[0].plot(losses)
axes[0].set_title('训练 Loss')
axes[0].set_xlabel('Epoch')
axes[0].set_ylabel('Loss')
axes[0].grid(True, alpha=0.3)

# 决策边界
h = 0.05
x_min, x_max = X_moons[:, 0].min() - 1, X_moons[:, 0].max() + 1
y_min, y_max = X_moons[:, 1].min() - 1, X_moons[:, 1].max() + 1
xx, yy = np.meshgrid(np.arange(x_min, x_max, h), np.arange(y_min, y_max, h))
Z = (nn.forward(np.c_[xx.ravel(), yy.ravel()]) > 0.5).reshape(xx.shape)
axes[1].contourf(xx, yy, Z, alpha=0.3, cmap='coolwarm')
axes[1].scatter(X_te[:, 0], X_te[:, 1], c=y_te, cmap='coolwarm', edgecolors='k', s=20)
axes[1].set_title(f'决策边界 (测试准确率: {accuracy_score(y_te, y_pred):.3f})')

plt.tight_layout()
plt.savefig('backprop_training.png', dpi=150)
plt.show()
print("训练过程可视化已保存")

# ============================================================
# 5. 计算图手动演示
# ============================================================
print("\n" + "=" * 70)
print("5. 计算图手动演示")
print("=" * 70)

print("""
问题：f(w, b) = σ(w · x + b)，其中 x=3, w=2, b=1
求 ∂f/∂w 和 ∂f/∂b

计算图：

  w=2 ──→ [×] ──→ [+] ──→ [σ] ──→ f
            ↑       ↑
  x=3 ──→──┘  b=1 ─┘

第一步：前向传播
  a = w · x = 2 · 3 = 6
  z = a + b = 6 + 1 = 7
  f = σ(7) = 1/(1+e⁻⁷) ≈ 0.9991

第二步：反向传播
  初始梯度 = ∂f/∂f = 1

  Sigmoid 节点 [σ]：
    局部梯度 = σ(z)(1-σ(z)) = 0.9991 × 0.0009 ≈ 0.0009
    下游梯度 = 1 × 0.0009 = 0.0009  （传给 z）

  加法节点 [+]：
    ∂z/∂a = 1,  ∂z/∂b = 1
    下游梯度给 a = 0.0009 × 1 = 0.0009
    下游梯度给 b = 0.0009 × 1 = 0.0009

  乘法节点 [×]：
    ∂a/∂w = x = 3,  ∂a/∂x = w = 2
    下游梯度给 w = 0.0009 × 3 = 0.0027
    下游梯度给 x = 0.0009 × 2 = 0.0018

最终结果：
  ∂f/∂w = 0.0027
  ∂f/∂b = 0.0009
  
注意：由于 σ(7) ≈ 0.9991（接近饱和），梯度非常小。
这就是 Sigmoid 在极端输入下梯度消失的例子。
""")

# 用 PyTorch 验证（如果可用）
try:
    import torch
    w = torch.tensor([2.0], requires_grad=True)
    b = torch.tensor([1.0], requires_grad=True)
    x_val = 3.0
    f = torch.sigmoid(w * x_val + b)
    f.backward()
    print(f"PyTorch 验证:")
    print(f"  ∂f/∂w = {w.grad.item():.4f}")
    print(f"  ∂f/∂b = {b.grad.item():.4f}")
except ImportError:
    # 手动验证
    z = 2 * 3 + 1
    sig = 1 / (1 + np.exp(-z))
    dw = sig * (1 - sig) * 3
    db = sig * (1 - sig) * 1
    print(f"手动验证:")
    print(f"  ∂f/∂w = {dw:.4f}")
    print(f"  ∂f/∂b = {db:.4f}")

# ============================================================
# 6. 反向传播效率分析
# ============================================================
print("\n" + "=" * 70)
print("6. 反向传播效率分析")
print("=" * 70)

print("""
计算复杂度对比：

假设网络有 L 层，每层平均有 n 个神经元。

方法 1：数值梯度（有限差分）
  对每个参数 p，计算 (L(p+ε) - L(p-ε)) / (2ε)
  需要两次前向传播 × N 个参数 = O(N) 次前向传播
  对于有 100 万参数的网络：需要 200 万次前向传播

方法 2：反向传播
  1 次前向传播 + 1 次反向传播 ≈ 2-3 次前向传播的计算量
  不管有多少参数，都是固定次数

加速比：N / 3 ≈ 333,333 倍（对于 100 万参数的网络）

这就是为什么反向传播是深度学习的核心算法。
没有它，训练任何超过几千个参数的网络都是不可行的。
""")

# ============================================================
# 7. 关键概念总结
# ============================================================
print("=" * 70)
print("7. 反向传播关键概念总结")
print("=" * 70)

summary = """
╔════════════════════════════════════════════════════════════════════════╗
║                    反向传播关键概念                                    ║
╠════════════════════════════════════════════════════════════════════════╣
║                                                                      ║
║  核心规则：下游梯度 = 上游梯度 × 局部梯度                             ║
║                                                                      ║
║  前向传播：输入 → [线性变换] → [激活函数] → ... → 输出 → 损失        ║
║  反向传播：梯度 ← [×激活导数] ← [×权重转置] ← ... ← ∂L/∂输出       ║
║                                                                      ║
║  常见节点的局部梯度：                                                 ║
║  ├── 加法: 梯度原封不动传递 (×1)                                     ║
║  ├── 乘法: 梯度 × 另一个输入的值                                     ║
║  ├── ReLU: 正区间 ×1，负区间 ×0                                      ║
║  └── Sigmoid: ×σ(z)(1-σ(z))，最大值 0.25                            ║
║                                                                      ║
║  梯度消失的解法：                                                     ║
║  ├── ReLU（正区间导数为 1）                                           ║
║  ├── Batch Normalization（稳定每层输出分布）                          ║
║  ├── 残差连接（加法让梯度直接流过）                                   ║
║  └── 合适的权重初始化（Xavier/He）                                   ║
║                                                                      ║
║  梯度爆炸的解法：                                                     ║
║  ├── 梯度裁剪（限制梯度范数）                                        ║
║  └── 合适的权重初始化                                                 ║
║                                                                      ║
╚════════════════════════════════════════════════════════════════════════╝
"""
print(summary)
```

## 真实案例

### 案例 1：训练 ResNet 时的梯度流分析

在 ResNet 之前，训练 20 层以上的网络非常困难——更深的网络反而比浅层网络表现更差。这并不是过拟合（训练误差也更高），而是梯度消失导致深层参数几乎不更新。

何恺明在 ResNet 论文中做了一个关键实验：

**普通网络（20 层 vs 56 层）**：
- 20 层网络的训练误差比 56 层更低
- 56 层网络不是过拟合——它在训练集上的误差就比 20 层高
- 原因：梯度在传播到浅层时已经消失

**残差网络（20 层 vs 56 层）**：
- 56 层网络的训练误差比 20 层更低
- 残差连接让梯度可以直接通过加法路径传到任何层
- 每个残差块只需要学习"和恒等映射的差值"（residual），而不是完整的映射

### 案例 2：梯度裁剪在 Transformer 训练中的重要性

Transformer 模型（如 GPT、BERT）在训练初期经常遇到梯度爆炸问题。这是因为：

1. 自注意力机制涉及 softmax 操作，在未充分训练时可能产生极端的注意力权重
2. 多头注意力的梯度需要通过多个路径传播，某些路径可能放大梯度

标准的做法是使用梯度裁剪：

```python
# 在每个训练步骤中
loss.backward()
torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)
optimizer.step()
```

这确保了梯度的 L2 范数不超过 1.0。如果梯度范数超过这个值，所有梯度会被等比缩小到 1.0。

### 案例 3：LSTM 如何解决 RNN 的梯度消失

循环神经网络（RNN）在处理长序列时有严重的梯度消失问题——经过很多时间步后，梯度几乎为零，网络无法学习长距离依赖。

LSTM（Long Short-Term Memory）通过引入**门控机制**来解决这个问题：

- **遗忘门**：控制上一时刻的记忆有多少被保留
- **输入门**：控制新的信息有多少被写入记忆
- **输出门**：控制记忆有多少被输出

关键设计：记忆单元的更新使用的是**加法**而不是乘法：

$$
c_t = f_t \odot c_{t-1} + i_t \odot \tilde{c}_t
$$

反向传播时，加法操作让梯度可以直接流过（$\frac{\partial c_t}{\partial c_{t-1}} = f_t$），如果遗忘门接近 1，梯度几乎不衰减。这允许网络学习跨越数百个时间步的依赖关系。

## 权衡取舍以及何时不该使用

### 反向传播的局限

1. **内存消耗**：反向传播需要存储前向传播的所有中间值（激活值）。对于非常大的模型（如 GPT-3），这可能需要几十 GB 的 GPU 内存。Gradient Checkpointing 技术可以通过重新计算部分中间值来降低内存，但以增加计算时间为代价。

2. **只能计算梯度，不能保证找到全局最优**。梯度告诉你"最陡的下坡方向"，但可能把你带到局部最小值。不过实践中，高维空间的局部最小值通常不是大问题。

3. **不适用于离散操作**。反向传播要求计算图中的所有操作都是可微的。如果你的模型中有不可微的操作（如条件分支、离散采样），需要特殊的处理（如 REINFORCE、Gumbel-Softmax）。

### 何时不应该手动实现反向传播

几乎永远不应该。现代框架（PyTorch、TensorFlow、JAX）提供了高效的自动微分。手动实现反向传播只在以下情况有意义：

- 学习目的（理解原理）
- 自定义操作没有框架支持
- 需要极致的性能优化

## 关键要点

1. **反向传播就是链式法则在计算图上的高效应用**。核心规则只有一条：下游梯度 = 上游梯度 × 局部梯度。从输出开始反向逐层应用这条规则。

2. **反向传播的高效性在于避免重复计算**。通过反向遍历计算图，每个中间梯度只计算一次。计算量是前向传播的 2-3 倍，与参数数量无关。

3. **梯度消失是深层网络训练的最大障碍**。Sigmoid 的导数最大值只有 0.25，经过多层连乘后梯度趋近于零。ReLU（导数为 1）、BatchNorm（稳定分布）和残差连接（加法路径）是三大解法。

4. **现代框架通过自动微分隐藏了反向传播的细节**。你只需要定义前向传播，框架会自动构建计算图并计算梯度。但理解原理对于调试和设计新架构至关重要。

5. **梯度消失和爆炸是对称的问题**。消失是梯度太小（参数不更新），爆炸是梯度太大（参数更新太激进）。两者都源于梯度在多层间传递时的连乘效应。

## 延伸阅读

1. Rumelhart, D. E., Hinton, G. E., & Williams, R. J. (1986). "Learning representations by back-propagating errors." *Nature*, 323, 533-536. — 反向传播算法的经典论文

2. Olah, C. (2015). "Calculus on Computational Graphs: Backpropagation." [colah.github.io](https://colah.github.io/posts/2015-08-Backprop/) — 最清晰的反向传播教程

3. He, K., Zhang, X., Ren, S., & Sun, J. (2016). "Deep Residual Learning for Image Recognition." *CVPR*. — ResNet，通过残差连接解决梯度消失

4. Glorot, X., & Bengio, Y. (2010). "Understanding the difficulty of training deep feedforward neural networks." *AISTATS*. — Xavier 初始化

5. Paske, A., et al. (2019). "PyTorch: An Imperative Style, High-Performance Deep Learning Library." *NeurIPS*. — PyTorch 的自动微分实现

6. Baydin, A. G., Pearlmutter, B. A., Radul, A. A., & Siskind, J. M. (2018). "Automatic differentiation in machine learning: a survey." *JMLR*. — 自动微分的全面综述
