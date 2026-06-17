<!--
调研来源：
1. IBM "What is feature engineering" — 特征工程是"将原始数据转化为模型可用的相关信息"的过程定义
2. Towards Data Science "Feature Engineering Techniques" — 数值、类别、文本特征的系统化处理方法
3. Kaggle 社区讨论 "Feature Engineering tips for data science and competitions" — 竞赛中证明有效的特征工程技巧
4. Databricks "What is Feature Engineering" — 生产环境中特征工程的实践和 Feature Store 的概念
5. ScienceDirect "On the importance of domain expertise in feature engineering" — 研究表明领域专家设计的特征比自动特征工程更有效

核心发现：
- 领域知识是特征工程最重要的输入。知道哪些特征"在业务上说得通"比盲目尝试所有变换更高效
- 数值特征最重要的处理是：处理异常值、缩放（树模型不需要）、对数/Box-Cox 变换消除偏态
- 类别特征的核心选择是：低基数用 One-Hot，高基数用 Target Encoding（但要注意泄露），有序的用 Ordinal
- 时间特征是很多实际场景中信息量最大的特征类型：周期性编码、时间间隔、聚合统计
- 在深度学习时代，特征工程对结构化数据仍然极其重要，但对非结构化数据（图像、文本）的重要性下降了
-->

# 特征工程：数值、类别、文本、时间特征的处理方法，以及什么真的有效

**TL;DR：** 特征工程是把原始数据变成模型能理解的"信号"的过程。好的特征工程能让简单模型打败复杂模型——Kaggle 竞赛中很多获胜方案用的不是最复杂的模型，而是最巧妙的特征。数值特征要处理异常值和分布偏态，类别特征根据基数和有序性选择编码方式，时间特征是最容易被忽视但信息量最大的特征类型。但最重要的原则是：**领域知识 > 自动化方法**。先理解业务，再做特征工程。

## 为什么这很重要

Kaggle 上有一个经典竞赛：Rossmann Store Sales（预测药店的日销售额）。获胜团队的关键不是用了多复杂的模型，而是做了极其细致的特征工程：

- 提取了"距离上次促销的天数"
- 计算了"同类型商店在该地区的平均销售额"
- 加入了"学校假期与周末的重叠"标志
- 把日期分解为"月中的第几天"（和发薪日相关）

这些特征不是从数据里自动生成的，而是来自对零售业务的深入理解。获胜团队说他们花了 80% 的时间在特征工程上，只有 20% 在模型调优上。

这不是个例。在结构化数据（表格数据）的机器学习项目中，特征工程通常是影响最终性能最大的单一因素。一个好的特征可以把一个不可能的问题变成一个简单的问题。

但在深度学习时代，特征工程的重要性发生了分化：

- **结构化数据（表格数据）**：特征工程仍然极其重要。XGBoost + 好特征 > 深度学习 + 原始特征
- **图像数据**：CNN 自动学习特征，手动特征工程几乎被淘汰
- **文本数据**：Transformer 自动学习表示，传统文本特征（TF-IDF 等）只在特定场景有用
- **时间序列数据**：特征工程仍然很关键，特别是周期性特征和滞后特征

## 核心概念

### 特征工程到底在做什么

特征工程的本质是：**把人类的领域知识编码到数据里，让模型更容易学到规律。**

模型不知道"周末"和"工作日"有区别——除非你告诉它。模型不知道"价格 / 面积 = 单价"是一个有意义的特征——除非你创建它。模型不知道"距离上次购买的天数"和用户流失相关——除非你计算它。

特征工程包括三大类活动：

1. **特征创建**：从原始数据中构造新特征（如从日期中提取星期几、从地址中提取邮编）
2. **特征变换**：改变特征的表示形式（如对数变换、标准化、离散化）
3. **特征选择**：选择最有用的特征子集（去除噪声、减少维度）

### 什么特征是"好特征"

一个"好特征"应该具备以下属性：

**预测力强**：和目标变量有真实的统计关系。不是巧合的相关性，而是反映了因果或关联关系。

**泛化能力强**：在训练数据和未来的新数据上都有效。不是只对训练数据有效的"巧合"特征。

**覆盖度高**：缺失值少。一个特征如果 80% 的值都缺失，即使剩余 20% 的信息量很大，也很难用好。

**业务上说得通**：你能解释为什么这个特征和目标变量相关。如果一个特征你解释不了，它可能是数据泄露。

**计算上可获取**：在模型部署时，这个特征能实时获取。一个依赖未来数据的特征就是泄露。

## 工作原理（简化的心智模型）

### 特征工程的思维框架

面对一组原始数据，你可以按以下框架系统化地做特征工程：

```
第一步：理解数据
  → 每个字段的含义是什么？
  → 数据类型：数值、类别、文本、时间、地理位置？
  → 缺失值的含义：是"没有数据"还是"不适用"？

第二步：理解业务
  → 目标变量的业务含义是什么？
  → 从业务角度，哪些因素应该影响目标？
  → 有哪些领域知识可以编码为特征？

第三步：基础特征处理
  → 数值特征：异常值、缺失值、缩放
  → 类别特征：编码方式
  → 时间特征：提取组件、周期编码

第四步：高级特征创建
  → 特征组合（如 单价 = 价格/面积）
  → 聚合特征（如 过去30天平均消费额）
  → 领域特定特征

第五步：特征选择
  → 去除无用特征（和目标无关）
  → 去除冗余特征（和其他特征高度相关）
  → 用特征重要性或正则化做最终筛选
```

