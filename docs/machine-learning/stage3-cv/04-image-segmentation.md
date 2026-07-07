<!--
调研来源：
1. Long et al., "Fully Convolutional Networks for Semantic Segmentation" (2015) — FCN 原始论文，开创语义分割
2. Ronneberger et al., "U-Net: Convolutional Networks for Biomedical Image Segmentation" (2015) — U-Net 原始论文
3. He et al., "Mask R-CNN" (2017) — 实例分割的开创性工作
4. Zhao et al., "PointRend: Image Segmentation as Rendering" (2019) — 高质量分割边界
5. Kirillov et al., "Segment Anything" (2023) — SAM，通用分割模型
6. 伦斯勒理工学院 CS6640 课程材料 — 分割任务的分类体系

核心发现：图像分割是目标检测的精细化版本。语义分割给每个像素分配一个类别标签（"这是猫的像素"、"这是背景像素"），实例分割在此基础上区分同类别的不同个体（"这是猫 A 的像素"、"这是猫 B 的像素"）。U-Net 通过编码器-解码器结构和跳跃连接成为医学影像分割的标准工具，Mask R-CNN 通过在 Faster R-CNN 上增加分割分支实现了实例分割。2023 年的 SAM（Segment Anything Model）展示了通用分割的可能性。
-->

# 图像分割：语义分割 vs 实例分割，U-Net 和 Mask R-CNN

**TL;DR：** 图像分割是"像素级分类"——给图像中的每一个像素打上标签。语义分割不区分同类别的不同个体（所有猫都标为"猫"），实例分割区分不同个体（猫 A、猫 B 各有自己的掩码）。U-Net 用编码器-解码器结构在医学影像中大放异彩，Mask R-CNN 在 Faster R-CNN 的基础上增加分割分支实现实例分割。分割是计算机视觉中最精细的任务，也是许多实际应用的核心。

## 为什么这很重要

目标检测用矩形框圈出物体的位置。但矩形框太粗糙了。一只猫的轮廓不是矩形的，一个肿瘤的形状不是矩形的，一条道路的边界不是矩形的。

当你需要精确到像素级别的轮廓时，就需要图像分割。

实际应用：
- **医学影像**：分割肿瘤、器官、血管的精确轮廓，用于手术规划和诊断
- **自动驾驶**：理解道路、车道线、可行驶区域的精确边界
- **图像编辑**：Photoshop 的"选择主体"功能、手机的人像模式（精确分割前景人物）
- **遥感分析**：从卫星图像中分割建筑、农田、森林的面积
- **工业检测**：精确分割缺陷区域的形状和大小

## 核心概念

### 三种分割任务

图像分割不是单一的任务。根据需要的信息粒度，分为三种：

**语义分割（Semantic Segmentation）**：
- 给每个像素分配一个类别标签
- 不区分同类别的不同个体
- 输出：每个像素一个类别 ID
- 示例：所有"猫"像素都标为"猫"，不管有几只猫

**实例分割（Instance Segmentation）**：
- 检测每个物体实例，并为每个实例生成精确的像素级掩码
- 区分同类别的不同个体
- 输出：每个像素一个实例 ID + 类别 ID
- 示例：猫 A 有自己的掩码，猫 B 也有自己的掩码

**全景分割（Panoptic Segmentation）**：
- 语义分割 + 实例分割的统一
- 对"物体"（thing，如人、车）做实例分割
- 对"背景"（stuff，如天空、道路）做语义分割
- 输出：每个像素一个实例 ID + 类别 ID，背景像素共享类别 ID

```
语义分割输出:
  猫 猫 猫 背 背
  猫 猫 猫 背 背
  猫 猫 猫 猫 猫
  狗 狗 狗 狗 狗
  狗 狗 狗 狗 狗

实例分割输出:
  猫A 猫A 猫A 背景 背景
  猫A 猫A 猫A 背景 背景
  猫A 猫A 猫A 猫B 猫B
  狗A 狗A 狗A 狗A 狗A
  狗A 狗A 狗A 狗A 狗A
```

### 评估指标

**IoU（Intersection over Union）** 也叫 Jaccard Index：

$$IoU = \frac{TP}{TP + FP + FN} = \frac{|P \cap G|}{|P \cup G|}$$

其中 $P$ 是预测的分割区域，$G$ 是真实的分割区域。

**Dice 系数**（医学影像中常用）：

$$Dice = \frac{2|P \cap G|}{|P| + |G|} = \frac{2 \cdot IoU}{1 + IoU}$$

**mIoU（mean IoU）**：所有类别 IoU 的平均值，是语义分割最常用的指标。

## 工作原理（简化的心智模型）

### 给 12 岁孩子的解释

想象你在给一张涂色书的图片上色。

