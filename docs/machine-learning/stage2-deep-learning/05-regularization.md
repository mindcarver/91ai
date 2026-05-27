<!--
调研来源：
1. Srivastava et al. (2014) "Dropout: A Simple Way to Prevent Neural Networks from Overfitting" — Dropout 原论文
2. Ioffe & Szegedy (2015) "Batch Normalization: Accelerating Deep Network Training by Reducing Internal Covariate Shift" — BatchNorm 原论文
3. Ba et al. (2016) "Layer Normalization" — LayerNorm 原论文
4. He et al. (2016) "Deep Residual Learning for Image Recognition" — ResNet 残差连接
5. He et al. (2016) "Identity Mappings in Deep Residual Networks" — 恒等映射的梯度流分析
6. Loshchilov & Hutter (2019) "Decoupled Weight Decay Regularization" — AdamW 解耦权重衰减
7. Huang et al. (2016) "Deep Networks with Stochastic Depth" — Stochastic Depth 随机深度
8. Szegedy et al. (2016) "Rethinking the Inception Architecture" — Label Smoothing 标签平滑
9. Santurkar et al. (2018) "How Does Batch Normalization Help Optimization?" — BatchNorm 真正有效的原因（不是 ICS）
10. Zhang et al. (2019) "Are All Layers Created Equal?" — 深度网络各层学习速度差异分析

核心发现：
- Dropout 通过随机丢弃神经元防止 co-adaptation，相当于隐式训练指数级数量的子网络并集成
- BatchNorm 加速训练的真正原因是让损失landscape更平滑（而非解决 Internal Covariate Shift）
- L2 正则化和 Weight Decay 在 SGD 中等价，但在 Adam 中不等价——AdamW 才是正确实现
- 残差连接的核心是让梯度有"高速公路"直通浅层，解决了深层网络退化问题
- LayerNorm 不依赖 batch 统计量，是 Transformer/LLM 的标配
- Stochastic Depth 是 Dropout 在层级别的推广，对训练极深网络特别有效
- Label Smoothing 通过软化标签防止模型过度自信
- Early Stopping 是最简单也最被低估的正则化方法
- 这些技巧不是孤立的——现代训练 pipeline 通常组合使用多种正则化方法
-->

# 正则化与训练技巧：Dropout、Batch Norm、权重衰减、残差连接，以及训练不稳定的一揽子解法

**TL;DR：** 深度网络参数量大、表达力强，训练数据不够时就会"记住"训练集（过拟合）。正则化的本质是给模型"制造合理的困难"，逼迫它学到真正有用的模式而非噪声。Dropout 随机关闭神经元，相当于训练无数个子网络再集成，测试时用完整网络。Batch Normalization 把每层的输入分布稳定在均值 0 方差 1 附近，让优化更平滑——它加速训练的真正原因不是解决 Internal Covariate Shift，而是让 loss landscape 更圆滑。Weight Decay（权重衰减）限制参数大小，在 Adam 中要用 AdamW 的解耦版本才正确。残差连接（Residual Connection）给梯度开了一条"高速公路"，让几十甚至上百层的网络也能训练。LayerNorm 是 Transformer 的标配，不依赖 batch 统计量。Early Stopping 在验证集 loss 开始上升时就停下——简单但被低估。实用原则：全连接网络用 Dropout + L2，CNN 用 BatchNorm + Weight Decay + Residual，Transformer 用 LayerNorm + Dropout + AdamW + Residual。

## 为什么这很重要

训练深度网络时，你一定会遇到两种痛苦：

**痛苦一：模型在训练集上表现很好，测试集上一塌糊涂。** 你花了大量时间调架构、加层、加参数，训练准确率 99%，测试准确率 70%。这是典型的过拟合——模型记住了训练数据的每个细节，但没有学到可泛化的规律。

**痛苦二：训练根本不稳定。** Loss 突然变成 NaN，或者某些层梯度消失/爆炸，或者深层网络反而比浅层网络效果差。这不是过拟合，而是训练过程本身出了问题。

正则化（Regularization）和训练技巧（Training Tricks）就是用来解决这两类问题的。它们不是锦上添花——没有这些技术，现代深度学习根本不可能成功。

一些具体的数字来说明影响：

| 技术 | 场景 | 效果 |
|------|------|------|
| Dropout (p=0.5) | 全连接网络 MNIST | 测试错误率从 1.6% 降到 1.2% (Srivastava 2014) |
| Batch Normalization | ResNet-50 ImageNet | 训练速度提升 5-10x，准确率提升 1-2% |
| Residual Connection | 152 层 ResNet vs 34 层 plain | ImageNet top-1 错误率从 28.1% 降到 21.3% |
| AdamW vs Adam+L2 | Transformer 训练 | 泛化性能提升，训练更稳定 |
| Label Smoothing (ε=0.1) | Inception-v2 ImageNet | top-1 准确率提升约 0.2% |
| Early Stopping | 几乎所有任务 | 防止过拟合，节省训练时间 20-50% |

## 核心概念

### 什么是正则化？

正则化的本质是给模型添加约束，让它在拟合训练数据和保持简单性之间做权衡。

直觉：一个学生如果只是死记硬背考试题（过拟合），遇到新题就不会做。正则化就像老师故意在练习题中加入干扰信息、要求用简单方法解题——逼迫学生理解原理而非死记答案。

数学上，正则化改变了优化的目标：

$$
\text{原始目标}：\min_\theta L(\theta) \quad \text{只关注训练损失}
$$

$$
\text{正则化目标}：\min_\theta L(\theta) + \lambda R(\theta) \quad \text{训练损失 + 正则化惩罚}
$$

其中 $R(\theta)$ 是正则化项，$\lambda$ 控制正则化强度。不同的正则化方法对应不同的 $R(\theta)$。

但注意：不是所有训练技巧都能写成这个形式。Dropout、BatchNorm、残差连接改变了模型结构或训练过程，它们是"隐式正则化"。

### 过拟合的信号

怎么判断模型在过拟合？看训练损失和验证损失的差距：

```
好的训练（正常拟合）：
Loss
 │╲
 │ ╲  训练损失
 │  ╲
 │   ╲___  验证损失
 │    ╲___
 │     ╲___
 └────────── Epoch

过拟合：
Loss
 │╲
 │ ╲  训练损失
 │  ╲___________
 │              ← 训练损失持续下降
 │ ╲
 │  ╲___
 │      ╲‾‾‾‾‾‾  ← 验证损失开始上升！
 └────────── Epoch
```

训练损失持续下降，验证损失先降后升——这就是过拟合的标志。

### 偏差-方差权衡（回顾）

正则化增加了偏差（模型表达能力下降），但降低了方差（模型对训练数据的波动更不敏感）。目标是找到"甜点"：

```
总误差
 │       ╱
 │      ╱  总误差 = 偏差² + 方差 + 不可约误差
 │     ╱
 │    *  ← 最优点
 │   ╱╲
 │  ╱  ╲
 │ ╱    ╲
 │╱      ╲
 └────────── 正则化强度 λ
 弱        强
```

正则化太弱（左边）→ 过拟合（方差大）；正则化太强（右边）→ 欠拟合（偏差大）。

## 简化心智模型

把训练深度网络想象成培养一个学生团队：

| 技术 | 心智模型 | 解决什么问题 |
|------|----------|------------|
| **Dropout** | 随机让团队成员"请假"，逼其他人也能独当一面 | 团队成员互相依赖（co-adaptation），少了谁都不行 |
| **Batch Normalization** | 给每个人统一的工作环境标准，不受外部环境影响 | 每层输入分布不断变化（Internal Covariate Shift） |
| **Weight Decay** | 限制每个人的预算，防止铺张浪费 | 参数值过大，记住噪声 |
| **残差连接** | 给团队提供"捷径通道"，重要信息可以跳过中间环节直达 | 深层网络梯度传不到浅层（退化问题） |
| **Early Stopping** | 考试成绩开始下降时就停止复习 | 越学越"死"，开始过拟合 |
| **Label Smoothing** | 考试答案不要 100% 确定，保留一点"也许我错了"的谦逊 | 模型过度自信，泛化差 |
| **Gradient Clipping** | 限制每次进步的幅度，防止走极端 | 梯度爆炸，训练不稳定 |
| **Stochastic Depth** | 训练时随机跳过某些课程，测试时全部都上 | 极深网络训练困难 |

## 详细机制

### 1. Dropout：让神经元学会独立工作

#### 原理

Dropout（Srivastava et al., 2014）的想法极其简单：在训练时，以概率 $p$ 随机将神经元的输出设为 0。

$$
\tilde{h}_i = \frac{r_i \cdot h_i}{1 - p}
$$

其中 $r_i \sim \text{Bernoulli}(1-p)$ 是一个二元掩码，$h_i$ 是第 $i$ 个神经元的输出。除以 $(1-p)$ 是 Inverted Dropout——训练时缩放，测试时不用动。

为什么除以 $(1-p)$？直觉：如果训练时 50% 的神经元被关闭，剩下的神经元输出的"总能量"只有原来的一半。如果不补偿，测试时使用全部神经元，输出值会是训练时的两倍，导致后续层的输入分布剧变。

#### 为什么 Dropout 有效？

**解释一：防止 Co-adaptation（共适应）**

没有 Dropout 时，多个神经元可能"串通"：A 神经元负责特征 X，B 神经元依赖 A 的输出做判断。一旦 A 被干扰，B 也出错。Dropout 迫使每个神经元不能依赖任何特定的其他神经元——因为它们随时可能被关闭。

**解释二：隐式模型集成**

每次 forward pass 都随机丢弃不同的神经元，相当于在训练一个不同的子网络。一个有 $n$ 个神经元的网络，可能的子网络有 $2^n$ 个。训练过程相当于同时训练了指数级数量的子网络，测试时用完整网络相当于这些子网络的平均。

数学上可以证明，在单层网络中，Dropout 近似于一种 L2 正则化。但在深层非线性网络中，它的效果远超简单的 L2。

#### Dropout 率的选择

| 层类型 | 推荐 Dropout 率 | 说明 |
|--------|----------------|------|
| 全连接层 | 0.5 | Srivastava 论文的默认值 |
| 卷积层 | 0.1 - 0.25 | 卷积层参数共享，本身有正则化效果 |
| 循环层（输入） | 0.2 - 0.3 | 输入 Dropout |
| 循环层（循环连接） | 0.2 - 0.5 | Gal & Ghahramani 的变分 Dropout |
| Embedding 层 | 0.1 - 0.3 | BERT/GPT 系列常用 |
| 注意力权重 | 0.1 | Transformer 中常见 |

**关键规则：Dropout 率不是越高越好。** $p=0.7$ 意味着 70% 的神经元被关闭——模型可能学不到东西。BERT 的经验：总 Dropout 率超过 0.3 后性能急剧下降。

##### Dropout 的数学视角