### 一个直觉：特征是"提问"的方式

把模型想象成一个侦探，特征就是你可以提问的问题。

**原始数据**：你只知道一个人今年消费了 12000 元。

**更好的特征**：
- "过去 12 个月平均每月消费多少？" → 1000 元/月
- "消费金额是在增长还是减少？" → 每月增长 5%
- "最近一次消费距今几天？" → 3 天（活跃用户）
- "消费类别的多样性如何？" → 涉及 8 个品类（广泛兴趣）
- "最近一次大额消费是什么？" → 2000 元的电子产品（购买力）

每一个新特征都是一个新问题。问对了问题，模型就更容易找到答案。

## 工作原理（详细机制）

### 数值特征处理

#### 1. 异常值处理

异常值可以严重影响线性模型和距离-based 模型（如 KNN）。

**检测方法**：

```python
# IQR 方法
Q1 = df['feature'].quantile(0.25)
Q3 = df['feature'].quantile(0.75)
IQR = Q3 - Q1
lower_bound = Q1 - 1.5 * IQR
upper_bound = Q3 + 1.5 * IQR
outliers = (df['feature'] < lower_bound) | (df['feature'] > upper_bound)

# Z-score 方法
from scipy import stats
z_scores = stats.zscore(df['feature'])
outliers = np.abs(z_scores) > 3  # 3 个标准差之外
```

**处理策略**：

- **Winsorization（截尾）**：把超出范围的值截断到边界
  ```python
  df['feature'] = df['feature'].clip(lower=lower_bound, upper=upper_bound)
  ```
- **对数变换**：对右偏分布特别有效（如收入、价格）
  ```python
  df['feature_log'] = np.log1p(df['feature'])  # log1p(x) = log(1+x)，处理零值
  ```
- **分箱（Binning）**：把连续值分成离散的区间
  ```python
  df['age_group'] = pd.cut(df['age'], bins=[0, 18, 35, 50, 65, 100])
  ```

**什么时候要处理异常值**：
- 线性模型（线性回归、逻辑回归）对异常值敏感 → 需要处理
- 树模型（随机森林、XGBoost）对异常值不敏感 → 通常不需要
- 神经网络对异常值中度敏感 → 取决于激活函数和损失函数

#### 2. 分布变换

很多模型假设特征服从正态分布（或至少是对称分布）。如果特征严重偏斜，变换可以帮助。

**右偏分布（最常见的偏斜）**：

收入、价格、面积等特征通常是右偏的——大部分值集中在一个范围，但有少数极大的值。

```python
# 对数变换（处理右偏）
df['income_log'] = np.log1p(df['income'])

# Box-Cox 变换（自动选择最优变换参数）
from scipy.stats import boxcox
df['feature_bc'], lambda_bc = boxcox(df['feature'] + 1)  # Box-Cox 要求数据 > 0

# Yeo-Johnson 变换（Box-Cox 的推广，支持负值）
from sklearn.preprocessing import PowerTransformer
pt = PowerTransformer(method='yeo-johnson')
df['feature_yj'] = pt.fit_transform(df[['feature']])
```

**什么时候做分布变换**：
- 线性模型：通常有帮助
- 树模型：几乎不需要（树模型只关心排序，不关心值的分布）
- KNN、SVM 等距离-based 模型：有帮助

#### 3. 缩放（Scaling）

**标准化（StandardScaler）**：$z = (x - \mu) / \sigma$

**Min-Max 归一化**：$x_{norm} = (x - x_{min}) / (x_{max} - x_{min})$

**RobustScaler**：$x_{robust} = (x - median) / IQR$（对异常值鲁棒）

```python
from sklearn.preprocessing import StandardScaler, MinMaxScaler, RobustScaler

# 标准化（最常用）
scaler = StandardScaler()
X_scaled = scaler.fit_transform(X_train)

# Min-Max（神经网络常用，把值缩到 [0,1] 或 [-1,1]）
mm_scaler = MinMaxScaler()
X_mm = mm_scaler.fit_transform(X_train)

# RobustScaler（有异常值时用）
r_scaler = RobustScaler()
X_robust = r_scaler.fit_transform(X_train)
```

**什么时候需要缩放**：
- KNN、SVM、神经网络：必须缩放（这些模型对特征的尺度敏感）
- 线性模型（有正则化时）：必须缩放（否则正则化对不同尺度的特征不公平）
- 线性模型（无正则化）：不需要
- 树模型：不需要（树只关心排序）

**一个常见的错误**：对树模型做标准化。完全没必要，浪费计算。

#### 4. 缺失值处理

缺失值本身可能是有信息的——"缺失"这个状态可能和目标变量相关。

**处理策略**：

