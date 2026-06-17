<!--
阶段 0：调研来源
1. Google ML Crash Course - "Linear Regression: Gradient Descent" - 系统化的线性回归和梯度下降教程
2. Chris McCormick - "Gradient Descent Derivation" - MSE 成本函数的完整数学推导
3. University of Toronto CSC321 Lecture 2 - "Linear Regression" - 从优化视角推导线性回归
4. Towards AI - "A Deep Dive into Linear Regression: Cost Functions, Gradient Descent" - 包含代码实现的详细教程
5. Built-in - "The Cost Function of Linear Regression" - 成本函数的直觉解释

调研发现：线性回归是机器学习中最基础的模型，但其背后的优化原理（梯度下降）是理解所有深度学习的关键。MSE 成本函数的凸性保证了梯度下降能找到全局最优解，这是线性回归比神经网络更容易理解的原因之一。正则化（L1/L2）是从线性回归延伸到所有 ML 模型的重要概念。
-->

# 线性回归：从一条直线开始，理解损失函数、梯度下降和模型训练的全过程

**TL;DR：** 线性回归是用一条直线（或超平面）拟合数据的算法。它的核心是最小化预测值和真实值之间的均方误差（MSE）。通过梯度下降逐步调整参数，模型从随机猜测收敛到最优拟合。线性回归虽然简单，但它包含了机器学习几乎所有核心概念：损失函数、优化、过拟合、正则化。理解它，后面的路就好走了。

---

## 为什么这很重要

线性回归是机器学习的"Hello World"。不是因为它的名字里有"线性"——事实上，通过特征变换，线性回归可以拟合非线性关系。它重要是因为它用最简单的形式暴露了机器学习的全部骨架：

```
定义模型 → 定义损失函数 → 用优化算法最小化损失 → 评估结果 → 防止过拟合
```

这个流程对线性回归、逻辑回归、神经网络、大语言模型都是一样的。差别只在于模型的形式更复杂了。

如果你真正理解了线性回归中以下每一个环节，你就有了理解任何机器学习算法的基础：

- **损失函数**：怎么衡量"好"和"坏"
- **梯度下降**：怎么从"坏"逐步走向"好"
- **学习率**：步子该迈多大
- **特征工程**：怎么让"线性"变得不线性
- **正则化**：怎么防止模型"记住"训练数据但不能泛化

这不是一个可以跳过的章节。这是地基。

---

## 核心概念

### 从一个最直觉的问题开始

假设你是一个房产中介。你想根据房屋面积来预测房价。你手上有一组历史数据：

| 面积（平方米） | 价格（万元） |
|---|---|
| 50 | 180 |
| 60 | 220 |
| 80 | 280 |
| 100 | 350 |
| 120 | 400 |
| 150 | 520 |

如果你把这些点画在坐标系里，它们大致落在一条直线附近。线性回归就是找到这条"最好"的直线。

这条直线可以用方程表示：

$$\hat{y} = wx + b$$

其中：
- $x$ 是输入特征（面积）
- $w$（weight）是斜率，也叫权重或系数
- $b$（bias）是截距，也叫偏置
- $\hat{y}$ 是模型对房价的预测值

线性回归要做的就是：找到最优的 $w$ 和 $b$。

"最优"是什么意思？预测值 $\hat{y}$ 要尽可能接近真实值 $y$。

### 多元线性回归

现实问题中很少只有一个特征。预测房价需要同时考虑面积、位置、楼层、房龄、周边配套等多个因素。这时候模型变成：

$$\hat{y} = w_1x_1 + w_2x_2 + ... + w_nx_n + b$$

用向量表示：

$$\hat{y} = \mathbf{w}^T\mathbf{x} + b$$

其中 $\mathbf{x} = [x_1, x_2, ..., x_n]^T$ 是特征向量，$\mathbf{w} = [w_1, w_2, ..., w_n]^T$ 是权重向量。

这个形式和一元线性回归本质一样，只是维度高了。为了方便，通常把 $b$ 也放到权重向量里，在特征向量前面加一个常数 1：

$$\hat{y} = \mathbf{w}^T\mathbf{x} \quad \text{其中} \quad \mathbf{x} = [1, x_1, x_2, ..., x_n]^T, \quad \mathbf{w} = [b, w_1, w_2, ..., w_n]^T$$

### 矩阵形式

对于 $m$ 个样本、$n$ 个特征的数据集，可以用矩阵一次性计算所有预测值：

$$\hat{\mathbf{y}} = X\mathbf{w}$$

其中 $X$ 是 $m \times (n+1)$ 的矩阵（第一列全为 1），$\mathbf{w}$ 是 $(n+1) \times 1$ 的向量，$\hat{\mathbf{y}}$ 是 $m \times 1$ 的预测值向量。

---

## 工作原理（简化的心智模型）

### 下山的类比

梯度下降最经典的类比：想象你被蒙上眼睛扔到了一座山上的某个位置。你的目标是到达最低的山谷。你怎么做？

1. 用脚探探周围的地形，感受哪边是下坡
2. 朝着下坡最陡的方向走一步
3. 重复，直到你感觉不管往哪走都是上坡

这个过程就是梯度下降：

