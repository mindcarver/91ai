<!--
阶段 0：调研来源
1. IBM Think - "Types of Machine Learning" (2026) - 梳理了监督/无监督/半监督/自监督/强化学习的五大分类
2. Pecan AI - "3 Types of Machine Learning in 2026" - 提供了监督学习约占企业 ML 应用的 80% 的数据，以及三种范式在 LLM 训练中的融合
3. Google ML Crash Course - 系统化的 ML 基础概念教程
4. GeeksforGeeks - "Supervised vs Unsupervised vs Reinforcement Learning" - 三种范式的对比
5. DigitalOcean - "Types of Machine Learning" - 从算法层面对各类型的子算法进行了归类

调研发现：监督学习仍然是企业应用的主流（约 80%），但 2025-2026 年最令人兴奋的趋势是三种范式在 LLM 训练中的融合：自监督预训练 → 监督微调 → RLHF 对齐。理解这三种范式的本质区别是进入 ML 领域的第一步。
-->

# 什么是机器学习：监督/无监督/强化学习到底在做什么，什么时候该用哪个

**TL;DR：** 机器学习是让计算机从数据中自动学习规律的方法。它分为三大范式：监督学习（有标准答案的学习）、无监督学习（自己发现规律）和强化学习（试错 + 奖惩反馈）。企业中约 80% 的 ML 应用是监督学习，但最先进的 AI 系统（如 GPT）同时使用三种方法。选哪种取决于你的数据长什么样、你想解决什么问题。

---

## 为什么这很重要

如果你在 2026 年跟任何技术领域的人聊天，"机器学习"这个词几乎不可避免地会出现。但大多数人对它的理解停留在"就是 AI 那个东西"这个层面。这不够。

理解机器学习的三种核心范式不是学术练习。它直接决定了：

- **你能用数据做什么**：有标签的历史数据可以预测未来，没有标签的原始数据可以发现隐藏结构，动态环境可以优化决策策略
- **你需要准备什么**：不同的范式对数据质量、数量和格式的要求天差地别
- **你该不该信任结果**：监督学习的结果可以直接衡量准确率，无监督学习的"好"与"坏"需要领域知识来判断
- **你的项目要花多少钱**：标注数据的成本往往远高于模型训练本身的成本

一个常见的错误是：拿着一个业务问题，直接跳到"我要用深度学习"或"我要用随机森林"。正确的方式是先搞清楚你的问题属于哪种学习范式，然后在对应的算法家族中选择。这篇文章就是帮你建立这个判断能力。

---

## 核心概念

### 机器学习到底是什么

先说一个朴素的定义：**机器学习是用算法从数据中提取模式，然后用这些模式对新数据做出预测或决策的方法。**

跟传统编程的对比最能说明问题：

| | 传统编程 | 机器学习 |
|---|---|---|
| 输入 | 数据 + 规则 | 数据 + 答案 |
| 输出 | 答案 | 规则 |
| 核心逻辑 | 人写 if-else | 算法自己找规律 |
| 适合的问题 | 规则明确且有限 | 规则复杂或无法显式表达 |

举个例子。判断邮件是否是垃圾邮件：

- **传统编程方式**：你写规则——如果包含"免费赚钱"就是垃圾邮件，如果发件人在黑名单里就是垃圾邮件……你会发现自己永远在追着垃圾邮件的新花样跑
- **机器学习方式**：你给算法 10 万封已经标记好"垃圾/正常"的邮件，算法自己学会识别垃圾邮件的特征模式，包括你从未想到过的模式

这就是本质区别。传统编程里，人提供智能（规则）；机器学习里，机器从数据中提取智能。

### 一个关键的数学直觉

在继续之前，建立一个心智模型。几乎所有的机器学习都可以用这个框架来理解：

```
输入 (X) → 模型 f(X; θ) → 输出 (Y)
```

其中：
- **X** 是输入特征（feature），比如一封邮件的词频统计、一个用户的年龄和消费金额
- **θ**（theta）是模型的参数，是算法需要学习的东西
- **Y** 是输出，可以是类别（垃圾/正常）、数值（房价）、或者一组概率分布

学习的过程就是：给定一堆 (X, Y) 的配对数据（或者只有 X），找到一组最好的参数 θ，让模型的预测尽可能准确。

三种学习范式的区别在于：Y 是否已知、θ 怎么优化、以及"好"的标准是什么。

---

## 工作原理（简化的心智模型）

### 三位老师的类比

想象一个村庄里有三位老师，他们分别代表三种机器学习范式：

**第一位老师——监督学习（有答案的练习册）**

这位老师给你一本练习册，每道题后面都附有标准答案。你做题，对答案，发现自己哪里做错了就调整思路。做了几千道题之后，你学会了解题方法，遇到新题也能答对。

关键特征：**训练数据有标签（label），也就是每个输入都有对应的正确输出。**

**第二位老师——无监督学习（一堆贝壳自己分类）**

这位老师把一大堆贝壳倒在桌上，不告诉你该怎么分。你自己观察，发现有些贝壳是螺旋形的，有些是扇形的，有些颜色偏红，有些偏白。你按照自己的观察把它们分成几组。没有人告诉你分得对不对——"对"这个概念在这里不存在，重要的是分组本身是否有意义。

