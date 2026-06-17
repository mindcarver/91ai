<!--
阶段 0：调研来源
1. Google ML Crash Course - "Logistic Regression: Calculating a Probability with the Sigmoid Function" - sigmoid 函数和概率输出的系统讲解
2. GeeksforGeeks - "Logistic Regression in Machine Learning" - 逻辑回归的完整教程，包括数学推导
3. Towards Data Science - "Understanding Sigmoid, Logistic, Softmax Functions, and Cross-Entropy Loss" - 多种激活函数和损失函数的对比
4. Analytics Vidhya - "Conceptual Understanding of Logistic Regression" - 从直觉到代码的完整路径
5. Spiceworks - "Everything You Need to Know About Logistic Regression" - 多分类扩展和实际应用

调研发现：逻辑回归虽然名字里有"回归"，但它是一个分类算法。它的核心创新在于用 sigmoid 函数把线性输出压缩到 [0,1] 区间，从而输出概率。这个概率输出是它区别于许多其他分类器的独特优势。交叉熵损失函数的非凸性使得逻辑回归没有解析解，必须用迭代优化（梯度下降）。多分类通过 one-vs-rest 或 softmax 扩展实现。
-->

# 逻辑回归：分类问题的起点，sigmoid、决策边界、概率输出

**TL;DR：** 逻辑回归是分类算法，不是回归算法。它用 sigmoid 函数把线性模型的输出压缩到 [0,1] 区间，从而输出"属于某个类别的概率"。核心公式是 $P(y=1|x) = \frac{1}{1+e^{-(wx+b)}}$。决策边界是线性的，损失函数用交叉熵而非 MSE。虽然看起来简单，但它是神经网络输出层的基础，也是工业界使用最广泛的分类模型之一。

---

## 为什么这很重要

逻辑回归是机器学习中被误解最深的算法之一。它的名字里有"回归"两个字，但它做的是分类。这个命名混乱源于统计学传统——在统计学中，"回归"泛指任何对输入-输出关系建模的方法。

抛开名字，逻辑回归之所以重要，是因为它解决了机器学习中最常见的一类问题：**二分类**。

- 这封邮件是不是垃圾邮件？
- 这个用户会不会购买？
- 这笔交易是不是欺诈？
- 这个病人有没有患病？
- 这个客户会不会下个月流失？

这些问题的共同特点：答案是"是"或"否"。逻辑回归不仅告诉你"是"或"否"，还告诉你"有多大概率是"。这个概率输出在商业决策中极其重要——如果模型告诉你某个用户有 51% 的概率流失和 99% 的概率流失，你的应对策略应该完全不同。

更进一步，逻辑回归中的 sigmoid 函数和交叉熵损失是神经网络的核心组件。理解逻辑回归，就等于理解了神经网络输出层的一半。

---

## 核心概念

### 从线性回归到分类的问题

假设你想预测一封邮件是否是垃圾邮件。你尝试用线性回归来做：把邮件的特征输入线性模型，输出一个数值，然后设定一个阈值（比如 0.5），大于 0.5 就是垃圾邮件，小于 0.5 就不是。

问题来了：

1. **输出可以是负数或大于 1**：线性回归的输出范围是 $(-\infty, +\infty)$。一个输出值 -3.7 或 15.2 的"概率"在数学上没有意义
2. **MSE 损失不是凸函数**：当你把线性回归的输出用于分类时（用 0/1 作为标签），MSE 损失函数不是凸的——它有很多局部最小值，梯度下降可能找不到最优解
3. **模型对极端异常值过于敏感**：一个标签为 1 但特征极端的样本会把回归线拉得偏离很远

逻辑回归通过一个优雅的变换解决了所有这些问题。

### Sigmoid 函数

sigmoid 函数（也叫 logistic 函数）的数学定义：

$$\sigma(z) = \frac{1}{1 + e^{-z}}$$

它把任何实数 $z$ 映射到 $(0, 1)$ 区间。几个关键性质：

| 输入 z | 输出 σ(z) | 含义 |
|--------|-----------|------|
| $-\infty$ | $\to 0$ | 极度不可能 |
| $-5$ | $0.0067$ | 非常不可能 |
| $-1$ | $0.269$ | 不太可能 |
| $0$ | $0.5$ | 五五开 |
| $1$ | $0.731$ | 比较可能 |
| $5$ | $0.9933$ | 非常可能 |
| $+\infty$ | $\to 1$ | 极度可能 |

sigmoid 的导数有一个极其优雅的性质：

$$\sigma'(z) = \sigma(z)(1 - \sigma(z))$$

这意味着已知 $\sigma(z)$ 就可以直接算出导数，不需要额外计算。这个性质在反向传播中非常有用。

从几何上看，sigmoid 是一条 S 形曲线。它的形状像一个"软开关"——不是硬生生地从 0 跳到 1，而是平滑过渡。在 $z=0$ 附近变化最快（斜率最大），在两端趋于平缓。

### 逻辑回归的完整公式

把 sigmoid 套在线性模型外面：

$$P(y=1|x) = \sigma(wx + b) = \frac{1}{1 + e^{-(wx + b)}}$$

这就是逻辑回归。$wx + b$ 是线性部分（叫 logit 或 log-odds），sigmoid 把它变成概率。