```python
# 策略 1：用统计量填充
df['age'].fillna(df['age'].median(), inplace=True)

# 策略 2：用特殊值标记（适用于树模型）
df['age_missing'] = df['age'].isnull().astype(int)
df['age'].fillna(-999, inplace=True)  # 树模型会自动学到 -999 是特殊值

# 策略 3：用模型预测填充
from sklearn.impute import KNNImputer
imputer = KNNImputer(n_neighbors=5)
X_imputed = imputer.fit_transform(X)

# 策略 4：用"缺失"作为特征
df['has_credit_history'] = df['credit_history'].notnull().astype(int)
```

**关键原则**：不要盲目填充缺失值。先理解缺失的原因：
- 随机缺失：用统计量填充即可
- 系统性缺失：缺失本身是有信息的，创建"是否缺失"特征
- 不会有的值：比如"未婚"的人没有配偶年龄，不应该填充，而应该用特殊值或分开处理

### 类别特征处理

#### 1. One-Hot Encoding（独热编码）

每个类别值变成一个二进制特征。

```python
# 颜色: ['红', '绿', '蓝']
# → 红: [1, 0, 0], 绿: [0, 1, 0], 蓝: [0, 0, 1]

from sklearn.preprocessing import OneHotEncoder
encoder = OneHotEncoder(sparse_output=False, drop='first')  # drop='first' 避免共线性
encoded = encoder.fit_transform(df[['color']])
```

**适用场景**：
- 低基数类别（唯一值 < 10-15 个）
- 线性模型、神经网络、SVM
- 类别之间没有顺序关系

**问题**：
- 高基数（如城市名有 500 个）→ 产生 500 个稀疏特征，维度爆炸
- 树模型处理高基数 One-Hot 效果差（每次分裂只能看一个二元特征，信息利用率低）

#### 2. Label/Ordinal Encoding（标签/有序编码）

把类别映射为整数。

```python
# 有序类别：学历
education_map = {'高中': 1, '本科': 2, '硕士': 3, '博士': 4}
df['education_encoded'] = df['education'].map(education_map)

# 无序类别（仅适合树模型）
from sklearn.preprocessing import LabelEncoder
le = LabelEncoder()
df['city_encoded'] = le.fit_transform(df['city'])
```

**适用场景**：
- 有自然顺序的类别（学历、等级、评分）
- 树模型（LightGBM、CatBoost 原生支持类别特征）

**注意**：对线性模型使用无序 Label Encoding 是错误的。线性模型会假设 encoded value 2 是 value 1 的"两倍"，这对无序类别没有意义。

#### 3. Target Encoding（目标编码）

用每个类别值对应的目标变量统计量（通常是均值）来替换类别。

```python
# 城市 '北京' 的平均房价是 500 万 → '北京' 编码为 500
city_mean_price = df.groupby('city')['price'].mean()
df['city_target_enc'] = df['city'].map(city_mean_price)
```

**Target Encoding 的泄露问题**：这是最容易出问题的编码方式。如果你在全数据上计算目标编码，然后把数据 split，测试集的信息就泄露到了训练过程。必须用 K-Fold Target Encoding（前面交叉验证那篇文章讲过）。

**适用场景**：
- 高基数类别（如邮编、用户 ID、商品 ID）
- 树模型和线性模型都可以用
- 需要仔细防止数据泄露

#### 4. Frequency/Count Encoding

用类别出现的频率替换类别。

```python
city_freq = df['city'].value_counts(normalize=True)
df['city_freq'] = df['city'].map(city_freq)
```

优点：没有泄露问题（不使用目标变量），对高基数类别有效。缺点：不同类别如果频率相同，就无法区分。

#### 5. 类别特征编码选择指南

| 条件 | 推荐方法 | 备注 |
|------|---------|------|
| 唯一值 < 10，无序 | One-Hot | 最安全的选择 |
| 唯一值 < 10，有序 | Ordinal | 保留顺序信息 |
| 唯一值 10-100 | One-Hot 或 Target | 看具体模型 |
| 唯一值 > 100 | Target Encoding | 注意防泄露 |
| 唯一值 > 1000 | Target + Frequency | 考虑先分组 |
| 树模型 (LightGBM) | 原生类别支持 | 直接传类别列 |
| 树模型 (XGBoost) | Ordinal 或 Target | XGBoost 需要数值输入 |

### 文本特征处理

在 Transformer 时代，传统文本特征工程的重要性大大下降了。BERT 等 pretrained 模型可以自动学习文本表示。但在以下场景中，传统方法仍然有用：

- 计算资源有限，无法运行 BERT
- 需要可解释的特征
- 短文本（几十个词以内）
- 和其他结构化特征结合使用

#### 1. Bag of Words（词袋模型）

```python
from sklearn.feature_extraction.text import CountVectorizer

vectorizer = CountVectorizer(max_features=5000, ngram_range=(1, 2))
X_text = vectorizer.fit_transform(df['text'])
# 每个文档变成一个向量，每个维度是某个词（或 n-gram）的出现次数
```

#### 2. TF-IDF

$$
\text{TF-IDF}(t, d) = \text{TF}(t, d) \times \log(\frac{N}{\text{DF}(t)})
$$

- TF(t, d)：词 t 在文档 d 中的出现频率
- N：总文档数
- DF(t)：包含词 t 的文档数