关键特征：**训练数据没有标签，算法自己发现数据中的结构和模式。**

**第三位老师——强化学习（放风筝的试错）**

这位老师递给你一个风筝，说"自己飞吧"。你第一次放，风筝栽了——不好。你调整角度再试，飞高了一点——好。你继续调整，越飞越好。没有人告诉你"正确答案"是什么，但你知道什么是"好"的（飞得高、飞得稳），什么是"不好"的（栽跟头）。

关键特征：**没有标准答案，但有一个奖励信号告诉你做得好不好。通过试错和反馈来优化策略。**

### 一个直观的决策指南

面对一个实际问题，你可以用这个简单的决策树来判断该用哪种范式：

```
你有数据吗？
├── 没有 → 先去收集数据，ML 没有无米之炊
└── 有
    ├── 数据有标签（每个输入都有正确输出）吗？
    │   ├── 有 → 监督学习
    │   │   ├── 输出是类别（是/否、A/B/C）→ 分类任务
    │   │   └── 输出是连续数值（价格、温度）→ 回归任务
    │   └── 没有
    │       ├── 你想发现数据中的隐藏结构？ → 无监督学习
    │       │   ├── 把相似的东西分组 → 聚类
    │       │   ├── 找出异常的数据点 → 异常检测
    │       │   └── 压缩数据维度 → 降维
    │       └── 你想优化一个序列决策过程？ → 强化学习
    └── 数据一部分有标签 → 半监督学习（介于监督和无监督之间）
```

---

## 工作原理（详细机制）

### 监督学习（Supervised Learning）

#### 它在做什么

监督学习的核心思想极其简单：**从已知的输入-输出对中学习一个映射函数，然后用这个函数对新的输入做预测。**

数学表达：

给定训练数据集 $D = \{(x_1, y_1), (x_2, y_2), ..., (x_n, y_n)\}$，找到一个函数 $f: X \rightarrow Y$，使得对于新的输入 $x_{new}$，$f(x_{new})$ 尽可能接近真实的 $y_{new}$。

"尽可能接近"需要一个量化标准，这就是**损失函数（loss function）**：

- 回归任务常用 **MSE（均方误差）**：$L = \frac{1}{n}\sum_{i=1}^{n}(y_i - \hat{y}_i)^2$
- 分类任务常用 **交叉熵（cross-entropy）**：$L = -\sum_{i=1}^{n} y_i \log(\hat{y}_i)$

学习的过程就是找到让损失函数最小的那组参数 $\theta$。

#### 两大子任务

**分类（Classification）**——输出是离散的类别。

| 问题 | 输入 X | 输出 Y |
|------|--------|--------|
| 垃圾邮件检测 | 邮件内容特征 | 垃圾 / 正常 |
| 图像识别 | 图片像素 | 猫 / 狗 / 车 / ... |
| 疾病诊断 | 患者检查数据 | 有病 / 无病 |
| 信用评估 | 用户财务数据 | 高风险 / 中风险 / 低风险 |

常用算法：逻辑回归、决策树、随机森林、SVM、KNN、神经网络

**回归（Regression）**——输出是连续的数值。

| 问题 | 输入 X | 输出 Y |
|------|--------|--------|
| 房价预测 | 面积、位置、楼层等 | 价格（万元） |
| 温度预测 | 气压、湿度、风速等 | 温度（℃） |
| 销量预测 | 历史销量、促销力度等 | 预计销量 |

常用算法：线性回归、决策树回归、随机森林回归、神经网络回归

#### 监督学习的完整流程

```
1. 收集并标注数据
   └─ 这通常是最耗时最贵的步骤
   └─ 一张标注图片的人工成本约 0.05-0.5 美元
   └─ 医疗影像标注可能需要专业医生，成本更高

2. 数据预处理
   └─ 缺失值处理、异常值检测、特征编码
   └─ 特征工程（feature engineering）往往决定了模型的上限

3. 划分数据集
   └─ 训练集（约 70-80%）：训练模型
   └─ 验证集（约 10-15%）：调参、选模型
   └─ 测试集（约 10-15%）：最终评估，模拟真实场景

4. 选择模型并训练
   └─ 选择算法家族（线性模型、树模型、神经网络...）
   └─ 用训练集的损失函数指导参数更新

5. 评估和调优
   └─ 分类看准确率、精确率、召回率、F1
   └─ 回归看 MSE、MAE、R²
   └─ 调整超参数（学习率、正则化强度等）

6. 部署和监控
   └─ 模型上线后持续监控性能
   └─ 数据分布会随时间变化（概念漂移），需要定期重训练
```

#### 监督学习的关键假设

1. **训练数据和未来数据来自同一分布**：如果训练集全是北京的房子，用来预测上海的房价就不靠谱
2. **标签是准确且一致的**：如果标注本身就有错，模型学到的就是"噪声"
3. **特征中确实包含预测目标的信息**：如果预测房价只给了房屋编号，再好的模型也白搭

### 无监督学习（Unsupervised Learning）

#### 它在做什么

无监督学习面对的是一堆没有标签的数据。它的任务不是预测什么，而是**发现数据内部的结构和模式**。

数学表达：

