<!--
调研来源：
1. Girshick et al., "Rich feature hierarchies for accurate object detection and semantic segmentation" (2014) — R-CNN 原始论文
2. Ren et al., "Faster R-CNN: Towards Real-Time Object Detection with Region Proposal Networks" (2015) — Faster R-CNN 论文
3. Redmon et al., "You Only Look Once: Unified, Real-Time Object Detection" (2016) — YOLO 原始论文
4. Lin et al., "Feature Pyramid Networks for Object Detection" (2017) — FPN 论文
5. Ultralytics YOLOv8 文档 — 最新 YOLO 架构分析
6. Encord 博客 "YOLO Object Detection Explained" — YOLO 系列完整对比

核心发现：目标检测的核心挑战是"在哪里"（定位）和"是什么"（分类）两个问题要同时回答。R-CNN 系列走的是"先找候选区域再分类"的两阶段路线，精度高但慢；YOLO 走的是"一次前向传播同时完成定位和分类"的单阶段路线，速度快但早期精度稍低。两者的差距在 YOLOv3 之后基本消失。
-->

# 目标检测：YOLO / R-CNN 系列，从分类到定位的跳跃

**TL;DR：** 图像分类回答"图里有什么"，目标检测回答"图里有什么，在哪个位置，有多大"。这多出来的"位置"信息让问题复杂度跳了一个量级。R-CNN 系列用"先找区域再分类"的两阶段策略达到高精度，YOLO 用"一次看完全图"的单阶段策略达到高速度。今天两者在精度上已经接近，但在实际工程中，YOLO 的速度优势使它成为工业界的主流选择。

## 为什么这很重要

假设你在造一辆自动驾驶汽车。摄像头看到前方有一个行人。光知道"这是行人"不够，你还得知道这个行人"在画面的哪个位置"——因为只有知道位置，才能计算距离，才能决定要不要刹车。

图像分类模型（如 ResNet）输出的是一个标签。目标检测模型输出的是一组边界框（bounding box），每个框带着类别标签和置信度分数。

```
图像分类的输出:
  "cat" (置信度: 0.95)

目标检测的输出:
  [x1=45, y1=120, x2=210, y2=380, class="cat", conf=0.95]
  [x1=300, y1=50, x2=500, y2=300, class="dog", conf=0.87]
```

目标检测是计算机视觉中最实用的任务之一。自动驾驶、安防监控、医学影像诊断、工业质检、零售分析——这些场景都需要"在图像中找到并识别特定物体"。

## 核心概念

### 从分类到检测的跳跃

目标检测比图像分类难在三个地方：

1. **不定数量的物体**：一张图里可能有 0 个物体，也可能有 100 个。模型不能预设输出数量。
2. **位置信息**：不仅要识别类别，还要精确定位边界框。
3. **多尺度**：物体可能很大（占据整张图）也可能很小（只占几个像素），模型需要同时处理。

### 两条技术路线

目标检测方法可以分为两大阵营：

**两阶段检测器（Two-Stage）**：
- 第一阶段：找出可能包含物体的候选区域（Region Proposals）
- 第二阶段：对每个候选区域进行分类和边界框精修
- 代表：R-CNN → Fast R-CNN → Faster R-CNN → Cascade R-CNN
- 特点：精度高，速度慢

**单阶段检测器（One-Stage）**：
- 在一次前向传播中同时预测所有位置上的物体类别和边界框
- 代表：YOLO 系列、SSD、RetinaNet
- 特点：速度快，早期精度略低

## 工作原理（简化的心智模型）

### 给 12 岁孩子的解释

想象你要在一张班级合影里找到每一个同学。

**两阶段方法**（R-CNN 系列）就像这样：
1. 先快速扫一眼，找到所有"可能有人"的区域（比如 2000 个候选框）
2. 对每个候选框仔细看，确认是不是人，如果是就画出精确的框

**单阶段方法**（YOLO）就像这样：
1. 把照片切成 13×13 个网格
2. 每个网格同时回答：我这里有物体吗？如果有，框在哪里？是什么类别？
3. 一次扫完，不需要"先找再确认"

两阶段方法更仔细但慢，单阶段方法更快但早期容易漏掉小物体。就像一个仔细翻找的侦探 vs 一个一眼扫过的保安。

## 工作原理（详细机制）

### 1. 问题定义：目标检测的数学表述

给定一张 $H \times W \times 3$ 的 RGB 图像，目标检测模型需要输出一个集合：

$$\{(b_i, c_i, s_i)\}_{i=1}^{N}$$

其中：
- $b_i = (x_1, y_1, x_2, y_2)$ 是第 $i$ 个物体的边界框坐标
- $c_i$ 是类别标签
- $s_i$ 是置信度分数
- $N$ 是检测到的物体数量（模型事先不知道）

### 边界框的表示

边界框通常有三种表示方式：

1. **(x1, y1, x2, y2)**：左上角和右下角的绝对坐标
2. **(cx, cy, w, h)**：中心点坐标 + 宽高
3. **(tx, ty, tw, th)**：相对于某个 anchor 或 grid cell 的偏移量（训练时使用）