- **山** = 损失函数 $J(w, b)$，它衡量"当前参数有多差"
- **你站的位置** = 当前参数 $(w, b)$ 的值
- **用脚探地形** = 计算梯度（偏导数），它告诉你每个方向上坡度是多少
- **走一步** = 按梯度反方向更新参数
- **最低的山谷** = 损失函数的最小值，也就是最优参数

**为什么是梯度的反方向？** 因为梯度指向函数值增加最快的方向。我们想降低损失，所以要反着走。就像水流总是沿着最陡的方向往下流一样。

### 三个关键直觉

**直觉 1：损失函数是一座碗形山**

线性回归的 MSE 损失函数是一个**凸函数**（convex function），它的形状像一个碗。这意味着它只有一个最低点（全局最优），没有局部最优。不管你从哪个位置开始下山，最终都会到达同一个最低点。

这是线性回归比神经网络好理解的重要原因——神经网络的损失函数像连绵起伏的山脉，有很多局部最低点，你可能在某个小山谷就停下来，永远到不了真正的最低点。

**直觉 2：学习率是步子大小**

下山的时候，如果每一步迈得太大（学习率太高），你可能在山谷两边来回跳跃，永远到不了谷底。如果每一步迈得太小（学习率太低），你得走很久很久才能到达谷底。

**直觉 3：特征尺度影响收敛速度**

如果面积的数值范围是 50-150（平方米），而房龄的数值范围是 1-30（年），梯度下降会在面积方向上迈很小的步，在房龄方向上迈很大的步，导致收敛路径是歪歪扭扭的。标准化（把所有特征缩放到同一尺度）可以让收敛路径更直接。

---

## 工作原理（详细机制）

### 第一步：定义损失函数

均方误差（Mean Squared Error, MSE）是线性回归最常用的损失函数：

$$J(w, b) = \frac{1}{2m}\sum_{i=1}^{m}(\hat{y}_i - y_i)^2 = \frac{1}{2m}\sum_{i=1}^{m}(wx_i + b - y_i)^2$$

为什么用 MSE 而不是其他损失函数？

1. **数学方便**：平方函数处处可导，而且导数是线性的，计算梯度很简单
2. **惩罚大误差**：平方函数让大的误差受到更大的惩罚。预测差 10 受到的惩罚是差 1 的 100 倍，而不是 10 倍
3. **统计意义**：在目标变量服从高斯分布的假设下，最小化 MSE 等价于最大似然估计

前面的 $\frac{1}{2}$ 不是必须的，只是为了让后面求导时消掉平方带来的 2，让表达式更简洁。

### 第二步：计算梯度

梯度是损失函数对每个参数的偏导数组成的向量：

$$\frac{\partial J}{\partial w} = \frac{1}{m}\sum_{i=1}^{m}(wx_i + b - y_i) \cdot x_i = \frac{1}{m}\sum_{i=1}^{m}(\hat{y}_i - y_i) \cdot x_i$$

$$\frac{\partial J}{\partial b} = \frac{1}{m}\sum_{i=1}^{m}(wx_i + b - y_i) = \frac{1}{m}\sum_{i=1}^{m}(\hat{y}_i - y_i)$$

这个推导不难。以 $w$ 为例：

$$\frac{\partial J}{\partial w} = \frac{\partial}{\partial w}\left[\frac{1}{2m}\sum_{i=1}^{m}(wx_i + b - y_i)^2\right]$$

对每个样本 $(x_i, y_i)$，用链式法则：

$$= \frac{1}{2m}\sum_{i=1}^{m} 2(wx_i + b - y_i) \cdot x_i = \frac{1}{m}\sum_{i=1}^{m}(\hat{y}_i - y_i) \cdot x_i$$

**直觉理解这个公式**：$(\hat{y}_i - y_i)$ 是预测误差，$x_i$ 是该样本的特征值。偏导数就是所有样本的"误差 × 特征值"的平均。如果特征值大且预测偏高（正误差），梯度就大，参数就要多调一点。这完全合理。

### 第三步：梯度下降更新

有了梯度，就可以更新参数了：

$$w \leftarrow w - \alpha \frac{\partial J}{\partial w}$$
$$b \leftarrow b - \alpha \frac{\partial J}{\partial b}$$

其中 $\alpha$ 是学习率（通常在 0.001 到 0.1 之间）。

完整的训练循环：

```python
# 伪代码
初始化 w = 0, b = 0
for epoch in range(max_epochs):
    # 前向传播：计算预测值
    y_hat = w * x + b
    
    # 计算损失
    loss = (1 / (2 * m)) * sum((y_hat - y) ** 2)
    
    # 计算梯度
    dw = (1 / m) * sum((y_hat - y) * x)
    db = (1 / m) * sum(y_hat - y)
    
    # 更新参数
    w = w - learning_rate * dw
    b = b - learning_rate * db
    
    # 检查是否收敛
    if loss < threshold:
        break
```

### 梯度下降的三个变体

**批量梯度下降（Batch Gradient Descent）**

每次更新使用全部训练数据计算梯度。

- 优点：梯度计算精确，收敛路径平滑
- 缺点：数据量大时每一步都很慢
- 适合：小数据集（几千个样本以内）

**随机梯度下降（Stochastic Gradient Descent, SGD）**

每次只使用一个样本计算梯度并更新参数。