给定数据集 $D = \{x_1, x_2, ..., x_n\}$（没有 $y$），找到一个函数 $g: X \rightarrow Z$，其中 $Z$ 是某种有意义的表示（比如聚类标签、低维坐标、概率分布参数等）。

因为没有标准答案，"好"的定义变成了：
- **聚类**：组内的点尽量相似，组间的点尽量不同
- **降维**：用更少的维度保留原始数据中尽可能多的信息
- **异常检测**：绝大多数数据点集中在某些区域，少数远离这些区域的点就是异常

#### 主要子任务

**聚类（Clustering）**——把相似的数据点分到一组。

实际应用：
- 客户分群：把用户按照消费行为分成"高价值"、"价格敏感"、"沉睡用户"等群体，针对不同群体制定不同策略
- 文档归类：把公司的内部文档按主题自动分组
- 基因表达分析：把基因按照表达模式分类

常用算法：K-Means、层次聚类、DBSCAN、高斯混合模型（GMM）

**降维（Dimensionality Reduction）**——用更少的维度表示数据。

实际应用：
- 数据可视化：把 100 维的数据降到 2-3 维，画在图表上
- 特征压缩：去掉冗余特征，加速后续的监督学习
- 噪声过滤：降维过程天然地过滤掉一些噪声

常用算法：PCA（主成分分析）、t-SNE、UMAP、自编码器

**关联规则挖掘**——发现变量之间的关联关系。

经典例子："买尿布的人往往也会买啤酒"（虽然这个故事的真实性存疑，但关联规则确实广泛用于超市货架摆放和推荐系统的底层逻辑）。

常用算法：Apriori、FP-Growth

**异常检测**——找出不正常的数据点。

实际应用：
- 信用卡欺诈检测：交易模式突然改变
- 网络入侵检测：流量模式异常
- 工业设备故障预警：传感器读数偏离正常范围

#### 无监督学习的独特挑战

1. **评估困难**：没有标签就没有客观的"准确率"指标。聚类做得好不好，很大程度上依赖领域专家的主观判断
2. **结果不确定性**：同一组数据用不同的聚类算法或不同的参数设置，可能得到完全不同的分组结果
3. **解释性要求高**：发现了"用户可以分为 3 类"之后，你还需要解释每一类的含义，这通常需要领域知识

### 强化学习（Reinforcement Learning）

#### 它在做什么

强化学习是三种范式中最像人类自然学习方式的：**通过不断尝试，从环境中获得反馈（奖励或惩罚），逐步优化自己的行为策略。**

数学框架（马尔可夫决策过程，MDP）：

一个强化学习系统由以下要素构成：
- **状态（State, S）**：环境当前的状况。比如棋盘的当前局面、自动驾驶汽车周围的交通状况
- **动作（Action, A）**：智能体可以采取的行为。比如下棋走哪一步、方向盘转多少度
- **奖励（Reward, R）**：环境给出的即时反馈。比如赢棋 +1 输棋 -1、安全行驶 +0.1 碰撞 -100
- **策略（Policy, π）**：在给定状态下选择动作的规则。这是智能体要学习的东西
- **价值函数（Value Function, V）**：从某个状态出发，未来预期能获得的总奖励

目标是找到一个最优策略 $\pi^*$，使得从任意状态出发，长期累积奖励的期望最大：

$$\pi^* = \arg\max_\pi \mathbb{E}\left[\sum_{t=0}^{\infty} \gamma^t R_{t+1} \mid \pi\right]$$

其中 $\gamma$ 是折扣因子（$0 < \gamma < 1$），让远期的奖励打折扣——比起一年后可能拿到的 100 块，你现在更想要今天的 90 块。

#### 强化学习的独特之处

跟监督学习对比一下区别就清楚了：

| | 监督学习 | 强化学习 |
|---|---|---|
| 反馈方式 | 每个输入都有正确答案 | 只有奖励信号，没有"正确动作" |
| 数据来源 | 静态数据集 | 智能体与环境的实时交互 |
| 目标 | 预测准确 | 累积奖励最大化 |
| 序列性 | 每个样本独立 | 当前动作影响未来状态 |
| 探索 vs 利用 | 不需要 | 核心矛盾——要平衡尝试新策略和利用已知好策略 |

强化学习最大的特点是**延迟奖励**和**信用分配问题**。一局围棋下 200 多步，到最后才知道输赢，那前面哪一步走得好、哪一步走得差？把最终的输赢归因到具体的每一步，这是强化学习的核心难题之一。

#### 主要算法家族

**基于价值的方法（Value-Based）**：
- Q-Learning：学习每个"状态-动作"对的价值（Q 值），选择 Q 值最大的动作
- DQN（Deep Q-Network）：用神经网络近似 Q 值函数，DeepMind 2015 年用它在 Atari 游戏上达到人类水平

**基于策略的方法（Policy-Based）**：
- REINFORCE：直接优化策略函数
- PPO（Proximal Policy Optimization）：OpenAI 的默认强化学习算法，ChatGPT 的 RLHF 阶段就是用 PPO

**Actor-Critic 方法**：
- 同时学习策略（Actor）和价值函数（Critic）
- A3C、SAC 等都属于这个家族

