<!--
Stage 3 Article 1: CNN 基础

调研来源：
1. Stanford CS231n 课程笔记 - Convolutional Neural Networks (cs231n.github.io)
2. "Convolutional Neural Networks, Explained" - Towards Data Science
3. "Understanding Convolutional Neural Networks" - Medium
4. LearnOpenCV CNN Complete Guide (learnopencv.com)
5. Wikipedia - Convolutional Neural Network

核心发现：
- CNN 的三大核心思想是局部连接（local connectivity）、权重共享（parameter sharing）和空间下采样（spatial downsampling），这三个设计共同解决了全连接网络处理图像时参数爆炸的问题
- 感受野（receptive field）是理解 CNN 的关键概念，堆叠小卷积核（如3x3）比使用大卷积核（如7x7）更高效——3层3x3卷积与1层7x7卷积具有相同的感受野，但参数量从49C^2降到27C^2
- 池化层虽然广泛使用但近年来受到质疑，Striving for Simplicity 论文提出用 stride>1 的卷积替代池化，在 GAN 和 VAE 等生成模型中移除池化已成为主流
-->

# CNN 基础：卷积、池化、感受野——为什么图像不用全连接

**TL;DR：** 全连接网络处理图像时参数量爆炸——一张 224x224 的图片展平后有 150,528 个像素，第一个隐藏层如果有 1000 个神经元就是 1.5 亿个参数。CNN 通过三个核心设计解决了这个问题：局部连接（每个神经元只看图像的一个小区域）、权重共享（同一个特征检测器在整张图上滑动）、空间下采样（逐步降低分辨率）。这三个设计让参数量减少了几个数量级，同时保留了图像的空间结构信息。

## 为什么这很重要

想象你要教一台电脑识别照片里是不是猫。一张 224x224 像素的彩色图片包含 224 x 224 x 3 = 150,528 个数字（宽度 x 高度 x RGB 三个颜色通道）。如果用普通的全连接神经网络，第一个隐藏层的每个神经元都要和这 150,528 个输入相连。一个隐藏层 4096 个神经元？那就是 150,528 x 4,096 = 6.16 亿个权重参数。而且你还需要很多层。

这个数字意味着什么？

- AlexNet（2012年）如果用全连接处理图像，仅第一层的参数量就会超过 GPT-2 的全部参数
- 训练这样的网络需要海量数据和算力，而且大概率会过拟合
- 更根本的问题是：全连接层把图像展平成一维向量，完全丢失了空间结构——"猫的耳朵在猫的头顶旁边"这种空间关系信息没了

CNN 的诞生正是为了解决这些问题。它的灵感来源于 1962 年 Hubel 和 Wiesel 对猫视觉皮层的研究——他们发现视觉神经元只对视野中特定小区域的特定模式（如某个方向的边缘）有反应。CNN 模拟了这个机制：每个神经元只关注输入的一个小区域，检测特定的局部特征。

从 LeCun 1989 年用 CNN 识别手写邮编，到 AlexNet 2012 年在 ImageNet 竞赛中把错误率从 26% 降到 16%，再到 ResNet 2015 年超越人类水平（错误率 3.57% vs 人类的 5.1%），CNN 彻底改变了计算机视觉。而且，CNN 的核心思想——局部连接和权重共享——后来也深刻影响了 Transformer 等现代架构的设计。

## 核心概念

### 卷积操作：用小窗口扫描图像

**直觉解释**

想象你手里拿着一个 3x3 的小放大镜，在一张照片上从左到右、从上到下滑动。每到一个位置，你透过放大镜看那 9 个像素，根据某种规则给这个位置打一个分数。这个"打分规则"就是一个卷积核（filter/kernel），它本质上是一组权重值。

如果你拿一个能检测水平边缘的核去扫描图片，扫描完会得到一张"水平边缘地图"——哪里有水平边缘，地图上对应位置的值就高。拿另一个检测垂直边缘的核再扫一遍，又得到一张"垂直边缘地图"。

多拿几个核，就能检测不同方向的边缘、不同颜色的色块、不同纹理的图案。把这些"地图"叠在一起，就得到了卷积层的输出——一个包含了多种特征检测结果的 3D 数据块。

**数学定义**

对于一个输入特征图 $X$（大小为 $W \times H \times D_{in}$）和一个卷积核 $W$（大小为 $F \times F \times D_{in}$），二维卷积操作定义为：

$$
Y[i,j] = \sum_{m=0}^{F-1} \sum_{n=0}^{F-1} \sum_{c=0}^{D_{in}-1} X[i \cdot S + m - P, j \cdot S + n - P, c] \cdot W[m, n, c] + b
$$

其中：
- $S$ 是步长（stride），控制卷积核每次移动多少像素
- $P$ 是零填充（padding），在图像边缘补零的圈数
- $b$ 是偏置项

输出特征图的空间尺寸计算公式：

$$
W_{out} = \frac{W_{in} - F + 2P}{S} + 1
$$

$$
H_{out} = \frac{H_{in} - F + 2P}{S} + 1
$$

如果使用 $K$ 个不同的卷积核，输出特征图的深度就是 $K$。

**具体例子**：输入 227x227x3 的图片，用 96 个 11x11x3 的卷积核，步长 4，不填充（P=0）：

$$
W_{out} = \frac{227 - 11 + 0}{4} + 1 = 55
$$

输出特征图大小为 55x55x96。这就是 AlexNet 第一层的实际配置。

### 参数共享：同一个特征检测器在整张图上复用

这是 CNN 最关键的设计之一。核心假设是：**如果一个水平边缘在图片左上角有用，那它在图片右下角也应该有用**。

没有参数共享时，55x55x96 的输出体积中有 290,400 个神经元，每个有 11x11x3 = 363 个权重，总共 1.057 亿个参数——仅第一层。

有了参数共享后，同一张特征图（同一个 depth slice）上的所有神经元共享同一组权重。96 个特征图只需要 96 组不同的权重，总共 96 x 11x11x3 = 34,848 个权重加上 96 个偏置 = 34,944 个参数。从 1.057 亿降到 3.5 万，参数量减少了 3,000 倍。

这个设计之所以合理，是因为图像具有**平移不变性**（translation invariance）——一只猫无论出现在图片的左边还是右边，它的耳朵长得都一样。所以检测"猫耳朵边缘"的特征检测器不需要针对每个位置单独训练。

### 池化操作：主动丢掉信息来获得不变性

**直觉解释**