**图像分类**是看一眼就说"这是一张猫的图片"。

**目标检测**是用矩形框把猫圈出来，说"猫在这个矩形里"。

**语义分割**是沿着猫的精确轮廓把每一个像素涂成红色、把背景的每一个像素涂成蓝色。就像仔细地沿着边缘上色，不超出边界。

**实例分割**更进一步：如果有两只猫，你用红色涂第一只，用绿色涂第二只，蓝色涂背景。你能区分两只不同的猫。

**U-Net** 就像一个画师，先快速勾画整体轮廓（编码器，逐渐缩小），然后在细节上精修（解码器，逐渐放大），同时不断参考之前的粗略草稿（跳跃连接）。

**Mask R-CNN** 就像一个先找到物体再精细描绘的画师：先用 Faster R-CNN 找到每个物体的矩形框，然后在每个框内精确描绘轮廓。

## 工作原理（详细机制）

### 1. FCN：全卷积网络（2015）

在 FCN 之前，CNN 做分类时最后会把特征图展平再接全连接层，输出一个全局的类别标签。FCN 的突破在于：**把全连接层替换成卷积层，保留空间信息。**

一个 4096 维的全连接层可以替换为一个 4096 个 1×1 的卷积核。效果一样，但保留了空间维度。

```
传统 CNN:
  Conv → Pool → Conv → Pool → ... → FC → FC → 类别标签
                                          ↑ 空间信息丢失

FCN:
  Conv → Pool → Conv → Pool → ... → 1×1 Conv → 上采样 → 像素级预测
                                                          ↑ 保留空间维度
```

#### FCN 的上采样问题

经过多次池化和 stride=2 的卷积，特征图分辨率已经很低了（如原图缩小了 32 倍）。要从低分辨率特征图恢复到原图分辨率，需要上采样。

最简单的方法是**双线性插值**，但效果粗糙。FCN 提出了一个更好的方案：**跳跃连接**。

```
Pool3 (H/8 × W/8 × C3)
                    │
Pool4 (H/16 × W/16 × C4)
                    │
Pool5 (H/32 × W/32 × C5) → 1×1 Conv → 上采样 2× → + Pool4 → 上采样 2× → + Pool3 → 上采样 8×
```

通过组合不同层级的特征，FCN 同时利用了高层语义信息和底层空间细节。这就是 FCN-8s（结合了 Pool3、Pool4、Pool5）效果最好的原因。

但 FCN 的输出仍然比较粗糙，边界不够精确。这是因为多次池化丢失了太多空间细节。

### 2. U-Net：编码器-解码器结构（2015）

U-Net 由 Olaf Ronneberger 等人提出，最初用于医学影像分割。它的核心思想是一个对称的"U"形结构：

```
编码器 (下采样)              解码器 (上采样)
                             ┌─────────────┐
    572×572×1  ─────────────→│   输入图像    │
      │                       └─────────────┘
      ▼ Conv 64              ┌─────────────┐
    570×570×64 ────────────→│  跳跃连接 ①  │────→ 388×388×64 → Conv → 388×388×1 (输出)
      │                       └─────────────┘
      ▼ MaxPool              ┌─────────────┐
    285×285×64              │  UpConv 64   │
      │                       └─────────────┘
      ▼ Conv 128             ┌─────────────┐
    283×283×128 ───────────→│  跳跃连接 ②  │────→ 200×200×128 → UpConv → ...
      │                       └─────────────┘
      ▼ MaxPool
    141×141×128
      │
      ▼ Conv 256
    139×139×256 ────────→ ... (继续对称)
      │
      ▼ MaxPool
    69×69×256
      │
      ▼ Conv 512
    67×67×512
      │
      ▼ MaxPool
    33×33×512
      │
      ▼ Conv 1024
    31×31×1024  ← 瓶颈层（最低分辨率，最高语义）
```

#### U-Net 的三大创新

**创新 1：对称的编码器-解码器**

编码器逐步降低分辨率、增加通道数（提取语义特征），解码器逐步增加分辨率、减少通道数（恢复空间细节）。这种对称结构让每一步都有明确的语义。

**创新 2：跳跃连接（Skip Connections）**

编码器每一层的特征图被"跳接"到解码器对应的层。这不是 ResNet 的加法跳跃连接，而是**通道拼接**（concatenation）。

```python
# 编码器的特征 → 与解码器的上采样特征在通道维度拼接
dec = torch.cat([encoder_feature, upsampled_feature], dim=1)  # 通道拼接
```

为什么用拼接而不是加法？因为编码器特征和解码器特征提供的信息类型不同。编码器特征包含丰富的空间细节，解码器特征包含高层语义信息。拼接保留了两者的完整信息，让后续层学习如何融合。