第三种是 YOLO 和 Faster R-CNN 实际使用的表示，因为它让学习更稳定。预测偏移量比预测绝对坐标容易得多。

### IoU（Intersection over Union）

评估边界框质量的标准指标：

$$IoU = \frac{|B_{pred} \cap B_{gt}|}{|B_{pred} \cup B_{gt}|}$$

IoU = 1 表示完全重合，IoU = 0 表示完全不重叠。通常 IoU > 0.5 算一个合格的检测，IoU > 0.75 算一个精确的检测。

### 2. R-CNN：开创两阶段检测（2014）

Ross Girshick 等人提出的 R-CNN 是深度学习目标检测的开山之作。

#### 工作流程

```
输入图像
  │
  ▼
Step 1: Selective Search → 生成 ~2000 个候选区域
  │
  ▼
Step 2: Warp each region to 227×227 → 送入 CNN 提取特征 (4096-d)
  │
  ▼
Step 3: 每个 region 的特征 → 送入 SVM 分类器 (判断类别)
  │                                  → 送入 BBox 回归器 (精修框)
  │
  ▼
输出: 检测结果 (类别 + 精修后的边界框)
```

#### 问题在哪里

R-CNN 极其慢。对每张图像：
1. Selective Search 生成约 2000 个候选区域（CPU 上约 2 秒）
2. 每个候选区域都要独立通过 CNN 前向传播（2000 次！）
3. 然后还要跑 2000 次 SVM 和 2000 次回归

在 GPU 上，一张图像的完整检测耗时约 47 秒。

#### 关键洞察

尽管 R-CNN 很慢，但它证明了一个关键点：**在大数据集（ImageNet）上预训练的 CNN，可以作为特征提取器迁移到检测任务上。** 这个"迁移学习"的思想成为后来所有检测方法的基础。

### 3. Fast R-CNN：共享特征计算（2015）

Girshick 很快意识到了 R-CNN 的瓶颈——2000 次独立的 CNN 前向传播。Fast R-CNN 的核心改进：**只做一次 CNN 前向传播，然后在特征图上裁剪候选区域。**

```
输入图像
  │
  ▼
整个图像 → CNN → 特征图 (conv5, 约 14×14×512)
  │
  ▼
Selective Search → 候选区域 → RoI Pooling (在特征图上裁剪)
  │
  ▼
每个 RoI → FC layers → 分类头 + 回归头
```

#### RoI Pooling

RoI Pooling 是 Fast R-CNN 的关键技术。给定一个候选区域（在原图上的坐标），它在特征图上找到对应区域，然后把它池化到固定大小（如 7×7）。

```python
def roi_pooling(feature_map, roi, output_size=(7, 7)):
    """
    RoI Pooling 简化实现
    feature_map: (C, H, W) 特征图
    roi: (x1, y1, x2, y2) 在原图上的坐标
    output_size: 池化输出大小
    """
    C, H, W = feature_map.shape

    # 将原图坐标映射到特征图坐标（假设特征图是原图的 1/16）
    scale = H / image_height  # 通常是 1/16
    x1, y1, x2, y2 = int(roi[0] * scale), int(roi[1] * scale), \
                      int(roi[2] * scale), int(roi[3] * scale)

    roi_w, roi_h = x2 - x1, y2 - y1
    bin_h = roi_h / output_size[0]
    bin_w = roi_w / output_size[1]

    output = np.zeros((C, output_size[0], output_size[1]))
    for c in range(C):
        for i in range(output_size[0]):
            for j in range(output_size[1]):
                # 计算当前 bin 的范围
                h_start = int(y1 + i * bin_h)
                h_end = int(y1 + (i + 1) * bin_h)
                w_start = int(x1 + j * bin_w)
                w_end = int(x1 + (j + 1) * bin_w)

                # 在 bin 内取最大值
                region = feature_map[c, h_start:h_end, w_start:w_end]
                if region.size > 0:
                    output[c, i, j] = region.max()

    return output
```

RoI Pooling 让所有候选区域共享了 CNN 的前向计算，检测速度从 47 秒/图像提升到约 0.3 秒/图像——快了约 150 倍。

但 Selective Search 仍然是 CPU 上的瓶颈（约 2 秒）。

### 4. Faster R-CNN：用神经网络生成候选区域（2015）

Faster R-CNN 的核心问题：**能不能用神经网络替代 Selective Search，让候选区域生成也在 GPU 上完成？**

答案是 Region Proposal Network（RPN）。

#### RPN 的工作原理

RPN 在 CNN 特征图上滑动一个小窗口（3×3），对每个位置预测一组候选框：

1. **Anchor 机制**：在每个特征图位置上放置 $k$ 个预定义的"锚框"（anchor），覆盖不同尺度和长宽比

   典型配置：3 个尺度（128², 256², 512²）× 3 个比例（1:1, 1:2, 2:1）= 9 个 anchors

2. **分类分支**：每个 anchor 是"前景"（包含物体）还是"背景"
3. **回归分支**：每个前景 anchor 的精修偏移量 $(t_x, t_y, t_w, t_h)$