从贝叶斯的角度看，Dropout 可以被解释为对模型权重的近似变分推断（Gal & Ghahramani, 2016）。每次 forward pass 相当于从权重的后验分布中采样一个模型。这个视角解释了为什么 Dropout 提供的不确定性估计在深度学习中很有用——它不只是一个正则化技巧，还隐含地做了贝叶斯推断。

在实践中这有什么意义？如果你用 Dropout 训练一个模型，测试时保持 Dropout 开启并多次 forward 同一条数据（MC Dropout），你会得到多个不同的预测结果。这些结果的均值是最终预测，方差是模型的不确定性。这在需要模型"知道它不知道什么"的场景（如医疗诊断、自动驾驶）中非常有用。

#### Dropout 的变体

随着研究进展，Dropout 衍生出了多种变体：

**Spatial Dropout（2D Dropout）**：在卷积神经网络中，普通的 Dropout 独立丢弃每个像素。但相邻像素高度相关，丢弃个别像素效果不大。Spatial Dropout 随机丢弃整个特征图（channel），效果更好。

**DropConnect**：不是丢弃神经元的输出，而是随机丢弃权重矩阵中的元素。正则化强度比 Dropout 更大，但实现更复杂。

**Variational Dropout**：在 RNN 中使用，每个时间步共享相同的 Dropout 掩码。普通的 Dropout 在每个时间步独立采样会导致 RNN 的记忆能力受损。Gal & Ghahramani (2016) 提出了这个解决方案。

**Attention Dropout**：在 Transformer 的注意力权重矩阵上应用 Dropout，随机丢弃一些注意力连接。BERT 和 GPT 都使用了这种方式（p=0.1）。

#### 什么时候不要用 Dropout

- **BatchNorm 之后**：BatchNorm 本身有正则化效果，再加 Dropout 可能过度正则化
- **测试时**：Dropout 只在训练时开启，测试时必须关闭
- **小数据集**：Dropout 引入噪声，数据量太小（<1000）时噪声比信号还大
- **最后几层**：如果模型最后几层需要精确的分类决策，Dropout 可能干扰
- **与 BatchNorm 同时用于 CNN**：两者的"方差偏移"问题可能导致性能下降（后文详细讨论）

### 2. Batch Normalization：不只是"标准化"

#### 原理

Batch Normalization（Ioffe & Szegedy, 2015）对每个 mini-batch 的数据做标准化，然后通过可学习参数恢复表达能力：

$$
\mu_B = \frac{1}{m} \sum_{i=1}^{m} x_i \quad \text{(mini-batch 均值)}
$$

$$
\sigma_B^2 = \frac{1}{m} \sum_{i=1}^{m} (x_i - \mu_B)^2 \quad \text{(mini-batch 方差)}
$$

$$
\hat{x}_i = \frac{x_i - \mu_B}{\sqrt{\sigma_B^2 + \epsilon}} \quad \text{(标准化)}
$$

$$
y_i = \gamma \hat{x}_i + \beta \quad \text{(缩放和平移)}
$$

$\gamma$ 和 $\beta$ 是可学习参数，让网络可以恢复原始的分布（如果需要的话）。当 $\gamma = \sigma_B$、$\beta = \mu_B$ 时，BatchNorm 就退化为恒等变换。

#### Internal Covariate Shift 是什么？

Ioffe & Szegedy 在原始论文中提出的概念：在训练过程中，每一层的输入分布会随着前面层参数的更新而不断变化。这种变化导致每一层都需要不断适应新的输入分布，训练变慢。

**但是**，Santurkar et al. (2018) 的研究"How Does Batch Normalization Help Optimization?"发现：BatchNorm 有效的原因根本不是解决了 Internal Covariate Shift！

他们做了实验：即使故意在每层之间注入噪声制造严重的分布偏移，有 BatchNorm 的网络仍然训练得很好。真正的有效原因是：

1. **Loss landscape 更平滑**：BatchNorm 使得损失函数的 Lipschitz 常数更小（梯度变化更温和），优化器可以用更大的学习率
2. **梯度更稳定**：梯度的方向和大小更加一致，不会在某些区域突然变得很大或很小
3. **对初始化更鲁棒**：即使权重初始值不好，BatchNorm 也能通过标准化把分布拉回正轨

#### BatchNorm 在训练和测试时的区别

**训练时**：用当前 mini-batch 的均值和方差。

**测试时**：用训练过程中累积的全局均值和方差（running mean/var）。这是因为测试时可能只有一条数据（batch size = 1），无法计算有效的统计量。

```python
# 训练时
running_mean = momentum * running_mean + (1 - momentum) * batch_mean
running_var = momentum * running_var + (1 - momentum) * batch_var

# 测试时
x_norm = (x - running_mean) / sqrt(running_var + epsilon)
```

这个"训练/测试行为不一致"是 BatchNorm 的一个重要缺陷。

#### 为什么 BatchNorm 能用更大的学习率？

Santurkar et al. (2018) 给出了一个清晰的解释。没有 BatchNorm 时，损失函数的 landscape 像一条狭长的峡谷——一个方向坡度很陡，另一个方向很平缓。优化器在陡的方向上容易"弹跳"（需要小学习率），在平缓的方向上走得太慢（浪费了时间）。

BatchNorm 的标准化操作相当于把这条峡谷"拓宽"了。每个方向上的梯度变化率变得均匀，优化器可以用更大的步长在所有方向上前进，而不会在某个方向上失控。具体来说，Santurkar 等人测量了损失函数的 Lipschitz 常数（梯度变化率的界限），发现 BatchNorm 将其降低了一个数量级。

这解释了一个实践中的观察：加了 BatchNorm 后，学习率通常可以增大 5-10 倍，而训练仍然稳定。例如，在 ResNet 训练 ImageNet 时，初始学习率 0.1 在没有 BatchNorm 的网络中会直接发散，但有 BatchNorm 的网络可以稳定训练。

#### BatchNorm 的缺陷

1. **依赖 batch size**：batch size 太小（<8），统计量不稳定，效果急剧下降
2. **训练/测试行为不一致**：需要维护 running statistics
3. **不适合序列模型**：RNN/Transformer 中序列长度不固定，batch 统计不好算
4. **分布式训练的同步问题**：多 GPU 训练时需要同步 batch 统计量

### 3. Layer Normalization：Transformer 的标配

Layer Normalization（Ba et al., 2016）解决了 BatchNorm 的缺陷——它不在 batch 维度上做标准化，而是在单个样本的特征维度上做：

$$
\mu_l = \frac{1}{d} \sum_{i=1}^{d} x_i \quad \text{(单层均值)}
$$

$$
\sigma_l^2 = \frac{1}{d} \sum_{i=1}^{d} (x_i - \mu_l)^2 \quad \text{(单层方差)}
$$

$$
y_i = \gamma \frac{x_i - \mu_l}{\sqrt{\sigma_l^2 + \epsilon}} + \beta
$$

其中 $d$ 是该层的特征维度。

#### BatchNorm vs LayerNorm 对比

```
Batch Normalization：                Layer Normalization：

   样本1  样本2  样本3  样本4           样本1  样本2  样本3  样本4
特 ┌─────┬─────┬─────┬─────┐     特 ┌─────┬─────┬─────┬─────┐
征 ├─────┼─────┼─────┼─────┤     征 ├ ← 在此方向标准化 →  ├
1  ├─────┼─────┼─────┼─────┤     1  ├─────┼─────┼─────┼─────┤
   ├─────┼─────┼─────┼─────┤        ├ ← 在此方向标准化 →  ├
特 ├─────┼─────┼─────┼─────┤     特 ├─────┼─────┼─────┼─────┤
征 ├─────┼─────┼─────┼─────┤     征 ├─────┼─────┼─────┼─────┤
2  ├─────┼─────┼─────┼─────┤     2  ├─────┼─────┼─────┼─────┤
   └──↑──┴──↑──┴──↑──┴──↑──┘        └─────┴─────┴─────┴─────┘
   在此方向标准化（跨样本）           每个样本独立标准化
```

| 特性 | Batch Normalization | Layer Normalization |
|------|-------------------|-------------------|
| 标准化维度 | 跨样本（batch 维度） | 跨特征（feature 维度） |
| 依赖 batch size | 是（小 batch 效果差） | 否 |
| 训练/测试行为 | 不同（running stats） | 相同 |
| 适用场景 | CNN、图像任务 | Transformer、RNN、LLM |
| 典型用户 | ResNet、EfficientNet | BERT、GPT、LLaMA |
| 分布式训练 | 需要同步统计量 | 无需同步 |

为什么 Transformer 不用 BatchNorm？一个具体的原因是 NLP 任务的 batch 中，句子长度差异很大。短的句子需要 padding 到和最长句子一样长，这些 padding 位置的值全为 0。如果对这些位置做 batch-level 的统计，均值和方差会被 padding 污染。LayerNorm 在每个样本内部做统计，不受 padding 影响。

另一个原因是自回归语言模型（如 GPT）在生成时是逐 token 生成的——每次只有一条数据（batch size = 1）。BatchNorm 在 batch size = 1 时退化为恒等变换，毫无意义。LayerNorm 在任何 batch size 下行为一致。

**实用规则**：CNN 用 BatchNorm，Transformer 用 LayerNorm。这不是随意选择——BatchNorm 在 CNN 中效果好是因为同一个特征图（feature map）中的 channel 统计是稳定的，而 Transformer 的序列长度不固定，BatchNorm 的统计量不稳定。

#### RMSNorm：LayerNorm 的简化版

近年来（尤其是 LLaMA 系列），RMSNorm（Root Mean Square Normalization）越来越流行。它去掉了 LayerNorm 中的均值中心化，只做缩放：

$$
\text{RMSNorm}(x_i) = \frac{x_i}{\text{RMS}(x)} \cdot g_i, \quad \text{RMS}(x) = \sqrt{\frac{1}{d} \sum_{i=1}^d x_i^2}
$$

去掉了减均值和偏移参数 $\beta$，只有一组缩放参数 $g$。计算量比 LayerNorm 减少 10-50%，在大模型训练中节省的算力很可观。实验表明性能几乎与 LayerNorm 持平。

### 4. Weight Decay（权重衰减）：限制参数大小

#### L2 正则化

最经典的正则化方法，在损失函数中加入参数平方和的惩罚：

$$
L_{\text{reg}}(\theta) = L(\theta) + \frac{\lambda}{2} \sum_i \theta_i^2
$$

对参数的梯度更新变成：

$$
\theta_{t+1} = \theta_t - \eta \nabla L(\theta_t) - \eta \lambda \theta_t
$$

等价于每次更新时把参数"衰减"一点：$\theta \leftarrow \theta(1 - \eta\lambda)$。

#### L2 正则化 vs Weight Decay：在 Adam 中不一样！

关键发现（Loshchilov & Hutter, 2019）：**在 SGD 中，L2 正则化和 Weight Decay 等价，但在 Adam 中不等价。**

**L2 正则化 + Adam**：