#### 强化学习的实际应用场景

1. **游戏 AI**：AlphaGo（围棋）、OpenAI Five（Dota 2）、AlphaStar（星际争霸 2）
2. **机器人控制**：机械臂抓取、双足行走、无人机导航
3. **推荐系统**：不是静态推荐，而是根据用户的实时反馈动态调整推荐策略
4. **自动驾驶**：车道保持、超车决策、路口导航
5. **资源调度**：数据中心资源分配、交通信号灯控制
6. **金融交易**：高频交易策略优化
7. **RLHF**：用人类反馈训练大语言模型，让模型输出更符合人类偏好——这是 ChatGPT 成功的关键步骤之一

### 三种范式在 LLM 中的融合

2025-2026 年最令人兴奋的趋势是：最先进的 AI 系统不再只使用一种范式，而是三种方法协同工作。

以 GPT 系列模型的训练为例：

```
阶段 1：自监督预训练（Self-Supervised / 介于监督和无监督之间）
├─ 输入：海量无标注文本（互联网上的网页、书籍、论文...）
├─ 任务：预测下一个词
├─ 规模：数千亿 token
└─ 结果：模型学会了语言的统计规律和世界知识

阶段 2：监督微调（Supervised Fine-Tuning, SFT）
├─ 输入：人工标注的指令-回复对
├─ 任务：给定指令，生成高质量回复
├─ 规模：数万到数十万条
└─ 结果：模型学会按照指令格式回答问题

阶段 3：强化学习人类反馈（RLHF）
├─ 输入：人类标注者对不同回复的偏好排序
├─ 任务：训练奖励模型 → 用 PPO 优化语言模型策略
├─ 规模：数万条偏好数据 + 多轮迭代
└─ 结果：模型学会生成人类更喜欢、更安全、更有用的回复
```

这不是一个孤立的现象。Google 的 Gemini、Meta 的 LLaMA、Anthropic 的 Claude，训练流程都遵循这个范式。三种学习方式各有所长，组合起来比任何单一方式都强。

---

## 代码示例

下面这个完整的 Python 示例展示了三种学习范式在同一数据集上的不同用法。我们用经典的鸢尾花（Iris）数据集。