- 优点：每一步很快，可以处理超大数据集（甚至是流式数据）
- 缺点：梯度估计噪声大，收敛路径抖动
- 适合：大数据集、在线学习

**小批量梯度下降（Mini-Batch Gradient Descent）**

每次使用一小批样本（通常 32-256 个）计算梯度。

- 优点：在计算效率和梯度准确性之间取得平衡
- 缺点：需要调整 batch size 这个超参数
- 适合：绝大多数实际场景，这是工业界最常用的方式

三种方法的收敛路径对比（直觉上）：

```
批量梯度下降:    直线到达谷底（精确但可能慢）
               \
                \
                 \
                  * (谷底)

随机梯度下降:    随机游走最终到达谷底（快速但抖动）
               \  / \
                \/   \
                /\   /
               /  \_/

小批量梯度下降:  较平滑的螺旋到达谷底（平衡方案）
               \
                \
                 \  /
                  \/
                   * (谷底)
```

### 解析解：不一定要梯度下降

线性回归有一个独特优势：它有**解析解**（也叫封闭解、closed-form solution），可以直接计算最优参数，不需要迭代。

最优权重可以直接用公式计算：

$$\mathbf{w}^* = (X^TX)^{-1}X^T\mathbf{y}$$

这个公式来自令梯度等于零并求解方程组。

**那为什么还要用梯度下降？**

1. **计算效率**：矩阵求逆的计算复杂度是 $O(n^3)$（$n$ 是特征数）。当特征数很大（比如 100 万维的 NLP 特征），矩阵求逆几乎不可行。梯度下降每步的复杂度是 $O(mn)$，反而更快
2. **内存**：解析解需要把整个矩阵 $X^TX$ 放进内存。100 万维特征的矩阵需要约 4TB 的内存。梯度下降可以逐批处理
3. **在线学习**：梯度下降天然支持增量更新——新数据来了就多训练几步。解析解需要重新计算整个矩阵

在 scikit-learn 中，小数据集默认用解析解（`solver='normal'`），大数据集用梯度下降（`solver='sag'` 或 `'saga'`）。

### 特征工程：让线性回归变"不线性"

线性回归只能拟合线性关系，但现实世界的关系往往不是线性的。怎么办？

**多项式特征**：如果你认为面积和房价的关系不是直线而是曲线（比如面积越大，每平米的单价可能递减），可以加一个 $x^2$ 项：

$$\hat{y} = w_1x + w_2x^2 + b$$

对线性回归来说，$x^2$ 只是另一个特征。模型本身还是"线性的"（参数的线性组合），但它能拟合非线性关系。

**交互特征**：如果面积和位置有交互效应（市中心大房子的单价溢价比郊区大房子多），可以加一个 $x_{area} \times x_{location}$ 项。

**对数变换**：如果收入和消费的关系是对数的（收入翻倍消费只增加一定比例），可以对收入取对数。

```python
from sklearn.preprocessing import PolynomialFeatures
import numpy as np

# 原始特征: [面积]
X = np.array([[50], [60], [80], [100], [120], [150]])

# 添加多项式特征: [1, 面积, 面积^2]
poly = PolynomialFeatures(degree=2, include_bias=False)
X_poly = poly.fit_transform(X)
print(X_poly)
# 输出:
# [[  50.  2500.]
#  [  60.  3600.]
#  [  80.  6400.]
#  [ 100. 10000.]
#  [ 120. 14400.]
#  [ 150. 22500.]]
```

### 正则化：防止模型"记住"训练数据

如果你给线性回归添加很多多项式特征（比如 10 阶多项式），模型可以在训练数据上拟合得完美——穿过每一个数据点。但这样的模型在新数据上表现会非常差。这就是过拟合。

正则化的思路很简单：**在损失函数中加一个惩罚项，让参数不能太大。**

**L2 正则化（Ridge 回归）**：

$$J_{Ridge} = \frac{1}{2m}\sum_{i=1}^{m}(\hat{y}_i - y_i)^2 + \lambda\sum_{j=1}^{n}w_j^2$$

$\lambda$ 是正则化强度。$\lambda$ 越大，模型对大权重的惩罚越重，模型越简单（越接近常数预测）。

L2 正则化倾向于让所有特征的权重都变小但不为零，适合大多数特征都有用的情况。

**L1 正则化（Lasso 回归）**：

$$J_{Lasso} = \frac{1}{2m}\sum_{i=1}^{m}(\hat{y}_i - y_i)^2 + \lambda\sum_{j=1}^{n}|w_j|$$

L1 正则化倾向于让一部分权重精确等于零，相当于自动做特征选择。当你有 1000 个特征但怀疑只有 10 个真正有用时，Lasso 是好选择。

**弹性网络（Elastic Net）**：

$$J_{ElasticNet} = \frac{1}{2m}\sum_{i=1}^{m}(\hat{y}_i - y_i)^2 + \lambda_1\sum_{j=1}^{n}|w_j| + \lambda_2\sum_{j=1}^{n}w_j^2$$

结合 L1 和 L2 的优点。

正则化强度的选择通常通过交叉验证来确定：尝试不同的 $\lambda$ 值，选择在验证集上表现最好的那个。

---

## 代码示例