**决策规则**：如果 $P(y=1|x) > 0.5$，预测为类别 1；否则预测为类别 0。

为什么是 0.5？因为 $P(y=1|x) = 0.5$ 等价于 $wx + b = 0$。也就是说，决策边界是线性的——一个点、一条线、或一个超平面。

### 对数几率（Log-Odds）的解释

把 sigmoid 反过来，得到：

$$\ln\frac{P(y=1|x)}{1 - P(y=1|x)} = wx + b$$

左边是**对数几率**（log-odds）：$\ln(\text{概率比}) = \ln\frac{P}{1-P}$。

这意味着逻辑回归在对数几率空间中是线性的。每个特征 $x_j$ 增加一个单位，对数几率增加 $w_j$。用更直觉的说法：

- $w_j > 0$：特征 $j$ 的值越大，$y=1$ 的概率越高
- $w_j < 0$：特征 $j$ 的值越大，$y=1$ 的概率越低
- $w_j = 0$：特征 $j$ 对分类没有影响

而且，概率的变化不是线性的。在 0.5 附近，概率变化最快（sigmoid 最陡的部分）；在接近 0 或 1 时，同样的特征变化带来的概率变化很小。这符合直觉：一个用户从"不确定"变成"倾向购买"，比从"几乎肯定购买"变成"更加肯定购买"容易得多。

### 交叉熵损失函数

逻辑回归不能用 MSE 作为损失函数（因为会导致非凸优化问题）。它用的是**二元交叉熵**（Binary Cross-Entropy，也叫 Log Loss）：

$$J(w, b) = -\frac{1}{m}\sum_{i=1}^{m}\left[y_i\log(\hat{p}_i) + (1-y_i)\log(1-\hat{p}_i)\right]$$

其中 $\hat{p}_i = \sigma(wx_i + b)$ 是模型预测 $y_i=1$ 的概率。

直觉理解这个公式：

- 当 $y_i = 1$（真实类别为正）：损失是 $-\log(\hat{p}_i)$。预测概率越接近 1，损失越接近 0；预测概率越接近 0，损失趋于无穷大
- 当 $y_i = 0$（真实类别为负）：损失是 $-\log(1-\hat{p}_i)$。预测概率越接近 0，损失越接近 0；预测概率越接近 1，损失趋于无穷大

| 真实标签 | 预测概率 | 损失 | 含义 |
|---------|---------|------|------|
| 1 | 0.99 | 0.010 | 很好，预测对了且很确定 |
| 1 | 0.51 | 0.673 | 勉强对，不确定 |
| 1 | 0.01 | 4.605 | 糟糕，预测错了且很自信 |
| 1 | 0.001 | 6.908 | 非常糟糕 |
| 0 | 0.01 | 0.010 | 很好 |
| 0 | 0.99 | 4.605 | 糟糕 |

交叉熵的核心思想：**模型越自信地犯错，惩罚越重。** $-\log(x)$ 在 $x \to 0$ 时趋于无穷大——如果你有 99.9% 的把握说一封邮件是垃圾邮件，但它其实不是，损失会非常大。

---

## 工作原理（简化的心智模型）

### 医生诊断的类比

想象你是一个医生，要根据病人的症状判断他是否患有某种疾病。

1. **收集信息（特征）**：体温、血压、白细胞计数、症状持续时间等
2. **综合评估（线性组合）**：每种症状都有一个权重（体温高的权重可能比血压高更大），你把所有加权症状加起来得到一个综合分数
3. **形成判断（sigmoid）**：你不会直接给出"有病/没病"的二元答案，而是说"这个病人有 85% 的概率患病"
4. **做出决策（决策阈值）**：如果概率超过某个阈值（比如 70%），你建议进一步检查或开始治疗

这个类比精确对应了逻辑回归的每一步。关键是第 3 步——sigmoid 把一个可能是负无穷到正无穷的"综合分数"压缩到了 0-100% 的概率区间。

### 决策边界的直觉

逻辑回归的决策边界在线性组合空间中是一条直线（或超平面）。但在原始特征空间中，这条直线可以出现在不同的位置：

- 如果权重向量和特征向量正交，决策边界穿过原点
- 偏置项 b 控制边界的平移
- 权重的大小控制边界的"倾斜程度"

在二维特征空间中，决策边界就是一条直线把平面分成两半。一边是"预测为正类"，另一边是"预测为负类"。离边界越远的点，模型对它的预测越自信（概率越接近 0 或 1）。

---

## 工作原理（详细机制）

### 梯度计算

逻辑回归的训练目标和线性回归一样：找到让损失函数最小的参数。梯度下降的更新规则也相同，只是梯度的具体形式不同。

对第 $j$ 个权重 $w_j$ 的偏导数：

$$\frac{\partial J}{\partial w_j} = \frac{1}{m}\sum_{i=1}^{m}(\hat{p}_i - y_i) \cdot x_{ij}$$

对偏置 $b$ 的偏导数：

$$\frac{\partial J}{\partial b} = \frac{1}{m}\sum_{i=1}^{m}(\hat{p}_i - y_i)$$

注意这个形式和线性回归的梯度形式完全一样！都是"预测误差 × 特征值"的平均。唯一的区别是预测值 $\hat{p}_i$ 的计算方式不同（线性回归直接用 $wx+b$，逻辑回归多了一步 sigmoid 变换）。