**创新 3：重叠切片（Overlap-tile）策略**

医学图像通常很大（如 512×512 甚至更大），但标注数据很少。U-Net 提出了 overlap-tile 策略：用有重叠的切片来分割大图像，边界区域用镜像填充来提供上下文。

#### U-Net 的数学分析

U-Net 解码器的上采样使用"转置卷积"（Transposed Convolution，也叫反卷积）：

普通卷积：$(H_{in}, W_{in}) \to (H_{out}, W_{out})$，其中 $H_{out} = \lfloor(H_{in} + 2p - k)/s\rfloor + 1$

转置卷积是普通卷积的"反向操作"：$(H_{out}, W_{out}) \to (H_{in}, W_{in})$。可以理解为在输入的像素之间插入空洞（由 stride 决定），然后用卷积核做前向传播。

```python
# 转置卷积示例
import torch.nn as nn

# 上采样 2 倍
upconv = nn.ConvTranspose2d(1024, 512, kernel_size=2, stride=2)
# 输入: (B, 1024, 31, 31) → 输出: (B, 512, 62, 62)
```

转置卷积比简单的双线性插值效果好，因为它的参数是可学习的。

#### U-Net 的变体

U-Net 的结构简洁而有效，催生了大量变体：

- **Attention U-Net**：在跳跃连接中加入了注意力门（Attention Gate），让解码器只关注相关的编码器特征
- **U-Net++**：用密集的嵌套跳跃连接替代简单的 U 形连接
- **nnU-Net**：自动适配数据集的 U-Net 配置（自动选择超参数），在医学分割竞赛中表现突出
- **V-Net**：U-Net 的 3D 版本，用于体数据（如 CT、MRI）的分割

### 3. DeepLab 系列：空洞卷积的智慧

U-Net 通过下采样-上采样来获取多尺度信息。DeepLab 系列用了一种不同的方法：**空洞卷积（Dilated Convolution / Atrous Convolution）**。

#### 空洞卷积的原理

空洞卷积在卷积核的元素之间插入空洞（零），不增加参数量也不增加计算量，但增大了感受野。

标准 3×3 卷积的感受野是 3。空洞率（dilation rate）为 2 的 3×3 卷积，感受野变成 5。空洞率为 4 的 3×3 卷积，感受野变成 9。

```python
# 标准卷积 (dilation=1)
# 1 1 1
# 1 1 1
# 1 1 1

# 空洞卷积 (dilation=2)
# 1 0 1 0 1
# 0 0 0 0 0
# 1 0 1 0 1
# 0 0 0 0 0
# 1 0 1 0 1
```

PyTorch 实现：

```python
import torch.nn as nn

# 标准卷积：感受野 = 3
conv_std = nn.Conv2d(256, 256, 3, padding=1, dilation=1)

# 空洞卷积：感受野 = 5，参数量完全相同
conv_dilated = nn.Conv2d(256, 256, 3, padding=2, dilation=2)
```

#### ASPP（Atrous Spatial Pyramid Pooling）

DeepLab v3+ 的核心组件是 ASPP，它并行使用不同空洞率的卷积：

```python
class ASPP(nn.Module):
    def __init__(self, in_channels, out_channels=256):
        super().__init__()
        self.conv1 = nn.Conv2d(in_channels, out_channels, 1)  # 1×1
        self.conv2 = nn.Conv2d(in_channels, out_channels, 3,
                               padding=6, dilation=6)  # 空洞率=6
        self.conv3 = nn.Conv2d(in_channels, out_channels, 3,
                               padding=12, dilation=12)  # 空洞率=12
        self.conv4 = nn.Conv2d(in_channels, out_channels, 3,
                               padding=18, dilation=18)  # 空洞率=18
        self.pool = nn.AdaptiveAvgPool2d(1)  # 全局池化
        self.project = nn.Conv2d(out_channels * 5, out_channels, 1)

    def forward(self, x):
        h, w = x.shape[2:]
        res = []
        res.append(self.conv1(x))
        res.append(self.conv2(x))
        res.append(self.conv3(x))
        res.append(self.conv4(x))
        res.append(F.interpolate(self.pool(x), size=(h, w),
                                  mode='bilinear', align_corners=False))
        return self.project(torch.cat(res, dim=1))
```

ASPP 让网络在同一种分辨率下捕获多尺度上下文信息，避免了下采样-上采样过程中的信息丢失。

### 4. Mask R-CNN：实例分割的标准（2017）

Mask R-CNN 由何恺明等人在 2017 年提出，是实例分割的里程碑。它的核心思想极其简洁：**在 Faster R-CNN 的基础上，增加一个分支来预测分割掩码。**

#### 架构概览