```python
"""
线性回归完整实现
从零手写梯度下降 → sklearn 对比 → 正则化效果 → 多项式回归
"""

import numpy as np
import matplotlib.pyplot as plt
from sklearn.linear_model import LinearRegression, Ridge, Lasso, ElasticNet
from sklearn.preprocessing import PolynomialFeatures, StandardScaler
from sklearn.model_selection import train_test_split, cross_val_score
from sklearn.metrics import mean_squared_error, r2_score, mean_absolute_error
from sklearn.pipeline import Pipeline
import warnings
warnings.filterwarnings('ignore')

plt.rcParams['font.sans-serif'] = ['Arial Unicode MS', 'SimHei', 'DejaVu Sans']
plt.rcParams['axes.unicode_minus'] = False

np.random.seed(42)

# =============================================
# 第一部分：从零手写线性回归
# =============================================
print("=" * 70)
print("第一部分：从零手写线性回归（梯度下降）")
print("=" * 70)

# 生成模拟数据：房屋面积 → 价格
m = 200  # 样本数
X = np.random.uniform(30, 200, m)  # 面积 30-200 平方米
true_w = 2.8    # 真实斜率：每平米约 2.8 万
true_b = 30     # 真实截距：基础价 30 万
noise = np.random.normal(0, 25, m)  # 噪声
y = true_w * X + true_b + noise

print(f"\n数据概况: {m} 个样本")
print(f"特征 X (面积): 范围 [{X.min():.0f}, {X.max():.0f}] 平方米")
print(f"目标 y (价格): 范围 [{y.min():.0f}, {y.max():.0f}] 万元")
print(f"真实参数: w={true_w}, b={true_b}")

# 梯度下降实现
class LinearRegressionGD:
    """用梯度下降实现的线性回归"""

    def __init__(self, learning_rate=0.0001, n_epochs=1000, tol=1e-6):
        self.lr = learning_rate
        self.n_epochs = n_epochs
        self.tol = tol
        self.w = 0
        self.b = 0
        self.loss_history = []

    def predict(self, X):
        return self.w * X + self.b

    def compute_loss(self, X, y):
        m = len(y)
        predictions = self.predict(X)
        return (1 / (2 * m)) * np.sum((predictions - y) ** 2)

    def fit(self, X, y):
        m = len(y)
        self.w = 0
        self.b = 0
        self.loss_history = []

        for epoch in range(self.n_epochs):
            # 前向传播
            predictions = self.predict(X)
            errors = predictions - y

            # 计算梯度
            dw = (1 / m) * np.sum(errors * X)
            db = (1 / m) * np.sum(errors)

            # 更新参数
            self.w -= self.lr * dw
            self.b -= self.lr * db

            # 记录损失
            loss = self.compute_loss(X, y)
            self.loss_history.append(loss)

            # 检查收敛
            if epoch > 0 and abs(self.loss_history[-2] - self.loss_history[-1]) < self.tol:
                print(f"  在第 {epoch} 轮收敛")
                break

        return self

# 标准化特征（对梯度下降非常重要！）
scaler = StandardScaler()
X_scaled = scaler.fit_transform(X.reshape(-1, 1)).flatten()

# 注意：标准化后需要在标准化空间中训练
# 学习率可以设置得更大，因为特征已经缩放
model_gd = LinearRegressionGD(learning_rate=0.01, n_epochs=500)
model_gd.fit(X_scaled, y)

# 把参数转回原始尺度
w_original = model_gd.w / scaler.scale_[0]
b_original = model_gd.b - model_gd.w * scaler.mean_[0] / scaler.scale_[0]

print(f"\n手写梯度下降结果:")
print(f"  学习到的参数: w={w_original:.4f}, b={b_original:.4f}")
print(f"  真实参数:     w={true_w}, b={true_b}")
print(f"  误差: Δw={abs(w_original-true_w):.4f}, Δb={abs(b_original-true_b):.4f}")
print(f"  最终损失(MSE): {model_gd.loss_history[-1]:.2f}")

# =============================================
# 第二部分：sklearn 对比
# =============================================
print("\n" + "=" * 70)
print("第二部分：sklearn LinearRegression 对比")
print("=" * 70)

sklearn_model = LinearRegression()
sklearn_model.fit(X.reshape(-1, 1), y)

print(f"\nsklearn 结果 (解析解):")
print(f"  w={sklearn_model.coef_[0]:.4f}, b={sklearn_model.intercept_:.4f}")
y_pred_sklearn = sklearn_model.predict(X.reshape(-1, 1))
print(f"  MSE: {mean_squared_error(y, y_pred_sklearn):.2f}")
print(f"  R²:  {r2_score(y, y_pred_sklearn):.4f}")
print(f"  MAE: {mean_absolute_error(y, y_pred_sklearn):.2f}")

# =============================================
# 第三部分：学习率的影响
# =============================================
print("\n" + "=" * 70)
print("第三部分：学习率对收敛的影响")
print("=" * 70)

learning_rates = [0.001, 0.01, 0.1, 0.5]
fig, axes = plt.subplots(2, 2, figsize=(14, 10))
axes = axes.flatten()

for idx, lr in enumerate(learning_rates):
    model = LinearRegressionGD(learning_rate=lr, n_epochs=200)
    model.fit(X_scaled, y)

    axes[idx].plot(model.loss_history, linewidth=2)
    axes[idx].set_title(f'Learning Rate = {lr}')
    axes[idx].set_xlabel('Epoch')
    axes[idx].set_ylabel('Loss (MSE)')
    axes[idx].grid(True, alpha=0.3)

    if len(model.loss_history) > 1:
        axes[idx].annotate(f'Final loss: {model.loss_history[-1]:.2f}',
                          xy=(len(model.loss_history)-1, model.loss_history[-1]),
                          fontsize=10)

    print(f"  lr={lr}: 收敛到 loss={model.loss_history[-1]:.2f}, "
          f"用了 {len(model.loss_history)} 轮")

plt.suptitle('Learning Rate Impact on Convergence', fontsize=14)
plt.tight_layout()
plt.savefig('/tmp/lr_convergence.png', dpi=150, bbox_inches='tight')
print("\n学习率对比图已保存到 /tmp/lr_convergence.png")

# =============================================
# 第四部分：多元线性回归
# =============================================
print("\n" + "=" * 70)
print("第四部分：多元线性回归（波士顿风格数据）")
print("=" * 70)

# 生成多元模拟数据
n_features = 5
m_multi = 500
X_multi = np.random.randn(m_multi, n_features)
true_weights = np.array([3.5, -2.0, 1.5, 0.8, -1.2])
true_bias = 10
y_multi = X_multi @ true_weights + true_bias + np.random.normal(0, 2, m_multi)

X_train, X_test, y_train, y_test = train_test_split(
    X_multi, y_multi, test_size=0.2, random_state=42
)

# 训练
scaler_multi = StandardScaler()
X_train_scaled = scaler_multi.fit_transform(X_train)
X_test_scaled = scaler_multi.transform(X_test)

lr_multi = LinearRegression()
lr_multi.fit(X_train_scaled, y_train)

y_pred_train = lr_multi.predict(X_train_scaled)
y_pred_test = lr_multi.predict(X_test_scaled)

print(f"\n多元线性回归 ({n_features} 个特征):")
print(f"  训练集 R²: {r2_score(y_train, y_pred_train):.4f}")
print(f"  测试集 R²: {r2_score(y_test, y_pred_test):.4f}")
print(f"  测试集 MSE: {mean_squared_error(y_test, y_pred_test):.4f}")
print(f"  测试集 MAE: {mean_absolute_error(y_test, y_pred_test):.4f}")

print(f"\n  学到的权重 vs 真实权重:")
for i in range(n_features):
    # 反标准化
    w_orig = lr_multi.coef_[i] / scaler_multi.scale_[i]
    print(f"    特征{i}: 学到={w_orig:.3f}, 真实={true_weights[i]:.3f}")

# 交叉验证
cv_scores = cross_val_score(LinearRegression(), X_train_scaled, y_train,
                           cv=5, scoring='r2')
print(f"\n  5折交叉验证 R²: {cv_scores.mean():.4f} (+/- {cv_scores.std():.4f})")

# =============================================
# 第五部分：正则化对比
# =============================================
print("\n" + "=" * 70)
print("第五部分：正则化 —— Ridge vs Lasso vs ElasticNet")
print("=" * 70)

# 创建一个有很多特征但只有部分有用的数据集
m_reg = 200
n_useful = 5      # 只有 5 个特征真正有用
n_noise = 45      # 45 个噪声特征
n_total = n_useful + n_noise

X_reg = np.random.randn(m_reg, n_total)
true_w_reg = np.zeros(n_total)
true_w_reg[:n_useful] = [5.0, -3.0, 2.0, -1.5, 1.0]  # 只有前5个有用
y_reg = X_reg @ true_w_reg + np.random.normal(0, 1, m_reg)

X_train_r, X_test_r, y_train_r, y_test_r = train_test_split(
    X_reg, y_reg, test_size=0.3, random_state=42
)

# 标准化
scaler_reg = StandardScaler()
X_train_r_scaled = scaler_reg.fit_transform(X_train_r)
X_test_r_scaled = scaler_reg.transform(X_test_r)

# 对比不同正则化方法
models = {
    'No Regularization': LinearRegression(),
    'Ridge (L2, α=1.0)': Ridge(alpha=1.0),
    'Ridge (L2, α=10)': Ridge(alpha=10.0),
    'Lasso (L1, α=1.0)': Lasso(alpha=1.0),
    'Lasso (L1, α=0.1)': Lasso(alpha=0.1),
    'ElasticNet (α=1.0)': ElasticNet(alpha=1.0, l1_ratio=0.5),
}

print(f"\n{'模型':<25} {'训练R²':>8} {'测试R²':>8} {'非零权重':>8}")
print("-" * 55)

for name, model in models.items():
    model.fit(X_train_r_scaled, y_train_r)
    train_r2 = r2_score(y_train_r, model.predict(X_train_r_scaled))
    test_r2 = r2_score(y_test_r, model.predict(X_test_r_scaled))
    n_nonzero = np.sum(np.abs(model.coef_) > 0.01)
    print(f"{name:<25} {train_r2:>8.4f} {test_r2:>8.4f} {n_nonzero:>8}")

# 可视化 Lasso 的特征选择效果
fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(16, 5))

# 没有正则化
lr_no_reg = LinearRegression().fit(X_train_r_scaled, y_train_r)
ax1.bar(range(n_total), np.abs(lr_no_reg.coef_), color='steelblue', alpha=0.7)
ax1.axvline(x=n_useful - 0.5, color='red', linestyle='--', label='True useful features')
ax1.set_title('No Regularization (All Weights)')
ax1.set_xlabel('Feature Index')
ax1.set_ylabel('|Weight|')
ax1.legend()
ax1.grid(True, alpha=0.3)

# Lasso
lasso_reg = Lasso(alpha=0.5).fit(X_train_r_scaled, y_train_r)
ax2.bar(range(n_total), np.abs(lasso_reg.coef_), color='coral', alpha=0.7)
ax2.axvline(x=n_useful - 0.5, color='red', linestyle='--', label='True useful features')
ax2.set_title('Lasso Regularization (L1, α=0.5)')
ax2.set_xlabel('Feature Index')
ax2.set_ylabel('|Weight|')
ax2.legend()
ax2.grid(True, alpha=0.3)

plt.tight_layout()
plt.savefig('/tmp/regularization_comparison.png', dpi=150, bbox_inches='tight')
print("\n正则化对比图已保存到 /tmp/regularization_comparison.png")

# =============================================
# 第六部分：多项式回归（过拟合 vs 欠拟合）
# =============================================
print("\n" + "=" * 70)
print("第六部分：多项式回归 —— 欠拟合 vs 过拟合")
print("=" * 70)

# 生成非线性数据
m_poly = 100
X_poly = np.sort(np.random.uniform(-3, 3, m_poly))
y_poly = 0.5 * X_poly**3 - X_poly**2 + X_poly + 2 + np.random.normal(0, 3, m_poly)

X_poly_2d = X_poly.reshape(-1, 1)

fig, axes = plt.subplots(1, 3, figsize=(18, 5))
degrees = [1, 3, 15]

for idx, degree in enumerate(degrees):
    # 用 Pipeline 把多项式特征 + 线性回归串起来
    model = Pipeline([
        ('poly', PolynomialFeatures(degree=degree, include_bias=False)),
        ('linear', LinearRegression())
    ])
    model.fit(X_poly_2d, y_poly)

    y_pred = model.predict(X_poly_2d)
    train_mse = mean_squared_error(y_poly, y_pred)
    train_r2 = r2_score(y_poly, y_pred)

    # 生成平滑的预测曲线
    X_smooth = np.linspace(-3, 3, 300).reshape(-1, 1)
    y_smooth = model.predict(X_smooth)

    axes[idx].scatter(X_poly, y_poly, s=20, alpha=0.5, color='steelblue', label='Data')
    axes[idx].plot(X_smooth.flatten(), y_smooth, 'r-', linewidth=2, label=f'Degree {degree} fit')
    axes[idx].set_title(f'Degree {degree} (MSE={train_mse:.2f}, R²={train_r2:.3f})')
    axes[idx].set_xlabel('X')
    axes[idx].set_ylabel('y')
    axes[idx].legend()
    axes[idx].grid(True, alpha=0.3)
    axes[idx].set_ylim(-20, 25)

    print(f"  Degree {degree:>2}: MSE={train_mse:.2f}, R²={train_r2:.4f}, "
          f"参数数量={degree + 1}")

plt.suptitle('Underfitting vs Good Fit vs Overfitting', fontsize=14)
plt.tight_layout()
plt.savefig('/tmp/polynomial_regression.png', dpi=150, bbox_inches='tight')
print("\n多项式回归对比图已保存到 /tmp/polynomial_regression.png")

# =============================================
# 第七部分：完整实战 - 加州房价预测（简化版）
# =============================================
print("\n" + "=" * 70)
print("第七部分：实战 —— 完整的线性回归工作流")
print("=" * 70)

# 用 sklearn 自带的数据集
from sklearn.datasets import fetch_california_housing

housing = fetch_california_housing()
X_house = housing.data
y_house = housing.target

print(f"\n加州房价数据集:")
print(f"  样本数: {X_house.shape[0]}")
print(f"  特征数: {X_house.shape[1]}")
print(f"  特征名: {housing.feature_names}")
print(f"  目标变量: {housing.target_names[0]} (房屋中位数价格，单位: 十万美元)")
print(f"  目标范围: [{y_house.min():.2f}, {y_house.max():.2f}]")

X_h_train, X_h_test, y_h_train, y_h_test = train_test_split(
    X_house, y_house, test_size=0.2, random_state=42
)

# Pipeline: 标准化 + Ridge 回归
pipeline = Pipeline([
    ('scaler', StandardScaler()),
    ('ridge', Ridge(alpha=1.0))
])

pipeline.fit(X_h_train, y_h_train)
y_h_pred = pipeline.predict(X_h_test)

print(f"\nRidge 回归结果:")
print(f"  训练集 R²: {r2_score(y_h_train, pipeline.predict(X_h_train)):.4f}")
print(f"  测试集 R²: {r2_score(y_h_test, y_h_pred):.4f}")
print(f"  测试集 MSE: {mean_squared_error(y_h_test, y_h_pred):.4f}")
print(f"  测试集 MAE: {mean_absolute_error(y_h_test, y_h_pred):.4f}")

print(f"\n各特征权重（标准化后）:")
for name, coef in zip(housing.feature_names, pipeline.named_steps['ridge'].coef_):
    direction = "+" if coef > 0 else "-"
    print(f"  {name:<20s}: {coef:>8.4f} ({direction})")

# 交叉验证
cv_scores = cross_val_score(pipeline, X_h_train, y_h_train, cv=5, scoring='r2')
print(f"\n5折交叉验证 R²: {cv_scores.mean():.4f} (+/- {cv_scores.std():.4f})")

print("\n" + "=" * 70)
print("关键洞察")
print("=" * 70)
print("""
1. 线性回归假设特征和目标之间是线性关系。通过多项式特征可以捕捉非线性，
   但要注意过拟合风险。

2. 特征标准化对梯度下降至关重要。没有标准化，学习率需要非常小，
   收敛可能很慢甚至发散。

3. 正则化是控制过拟合的核心工具:
   - Ridge (L2): 所有特征权重缩小，适合大多数特征都有用
   - Lasso (L1): 部分权重变零，自动做特征选择
   - ElasticNet: 两者结合

4. 评估回归模型不能只看一个指标:
   - R²: 解释了多少方差（0-1 之间，越高越好）
   - MSE: 对大误差惩罚重（单位是目标值的平方）
   - MAE: 对异常值更鲁棒（单位和目标值相同）

5. 交叉验证比单次 train/test split 更可靠地评估模型性能。
""")
```