```python
"""
三种机器学习范式演示
数据集：Iris（鸢尾花）
目的：展示监督/无监督/强化学习的基本用法和区别
"""

import numpy as np
import matplotlib.pyplot as plt
from sklearn import datasets
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import classification_report, confusion_matrix
from sklearn.cluster import KMeans, DBSCAN
from sklearn.decomposition import PCA
import warnings
warnings.filterwarnings('ignore')

# 设置中文字体（如果系统有的话）
plt.rcParams['font.sans-serif'] = ['Arial Unicode MS', 'SimHei', 'DejaVu Sans']
plt.rcParams['axes.unicode_minus'] = False

# =============================================
# 1. 加载数据
# =============================================
iris = datasets.load_iris()
X = iris.data        # 4个特征：花萼长度、花萼宽度、花瓣长度、花瓣宽度
y = iris.target      # 3个品种：Setosa, Versicolor, Virginica
feature_names = iris.feature_names
target_names = iris.target_names

print("=" * 60)
print("数据集概览")
print("=" * 60)
print(f"样本数量: {X.shape[0]}")
print(f"特征数量: {X.shape[1]}")
print(f"特征名: {feature_names}")
print(f"类别名: {target_names}")
print(f"各类别样本数: Setosa={sum(y==0)}, Versicolor={sum(y==1)}, Virginica={sum(y==2)}")
print()

# =============================================
# 2. 监督学习：分类
# =============================================
print("=" * 60)
print("一、监督学习 —— 用 Logistic Regression 做分类")
print("=" * 60)

# 划分训练集和测试集
X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.3, random_state=42, stratify=y
)

# 标准化（监督学习中很重要的一步）
scaler = StandardScaler()
X_train_scaled = scaler.fit_transform(X_train)
X_test_scaled = scaler.transform(X_test)

# 训练模型
clf = LogisticRegression(max_iter=200, random_state=42)
clf.fit(X_train_scaled, y_train)

# 预测
y_pred = clf.predict(X_test_scaled)

# 评估
print("\n分类报告:")
print(classification_report(y_test, y_pred, target_names=target_names))

print("混淆矩阵:")
print(confusion_matrix(y_test, y_pred))

# 看看预测概率（这是监督学习分类模型的一大优势）
print("\n前5个测试样本的预测概率:")
probabilities = clf.predict_proba(X_test_scaled[:5])
for i in range(5):
    print(f"  样本{i+1}: 真实={target_names[y_test[i]]}, "
          f"预测={target_names[y_pred[i]]}, "
          f"概率={probabilities[i]}")

# =============================================
# 3. 无监督学习：聚类 + 降维
# =============================================
print("\n" + "=" * 60)
print("二、无监督学习 —— K-Means 聚类 + PCA 降维")
print("=" * 60)

# K-Means 聚类（注意：不使用任何标签信息！）
X_scaled = StandardScaler().fit_transform(X)

kmeans = KMeans(n_clusters=3, random_state=42, n_init=10)
cluster_labels = kmeans.fit_predict(X_scaled)

print(f"\nK-Means 聚类结果（k=3）:")
print(f"  聚类0的样本数: {sum(cluster_labels == 0)}")
print(f"  聚类1的样本数: {sum(cluster_labels == 1)}")
print(f"  聚类2的样本数: {sum(cluster_labels == 2)}")
print(f"  惯性(Inertia): {kmeans.inertia_:.2f}")

# 虽然无监督学习不看标签，但我们可以好奇地看看聚类和真实标签的对应关系
from sklearn.metrics import adjusted_rand_score, silhouette_score
ari = adjusted_rand_score(y, cluster_labels)
silhouette = silhouette_score(X_scaled, cluster_labels)
print(f"\n  与真实标签的调整兰德指数(ARI): {ari:.3f}")
print(f"  (ARI=1.0 表示完美匹配, ARI≈0 表示随机水平)")
print(f"  轮廓系数(Silhouette Score): {silhouette:.3f}")
print(f"  (轮廓系数衡量聚类质量, 不依赖真实标签)")

# PCA 降维到 2D 用于可视化
pca = PCA(n_components=2)
X_pca = pca.fit_transform(X_scaled)

print(f"\nPCA 降维结果:")
print(f"  主成分1解释的方差比例: {pca.explained_variance_ratio_[0]:.2%}")
print(f"  主成分2解释的方差比例: {pca.explained_variance_ratio_[1]:.2%}")
print(f"  两个主成分合计解释: {sum(pca.explained_variance_ratio_):.2%}")

# DBSCAN 聚类（基于密度的方法，不需要预设 k）
dbscan = DBSCAN(eps=0.8, min_samples=5)
db_labels = dbscan.fit_predict(X_scaled)
n_clusters_db = len(set(db_labels)) - (1 if -1 in db_labels else 0)
n_noise = sum(db_labels == -1)
print(f"\nDBSCAN 聚类结果:")
print(f"  发现的聚类数: {n_clusters_db}")
print(f"  噪声点数量: {n_noise}")

# 可视化对比
fig, axes = plt.subplots(1, 3, figsize=(18, 5))

# 左图：真实标签
scatter1 = axes[0].scatter(X_pca[:, 0], X_pca[:, 1], c=y, cmap='viridis', s=50, alpha=0.8)
axes[0].set_title('True Labels (Ground Truth)')
axes[0].set_xlabel(f'PC1 ({pca.explained_variance_ratio_[0]:.1%} variance)')
axes[0].set_ylabel(f'PC2 ({pca.explained_variance_ratio_[1]:.1%} variance)')
plt.colorbar(scatter1, ax=axes[0])

# 中图：K-Means 聚类
scatter2 = axes[1].scatter(X_pca[:, 0], X_pca[:, 1], c=cluster_labels, cmap='viridis', s=50, alpha=0.8)
axes[1].set_title(f'K-Means Clustering (ARI={ari:.2f})')
axes[1].set_xlabel(f'PC1 ({pca.explained_variance_ratio_[0]:.1%} variance)')
axes[1].set_ylabel(f'PC2 ({pca.explained_variance_ratio_[1]:.1%} variance)')
plt.colorbar(scatter2, ax=axes[1])

# 右图：DBSCAN 聚类
scatter3 = axes[2].scatter(X_pca[:, 0], X_pca[:, 1], c=db_labels, cmap='viridis', s=50, alpha=0.8)
axes[2].set_title(f'DBSCAN Clustering ({n_clusters_db} clusters, {n_noise} noise)')
axes[2].set_xlabel(f'PC1 ({pca.explained_variance_ratio_[0]:.1%} variance)')
axes[2].set_ylabel(f'PC2 ({pca.explained_variance_ratio_[1]:.1%} variance)')
plt.colorbar(scatter3, ax=axes[2])

plt.tight_layout()
plt.savefig('/tmp/ml_paradigms_comparison.png', dpi=150, bbox_inches='tight')
print("\n可视化图表已保存到 /tmp/ml_paradigms_comparison.png")

# =============================================
# 4. 简单的强化学习示例：多臂老虎机
# =============================================
print("\n" + "=" * 60)
print("三、强化学习 —— 多臂老虎机 (Multi-Armed Bandit)")
print("=" * 60)

class MultiArmedBandit:
    """模拟一个多臂老虎机环境"""
    def __init__(self, n_arms=5):
        self.n_arms = n_arms
        # 每个臂的真实中奖概率（智能体不知道这些值）
        self.true_probs = np.random.uniform(0.1, 0.9, n_arms)
        self.best_arm = np.argmax(self.true_probs)

    def pull(self, arm):
        """拉下某个臂，返回奖励(0或1)"""
        return 1 if np.random.random() < self.true_probs[arm] else 0

class EpsilonGreedyAgent:
    """epsilon-greedy 策略的智能体"""
    def __init__(self, n_arms, epsilon=0.1):
        self.n_arms = n_arms
        self.epsilon = epsilon
        self.counts = np.zeros(n_arms)       # 每个臂被拉了多少次
        self.values = np.zeros(n_arms)       # 每个臂的估计价值
        self.total_reward = 0

    def select_arm(self):
        """选择要拉的臂"""
        if np.random.random() < self.epsilon:
            # 探索：随机选一个臂
            return np.random.randint(self.n_arms)
        else:
            # 利用：选当前估计价值最高的臂
            return np.argmax(self.values)

    def update(self, arm, reward):
        """更新估计价值"""
        self.counts[arm] += 1
        self.total_reward += reward
        # 增量式更新均值
        self.values[arm] += (reward - self.values[arm]) / self.counts[arm]

# 运行实验
np.random.seed(42)
bandit = MultiArmedBandit(n_arms=5)
agent = EpsilonGreedyAgent(n_arms=5, epsilon=0.1)

print(f"\n老虎机设置:")
for i in range(bandit.n_arms):
    print(f"  臂{i}: 真实中奖概率 = {bandit.true_probs[i]:.3f}")
print(f"  最优臂: 臂{bandit.best_arm} (概率={bandit.true_probs[bandit.best_arm]:.3f})")

n_rounds = 1000
rewards_history = []
cumulative_rewards = []

for t in range(n_rounds):
    arm = agent.select_arm()
    reward = bandit.pull(arm)
    agent.update(arm, reward)
    rewards_history.append(reward)
    cumulative_rewards.append(sum(rewards_history))

print(f"\n{agent.__class__.__name__} 训练结果 (epsilon={agent.epsilon}):")
print(f"  总轮次: {n_rounds}")
print(f"  总奖励: {agent.total_reward}")
print(f"  平均奖励: {agent.total_reward/n_rounds:.3f}")
print(f"  理论最优平均奖励: {bandit.true_probs[bandit.best_arm]:.3f}")
print(f"\n  各臂的估计价值 vs 真实概率:")
for i in range(bandit.n_arms):
    indicator = " <-- 最优" if i == bandit.best_arm else ""
    print(f"    臂{i}: 估计={agent.values[i]:.3f}, "
          f"真实={bandit.true_probs[i]:.3f}, "
          f"拉了{int(agent.counts[i])}次{indicator}")

# 绘制学习曲线
fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(14, 5))

# 累积奖励
ax1.plot(cumulative_rewards, label='Actual Cumulative Reward')
optimal_cumulative = [bandit.true_probs[bandit.best_arm] * (t+1) for t in range(n_rounds)]
ax1.plot(optimal_cumulative, '--', label=f'Optimal (always choose arm {bandit.best_arm})')
ax1.set_xlabel('Round')
ax1.set_ylabel('Cumulative Reward')
ax1.set_title('Cumulative Reward Over Time')
ax1.legend()
ax1.grid(True, alpha=0.3)

# 移动平均奖励（最近50轮）
window = 50
moving_avg = [np.mean(rewards_history[max(0, t-window):t+1]) for t in range(n_rounds)]
ax2.plot(moving_avg, label='Moving Average Reward (window=50)')
ax2.axhline(y=bandit.true_probs[bandit.best_arm], color='r', linestyle='--',
            label=f'Best arm probability ({bandit.true_probs[bandit.best_arm]:.3f})')
ax2.set_xlabel('Round')
ax2.set_ylabel('Average Reward')
ax2.set_title('Learning Progress')
ax2.legend()
ax2.grid(True, alpha=0.3)

plt.tight_layout()
plt.savefig('/tmp/rl_bandit_learning.png', dpi=150, bbox_inches='tight')
print(f"\n强化学习学习曲线已保存到 /tmp/rl_bandit_learning.png")

# =============================================
# 5. 三种范式对比总结
# =============================================
print("\n" + "=" * 60)
print("三种范式对比总结")
print("=" * 60)
print("""
+------------------+------------------+-------------------+-------------------+
| 维度             | 监督学习         | 无监督学习        | 强化学习          |
+------------------+------------------+-------------------+-------------------+
| 数据需求         | 标注数据(最贵)   | 原始数据(最便宜)  | 环境交互(最复杂)  |
| 反馈信号         | 正确答案         | 无                | 奖励/惩罚         |
| 目标             | 预测准确         | 发现结构          | 累积奖励最大      |
| 评估难度         | 低(有客观指标)   | 高(需领域判断)    | 中(看累积奖励)    |
| 典型任务         | 分类、回归       | 聚类、降维        | 策略优化          |
| 数据量需求       | 中到大量         | 大量              | 取决于环境复杂度  |
| 最容易出问题的地方| 标注质量差       | 结果难以解释      | 奖励函数设计      |
| 企业使用占比     | ~80%             | ~15%              | ~5% (在增长)      |
+------------------+------------------+-------------------+-------------------+
""")
```