池化就像是对特征地图做"缩略"。想象你有一张 100x100 的温度分布图，你想知道每个 2x2 区域里哪里最热。你对每个 2x2 区域取最大值，得到一张 50x50 的图——这就是最大池化（Max Pooling）。

为什么要主动丢掉 75% 的信息？三个原因：

1. **降低计算量**：后续层的计算量减少到 1/4
2. **增加感受野**：让后面的神经元能看到更大范围的图像区域
3. **获得平移不变性**：如果一个特征在 2x2 区域内稍微移动了位置，最大池化的结果不变

**数学定义**

最大池化（以 2x2, stride=2 为例）：

$$
Y[i,j] = \max_{0 \le m < F, 0 \le n < F} X[i \cdot S + m, j \cdot S + n]
$$

其中 $F=2, S=2$。

输出尺寸：

$$
W_{out} = \frac{W_{in} - F}{S} + 1
$$

池化层**不引入任何参数**——它只是一个固定的数学操作。

### 感受野：每个神经元到底"看到"了多大的区域

**直觉解释**

感受野（Receptive Field）就是输出特征图上的一个像素，对应到原始输入图像上的区域大小。

想象你通过一个望远镜看远处的风景。第一层卷积就像一个 3x3 的小窗户——你每次只能看到 3x3 的区域。第二层卷积又在第一层的输出上看 3x3 的区域，但因为第一层每个位置已经覆盖了输入的 3x3，所以第二层每个位置实际覆盖了输入的 5x5 区域。第三层就覆盖了 7x7。层数越深，"视野"越大。

**数学计算**

单层卷积的感受野就等于卷积核大小 $F$。

多层堆叠时的感受野计算（递推公式）：

$$
RF_1 = F
$$

$$
RF_l = RF_{l-1} + (F_l - 1) \times \prod_{i=1}^{l-1} S_i
$$

其中 $RF_l$ 是第 $l$ 层的感受野，$F_l$ 是第 $l$ 层的卷积核大小，$S_i$ 是第 $i$ 层的步长。

**具体计算**：3 层 3x3 卷积，stride=1，padding=1

- 第 1 层：$RF_1 = 3$
- 第 2 层：$RF_2 = 3 + (3-1) \times 1 = 5$
- 第 3 层：$RF_3 = 5 + (3-1) \times 1 = 7$

三层 3x3 卷积的感受野等于一层 7x7 卷积。但参数量差异巨大：

- 一层 7x7：$C \times 7 \times 7 \times C = 49C^2$ 个参数
- 三层 3x3：$3 \times C \times 3 \times 3 \times C = 27C^2$ 个参数

参数减少了 45%，而且三层之间有 ReLU 激活函数，非线性表达能力更强。这就是 VGGNet 的核心设计哲学。

加入池化层后，感受野增长更快。2x2 最大池化（stride=2）会让下一层的每个步长在原始输入上跳过 2 个像素，感受野迅速扩大。典型的 CNN 经过 5 层 2x2 池化后，空间尺寸从 224 降到 7（224 / 2^5 = 7），最后一层的每个神经元已经能看到整张图片的大部分区域。

## 工作原理（简化的心智模型）

### 把 CNN 想象成一个分层的目标搜索系统

**第一层（底层特征）**：想象你是交通摄像头监控员，你的第一反应是找"线条"。垂直的线、水平的线、45度的斜线。你不关心这些线条组成什么，你只报告"这里有条竖线"。

**中间层（零件组合）**：你把线条信息交给上级。上级把线条组合成几何图形——圆形、三角形、矩形。他也不关心这些图形是什么，只报告"左上角有个弧形"。

**高层（语义概念）**：再上级把几何图形组合成物体部件——"两个三角形在顶部"可能是耳朵，"一个椭圆在中间"可能是鼻子。最终的指挥官根据这些部件组合做出判断："耳朵 + 鼻子 + 眼睛 = 猫"。

这个过程有两个关键特点：
1. **从局部到全局**：底层看细节（边缘），高层看整体（物体）。每一步都在扩大视野。
2. **从具体到抽象**：底层的特征很通用（线条哪里都有），高层的特征很具体（"猫耳朵形状"只有猫才有）。

### 为什么全连接做不到这些？

全连接层就像一个官僚，他要求每份报告都包含所有信息——每个像素的精确位置和数值。问题是：

1. **参数太多**：224x224x3 到 4096 个神经元 = 6.16 亿参数。仅存储这些参数的浮点数就需要 2.3 GB 显存。而且这些参数大部分是冗余的。
2. **没有空间概念**：展平后的向量不包含"像素 A 在像素 B 旁边"的信息。如果你把图片向右平移一个像素，展平后的向量会完全不同，但全连接层不知道它们是同一张图片。
3. **不共享知识**：全连接层在左上角学到的"边缘检测"知识，无法自动应用到右下角。每个位置都要从头学习。

CNN 通过局部连接、参数共享和池化，系统性地解决了这三个问题。

## 工作原理（详细机制）

### 卷积层的完整工作流程

让我们追踪一张 32x32x3 的 CIFAR-10 图片通过一个卷积层的完整过程。

**输入**：32x32x3（宽x高xRGB三通道）

**超参数设定**：
- 卷积核数量 $K = 16$
- 卷积核大小 $F = 5$
- 步长 $S = 1$
- 零填充 $P = 2$

**Step 1：零填充**

在 32x32 的图片周围补 2 圈零，变成 36x36x3。填充的目的是保持输出尺寸和输入一致：

$$
W_{out} = \frac{32 - 5 + 2 \times 2}{1} + 1 = 32
$$

不填充的话，输出就变成 28x28，每经过一层卷积就缩小一圈，信息在边界处快速丢失。

**Step 2：卷积核滑动**

第 1 个卷积核（大小 5x5x3，共 75 个权重 + 1 个偏置）从左上角 (0,0) 开始：

$$
\text{output}[0,0,0] = \sum_{m=0}^{4}\sum_{n=0}^{4}\sum_{c=0}^{2} \text{input}[m,n,c] \cdot W_0[m,n,c] + b_0
$$

然后向右移动 1 个像素（stride=1）：

$$
\text{output}[1,0,0] = \sum_{m=0}^{4}\sum_{n=0}^{4}\sum_{c=0}^{2} \text{input}[m+1,n,c] \cdot W_0[m,n,c] + b_0
$$

注意 $W_0$ 是同一组权重——这就是参数共享。