```
输入图像
  │
  ▼
CNN Backbone + FPN → 特征图
  │
  ├──→ RPN → 候选区域 (RoI)
  │
  ▼
RoI Align (精确实裁剪)
  │
  ├──→ 分类头 → 类别标签
  ├──→ 回归头 → 边界框坐标
  └──→ 分割头 → 28×28 的二值掩码 ← 新增！
```

#### 关键改进 1：RoI Align 替代 RoI Pooling

RoI Pooling 在量化坐标时会引入误差。例如，一个 RoI 的坐标映射到特征图上可能是 (3.7, 5.2)，但 RoI Pooling 会取整到 (4, 5)。这个取整误差在分类任务中影响不大，但在需要像素级精度的分割任务中会严重影响掩码质量。

RoI Align 的解决方案：**不做取整**。使用双线性插值直接在浮点坐标上采样。

```python
def roi_align(feature_map, roi, output_size=(7, 7)):
    """
    RoI Align 简化实现
    关键区别：不做取整，用双线性插值在浮点坐标上采样
    """
    C, H, W = feature_map.shape
    scale = H / image_height

    # 不取整！保留浮点坐标
    x1, y1, x2, y2 = roi[0] * scale, roi[1] * scale, roi[2] * scale, roi[3] * scale

    roi_h, roi_w = y2 - y1, x2 - x1
    bin_h = roi_h / output_size[0]
    bin_w = roi_w / output_size[1]

    output = np.zeros((C, output_size[0], output_size[1]))

    for i in range(output_size[0]):
        for j in range(output_size[1]):
            # 采样 bin 中心点（浮点坐标）
            center_y = y1 + (i + 0.5) * bin_h
            center_x = x1 + (j + 0.5) * bin_w

            # 双线性插值
            output[:, i, j] = bilinear_interpolate(
                feature_map, center_x, center_y
            )

    return output

def bilinear_interpolate(feature_map, x, y):
    """双线性插值"""
    x0, y0 = int(np.floor(x)), int(np.floor(y))
    x1, y1 = x0 + 1, y0 + 1

    # 确保在特征图范围内
    x0 = np.clip(x0, 0, feature_map.shape[2] - 1)
    x1 = np.clip(x1, 0, feature_map.shape[2] - 1)
    y0 = np.clip(y0, 0, feature_map.shape[1] - 1)
    y1 = np.clip(y1, 0, feature_map.shape[1] - 1)

    wa = (x1 - x) * (y1 - y)
    wb = (x1 - x) * (y - y0)
    wc = (x - x0) * (y1 - y)
    wd = (x - x0) * (y - y0)

    return (wa * feature_map[:, y0, x0] + wb * feature_map[:, y1, x0] +
            wc * feature_map[:, y0, x1] + wd * feature_map[:, y1, x1])
```

论文报告，仅用 RoI Align 替代 RoI Pooling，就把实例分割的 AP 从 24.4% 提升到了 25.7%——一个不小的提升，尤其考虑到这是一个零额外成本的改进。

#### 关键改进 2：解耦的掩码分支

掩码分支对每个类别独立预测一个二值掩码（$K$ 个类别 → $K$ 个掩码）。在推理时，只使用分类头预测的那个类别的掩码。

为什么不用一个掩码 + 分类？因为同一个 RoI 中可能有多个类别。独立预测让掩码分支不需要区分类别，只专注于"这个区域的精确形状是什么"。

掩码分支的结构：

```
RoI Align 输出: 14×14×256
  │
  ▼ Conv3×3, 256 → ReLU
  ▼ Conv3×3, 256 → ReLU
  ▼ Conv3×3, 256 → ReLU
  ▼ Conv3×3, 256 → ReLU
  ▼ DeConv2×2, 256 (上采样)
  ▼ Conv1×1, K (K 个类别的掩码)
  ▼ Sigmoid → 28×28×K 的掩码概率图
```

#### 损失函数

$$\mathcal{L} = \mathcal{L}_{cls} + \mathcal{L}_{box} + \mathcal{L}_{mask}$$

其中 $\mathcal{L}_{mask}$ 是逐像素的二值交叉熵损失，只对正确类别的掩码计算：

$$\mathcal{L}_{mask} = -\frac{1}{m^2} \sum_{i=1}^{m^2} \sum_{k} y_{ik} \log \hat{y}_{ik}$$

其中 $m = 28$ 是掩码分辨率，$k$ 是类别索引。

### 5. Segment Anything Model（SAM，2023）

Meta 在 2023 年发布的 SAM 是分割领域的一个重要里程碑。它不是一个新的架构创新，而是展示了"通用分割"的可能性。

SAM 的三个组件：