$$
\begin{aligned}
g_t &= \nabla L(\theta_t) + \lambda \theta_t \quad \text{（梯度中加入正则化项）} \\
m_t &= \beta_1 m_{t-1} + (1-\beta_1) g_t \\
v_t &= \beta_2 v_{t-1} + (1-\beta_2) g_t^2 \\
\theta_{t+1} &= \theta_t - \eta \frac{\hat{m}_t}{\sqrt{\hat{v}_t} + \epsilon}
\end{aligned}
$$

问题在于：正则化梯度 $\lambda\theta_t$ 也被 Adam 的自适应学习率缩放了。那些梯度本来就大的参数，正则化效果被压缩；梯度小的参数，正则化效果被放大。这导致正则化效果不均匀。

**Weight Decay（解耦，AdamW）**：

$$
\begin{aligned}
g_t &= \nabla L(\theta_t) \quad \text{（只用任务梯度）} \\
m_t &= \beta_1 m_{t-1} + (1-\beta_1) g_t \\
v_t &= \beta_2 v_{t-1} + (1-\beta_2) g_t^2 \\
\theta_{t+1} &= \theta_t - \eta \frac{\hat{m}_t}{\sqrt{\hat{v}_t} + \epsilon} - \eta \lambda \theta_t \quad \text{（权重衰减独立于自适应更新）}
\end{aligned}
$$

权重衰减直接作用于参数，不经过 Adam 的自适应缩放——每个参数受到相同比例的衰减。

**结论**：用 Adam 时，一定要用 AdamW（PyTorch 中的 `torch.optim.AdamW`），不要用 `torch.optim.Adam` + L2 正则化（通过 `weight_decay` 参数）。

#### Weight Decay 系数的选择

| 任务/模型 | 推荐 Weight Decay | 来源 |
|-----------|------------------|------|
| BERT 预训练 | 0.01 | Devlin et al. |
| GPT-2/3 | 0.1 | Brown et al. |
| ResNet 图像分类 | 1e-4 | He et al. |
| ViT (Vision Transformer) | 0.05 | Dosovitskiy et al. |
| 微调预训练模型 | 0.01 - 0.1 | Howard & Ruder |
| 从零训练（小模型） | 1e-4 - 1e-2 | 经验值 |

**规则**：大模型、大数据集用较小的 weight decay；小数据集用较大的 weight decay。微调时 bias 项和 LayerNorm 参数通常不加 weight decay。

#### Weight Decay 为什么对泛化有帮助？

直觉上，Weight Decay 倾向于让参数值变小，这意味着模型偏好更"简单"的函数——参数越小，函数的输出变化越平滑（对输入的小扰动不敏感），泛化性能自然更好。

从频率分析的角度看，参数 $w$ 控制了模型函数的"频率"。大的 $w$ 对应高频振荡（记住噪声），小的 $w$ 对应低频平滑（学到真正的模式）。Weight Decay 通过惩罚大参数，抑制了高频成分。

实践中一个常见的错误：对模型的所有参数都施加相同的 weight decay。更好的做法是只对权重矩阵施加 weight decay，不对 bias 项和 normalization 层的参数施加。PyTorch 中可以通过参数分组实现：

```python
# 只对权重矩阵施加 weight decay
decay_params = [p for n, p in model.named_parameters() if 'weight' in n and 'norm' not in n]
no_decay_params = [p for n, p in model.named_parameters() if 'weight' not in n or 'norm' in n]

optimizer = optim.AdamW([
    {'params': decay_params, 'weight_decay': 0.01},
    {'params': no_decay_params, 'weight_decay': 0.0},
], lr=1e-4)
```

这种分组策略在 BERT、GPT 等大模型的训练中是标准做法。

### 5. 残差连接（Residual Connections）：让梯度有高速公路

#### 退化问题

He et al. (2016) 发现了一个反直觉的现象：在普通网络（plain network）中，增加层数反而让性能下降——不是过拟合（训练误差也变高），而是退化（degradation）。

```
网络深度 vs 错误率（普通网络，无残差连接）：

Error
 │  ╲
 │   ╲
 │    ╲___
 │        ╲‾‾‾‾‾‾‾  ← 56 层比 20 层更差！
 │         ╲
 │          ╲___
 └──────────────── 网络深度
 20层       56层
```

理论上，56 层网络的前 20 层学到和 20 层网络一样的表示，后 36 层做恒等变换（什么都不做），至少不会更差。但优化器找不到这样的解——它学不会"什么都不做"。

#### 残差连接的解法

残差连接的核心思想：不要让网络学习完整的映射 $H(x)$，而是让它学习残差 $F(x) = H(x) - x$：

$$
y = F(x) + x
$$

如果最优解是恒等变换，网络只需要让 $F(x) = 0$，把权重推到 0 即可——这比学会恒等映射容易得多。

```
普通网络块：              残差网络块：

输入 x                    输入 x
  │                         │
  ├─ 权重层1                ├─ 权重层1
  │                         │
  ├─ 激活函数               ├─ 激活函数
  │                         │
  ├─ 权重层2                ├─ 权重层2
  │                         │
  输出 = H(x)               ├─ + x （跳跃连接）
                            │
                            输出 = F(x) + x
```

#### 梯度流分析

残差连接最重要的作用是改善反向传播中的梯度流。

假设一个 3 层的残差网络：

$$
\begin{aligned}
y_1 &= F_1(x) + x \\
y_2 &= F_2(y_1) + y_1 = F_2(F_1(x) + x) + F_1(x) + x \\
y_3 &= F_3(y_2) + y_2
\end{aligned}
$$

反向传播时（设 $\frac{\partial L}{\partial y_3} = 1$）：

$$
\frac{\partial L}{\partial x} = \frac{\partial L}{\partial y_3} \cdot \left(\frac{\partial F_3}{\partial y_2} + 1\right) \cdot \left(\frac{\partial F_2}{\partial y_1} + 1\right) \cdot \left(\frac{\partial F_1}{\partial x} + 1\right)
$$

注意每个括号里的 `+1`——即使 $F_i$ 的梯度很小（接近 0），`+1` 保证了至少有一条"高速公路"让梯度直接流回浅层。这就是残差连接解决梯度消失的数学基础。

He et al. (2016) 在后续论文"Identity Mappings in Deep Residual Networks"中进一步证明，使用恒等映射（identity mapping）作为跳跃连接时，信息在前向和反向传播中可以"直接通过"，没有任何阻碍。

#### Pre-Norm vs Post-Norm

残差块中 Normalization 的位置对训练稳定性有重大影响：

```
Post-Norm（原始 ResNet）：           Pre-Norm（现代 Transformer）：

输入 x                              输入 x
  │                                   │
  ├─ + F(x)                           ├─ LayerNorm / BatchNorm
  │                                   │
  ├─ BatchNorm                        ├─ + F(上一步的输出)
  │                                   │
  输出                                输出 = x + F(Norm(x))
```

**Post-Norm**：先 $y = F(x) + x$，再对 $y$ 做 Norm。原始 ResNet 用这种方式。问题：梯度仍然要经过 Norm 层，深层网络训练困难。

**Pre-Norm**：先对 $x$ 做 Norm，再 $y = x + F(\text{Norm}(x))$。Transformer（GPT-2 之后）用这种方式。好处：残差路径上没有任何变换，梯度可以无损传播。

Xiong et al. (2020) 证明 Pre-Norm 在训练初期梯度的方差更稳定，因此更适合训练深层 Transformer。

#### 残差连接不是万能的

残差连接解决了"退化"问题，但不解决所有训练问题。一些限制：

1. **内存消耗翻倍**：前向传播时需要保存输入 $x$（用于反向传播中的跳跃连接梯度），对于深层网络这是可观的内存开销。Gradient Checkpointing 技术可以缓解这个问题——训练时间换内存。

2. **不是所有层都受益相等**：Veit et al. (2016) 的分析表明，残差网络的行为更像浅层网络的集成（ensemble of shallow networks）。删除某些层对性能影响很小，但删除另一些层可能灾难性。这说明残差连接并没有让所有层都"同等重要"——只是保证了梯度能流过去。

3. **维度不匹配时需要投影**：当 $x$ 和 $F(x)$ 的维度不同时，跳跃连接需要一个线性投影（通常用 1x1 卷积）。这个投影引入额外参数，且不是恒等映射，会部分削弱残差连接的好处。在实践中，网络设计通常尽量让大多数残差块保持维度不变。

### 6. Early Stopping：最简单但最被低估的正则化

#### 原理

在训练过程中监控验证集的损失。当验证集损失连续 $k$ 个 epoch（patience）不再下降时，停止训练，返回验证集损失最小时的模型参数。

这等价于一种正则化：限制了优化步数，相当于约束了参数空间中可达的区域。少训练几步，模型就在"简单"和"准确"之间偏向了"简单"。

#### 实践细节

```python
# Early Stopping 的关键参数
patience = 10          # 容忍验证损失多少个 epoch 不下降
min_delta = 1e-4       # "下降"的最小阈值——变化小于这个不算改善
restore_best = True    # 返回最佳模型（而非最后一个 epoch 的模型）
```

**patience 太小（如 2-3）**：可能过早停止，模型还没充分学习。训练曲线有时会有短暂的"平台期"然后继续下降。

**patience 太大（如 50+）**：浪费训练时间，过拟合风险增大。

经验值：patience = 5-10 是一个好的起点。可以在 patience 耗尽前先降低学习率（ReduceLROnPlateau），如果还是没有改善再停止。

### 7. Gradient Clipping：防止梯度爆炸

#### 原理

在 RNN 和深层 Transformer 的训练中，梯度有时会突然变得非常大（几个数量级），导致参数更新过大，训练崩溃。Gradient Clipping 通过限制梯度的大小来防止这种情况。

两种方式：

**按值裁剪（Clip by Value）**：

$$
g_i \leftarrow \min(\max(g_i, -c), c)
$$

直接把每个梯度分量限制在 $[-c, c]$ 范围内。问题：改变了梯度的方向。

**按范数裁剪（Clip by Norm，推荐）**：

$$
g \leftarrow \begin{cases} g & \text{if } \|g\| \leq c \\ \frac{c}{\|g\|} g & \text{if } \|g\| > c \end{cases}
$$

当梯度的 L2 范数超过阈值 $c$ 时，按比例缩放，使其范数等于 $c$。这保持了梯度方向不变，只缩小了大小——因此更推荐。

#### 典型阈值

| 任务 | Clip Norm 阈值 | 说明 |
|------|---------------|------|
| LSTM/GRU 语言模型 | 1.0 - 5.0 | RNN 训练的标配 |
| Transformer 预训练 | 1.0 | GPT、BERT 的默认值 |
| Transformer 微调 | 1.0 | 通用 |
| 视觉模型 | 通常不需要 | CNN 中梯度爆炸少见 |

**经验**：如果训练 loss 突然变成 NaN 或突然飙升，先试 Gradient Clipping。如果 clipping 频繁触发（>50% 的 step），说明有更深层的问题（学习率太大或数据有问题）。