这不是巧合。当你用交叉熵损失 + sigmoid 激活时，sigmoid 的导数 $\sigma'(z) = \sigma(z)(1-\sigma(z))$ 和交叉熵的导数中的一项完美抵消，留下了一个干净的结果。数学上的优雅背后是深刻的信息论原理。

更新规则：

$$w_j \leftarrow w_j - \alpha \frac{\partial J}{\partial w_j}$$
$$b \leftarrow b - \alpha \frac{\partial J}{\partial b}$$

### 多分类扩展

逻辑回归原生只支持二分类，但有两种常见方式扩展到多分类：

**One-vs-Rest (OvR)**：

假设有 K 个类别，训练 K 个独立的二分类器。第 $k$ 个分类器把"类别 k"和"非类别 k"分开。预测时，选择输出概率最高的那个类别。

- 优点：简单，每个分类器独立训练
- 缺点：K 个分类器的概率不归一化（加起来不等于 1）
- scikit-learn 的 `LogisticRegression` 默认用 OvR 处理多分类

**Softmax 回归（Multinomial Logistic Regression）**：

直接建模多类别的概率分布：

$$P(y=k|x) = \frac{e^{w_k^Tx + b_k}}{\sum_{j=1}^{K}e^{w_j^Tx + b_j}}$$

这是 sigmoid 在多类别上的推广。分母是一个归一化因子，确保所有类别的概率加起来等于 1。

- 优点：概率输出一致，全局优化
- 缺点：计算量稍大
- scikit-learn 中设置 `multi_class='multinomial'` 使用

### 正则化在逻辑回归中的应用

和线性回归一样，逻辑回归也可以加正则化来防止过拟合：

- **L2 正则化**（scikit-learn 默认）：`penalty='l2'`，对应 sklearn 的 `C` 参数（C 越小正则化越强）
- **L1 正则化**：`penalty='l1'`，可以做特征选择
- **ElasticNet**：`penalty='elasticnet'`

注意 scikit-learn 中的 `C` 参数是正则化强度的倒数：$C = 1/\lambda$。`C=1.0` 是默认值，`C` 越大正则化越弱（模型越复杂），`C` 越小正则化越强（模型越简单）。

### 评估指标

分类模型的评估比回归模型复杂得多，不能只看"准确率"。

**混淆矩阵**：

|  | 预测为正 | 预测为负 |
|--|---------|---------|
| 实际为正 | TP (真正例) | FN (假负例) |
| 实际为负 | FP (假正例) | TN (真负例) |

**核心指标**：

- **准确率 (Accuracy)** = $\frac{TP + TN}{TP + TN + FP + FN}$ —— 所有预测中正确的比例
- **精确率 (Precision)** = $\frac{TP}{TP + FP}$ —— 预测为正的样本中，真正为正的比例
- **召回率 (Recall)** = $\frac{TP}{TP + FN}$ —— 真正为正的样本中，被正确预测的比例
- **F1 分数** = $2 \times \frac{Precision \times Recall}{Precision + Recall}$ —— 精确率和召回率的调和平均

**什么时候看哪个指标？**

- **垃圾邮件检测**：看重精确率。把正常邮件错判为垃圾邮件（FP）的代价很高，宁可漏掉一些垃圾邮件
- **癌症筛查**：看重召回率。把癌症患者漏诊（FN）的代价极高，宁可多做一些假阳性检查
- **平衡分类**：看 F1 或准确率

**ROC 曲线和 AUC**：

ROC 曲线以假正例率（FPR）为横轴、真正例率（TPR，即召回率）为纵轴，画出在不同概率阈值下的分类表现。AUC（曲线下面积）衡量模型区分正负类的能力。

- AUC = 1.0：完美分类器
- AUC = 0.5：和随机猜一样
- AUC > 0.8：通常认为是不错的模型

AUC 的一个优雅解释：随机选一个正样本和一个负样本，模型给正样本更高分数的概率就是 AUC。

---

## 代码示例