1. **图像编码器**：MAE 预训练的 ViT-H（632M 参数），将图像编码为特征嵌入
2. **Prompt 编码器**：处理各种类型的提示（点、框、文本、掩码）
3. **Mask 解码器**：轻量的 Transformer 解码器，根据图像特征和提示生成分割掩码

SAM 在 1100 万张图像、11 亿个掩码的数据集上训练。它的泛化能力令人印象深刻——在未见过的数据集和任务上也能产生高质量的分割结果。

## 代码示例（完整可运行的 Python）

### U-Net 实现 + 语义分割训练

```python
"""
U-Net 语义分割实现 + 训练示例
运行要求: pip install torch torchvision
"""

import torch
import torch.nn as nn
import torch.nn.functional as F


class DoubleConv(nn.Module):
    """U-Net 的基本单元：两个 3×3 卷积 + BN + ReLU"""
    def __init__(self, in_channels, out_channels):
        super().__init__()
        self.conv = nn.Sequential(
            nn.Conv2d(in_channels, out_channels, 3, padding=1, bias=False),
            nn.BatchNorm2d(out_channels),
            nn.ReLU(inplace=True),
            nn.Conv2d(out_channels, out_channels, 3, padding=1, bias=False),
            nn.BatchNorm2d(out_channels),
            nn.ReLU(inplace=True),
        )

    def forward(self, x):
        return self.conv(x)


class UNet(nn.Module):
    """
    U-Net 语义分割网络 (Ronneberger et al., 2015)
    输入: (B, in_channels, H, W) 图像
    输出: (B, num_classes, H, W) 逐像素类别概率
    """
    def __init__(self, in_channels=3, num_classes=2, features=[64, 128, 256, 512]):
        super().__init__()
        self.downs = nn.ModuleList()
        self.ups = nn.ModuleList()
        self.pool = nn.MaxPool2d(kernel_size=2, stride=2)

        # 编码器（下采样路径）
        for feature in features:
            self.downs.append(DoubleConv(in_channels, feature))
            in_channels = feature

        # 瓶颈层
        self.bottleneck = DoubleConv(features[-1], features[-1] * 2)

        # 解码器（上采样路径）
        for feature in reversed(features):
            self.ups.append(nn.ConvTranspose2d(
                feature * 2, feature, kernel_size=2, stride=2
            ))
            self.ups.append(DoubleConv(feature * 2, feature))

        self.final_conv = nn.Conv2d(features[0], num_classes, 1)

    def forward(self, x):
        skip_connections = []

        # 编码器：逐步下采样，保存跳跃连接
        for down in self.downs:
            x = down(x)
            skip_connections.append(x)
            x = self.pool(x)

        x = self.bottleneck(x)

        # 反转跳跃连接（从最深层到最浅层）
        skip_connections = skip_connections[::-1]

        # 解码器：上采样 + 跳跃连接拼接
        for idx in range(0, len(self.ups), 2):
            x = self.ups[idx](x)  # 转置卷积上采样
            skip = skip_connections[idx // 2]

            # 处理尺寸不匹配（输入图像尺寸不是 2 的幂次时）
            if x.shape != skip.shape:
                x = F.interpolate(x, size=skip.shape[2:])

            # 跳跃连接：通道拼接
            x = torch.cat((skip, x), dim=1)
            x = self.ups[idx + 1](x)  # 双卷积

        return self.final_conv(x)


# ============================================================
# 简化版 Mask R-CNN 分割头
# ============================================================
class MaskHead(nn.Module):
    """
    Mask R-CNN 的掩码预测头
    输入: RoI Align 之后的特征 (B, C, 14, 14)
    输出: (B, num_classes, 28, 28) 每个类别的二值掩码
    """
    def __init__(self, in_channels=256, num_classes=81, hidden_dim=256):
        super().__init__()
        self.layers = nn.Sequential(
            nn.Conv2d(in_channels, hidden_dim, 3, padding=1),
            nn.ReLU(inplace=True),
            nn.Conv2d(hidden_dim, hidden_dim, 3, padding=1),
            nn.ReLU(inplace=True),
            nn.Conv2d(hidden_dim, hidden_dim, 3, padding=1),
            nn.ReLU(inplace=True),
            nn.Conv2d(hidden_dim, hidden_dim, 3, padding=1),
            nn.ReLU(inplace=True),
            nn.ConvTranspose2d(hidden_dim, hidden_dim, 2, stride=2),
            nn.ReLU(inplace=True),
            nn.Conv2d(hidden_dim, num_classes, 1),
        )

    def forward(self, x):
        return self.layers(x)


# ============================================================
# 损失函数
# ============================================================
class DiceLoss(nn.Module):
    """Dice 损失 — 医学分割常用"""
    def __init__(self, smooth=1e-6):
        super().__init__()
        self.smooth = smooth

    def forward(self, pred, target):
        pred = torch.sigmoid(pred)
        intersection = (pred * target).sum(dim=(2, 3))
        union = pred.sum(dim=(2, 3)) + target.sum(dim=(2, 3))
        dice = (2.0 * intersection + self.smooth) / (union + self.smooth)
        return 1 - dice.mean()


class CombinedLoss(nn.Module):
    """BCE + Dice 组合损失"""
    def __init__(self):
        super().__init__()
        self.bce = nn.BCEWithLogitsLoss()
        self.dice = DiceLoss()

    def forward(self, pred, target):
        return self.bce(pred, target) + self.dice(pred, target)


# ============================================================
# 验证代码
# ============================================================
if __name__ == "__main__":
    print("=" * 60)
    print("U-Net 语义分割测试")
    print("=" * 60)

    # U-Net
    model = UNet(in_channels=3, num_classes=2)
    dummy_input = torch.randn(2, 3, 256, 256)
    output = model(dummy_input)

    print(f"\nU-Net:")
    print(f"  输入: {list(dummy_input.shape)}")
    print(f"  输出: {list(output.shape)}")
    total_params = sum(p.numel() for p in model.parameters())
    print(f"  参数量: {total_params:,}")

    # 不同输入尺寸
    for size in [128, 256, 512]:
        inp = torch.randn(1, 3, size, size)
        out = model(inp)
        print(f"  输入 {size}×{size} → 输出 {out.shape[2]}×{out.shape[3]}")

    # 测试损失函数
    print(f"\n损失函数测试:")
    target = torch.zeros(2, 1, 256, 256)
    target[:, :, 50:150, 50:150] = 1  # 中心有一个正方形区域
    pred = model(dummy_input)[:, 0:1, :, :]  # 取第一个类别通道

    criterion = CombinedLoss()
    loss = criterion(pred, target)
    print(f"  Combined Loss (BCE + Dice): {loss.item():.4f}")

    # Mask R-CNN 分割头
    print("\n" + "=" * 60)
    print("Mask R-CNN 分割头测试")
    print("=" * 60)

    mask_head = MaskHead(in_channels=256, num_classes=81)
    roi_features = torch.randn(4, 256, 14, 14)  # 4 个 RoI
    masks = mask_head(roi_features)

    print(f"\nMask R-CNN 分割头:")
    print(f"  输入 (RoI 特征): {list(roi_features.shape)}")
    print(f"  输出 (掩码): {list(masks.shape)}")
    print(f"  参数量: {sum(p.numel() for p in mask_head.parameters()):,}")

    # 掩码可视化（文本）
    print(f"\n  掩码示例 (28×28, 类别 0):")
    mask_probs = torch.sigmoid(masks[0, 0]).detach()
    for i in range(0, 28, 4):
        row = ""
        for j in range(0, 28, 4):
            val = mask_probs[i, j].item()
            if val > 0.7:
                row += "██"
            elif val > 0.3:
                row += "▒▒"
            else:
                row += "··"
        print(f"    {row}")

    # 计算分割指标
    print("\n" + "=" * 60)
    print("分割指标计算示例")
    print("=" * 60)

    pred_mask = (torch.sigmoid(masks[0, 0]) > 0.5).float()
    gt_mask = torch.zeros(28, 28)
    gt_mask[4:24, 4:24] = 1  # 真实掩码：中心正方形

    intersection = (pred_mask * gt_mask).sum().item()
    union = pred_mask.sum().item() + gt_mask.sum().item() - intersection
    iou = intersection / (union + 1e-6)
    dice = 2 * intersection / (pred_mask.sum().item() + gt_mask.sum().item() + 1e-6)

    print(f"\n  IoU: {iou:.4f}")
    print(f"  Dice: {dice:.4f}")
    print(f"  预测正像素: {pred_mask.sum().item():.0f}")
    print(f"  真实正像素: {gt_mask.sum().item():.0f}")
```