```python
from sklearn.feature_extraction.text import TfidfVectorizer

tfidf = TfidfVectorizer(max_features=10000, ngram_range=(1, 2))
X_tfidf = tfidf.fit_transform(df['text'])
```

TF-IDF 相比词袋模型的改进：降低高频常见词（如"的"、"是"）的权重，提高区分力强的词的权重。

#### 3. 简单但有效的文本特征

除了向量化的方法，一些简单的统计特征往往很有效：

```python
df['text_length'] = df['text'].str.len()           # 文本长度
df['word_count'] = df['text'].str.split().str.len() # 词数
df['avg_word_length'] = df['text_length'] / df['word_count']  # 平均词长
df['has_exclamation'] = df['text'].str.contains('!').astype(int)  # 是否有感叹号
df['uppercase_ratio'] = df['text'].apply(lambda x: sum(1 for c in x if c.isupper()) / len(x))  # 大写字母比例
```

这些简单特征在情感分析和垃圾邮件检测中特别有效：
- 感叹号多 → 可能是正面或负面情绪
- 大写字母多 → 可能是垃圾邮件（"FREE MONEY NOW!!!"）
- 文本很短 → 可能是简单回复或无意义评论

### 时间特征处理

时间特征是最容易被忽视但信息量最大的特征类型。

#### 1. 时间组件提取

```python
df['year'] = df['date'].dt.year
df['month'] = df['date'].dt.month
df['day'] = df['date'].dt.day
df['day_of_week'] = df['date'].dt.dayofweek     # 0=周一, 6=周日
df['hour'] = df['date'].dt.hour
df['is_weekend'] = (df['day_of_week'] >= 5).astype(int)
df['quarter'] = df['date'].dt.quarter
```

#### 2. 周期性编码

月份（1-12）、星期几（1-7）、小时（0-23）都是周期性的——12 月和 1 月是相邻的，但数字 12 和 1 差距很大。如果直接用数字，模型会认为 12 月和 1 月差距很大。

解决方案：用正弦和余弦编码。

```python
df['month_sin'] = np.sin(2 * np.pi * df['month'] / 12)
df['month_cos'] = np.cos(2 * np.pi * df['month'] / 12)
df['hour_sin'] = np.sin(2 * np.pi * df['hour'] / 24)
df['hour_cos'] = np.cos(2 * np.pi * df['hour'] / 24)
```

这样 12 月和 1 月在编码空间中就相邻了（sin 和 cos 值接近）。

#### 3. 时间差特征

```python
# 距离某个事件的天数
df['days_since_last_purchase'] = (df['date'] - df['last_purchase_date']).dt.days

# 年龄（从出生日期计算）
df['age'] = (pd.Timestamp('2024-01-01') - df['birth_date']).dt.days / 365.25

# 距离假期/特殊日期的天数
df['days_to_christmas'] = (pd.Timestamp('2024-12-25') - df['date']).dt.days
```

#### 4. 滞后特征和滚动统计（时间序列）

```python
# 滞后特征：过去 N 天的值
df['sales_lag_1'] = df['sales'].shift(1)    # 昨天的销售额
df['sales_lag_7'] = df['sales'].shift(7)    # 上周同天的销售额

# 滚动统计：过去 N 天的统计量
df['sales_rolling_mean_7'] = df['sales'].rolling(window=7).mean()  # 过去 7 天平均
df['sales_rolling_std_7'] = df['sales'].rolling(window=7).std()    # 过去 7 天标准差
df['sales_rolling_max_7'] = df['sales'].rolling(window=7).max()    # 过去 7 天最大值

# 差分：今天的值减昨天的值
df['sales_diff_1'] = df['sales'].diff(1)     # 日环比变化
df['sales_diff_7'] = df['sales'].diff(7)     # 周同比变化
```

**重要提醒**：滞后特征和滚动统计有数据泄露的风险！确保只用过去的值来构造当前时刻的特征。使用 `shift(1)` 确保不包含当前值。

### 特征交互

特征交互是指把两个或多个特征组合起来，创建新的特征。

```python
# 加法/减法交互
df['price_per_sqm'] = df['price'] / df['area']       # 单价 = 总价 / 面积
df['bmi'] = df['weight'] / (df['height'] / 100) ** 2  # BMI = 体重 / 身高²

# 乘法交互
df['income_per_person'] = df['household_income'] / df['household_size']

# 类别 × 数值交互
df['city_avg_price'] = df.groupby('city')['price'].transform('mean')  # 城市均价
df['price_vs_city_avg'] = df['price'] / df['city_avg_price']          # 和城市均价的比值
```

**什么时候特征交互有效**：
- 领域知识告诉你组合有意义（如 BMI = 体重/身高²）
- 线性模型无法自动学到非线性交互（需要你手动创建）
- 树模型可以自动学到交互（如果树够深），但显式创建有时仍有帮助

### 特征选择

不是所有特征都是有用的。特征太多会带来维度灾难、增加训练时间、可能引入噪声。

#### 1. 过滤法（Filter Methods）

基于统计量快速筛选，不依赖具体模型。