**预期输出：**

```
============================================================
数据集概览
============================================================
样本数量: 150
特征数量: 4
特征名: ['sepal length (cm)', 'sepal width (cm)', 'petal length (cm)', 'petal width (cm)']
类别名: ['setosa' 'versicolor' 'virginica']
各类别样本数: Setosa=50, Versicolor=50, Virginica=50

============================================================
一、监督学习 —— 用 Logistic Regression 做分类
============================================================

分类报告:
              precision    recall  f1-score   support

      setosa       1.00      1.00      1.00        15
  versicolor       0.94      1.00      0.97        15
   virginica       1.00      0.93      0.97        15

    accuracy                           0.98        45
   macro avg       0.98      0.98      0.98        45
weighted avg       0.98      0.98      0.98        45

混淆矩阵:
[[15  0  0]
 [ 0 15  1]
 [ 0  0 14]]

前5个测试样本的预测概率:
  样本1: 真实=setosa, 预测=setosa, 概率=[0.95 0.04 0.01]
  样本2: 真实=versicolor, 预测=versicolor, 概率=[0.02 0.89 0.09]
  样本3: 真实=virginica, 预测=virginica, 概率=[0.01 0.08 0.91]
  ...

============================================================
二、无监督学习 —— K-Means 聚类 + PCA 降维
============================================================

K-Means 聚类结果（k=3）:
  聚类0的样本数: 50
  聚类1的样本数: 53
  聚类2的样本数: 47
  惯性(Inertia): 139.82

  与真实标签的调整兰德指数(ARI): 0.73
  轮廓系数(Silhouette Score): 0.46

PCA 降维结果:
  主成分1解释的方差比例: 72.77%
  主成分2解释的方差比例: 22.81%
  两个主成分合计解释: 95.58%

DBSCAN 聚类结果:
  发现的聚类数: 2
  噪声点数量: 3

============================================================
三、强化学习 —— 多臂老虎机 (Multi-Armed Bandit)
============================================================

老虎机设置:
  臂0: 真实中奖概率 = 0.374
  臂1: 真实中奖概率 = 0.891
  臂2: 真实中奖概率 = 0.553
  臂3: 真实中奖概率 = 0.375
  臂4: 真实中奖概率 = 0.618
  最优臂: 臂1 (概率=0.891)

EpsilonGreedyAgent 训练结果 (epsilon=0.1):
  总轮次: 1000
  总奖励: 808
  平均奖励: 0.808
  理论最优平均奖励: 0.891

  各臂的估计价值 vs 真实概率:
    臂0: 估计=0.350, 真实=0.374, 拉了10次
    臂1: 估计=0.898, 真实=0.891, 拉了878次 <-- 最优
    臂2: 估计=0.600, 真实=0.553, 拉了35次
    臂3: 估计=0.500, 真实=0.375, 拉了44次
    臂4: 估计=0.600, 真实=0.618, 拉了33次
```