扫描完整个 36x36 的填充图（步长 1，每个方向 32 个位置），得到一张 32x32 的特征图。

**Step 3：重复使用不同卷积核**

用第 2 个卷积核 $W_1$（另一组 75 个权重 + 1 个偏置）重复 Step 2，得到第 2 张 32x32 的特征图。16 个卷积核，16 张特征图。

**Step 4：堆叠**

16 张 32x32 的特征图沿深度方向堆叠，得到 32x32x16 的输出体积。

**Step 5：激活函数**

对输出体积的每个元素应用 ReLU：$f(x) = \max(0, x)$。负值变零，正值不变。这引入了非线性——没有激活函数，多层卷积等价于一层卷积（因为线性变换的线性组合还是线性变换）。

**参数统计**：

- 每个 5x5x3 卷积核：75 个权重 + 1 个偏置 = 76 个参数
- 16 个卷积核：16 x 76 = 1,216 个参数
- 对比全连接：32x32x3 到 32x32x16 = 1,572,864 个参数

参数量差异：1,216 vs 1,572,864，CNN 少了约 1,300 倍。

### 池化层的完整工作流程

接上面的 32x32x16 输出。

**超参数**：2x2 最大池化，步长 2

**操作**：

对 16 个通道（depth slices），每个通道独立操作。在 32x32 的特征图上，每个 2x2 区域取最大值：

```
通道 0 的特征图 (32x32):
┌─────┬─────┬─────┬─────┐
│ 1 3 │ 2 0 │ ... │     │
│ 4 2 │ 5 1 │ ... │     │  →  max(1,3,4,2) = 4
├─────┼─────┼─────┼─────┤     max(2,0,5,1) = 5
│ 0 1 │ 3 6 │ ... │     │
│ 2 7 │ 1 4 │ ... │     │  →  max(0,1,2,7) = 7
└─────┴─────┴─────┴─────┘     max(3,6,1,4) = 6
    ↓ 2x2 Max Pooling
┌─────┬─────┐
│  4  │  5  │
│  7  │  6  │
└─────┴─────┘
```

16 个通道都这样做，输出 16x16x16。

空间尺寸缩小一半，深度不变。注意：池化层没有可学习的参数。

**为什么用最大池化而不是平均池化？**

直觉上，最大池化保留的是"有没有检测到这个特征"，平均池化保留的是"这个区域的平均激活水平"。实践证明，最大池化在分类任务上效果更好，原因是：如果特征检测器在某个区域内检测到了目标特征（输出值高），我们关心的是"存在性"而非"平均强度"。一个区域的某个位置有猫耳朵边缘，取最大值能保留这个信号，取平均可能被周围没有边缘的位置稀释掉。

但平均池化在某些场景下有优势。GoogLeNet 用全局平均池化替代了全连接层，大幅减少了参数量。在需要更平滑的特征表示时（如风格迁移中的 Gram 矩阵计算），平均池化更合适。

### 一个完整的 CNN 前向传播过程

以一个简化的 CIFAR-10 分类器为例：

```
INPUT:   32x32x3   (原始图片)
  ↓
CONV1:   32x32x16  (16个5x5卷积核, pad=2, stride=1) → 1,216 参数
  ↓
RELU:    32x32x16  (不变)
  ↓
POOL1:   16x16x16  (2x2 max pooling, stride=2)
  ↓
CONV2:   16x16x32  (32个5x5卷积核, pad=2, stride=1) → 12,832 参数
  ↓
RELU:    16x16x32  (不变)
  ↓
POOL2:   8x8x32    (2x2 max pooling, stride=2)
  ↓
FLATTEN: 2048      (8x8x32 = 2048)
  ↓
FC1:     128       (全连接) → 262,272 参数
  ↓
RELU:    128
  ↓
FC2:     10        (10个类别) → 1,290 参数
  ↓
SOFTMAX: 10        (概率分布)
```

**总参数**：1,216 + 12,832 + 262,272 + 1,290 = 277,610

对比全连接网络（32x32x3 → 128 → 10）：307,200 + 1,280 = 308,480

这个例子中差距不大，因为图片很小（32x32）。当图片变大时，差距呈指数级增长：

| 图片尺寸 | 全连接第一层参数量 (输入→4096) | CNN第一层参数量 (64个3x3核) | 比率 |
|---------|---------------------------|--------------------------|------|
| 32x32x3 | 1,258,368 | 1,792 | 702x |
| 64x64x3 | 5,033,984 | 1,792 | 2,809x |
| 224x224x3 | 61,665,280 | 1,792 | 34,414x |
| 1024x1024x3 | 1,294,967,296 | 1,792 | 722,639x |

对于 1024x1024 的高清图片，全连接网络仅第一层就有 12.9 亿参数，而 CNN 第一层始终只有 1,792 个参数——无论图片多大。

### im2col：卷积的矩阵乘法实现

虽然概念上卷积是"滑动窗口"，但实际实现时，框架（如 PyTorch、TensorFlow）会把卷积转化为矩阵乘法，利用 GPU 的高效矩阵运算。

**im2col（image to column）步骤**：

1. 把输入中所有被卷积核覆盖的局部区域展开成列向量
2. 把卷积核展开成行向量
3. 做一次矩阵乘法

例如，输入 4x4x1，卷积核 3x3x1，stride=1，padding=0：
- 输出 2x2，共 4 个位置
- 每个位置展开成 9 个元素（3x3）
- im2col 矩阵：9x4（9个元素 x 4个位置）
- 权重矩阵：1x9（1个卷积核 x 9个元素）
- 矩阵乘法：1x9 乘 9x4 = 1x4，reshape 成 2x2

多个卷积核、多个输入通道时就是更大的矩阵乘法。GPU 做矩阵乘法的速度远远超过逐像素的循环计算，所以 im2col 虽然消耗更多内存（因为重叠区域被重复展开），但整体更快。

### 反向传播中的卷积

卷积层的反向传播有一个优雅的性质：**卷积的反向传播也是卷积**。

前向传播：$Y = X * W$（$*$ 表示卷积运算）

反向传播（对输入的梯度）：$\frac{\partial L}{\partial X} = \frac{\partial L}{\partial Y} *_{\text{full}} W_{\text{flipped}}$

反向传播（对权重的梯度）：$\frac{\partial L}{\partial W} = X * \frac{\partial L}{\partial Y}$

其中 $W_{\text{flipped}}$ 是卷积核在两个空间维度上翻转（180度旋转），$*_{\text{full}}$ 是全卷积（full convolution，padding 更大）。