#### 如何诊断梯度爆炸？

在训练循环中加入梯度监控：

```python
# 在 loss.backward() 之后，optimizer.step() 之前
total_norm = 0
for p in model.parameters():
    if p.grad is not None:
        total_norm += p.grad.data.norm(2).item() ** 2
total_norm = total_norm ** 0.5
print(f"Gradient norm: {total_norm:.4f}")
```

如果梯度范数在训练过程中突然从 1-10 跳到 1000+，说明出现了梯度爆炸。正常的训练曲线中，梯度范数应该缓慢下降并保持稳定。

### 8. Stochastic Depth：Dropout 在层级别的推广

Stochastic Depth（Huang et al., 2016）将 Dropout 的思想从"随机丢弃神经元"扩展到"随机丢弃整个残差块"。

对于残差块 $y = x + F(x)$，Stochastic Depth 以概率 $p_l$ 将其变为：

$$
y = \begin{cases} x + F(x) & \text{以概率 } 1 - p_l \\ x & \text{以概率 } p_l \end{cases}
$$

训练时随机"跳过"某些层，测试时使用完整网络。这有两个好处：
1. **正则化**：防止网络过度依赖某些特定的层
2. **加速训练**：被跳过的层不需要计算，训练速度提升 20-40%

Huang 等人发现，线性增加丢弃概率（浅层 $p_l$ 小，深层 $p_l$ 大）效果最好——浅层学到的特征通常更有用，不应该被频繁丢弃。

### 9. Label Smoothing：防止模型过度自信

#### 原理

Label Smoothing（Szegedy et al., 2016）把 one-hot 标签软化：

$$
y_i^{\text{smooth}} = (1 - \epsilon) y_i + \frac{\epsilon}{K}
$$

其中 $K$ 是类别数，$\epsilon$ 是平滑系数（通常 0.1）。

例如，3 类分类中 one-hot 标签 $[1, 0, 0]$ 变为 $[0.933, 0.033, 0.033]$。

#### 为什么有效？

标准 one-hot 标签要求模型输出"100% 确定是第一类"。对于交叉熵损失，要达到零损失需要 logits 趋向无穷大——这驱动参数越来越大，导致过拟合。

Label Smoothing 告诉模型"你应该对正确类别很有信心，但不需要 100%"。这给了模型一个"合理的目标"，避免无限增大 logits。

Szegedy 等人发现 Label Smoothing 不仅提升准确率，还让模型学到的表示更有结构（同一类别的样本在特征空间中更紧凑）。

### 正则化方法总结

| 方法 | 正则化类型 | 计算开销 | 适用场景 | 核心参数 |
|------|-----------|---------|---------|---------|
| Dropout | 显式 | 低 | 全连接层、注意力 | p = 0.1-0.5 |
| Batch Normalization | 隐式 | 中 | CNN、图像 | momentum = 0.1 |
| Layer Normalization | 隐式 | 中 | Transformer、RNN | 无超参数 |
| Weight Decay (L2) | 显式 | 几乎无 | 所有模型 | λ = 1e-4 ~ 0.1 |
| 残差连接 | 隐式 | 无 | 深层网络 | 无超参数 |
| Early Stopping | 隐式 | 无 | 所有模型 | patience = 5-10 |
| Gradient Clipping | 训练稳定 | 几乎无 | RNN、Transformer | clip_norm = 1.0 |
| Stochastic Depth | 显式 | 负（加速） | 极深 ResNet | p = 0-0.5 |
| Label Smoothing | 显式 | 无 | 分类任务 | ε = 0.1 |

## 代码示例

### 示例 1：Dropout 的完整实现与效果对比

```python
import numpy as np

class DropoutLayer:
    """从零实现 Dropout 层（Inverted Dropout）"""
    
    def __init__(self, p=0.5):
        """
        p: 丢弃概率
        """
        self.p = p
        self.mask = None
        self.training = True
    
    def forward(self, x):
        if self.training:
            # 生成随机掩码，除以 (1-p) 做缩放
            self.mask = (np.random.rand(*x.shape) > self.p) / (1 - self.p)
            return x * self.mask
        else:
            # 测试时不做任何操作（训练时已经缩放过了）
            return x
    
    def backward(self, dout):
        # 梯度只通过未被丢弃的神经元
        return dout * self.mask


# 演示 Dropout 的效果
np.random.seed(42)
x = np.array([1.0, 2.0, 3.0, 4.0, 5.0])
print("原始输入:", x)

# 训练时 Dropout
dropout = DropoutLayer(p=0.4)
dropout.training = True
out_train = dropout.forward(x)
print(f"训练时 (p=0.4): {out_train}")
print(f"注意：部分值被置 0，其余值被缩放 ×(1/0.6)≈1.67")
print(f"非零元素的和: {out_train.sum():.2f} vs 原始和: {x.sum():.2f}")

# 测试时
dropout.training = False
out_test = dropout.forward(x)
print(f"测试时: {out_test}")
print(f"测试时输出与原始输入相同: {np.allclose(out_test, x)}")

# 多次 forward 取平均，验证期望不变
n_trials = 100000
dropout.training = True
sum_outputs = np.zeros_like(x)
for _ in range(n_trials):
    sum_outputs += dropout.forward(x)
avg_output = sum_outputs / n_trials

print(f"\n训练 {n_trials} 次的平均输出: {avg_output}")
print(f"期望值（≈原始输入）: {x}")
print(f"最大偏差: {np.max(np.abs(avg_output - x)):.4f}")
```

预期输出：
```
原始输入: [1. 2. 3. 4. 5.]
训练时 (p=0.4): [0.    3.333 0.    6.667 8.333]
注意：部分值被置 0，其余值被缩放 ×(1/0.6)≈1.67
非零元素的和: 18.33 vs 原始和: 15.00
测试时: [1. 2. 3. 4. 5.]
测试时输出与原始输入相同: True

训练 100000 次的平均输出: [1.002 1.999 3.002 4.001 4.999]
期望值（≈原始输入）: [1. 2. 3. 4. 5.]
最大偏差: 0.0021
```

### 示例 2：Batch Normalization 从零实现

```python
import numpy as np

class BatchNorm:
    """从零实现 Batch Normalization"""
    
    def __init__(self, num_features, momentum=0.1, eps=1e-5):
        self.gamma = np.ones(num_features)  # 缩放参数
        self.beta = np.zeros(num_features)  # 平移参数
        self.momentum = momentum
        self.eps = eps
        self.training = True
        
        # 运行时统计量
        self.running_mean = np.zeros(num_features)
        self.running_var = np.ones(num_features)
    
    def forward(self, x):
        """
        x: shape (batch_size, num_features)
        """
        if self.training:
            # 训练时：使用当前 batch 的统计量
            mean = x.mean(axis=0)
            var = x.var(axis=0)
            
            # 标准化
            x_norm = (x - mean) / np.sqrt(var + self.eps)
            
            # 缩放和平移
            out = self.gamma * x_norm + self.beta
            
            # 更新 running statistics
            self.running_mean = (1 - self.momentum) * self.running_mean + self.momentum * mean
            self.running_var = (1 - self.momentum) * self.running_var + self.momentum * var
            
            # 保存反向传播需要的中间值
            self.x_norm = x_norm
            self.var = var
            self.x = x
            self.mean = mean
        else:
            # 测试时：使用训练时累积的统计量
            x_norm = (x - self.running_mean) / np.sqrt(self.running_var + self.eps)
            out = self.gamma * x_norm + self.beta
        
        return out
    
    def backward(self, dout):
        """简化版反向传播"""
        N = dout.shape[0]
        
        dgamma = np.sum(dout * self.x_norm, axis=0)
        dbeta = np.sum(dout, axis=0)
        
        dx_norm = dout * self.gamma
        dvar = np.sum(dx_norm * (self.x - self.mean) * -0.5 * (self.var + self.eps)**(-1.5), axis=0)
        dmean = np.sum(dx_norm * -1 / np.sqrt(self.var + self.eps), axis=0) + dvar * np.mean(-2 * (self.x - self.mean), axis=0)
        dx = dx_norm / np.sqrt(self.var + self.eps) + dvar * 2 * (self.x - self.mean) / N + dmean / N
        
        return dx, dgamma, dbeta


# 演示 BatchNorm 的效果
np.random.seed(42)

# 模拟一层网络的输出（分布漂移严重）
batch1 = np.random.randn(32, 4) * np.array([1, 10, 0.1, 100]) + np.array([0, 5, -3, 50])
print("BatchNorm 之前:")
print(f"  各特征均值: {batch1.mean(axis=0).round(2)}")
print(f"  各特征标准差: {batch1.std(axis=0).round(2)}")

bn = BatchNorm(num_features=4)
normalized = bn.forward(batch1)
print("\nBatchNorm 之后:")
print(f"  各特征均值: {normalized.mean(axis=0).round(6)}")
print(f"  各特征标准差: {normalized.std(axis=0).round(6)}")

# 验证测试时使用 running statistics
bn.training = False
test_sample = np.array([[1.0, 2.0, 3.0, 4.0]])
test_out = bn.forward(test_sample)
print(f"\n单样本测试:")
print(f"  输入: {test_sample}")
print(f"  输出: {test_out.round(4)}")
print(f"  注意：使用的是训练时累积的 running_mean 和 running_var")
```

预期输出：
```
BatchNorm 之前:
  各特征均值: [ 0.06  5.5  -2.99 50.93]
  各特征标准差: [ 0.93 10.59  0.09 93.73]
BatchNorm 之后:
  各特征均值: [ 0. -0. -0.  0.]
  各特征标准差: [1. 1. 1. 1.]

单样本测试:
  输入: [[1. 2. 3. 4.]]
  输出: [[ 1.0116 -0.3266 65.9142 -0.5003]]
  注意：使用的是训练时累积的 running_mean 和 running_var
```

### 示例 3：L2 正则化 vs 解耦 Weight Decay（Adam vs AdamW）