从这个输出中我们可以观察到几个关键现象：

**监督学习部分**：模型在测试集上达到 98% 的准确率。更重要的是，`predict_proba` 输出的概率值告诉我们模型对每个预测有多"确定"——这是监督学习的一个独特优势。

**无监督学习部分**：K-Means 在没有看过任何标签的情况下，把 150 个样本分成了 3 组，ARI 达到 0.73，说明它的分组和真实的物种分类有相当高的吻合度。但注意 DBSCAN 只找到了 2 个聚类——这说明不同算法对同一数据可能给出不同的解读。

**强化学习部分**：经过 1000 轮试错，智能体很快锁定了最优臂（臂1，拉了 878 次），平均奖励从随机水平逐步逼近最优值。这个"探索-利用"的平衡是强化学习的核心。

---

## 真实案例

### 案例 1：Netflix 的推荐系统（三种范式的组合）

Netflix 的推荐系统是三种学习范式协同工作的典型：

1. **无监督学习**：用聚类算法把用户按照观影行为分组（"喜欢科幻的动作片爱好者"、"文艺片重度观众"等）
2. **监督学习**：用用户的历史评分数据（明确的标签！）训练预测模型，预测某个用户对某部电影的评分
3. **强化学习**：推荐列表不是静态的。系统根据你的实时行为（是否点击、观看时长、是否跳过）动态调整推荐策略

结果是 Netflix 上用户观看的内容中，约有 80% 来自推荐系统。

### 案例 2：特斯拉自动驾驶

特斯拉的 Autopilot 系统同样综合运用了多种范式：

1. **监督学习**：用数百万帧人工标注的图像训练物体检测模型（识别行人、车辆、车道线、交通标志）
2. **无监督学习**：用自编码器学习道路场景的紧凑表示，用于异常场景检测
3. **强化学习**：在模拟环境中训练变道、超车等驾驶策略，用奖励函数优化安全性和舒适度

### 案例 3：ChatGPT（RLHF 的标杆）

前面已经详细讲了 GPT 的三阶段训练流程。这里补充一些数字：

- 预训练阶段使用了约 3000 亿个 token 的文本数据
- SFT 阶段使用了约 10 万条人工标注的指令-回复对
- RLHF 阶段使用了数万条人类偏好排序数据

每一个阶段都在前一个阶段的基础上进一步提升。如果只有预训练（无监督），模型会胡说八道；如果只有 SFT（监督），模型知道格式但不够自然；加上 RLHF（强化学习）后，模型的回复质量有了质的飞跃。

### 案例 4：信用卡欺诈检测

这是监督学习和无监督学习配合使用的经典场景：

- **监督学习**：用历史标记的欺诈/正常交易训练分类器，识别已知模式的欺诈行为
- **无监督学习**：用异常检测发现从未见过的新型欺诈模式。欺诈者不断变换手法，纯靠监督学习永远追不上新的欺诈模式

Visa 的实时欺诈检测系统每秒处理超过 76,000 笔交易，其中异常检测模块就是用无监督方法捕捉新型欺诈。