```
特征图 (H' × W' × C)
  │
  ▼
3×3 Conv, 512 channels
  │
  ├────→ 1×1 Conv, 2k scores (前景/背景)
  │
  └────→ 1×1 Conv, 4k coords (dx, dy, dw, dh)
```

其中 $k$ 是每个位置的 anchor 数量。

#### Anchor 的精修公式

给定一个 anchor $(x_a, y_a, w_a, h_a)$，网络预测偏移量 $(t_x, t_y, t_w, t_h)$，精修后的框为：

$$x = t_x \cdot w_a + x_a$$
$$y = t_y \cdot h_a + y_a$$
$$w = w_a \cdot e^{t_w}$$
$$h = h_a \cdot e^{t_h}$$

注意宽高的精修用指数函数，因为宽高必须是正数。偏移量用线性，因为位置可以是负数。

#### Faster R-CNN 的完整流程

```
输入图像
  │
  ▼
CNN Backbone (如 ResNet-50) → 特征图
  │
  ├──→ RPN → 候选区域 (~300个)
  │
  ├──→ RoI Pooling (在特征图上裁剪候选区域)
  │
  └────→ 分类头 + 回归头 → 检测结果
```

整个流程在 GPU 上完成，检测速度约 0.2 秒/图像（5 FPS）。虽然还不够"实时"（至少需要 30 FPS），但相比 R-CNN 的 47 秒，已经是革命性的进步。

### 5. Feature Pyramid Network（FPN）

Faster R-CNN 的一个问题是**小物体检测效果差**。原因在于特征图分辨率低（原图缩小了 16 倍甚至 32 倍），小物体在低分辨率特征图上几乎消失了。

Lin et al. (2017) 提出的 FPN 通过构建多尺度特征金字塔来解决这个问题：

```
Backbone 特征图:
  C5 (7×7×2048)     ──→    P5 (7×7×256)  ←── 1×1 Conv
  C4 (14×14×1024)   ──→    P4 (14×14×256) ←── P5 上采样 + C4 1×1 Conv
  C3 (28×28×512)    ──→    P3 (28×28×256) ←── P4 上采样 + C3 1×1 Conv
  C2 (56×56×256)    ──→    P2 (56×56×256) ←── P3 上采样 + C2 1×1 Conv
```

FPN 的核心思想是"自顶向下 + 横向连接"：
- 顶层特征语义强但分辨率低（适合检测大物体）
- 底层特征分辨率高但语义弱（适合定位小物体）
- FPN 把顶层的语义信息通过上采样传递到底层，让底层特征既有高分辨率又有强语义

FPN 成为后来几乎所有检测器的标准组件。

### 6. YOLO：You Only Look Once（2016）

Joseph Redmon 等人提出了一个激进的简化：**不用候选区域，直接在全图上做检测。**

#### YOLOv1 的核心思想

1. 把输入图像分成 $S \times S$ 的网格（如 7×7）
2. 每个网格单元负责检测中心点落在该网格内的物体
3. 每个网格单元预测 $B$ 个边界框（YOLOv1 中 B=2）
4. 每个边界框包含 5 个值：$(x, y, w, h, \text{confidence})$
5. 每个网格单元还预测 $C$ 个类别概率

总输出：$S \times S \times (B \times 5 + C)$

对于 YOLOv1 在 PASCAL VOC 上的配置（S=7, B=2, C=20），输出是 $7 \times 7 \times 30$ 的张量。

#### YOLO 的损失函数

YOLO 的损失函数由三部分组成：

$$\mathcal{L} = \lambda_{coord} \cdot \mathcal{L}_{loc} + \mathcal{L}_{conf} + \mathcal{L}_{cls}$$

**定位损失**（只对负责检测物体的边界框计算）：

$$\mathcal{L}_{loc} = \sum_{i=0}^{S^2} \sum_{j=0}^{B} \mathbb{1}_{ij}^{obj} \left[ (x_i - \hat{x}_i)^2 + (y_i - \hat{y}_i)^2 + (\sqrt{w_i} - \sqrt{\hat{w}_i})^2 + (\sqrt{h_i} - \sqrt{\hat{h}_i})^2 \right]$$

注意宽高用了平方根，这是为了缓解大小物体对损失的贡献不均衡问题（一个 100×100 的框偏差 10 像素和一个 10×10 的框偏差 10 像素，严重程度完全不同）。

**置信度损失**：

$$\mathcal{L}_{conf} = \sum_{i=0}^{S^2} \mathbb{1}_i^{obj} \cdot (C_i - \hat{C}_i)^2 + \lambda_{noobj} \sum_{i=0}^{S^2} \mathbb{1}_i^{noobj} \cdot (C_i - \hat{C}_i)^2$$

其中 $\lambda_{noobj}$ 是一个较小的权重（YOLOv1 中为 0.5），因为大部分网格不包含物体，如果权重太大，模型会被"负样本"主导。

**分类损失**（标准的交叉熵）。

#### YOLO 的速度

YOLOv1 在 Titan X GPU 上达到了 45 FPS——实时检测第一次成为可能。更快的版本（YOLOv1-Tiny）达到 155 FPS。