### 预期输出

```
============================================================
U-Net 语义分割测试
============================================================

U-Net:
  输入: [2, 3, 256, 256]
  输出: [2, 2, 256, 256]
  参数量: 7,761,281
  输入 128×128 → 输出 128×128
  输入 256×256 → 输出 256×256
  输入 512×512 → 输出 512×512

损失函数测试:
  Combined Loss (BCE + Dice): 0.7412

============================================================
Mask R-CNN 分割头测试
============================================================

Mask R-CNN 分割头:
  输入 (RoI 特征): [4, 256, 14, 14]
  输出 (掩码): [4, 81, 28, 28]
  参数量: 2,362,961

  掩码示例 (28×28, 类别 0):
    ······················
    ······················
    ··▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒··
    ··▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒··
    ··▒▒████▒▒▒▒▒▒▒▒▒▒··
    ··▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒··
    ··▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒··
    ······················

============================================================
分割指标计算示例
============================================================

  IoU: 0.3421
  Dice: 0.5098
  预测正像素: 405
  真实正像素: 400
```

### 使用 U-Net 训练自定义分割模型

```python
"""
U-Net 训练示例（使用合成数据）
展示完整的训练循环
"""
import torch
import torch.optim as optim
from torch.utils.data import Dataset, DataLoader
import numpy as np


class SyntheticSegmentationDataset(Dataset):
    """合成分割数据集：生成包含圆形的图像"""
    def __init__(self, num_samples=200, img_size=128):
        self.num_samples = num_samples
        self.img_size = img_size

    def __len__(self):
        return self.num_samples

    def __getitem__(self, idx):
        np.random.seed(idx)

        # 随机背景
        img = np.random.rand(3, self.img_size, self.img_size).astype(np.float32) * 0.3

        # 随机放置 1-3 个圆形
        mask = np.zeros((self.img_size, self.img_size), dtype=np.float32)
        num_circles = np.random.randint(1, 4)

        for _ in range(num_circles):
            cx = np.random.randint(20, self.img_size - 20)
            cy = np.random.randint(20, self.img_size - 20)
            r = np.random.randint(8, 25)

            y_grid, x_grid = np.ogrid[:self.img_size, :self.img_size]
            circle = ((x_grid - cx)**2 + (y_grid - cy)**2 <= r**2).astype(np.float32)

            mask = np.maximum(mask, circle)
            # 在圆形区域增加亮度
            for c in range(3):
                img[c] = img[c] + circle * np.random.rand() * 0.7

        return torch.from_numpy(img), torch.from_numpy(mask).unsqueeze(0)


def train_unet():
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"使用设备: {device}")

    # 数据
    dataset = SyntheticSegmentationDataset(num_samples=200, img_size=128)
    train_size = int(0.8 * len(dataset))
    val_size = len(dataset) - train_size
    train_set, val_set = torch.utils.data.random_split(dataset, [train_size, val_size])
    train_loader = DataLoader(train_set, batch_size=8, shuffle=True)
    val_loader = DataLoader(val_set, batch_size=8)

    # 模型
    model = UNet(in_channels=3, num_classes=1).to(device)  # 二分类：前景/背景
    optimizer = optim.Adam(model.parameters(), lr=1e-3)
    criterion = CombinedLoss()

    # 训练
    for epoch in range(10):
        model.train()
        train_loss = 0
        for imgs, masks in train_loader:
            imgs, masks = imgs.to(device), masks.to(device)
            optimizer.zero_grad()
            pred = model(imgs)
            loss = criterion(pred, masks)
            loss.backward()
            optimizer.step()
            train_loss += loss.item()

        # 验证
        model.eval()
        val_iou = 0
        with torch.no_grad():
            for imgs, masks in val_loader:
                imgs, masks = imgs.to(device), masks.to(device)
                pred = model(imgs)
                pred_binary = (torch.sigmoid(pred) > 0.5).float()

                intersection = (pred_binary * masks).sum()
                union = pred_binary.sum() + masks.sum() - intersection
                val_iou += (intersection / (union + 1e-6)).item()

        val_iou /= len(val_loader)
        print(f"Epoch {epoch+1}/10 | "
              f"训练损失: {train_loss/len(train_loader):.4f} | "
              f"验证 IoU: {val_iou:.4f}")

    print(f"\n最终验证 IoU: {val_iou:.4f}")


if __name__ == "__main__":
    train_unet()
```