```python
# 方差过滤：去除方差太小的特征（基本不变的常量特征）
from sklearn.feature_selection import VarianceThreshold
selector = VarianceThreshold(threshold=0.01)
X_selected = selector.fit_transform(X)

# 相关性过滤：去除和目标变量相关性太低的特征
correlations = df.corr()['target'].abs()
low_corr_features = correlations[correlations < 0.01].index.tolist()

# 互信息：衡量特征和目标之间的非线性关系
from sklearn.feature_selection import mutual_info_classif
mi = mutual_info_classif(X, y)
```

#### 2. 包装法（Wrapper Methods）

基于模型性能来选择特征子集。

```python
# 递归特征消除（RFE）
from sklearn.feature_selection import RFE
rfe = RFE(estimator=LogisticRegression(), n_features_to_select=10)
X_selected = rfe.fit_transform(X, y)

# 基于特征重要性（树模型）
from sklearn.ensemble import RandomForestClassifier
rf = RandomForestClassifier(n_estimators=100)
rf.fit(X, y)
importance = pd.Series(rf.feature_importances_, index=feature_names)
important_features = importance.nlargest(20).index.tolist()
```

#### 3. 正则化方法

L1 正则化自动做特征选择（把不重要的权重压到零）。

```python
from sklearn.linear_model import Lasso
lasso = Lasso(alpha=0.01)
lasso.fit(X, y)
selected = np.where(lasso.coef_ != 0)[0]  # 非零权重对应的特征
```

**特征选择的实用建议**：
- 先用过滤法快速去掉明显的无用特征
- 再用基于模型的方法做精细选择
- 最后用 L1 正则化做最终确认
- 不要过度做特征选择——有时候看似无用的特征组合起来有效

## 代码示例