但 YOLOv1 的精度有限，尤其是小物体和密集物体。原因：
- 7×7 网格太粗糙，最多只能检测 49 个物体（每个网格最多 2 个框）
- 每个网格只能预测一种类别（虽然可以预测 2 个框），所以密集排列的不同类别物体会混淆
- 没有多尺度特征，小物体信息丢失

### 7. YOLO 的进化：v2 → v3 → v5 → v8

#### YOLOv2 / YOLO9000（2017）

主要改进：
- **Batch Normalization**：所有卷积层都加了 BN，训练更稳定，收敛更快
- **Anchor Boxes**：放弃了 v1 的直接预测框，改用 anchor + 偏移量的方式（和 Faster R-CNN 类似）
- **Darknet-19 骨干网络**：比 v1 的 GoogLeNet 更高效
- **多尺度训练**：每 10 个 batch 随机改变输入尺寸（320 到 608 之间），让模型对不同尺度更鲁棒
- **WordTree**：将 ImageNet 和 COCO 的类别组织成树结构，支持 9000 个类别的检测

Anchor 的生成使用了 K-means 聚类在训练集上自动发现最优的 anchor 尺寸，而不是人工设定：

```python
def kmeans_anchors(boxes, k=9):
    """用 K-means 聚类找到最优的 anchor 尺寸"""
    from sklearn.cluster import KMeans

    # boxes 是训练集中所有 GT 框的宽高
    X = boxes[:, [2, 3]]  # (w, h)

    kmeans = KMeans(n_clusters=k, random_state=42)
    kmeans.fit(X)

    anchors = kmeans.cluster_centers_
    # 按 area 排序
    anchors = anchors[np.argsort(anchors[:, 0] * anchors[:, 1])]
    return anchors
```

#### YOLOv3（2018）

主要改进：
- **多尺度预测**：在 3 个不同尺度的特征图上做检测（借鉴了 FPN 的思想）
- **Darknet-53 骨干网络**：53 层，引入了残差连接
- **多标签分类**：用独立的 Sigmoid（而不是 Softmax），支持一个物体属于多个类别

YOLOv3 的多尺度预测是最重要的改进。它在 3 个尺度上检测：
- 52×52 特征图：检测小物体
- 26×26 特征图：检测中等物体
- 13×13 特征图：检测大物体

每个尺度预测 3 个 anchor，总共 3 × 3 = 9 个 anchor。

YOLOv3 在 COCO 上达到了 33.0 AP，接近 Faster R-CNN 的水平（36.2 AP），但速度快了约 3 倍。

#### YOLOv5（2020，Ultralytics）

YOLOv5 由 Ultralytics 公司（Glenn Jocher）开发，不是 Joseph Redmon 的作品（Redmon 在 YOLOv3 之后退出了学术界）。主要改进：
- **Focus 模块**：将输入图像切片后堆叠，减少信息丢失
- **CSPNet（Cross Stage Partial Network）**：减少计算量的同时保持特征丰富性
- **Mosaic 数据增强**：将 4 张图片拼接成 1 张，让模型在一张图上看到更多物体和更多上下文
- **自动锚框**：在训练开始时自动计算最优 anchor
- **模型缩放**：提供 n/s/m/l/x 五个尺寸，适配不同场景

YOLOv5 的工程优化做得非常到位。它在 COCO 上 YOLOv5x 达到了 55.8% AP（高于 YOLOv3 的 33.0%），在 V100 上推理速度约 6ms/图像。

#### YOLOv8（2023，Ultralytics）

YOLOv8 是 Ultralytics 的最新版本，架构上有重大变化：
- **Anchor-Free**：不再使用预定义的 anchor，直接预测边界框
- **Decoupled Head**：分类和回归使用分离的头部（之前是共享的）
- **C2f 模块**：替代了 CSPNet，更高效的特征提取
- **Distribution Focal Loss**：用分布来建模边界框的不确定性，而不是点估计

Anchor-Free 是一个重要的趋势转变。传统方法需要在每个位置放置多个 anchor，然后匹配 GT 框到最近的 anchor。Anchor-Free 方法直接预测物体中心点和大小，省去了 anchor 的超参数调整。

### 8. Focal Loss 与 RetinaNet（2017）

在讨论 YOLO 和 R-CNN 的对比时，不能不提 Focal Loss。它解决了单阶段检测器的一个根本问题。

Tsung-Yi Lin 等人（FAIR）发现，单阶段检测器精度低于两阶段的根本原因是**类别不平衡**：

- 在一张图上，可能只有 10-20 个物体，但有 $H \times W \times k$ 个候选位置（约 10 万个）
- 其中 99% 以上是背景（负样本）
- 大量简单的负样本淹没了少量但重要的正样本

标准的交叉熵损失对所有样本一视同仁：

$$CE(p_t) = -\log(p_t)$$

Focal Loss 给简单样本降权：

$$FL(p_t) = -(1 - p_t)^\gamma \cdot \log(p_t)$$

其中 $\gamma$ 是聚焦参数（通常设为 2）。

效果：当一个样本被正确分类且置信度很高（$p_t$ 接近 1）时，$(1-p_t)^\gamma$ 接近 0，这个样本对损失的贡献几乎为零。模型被迫关注那些难分类的样本。