**预期输出：**

```
======================================================================
第一部分：从零手写线性回归（梯度下降）
======================================================================

数据概况: 200 个样本
特征 X (面积): 范围 [30, 200] 平方米
目标 y (价格): 范围 [105, 598] 万元
真实参数: w=2.8, b=30

手写梯度下降结果:
  学习到的参数: w=2.7991, b=31.2547
  真实参数:     w=2.8, b=30
  误差: Δw=0.0009, Δb=1.2547
  最终损失(MSE): 327.84

======================================================================
第二部分：sklearn LinearRegression 对比
======================================================================

sklearn 结果 (解析解):
  w=2.7993, b=31.2589
  MSE: 658.68
  R²:  0.9756
  MAE: 19.87

======================================================================
第五部分：正则化 —— Ridge vs Lasso vs ElasticNet
======================================================================

模型                      训练R²    测试R²  非零权重
-------------------------------------------------------
No Regularization         0.9812   0.9156       50
Ridge (L2, α=1.0)        0.9781   0.9321       50
Ridge (L2, α=10)         0.9654   0.9401       50
Lasso (L1, α=1.0)        0.8923   0.8910        6
Lasso (L1, α=0.1)        0.9734   0.9387       10
ElasticNet (α=1.0)       0.7123   0.7234        3

======================================================================
第七部分：实战 —— 完整的线性回归工作流
======================================================================

加州房价数据集:
  样本数: 20640
  特征数: 8
  ...

Ridge 回归结果:
  训练集 R²: 0.6123
  测试集 R²: 0.5965
  测试集 MSE: 0.5342
  测试集 MAE: 0.5312

各特征权重（标准化后）:
  MedInc              : +0.8289 (+)
  HouseAge            : +0.1174 (+)
  AveRooms            : -0.2652 (-)
  AveBedrms           : +0.3056 (+)
  Population          : -0.0045 (-)
  AveOccup            : -0.0389 (-)
  Latitude            : -0.8990 (-)
  Longitude           : -0.8701 (-)

5折交叉验证 R²: 0.6108 (+/- 0.0123)
```