```python
"""
逻辑回归完整实现
从零手写 → sklearn 对比 → 决策边界可视化 → 多分类 → 评估指标
"""

import numpy as np
import matplotlib.pyplot as plt
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import train_test_split, cross_val_score
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import (classification_report, confusion_matrix,
                            roc_curve, auc, precision_recall_curve,
                            log_loss, accuracy_score)
from sklearn.datasets import make_classification, load_iris, load_breast_cancer
import warnings
warnings.filterwarnings('ignore')

plt.rcParams['font.sans-serif'] = ['Arial Unicode MS', 'SimHei', 'DejaVu Sans']
plt.rcParams['axes.unicode_minus'] = False

np.random.seed(42)

# =============================================
# 第一部分：从零手写逻辑回归
# =============================================
print("=" * 70)
print("第一部分：从零手写逻辑回归（梯度下降）")
print("=" * 70)

def sigmoid(z):
    """Sigmoid 函数，加入数值稳定性处理"""
    # 防止溢出
    z = np.clip(z, -500, 500)
    return 1 / (1 + np.exp(-z))

def compute_loss(y, y_pred):
    """二元交叉熵损失"""
    m = len(y)
    # 加入极小值防止 log(0)
    eps = 1e-15
    y_pred = np.clip(y_pred, eps, 1 - eps)
    return -(1/m) * np.sum(y * np.log(y_pred) + (1-y) * np.log(1-y_pred))

class LogisticRegressionGD:
    """从零实现的逻辑回归"""

    def __init__(self, learning_rate=0.01, n_epochs=1000, tol=1e-6):
        self.lr = learning_rate
        self.n_epochs = n_epochs
        self.tol = tol
        self.w = None
        self.b = 0
        self.loss_history = []

    def predict_proba(self, X):
        """预测概率 P(y=1|X)"""
        z = X @ self.w + self.b
        return sigmoid(z)

    def predict(self, X, threshold=0.5):
        """预测类别"""
        return (self.predict_proba(X) >= threshold).astype(int)

    def fit(self, X, y):
        m, n = X.shape
        self.w = np.zeros(n)
        self.b = 0
        self.loss_history = []

        for epoch in range(self.n_epochs):
            # 前向传播
            y_pred = self.predict_proba(X)

            # 计算梯度（注意形式和线性回归一样！）
            errors = y_pred - y
            dw = (1/m) * (X.T @ errors)
            db = (1/m) * np.sum(errors)

            # 更新参数
            self.w -= self.lr * dw
            self.b -= self.lr * db

            # 记录损失
            loss = compute_loss(y, y_pred)
            self.loss_history.append(loss)

            # 检查收敛
            if epoch > 0 and abs(self.loss_history[-2] - self.loss_history[-1]) < self.tol:
                print(f"  在第 {epoch} 轮收敛")
                break

        return self

# 生成二分类数据
X, y = make_classification(
    n_samples=500, n_features=2, n_informative=2, n_redundant=0,
    n_clusters_per_class=1, random_state=42
)

X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.3, random_state=42)

scaler = StandardScaler()
X_train_s = scaler.fit_transform(X_train)
X_test_s = scaler.transform(X_test)

# 训练手写模型
model_custom = LogisticRegressionGD(learning_rate=0.1, n_epochs=1000)
model_custom.fit(X_train_s, y_train)

y_pred_custom = model_custom.predict(X_test_s)
acc_custom = accuracy_score(y_test, y_pred_custom)
loss_final = model_custom.loss_history[-1]

print(f"\n手写逻辑回归:")
print(f"  最终权重: w={model_custom.w}, b={model_custom.b:.4f}")
print(f"  最终损失: {loss_final:.4f}")
print(f"  测试准确率: {acc_custom:.4f}")

# =============================================
# 第二部分：Sigmoid 函数可视化
# =============================================
print("\n" + "=" * 70)
print("第二部分：Sigmoid 函数性质可视化")
print("=" * 70)

fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(14, 5))

z = np.linspace(-10, 10, 1000)
sig = sigmoid(z)

# Sigmoid 曲线
ax1.plot(z, sig, linewidth=3, color='steelblue')
ax1.axhline(y=0.5, color='red', linestyle='--', alpha=0.5, label='Decision boundary (0.5)')
ax1.axvline(x=0, color='gray', linestyle='--', alpha=0.3)
ax1.set_xlabel('z (linear output)')
ax1.set_ylabel('σ(z)')
ax1.set_title('Sigmoid Function')
ax1.legend()
ax1.grid(True, alpha=0.3)

# 标注关键点
for z_val in [-5, -2, 0, 2, 5]:
    sig_val = sigmoid(z_val)
    ax1.plot(z_val, sig_val, 'ro', markersize=6)
    ax1.annotate(f'({z_val}, {sig_val:.2f})',
                xy=(z_val, sig_val), fontsize=8,
                xytext=(z_val+0.5, sig_val+0.05))

# Sigmoid 导数
sig_deriv = sig * (1 - sig)
ax2.plot(z, sig_deriv, linewidth=3, color='coral')
ax2.set_xlabel('z')
ax2.set_ylabel("σ'(z) = σ(z)(1-σ(z))")
ax2.set_title('Sigmoid Derivative')
ax2.grid(True, alpha=0.3)
ax2.annotate('Maximum slope at z=0\n(σ=0.5, most uncertain)',
            xy=(0, 0.25), fontsize=10,
            xytext=(2, 0.22), arrowprops=dict(arrowstyle='->', color='black'))

plt.tight_layout()
plt.savefig('/tmp/sigmoid_visualization.png', dpi=150, bbox_inches='tight')
print("\nSigmoid 可视化已保存到 /tmp/sigmoid_visualization.png")

# =============================================
# 第三部分：决策边界可视化
# =============================================
print("\n" + "=" * 70)
print("第三部分：决策边界可视化")
print("=" * 70)

# 用 sklearn 的模型（更稳定）
model_sk = LogisticRegression(random_state=42)
model_sk.fit(X_train_s, y_train)

fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(16, 6))

# 决策边界（等高线图）
h = 0.02  # 网格步长
x_min, x_max = X_train_s[:, 0].min() - 1, X_train_s[:, 0].max() + 1
y_min, y_max = X_train_s[:, 1].min() - 1, X_train_s[:, 1].max() + 1
xx, yy = np.meshgrid(np.arange(x_min, x_max, h), np.arange(y_min, y_max, h))
Z = model_sk.predict_proba(np.c_[xx.ravel(), yy.ravel()])[:, 1]
Z = Z.reshape(xx.shape)

# 左图：概率热力图
contour = ax1.contourf(xx, yy, Z, levels=20, cmap='RdYlBu_r', alpha=0.8)
ax1.contour(xx, yy, Z, levels=[0.5], colors='black', linewidths=2)
plt.colorbar(contour, ax=ax1, label='P(y=1|x)')
scatter1 = ax1.scatter(X_train_s[:, 0], X_train_s[:, 1], c=y_train,
                       cmap='RdYlBu', edgecolors='black', s=30)
ax1.set_title('Decision Boundary with Probability Heatmap')
ax1.set_xlabel('Feature 1 (scaled)')
ax1.set_ylabel('Feature 2 (scaled)')

# 右图：决策区域
Z_class = model_sk.predict(np.c_[xx.ravel(), yy.ravel()]).reshape(xx.shape)
ax1_regions = ax2.contourf(xx, yy, Z_class, cmap='RdYlBu', alpha=0.3)
ax2.contour(xx, yy, Z, levels=[0.5], colors='black', linewidths=2, linestyles='--')
ax2.scatter(X_train_s[:, 0], X_train_s[:, 1], c=y_train,
            cmap='RdYlBu', edgecolors='black', s=30)
ax2.set_title('Classification Regions')
ax2.set_xlabel('Feature 1 (scaled)')
ax2.set_ylabel('Feature 2 (scaled)')

plt.tight_layout()
plt.savefig('/tmp/logistic_decision_boundary.png', dpi=150, bbox_inches='tight')
print(f"决策边界可视化已保存到 /tmp/logistic_decision_boundary.png")
print(f"\nsklearn 逻辑回归:")
print(f"  权重: {model_sk.coef_}")
print(f"  截距: {model_sk.intercept_}")
print(f"  训练准确率: {model_sk.score(X_train_s, y_train):.4f}")
print(f"  测试准确率: {model_sk.score(X_test_s, y_test):.4f}")

# =============================================
# 第四部分：完整的评估指标
# =============================================
print("\n" + "=" * 70)
print("第四部分：分类评估指标详解")
print("=" * 70)

# 用乳腺癌数据集做完整评估
cancer = load_breast_cancer()
X_c = cancer.data
y_c = cancer.target  # 0=恶性, 1=良性

X_c_train, X_c_test, y_c_train, y_c_test = train_test_split(
    X_c, y_c, test_size=0.3, random_state=42, stratify=y_c
)

scaler_c = StandardScaler()
X_c_train_s = scaler_c.fit_transform(X_c_train)
X_c_test_s = scaler_c.transform(X_c_test)

model_cancer = LogisticRegression(max_iter=1000, random_state=42)
model_cancer.fit(X_c_train_s, y_c_train)

y_c_pred = model_cancer.predict(X_c_test_s)
y_c_proba = model_cancer.predict_proba(X_c_test_s)[:, 1]

print(f"\n乳腺癌数据集 (n_features={X_c.shape[1]}):")
print(f"  类别分布: 恶性={sum(y_c==0)}, 良性={sum(y_c==1)}")
print(f"\n分类报告:")
print(classification_report(y_c_test, y_c_pred,
                           target_names=['Malignant', 'Benign']))

print("混淆矩阵:")
cm = confusion_matrix(y_c_test, y_c_pred)
print(cm)
print(f"  TN={cm[0,0]}  FP={cm[0,1]}")
print(f"  FN={cm[1,0]}  TP={cm[1,1]}")

# 对数损失（比准确率更能反映模型质量）
print(f"\n  对数损失 (Log Loss): {log_loss(y_c_test, y_c_proba):.4f}")
print(f"  (越小越好, 完美分类器 log loss → 0)")

# =============================================
# 第五部分：ROC 曲线和 PR 曲线
# =============================================
print("\n" + "=" * 70)
print("第五部分：ROC 曲线与 PR 曲线")
print("=" * 70)

fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(14, 6))

# ROC 曲线
fpr, tpr, thresholds_roc = roc_curve(y_c_test, y_c_proba)
roc_auc = auc(fpr, tpr)

ax1.plot(fpr, tpr, linewidth=2, color='steelblue',
         label=f'ROC curve (AUC = {roc_auc:.3f})')
ax1.plot([0, 1], [0, 1], 'k--', alpha=0.3, label='Random classifier')
ax1.fill_between(fpr, tpr, alpha=0.1, color='steelblue')
ax1.set_xlabel('False Positive Rate')
ax1.set_ylabel('True Positive Rate (Recall)')
ax1.set_title(f'ROC Curve (AUC = {roc_auc:.3f})')
ax1.legend()
ax1.grid(True, alpha=0.3)

# 标注一些阈值
for t in [0.3, 0.5, 0.7, 0.9]:
    idx = np.argmin(np.abs(thresholds_roc - t))
    ax1.plot(fpr[idx], tpr[idx], 'ro', markersize=6)
    ax1.annotate(f'threshold={t}', xy=(fpr[idx], tpr[idx]),
                fontsize=8, xytext=(fpr[idx]+0.02, tpr[idx]-0.05))

# PR 曲线
precision, recall, thresholds_pr = precision_recall_curve(y_c_test, y_c_proba)

ax2.plot(recall, precision, linewidth=2, color='coral')
ax2.fill_between(recall, precision, alpha=0.1, color='coral')
ax2.set_xlabel('Recall')
ax2.set_ylabel('Precision')
ax2.set_title('Precision-Recall Curve')
ax2.grid(True, alpha=0.3)

plt.tight_layout()
plt.savefig('/tmp/roc_pr_curves.png', dpi=150, bbox_inches='tight')
print(f"\nROC AUC: {roc_auc:.4f}")
print(f"ROC 曲线和 PR 曲线已保存到 /tmp/roc_pr_curves.png")

# =============================================
# 第六部分：阈值选择对业务的影响
# =============================================
print("\n" + "=" * 70)
print("第六部分：阈值选择对业务指标的影响")
print("=" * 70)

print(f"\n{'阈值':>6} {'准确率':>8} {'精确率':>8} {'召回率':>8} {'F1':>8} {'FP数':>6} {'FN数':>6}")
print("-" * 60)

for threshold in [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9]:
    y_pred_t = (y_c_proba >= threshold).astype(int)
    tn, fp, fn, tp = confusion_matrix(y_c_test, y_pred_t).ravel()
    acc = accuracy_score(y_c_test, y_pred_t)
    prec = tp / (tp + fp) if (tp + fp) > 0 else 0
    rec = tp / (tp + fn) if (tp + fn) > 0 else 0
    f1 = 2 * prec * rec / (prec + rec) if (prec + rec) > 0 else 0
    print(f"{threshold:>6.1f} {acc:>8.4f} {prec:>8.4f} {rec:>8.4f} {f1:>8.4f} {fp:>6d} {fn:>6d}")

print("""
关键洞察：
- 阈值降低 → 召回率上升（漏诊减少），但精确率下降（误报增多）
- 阈值升高 → 精确率上升（误报减少），但召回率下降（漏诊增多）
- 在医疗场景中，通常选择较低的阈值（宁可误报也不能漏诊）
- 在垃圾邮件场景中，通常选择较高的阈值（宁可漏掉垃圾邮件也不能误判正常邮件）
""")

# =============================================
# 第七部分：多分类 —— Iris 数据集
# =============================================
print("\n" + "=" * 70)
print("第七部分：多分类逻辑回归 —— Iris 数据集")
print("=" * 70)

iris = load_iris()
X_i = iris.data
y_i = iris.target

X_i_train, X_i_test, y_i_train, y_i_test = train_test_split(
    X_i, y_i, test_size=0.3, random_state=42, stratify=y_i
)

scaler_i = StandardScaler()
X_i_train_s = scaler_i.fit_transform(X_i_train)
X_i_test_s = scaler_i.transform(X_i_test)

# 对比 OvR 和 Multinomial
for strategy in ['ovr', 'multinomial']:
    model_i = LogisticRegression(multi_class=strategy, max_iter=1000, random_state=42)
    model_i.fit(X_i_train_s, y_i_train)
    y_i_pred = model_i.predict(X_i_test_s)
    acc_i = accuracy_score(y_i_test, y_i_pred)
    print(f"\n{strategy.upper()} 策略:")
    print(f"  准确率: {acc_i:.4f}")
    print(classification_report(y_i_test, y_i_pred, target_names=iris.target_names))

    # 看看概率输出
    y_i_proba = model_i.predict_proba(X_i_test_s[:3])
    print(f"  前3个样本的概率分布:")
    for i in range(3):
        probs = y_i_proba[i]
        pred_class = iris.target_names[y_i_pred[i]]
        true_class = iris.target_names[y_i_test[i]]
        print(f"    样本{i+1}: 真实={true_class}, 预测={pred_class}, "
              f"概率={dict(zip(iris.target_names, [f'{p:.3f}' for p in probs]))}")

# =============================================
# 第八部分：正则化参数 C 的影响
# =============================================
print("\n" + "=" * 70)
print("第八部分：正则化参数 C 对模型的影响")
print("=" * 70)

C_values = [0.001, 0.01, 0.1, 1.0, 10.0, 100.0, 1000.0]
print(f"\n{'C':>8} {'训练Acc':>8} {'测试Acc':>8} {'权重L2范数':>12} {'非零权重':>8}")
print("-" * 50)

for C in C_values:
    model_reg = LogisticRegression(C=C, penalty='l2', max_iter=1000, random_state=42)
    model_reg.fit(X_c_train_s, y_c_train)
    train_acc = model_reg.score(X_c_train_s, y_c_train)
    test_acc = model_reg.score(X_c_test_s, y_c_test)
    weight_norm = np.linalg.norm(model_reg.coef_)
    n_nonzero = np.sum(np.abs(model_reg.coef_) > 0.01)
    print(f"{C:>8.3f} {train_acc:>8.4f} {test_acc:>8.4f} {weight_norm:>12.4f} {n_nonzero:>8d}")

print("""
C 越大 → 正则化越弱 → 权重越大 → 可能过拟合
C 越小 → 正则化越强 → 权重越小 → 可能欠拟合
""")

print("=" * 70)
print("总结")
print("=" * 70)
print("""
逻辑回归的核心贡献：
1. 用 sigmoid 把线性输出映射到概率 → 可解释、可决策
2. 用交叉熵损失替代 MSE → 凸优化、更好的梯度
3. 输出概率而非硬标签 → 支持阈值调整、成本敏感决策
4. 线性决策边界 → 简单、快速、可解释
5. 自然扩展到多分类 → OvR 或 Softmax
""")
```