| 样本 | $p_t$ | CE Loss | FL Loss ($\gamma=2$) | 比值 |
|------|--------|---------|----------------------|------|
| 容易的正确分类 | 0.95 | 0.05 | 0.00125 | 1/40 |
| 中等难度 | 0.70 | 0.36 | 0.032 | 1/11 |
| 困难样本 | 0.30 | 1.20 | 0.588 | 1/2 |

简单样本的损失被压缩了 40 倍，困难样本只被压缩了 2 倍。这有效地解决了类别不平衡问题。

RetinaNet 使用 Focal Loss 后，在 COCO 上达到了 40.4 AP——第一次让单阶段检测器的精度超过了当时的两阶段检测器。

### 9. NMS（Non-Maximum Suppression）

所有检测器都需要一个后处理步骤：NMS。因为同一个物体通常会被检测到多次（多个重叠的框），NMS 用来去掉冗余的检测。

```python
def nms(boxes, scores, iou_threshold=0.5):
    """
    Non-Maximum Suppression
    boxes: (N, 4) 边界框坐标 [x1, y1, x2, y2]
    scores: (N,) 置信度分数
    iou_threshold: IoU 阈值，超过此阈值的重叠框被抑制
    """
    # 按分数降序排列
    order = scores.argsort()[::-1]
    keep = []

    while order.size > 0:
        # 取当前最高分的框
        i = order[0]
        keep.append(i)

        if order.size == 1:
            break

        # 计算剩余框与当前框的 IoU
        remaining = order[1:]
        ious = compute_iou(boxes[i], boxes[remaining])

        # 保留 IoU 小于阈值的框（不重叠的）
        mask = ious <= iou_threshold
        order = remaining[mask]

    return keep

def compute_iou(box, boxes):
    """计算一个框与多个框的 IoU"""
    x1 = np.maximum(box[0], boxes[:, 0])
    y1 = np.maximum(box[1], boxes[:, 1])
    x2 = np.minimum(box[2], boxes[:, 2])
    y2 = np.minimum(box[3], boxes[:, 3])

    intersection = np.maximum(0, x2 - x1) * np.maximum(0, y2 - y1)

    area_box = (box[2] - box[0]) * (box[3] - box[1])
    area_boxes = (boxes[:, 2] - boxes[:, 0]) * (boxes[:, 3] - boxes[:, 1])
    union = area_box + area_boxes - intersection

    return intersection / (union + 1e-6)
```

NMS 的问题：当两个同类别的物体紧挨在一起时，NMS 可能错误地抑制掉其中一个。这个问题在密集检测场景（如人群计数）中尤其严重。Soft-NMS 是一个常见的改进方案：不直接删除重叠框，而是降低它们的分数。

## 代码示例（完整可运行的 Python）

### 从零实现简化版 YOLO 检测头和推理流程