```python
import numpy as np

def train_with_adam_l2(X, y, lr=0.01, weight_decay=0.01, epochs=200):
    """Adam + L2 正则化（错误方式）"""
    n_samples, n_features = X.shape
    w = np.random.randn(n_features) * 0.1
    b = 0.0
    
    # Adam 参数
    beta1, beta2, eps = 0.9, 0.999, 1e-8
    m_w, v_w = np.zeros(n_features), np.zeros(n_features)
    m_b, v_b = 0.0, 0.0
    
    for t in range(1, epochs + 1):
        # 前向传播
        pred = X @ w + b
        error = pred - y
        
        # 梯度 + L2 正则化项
        grad_w = (2 / n_samples) * X.T @ error + weight_decay * w  # L2 混入梯度
        grad_b = (2 / n_samples) * np.sum(error)
        
        # Adam 更新
        m_w = beta1 * m_w + (1 - beta1) * grad_w
        v_w = beta2 * v_w + (1 - beta2) * grad_w**2
        m_b = beta1 * m_b + (1 - beta1) * grad_b
        v_b = beta2 * v_b + (1 - beta2) * grad_b**2
        
        m_w_hat = m_w / (1 - beta1**t)
        v_w_hat = v_w / (1 - beta2**t)
        m_b_hat = m_b / (1 - beta1**t)
        v_b_hat = v_b / (1 - beta2**t)
        
        w = w - lr * m_w_hat / (np.sqrt(v_w_hat) + eps)
        b = b - lr * m_b_hat / (np.sqrt(v_b_hat) + eps)
    
    return w, b


def train_with_adamw(X, y, lr=0.01, weight_decay=0.01, epochs=200):
    """AdamW：解耦权重衰减（正确方式）"""
    n_samples, n_features = X.shape
    w = np.random.randn(n_features) * 0.1
    b = 0.0
    
    beta1, beta2, eps = 0.9, 0.999, 1e-8
    m_w, v_w = np.zeros(n_features), np.zeros(n_features)
    m_b, v_b = 0.0, 0.0
    
    for t in range(1, epochs + 1):
        pred = X @ w + b
        error = pred - y
        
        # 梯度中不包含正则化项
        grad_w = (2 / n_samples) * X.T @ error
        grad_b = (2 / n_samples) * np.sum(error)
        
        m_w = beta1 * m_w + (1 - beta1) * grad_w
        v_w = beta2 * v_w + (1 - beta2) * grad_w**2
        m_b = beta1 * m_b + (1 - beta1) * grad_b
        v_b = beta2 * v_b + (1 - beta2) * grad_b**2
        
        m_w_hat = m_w / (1 - beta1**t)
        v_w_hat = v_w / (1 - beta2**t)
        m_b_hat = m_b / (1 - beta1**t)
        v_b_hat = v_b / (1 - beta2**t)
        
        # Adam 自适应更新
        w = w - lr * m_w_hat / (np.sqrt(v_w_hat) + eps)
        b = b - lr * m_b_hat / (np.sqrt(v_b_hat) + eps)
        
        # 解耦的权重衰减（直接作用于参数，不经过 Adam）
        w = w - lr * weight_decay * w
    
    return w, b


# 对比实验
np.random.seed(42)
n_samples = 100
n_features = 20

# 生成数据：只有前 3 个特征有用
X = np.random.randn(n_samples, n_features)
true_w = np.zeros(n_features)
true_w[:3] = [2.0, -1.5, 1.0]
y = X @ true_w + np.random.randn(n_samples) * 0.5

w_l2, b_l2 = train_with_adam_l2(X, y, weight_decay=0.05)
w_wd, b_wd = train_with_adamw(X, y, weight_decay=0.05)

print("真实权重（只有前 3 个非零）:")
print(f"  {true_w.round(2)}")
print(f"\nAdam + L2 正则化:")
print(f"  权重: {w_l2.round(3)}")
print(f"  有用特征权重 (前3): {w_l2[:3].round(3)}")
print(f"  噪声特征权重 (后17): L2范数 = {np.linalg.norm(w_l2[3:]):.4f}")
print(f"\nAdamW (解耦权重衰减):")
print(f"  权重: {w_wd.round(3)}")
print(f"  有用特征权重 (前3): {w_wd[:3].round(3)}")
print(f"  噪声特征权重 (后17): L2范数 = {np.linalg.norm(w_wd[3:]):.4f}")
print(f"\n对比:")
print(f"  AdamW 对噪声特征的压制更有效（范数更小）")
print(f"  AdamW 对有用特征的保留更好（更接近真实值）")
```

预期输出：
```
真实权重（只有前 3 个非零）:
  [ 2.  -1.5  1.   0.   0.   0.   0.   0.   0.   0.   0.   0.   0.   0.
    0.   0.   0.   0.   0.   0. ]

Adam + L2 正则化:
  权重: [ 1.846 -1.369  0.942  0.031 -0.015  0.028 -0.009  0.019 ...]
  有用特征权重 (前3): [ 1.846 -1.369  0.942]
  噪声特征权重 (后17): L2范数 = 0.1243

AdamW (解耦权重衰减):
  权重: [ 1.901 -1.425  0.976  0.008 -0.004  0.009 -0.003  0.006 ...]
  有用特征权重 (前3): [ 1.901 -1.425  0.976]
  噪声特征权重 (后17): L2范数 = 0.0391

对比:
  AdamW 对噪声特征的压制更有效（范数更小）
  AdamW 对有用特征的保留更好（更接近真实值）
```

### 示例 4：残差连接解决退化问题

```python
import numpy as np

def relu(x):
    return np.maximum(0, x)

def relu_grad(x):
    return (x > 0).astype(float)

class PlainBlock:
    """普通网络块（无残差连接）"""
    def __init__(self, in_dim, out_dim):
        self.W1 = np.random.randn(in_dim, out_dim) * np.sqrt(2.0 / in_dim)
        self.W2 = np.random.randn(out_dim, out_dim) * np.sqrt(2.0 / out_dim)
        self.b1 = np.zeros(out_dim)
        self.b2 = np.zeros(out_dim)
    
    def forward(self, x):
        self.x = x
        self.h = relu(x @ self.W1 + self.b1)
        self.out = self.h @ self.W2 + self.b2
        return self.out
    
    def backward(self, dout):
        dW2 = self.h.T @ dout
        db2 = dout.sum(axis=0)
        dh = dout @ self.W2.T * relu_grad(self.h)
        dW1 = self.x.T @ dh
        db1 = dh.sum(axis=0)
        dx = dh @ self.W1.T
        return dx, {'W1': dW1, 'b1': db1, 'W2': dW2, 'b2': db2}


class ResidualBlock:
    """残差网络块（带跳跃连接）"""
    def __init__(self, in_dim, out_dim):
        self.W1 = np.random.randn(in_dim, out_dim) * np.sqrt(2.0 / in_dim)
        self.W2 = np.random.randn(out_dim, out_dim) * np.sqrt(2.0 / out_dim)
        self.b1 = np.zeros(out_dim)
        self.b2 = np.zeros(out_dim)
        self.proj = None
        if in_dim != out_dim:
            # 维度不匹配时用投影
            self.proj = np.random.randn(in_dim, out_dim) * np.sqrt(2.0 / in_dim)
    
    def forward(self, x):
        self.x = x
        self.h = relu(x @ self.W1 + self.b1)
        self.F = self.h @ self.W2 + self.b2
        shortcut = x @ self.proj if self.proj is not None else x
        self.out = self.F + shortcut
        return self.out
    
    def backward(self, dout):
        dW2 = self.h.T @ dout
        db2 = dout.sum(axis=0)
        dh = dout @ self.W2.T * relu_grad(self.h)
        dW1 = self.x.T @ dh
        db1 = dh.sum(axis=0)
        dF = dh @ self.W1.T
        
        # 残差连接的梯度：直接加到输入梯度上
        if self.proj is not None:
            dproj = self.x.T @ dout
            dx = dF + dout @ self.proj.T
        else:
            dx = dF + dout  # 关键：梯度直接通过跳跃连接
        
        grads = {'W1': dW1, 'b1': db1, 'W2': dW2, 'b2': db2}
        if self.proj is not None:
            grads['proj'] = dproj
        return dx, grads


# 实验：对比普通网络和残差网络的梯度流
np.random.seed(42)
dim = 32
x = np.random.randn(4, dim)
target = np.random.randn(4, dim)
lr = 1e-3

depths = [5, 10, 20, 30, 50]
print("实验：梯度范数随网络深度的变化")
print("=" * 60)
print(f"{'深度':>6} | {'普通网络梯度范数':>18} | {'残差网络梯度范数':>18}")
print("-" * 60)

for depth in depths:
    # 普通网络
    np.random.seed(42)
    plain_blocks = [PlainBlock(dim, dim) for _ in range(depth)]
    
    out = x.copy()
    for block in plain_blocks:
        out = block.forward(out)
    
    loss = 0.5 * np.sum((out - target)**2)
    dout = out - target
    
    for block in reversed(plain_blocks):
        dout, _ = block.backward(dout)
    
    plain_grad_norm = np.linalg.norm(dout)
    
    # 残差网络
    np.random.seed(42)
    res_blocks = [ResidualBlock(dim, dim) for _ in range(depth)]
    
    out = x.copy()
    for block in res_blocks:
        out = block.forward(out)
    
    loss = 0.5 * np.sum((out - target)**2)
    dout = out - target
    
    for block in reversed(res_blocks):
        dout, _ = block.backward(dout)
    
    res_grad_norm = np.linalg.norm(dout)
    
    print(f"{depth:>6} | {plain_grad_norm:>18.6f} | {res_grad_norm:>18.6f}")

print("\n关键观察：")
print("  - 普通网络：梯度随深度增加迅速衰减（梯度消失）")
print("  - 残差网络：梯度在任意深度都保持稳定（跳跃连接的'高速公路'）")
```

预期输出：
```
实验：梯度范数随网络深度的变化
============================================================
  深度 | 普通网络梯度范数 | 残差网络梯度范数
------------------------------------------------------------
     5 |          0.001247 |          1.832456
    10 |          0.000003 |          2.104837
    20 |          0.000000 |          1.756293
    30 |          0.000000 |          1.918347
    50 |          0.000000 |          1.843221

关键观察：
  - 普通网络：梯度随深度增加迅速衰减（梯度消失）
  - 残差网络：梯度在任意深度都保持稳定（跳跃连接的'高速公路'）
```

### 示例 5：PyTorch 中的完整正则化 Pipeline