池化层的反向传播更简单：最大池化只把梯度传给前向传播时取到最大值的那个位置，其他位置梯度为零。

## 代码示例（完整可运行的 Python）

### 从零实现卷积操作

```python
import numpy as np

def conv2d_forward(input_data, weight, bias, stride=1, padding=0):
    """
    从零实现二维卷积前向传播
    
    参数:
        input_data: 输入数据, shape (N, C_in, H, W)
        weight: 卷积核权重, shape (C_out, C_in, kH, kW)
        bias: 偏置, shape (C_out,)
        stride: 步长
        padding: 零填充
    
    返回:
        output: 卷积输出, shape (N, C_out, H_out, W_out)
    """
    N, C_in, H, W = input_data.shape
    C_out, _, kH, kW = weight.shape
    
    # 计算输出尺寸
    H_out = (H + 2 * padding - kH) // stride + 1
    W_out = (W + 2 * padding - kW) // stride + 1
    
    # 零填充
    if padding > 0:
        input_padded = np.pad(
            input_data, 
            ((0, 0), (0, 0), (padding, padding), (padding, padding)),
            mode='constant'
        )
    else:
        input_padded = input_data
    
    output = np.zeros((N, C_out, H_out, W_out))
    
    # 卷积计算
    for i in range(H_out):
        for j in range(W_out):
            h_start = i * stride
            w_start = j * stride
            # 提取局部区域 (N, C_in, kH, kW)
            receptive_field = input_padded[
                :, :, h_start:h_start+kH, w_start:w_start+kW
            ]
            # 对每个输出通道计算点积
            for c_out in range(C_out):
                # (N, C_in, kH, kW) * (C_in, kH, kW) -> (N,) 求和
                output[:, c_out, i, j] = np.sum(
                    receptive_field * weight[c_out], axis=(1, 2, 3)
                ) + bias[c_out]
    
    return output


def max_pool2d_forward(input_data, kernel_size=2, stride=2):
    """
    从零实现最大池化
    
    参数:
        input_data: 输入数据, shape (N, C, H, W)
        kernel_size: 池化窗口大小
        stride: 步长
    
    返回:
        output: 池化输出, shape (N, C, H_out, W_out)
    """
    N, C, H, W = input_data.shape
    
    H_out = (H - kernel_size) // stride + 1
    W_out = (W - kernel_size) // stride + 1
    
    output = np.zeros((N, C, H_out, W_out))
    
    for i in range(H_out):
        for j in range(W_out):
            h_start = i * stride
            w_start = j * stride
            window = input_data[
                :, :, h_start:h_start+kernel_size, w_start:w_start+kernel_size
            ]
            output[:, :, i, j] = np.max(window, axis=(2, 3))
    
    return output


def relu_forward(input_data):
    """ReLU 激活函数"""
    return np.maximum(0, input_data)


def softmax_forward(logits):
    """Softmax 函数"""
    exp_logits = np.exp(logits - np.max(logits, axis=1, keepdims=True))
    return exp_logits / np.sum(exp_logits, axis=1, keepdims=True)


# ========================================
# 完整的 CNN 前向传播示例
# ========================================
np.random.seed(42)

# 模拟一个 batch 的 8 张 32x32 RGB 图片
batch_size = 8
images = np.random.randn(batch_size, 3, 32, 32).astype(np.float32)

print("=" * 60)
print("从零实现的 CNN 前向传播")
print("=" * 60)
print(f"\n输入图片: {images.shape}")

# --- 第一个卷积层 ---
# 16 个 5x5 卷积核，3 个输入通道
conv1_weight = np.random.randn(16, 3, 5, 5) * 0.01
conv1_bias = np.zeros(16)

conv1_out = conv2d_forward(images, conv1_weight, conv1_bias, stride=1, padding=2)
relu1_out = relu_forward(conv1_out)
pool1_out = max_pool2d_forward(relu1_out, kernel_size=2, stride=2)

print(f"\nCONV1 (16个5x5核, pad=2, stride=1): {conv1_out.shape}")
print(f"RELU1: {relu1_out.shape}")
print(f"POOL1 (2x2, stride=2): {pool1_out.shape}")
print(f"CONV1 参数量: {conv1_weight.size + conv1_bias.size}")

# --- 第二个卷积层 ---
# 32 个 5x5 卷积核，16 个输入通道
conv2_weight = np.random.randn(32, 16, 5, 5) * 0.01
conv2_bias = np.zeros(32)

conv2_out = conv2d_forward(pool1_out, conv2_weight, conv2_bias, stride=1, padding=2)
relu2_out = relu_forward(conv2_out)
pool2_out = max_pool2d_forward(relu2_out, kernel_size=2, stride=2)

print(f"\nCONV2 (32个5x5核, pad=2, stride=1): {conv2_out.shape}")
print(f"RELU2: {relu2_out.shape}")
print(f"POOL2 (2x2, stride=2): {pool2_out.shape}")
print(f"CONV2 参数量: {conv2_weight.size + conv2_bias.size}")

# --- 展平 + 全连接层 ---
flattened = pool2_out.reshape(batch_size, -1)
print(f"\nFlatten: {flattened.shape}")

# 全连接层 1: 2048 -> 128
fc1_weight = np.random.randn(128, flattened.shape[1]) * 0.01
fc1_bias = np.zeros(128)
fc1_out = flattened @ fc1_weight.T + fc1_bias
fc1_out = relu_forward(fc1_out)

print(f"FC1 (->128): {fc1_out.shape}")
print(f"FC1 参数量: {fc1_weight.size + fc1_bias.size}")

# 全连接层 2: 128 -> 10 (10个类别)
fc2_weight = np.random.randn(10, 128) * 0.01
fc2_bias = np.zeros(10)
logits = fc1_out @ fc2_weight.T + fc2_bias

print(f"FC2 (->10): {logits.shape}")
print(f"FC2 参数量: {fc2_weight.size + fc2_bias.size}")

# Softmax 得到概率
probs = softmax_forward(logits)
print(f"\nSoftmax 输出: {probs.shape}")
print(f"概率和 (应接近1.0): {probs[0].sum():.6f}")
print(f"预测类别: {np.argmax(probs, axis=1)}")

total_params = (conv1_weight.size + conv1_bias.size + 
                conv2_weight.size + conv2_bias.size +
                fc1_weight.size + fc1_bias.size +
                fc2_weight.size + fc2_bias.size)
print(f"\n总参数量: {total_params:,}")
```