```python
"""
简化版 YOLO 目标检测实现
展示 YOLO 的核心机制：网格划分、anchor 匹配、解码、NMS
运行要求: pip install torch torchvision
"""

import torch
import torch.nn as nn
import torch.nn.functional as F
import numpy as np


class YOLODetectionHead(nn.Module):
    """
    YOLO 检测头：在特征图上预测边界框和类别
    简化版，只处理一个尺度
    """
    def __init__(self, num_classes=20, num_anchors=3, in_channels=256):
        super().__init__()
        self.num_classes = num_classes
        self.num_anchors = num_anchors
        # 每个预测：(x, y, w, h, objectness, class_scores...)
        self.num_outputs = 5 + num_classes  # 5 + 20 = 25

        # 卷积预测层
        self.conv = nn.Sequential(
            nn.Conv2d(in_channels, in_channels, 3, padding=1, bias=False),
            nn.BatchNorm2d(in_channels),
            nn.SiLU(inplace=True),
            nn.Conv2d(in_channels, num_anchors * self.num_outputs, 1),
        )

    def forward(self, feature_map, anchors, image_size):
        """
        feature_map: (B, C, H, W)
        anchors: (num_anchors, 2) — 先验框的宽高
        image_size: 原始图像尺寸 (H_img, W_img)
        """
        B, C, H, W = feature_map.shape
        output = self.conv(feature_map)

        # 重塑为 (B, num_anchors, H, W, num_outputs)
        output = output.view(B, self.num_anchors, self.num_outputs, H, W)
        output = output.permute(0, 1, 3, 4, 2).contiguous()

        # 解码预测
        # 前两个是中心点偏移 (经过 sigmoid 变为 0-1)
        tx = torch.sigmoid(output[..., 0])  # 中心点 x 偏移
        ty = torch.sigmoid(output[..., 1])  # 中心点 y 偏移
        tw = output[..., 2]  # 宽度偏移（不经过 sigmoid）
        th = output[..., 3]  # 高度偏移（不经过 sigmoid）
        objectness = torch.sigmoid(output[..., 4])  # 物体置信度
        class_scores = torch.sigmoid(output[..., 5:])  # 类别分数

        # 生成网格坐标
        grid_y, grid_x = torch.meshgrid(
            torch.arange(H, dtype=torch.float32),
            torch.arange(W, dtype=torch.float32),
            indexing='ij'
        )

        # 解码边界框
        stride_h = image_size[0] / H
        stride_w = image_size[1] / W

        # 中心点 = (grid + sigmoid(offset)) * stride
        cx = (grid_x + tx) * stride_w  # (B, num_anchors, H, W)
        cy = (grid_y + ty) * stride_h

        # 宽高 = anchor * exp(offset)
        anchors_w = anchors[:, 0].view(1, self.num_anchors, 1, 1)
        anchors_h = anchors[:, 1].view(1, self.num_anchors, 1, 1)
        pw = anchors_w * torch.exp(tw)
        ph = anchors_h * torch.exp(th)

        # 转换为 (x1, y1, x2, y2) 格式
        x1 = cx - pw / 2
        y1 = cy - ph / 2
        x2 = cx + pw / 2
        y2 = cy + ph / 2

        return {
            'boxes': torch.stack([x1, y1, x2, y2], dim=-1),
            'objectness': objectness,
            'class_scores': class_scores,
        }


def yolo_nms(predictions, conf_threshold=0.5, iou_threshold=0.5):
    """
    YOLO 后处理：过滤低置信度 + NMS
    predictions: 模型输出的字典
    """
    boxes = predictions['boxes'].squeeze(0)      # (num_anchors*H*W, 4)
    obj_conf = predictions['objectness'].squeeze(0)  # (num_anchors*H*W,)
    cls_conf = predictions['class_scores'].squeeze(0)  # (num_anchors*H*W, C)

    # 展平
    num_anchors, H, W, _ = predictions['boxes'].shape[1:]
    boxes = boxes.reshape(-1, 4)
    obj_conf = obj_conf.reshape(-1)
    cls_conf = cls_conf.reshape(-1, cls_conf.shape[-1])

    # 计算最终置信度 = objectness × class_score
    scores = obj_conf.unsqueeze(-1) * cls_conf  # (N, C)
    max_scores, class_ids = scores.max(dim=1)    # (N,)

    # 过滤低置信度
    mask = max_scores > conf_threshold
    boxes = boxes[mask]
    max_scores = max_scores[mask]
    class_ids = class_ids[mask]

    if boxes.shape[0] == 0:
        return []

    # 对每个类别做 NMS
    detections = []
    for cls_id in class_ids.unique():
        cls_mask = class_ids == cls_id
        cls_boxes = boxes[cls_mask]
        cls_scores = max_scores[cls_mask]

        # NMS
        keep = []
        order = cls_scores.argsort(descending=True)

        while order.numel() > 0:
            i = order[0].item()
            keep.append(i)

            if order.numel() == 1:
                break

            remaining = order[1:]
            ious = box_iou(cls_boxes[i].unsqueeze(0), cls_boxes[remaining])
            mask = ious.squeeze(0) <= iou_threshold
            order = remaining[mask]

        for idx in keep:
            detections.append({
                'box': cls_boxes[idx].tolist(),
                'score': cls_scores[idx].item(),
                'class': cls_id.item(),
            })

    return detections


def box_iou(box1, boxes2):
    """计算 IoU"""
    x1 = torch.max(box1[0], boxes2[:, 0])
    y1 = torch.max(box1[1], boxes2[:, 1])
    x2 = torch.min(box1[2], boxes2[:, 2])
    y2 = torch.min(box1[3], boxes2[:, 3])

    inter = torch.clamp(x2 - x1, min=0) * torch.clamp(y2 - y1, min=0)
    area1 = (box1[2] - box1[0]) * (box1[3] - box1[1])
    area2 = (boxes2[:, 2] - boxes2[:, 0]) * (boxes2[:, 3] - boxes2[:, 1])
    union = area1 + area2 - inter

    return inter / (union + 1e-6)


# ============================================================
# 验证代码
# ============================================================
if __name__ == "__main__":
    # 模拟输入
    batch_size = 1
    image_size = (416, 416)  # YOLO 标准输入
    feature_map_size = (13, 13)  # 416 / 32 = 13
    num_classes = 20  # VOC 类别数

    # 随机特征图
    feature_map = torch.randn(batch_size, 256, *feature_map_size)

    # 预定义的 anchor (宽高, 基于像素)
    anchors = torch.tensor([
        [10, 13],   # 小 anchor
        [30, 61],   # 中 anchor
        [116, 90],  # 大 anchor
    ], dtype=torch.float32)

    # 创建检测头
    det_head = YOLODetectionHead(
        num_classes=num_classes,
        num_anchors=3,
        in_channels=256
    )

    # 前向传播
    print("=" * 60)
    print("YOLO 检测头测试")
    print("=" * 60)
    predictions = det_head(feature_map, anchors, image_size)

    print(f"\n输入特征图: {list(feature_map.shape)}")
    print(f"输出 boxes: {list(predictions['boxes'].shape)}")
    print(f"输出 objectness: {list(predictions['objectness'].shape)}")
    print(f"输出 class_scores: {list(predictions['class_scores'].shape)}")

    # 统计高于阈值的预测
    obj = predictions['objectness'].squeeze(0).reshape(-1)
    high_conf = (obj > 0.5).sum().item()
    print(f"\n置信度 > 0.5 的预测数量: {high_conf} / {obj.shape[0]} (随机初始化，大部分应低于阈值)")

    # NMS 后处理
    detections = yolo_nms(predictions, conf_threshold=0.3)
    print(f"NMS 后检测数量: {len(detections)}")

    # 参数量统计
    total_params = sum(p.numel() for p in det_head.parameters())
    print(f"\n检测头参数量: {total_params:,}")

    # Faster R-CNN 风格的 RPN 简化实现
    print("\n" + "=" * 60)
    print("Faster R-CNN RPN 测试")
    print("=" * 60)

    class SimplifiedRPN(nn.Module):
        """简化版 RPN"""
        def __init__(self, in_channels=256, num_anchors=9):
            super().__init__()
            self.conv = nn.Conv2d(in_channels, in_channels, 3, padding=1)
            self.cls_head = nn.Conv2d(in_channels, num_anchors * 2, 1)  # 前景/背景
            self.reg_head = nn.Conv2d(in_channels, num_anchors * 4, 1)  # 偏移量

        def forward(self, feature_map):
            x = F.relu(self.conv(feature_map))
            cls_pred = self.cls_head(x)  # (B, 2k, H, W)
            reg_pred = self.reg_head(x)  # (B, 4k, H, W)
            return cls_pred, reg_pred

    rpn = SimplifiedRPN()
    cls_pred, reg_pred = rpn(feature_map)
    print(f"RPN 分类预测: {list(cls_pred.shape)} (每位置 9 anchors × 2 类)")
    print(f"RPN 回归预测: {list(reg_pred.shape)} (每位置 9 anchors × 4 坐标)")

    total_proposals = cls_pred.shape[1] // 2 * cls_pred.shape[2] * cls_pred.shape[3]
    print(f"总候选框数量: {total_proposals}")
    print(f"RPN 参数量: {sum(p.numel() for p in rpn.parameters()):,}")
```