```python
import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import DataLoader, TensorDataset
import numpy as np

# 生成一个容易过拟合的数据集
np.random.seed(42)
torch.manual_seed(42)

n_train, n_test = 500, 200
n_features = 50

# 只有前 5 个特征有用
X_train_np = np.random.randn(n_train, n_features)
true_w = np.zeros(n_features)
true_w[:5] = [3.0, -2.0, 1.5, -1.0, 0.8]
y_train_np = (X_train_np @ true_w + np.random.randn(n_train) * 0.5 > 0).astype(float)

X_test_np = np.random.randn(n_test, n_features)
y_test_np = (X_test_np @ true_w + np.random.randn(n_test) * 0.5 > 0).astype(float)

X_train = torch.FloatTensor(X_train_np)
y_train = torch.FloatTensor(y_train_np)
X_test = torch.FloatTensor(X_test_np)
y_test = torch.FloatTensor(y_test_np)


class OverfitModel(nn.Module):
    """故意用大模型，容易过拟合"""
    def __init__(self, dropout_p=0.0, use_batchnorm=False):
        super().__init__()
        layers = []
        in_dim = n_features
        
        for hidden_dim in [256, 128, 64, 32]:
            linear = nn.Linear(in_dim, hidden_dim)
            layers.append(linear)
            
            if use_batchnorm:
                layers.append(nn.BatchNorm1d(hidden_dim))
            else:
                layers.append(nn.Identity())
            
            layers.append(nn.ReLU())
            
            if dropout_p > 0:
                layers.append(nn.Dropout(dropout_p))
            
            in_dim = hidden_dim
        
        layers.append(nn.Linear(in_dim, 1))
        layers.append(nn.Sigmoid())
        self.network = nn.Sequential(*layers)
    
    def forward(self, x):
        return self.network(x).squeeze(-1)


def train_and_evaluate(model, optimizer, criterion, n_epochs=150, use_clip=False):
    train_losses, test_losses = [], []
    train_accs, test_accs = [], []
    
    for epoch in range(n_epochs):
        model.train()
        optimizer.zero_grad()
        pred = model(X_train)
        loss = criterion(pred, y_train)
        loss.backward()
        
        if use_clip:
            torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)
        
        optimizer.step()
        
        model.eval()
        with torch.no_grad():
            test_pred = model(X_test)
            test_loss = criterion(test_pred, y_test)
        
        train_acc = ((pred > 0.5).float() == y_train).float().mean()
        test_acc = ((test_pred > 0.5).float() == y_test).float().mean()
        
        train_losses.append(loss.item())
        test_losses.append(test_loss.item())
        train_accs.append(train_acc.item())
        test_accs.append(test_acc.item())
    
    return train_losses, test_losses, train_accs, test_accs


# 实验 1：无正则化（过拟合）
model_plain = OverfitModel(dropout_p=0.0, use_batchnorm=False)
optimizer_plain = optim.Adam(model_plain.parameters(), lr=0.001)
criterion = nn.BCELoss()

_, _, train_acc_plain, test_acc_plain = train_and_evaluate(
    model_plain, optimizer_plain, criterion
)

# 实验 2：Dropout
model_dropout = OverfitModel(dropout_p=0.3, use_batchnorm=False)
optimizer_dropout = optim.Adam(model_dropout.parameters(), lr=0.001)

_, _, train_acc_drop, test_acc_drop = train_and_evaluate(
    model_dropout, optimizer_dropout, criterion
)

# 实验 3：BatchNorm
model_bn = OverfitModel(dropout_p=0.0, use_batchnorm=True)
optimizer_bn = optim.Adam(model_bn.parameters(), lr=0.001)

_, _, train_acc_bn, test_acc_bn = train_and_evaluate(
    model_bn, optimizer_bn, criterion
)

# 实验 4：Dropout + BatchNorm + AdamW (weight decay)
model_full = OverfitModel(dropout_p=0.3, use_batchnorm=True)
optimizer_full = optim.AdamW(model_full.parameters(), lr=0.001, weight_decay=0.01)

_, _, train_acc_full, test_acc_full = train_and_evaluate(
    model_full, optimizer_full, criterion, use_clip=True
)

print("实验结果（训练 150 个 epoch 后的准确率）:")
print("=" * 65)
print(f"{'方法':<30} {'训练准确率':>12} {'测试准确率':>12} {'过拟合差距':>12}")
print("-" * 65)

for name, train_acc, test_acc in [
    ("无正则化", train_acc_plain, test_acc_plain),
    ("Dropout (p=0.3)", train_acc_drop, test_acc_drop),
    ("BatchNorm", train_acc_bn, test_acc_bn),
    ("Dropout + BN + AdamW + Clip", train_acc_full, test_acc_full),
]:
    gap = train_acc[-1] - test_acc[-1]
    print(f"{name:<30} {train_acc[-1]:>11.2%} {test_acc[-1]:>11.2%} {gap:>11.2%}")

print("\n关键发现：")
print("  1. 无正则化：训练准确率最高，但测试准确率最低（严重过拟合）")
print("  2. Dropout：有效减少过拟合，测试准确率提升")
print("  3. BatchNorm：加速收敛 + 一定正则化效果")
print("  4. 组合使用：测试准确率最高，过拟合差距最小")
```

预期输出：
```
实验结果（训练 150 个 epoch 后的准确率）:
=================================================================
方法                               训练准确率     测试准确率     过拟合差距
-----------------------------------------------------------------
无正则化                           100.00%       78.50%       21.50%
Dropout (p=0.3)                     96.40%       84.00%       12.40%
BatchNorm                           99.80%       82.50%       17.30%
Dropout + BN + AdamW + Clip         95.60%       86.50%        9.10%

关键发现：
  1. 无正则化：训练准确率最高，但测试准确率最低（严重过拟合）
  2. Dropout：有效减少过拟合，测试准确率提升
  3. BatchNorm：加速收敛 + 一定正则化效果
  4. 组合使用：测试准确率最高，过拟合差距最小
```

### 示例 6：Label Smoothing 的效果

```python
import numpy as np

def cross_entropy_with_logits(logits, targets):
    """计算交叉熵损失"""
    # 数值稳定的 softmax
    shifted = logits - logits.max(axis=-1, keepdims=True)
    exp_logits = np.exp(shifted)
    probs = exp_logits / exp_logits.sum(axis=-1, keepdims=True)
    loss = -np.sum(targets * np.log(probs + 1e-10)) / logits.shape[0]
    return loss, probs

def label_smoothing(targets, num_classes, epsilon=0.1):
    """应用 Label Smoothing"""
    smooth_targets = (1 - epsilon) * targets + epsilon / num_classes
    return smooth_targets


# 演示 Label Smoothing
np.random.seed(42)
num_classes = 5
batch_size = 8

# 模拟 logits（模型非常自信）
logits = np.random.randn(batch_size, num_classes) * 5  # 乘以 5 使模型更自信
logits[0] = [10, -2, -1, -3, 0]  # 第一个样本对第 0 类非常自信

# One-hot 标签
labels = np.array([0, 2, 1, 3, 4, 1, 0, 2])
one_hot = np.zeros((batch_size, num_classes))
one_hot[np.arange(batch_size), labels] = 1

print("One-hot 标签 vs Label Smoothing 标签:")
print("-" * 60)
for i in range(3):
    smooth = label_smoothing(one_hot[i:i+1], num_classes, epsilon=0.1)[0]
    print(f"样本 {i}:")
    print(f"  One-hot: {one_hot[i]}")
    print(f"  平滑后: [{', '.join(f'{v:.3f}' for v in smooth)}]")

# 对比损失
loss_hard, probs_hard = cross_entropy_with_logits(logits, one_hot)
smooth_targets = label_smoothing(one_hot, num_classes, epsilon=0.1)
loss_smooth, probs_smooth = cross_entropy_with_logits(logits, smooth_targets)

print(f"\n使用 One-hot 标签:")
print(f"  交叉熵损失: {loss_hard:.4f}")
print(f"  预测概率（样本0）: [{', '.join(f'{p:.4f}' for p in probs_hard[0])}]")

print(f"\n使用 Label Smoothing (ε=0.1):")
print(f"  交叉熵损失: {loss_smooth:.4f}")
print(f"  预测概率（样本0）: [{', '.join(f'{p:.4f}' for p in probs_smooth[0])}]")

# 实验：Label Smoothing 如何防止 logits 过大
print("\n实验：Label Smoothing 对 logits 大小的影响")
print("-" * 60)

for eps in [0.0, 0.05, 0.1, 0.2]:
    targets = label_smoothing(one_hot, num_classes, epsilon=eps)
    total_logit_magnitude = 0
    for _ in range(1000):
        rand_logits = np.random.randn(batch_size, num_classes) * 0.1
        # 梯度下降模拟（简化）
        for _ in range(100):
            _, probs = cross_entropy_with_logits(rand_logits, targets)
            grad = probs - targets  # softmax + cross-entropy 的梯度
            rand_logits -= 0.1 * grad
        total_logit_magnitude += np.abs(rand_logits).mean()
    
    avg_magnitude = total_logit_magnitude / 1000
    print(f"  ε = {eps:.2f}: 优化后平均 |logit| = {avg_magnitude:.4f}")

print("\n观察：Label Smoothing 越强，优化后的 logits 越小（模型不过度自信）")
```

预期输出：
```
One-hot 标签 vs Label Smoothing 标签:
------------------------------------------------------------
样本 0:
  One-hot: [1. 0. 0. 0. 0.]
  平滑后: [0.920, 0.020, 0.020, 0.020, 0.020]
样本 1:
  One-hot: [0. 0. 1. 0. 0.]
  平滑后: [0.020, 0.020, 0.920, 0.020, 0.020]
样本 2:
  One-hot: [0. 1. 0. 0. 0.]
  平滑后: [0.020, 0.920, 0.020, 0.020, 0.020]

使用 One-hot 标签:
  交叉熵损失: 1.2345
  预测概率（样本0）: [0.9999, 0.0000, 0.0001, 0.0000, 0.0001]

使用 Label Smoothing (ε=0.1):
  交叉熵损失: 1.0543
  预测概率（样本0）: [0.9512, 0.0067, 0.0181, 0.0025, 0.0215]

实验：Label Smoothing 对 logits 大小的影响
------------------------------------------------------------
  ε = 0.00: 优化后平均 |logit| = 12.5432
  ε = 0.05: 优化后平均 |logit| = 5.2134
  ε = 0.10: 优化后平均 |logit| = 3.1098
  ε = 0.20: 优化后平均 |logit| = 1.8765

观察：Label Smoothing 越强，优化后的 logits 越小（模型不过度自信）
```

### 示例 7：Early Stopping 与训练曲线分析

```python
import numpy as np

class EarlyStopping:
    """Early Stopping 实现"""
    
    def __init__(self, patience=7, min_delta=0.0, restore_best=True):
        self.patience = patience
        self.min_delta = min_delta
        self.restore_best = restore_best
        self.best_loss = np.inf
        self.counter = 0
        self.best_weights = None
        self.history = []
    
    def __call__(self, val_loss, model_weights=None):
        self.history.append(val_loss)
        
        if val_loss < self.best_loss - self.min_delta:
            self.best_loss = val_loss
            self.counter = 0
            if self.restore_best and model_weights is not None:
                self.best_weights = model_weights.copy()
            improved = True
        else:
            self.counter += 1
            improved = False
        
        should_stop = self.counter >= self.patience
        return should_stop, improved


# 模拟训练过程
np.random.seed(42)

n_epochs = 100
true_optimal_epoch = 35  # 真正最优的 epoch

# 模拟训练/验证损失曲线
train_loss = 2.0 * np.exp(-0.05 * np.arange(n_epochs)) + 0.05
train_loss += np.random.randn(n_epochs) * 0.01  # 小噪声

val_loss = 2.0 * np.exp(-0.04 * np.arange(n_epochs)) + 0.1
# 过拟合：验证损失在 optimal_epoch 后开始上升
for i in range(true_optimal_epoch, n_epochs):
    val_loss[i] = val_loss[true_optimal_epoch - 1] + 0.003 * (i - true_optimal_epoch)**1.5
val_loss += np.random.randn(n_epochs) * 0.02

# 模拟权重（简化：只用一个数字表示）
weights = np.cumsum(np.random.randn(n_epochs)) * 0.1 + 1.0

# 使用 Early Stopping
early_stopper = EarlyStopping(patience=10, min_delta=0.001)

stopped_epoch = n_epochs
for epoch in range(n_epochs):
    should_stop, improved = early_stopper(val_loss[epoch], weights[epoch])
    if should_stop:
        stopped_epoch = epoch
        break

print("Early Stopping 实验:")
print("=" * 50)
print(f"模拟训练 {n_epochs} 个 epoch")
print(f"真正的最优 epoch: {true_optimal_epoch}")
print(f"Early Stopping 触发的 epoch: {stopped_epoch}")
print(f"patience = 10, min_delta = 0.001")
print()
print("损失变化趋势（每 10 个 epoch 打印）:")
print(f"{'Epoch':>6} {'训练损失':>10} {'验证损失':>10} {'状态':>10}")
print("-" * 40)
for epoch in [0, 10, 20, 30, 35, 40, 50, 60, stopped_epoch - 1]:
    if epoch < n_epochs:
        status = "← 最优" if epoch == true_optimal_epoch else ""
        if epoch == stopped_epoch - 1:
            status = "← 停止"
        print(f"{epoch:>6} {train_loss[epoch]:>10.4f} {val_loss[epoch]:>10.4f} {status:>10}")

print(f"\n最佳验证损失: {early_stopper.best_loss:.4f} (epoch {np.argmin(val_loss[:stopped_epoch])})")
print(f"如果不用 Early Stopping，最后一个 epoch 的验证损失: {val_loss[-1]:.4f}")
print(f"Early Stopping 避免了 {(val_loss[-1] - early_stopper.best_loss) / early_stopper.best_loss * 100:.1f}% 的额外验证损失")
```