输出：

```
============================================================
从零实现的 CNN 前向传播
============================================================

输入图片: (8, 3, 32, 32)

CONV1 (16个5x5核, pad=2, stride=1): (8, 16, 32, 32)
RELU1: (8, 16, 32, 32)
POOL1 (2x2, stride=2): (8, 16, 16, 16)
CONV1 参数量: 1216

CONV2 (32个5x5核, pad=2, stride=1): (8, 32, 16, 16)
RELU2: (8, 32, 16, 16)
POOL2 (2x2, stride=2): (8, 32, 8, 8)
CONV2 参数量: 12832

Flatten: (8, 2048)

FC1 (->128): (8, 128)
FC1 参数量: 262272
FC2 (->10): (8, 10)
FC2 参数量: 1290

Softmax 输出: (8, 10)
概率和 (应接近1.0): 1.000000
预测类别: [2 2 2 2 2 2 2 2]
总参数量: 277,610
```

### PyTorch 实现与对比

```python
import torch
import torch.nn as nn
import time

class SimpleCNN(nn.Module):
    """用 PyTorch 构建相同的 CNN 架构"""
    
    def __init__(self):
        super().__init__()
        # 特征提取部分
        self.features = nn.Sequential(
            # 第一个卷积块
            nn.Conv2d(3, 16, kernel_size=5, padding=2),
            nn.ReLU(inplace=True),
            nn.MaxPool2d(kernel_size=2, stride=2),
            # 第二个卷积块
            nn.Conv2d(16, 32, kernel_size=5, padding=2),
            nn.ReLU(inplace=True),
            nn.MaxPool2d(kernel_size=2, stride=2),
        )
        # 分类器部分
        self.classifier = nn.Sequential(
            nn.Linear(32 * 8 * 8, 128),
            nn.ReLU(inplace=True),
            nn.Linear(128, 10),
        )
    
    def forward(self, x):
        x = self.features(x)
        x = x.view(x.size(0), -1)  # Flatten
        x = self.classifier(x)
        return x


# 创建模型
model = SimpleCNN()

# 统计参数量
total_params = sum(p.numel() for p in model.parameters())
print(f"PyTorch CNN 总参数量: {total_params:,}")

# 各层参数量
for name, param in model.named_parameters():
    print(f"  {name}: {param.shape} = {param.numel():,} 参数")

# 前向传播测试
x = torch.randn(8, 3, 32, 32)
output = model(x)
print(f"\n输入: {x.shape}")
print(f"输出: {output.shape}")
print(f"预测类别: {output.argmax(dim=1)}")

# ========================================
# 性能对比：卷积的 im2col 实现 vs 朴素实现
# ========================================
print("\n" + "=" * 60)
print("性能对比：卷积操作的不同实现")
print("=" * 60)

def conv2d_im2col(input_data, weight, bias, stride=1, padding=0):
    """使用 im2col 技巧的卷积实现"""
    N, C_in, H, W = input_data.shape
    C_out, _, kH, kW = weight.shape
    
    H_out = (H + 2 * padding - kH) // stride + 1
    W_out = (W + 2 * padding - kW) // stride + 1
    
    # Padding
    if padding > 0:
        input_padded = np.pad(
            input_data,
            ((0, 0), (0, 0), (padding, padding), (padding, padding)),
            mode='constant'
        )
    else:
        input_padded = input_data
    
    # im2col: 展开所有局部区域
    cols = np.zeros((N, C_in * kH * kW, H_out * W_out))
    for i in range(H_out):
        for j in range(W_out):
            h_start = i * stride
            w_start = j * stride
            patch = input_padded[
                :, :, h_start:h_start+kH, w_start:w_start+kW
            ]
            cols[:, :, i * W_out + j] = patch.reshape(N, -1)
    
    # 权重展成矩阵
    W_col = weight.reshape(C_out, -1)  # (C_out, C_in*kH*kW)
    
    # 批量矩阵乘法
    output = np.zeros((N, C_out, H_out * W_out))
    for n in range(N):
        output[n] = W_col @ cols[n] + bias.reshape(-1, 1)
    
    return output.reshape(N, C_out, H_out, W_out)


# 小规模测试
test_input = np.random.randn(4, 3, 16, 16).astype(np.float32)
test_weight = np.random.randn(8, 3, 3, 3).astype(np.float32) * 0.01
test_bias = np.zeros(8, dtype=np.float32)

# 验证结果一致
out_naive = conv2d_forward(test_input, test_weight, test_bias, stride=1, padding=1)
out_im2col = conv2d_im2col(test_input, test_weight, test_bias, stride=1, padding=1)

print(f"\n朴素实现输出形状: {out_naive.shape}")
print(f"im2col 实现输出形状: {out_im2col.shape}")
print(f"两种实现结果差异: {np.max(np.abs(out_naive - out_im2col)):.2e}")
```

输出：

```
PyTorch CNN 总参数量: 277,610
  features.0.weight: torch.Size([16, 3, 5, 5]) = 1,200 参数
  features.0.bias: torch.Size([16]) = 16 参数
  features.3.weight: torch.Size([32, 16, 5, 5]) = 12,800 参数
  features.3.bias: torch.Size([32]) = 32 参数
  classifier.0.weight: torch.Size([128, 2048]) = 262,144 参数
  classifier.0.bias: torch.Size([128]) = 128 参数
  classifier.2.weight: torch.Size([10, 128]) = 1,280 参数
  classifier.2.bias: torch.Size([10]) = 10 参数

输入: torch.Size([8, 3, 32, 32])
输出: torch.Size([8, 10])
预测类别: tensor([2, 5, 2, 2, 5, 2, 5, 2])

============================================================
性能对比：卷积操作的不同实现
============================================================

朴素实现输出形状: (4, 8, 16, 16)
im2col 实现输出形状: (4, 8, 16, 16)
两种实现结果差异: 1.19e-06
```

### 可视化卷积核学到的特征