```python
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
from sklearn.datasets import make_classification, fetch_openml
from sklearn.model_selection import train_test_split, cross_val_score
from sklearn.preprocessing import (
    StandardScaler, MinMaxScaler, OneHotEncoder,
    PowerTransformer, LabelEncoder
)
from sklearn.impute import SimpleImputer
from sklearn.compose import ColumnTransformer
from sklearn.pipeline import Pipeline
from sklearn.linear_model import LogisticRegression
from sklearn.ensemble import RandomForestClassifier, GradientBoostingClassifier
from sklearn.metrics import roc_auc_score
from sklearn.feature_selection import mutual_info_classif
import warnings
warnings.filterwarnings('ignore')

np.random.seed(42)

# ============================================================
# 1. 数值特征处理演示
# ============================================================
print("=" * 70)
print("1. 数值特征处理")
print("=" * 70)

# 创建一个模拟数据集
n = 1000
df = pd.DataFrame({
    'income': np.random.lognormal(10, 1.5, n),  # 右偏分布
    'age': np.random.normal(40, 15, n),
    'score': np.random.uniform(0, 100, n),
})
# 加入异常值
df.loc[np.random.choice(n, 10), 'income'] = np.random.uniform(1e6, 5e6, 10)
# 加入缺失值
df.loc[np.random.choice(n, 50), 'income'] = np.nan

print("原始数据统计:")
print(df.describe().round(2))
print(f"\n收入分布偏度: {df['income'].skew():.2f} (正偏 = 右偏)")

# 对数变换
df['income_log'] = np.log1p(df['income'])
print(f"对数变换后偏度: {df['income_log'].skew():.2f}")

# Yeo-Johnson 变换
pt = PowerTransformer(method='yeo-johnson')
df['income_yj'] = pt.fit_transform(df[['income']].fillna(df['income'].median()))
print(f"Yeo-Johnson 后偏度: {pd.Series(df['income_yj']).skew():.2f}")

# Winsorization
q01, q99 = df['income'].quantile([0.01, 0.99])
df['income_winsor'] = df['income'].clip(lower=q01, upper=q99)
print(f"Winsorization 后偏度: {df['income_winsor'].skew():.2f}")

# 分箱
df['age_group'] = pd.cut(df['age'], bins=[0, 18, 25, 35, 50, 65, 100],
                          labels=['未成年', '青年', '青壮年', '中年', '中老年', '老年'])
print(f"\n年龄分箱分布:")
print(df['age_group'].value_counts().to_string())

# ============================================================
# 2. 类别特征编码演示
# ============================================================
print("\n" + "=" * 70)
print("2. 类别特征编码")
print("=" * 70)

df_cat = pd.DataFrame({
    'city': np.random.choice(['北京', '上海', '广州', '深圳', '杭州', '成都', '武汉', '南京'], n),
    'education': np.random.choice(['高中', '本科', '硕士', '博士'], n),
    'device_id': [f'device_{i}' for i in np.random.randint(0, 200, n)],  # 高基数
    'target': np.random.randint(0, 2, n)
})

print(f"类别特征基数:")
print(f"  city: {df_cat['city'].nunique()} 个唯一值 → 中等基数")
print(f"  education: {df_cat['education'].nunique()} 个唯一值 → 有序低基数")
print(f"  device_id: {df_cat['device_id'].nunique()} 个唯一值 → 高基数")

# One-Hot Encoding
ohe = OneHotEncoder(sparse_output=False, drop='first')
city_ohe = ohe.fit_transform(df_cat[['city']])
print(f"\nOne-Hot Encoding (city): {city_ohe.shape[1]} 个新特征")

# Ordinal Encoding
edu_map = {'高中': 1, '本科': 2, '硕士': 3, '博士': 4}
df_cat['education_encoded'] = df_cat['education'].map(edu_map)
print(f"Ordinal Encoding (education): {df_cat['education_encoded'].unique()}")

# Target Encoding（简化版，实际应使用 K-Fold）
target_means = df_cat.groupby('device_id')['target'].mean()
df_cat['device_target_enc'] = df_cat['device_id'].map(target_means)
print(f"Target Encoding (device_id): 均值 {df_cat['device_target_enc'].mean():.3f}")

# Frequency Encoding
freq = df_cat['device_id'].value_counts(normalize=True)
df_cat['device_freq'] = df_cat['device_id'].map(freq)
print(f"Frequency Encoding (device_id): 均值 {df_cat['device_freq'].mean():.4f}")

# ============================================================
# 3. 时间特征处理演示
# ============================================================
print("\n" + "=" * 70)
print("3. 时间特征处理")
print("=" * 70)

date_range = pd.date_range('2023-01-01', '2024-12-31', freq='h')  # 每小时一条
df_time = pd.DataFrame({
    'timestamp': np.random.choice(date_range, n),
    'sales': np.random.lognormal(3, 0.5, n),
})
df_time = df_time.sort_values('timestamp').reset_index(drop=True)

# 提取时间组件
df_time['year'] = df_time['timestamp'].dt.year
df_time['month'] = df_time['timestamp'].dt.month
df_time['day'] = df_time['timestamp'].dt.day
df_time['hour'] = df_time['timestamp'].dt.hour
df_time['day_of_week'] = df_time['timestamp'].dt.dayofweek
df_time['is_weekend'] = (df_time['day_of_week'] >= 5).astype(int)

# 周期性编码
df_time['month_sin'] = np.sin(2 * np.pi * df_time['month'] / 12)
df_time['month_cos'] = np.cos(2 * np.pi * df_time['month'] / 12)
df_time['hour_sin'] = np.sin(2 * np.pi * df_time['hour'] / 24)
df_time['hour_cos'] = np.cos(2 * np.pi * df_time['hour'] / 24)

print("时间特征示例（前 5 行）:")
time_features = ['timestamp', 'month', 'hour', 'day_of_week', 'is_weekend', 'month_sin', 'month_cos', 'hour_sin', 'hour_cos']
print(df_time[time_features].head().to_string())

# 滞后特征和滚动统计
df_time['sales_lag_1'] = df_time['sales'].shift(1)
df_time['sales_lag_24'] = df_time['sales'].shift(24)  # 24 小时前（昨天同时刻）
df_time['sales_rolling_mean_24'] = df_time['sales'].rolling(window=24).mean()
df_time['sales_rolling_std_24'] = df_time['sales'].rolling(window=24).std()

print(f"\n滚动统计示例:")
print(df_time[['timestamp', 'sales', 'sales_lag_1', 'sales_rolling_mean_24']].head(30).tail(5).to_string())

# ============================================================
# 4. 特征工程对模型性能的影响
# ============================================================
print("\n" + "=" * 70)
print("4. 特征工程对模型性能的影响")
print("=" * 70)

from sklearn.datasets import make_moons

# 创建一个非线性分类问题
X_raw, y_raw = make_moons(n_samples=1000, noise=0.2, random_state=42)

# 基线：只用原始特征
lr = LogisticRegression()
baseline_scores = cross_val_score(lr, X_raw, y_raw, cv=5, scoring='accuracy')

# 加入特征工程：极坐标特征
r = np.sqrt(X_raw[:, 0]**2 + X_raw[:, 1]**2)
theta = np.arctan2(X_raw[:, 1], X_raw[:, 0])
X_eng = np.column_stack([X_raw, r, theta, X_raw[:, 0]**2, X_raw[:, 1]**2, 
                          X_raw[:, 0] * X_raw[:, 1]])

eng_scores = cross_val_score(lr, X_eng, y_raw, cv=5, scoring='accuracy')

print(f"Moons 数据集（非线性问题）:")
print(f"  原始特征 (2D):     {baseline_scores.mean():.4f} ± {baseline_scores.std():.4f}")
print(f"  + 特征工程 (7D):   {eng_scores.mean():.4f} ± {eng_scores.std():.4f}")
print(f"  提升: {(eng_scores.mean() - baseline_scores.mean()) * 100:.1f}%")
print(f"  → 好的特征让线性模型在非线性问题上也能工作得很好")

# 用树模型对比
rf = RandomForestClassifier(n_estimators=100, random_state=42)
rf_baseline = cross_val_score(rf, X_raw, y_raw, cv=5, scoring='accuracy')
rf_eng = cross_val_score(rf, X_eng, y_raw, cv=5, scoring='accuracy')

print(f"\n  随机森林 原始特征: {rf_baseline.mean():.4f}")
print(f"  随机森林 + 特征工程: {rf_eng.mean():.4f}")
print(f"  → 树模型能自动学到非线性关系，特征工程提升较小")

# ============================================================
# 5. 特征重要性分析
# ============================================================
print("\n" + "=" * 70)
print("5. 特征重要性分析")
print("=" * 70)

X_clf, y_clf = make_classification(
    n_samples=2000, n_features=20, n_informative=5,
    n_redundant=5, n_classes=2, random_state=42
)
feature_names = [f'feature_{i}' for i in range(20)]

# 随机森林特征重要性
rf = RandomForestClassifier(n_estimators=200, random_state=42)
rf.fit(X_clf, y_clf)
importance = pd.Series(rf.feature_importances_, index=feature_names).sort_values(ascending=False)

print("Top 10 重要特征:")
for name, imp in importance.head(10).items():
    bar = '█' * int(imp * 200)
    print(f"  {name:15s}: {imp:.4f} {bar}")

# 互信息
mi = mutual_info_classif(X_clf, y_clf, random_state=42)
mi_series = pd.Series(mi, index=feature_names).sort_values(ascending=False)

print(f"\n互信息 Top 10:")
for name, imp in mi_series.head(10).items():
    bar = '█' * int(imp * 200)
    print(f"  {name:15s}: {imp:.4f} {bar}")

# 对比：两种方法的一致性
print(f"\n两种方法 Top 5 特征的一致性:")
rf_top5 = set(importance.head(5).index)
mi_top5 = set(mi_series.head(5).index)
print(f"  RF Top 5: {sorted(rf_top5)}")
print(f"  MI Top 5: {sorted(mi_top5)}")
print(f"  重叠: {sorted(rf_top5 & mi_top5)}")

# ============================================================
# 6. 自动化特征工程简介
# ============================================================
print("\n" + "=" * 70)
print("6. 自动化 vs 手动特征工程")
print("=" * 70)

summary = """
特征工程策略选择：

┌─────────────────────┬──────────────────────────────────────────────────┐
│ 场景                │ 推荐策略                                        │
├─────────────────────┼──────────────────────────────────────────────────┤
│ 结构化数据 + 领域   │ 手动特征工程 > 自动化。领域知识是关键            │
│ 结构化数据 + 无领域 │ 自动化（Featuretools）+ 基础统计特征             │
│ 图像数据            │ CNN 自动提取，不做传统特征工程                   │
│ 文本数据            │ 预训练模型（BERT）+ 简单统计特征                 │
│ 时间序列            │ 滞后特征 + 滚动统计 + 周期编码 + 领域特征        │
│ 竞赛/Kaggle         │ 手动 + 自动化结合，大量特征 + 特征选择           │
│ 生产系统            │ 简单、可靠的特征；复杂特征容易出问题              │
└─────────────────────┴──────────────────────────────────────────────────┘

最重要的原则：
1. 先理解数据再动手（EDA 是特征工程的前提）
2. 领域知识 > 自动化方法
3. 先建立基线，再逐步添加特征
4. 每加一个特征，验证它是否真的有帮助
5. 生产环境优先选择简单、稳定的特征
"""
print(summary)
```