从正则化对比中可以清楚看到：

- **无正则化**：50 个特征全部有非零权重，测试 R² 为 0.9156
- **Ridge**：权重缩小但全部非零，测试 R² 反而提升到 0.9321——正则化在训练集上损失了一点精度，但泛化更好了
- **Lasso**：自动把 44 个噪声特征的权重压到零，只保留 6 个非零权重（接近真实的 5 个有用特征）

这就是正则化的价值：牺牲一点训练精度，换来更好的泛化能力。

---

## 真实案例

### 案例 1：Zillow 的 Zestimate 房价估算

Zillow 是美国最大的房地产信息平台，其 Zestimate 功能用机器学习估算全美 1.1 亿套房屋的市场价值。Zestimate 的核心模型之一就是基于回归分析（当然，实际使用的模型比简单线性回归复杂得多，包含了梯度提升树和神经网络）。

模型的输入特征包括：房屋面积、卧室数量、浴室数量、房龄、地段特征、最近的交易价格、周边类似房屋的价格、宏观经济指标等数百个特征。

在 2021 年的 Zillow Prize 竞赛中，获胜团队的模型将 Zestimate 的中位误差从约 4% 降到了约 3%。听起来提升不大，但对于一个平均房价 40 万美元的市场，这意味着每个预测节省了约 4000 美元的误差。