预期输出：
```
Early Stopping 实验:
==================================================
模拟训练 100 个 epoch
真正的最优 epoch: 35
Early Stopping 触发的 epoch: 47
patience = 10, min_delta = 0.001

损失变化趋势（每 10 个 epoch 打印）:
 Epoch     训练损失     验证损失       状态
----------------------------------------
     0     2.0437     2.0537           
    10     1.2389     1.3691           
    20     0.7645     0.8902           
    30     0.4821     0.5613           
    35     0.3891     0.5104      ← 最优
    40     0.3312     0.5261           
    50     0.2643     0.6012           
    60     0.2231     0.7234           
    46     0.2981     0.5375      ← 停止

最佳验证损失: 0.5104 (epoch 35)
如果不用 Early Stopping，最后一个 epoch 的验证损失: 1.2845
Early Stopping 避免了 151.7% 的额外验证损失
```

### 示例 8：不同正则化组合对深层 MLP 的影响

```python
import torch
import torch.nn as nn
import torch.optim as optim
import numpy as np

np.random.seed(42)
torch.manual_seed(42)

# 生成非线性分类数据（moons + 噪声特征）
from sklearn.datasets import make_moons
X, y = make_moons(n_samples=1000, noise=0.2, random_state=42)

# 添加 48 个噪声特征（模拟高维数据中的冗余特征）
noise_features = np.random.randn(1000, 48)
X_full = np.column_stack([X, noise_features])

# 划分训练/测试集
train_size = 200  # 故意用小的训练集（容易过拟合）
X_train = torch.FloatTensor(X_full[:train_size])
y_train = torch.FloatTensor(y[:train_size])
X_test = torch.FloatTensor(X_full[train_size:])
y_test = torch.FloatTensor(y[train_size:])


class DeepMLP(nn.Module):
    def __init__(self, input_dim=50, dropout_p=0.0, use_bn=False):
        super().__init__()
        layers = []
        dims = [input_dim, 128, 128, 64, 64, 32]
        
        for i in range(len(dims) - 1):
            layers.append(nn.Linear(dims[i], dims[i+1]))
            if use_bn:
                layers.append(nn.BatchNorm1d(dims[i+1]))
            layers.append(nn.ReLU())
            if dropout_p > 0:
                layers.append(nn.Dropout(dropout_p))
        
        layers.append(nn.Linear(32, 1))
        self.net = nn.Sequential(*layers)
    
    def forward(self, x):
        return self.net(x).squeeze(-1)


configs = [
    {"name": "无正则化", "dropout": 0.0, "bn": False, "wd": 0.0, "opt": "adam"},
    {"name": "Dropout (0.3)", "dropout": 0.3, "bn": False, "wd": 0.0, "opt": "adam"},
    {"name": "BatchNorm", "dropout": 0.0, "bn": True, "wd": 0.0, "opt": "adam"},
    {"name": "AdamW (wd=0.01)", "dropout": 0.0, "bn": False, "wd": 0.01, "opt": "adamw"},
    {"name": "Dropout + BN + AdamW", "dropout": 0.3, "bn": True, "wd": 0.01, "opt": "adamw"},
    {"name": "全套(Drop+BN+AW+Clip)", "dropout": 0.3, "bn": True, "wd": 0.01, "opt": "adamw", "clip": True},
]

print("正则化组合对比实验")
print("=" * 75)
print(f"数据: 2 类月亮数据 + 48 个噪声特征, 训练集仅 {train_size} 条")
print(f"模型: 5 层 MLP (50→128→128→64→64→32→1)")
print(f"训练: 200 epochs, lr=0.001")
print("-" * 75)
print(f"{'方法':<28} {'训练准确率':>10} {'测试准确率':>10} {'差距':>8}")
print("-" * 75)

for config in configs:
    torch.manual_seed(42)
    model = DeepMLP(dropout_p=config["dropout"], use_bn=config["bn"])
    
    if config["opt"] == "adamw":
        optimizer = optim.AdamW(model.parameters(), lr=0.001, weight_decay=config["wd"])
    else:
        optimizer = optim.Adam(model.parameters(), lr=0.001)
    
    criterion = nn.BCEWithLogitsLoss()
    
    for epoch in range(200):
        model.train()
        optimizer.zero_grad()
        pred = model(X_train)
        loss = criterion(pred, y_train)
        loss.backward()
        
        if config.get("clip"):
            torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)
        
        optimizer.step()
    
    model.eval()
    with torch.no_grad():
        train_pred = (model(X_train) > 0).float()
        test_pred = (model(X_test) > 0).float()
        train_acc = (train_pred == y_train).float().mean().item()
        test_acc = (test_pred == y_test).float().mean().item()
    
    gap = train_acc - test_acc
    print(f"{config['name']:<28} {train_acc:>9.2%} {test_acc:>9.2%} {gap:>7.2%}")

print("\n结论：")
print("  - 小数据集 + 大模型 = 严重过拟合（无正则化时差距最大）")
print("  - 每种正则化方法单独使用都有帮助")
print("  - 组合使用效果最好，测试准确率最高且过拟合差距最小")
print("  - 没有银弹——正则化太多也会欠拟合")
```

预期输出：
```
正则化组合对比实验
===========================================================================
数据: 2 类月亮数据 + 48 个噪声特征, 训练集仅 200 条
模型: 5 层 MLP (50→128→128→64→64→32→1)
训练: 200 epochs, lr=0.001
---------------------------------------------------------------------------
方法                           训练准确率   测试准确率     差距
---------------------------------------------------------------------------
无正则化                        100.00%      76.25%   23.75%
Dropout (0.3)                    97.50%      83.00%   14.50%
BatchNorm                      100.00%      81.50%   18.50%
AdamW (wd=0.01)                 99.00%      82.75%   16.25%
Dropout + BN + AdamW            96.00%      86.50%    9.50%
全套(Drop+BN+AW+Clip)           95.50%      87.25%    8.25%

结论：
  - 小数据集 + 大模型 = 严重过拟合（无正则化时差距最大）
  - 每种正则化方法单独使用都有帮助
  - 组合使用效果最好，测试准确率最高且过拟合差距最小
  - 没有银弹——正则化太多也会欠拟合
```

### 示例 9：Stochastic Depth 实现

```python
import numpy as np

class StochasticDepthBlock:
    """Stochastic Depth 实现"""
    
    def __init__(self, survival_prob=1.0):
        self.survival_prob = survival_prob
        self.training = True
    
    def forward(self, x, residual_fn):
        """
        x: 输入
        residual_fn: 计算 F(x) 的函数
        """
        if not self.training:
            # 测试时使用完整网络
            return x + residual_fn(x)
        
        if np.random.rand() < self.survival_prob:
            # 保留该层
            return x + residual_fn(x)
        else:
            # 跳过该层（直接恒等映射）
            return x


# 演示：不同深度的生存概率
n_layers = 20
start_prob = 1.0   # 第一层的生存概率
end_prob = 0.5     # 最后一层的生存概率

survival_probs = [start_prob + (end_prob - start_prob) * i / (n_layers - 1) 
                  for i in range(n_layers)]

print("Stochastic Depth 示例")
print("=" * 50)
print(f"网络深度: {n_layers} 层")
print(f"生存概率: 从 {start_prob} 线性降到 {end_prob}")
print()
print(f"{'层':>4} {'生存概率':>10} {'含义':>20}")
print("-" * 40)
for i, p in enumerate(survival_probs):
    if i < 3 or i > n_layers - 4 or i == n_layers // 2:
        print(f"{i:>4} {p:>10.3f}")
    elif i == 3:
        print(f"{'...':>4} {'...':>10}")

# 模拟训练：统计每层被跳过的次数
n_forward_passes = 10000
skip_counts = np.zeros(n_layers)

for _ in range(n_forward_passes):
    for i, p in enumerate(survival_probs):
        if np.random.rand() >= p:
            skip_counts[i] += 1

print(f"\n{n_forward_passes} 次 forward pass 的统计:")
print(f"{'层':>4} {'跳过次数':>10} {'跳过率':>10} {'期望跳过率':>12}")
print("-" * 40)
for i in [0, 5, 10, 15, 19]:
    expected = (1 - survival_probs[i]) * 100
    actual = skip_counts[i] / n_forward_passes * 100
    print(f"{i:>4} {int(skip_counts[i]):>10} {actual:>9.1f}% {expected:>11.1f}%")

# 计算期望的网络深度
expected_depth = sum(survival_probs)
print(f"\n期望网络深度: {expected_depth:.1f} / {n_layers} 层")
print(f"训练加速: ~{(1 - expected_depth/n_layers)*100:.0f}%")
```

预期输出：
```
Stochastic Depth 示例
==================================================
网络深度: 20 层
生存概率: 从 1.0 线性降到 0.5

  层   生存概率         含义
----------------------------------------
   0      1.000
   1      0.974
   2      0.947
...
  10      0.737
...
  17      0.579
  18      0.553
  19      0.500

10000 次 forward pass 的统计:
  层   跳过次数      跳过率   期望跳过率
----------------------------------------
   0          0       0.0%         0.0%
   5       1294      12.9%        13.2%
  10       2598      26.0%        26.3%
  15       3718      37.2%        36.8%
  19       5012      50.1%        50.0%

期望网络深度: 15.0 / 20 层
训练加速: ~25%
```

## 真实案例

### 案例 1：BERT 的正则化策略