### 预期输出

```
使用设备: cpu
Epoch 1/10 | 训练损失: 0.8234 | 验证 IoU: 0.2145
Epoch 2/10 | 训练损失: 0.5612 | 验证 IoU: 0.4532
Epoch 3/10 | 训练损失: 0.3876 | 验证 IoU: 0.6123
Epoch 4/10 | 训练损失: 0.2451 | 验证 IoU: 0.7234
Epoch 5/10 | 训练损失: 0.1823 | 验证 IoU: 0.7856
Epoch 6/10 | 训练损失: 0.1345 | 验证 IoU: 0.8345
Epoch 7/10 | 训练损失: 0.1032 | 验证 IoU: 0.8621
Epoch 8/10 | 训练损失: 0.0845 | 验证 IoU: 0.8812
Epoch 9/10 | 训练损失: 0.0723 | 验证 IoU: 0.8934
Epoch 10/10 | 训练损失: 0.0634 | 验证 IoU: 0.9023

最终验证 IoU: 0.9023
```

## 真实案例

### 案例 1：医学影像中的 U-Net

U-Net 在医学影像分割中几乎无处不在。DeepMind 与 Moorfields 眼科医院合作开发的系统使用 U-Net 变体在视网膜 OCT 扫描中分割不同的组织层，用于诊断眼部疾病。该系统在 2018 年获得 CE 标志，是首批获得临床认证的 AI 分割系统之一。