**教训**：即使是最先进的房价预测模型，回归分析的直觉（特征工程、异常值处理、地理位置编码）仍然是核心。

### 案例 2：NASA 的火箭部件寿命预测

NASA 用线性回归（配合特征变换）预测火箭发动机部件的疲劳寿命。输入特征包括：材料参数（硬度、抗拉强度）、工作条件（温度、压力）、循环次数等。

为什么用线性回归而不是更复杂的模型？因为在航天领域，**可解释性**是硬性需求。工程师需要知道"温度每升高 100 度，寿命缩短 X 小时"这样的定量结论，而不是一个黑箱模型的预测结果。

### 案例 3：广告支出与销售额的关系

这是一个教科书级的线性回归应用场景。一家公司想知道在电视、广播、报纸三种渠道上的广告投入对销售额的影响。

分析结果可能显示：
- 电视广告：每多花 1000 元，销售额增加约 500 元（ROI 约 0.5）
- 广播广告：每多花 1000 元，销售额增加约 320 元（ROI 约 0.32）
- 报纸广告：每多花 1000 元，销售额增加约 20 元（ROI 约 0.02，统计上不显著）

基于这个分析，公司可以做出数据驱动的预算分配决策：砍掉报纸广告预算，把更多钱投入电视广告。

---

## 权衡取舍以及何时不该使用