## 真实案例

### 案例 1：Rossmann Store Sales（Kaggle 竞赛）

这个竞赛要求预测欧洲药店的日销售额。获胜的关键特征包括：

**领域知识驱动的特征**：
- `PromoInterval`：促销活动的间隔（多久促销一次）
- `CompetitionDistance`：最近竞争对手的距离
- `StateHoliday` + `SchoolHoliday` 的交互（两个假期同时影响客流）

**时间特征**：
- `DayOfWeek`（星期几）：周末和工作日的销售模式完全不同
- `Month`：季节性效应（冬季感冒药销量高）
- `DayOfMonth`：和发薪日相关（月初销售高峰）

**滞后特征**：
- `Sales_Lag_7`：上周同一天的销售额
- `Sales_Lag_365`：去年同一天的销售额（年度季节性）
- `Promo_Last_7Days`：过去 7 天是否有促销

**聚合特征**：
- 同类型商店的平均销售额
- 同一地区的平均销售额

这些特征让一个简单的梯度提升树模型击败了大量使用深度学习的参赛者。

### 案例 2：信用评分中的特征工程

某银行开发信用评分模型，原始数据包含客户的交易记录、基本信息和信用历史。

**最有效的特征（按重要性排序）**：

1. `debt_to_income_ratio`（债务收入比）= 总负债 / 年收入。比单独看负债或收入更有预测力。

2. `credit_utilization`（信用利用率）= 已用信用额度 / 总信用额度。研究表明这是信用风险最强的预测因子之一。

3. `months_since_last_delinquency`（距离上次逾期的月数）。逾期距今越近，风险越高。

4. `total_accounts`（总账户数）和 `open_accounts`（活跃账户数）的比率。太多关闭的账户可能是财务困难的信号。

5. `inquiries_last_6_months`（最近 6 个月信用查询次数）。频繁查询意味着客户在到处借钱。

**关键的领域洞察**：不是原始数据（如具体欠了多少钱），而是比率（如利用率、负债收入比）才是最好的预测特征。这是因为比率消除了收入水平和地区差异的影响。

### 案例 3：推荐系统中的特征工程

某视频平台构建推荐模型。最有用的特征不是视频本身的属性，而是用户行为的时间模式：