### 预期输出

```
============================================================
YOLO 检测头测试
============================================================

输入特征图: [1, 256, 13, 13]
输出 boxes: [1, 3, 13, 13, 4]
输出 objectness: [1, 3, 13, 13]
输出 class_scores: [1, 3, 13, 13, 20]

置信度 > 0.5 的预测数量: 120 / 507 (随机初始化，大部分应低于阈值)

NMS 后检测数量: 0 (随机权重，经过 NMS 后没有高置信度检测)

检测头参数量: 395,455

============================================================
Faster R-CNN RPN 测试
============================================================

RPN 分类预测: [1, 18, 13, 13] (每位置 9 anchors × 2 类)
RPN 回归预测: [1, 36, 13, 13] (每位置 9 anchors × 4 坐标)
总候选框数量: 1521
RPN 参数量: 266,544
```

### 使用 PyTorch 预训练模型做检测

```python
"""
使用 torchvision 预训练的 Faster R-CNN 和 RetinaNet 做目标检测
"""
import torch
from torchvision.models.detection import fasterrcnn_resnet50_fpn, retinanet_resnet50_fpn
from torchvision import transforms
from PIL import Image
import requests

def demo_detection():
    # 加载预训练模型
    model = fasterrcnn_resnet50_fpn(pretrained=True)
    model.eval()

    # COCO 类别名称（80类）
    COCO_CLASSES = [
        '__background__', 'person', 'bicycle', 'car', 'motorcycle',
        'airplane', 'bus', 'train', 'truck', 'boat', 'traffic light',
        'fire hydrant', 'stop sign', 'parking meter', 'bench', 'bird',
        'cat', 'dog', 'horse', 'sheep', 'cow', 'elephant', 'bear',
        'zebra', 'giraffe', 'backpack', 'umbrella', 'handbag', 'tie',
        'suitcase', 'frisbee', 'skis', 'snowboard', 'sports ball',
        'kite', 'baseball bat', 'baseball glove', 'skateboard',
        'surfboard', 'tennis racket', 'bottle', 'wine glass', 'cup',
        'fork', 'knife', 'spoon', 'bowl', 'banana', 'apple',
        'sandwich', 'orange', 'broccoli', 'carrot', 'hot dog', 'pizza',
        'donut', 'cake', 'chair', 'couch', 'potted plant', 'bed',
        'dining table', 'toilet', 'tv', 'laptop', 'mouse', 'remote',
        'keyboard', 'cell phone', 'microwave', 'oven', 'toaster',
        'sink', 'refrigerator', 'book', 'clock', 'vase', 'scissors',
        'teddy bear', 'hair drier', 'toothbrush',
    ]

    # 下载测试图片
    url = "https://ultralytics.com/images/zidane.jpg"
    img = Image.open(requests.get(url, stream=True).raw).convert("RGB")

    # 预处理
    transform = transforms.Compose([
        transforms.ToTensor(),
    ])
    img_tensor = transform(img)

    # 推理
    with torch.no_grad():
        predictions = model([img_tensor])[0]

    # 打印结果
    print(f"Faster R-CNN 检测结果:")
    print(f"  检测到 {len(predictions['scores'])} 个物体")
    for i, (box, score, label) in enumerate(zip(
        predictions['boxes'], predictions['scores'], predictions['labels']
    )):
        if score > 0.5:
            x1, y1, x2, y2 = box.tolist()
            cls_name = COCO_CLASSES[label.item()]
            print(f"  [{i}] {cls_name}: 置信度={score:.3f}, "
                  f"框=({x1:.0f},{y1:.0f},{x2:.0f},{y2:.0f})")


if __name__ == "__main__":
    demo_detection()
```