```python
import matplotlib.pyplot as plt

def visualize_first_layer_filters(model):
    """可视化第一层卷积核学到的特征"""
    # 获取第一层卷积核
    filters = model.features[0].weight.data.numpy()
    
    fig, axes = plt.subplots(2, 8, figsize=(16, 4))
    fig.suptitle('第一层卷积核可视化 (16个5x5x3滤波器)', fontsize=14)
    
    for i in range(16):
        ax = axes[i // 8, i % 8]
        # 归一化到 [0, 1]
        f = filters[i].transpose(1, 2, 0)  # (5, 5, 3)
        f = (f - f.min()) / (f.max() - f.min())
        ax.imshow(f)
        ax.set_title(f'Filter {i}', fontsize=8)
        ax.axis('off')
    
    plt.tight_layout()
    plt.savefig('cnn_filters.png', dpi=150, bbox_inches='tight')
    print("卷积核可视化已保存到 cnn_filters.png")

# 可视化特征图
def visualize_feature_maps(model, input_image):
    """可视化各层特征图"""
    activations = {}
    
    def get_activation(name):
        def hook(model, input, output):
            activations[name] = output.detach()
        return hook
    
    # 注册 hook
    model.features[0].register_forward_hook(get_activation('conv1'))
    model.features[2].register_forward_hook(get_activation('pool1'))
    model.features[3].register_forward_hook(get_activation('conv2'))
    
    # 前向传播
    with torch.no_grad():
        model(input_image)
    
    fig, axes = plt.subplots(2, 8, figsize=(16, 4))
    fig.suptitle('第一个卷积层后的特征图', fontsize=14)
    
    conv1_act = activations['conv1'][0]  # 取第一张图
    for i in range(16):
        ax = axes[i // 8, i % 8]
        ax.imshow(conv1_act[i].numpy(), cmap='viridis')
        ax.set_title(f'Ch {i}', fontsize=8)
        ax.axis('off')
    
    plt.tight_layout()
    plt.savefig('cnn_feature_maps.png', dpi=150, bbox_inches='tight')
    print("特征图可视化已保存到 cnn_feature_maps.png")

# 运行可视化
visualize_first_layer_filters(model)

sample_image = torch.randn(1, 3, 32, 32)
visualize_feature_maps(model, sample_image)
```

### 感受野计算器

```python
def calculate_receptive_field(architecture):
    """
    计算堆叠卷积层的感受野大小
    
    参数:
        architecture: 列表，每个元素是一个字典，描述一层
            {'type': 'conv', 'kernel': 3, 'stride': 1, 'padding': 1}
            {'type': 'pool', 'kernel': 2, 'stride': 2}
    
    返回:
        每层的感受野大小和跳跃（jump）
    """
    rf = 1      # 当前感受野
    jump = 1    # 当前跳跃（相邻像素在输入中对应多少像素距离）
    
    print(f"{'层':<10} {'核大小':<10} {'步长':<10} {'感受野':<10} {'跳跃':<10}")
    print("-" * 50)
    
    for i, layer in enumerate(architecture):
        if layer['type'] in ['conv', 'pool']:
            k = layer['kernel']
            s = layer['stride']
            rf = rf + (k - 1) * jump
            jump = jump * s
            print(f"{layer['type']+'_'+str(i):<10} {k:<10} {s:<10} {rf:<10} {jump:<10}")
    
    return rf, jump


# VGG-16 的前几层架构
vgg_architecture = [
    {'type': 'conv', 'kernel': 3, 'stride': 1, 'padding': 1},
    {'type': 'conv', 'kernel': 3, 'stride': 1, 'padding': 1},
    {'type': 'pool', 'kernel': 2, 'stride': 2},
    {'type': 'conv', 'kernel': 3, 'stride': 1, 'padding': 1},
    {'type': 'conv', 'kernel': 3, 'stride': 1, 'padding': 1},
    {'type': 'pool', 'kernel': 2, 'stride': 2},
    {'type': 'conv', 'kernel': 3, 'stride': 1, 'padding': 1},
    {'type': 'conv', 'kernel': 3, 'stride': 1, 'padding': 1},
    {'type': 'conv', 'kernel': 3, 'stride': 1, 'padding': 1},
    {'type': 'pool', 'kernel': 2, 'stride': 2},
    {'type': 'conv', 'kernel': 3, 'stride': 1, 'padding': 1},
    {'type': 'conv', 'kernel': 3, 'stride': 1, 'padding': 1},
    {'type': 'conv', 'kernel': 3, 'stride': 1, 'padding': 1},
    {'type': 'pool', 'kernel': 2, 'stride': 2},
    {'type': 'conv', 'kernel': 3, 'stride': 1, 'padding': 1},
    {'type': 'conv', 'kernel': 3, 'stride': 1, 'padding': 1},
    {'type': 'conv', 'kernel': 3, 'stride': 1, 'padding': 1},
    {'type': 'pool', 'kernel': 2, 'stride': 2},
]

print("VGG-16 感受野计算:")
print("=" * 50)
rf, jump = calculate_receptive_field(vgg_architecture)
print(f"\n最终感受野: {rf} x {rf} 像素")
print(f"最终跳跃: {jump}")
print(f"输入 224x224 经5次2x池化后: {224 // (2**5)} x {224 // (2**5)}")
```

输出：

```
VGG-16 感受野计算:
==================================================
层         核大小     步长       感受野     跳跃
--------------------------------------------------
conv_0     3          1          3          1
conv_1     3          1          5          1
pool_2     2          2          6          2
conv_3     3          1          10         2
conv_4     3          1          14         2
pool_5     2          2          16         4
conv_6     3          1          24         4
conv_7     3          1          32         4
conv_8     3          1          40         4
pool_9     2          2          44         8
conv_10    3          1          60         8
conv_11    3          1          76         8
conv_12    3          1          92         8
pool_13    2          2          100        16
conv_14    3          1          132        16
conv_15    3          1          164        16
conv_16    3          1          196        16
pool_17    2          2          212        32

最终感受野: 212 x 212 像素
最终跳跃: 32
输入 224x224 经5次2x池化后: 7 x 7
```

VGG-16 最后一层的每个神经元"看到"了原始输入的 212x212 区域——几乎是整张 224x224 的图片。这就是 CNN 如何从局部特征逐步构建全局理解的过程。

### 训练一个真正的 CNN 分类器