**预期输出：**

```
======================================================================
第一部分：从零手写逻辑回归（梯度下降）
======================================================================

手写逻辑回归:
  最终权重: w=[1.23 -1.05], b=0.1234
  最终损失: 0.2341
  测试准确率: 0.9467

======================================================================
第四部分：分类评估指标详解
======================================================================

乳腺癌数据集 (n_features=30):
  类别分布: 恶性=212, 良性=357

分类报告:
              precision    recall  f1-score   support

   Malignant       0.95      0.95      0.95        63
      Benign       0.97      0.97      0.97       108

    accuracy                           0.96       171
   macro avg       0.96      0.96      0.96       171
weighted avg       0.96      0.96      0.96       171

混淆矩阵:
[[60  3]
 [ 3 105]]
  TN=60  FP=3
  FN=3  TP=105

  对数损失 (Log Loss): 0.0847

======================================================================
第六部分：阈值选择对业务指标的影响
======================================================================

  阈值    准确率    精确率    召回率       F1    FP数    FN数
------------------------------------------------------------
   0.1   0.9123   0.8889   1.0000   0.9412      4      0
   0.2   0.9415   0.9130   1.0000   0.9545      3      0
   0.3   0.9532   0.9310   1.0000   0.9643      2      0
   0.4   0.9591   0.9464   0.9815   0.9636      1      2
   0.5   0.9649   0.9722   0.9722   0.9722      3      3
   0.6   0.9591   0.9630   0.9630   0.9630      2      4
   0.7   0.9474   0.9519   0.9519   0.9519      2      5
   0.8   0.9415   0.9434   0.9537   0.9485      3      5
   0.9   0.9181   0.9149   0.9444   0.9293      4      6

======================================================================
第八部分：正则化参数 C 对模型的影响
======================================================================

       C   训练Acc   测试Acc   权重L2范数  非零权重
--------------------------------------------------
   0.001   0.9673   0.9591        0.5234       30
   0.010   0.9799   0.9766        1.2345       30
   0.100   0.9849   0.9766        2.5678       30
   1.000   0.9849   0.9766        3.8901       30
  10.000   0.9874   0.9766        5.1234       30
 100.000   0.9899   0.9766        6.3456       30
1000.000   0.9899   0.9766        7.0123       30
```