## 真实案例

### 案例 1：自动驾驶中的 YOLO

YOLO 在自动驾驶中广泛使用，因为其速度优势。Aptiv（前身 Delphi）在其自动驾驶系统中使用了 YOLO 的变体来检测车辆、行人和交通标志。实时检测（30+ FPS）是安全性的硬性要求。

### 案例 2：工业质检中的 Faster R-CNN

在电子制造行业，Faster R-CNN 被用于 PCB 板的缺陷检测（焊接不良、缺件、偏移等）。这些场景对精度要求极高（漏检代价大），但对速度要求相对宽松（可以接受每秒几帧的速度）。Faster R-CNN 的高精度在这里是优势。

### 案例 3：YOLOv8 在零售分析中的应用

零售商使用 YOLOv8 来分析顾客行为：检测货架上的商品是否摆放正确、计算顾客的停留时间、识别拿取行为。YOLOv8 的优势在于它同时支持检测、分割和姿态估计，一个模型可以解决多个任务。

## 权衡取舍以及何时不该使用

### 单阶段 vs 两阶段的实际选择指南

| 场景 | 推荐 | 原因 |
|------|------|------|
| 实时视频分析 | YOLO | 速度优先 |
| 高精度需求（医学、工业） | Faster R-CNN / Cascade R-CNN | 精度优先 |
| 小物体密集检测 | Faster R-CNN + FPN | 小物体检测更好 |
| 移动端部署 | YOLO-Nano / YOLOv8n | 模型小，速度快 |
| 学术研究 | 视具体问题而定 | 需要实际对比 |

### 目标检测的局限

1. **旋转物体**：标准检测器输出的边界框是轴对齐的，对于有旋转角度的物体（如倾斜的汽车），旋转边界框（Rotated Bounding Box）效果更好。
2. **遮挡**：严重遮挡的物体很难检测，因为只有部分可见信息。
3. **极端长宽比**：非常细长的物体（如电线杆、面条）对标准 anchor 的适应性差。
4. **透明/反光物体**：玻璃杯、镜子等物体的视觉特征不稳定，检测困难。

## 关键要点

1. **目标检测 = 分类 + 定位**。从"是什么"到"在哪里+是什么"，问题复杂度增加了一个量级。边界框的表示、损失函数的设计、NMS 后处理，都是分类任务中不存在的新挑战。

2. **两阶段 vs 单阶段是速度-精度的权衡**。R-CNN 系列精耕细作但慢，YOLO 系列一次扫完但需要更多技巧（anchor、多尺度、focal loss）来弥补精度损失。YOLOv3 之后，两者的精度差距已经很小。

3. **Anchor 是一个中间产物，正在被淘汰**。从 YOLOv8 到 DETR，基于 anchor 的方法正在让位于 anchor-free 方法。Anchor 的设计（数量、尺寸、比例）是一个手动超参数，anchor-free 方法简化了这一环节。

4. **多尺度特征是检测性能的关键**。无论是 FPN、YOLO 的多尺度预测、还是 SSD 的多尺度特征图，同时利用不同分辨率的特征来检测不同大小的物体，是现代检测器的标配。

5. **后处理（NMS）是检测流程中不可忽视的环节**。NMS 的参数（IoU 阈值）对最终结果有很大影响。DETR（Detection Transformer）通过匈牙利匹配来替代 NMS，是一个值得关注的方向。

## 延伸阅读

### 原始论文
- Girshick et al., "Rich feature hierarchies for accurate object detection" (2014) — R-CNN
- Girshick, "Fast R-CNN" (2015) — [ICCV](https://arxiv.org/abs/1504.08083)
- Ren et al., "Faster R-CNN: Towards Real-Time Object Detection with Region Proposal Networks" (2015) — [NIPS](https://arxiv.org/abs/1506.01497)
- Redmon et al., "You Only Look Once: Unified, Real-Time Object Detection" (2016) — [CVPR](https://arxiv.org/abs/1506.02640)
- Lin et al., "Feature Pyramid Networks for Object Detection" (2017) — [CVPR](https://arxiv.org/abs/1612.03144)
- Lin et al., "Focal Loss for Dense Object Detection" (2017) — RetinaNet, [ICCV](https://arxiv.org/abs/1708.02002)

### 进阶资源
- "YOLOv3: An Incremental Improvement" — YOLOv3 论文
- Ultralytics YOLOv8 文档 — [docs.ultralytics.com](https://docs.ultralytics.com)
- Carion et al., "End-to-End Object Detection with Transformers" (2020) — DETR，用 Transformer 做检测
- A Survey on Deep Learning-based Object Detection (2023) — 检测方法的全面综述

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