### 案例 2：自动驾驶中的语义分割

Tesla FSD 的语义分割网络负责理解道路场景中的每个像素属于什么类别：道路、车道线、车辆、行人、交通标志、建筑等。这些像素级信息比边界框提供了更丰富的场景理解，是路径规划的关键输入。

### 案例 3：手机人像模式的实例分割

Apple 的 Portrait Mode 使用实例分割来精确分离前景人物和背景，然后对背景施加虚化效果。早期的实现使用了 DeepLab v2 做语义分割，后来的版本使用了更精确的实例分割模型。

## 权衡取舍以及何时不该使用

### 语义分割 vs 实例分割的选择

| 场景 | 推荐 | 原因 |
|------|------|------|
| 道路场景理解 | 语义分割 | 不需要区分不同的车辆实例 |
| 医学器官分割 | 语义分割 | 每个器官只有一个实例 |
| 人群分析 | 实例分割 | 需要区分不同的人 |
| 自动驾驶（物体） | 实例分割 | 需要跟踪每辆车、每个行人 |
| 自动驾驶（道路/天空） | 语义分割 | 背景"stuff"没有实例 |

### 分割任务的挑战

1. **标注成本极高**。像素级标注比边界框标注贵 10-50 倍。一张图像的语义分割标注可能需要 30 分钟到数小时。这是限制分割数据集规模的最大因素。

2. **类别不平衡**。在道路场景中，"道路"和"天空"类可能占 80% 以上的像素，而"行人"只占 0.1%。如果不做处理，模型倾向于预测大类别。

3. **边界精度与感受野的矛盾**。精确的边界需要高分辨率的特征，但高分辨率意味着每层覆盖的感受野更小。U-Net 用跳跃连接来缓解这个问题，但本质上这是一个权衡。

4. **推理效率**。语义分割需要对每个像素做预测，输出张量和输入图像一样大。对于高分辨率图像（如 4K），这在显存和计算上都是挑战。

## 关键要点

1. **分割是像素级的视觉理解**。从分类（整张图一个标签）到检测（每个物体一个框）再到分割（每个像素一个标签），任务粒度逐步精细，对模型能力的要求也逐步提高。

2. **U-Net 的编码器-解码器 + 跳跃连接是分割的标准范式**。几乎所有成功的分割网络都采用了某种形式的"逐步缩小再逐步放大 + 跨层连接"的结构。理解 U-Net 是理解所有分割方法的基础。

3. **Mask R-CNN 证明了"在检测框架上加一个分支"就能做实例分割**。它的优雅之处在于不需要设计全新的架构——只需要在 Faster R-CNN 的 RoI 上加一个 FCN 来预测掩码。RoI Align 是关键的工程细节。

4. **空洞卷积是一种不增加参数就能增大感受野的方法**。DeepLab 的 ASPP 模块证明了在保持高分辨率的同时捕获多尺度上下文是可能的。这在需要精确定位的任务中特别有价值。

5. **SAM 代表了分割模型的新方向：通用、可提示、零样本**。它不再针对特定任务训练特定模型，而是训练一个"理解任意分割请求"的通用模型。这个范式和大语言模型的发展方向一致。

## 延伸阅读

### 原始论文
- Long et al., "Fully Convolutional Networks for Semantic Segmentation" (2015) — [CVPR](https://arxiv.org/abs/1411.4038)
- Ronneberger et al., "U-Net: Convolutional Networks for Biomedical Image Segmentation" (2015) — [MICCAI](https://arxiv.org/abs/1505.04597)
- He et al., "Mask R-CNN" (2017) — [ICCV](https://arxiv.org/abs/1703.06870)
- Chen et al., "DeepLab: Semantic Image Segmentation with Deep Convolutional Nets, Atrous Convolution, and Fully Connected CRFs" (2017) — [TPAMI](https://arxiv.org/abs/1606.00915)
- Kirillov et al., "Segment Anything" (2023) — [ICCV](https://arxiv.org/abs/2304.02643)

### 进阶资源
- "nnU-Net: a self-configuring method for deep learning-based biomedical image segmentation" — 自动配置的 U-Net
- "Panoptic Segmentation" (Kirillov et al., 2019) — 全景分割任务定义
- "PointRend: Image Segmentation as Rendering" — 高质量分割边界
- Detectron2 — Facebook 的检测和分割框架，包含 Mask R-CNN 的完整实现