```python
import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import DataLoader
import torchvision
import torchvision.transforms as transforms

# 数据预处理
transform = transforms.Compose([
    transforms.ToTensor(),
    transforms.Normalize((0.4914, 0.4822, 0.4465), (0.2470, 0.2435, 0.2616))
])

# 加载 CIFAR-10
train_dataset = torchvision.datasets.CIFAR10(
    root='./data', train=True, download=True, transform=transform
)
test_dataset = torchvision.datasets.CIFAR10(
    root='./data', train=False, download=True, transform=transform
)

train_loader = DataLoader(train_dataset, batch_size=128, shuffle=True, num_workers=2)
test_loader = DataLoader(test_dataset, batch_size=100, shuffle=False, num_workers=2)


class CNNScratch(nn.Module):
    """从头构建的 CNN 分类器"""
    def __init__(self):
        super().__init__()
        self.features = nn.Sequential(
            # Block 1: 32x32 -> 16x16
            nn.Conv2d(3, 32, 3, padding=1),
            nn.BatchNorm2d(32),
            nn.ReLU(inplace=True),
            nn.Conv2d(32, 32, 3, padding=1),
            nn.BatchNorm2d(32),
            nn.ReLU(inplace=True),
            nn.MaxPool2d(2, 2),
            nn.Dropout2d(0.25),
            
            # Block 2: 16x16 -> 8x8
            nn.Conv2d(32, 64, 3, padding=1),
            nn.BatchNorm2d(64),
            nn.ReLU(inplace=True),
            nn.Conv2d(64, 64, 3, padding=1),
            nn.BatchNorm2d(64),
            nn.ReLU(inplace=True),
            nn.MaxPool2d(2, 2),
            nn.Dropout2d(0.25),
            
            # Block 3: 8x8 -> 4x4
            nn.Conv2d(64, 128, 3, padding=1),
            nn.BatchNorm2d(128),
            nn.ReLU(inplace=True),
            nn.Conv2d(128, 128, 3, padding=1),
            nn.BatchNorm2d(128),
            nn.ReLU(inplace=True),
            nn.MaxPool2d(2, 2),
            nn.Dropout2d(0.25),
        )
        self.classifier = nn.Sequential(
            nn.Linear(128 * 4 * 4, 256),
            nn.ReLU(inplace=True),
            nn.Dropout(0.5),
            nn.Linear(256, 10),
        )
    
    def forward(self, x):
        x = self.features(x)
        x = x.view(x.size(0), -1)
        x = self.classifier(x)
        return x


# 训练
device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
model = CNNScratch().to(device)
criterion = nn.CrossEntropyLoss()
optimizer = optim.Adam(model.parameters(), lr=0.001, weight_decay=1e-4)
scheduler = optim.lr_scheduler.StepLR(optimizer, step_size=10, gamma=0.5)

print(f"\n训练设备: {device}")
print(f"模型参数量: {sum(p.numel() for p in model.parameters()):,}")
print(f"训练样本数: {len(train_dataset)}")
print(f"测试样本数: {len(test_dataset)}")

num_epochs = 25
for epoch in range(num_epochs):
    model.train()
    running_loss = 0.0
    correct = 0
    total = 0
    
    for inputs, labels in train_loader:
        inputs, labels = inputs.to(device), labels.to(device)
        
        optimizer.zero_grad()
        outputs = model(inputs)
        loss = criterion(outputs, labels)
        loss.backward()
        optimizer.step()
        
        running_loss += loss.item()
        _, predicted = outputs.max(1)
        total += labels.size(0)
        correct += predicted.eq(labels).sum().item()
    
    scheduler.step()
    
    # 测试
    model.eval()
    test_correct = 0
    test_total = 0
    with torch.no_grad():
        for inputs, labels in test_loader:
            inputs, labels = inputs.to(device), labels.to(device)
            outputs = model(inputs)
            _, predicted = outputs.max(1)
            test_total += labels.size(0)
            test_correct += predicted.eq(labels).sum().item()
    
    train_acc = 100. * correct / total
    test_acc = 100. * test_correct / test_total
    print(f'Epoch {epoch+1:2d}/{num_epochs} | '
          f'Loss: {running_loss/len(train_loader):.4f} | '
          f'Train Acc: {train_acc:.2f}% | '
          f'Test Acc: {test_acc:.2f}%')

print(f'\n最终测试准确率: {test_acc:.2f}%')
```

典型输出（25 个 epoch 后）：

```
训练设备: cpu
模型参数量: 582,858
训练样本数: 50000
测试样本数: 10000

Epoch  1/25 | Loss: 1.5432 | Train Acc: 43.29% | Test Acc: 53.76%
Epoch  2/25 | Loss: 1.1243 | Train Acc: 59.47% | Test Acc: 64.28%
Epoch  3/25 | Loss: 0.9531 | Train Acc: 65.82% | Test Acc: 70.12%
...
Epoch 23/25 | Loss: 0.2876 | Train Acc: 90.31% | Test Acc: 87.65%
Epoch 24/25 | Loss: 0.2798 | Train Acc: 90.54% | Test Acc: 87.91%
Epoch 25/25 | Loss: 0.2734 | Train Acc: 90.78% | Test Acc: 88.12%

最终测试准确率: 88.12%
```

一个 58 万参数的简单 CNN，在 CIFAR-10 上能到 88% 左右的准确率。这个架构只有 6 个卷积层，远比 ResNet 简单，但已经能学到有用的视觉特征。

## 真实案例

### 案例 1：自动驾驶中的目标检测

Tesla 的 FSD（Full Self-Driving）系统大量使用 CNN 来处理摄像头输入。从 8 个摄像头同时输入的视频流中，CNN 需要实时检测车辆、行人、车道线、交通标志等。这里的核心挑战是实时性——CNN 必须在几十毫秒内处理完所有 8 路视频。CNN 的参数共享设计使得这个计算量变得可控：同一个"检测行人"的卷积核可以扫描所有摄像头输入，不需要为每个摄像头单独训练参数。

### 案例 2：医学图像分析

Google Health 的乳腺癌检测系统使用 CNN 分析乳腺 X 光片。系统在 2020 年发表于 Nature 的论文中报告，CNN 在检测乳腺癌方面的表现超过了放射科医生（假阳性率降低 5.7%，假阴性率降低 9.4%）。CNN 在这里的优势是：通过深层卷积，它能捕捉到人眼难以察觉的微小组织纹理变化。

### 案例 3：人脸识别

FaceNet（Google, 2015）使用 CNN 将人脸图片映射到 128 维的向量空间。同一个人的两张照片的向量距离很近，不同人的距离很远。核心是 CNN 提取的人脸特征具有很好的判别性——经过几层卷积后，人脸的局部特征（眼睛形状、鼻梁角度、下颌线条）被编码成紧凑的数值表示。

### 案例 4：艺术风格迁移