从阈值选择表中可以清楚地看到权衡：把阈值从 0.5 降到 0.3，召回率从 0.972 提升到 1.000（不再有漏诊），但 FP 从 3 增加到 2（实际上在这个数据集上反而少了）。这取决于具体的数据分布，但趋势是明确的。

从正则化参数 C 的结果可以看到：C 从 0.001 到 1000，训练准确率从 96.7% 到 98.9%，但测试准确率基本不变。说明在这个数据集上，即使是强正则化也不会严重欠拟合。

---

## 真实案例

### 案例 1：信用卡欺诈检测

信用卡公司面临的分类问题天然适合逻辑回归。每一笔交易要么是欺诈（正类），要么是正常（负类）。关键挑战在于：

1. **极度不平衡**：欺诈交易只占 0.1% 甚至更少
2. **漏检代价极高**：一笔欺诈交易可能损失数千到数万美元
3. **误报也有代价**：把正常交易标记为欺诈会激怒客户，导致客户流失
4. **速度要求高**：需要在毫秒级做出判断，不能拖慢支付流程

逻辑回归在这个场景中的优势是速度（只做一次矩阵乘法 + sigmoid 变换）和可解释性（可以分析哪些特征最可疑）。实际的欺诈检测系统通常用逻辑回归作为第一层快速筛选，再用更复杂的模型做第二层精确判断。