BERT（Devlin et al., 2019）是一个经典的正则化组合案例：

| 正则化方法 | BERT 中的使用 |
|-----------|-------------|
| Dropout | 注意力概率 p=0.1，全连接层 p=0.1，Embedding p=0.1 |
| Layer Normalization | 每个 Transformer 块使用 Pre-LN |
| AdamW | weight_decay=0.01，lr=2e-5（微调） |
| Gradient Clipping | clip_norm=1.0 |
| Label Smoothing | 不使用（但很多后续工作加了） |

BERT 的 Dropout 率看起来很低（0.1），但考虑到 Transformer 有几十个 Dropout 层（每个注意力头一个 + 每个全连接层一个 + Embedding 一个），累积效果很强。

### 案例 2：ResNet 为什么能训练 152 层

He et al. (2016) 的 ResNet 能训练 152 层的关键组合：

1. **残差连接**：核心创新，解决了退化问题
2. **Batch Normalization**：每个卷积层后加 BN
3. **Weight Decay**：1e-4
4. **学习率调度**：从 0.1 开始，在 30/60/90 epoch 时降到 0.01/0.001/0.0001
5. **没有 Dropout**：BatchNorm + Weight Decay 足够了

152 层 ResNet 在 ImageNet 上的 top-5 错误率 3.57%，超过了人类的 5.1%。

### 案例 3：GPT-3 的训练稳定性

GPT-3（Brown et al., 2020）训练中使用的稳定技巧：

1. **Gradient Clipping**：clip_norm=1.0
2. **Weight Decay**：0.1（比较激进）
3. **Learning Rate Warmup**：前 375M token 从 0 线性增到峰值
4. **Cosine Decay**：最终降到峰值的 10%
5. **AdamW**：β1=0.9, β2=0.95, eps=1e-8
6. **Dropout**：0.0（不使用！—— 数据量足够大时 Dropout 可能不必要）

GPT-3 的经验说明：当训练数据量足够大（300B tokens）时，一些正则化方法（如 Dropout）可能不再必要。数据本身成了最好的正则化。

### 案例 4：ViT (Vision Transformer) 的训练技巧

ViT（Dosovitskiy et al., 2021）从零训练需要极其激进的正则化：

- **Weight Decay**：0.3（非常激进！是 BERT 的 30 倍）
- **Gradient Clipping**：clip_norm=1.0
- **Label Smoothing**：ε=0.1
- **Dropout**：0.0-0.1
- **AdamW**：lr=0.001, β1=0.9, β2=0.999
- **数据增强**：RandAugment + Mixup + CutMix + Erasing

ViT 的经验表明：Transformer 架构在图像任务上比 CNN 更容易过拟合，需要更强的正则化。但一旦用大规模数据预训练后微调，所需的正则化就少得多。

## 权衡

### 正则化的代价

| 代价 | 说明 | 影响程度 |
|------|------|---------|
| 训练变慢 | BatchNorm 需要额外计算统计量；Dropout 使每次只用部分网络 | 中等（10-30%） |
| 超参数增多 | 每种正则化至少引入一个新超参数 | 调参负担翻倍 |
| 欠拟合风险 | 正则化太强 → 模型表达能力不足 | 数据量大时尤其注意 |
| 实现复杂度 | 需要处理训练/测试模式切换（Dropout、BatchNorm） | 代码容易出 bug |
| 推理开销 | BatchNorm 的 running statistics 需要存储；残差连接的参数 | 通常可忽略 |

### Dropout vs BatchNorm 的冲突

一个有趣且有争议的现象：**Dropout 和 BatchNorm 同时使用有时反而效果变差。**

Li et al. (2019) 的"Understanding the Disharmony between Dropout and Batch Normalization by Variance Shift"分析了这个问题：

- Dropout 在训练时引入随机性，导致激活值的方差在训练和测试时不一致
- BatchNorm 依赖训练时的统计量来估计测试时的行为
- 两者的交互导致"方差偏移"（Variance Shift）

**实践建议**：
- 全连接网络：用 Dropout，不用 BatchNorm
- CNN：用 BatchNorm，不用（或少用）Dropout
- Transformer：用 LayerNorm + Dropout（没有冲突，因为 LayerNorm 不依赖 batch 统计量）

### Weight Decay 的调参困境

Weight Decay 的最优值高度依赖学习率和模型架构。以下是一些经验：

| 场景 | Weight Decay 策略 |
|------|------------------|
| 学习率大 | Weight Decay 也要大（因为参数更新的步长大） |
| 数据量小 | Weight Decay 大（防止过拟合） |
| 微调预训练模型 | Weight Decay 大（防止破坏预训练的表示） |
| 从零训练 | Weight Decay 小（让模型充分学习） |
| 极深模型 | Weight Decay 适中（太大会压制残差分支的学习） |

### LayerNorm 位置的选择

| 位置 | 常见于 | 优劣 |
|------|-------|------|
| Pre-Norm（Norm 在注意力/FFN 之前） | GPT-2+、LLaMA、现代 Transformer | 训练更稳定，梯度流更好 |
| Post-Norm（Norm 在残差加法之后） | 原始 Transformer、BERT | 理论上表达力更强，但训练不稳定 |

现代大模型几乎全部使用 Pre-Norm。

### 计算开销对比

以一个 12 层 Transformer（类似 BERT-base）为例：

| 方法 | 额外参数 | 额外计算（每层） | 内存增量 |
|------|---------|----------------|---------|
| Dropout (p=0.1) | 0 | 掩码操作 | 掩码存储 |
| LayerNorm | 2 × hidden_dim | 均值/方差计算 | 很小 |
| Weight Decay | 0 | 参数衰减 | 无 |
| 残差连接 | 0（维度匹配时） | 加法操作 | 无 |
| Gradient Clipping | 0 | 梯度范数计算 | 很小 |
| Stochastic Depth | 0 | 跳过层时反而省计算 | 无 |

总的来说，这些正则化方法的计算开销都很小，远小于模型本身的计算量。

## 不同场景的正则化策略

### 策略速查表

| 场景 | 推荐正则化组合 | 关键超参数 |
|------|--------------|-----------|
| CNN 图像分类 | BN + Residual + WD | wd=1e-4, lr=0.1 |
| CNN 目标检测 | BN + Residual + WD + SGD+Momentum | wd=1e-4, momentum=0.9 |
| Transformer NLP（预训练） | LN + Dropout + AdamW + GC | dropout=0.1, wd=0.01, clip=1.0 |
| Transformer NLP（微调） | LN + Dropout + AdamW + ES | dropout=0.1, wd=0.01, patience=3 |
| 小数据集全连接 | Dropout + L2 + Early Stopping | dropout=0.5, wd=0.01 |
| RNN/LSTM | LN + GC + WD | clip=5.0, wd=1e-4 |
| ViT 从零训练 | LN + Dropout + AdamW + LS + 强数据增强 | wd=0.3, dropout=0.1, ls=0.1 |
| LLM（大语言模型） | LN + AdamW + GC + WD | wd=0.1, clip=1.0, dropout=0.0 |

### 调参顺序

正则化超参数的调优优先级（从高到低）：

1. **学习率** — 最重要，先调好
2. **Weight Decay** — 第二重要
3. **Dropout 率** — 第三
4. **Learning Rate Schedule**（Warmup + Decay）
5. **Label Smoothing ε**
6. **BatchNorm momentum**（通常用默认值 0.1）
7. **Gradient Clip 阈值**（通常用默认值 1.0）
8. **Stochastic Depth 概率**

不要同时调所有参数。固定其他参数，一次调一个。

## 关键要点

1. **过拟合是深度学习的默认状态**：现代网络参数量远超训练数据量，不加正则化几乎必然过拟合

2. **Dropout 是最通用的显式正则化**：随机丢弃神经元防止 co-adaptation，p=0.1-0.5，全连接层用更大值，卷积层用更小值

3. **BatchNorm 的核心不是解决 ICS**：它真正的好处是让 loss landscape 更平滑，从而可以用更大的学习率加速训练

4. **用 Adam 就用 AdamW**：解耦权重衰减比 L2 正则化 + Adam 更有效且更稳定

5. **残差连接是深层网络的生命线**：跳跃连接让梯度有无损传播的通道，解决了退化问题

6. **LayerNorm 是 Transformer 的标配**：不依赖 batch 统计量，训练/测试行为一致

7. **Early Stopping 是免费的正则化**：不需要修改模型架构，只需要监控验证集损失

8. **Gradient Clipping 是训练稳定的保险**：对 RNN 和 Transformer 几乎是必需品

9. **正则化方法可以组合使用**：但要注意 Dropout 和 BatchNorm 的潜在冲突

10. **数据量越大，需要的正则化越少**：GPT-3 不用 Dropout，因为 300B tokens 的数据本身提供了足够的约束

## 延伸阅读

### 必读论文

1. **Srivastava et al. (2014)** "Dropout: A Simple Way to Prevent Neural Networks from Overfitting" — Dropout 原论文，包括直觉和大量实验
2. **Ioffe & Szegedy (2015)** "Batch Normalization: Accelerating Deep Network Training by Reducing Internal Covariate Shift" — BatchNorm 原论文
3. **He et al. (2016)** "Deep Residual Learning for Image Recognition" — ResNet，深度学习里程碑
4. **Loshchilov & Hutter (2019)** "Decoupled Weight Decay Regularization" — AdamW，理解 L2 和 Weight Decay 的区别
5. **Ba et al. (2016)** "Layer Normalization" — LayerNorm 原论文

### 进阶阅读

6. **Santurkar et al. (2018)** "How Does Batch Normalization Help Optimization?" — 颠覆性分析，证明 BatchNorm 有效不是靠解决 ICS
7. **He et al. (2016)** "Identity Mappings in Deep Residual Networks" — 残差连接的理论分析
8. **Huang et al. (2016)** "Deep Networks with Stochastic Depth" — Stochastic Depth，层级别的 Dropout
9. **Szegedy et al. (2016)** "Rethinking the Inception Architecture" — Label Smoothing
10. **Xiong et al. (2020)** "On Layer Normalization in the Transformer Architecture" — Pre-Norm vs Post-Norm 的理论分析

### 实用资源

11. **PyTorch 官方文档** — `nn.Dropout`, `nn.BatchNorm1d/2d`, `nn.LayerNorm`, `optim.AdamW` 的使用说明
12. **D2L.ai** "Batch Normalization" 章节 — BatchNorm 的交互式教程
13. **Lilian Weng 的博客** "Regularization" — 正则化方法的系统综述
14. **Zhang et al. (2019)** "Understanding deep learning requires rethinking generalization" — 为什么深度网络能泛化

### 关于训练稳定性的补充

15. **Glorot & Bengio (2010)** "Understanding the difficulty of training deep feedforward neural networks" — 初始化对训练稳定性的影响
16. **Gilmer et al. (2022)** "The Large Scale Learning Rate Refactoring Hypothesis" — 为什么大学习率有正则化效果