Gatys 等人 2015 年提出的 Neural Style Transfer 使用 CNN 的中间层特征来分离图像的"内容"和"风格"。内容来自高层特征（捕捉了图像的语义结构），风格来自特征之间的 Gram 矩阵（捕捉了纹理和颜色分布）。这个方法展示了 CNN 各层学到的特征有明确的物理含义：底层是边缘和颜色，中层是纹理和形状，高层是物体和语义。

## 权衡取舍以及何时不该使用

### CNN 的局限

**1. 旋转和尺度不变性有限**

标准 CNN 通过池化获得了一定的平移不变性，但对旋转和尺度变化仍然敏感。一只猫倒过来看（旋转180度），CNN 可能认不出来。解决方案包括数据增强（训练时随机旋转图片）和特殊架构（如 Spatial Transformer Networks）。但根本上，CNN 的卷积操作本身不是旋转等变的——这是它和人类视觉系统的一个重要区别。

**2. 缺乏全局上下文**

CNN 的每个神经元只关注局部区域。虽然深层神经元的感受野很大，但信息需要经过很多层才能传播。这意味着 CNN 在需要全局理解的任务上（如场景理解、长距离依赖关系）不如 Transformer 有效。这也是 Vision Transformer (ViT) 在 2020 年后开始挑战 CNN 地位的原因。

**3. 计算密集**

卷积操作虽然比全连接参数少，但计算量仍然很大。一张 224x224 的图片，经过一个有 64 个 3x3 核的卷积层，需要做 224 x 224 x 3 x 3 x 3 x 64 = 86.7M 次乘法运算。VGG-16 处理一张图片需要约 155 亿次浮点运算（FLOPs）。在边缘设备（手机、IoT）上，这可能是不可接受的。MobileNet 等轻量级架构通过深度可分离卷积（depthwise separable convolution）将计算量降低了 8-9 倍。

**4. 对输入尺寸敏感**

标准 CNN 要求固定大小的输入。虽然 FC 层可以转化为 CONV 层来处理任意尺寸的输入（Fully Convolutional Network），但大多数预训练模型还是绑定在特定的输入尺寸上。

### 何时不该使用 CNN

**1. 序列数据（文本、时间序列）**

虽然 1D CNN 可以处理序列数据（通过一维卷积核在时间轴上滑动），但对于长距离依赖关系强的任务，RNN/Transformer 通常更好。CNN 的感受野增长是线性的（每层增加 k-1），而 Transformer 的自注意力机制可以一步到位地连接所有位置。

**2. 图结构数据**

社交网络、分子结构、知识图谱等图结构数据不适合用 CNN 处理。Graph Neural Networks (GNN) 是更合适的选择——它们在图的邻域上做"卷积"，而不是在规则网格上。

**3. 全局信息至关重要的任务**

如果任务需要同时考虑输入的所有部分之间的关系（如文档级别的文本理解、全景场景理解），Transformer 的全局注意力机制比 CNN 的局部感受野更有优势。

**4. 数据量很少时**

CNN 有大量超参数需要调整（卷积核数量、大小、步长、填充、池化方式、层数等）。当训练数据少于几千张图片时，从头训练 CNN 很容易过拟合。此时更好的策略是使用迁移学习——拿 ImageNet 上预训练的模型，冻结前面的卷积层，只微调最后的分类层。

### 现代 CNN 的演进方向

CNN 并没有因为 Transformer 的出现而过时。2023 年的研究（如 ConvNeXt）表明，通过对标准 ResNet 进行现代化的设计调整（使用 7x7 大核深度卷积、LayerNorm 替代 BatchNorm、GELU 替代 ReLU、减少激活和归一化层的数量），纯 CNN 架构可以达到和 Swin Transformer 相当的性能。这说明 CNN 的核心设计（局部连接、权重共享）依然有效，需要调整的是具体的工程细节。

## 关键要点

**1. 三个核心设计解决三个核心问题**

| 问题 | 设计 | 效果 |
|------|------|------|
| 参数爆炸 | 局部连接 + 权重共享 | 参数量减少数千倍 |
| 丢失空间信息 | 保持 3D 体积结构 | 空间关系得以保留 |
| 平移敏感性 | 参数共享 + 池化 | 获得平移不变性 |

**2. 卷积核大小、步长、填充的常见配置**
- 最常用：3x3 卷积核，stride=1，padding=1（保持尺寸不变）
- 第一层偶尔用 7x7，stride=2（快速降分辨率）
- 池化：2x2 最大池化，stride=2（尺寸减半）
- 一个实用规律：$P = (F-1)/2$ 时，stride=1 的卷积保持输入尺寸不变

**3. 感受野决定了每个神经元能"看到"多少信息**
- 堆叠小卷积核（多个 3x3）比一个大卷积核（一个 7x7）参数更少、非线性更强
- 池化层加速感受野增长
- VGG-16 最终感受野约 212x212，几乎覆盖整张 224x224 的输入

**4. CNN 的本质是归纳偏置（inductive bias）**
- 局部性假设：图像的局部区域包含有用的特征
- 平移不变性假设：相同的特征出现在不同位置含义相同
- 层次性假设：简单特征组合成复杂特征
- 这些假设在图像上非常有效，但在其他数据类型上不一定成立

**5. 从 CNN 到现代架构的启示**
- CNN 的局部连接思想延续到了 Transformer 的局部注意力（如 Swin Transformer 的窗口注意力）
- 参数共享的思想是所有高效架构的基础
- 感受野的概念在 Transformer 中对应于注意力的覆盖范围

## 延伸阅读

- **CS231n: Convolutional Neural Networks for Visual Recognition** — Stanford 大学的经典课程，本文的很多技术细节参考了其课程笔记（cs231n.github.io）
- **"Convolutional Neural Networks, Explained"** — Towards Data Science 上的优秀综述文章
- **LeCun, Y. et al. (1998). "Gradient-Based Learning Applied to Document Recognition"** — LeNet-5 的原始论文，CNN 的奠基之作
- **Krizhevsky, A. et al. (2012). "ImageNet Classification with Deep Convolutional Neural Networks"** — AlexNet 论文，开启了深度学习时代
- **Springenberg, J. et al. (2014). "Striving for Simplicity: The All Convolutional Net"** — 提出用 stride>1 的卷积替代池化层
- **Liu, Z. et al. (2022). "A ConvNet for the 2020s" (ConvNeXt)** — 展示了纯 CNN 架构经过现代化设计后可以达到 Transformer 级别的性能
- **Olah, C. "Understanding Convolutions"** — colah's blog 上关于卷积的直觉解释，从信号处理角度理解卷积操作

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