- `time_since_last_watch`（距离上次观看的时间）：预测用户是否"回流"
- `watch_time_7d`（过去 7 天总观看时长）：衡量用户活跃度
- `genre_diversity`（观看类别的多样性）：高多样性用户和低多样性用户的推荐策略完全不同
- `completion_rate`（完播率）：看用户是"刷"视频还是认真看完
- `hour_of_day` × `genre` 的交互：早上看新闻，晚上看剧，周末看综艺

这些特征让推荐系统的点击率提升了 35%。

## 权衡取舍以及何时不该使用

### 特征工程的代价

**维护成本**：每个手工创建的特征都需要在生产环境中持续计算和维护。如果一个特征依赖 5 个数据源，任何一个数据源出问题都会影响特征值。

**过拟合风险**：在训练数据上创建的"有效"特征可能只是在训练集上的巧合。特别是当你创建了几百个特征再做特征选择时，很容易选中一些只是随机相关的特征。

**技术债**：复杂的特征工程逻辑（如"过去 30 天该用户在该品类的平均消费额减去该品类全局平均消费额"）会成为系统中最脆弱的部分。

### 何时不该做大量特征工程

1. **数据量足够大时**。当你有几百万甚至上亿条训练数据时，深度学习等端到端方法可以自动学习特征表示，手动特征工程的边际收益很小。

2. **非结构化数据（图像、音频、文本）**。CNN、Transformer 等架构已经证明了自动特征学习的有效性。在这些领域做传统特征工程通常不如用预训练模型。

3. **快速原型阶段**。在验证问题是否有解之前，不值得花大量时间做精细的特征工程。先用原始特征 + 好模型建立基线。

4. **特征在线计算不可行时**。如果特征需要实时计算但计算量太大（如需要扫描用户全部历史数据），这种特征不适合上线。

### 常见的错误做法

**错误 1：不看数据分布就做变换**

对已经近似正态分布的特征做 Box-Cox 变换，可能反而让它变差。先画直方图看分布。

**错误 2：对树模型做不必要的处理**

树模型不需要标准化、不需要对数变换、不需要 One-Hot（低基数可以，高基数反而差）。对树模型做这些处理是浪费时间。

**错误 3：盲目创建大量特征**

创建 500 个特征然后让模型自己选。这会导致：过拟合风险大增、训练变慢、维护成本高。应该基于领域知识有针对性地创建特征。

**错误 4：忽视特征之间的相关性**

两个高度相关的特征（如"月收入"和"年收入"）提供了重复信息。高相关特征会导致线性模型的不稳定（系数在不同训练运行间波动很大），也增加了不必要的计算。

**错误 5：在测试集信息上做特征工程**

比如在全数据上做 target encoding 然后划分训练/测试集。这是数据泄露，前面已经详细讲过了。

## 关键要点

1. **领域知识是特征工程最重要的输入**。理解业务比掌握技巧更重要。先问"从业务角度看，什么因素应该影响预测结果"，再想怎么把这些因素编码为特征。

2. **数值特征的核心处理是异常值和分布偏态**。对线性模型和距离-based 模型，这些处理至关重要。对树模型，通常不需要。

3. **类别特征编码的选择取决于基数和模型类型**。低基数用 One-Hot，高基数用 Target Encoding（注意防泄露），有序的用 Ordinal。树模型可以用原生类别支持（LightGBM）或 Label Encoding。

4. **时间特征是信息量最大的特征类型之一**。提取时间组件（月、日、星期几）、周期性编码（sin/cos）、滞后特征和滚动统计是处理时间数据的标准做法。

5. **特征交互对线性模型极其重要**。线性模型无法自动学到 feature_A × feature_B 的交互效应。如果你知道"体重/身高²"（BMI）比单独的体重或身高更有意义，就手动创建这个特征。

6. **先建立基线，再逐步添加特征**。不要一开始就创建几百个特征。先用少量核心特征建立基线性能，然后一个个添加新特征，每个都验证是否真的有帮助。

7. **简单、稳定的特征在生产中更有价值**。一个复杂的特征如果在生产中经常计算失败或延迟，它的实际价值是负的。

## 延伸阅读

1. Zheng, A., & Casari, A. (2018). *Feature Engineering for Machine Learning*. O'Reilly. — 特征工程的系统化实践指南

2. Guyon, I., & Elisseeff, A. (2003). "An Introduction to Variable and Feature Selection." *JMLR*, 3, 1157-1182. — 特征选择方法的经典综述

3. Micci-Barreca, D. (2001). "A preprocessing scheme for high-cardinality categorical attributes in classification and prediction problems." *ACM SIGKDD Explorations*. — Target Encoding 的原始论文

4. Featuretools 文档: [featuretools.alteryx.com](https://featuretools.alteryx.com/) — 自动化特征工程框架

5. Dong, G., & Liu, H. (2018). *Feature Engineering for Machine Learning and Data Analytics*. CRC Press. — 特征工程的学术参考书

6. Kaggle "Feature Engineering" 课程: [kaggle.com/learn/feature-engineering](https://www.kaggle.com/learn/feature-engineering) — 实战导向的特征工程教程

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