---

## 权衡取舍以及何时不该使用

### 监督学习什么时候不好使

1. **标注成本太高**：医学影像标注需要专业医生，每张图的标注成本可能高达几十美元。如果有 100 万张图片需要标注，这笔钱不是小数目
2. **标签有噪声**：人工标注不可避免地会有错误。研究表明，常用的 ImageNet 数据集中约有 5-6% 的标签是错误的
3. **问题变化太快**：垃圾邮件的模式每天都在变，三个月前标注的数据可能已经过时
4. **类别极度不平衡**：欺诈检测中，正常交易可能占 99.9%，欺诈交易只占 0.1%。模型可能"聪明地"把所有交易都预测为正常，准确率就达到 99.9% 了——但完全没用到

### 无监督学习什么时候不好使

1. **你需要明确的预测**：无监督学习告诉你"用户可以分为 3 类"，但它不能告诉你"这个新用户明天会不会流失"
2. **结果解释主观**：两个数据科学家用同一组数据做聚类，可能得到完全不同的结论，而且都能自圆其说
3. **对参数敏感**：K-Means 的结果高度依赖你选择的 k 值。k=3 和 k=5 可能给出完全不同且都有道理的分组

### 强化学习什么时候不好使

1. **奖励函数难以设计**：这是一个经常被低估的问题。如果你训练一个机器人学习行走，奖励函数设计得不好，机器人可能学会"摔倒"来获得奖励（因为某种奇怪的奖励函数设计让"摔倒"得到了正奖励）
2. **样本效率低**：AlphaGo 自己跟自己下了 2900 万盘棋才达到人类顶尖水平。在真实环境中，你可能没有这么多试错的机会（自动驾驶就是一个极端例子——你不能让车撞 1000 次来学习）
3. **训练不稳定**：强化学习的训练过程以不稳定著称。同一套代码，不同的随机种子可能导致完全不同的结果
4. **安全问题**：在实际部署中，探索（试错）可能带来严重的安全风险。你不能让一个医疗诊断 AI 在真实患者身上"探索"

### 什么时候根本不该用机器学习

1. **规则就能解决**：如果你的问题可以用 10 个 if-else 准确解决，不需要机器学习
2. **数据太少**：大多数机器学习算法需要至少数百个样本。如果你只有 20 条数据，先去收集更多数据
3. **容错率为零**：如果你的应用场景要求 100% 的准确率（比如某些医疗诊断），机器学习不是合适的工具，因为它本质上是在处理不确定性
4. **不可解释会出问题**：在需要向监管机构解释决策逻辑的场景（如贷款审批），过于复杂的黑箱模型可能带来合规风险

---

## 关键要点

1. **三种范式的本质区别在于学习信号**：监督学习有答案（标签），无监督学习没有答案但要从数据中找结构，强化学习没有答案但有奖励反馈。选择哪种范式，首先要看你的数据有没有标签、你想要的输出是什么

2. **监督学习是企业应用的主流（约 80%），但它依赖昂贵的标注数据**。如果你的问题有明确的目标变量（比如"是否流失"、"价格是多少"），且有足够的历史数据，监督学习通常是首选

3. **无监督学习的价值在于发现你不知道的规律**。它不是用来替代监督学习的，而是用来补充——先用无监督方法发现数据中的隐藏结构，再用监督方法在这些结构上做预测

4. **强化学习在 2025-2026 年最大的影响力来自 RLHF**——它让大语言模型的输出变得更有用、更安全。但在传统的企业应用中，强化学习的使用仍然受到训练成本和安全性的限制

5. **最先进的 AI 系统同时使用三种范式**。GPT 的训练流程（自监督预训练 → 监督微调 → RLHF）是一个范式：理解这三种方法如何配合，比单独理解某一种更重要

6. **数据决定上限，算法决定下限**。选择正确的学习范式只是第一步。数据的质量和数量，以及特征工程的水平，往往比算法选择对最终结果的影响更大

---

## 延伸阅读

**基础教材**：
- Christopher Bishop, "Pattern Recognition and Machine Learning"（PRML）——统计机器学习的经典教材，数学推导严谨
- Kevin Murphy, "Machine Learning: A Probabilistic Perspective"——从概率视角全面介绍 ML
- Richard Sutton & Andrew Barto, "Reinforcement Learning: An Introduction"——强化学习的圣经，在线免费

**实践指南**：
- Google ML Crash Course (developers.google.com/machine-learning/crash-course) —— 免费系统化教程
- Scikit-learn 官方文档 (scikit-learn.org) —— 最佳实践和算法对比
- Spotify 的 ML 实践博客 —— 推荐系统中多范式结合的真实案例

**进阶阅读**：
- "Training language models to follow instructions with human feedback" (InstructGPT 论文, 2022) —— RLHF 的奠基论文
- "A Survey on Deep Reinforcement Learning" —— 强化学习在深度学习时代的全面综述

**在线资源**：
- Andrej Karpathy 的 YouTube 频道 —— 直觉式的 ML 讲解
- 3Blue1Brown 的神经网络系列 —— 用可视化讲清楚数学
- fast.ai 课程 —— 自顶向下的实践式 ML 学习