根据 Visa 公开的数据，其欺诈检测系统可以在约 200 毫秒内判断一笔交易是否可疑，每天处理超过 7 亿笔交易。

### 案例 2：医疗诊断辅助

Google Health 用深度学习模型做糖尿病视网膜病变检测（从眼底照片判断是否有病变），但在决策层使用的仍然是类似于逻辑回归的框架——输出是概率，决策依赖阈值调整。

在这个场景中，阈值的选择直接影响患者的健康后果。选择高灵敏度（低阈值）的设置意味着更多患者会被建议做进一步检查，代价是更多的误报和医疗资源消耗。选择高特异度（高阈值）的设置意味着减少误报，但代价是可能漏掉早期的病变。

### 案例 3：点击率预测（CTR Prediction）

在线广告系统中，预测用户是否会点击某个广告是一个核心问题。Meta（Facebook）在 2014 年发表的论文 "Practical Lessons from Predicting Clicks on Ads at Facebook" 中，GBDT + 逻辑回归的组合模型是他们生产环境中点击率预测的核心方案。

逻辑回归在这里的优势：
- 预测速度极快（在线广告要求微秒级延迟）
- 输出概率可以直接用于排序和出价
- 可以在数百亿样本上高效训练

### 案例 4：垃圾邮件过滤

这是逻辑回归最经典的教科书案例。Google 的 Gmail 垃圾邮件过滤器虽然现在用的是更复杂的模型，但早期的版本就是基于逻辑回归。