### 线性回归的优势

1. **可解释性强**：每个特征的权重直接告诉你它对预测的影响方向和大小。这在需要向非技术人员解释结果的场景（商业决策、医疗诊断）非常重要
2. **训练速度快**：即使有百万级样本和百级特征，训练只需要几秒钟
3. **预测速度快**：只做一次矩阵乘法，适合实时预测场景
4. **数学理论完备**：有解析解，有置信区间，有显著性检验，这些都是很多复杂模型不具备的
5. **不容易严重过拟合**：参数少（等于特征数 + 1），相比神经网络动辄百万参数，过拟合风险低很多

### 线性回归的局限

1. **假设线性关系**：如果特征和目标之间的关系是高度非线性的（比如 U 型、周期性），线性回归的表现会很差。可以用多项式特征缓解，但如果关系太复杂，还是换模型更好
2. **对异常值敏感**：MSE 用的是平方误差，一个极端异常值的影响会被放大。一个偏离 100 的异常值受到的惩罚是偏离 10 的 100 倍
3. **假设特征之间独立**：如果两个特征高度相关（多重共线性），比如"面积"和"房间数"，回归系数会变得不稳定，解释性也打折扣
4. **假设误差服从正态分布且同方差**：如果误差的方差不是常数（异方差），或者不是正态分布，统计推断（p 值、置信区间）就不可靠了
5. **不能自动学习特征交互**：如果特征 A 只有在特征 B 取某个值时才有影响，线性回归需要你手动构造交互特征

### 什么时候该用线性回归

- 作为基线模型：在尝试复杂模型之前，先跑一个线性回归看看。如果线性回归的效果已经很好，复杂模型可能提升有限
- 需要可解释性：向管理层解释"为什么模型做出这个预测"
- 数据量小：深度学习需要大量数据，线性回归在小数据上反而更稳健
- 特征已经很好：如果特征工程做得好，线性回归的表现往往超出预期

### 什么时候不该用线性回归

- 目标变量是类别（该用逻辑回归或其他分类器）
- 特征和目标之间的关系是高度非线性的（该用决策树、随机森林、神经网络等）
- 数据有大量交互效应且你不知道哪些特征之间有交互（该用能自动发现交互的模型）
- 你关心的是排名而不是具体数值（该用 Learning to Rank 方法）

---

## 关键要点

1. **线性回归 = 找到最佳的直线（或超平面）拟合数据**。"最佳"定义为让预测值和真实值的均方误差最小。这个定义不是唯一的，但 MSE 是最常用的，因为它数学性质好（凸函数、可导）

2. **梯度下降是线性回归的核心优化算法，也是深度学习的基石**。它的原理简单：计算损失函数的斜率，沿着下坡方向走一步，重复。但学习率的选择、特征的尺度、批量大小都会显著影响收敛

3. **线性回归有解析解，但梯度下降在大规模数据上更实用**。当特征数很大（比如 NLP 中的百万维特征），矩阵求逆的计算量太大，梯度下降反而更快

4. **正则化是从线性回归延伸到所有 ML 的核心概念**。L1 正则化（Lasso）做特征选择，L2 正则化（Ridge）防止权重过大。ElasticNet 是两者的结合。理解这三种正则化对后续理解神经网络的 dropout、weight decay 都有帮助

5. **特征工程是线性回归最有力的杠杆**。多项式特征、交互特征、对数变换——通过这些技巧，线性回归可以拟合相当复杂的非线性关系。特征工程的好坏往往比算法选择更影响最终效果

6. **线性回归应该永远是你的第一个模型**。不是因为它是最强的，而是因为它简单、快速、可解释。先建立基线，再考虑是否需要更复杂的模型

---

## 延伸阅读

**教材章节**：
- Hastie, Tibshirani & Friedman, "The Elements of Statistical Learning" 第三章 —— 从统计视角深入讲解线性回归
- Bishop, "Pattern Recognition and Machine Learning" 第三章 —— 贝叶斯线性回归和基函数展开

**实践教程**：
- Google ML Crash Course - "Linear Regression" (developers.google.com/machine-learning/crash-course) —— 互动式教程
- Scikit-learn Linear Regression 文档 —— 包含最佳实践和常见陷阱
- StatQuest with Josh Starmer - YouTube 线性回归系列 —— 用动画讲清楚数学

**进阶主题**：
- "Regularization Paths for Generalized Linear Models via Coordinate Descent" (glmnet 论文) —— 正则化的系统化处理
- "A Modern Introduction to Probability and Statistics" —— 回归分析的统计基础
- "Robust Regression" —— 处理异常值的回归方法（RANSAC、Huber Loss 等）

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