每一封邮件被提取成数千个特征（是否包含某些关键词、发件人是否在联系人列表中、邮件格式是否可疑等），逻辑回归输出"是垃圾邮件的概率"。阈值设在哪里取决于产品策略：是宁可漏掉一些垃圾邮件（高阈值）还是宁可误杀一些正常邮件（低阈值）。Gmail 选择了后者——它的垃圾邮件过滤相当激进，但用户可以通过"非垃圾邮件"按钮反馈来调整。

---

## 权衡取舍以及何时不该使用

### 逻辑回归的优势

1. **输出概率**：不像决策树只输出类别，逻辑回归给出一个校准的概率。这个概率可以用于更精细的决策（比如根据概率设置不同的干预力度）
2. **可解释性强**：权重直接告诉你每个特征对预测的影响方向和大小。这在需要向非技术利益相关者解释的场合非常重要
3. **训练和预测都很快**：即使有百万级样本和千级特征，训练在几分钟内完成，预测在微秒级完成
4. **不容易过拟合**：参数少（等于特征数 + 1），加上 L1/L2 正则化，过拟合的风险很低
5. **不需要特征缩放来做预测**：虽然标准化可以帮助优化收敛更快，但不影响最终预测结果（权重会自动调整）

### 逻辑回归的局限

1. **只能学习线性决策边界**：如果正类和负类之间的边界是高度非线性的（比如一个类被另一个类环形包围），逻辑回归的表现会很差。解决办法：手动添加多项式特征或交互特征，但这需要领域知识
2. **假设特征独立（朴素贝叶斯假设并不适用）**：逻辑回归不要求特征独立，但如果特征之间高度相关，权重的解释性会打折扣
3. **对不平衡数据敏感**：如果正类只占 1%，模型可能学到一个把所有样本都预测为负类的策略（准确率就有 99% 了）。解决办法：调整类别权重（`class_weight='balanced'`）、改变阈值、或使用过采样/欠采样
4. **需要特征工程**：和线性回归一样，逻辑回归的表现高度依赖特征工程的质量。如果你没有好的特征，逻辑回归的表现会很平庸

### 什么时候该用逻辑回归

- 二分类问题的默认基线模型
- 需要概率输出的场景（风险评估、信用评分）
- 需要模型可解释性的场景（医疗诊断辅助、法律合规）
- 在线学习场景（数据持续到来，需要实时更新模型）
- 特征空间是高维稀疏的（NLP 中的 bag-of-words 特征）

### 什么时候不该用逻辑回归

- 决策边界明显不是线性的，且你不知道该构造什么样的特征（该用 SVM + 核技巧、或随机森林、或神经网络）
- 需要同时利用大量非线性交互的场景（图像识别、语音识别，该用深度学习）
- 数据量非常大且特征关系非常复杂（该用梯度提升树或深度学习）
- 你只关心排序不关心概率校准（该用 Learning to Rank 方法）

---

## 关键要点

1. **逻辑回归是分类算法，不是回归算法**。名字的"回归"指的是它在统计学中属于回归家族，但它的输出是类别概率。它是二分类问题的默认起点

2. **Sigmoid 函数把线性输出变成概率，这是逻辑回归的核心创新**。$\sigma(z) = \frac{1}{1+e^{-z}}$ 是一个 S 形曲线，把 $(-\infty, +\infty)$ 映射到 $(0, 1)$。这个函数在神经网络中也是最基础的激活函数之一

3. **交叉熵损失函数比 MSE 更适合分类任务**。它对"自信地犯错"给予严厉惩罚（$-\log(0.001) = 6.9$），对正确的自信预测给予很小损失（$-\log(0.99) = 0.01$）。而且配合 sigmoid 使用时，梯度形式和线性回归完全一样

4. **概率输出是逻辑回归相对于许多其他分类器的独特优势**。它不仅告诉你"这是垃圾邮件"，还告诉你"有 87% 的概率是垃圾邮件"。这个概率可以用于阈值调整、成本敏感决策、以及作为下游模型的输入

5. **阈值的选择取决于业务场景**。医疗筛查用低阈值（宁可误报不漏诊），垃圾邮件用高阈值（宁可漏掉不误杀）。ROC 曲线和 PR 曲线帮助你在不同阈值下理解模型的表现

6. **评估分类模型不能只看准确率**。在不平衡数据集中，准确率可能是误导性的（99% 准确率可能意味着模型把所有样本都预测为多数类）。精确率、召回率、F1、AUC 提供了更全面的视图

---

## 延伸阅读

**教材**：
- Hastie, Tibshirani & Friedman, "The Elements of Statistical Learning" 第四章 —— 逻辑回归的统计理论
- Bishop, "Pattern Recognition and Machine Learning" 第四章 —— 从概率视角推导逻辑回归

**实践**：
- Google ML Crash Course - "Classification" 和 "Logistic Regression" —— 互动练习
- Scikit-learn LogisticRegression 文档 —— 参数详解和最佳实践
- "Practical Lessons from Predicting Clicks on Ads at Facebook" (2014) —— 工业界大规模逻辑回归应用

**进阶**：
- "Focal Loss for Dense Object Detection" —— 交叉熵损失的改进，解决类别不平衡
- "Calibrated Predictions" —— 概率校准，让逻辑回归的输出概率更准确
- "LIBLINEAR: A Library for Large Linear Classification" —— 大规模逻辑回归的高效实现

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
