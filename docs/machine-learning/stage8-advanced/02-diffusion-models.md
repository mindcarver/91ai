# 扩散模型：从噪声到图像——DDPM、潜在扩散与 Stable Diffusion 的完整路径

<!--
调研来源：
1. "Denoising Diffusion Probabilistic Models" (Ho et al., NeurIPS 2020) — DDPM 原始论文
2. "High-Resolution Image Synthesis with Latent Diffusion Models" (Rombach et al., CVPR 2022) — Stable Diffusion 的理论基础
3. "What Are Diffusion Models?" (Lilian Weng, 2021, updated 2024) — 扩散模型系统性综述
4. "Diffusion Models: Toward State-of-the-Art Image Generation" (AI Summer, 2022) — DDPM 数学推导与架构分析
5. "Score-Based Generative Modeling through Stochastic Differential Equations" (Song et al., ICLR 2021) — 基于 SDE 的统一框架
6. "Scalable Diffusion Models with Transformers" (Peebles & Xie, ICCV 2023) — DiT 架构
7. "From U-Nets to DiTs: The Architectural Evolution of Text-to-Image Diffusion Models" (ICLR Blog, 2026) — 扩散模型架构演变综述
8. "Classifier-Free Diffusion Guidance" (Ho & Salimans, NeurIPS Workshop 2021) — 无分类器引导
9. "Noise Schedules Considered Harmful" (Sander Dieleman, 2024) — 噪声调度的深入分析
10. "Consistency Models" (Song et al., 2023) — 单步生成的前沿工作
11. "Latent Diffusion Model without Variational Autoencoder" (OpenReview, 2025) — 潜在扩散的最新进展
12. MIT 6.S184 "Flow Matching and Diffusion Models" (2026) — MIT 最新课程讲义

核心发现：扩散模型从2020年DDPM论文至今已成为图像生成的核心范式。从DDPM→LDM→Stable Diffusion→DiT→Flow Matching，架构不断演进。关键洞察是：扩散模型将图像生成分解为许多小的"去噪"步骤，每一步由神经网络预测并去除少量噪声。Stable Diffusion通过在潜在空间中执行扩散大幅降低计算成本。2023-2026年的前沿趋势包括：DiT替代U-Net、Flow Matching简化训练目标、Consistency Models实现单步生成。
-->

**TL;DR：** 扩散模型通过"加噪声→学习去噪声"的过程来生成图像。本文从数学基础（前向扩散、反向去噪的推导）开始，经过 DDPM 的训练与采样算法，到 Stable Diffusion 的潜在空间架构，再到 DiT 和 Flow Matching 的前沿发展，给出从公式到代码的完整路径。

## 为什么这很重要

2022年8月，Stable Diffusion 开源发布。任何人只要有一张消费级显卡，就能用文字描述生成高质量图像。这标志着图像生成从实验室走向了大众。

但扩散模型的影响远不止于此：

- **视频生成**：OpenAI 的 Sora、Runway Gen-3 都基于扩散模型
- **音频生成**：OpenAI 的 Jukebox、Google 的 AudioLDM
- **3D 生成**：DreamFusion、Point-E 用扩散模型生成三维模型
- **蛋白质设计**：RFdiffusion 用扩散模型设计新蛋白质结构
- **药物发现**：基于扩散的分子生成正在加速新药研发

扩散模型为什么能取代 GAN 成为主流？因为 GAN 训练不稳定、模式崩塌（生成的图像多样性差）是固有问题，而扩散模型的理论框架保证了训练的稳定性和生成质量的可控性。

## 核心概念

### 扩散模型的两大过程

```
┌────────────────────────────────────────────────────────────┐
│                    扩散模型的全景图                          │
│                                                            │
│  前向过程 (Forward Process)                                 │
│  ┌────┐    ┌────┐    ┌────┐         ┌────┐                │
│  │ x_0 │───▶│ x_1 │───▶│ x_2 │──...──▶│ x_T │              │
│  │原图  │    │+噪声│    │+更多│         │纯噪声│              │
│  └────┘    └────┘    └────┘         └────┘                │
│     ▲                            │                         │
│     │                            ▼                         │
│     │                   反向过程 (Reverse Process)          │
│     │         ┌────┐    ┌────┐    ┌────┐                   │
│     └─────────│x̂_0 │◀───│x̂_1 │◀───│x̂_T │                  │
│       生成图像  │去噪 │    │去噪 │    │随机噪声│               │
│               └────┘    └────┘    └────┘                   │
│                                                            │
│  关键：每一步由神经网络 ε_θ(x_t, t) 预测噪声并去除            │
│                                                            │
│  训练：L_simple = E[‖ε - ε_θ(x_t, t)‖²]                   │
│  采样：从 x_T ~ N(0,I) 开始，逐步去噪得到 x_0               │
└────────────────────────────────────────────────────────────┘
```

### DDPM 的关键数学概念

| 概念 | 符号 | 含义 |
|------|------|------|
| 噪声调度 | β₁, β₂, ..., β_T | 控制每一步加噪的强度 |
| 累积乘积 | α_t = 1 - β_t, ᾱ_t = ∏α_s | 简化任意时刻的采样 |
| 前向过程 | q(x_t \| x_0) = N(√ᾱ_t·x_0, (1-ᾱ_t)·I) | 任意一步的闭式解 |
| 反向过程 | p_θ(x_{t-1} \| x_t) | 由神经网络近似 |
| 训练目标 | L_simple = E[\|\|ε - ε_θ(x_t, t)\|\|²] | 预测噪声而非原始图像 |

## 工作原理（简化的心智模型）

### 用"修复古画"来理解扩散模型

想象你是一位古画修复师，面对一幅被严重损坏的画。

**前向过程**——画是如何变损坏的：一幅完好的画（x_0），经过风吹日晒（加噪声），逐渐变得模糊不清。经过 T 步损坏后，变成了一团看不出原样的斑点（纯高斯噪声）。

**关键洞察**：如果我们知道每一步损坏的规律（噪声调度 β_t），那么从完好的画到纯噪声的每一步都可以精确计算，不需要真的走 T 步——这就是"重参数化技巧"。

**反向过程**——修复画作：你训练了一个助手（神经网络），给它看部分损坏的画，让它预测"这幅画上哪些是损坏的痕迹（噪声）"。然后你把预测的噪声去掉，画就恢复了一点。重复 T 步，从纯噪声恢复出完整的画。

**训练**：你有很多完好的画（训练数据），随机选一幅，随机加一些噪声，让助手猜加的是什么噪声。猜对了就奖励（损失减小），猜错了就纠正。经过大量练习，助手变得非常擅长识别噪声。

**生成新画**：现在你不需要原有的画了。随机撒一团噪声给助手，让它一步步去除噪声——出来的就是一幅全新的、从未存在过的画。

### 潜在扩散（Stable Diffusion）的改进

如果画太大了（比如 1024×1024 像素），直接修复太慢。于是你先用压缩工具把画缩小到 64×64 的小缩略图（潜在空间），在小图上做修复，最后再放大还原。

- **VAE Encoder**：压缩工具，把大图压缩到小图
- **U-Net/DiT**：在小图上工作的修复助手
- **VAE Decoder**：放大还原工具，把小图变回大图
- **CLIP Text Encoder**：翻译官，把你的文字描述翻译成修复助手能理解的条件信号

## 工作原理（详细机制）

### 一、前向扩散过程的数学推导

前向过程是一个马尔可夫链，每一步给图像添加少量高斯噪声：

```
q(x_t | x_{t-1}) = N(x_t; √(1-β_t) · x_{t-1}, β_t · I)
```

其中 β_t 是噪声方差调度（noise schedule），通常从 β₁ = 10⁻⁴ 线性增长到 β_T = 0.02。

**重参数化技巧**——任意时刻的闭式解：

定义 α_t = 1 - β_t，ᾱ_t = ∏(s=1 to t) α_s，利用高斯分布的叠加性质，可以递归推导：

```
x_1 = √α₁ · x_0 + √(1-α₁) · ε₀
x_2 = √α₂ · x_1 + √(1-α₂) · ε₁
    = √(α₂α₁) · x_0 + √(1-α₂α₁) · ε
    ...
x_t = √ᾱ_t · x_0 + √(1-ᾱ_t) · ε
```

其中 ε ~ N(0, I)。这意味着给定原始图像 x_0，我们可以在一步之内采样任意时刻 t 的噪声图像——不需要真的跑 t 步。

```python
"""
前向扩散过程的实现
演示如何从原始图像一步加噪到任意时刻
"""

import torch
import torch.nn.functional as F
import numpy as np
from typing import Tuple

class ForwardDiffusion:
    """
    前向扩散过程
    
    核心公式：x_t = sqrt(α_bar_t) * x_0 + sqrt(1 - α_bar_t) * ε
    其中 ε ~ N(0, I)
    """
    
    def __init__(self, num_timesteps: int = 1000, 
                 beta_start: float = 1e-4, 
                 beta_end: float = 0.02,
                 schedule: str = 'linear'):
        self.num_timesteps = num_timesteps
        
        # 噪声调度
        if schedule == 'linear':
            betas = torch.linspace(beta_start, beta_end, num_timesteps)
        elif schedule == 'cosine':
            # cosine 调度（Nichol & Dhariwal 2021 推荐）
            steps = torch.arange(num_timesteps + 1)
            f = torch.cos((steps / num_timesteps + 0.008) / 1.008 * np.pi / 2) ** 2
            f = f / f[0]
            betas = torch.clip(1 - f[1:] / f[:-1], 0.0001, 0.9999)
        else:
            raise ValueError(f"Unknown schedule: {schedule}")
        
        # 预计算所有需要的系数
        alphas = 1.0 - betas
        alphas_cumprod = torch.cumprod(alphas, dim=0)  # ᾱ_t
        alphas_cumprod_prev = F.pad(alphas_cumprod[:-1], (1, 0), value=1.0)
        
        # 注册为 buffer（不参与梯度计算，但会随模型移动到 GPU）
        self.register_buffer = lambda name, val: setattr(self, name, val)
        
        self.betas = betas
        self.alphas = alphas
        self.alphas_cumprod = alphas_cumprod
        
        # q(x_t | x_0) 的参数
        self.sqrt_alphas_cumprod = torch.sqrt(alphas_cumprod)           # √ᾱ_t
        self.sqrt_one_minus_alphas_cumprod = torch.sqrt(1.0 - alphas_cumprod)  # √(1-ᾱ_t)
        
        # 反向过程 q(x_{t-1} | x_t, x_0) 的参数
        self.sqrt_recip_alphas = torch.sqrt(1.0 / alphas)              # 1/√α_t
        self.posterior_variance = (
            betas * (1.0 - alphas_cumprod_prev) / (1.0 - alphas_cumprod)
        )
        
        # 用于对数空间计算的系数
        self.posterior_log_variance_clipped = torch.log(
            self.posterior_variance.clamp(min=1e-20)
        )
        self.posterior_mean_coef1 = (
            betas * torch.sqrt(alphas_cumprod_prev) / (1.0 - alphas_cumprod)
        )
        self.posterior_mean_coef2 = (
            (1.0 - alphas_cumprod_prev) * torch.sqrt(alphas) / (1.0 - alphas_cumprod)
        )
    
    def q_sample(self, x_0: torch.Tensor, t: torch.Tensor, 
                 noise: torch.Tensor = None) -> torch.Tensor:
        """
        前向采样：从 x_0 直接采样 x_t（重参数化技巧）
        
        x_t = sqrt(ᾱ_t) * x_0 + sqrt(1 - ᾱ_t) * ε
        
        参数：
            x_0: 原始图像 [B, C, H, W]
            t: 时间步 [B]（每个样本可以有不同的 t）
            noise: 可选的预采样噪声
        """
        if noise is None:
            noise = torch.randn_like(x_0)
        
        # 提取对应时间步的系数，reshape 为 [B, 1, 1, 1] 以便广播
        sqrt_alpha = self._extract(self.sqrt_alphas_cumprod, t, x_0.shape)
        sqrt_one_minus_alpha = self._extract(
            self.sqrt_one_minus_alphas_cumprod, t, x_0.shape
        )
        
        return sqrt_alpha * x_0 + sqrt_one_minus_alpha * noise
    
    def _extract(self, a: torch.Tensor, t: torch.Tensor, 
                 x_shape: tuple) -> torch.Tensor:
        """从预计算数组中提取对应时间步的值"""
        batch_size = t.shape[0]
        out = a.gather(-1, t.cpu()).to(t.device)
        return out.reshape(batch_size, *((1,) * (len(x_shape) - 1)))
    
    def q_posterior_mean_variance(self, x_0: torch.Tensor, 
                                   x_t: torch.Tensor, 
                                   t: torch.Tensor) -> Tuple[torch.Tensor, torch.Tensor]:
        """
        计算后验 q(x_{t-1} | x_t, x_0) 的均值和方差
        
        μ̃_t = (√ᾱ_{t-1} * β_t) / (1 - ᾱ_t) * x_0 
             + (√α_t * (1 - ᾱ_{t-1})) / (1 - ᾱ_t) * x_t
        """
        posterior_mean = (
            self._extract(self.posterior_mean_coef1, t, x_t.shape) * x_0 +
            self._extract(self.posterior_mean_coef2, t, x_t.shape) * x_t
        )
        posterior_variance = self._extract(self.posterior_variance, t, x_t.shape)
        return posterior_mean, posterior_variance


# 可视化前向扩散过程
def visualize_forward_process():
    """展示前向扩散如何逐步将图像变成噪声"""
    diffusion = ForwardDiffusion(num_timesteps=1000)
    
    # 创建一个简单的测试图像（例如一个圆）
    x_0 = torch.zeros(1, 1, 32, 32)
    y, x = torch.meshgrid(torch.arange(32), torch.arange(32), indexing='ij')
    center = 16
    radius = 10
    circle = ((y - center)**2 + (x - center)**2) <= radius**2
    x_0[0, 0] = circle.float()
    
    # 在不同时间步采样
    timesteps = [0, 50, 100, 250, 500, 999]
    print("前向扩散过程：从清晰图像到纯噪声")
    print("=" * 50)
    for t_val in timesteps:
        t = torch.tensor([t_val])
        x_t = diffusion.q_sample(x_0, t)
        # x_t 中信号的能量比
        signal_ratio = diffusion.sqrt_alphas_cumprod[t_val].item() ** 2
        noise_ratio = 1 - signal_ratio
        print(f"t={t_val:4d}: 信号占比={signal_ratio:.4f}, "
              f"噪声占比={noise_ratio:.4f}")


if __name__ == "__main__":
    visualize_forward_process()
```

### 二、反向去噪过程的推导

前向过程我们完全知道，但反向过程 q(x_{t-1} | x_t) 是不可直接计算的（需要整个数据集）。关键发现是：**如果我们额外知道 x_0，反向过程就变得可处理了**。

利用贝叶斯定理：

```
q(x_{t-1} | x_t, x_0) = N(x_{t-1}; μ̃_t(x_t, x_0), β̃_t · I)
```

其中：
- β̃_t = (1 - ᾱ_{t-1}) / (1 - ᾱ_t) · β_t
- μ̃_t(x_t, x_0) = (√ᾱ_{t-1} · β_t)/(1-ᾱ_t) · x_0 + (√α_t · (1-ᾱ_{t-1}))/(1-ᾱ_t) · x_t

用 x_0 = (x_t - √(1-ᾱ_t) · ε) / √ᾱ_t 代入，可以把均值写成只关于 x_t 和 ε 的函数：

```
μ̃_t(x_t) = (1/√α_t) · (x_t - β_t/√(1-ᾱ_t) · ε)
```

这意味着：**如果我们能预测出噪声 ε，就能计算出反向过程的均值**。这就是为什么 DDPM 让神经网络预测噪声——不是预测原始图像，不是预测均值，而是预测被添加的噪声。

### 三、训练目标——从 ELBO 到简化损失

扩散模型的训练基于变分推断，最大化数据的对数似然的证据下界（ELBO）：

```
log p(x_0) ≥ E_q[log p_θ(x_0|x_1)] - D_KL(q(x_T|x_0) || p(x_T)) - Σ E_q[D_KL(q(x_{t-1}|x_t,x_0) || p_θ(x_{t-1}|x_t))]
```

经过一系列化简，核心的训练损失可以表示为预测噪声与真实噪声之间的均方误差。Ho et al. (2020) 发现，忽略权重项的简化版本效果更好：

```
L_simple = E_{x_0, t, ε} [‖ε - ε_θ(x_t, t)‖²]
```

训练算法：
1. 采样真实图像 x_0 ~ q(x_0)
2. 随机选择时间步 t ~ Uniform(1, T)
3. 采样噪声 ε ~ N(0, I)
4. 计算噪声图像 x_t = √ᾱ_t · x_0 + √(1-ᾱ_t) · ε
5. 让模型预测噪声 ε_θ(x_t, t)
6. 计算损失 L = ‖ε - ε_θ(x_t, t)‖²
7. 反向传播更新参数

### 四、采样算法——从噪声生成图像

训练完成后，从纯噪声开始逐步去噪：

```python
"""
DDPM 完整的采样过程
"""

class DDPMSampler:
    """
    DDPM 反向采样器
    
    从 x_T ~ N(0, I) 开始，逐步去噪到 x_0
    """
    
    def __init__(self, diffusion: ForwardDiffusion):
        self.diffusion = diffusion
    
    @torch.no_grad()
    def sample(self, model: torch.nn.Module, 
               shape: tuple, 
               device: str = 'cpu') -> torch.Tensor:
        """
        DDPM 采样算法
        
        参数：
            model: 噪声预测模型 ε_θ(x_t, t)
            shape: 生成图像的形状 [B, C, H, W]
            device: 计算设备
        """
        # 步骤1：从纯高斯噪声开始
        x = torch.randn(shape, device=device)
        
        # 步骤2：逐步去噪，从 T 到 1
        for t in reversed(range(self.diffusion.num_timesteps)):
            t_batch = torch.full((shape[0],), t, device=device, dtype=torch.long)
            
            # 模型预测噪声
            predicted_noise = model(x, t_batch)
            
            # 计算去噪后的均值
            # μ_θ = (1/√α_t) * (x_t - β_t/√(1-ᾱ_t) * ε_θ(x_t, t))
            sqrt_recip_alpha = self.diffusion._extract(
                self.diffusion.sqrt_recip_alphas, t_batch, x.shape
            )
            beta_over_sqrt_one_minus_alpha = self.diffusion.betas[t] / \
                self.diffusion.sqrt_one_minus_alphas_cumprod[t]
            
            mean = sqrt_recip_alpha * (
                x - beta_over_sqrt_one_minus_alpha * predicted_noise
            )
            
            if t > 0:
                # 添加随机噪声（除了最后一步）
                noise = torch.randn_like(x)
                sigma = torch.sqrt(self.diffusion.posterior_variance[t])
                x = mean + sigma * noise
            else:
                x = mean
        
        return x


class DDIMSampler:
    """
    DDIM（Denoising Diffusion Implicit Models）采样器
    
    Song et al. 2020 提出的确定性采样方法
    可以用更少的步数生成高质量图像
    
    核心改进：将随机采样变为确定性映射
    η = 0 时为完全确定性（DDIM）
    η = 1 时退化为 DDPM
    """
    
    def __init__(self, diffusion: ForwardDiffusion):
        self.diffusion = diffusion
    
    @torch.no_grad()
    def sample(self, model: torch.nn.Module, 
               shape: tuple,
               num_inference_steps: int = 50,
               eta: float = 0.0,
               device: str = 'cpu') -> torch.Tensor:
        """
        DDIM 采样
        
        参数：
            model: 噪声预测模型
            shape: 生成图像的形状
            num_inference_steps: 实际采样步数（远小于训练步数 T）
            eta: 随机性控制，0=确定性，1=DDPM
        """
        T = self.diffusion.num_timesteps
        
        # 创建子采样时间表
        step_size = T // num_inference_steps
        timesteps = list(range(0, T, step_size))
        timesteps = list(reversed(timesteps))
        
        x = torch.randn(shape, device=device)
        alphas_cumprod = self.diffusion.alphas_cumprod
        
        for i in range(len(timesteps)):
            t = timesteps[i]
            t_prev = timesteps[i + 1] if i < len(timesteps) - 1 else 0
            
            t_batch = torch.full((shape[0],), t, device=device, dtype=torch.long)
            
            # 预测噪声
            predicted_noise = model(x, t_batch)
            
            # DDIM 的核心公式
            alpha_t = alphas_cumprod[t]
            alpha_t_prev = alphas_cumprod[t_prev] if t_prev > 0 else torch.tensor(1.0)
            
            # 预测 x_0
            x0_pred = (x - torch.sqrt(1 - alpha_t) * predicted_noise) / torch.sqrt(alpha_t)
            
            # 计算方向指向的噪声
            sigma = eta * torch.sqrt(
                (1 - alpha_t_prev) / (1 - alpha_t) * (1 - alpha_t / alpha_t_prev)
            )
            
            # 预测 x_{t-1} 的方向
            pred_dir = torch.sqrt(1 - alpha_t_prev - sigma**2) * predicted_noise
            
            # DDIM 更新
            x = torch.sqrt(alpha_t_prev) * x0_pred + pred_dir
            
            if sigma > 0:
                x = x + sigma * torch.randn_like(x)
        
        return x
```

### 五、U-Net 噪声预测网络

DDPM 使用 U-Net 作为噪声预测网络 ε_θ(x_t, t)。U-Net 的编码器-解码器结构配合跳跃连接，非常适合保留空间信息。

```python
"""
简化版 U-Net 噪声预测网络
用于 DDPM 训练和采样
"""

import torch
import torch.nn as nn
import math


class SinusoidalPositionEmbeddings(nn.Module):
    """
    正弦位置编码——将时间步 t 编码为向量
    
    与 Transformer 中的位置编码类似
    让模型知道"当前处于哪个噪声水平"
    """
    def __init__(self, dim: int):
        super().__init__()
        self.dim = dim
    
    def forward(self, t: torch.Tensor) -> torch.Tensor:
        device = t.device
        half_dim = self.dim // 2
        embeddings = math.log(10000) / (half_dim - 1)
        embeddings = torch.exp(torch.arange(half_dim, device=device) * -embeddings)
        embeddings = t[:, None].float() * embeddings[None, :]
        embeddings = torch.cat([torch.sin(embeddings), torch.cos(embeddings)], dim=-1)
        return embeddings


class ResidualBlock(nn.Module):
    """残差块，融合时间步嵌入"""
    def __init__(self, in_channels: int, out_channels: int, time_emb_dim: int):
        super().__init__()
        self.conv1 = nn.Sequential(
            nn.GroupNorm(8, in_channels),
            nn.SiLU(),
            nn.Conv2d(in_channels, out_channels, 3, padding=1)
        )
        self.time_mlp = nn.Sequential(
            nn.SiLU(),
            nn.Linear(time_emb_dim, out_channels)
        )
        self.conv2 = nn.Sequential(
            nn.GroupNorm(8, out_channels),
            nn.SiLU(),
            nn.Conv2d(out_channels, out_channels, 3, padding=1)
        )
        self.shortcut = (
            nn.Conv2d(in_channels, out_channels, 1) 
            if in_channels != out_channels else nn.Identity()
        )
    
    def forward(self, x: torch.Tensor, t_emb: torch.Tensor) -> torch.Tensor:
        h = self.conv1(x)
        # 将时间嵌入加到特征图上
        t_emb = self.time_mlp(t_emb)
        h = h + t_emb[:, :, None, None]
        h = self.conv2(h)
        return h + self.shortcut(x)


class AttentionBlock(nn.Module):
    """自注意力块——在低分辨率特征图上捕获全局依赖"""
    def __init__(self, channels: int):
        super().__init__()
        self.norm = nn.GroupNorm(8, channels)
        self.qkv = nn.Conv2d(channels, channels * 3, 1)
        self.proj = nn.Conv2d(channels, channels, 1)
        self.scale = channels ** -0.5
    
    def forward(self, x: torch.Tensor) -> torch.Tensor:
        B, C, H, W = x.shape
        h = self.norm(x)
        qkv = self.qkv(h).reshape(B, 3, C, H * W)
        q, k, v = qkv[:, 0], qkv[:, 1], qkv[:, 2]
        
        attn = torch.softmax(torch.bmm(q.transpose(1, 2), k) * self.scale, dim=-1)
        h = torch.bmm(v, attn.transpose(1, 2)).reshape(B, C, H, W)
        return self.proj(h) + x


class SimpleUNet(nn.Module):
    """
    简化版 U-Net
    
    架构：
    - 编码器：逐步下采样
    - 瓶颈层：自注意力
    - 解码器：逐步上采样 + 跳跃连接
    
    输入：噪声图像 x_t 和时间步 t
    输出：预测的噪声 ε_θ(x_t, t)
    """
    def __init__(self, in_channels: int = 1, out_channels: int = 1, 
                 base_channels: int = 64):
        super().__init__()
        time_dim = base_channels * 4
        
        # 时间步嵌入
        self.time_mlp = nn.Sequential(
            SinusoidalPositionEmbeddings(base_channels),
            nn.Linear(base_channels, time_dim),
            nn.SiLU(),
            nn.Linear(time_dim, time_dim)
        )
        
        # 编码器
        self.enc1 = ResidualBlock(in_channels, base_channels, time_dim)
        self.enc2 = ResidualBlock(base_channels, base_channels * 2, time_dim)
        self.enc3 = ResidualBlock(base_channels * 2, base_channels * 4, time_dim)
        self.down = nn.MaxPool2d(2)
        
        # 瓶颈层
        self.bottleneck = nn.Sequential(
            ResidualBlock(base_channels * 4, base_channels * 8, time_dim),
            AttentionBlock(base_channels * 8),
            ResidualBlock(base_channels * 8, base_channels * 4, time_dim)
        )
        
        # 解码器
        self.up3 = nn.ConvTranspose2d(base_channels * 4, base_channels * 4, 2, 2)
        self.dec3 = ResidualBlock(base_channels * 8, base_channels * 2, time_dim)
        self.up2 = nn.ConvTranspose2d(base_channels * 2, base_channels * 2, 2, 2)
        self.dec2 = ResidualBlock(base_channels * 4, base_channels, time_dim)
        self.up1 = nn.ConvTranspose2d(base_channels, base_channels, 2, 2)
        self.dec1 = ResidualBlock(base_channels * 2, base_channels, time_dim)
        
        # 输出
        self.final = nn.Sequential(
            nn.GroupNorm(8, base_channels),
            nn.SiLU(),
            nn.Conv2d(base_channels, out_channels, 3, padding=1)
        )
    
    def forward(self, x: torch.Tensor, t: torch.Tensor) -> torch.Tensor:
        # 时间步嵌入
        t_emb = self.time_mlp(t)
        
        # 编码器
        e1 = self.enc1(x, t_emb)         # [B, 64, H, W]
        e2 = self.enc2(self.down(e1), t_emb)  # [B, 128, H/2, W/2]
        e3 = self.enc3(self.down(e2), t_emb)  # [B, 256, H/4, W/4]
        
        # 瓶颈层
        b = self.bottleneck[0](self.down(e3), t_emb)
        b = self.bottleneck[1](b)
        b = self.bottleneck[2](b, t_emb)
        
        # 解码器 + 跳跃连接
        d3 = self.up3(b)
        d3 = self.dec3(torch.cat([d3, e3], dim=1), t_emb)
        d2 = self.up2(d3)
        d2 = self.dec2(torch.cat([d2, e2], dim=1), t_emb)
        d1 = self.up1(d2)
        d1 = self.dec1(torch.cat([d1, e1], dim=1), t_emb)
        
        return self.final(d1)
```

### 六、完整训练流程

```python
"""
DDPM 完整训练流程
在 MNIST 数据集上训练一个无条件扩散模型
"""

import torch
import torch.nn as nn
from torch.utils.data import DataLoader
from torchvision import transforms, datasets
from tqdm import tqdm


class DDPMTrainer:
    """
    DDPM 训练器
    
    训练循环的核心：
    1. 取真实图像 x_0
    2. 随机选时间步 t
    3. 随机采样噪声 ε
    4. 计算噪声图像 x_t = √ᾱ_t * x_0 + √(1-ᾱ_t) * ε
    5. 让模型预测噪声 ε_θ(x_t, t)
    6. 损失 = ‖ε - ε_θ(x_t, t)‖²
    """
    
    def __init__(self, model: nn.Module, 
                 diffusion: ForwardDiffusion,
                 lr: float = 2e-4,
                 device: str = 'cuda' if torch.cuda.is_available() else 'cpu'):
        self.model = model.to(device)
        self.diffusion = diffusion
        self.device = device
        self.optimizer = torch.optim.AdamW(model.parameters(), lr=lr)
        # EMA（指数移动平均）提升生成质量
        self.ema_model = copy.deepcopy(model)
        self.ema_decay = 0.9999
    
    def train_step(self, x_0: torch.Tensor) -> float:
        """单步训练"""
        self.optimizer.zero_grad()
        
        batch_size = x_0.shape[0]
        x_0 = x_0.to(self.device)
        
        # 随机采样时间步
        t = torch.randint(0, self.diffusion.num_timesteps, (batch_size,), 
                          device=self.device)
        
        # 随机采样噪声
        noise = torch.randn_like(x_0)
        
        # 前向加噪
        x_t = self.diffusion.q_sample(x_0, t, noise)
        
        # 模型预测噪声
        predicted_noise = self.model(x_t, t)
        
        # 简化损失：预测噪声与真实噪声的 MSE
        loss = nn.functional.mse_loss(predicted_noise, noise)
        
        loss.backward()
        # 梯度裁剪
        nn.utils.clip_grad_norm_(self.model.parameters(), 1.0)
        self.optimizer.step()
        
        # 更新 EMA
        self._update_ema()
        
        return loss.item()
    
    def _update_ema(self):
        for ema_p, model_p in zip(self.ema_model.parameters(), 
                                   self.model.parameters()):
            ema_p.data.mul_(self.ema_decay).add_(model_p.data, alpha=1 - self.ema_decay)
    
    def train(self, num_epochs: int = 50, batch_size: int = 128):
        """完整训练循环"""
        # 加载 MNIST
        transform = transforms.Compose([
            transforms.Resize(32),
            transforms.ToTensor(),
            transforms.Normalize([0.5], [0.5])  # 归一化到 [-1, 1]
        ])
        dataset = datasets.MNIST('./data', train=True, download=True, 
                                  transform=transform)
        dataloader = DataLoader(dataset, batch_size=batch_size, 
                                 shuffle=True, num_workers=4)
        
        for epoch in range(num_epochs):
            total_loss = 0
            pbar = tqdm(dataloader, desc=f"Epoch {epoch+1}/{num_epochs}")
            for batch, _ in pbar:
                loss = self.train_step(batch)
                total_loss += loss
                pbar.set_postfix(loss=f"{loss:.4f}")
            
            avg_loss = total_loss / len(dataloader)
            print(f"Epoch {epoch+1}: 平均损失 = {avg_loss:.4f}")
            
            # 每10个 epoch 生成样本看看效果
            if (epoch + 1) % 10 == 0:
                self.generate_samples(epoch + 1)
    
    @torch.no_grad()
    def generate_samples(self, epoch: int, num_images: int = 16):
        """用 EMA 模型生成样本"""
        sampler = DDPMSampler(self.diffusion)
        samples = sampler.sample(
            self.ema_model,
            shape=(num_images, 1, 32, 32),
            device=self.device
        )
        # 从 [-1, 1] 转回 [0, 1]
        samples = (samples + 1) / 2
        samples = samples.clamp(0, 1)
        print(f"生成了 {num_images} 张图像 (epoch {epoch})")


import copy  # 用于 EMA
```

### 七、Stable Diffusion——潜在扩散模型

Stable Diffusion 的核心创新在于：不在像素空间做扩散，而是先通过 VAE 将图像压缩到低维潜在空间，在潜在空间中做扩散。

```
┌─────────────────────────────────────────────────────────────┐
│                 Stable Diffusion 架构                        │
│                                                             │
│  文本输入 ──── CLIP Text Encoder ──── 文本嵌入 [B, 77, 768] │
│                                              │              │
│                                              ▼              │
│  ┌───────────────────────────────────────────────────┐      │
│  │            条件去噪 U-Net                          │      │
│  │                                                   │      │
│  │  噪声潜在 z_t ──▶ [ResBlock + CrossAttention] ──▶ │      │
│  │       ▲                          ▲                │      │
│  │       │                    文本嵌入作为             │      │
│  │    时间步 t              Key 和 Value              │      │
│  │       │                          │                │      │
│  │       └──────────────────────────┘                │      │
│  │                                                   │      │
│  │  输出：预测的噪声 ε_θ(z_t, t, c)                    │      │
│  └───────────────────────────────────────────────────┘      │
│                          │                                  │
│                          ▼                                  │
│              去噪后的潜在 z_0                                 │
│                          │                                  │
│                          ▼                                  │
│              VAE Decoder ──── 生成图像 [B, 3, 512, 512]       │
│                                                             │
│  训练流程：                                                   │
│  图像 x ──▶ VAE Encoder ──▶ z_0 ──▶ 加噪 ──▶ z_t            │
│  损失 = ‖ε - ε_θ(z_t, t, text_embedding)‖²                 │
└─────────────────────────────────────────────────────────────┘
```

**为什么潜在空间有效？** 图像的绝大部分比特用于编码高频细节（纹理、噪声），而语义信息集中在低维空间。VAE 将 512×512×3 = 786432 维压缩到 64×64×4 = 16384 维（压缩比约 48:1），但保留了足够的语义信息用于扩散。

**计算效率对比**：
- 像素空间扩散：在 512×512×3 上做扩散，每步计算量巨大
- 潜在空间扩散：在 64×64×4 上做扩散，计算量减少约 48 倍

```python
"""
Stable Diffusion 的核心组件实现
展示 VAE、CLIP 文本编码和交叉注意力的协同工作
"""

class CrossAttention(nn.Module):
    """
    交叉注意力机制
    
    在 Stable Diffusion 中，U-Net 通过交叉注意力接收文本条件
    - Query: 来自图像特征
    - Key, Value: 来自文本嵌入
    
    这使得模型能根据文本描述调整去噪方向
    """
    def __init__(self, query_dim: int, context_dim: int, 
                 n_heads: int = 8, head_dim: int = 64):
        super().__init__()
        inner_dim = n_heads * head_dim
        self.n_heads = n_heads
        self.scale = head_dim ** -0.5
        
        self.to_q = nn.Linear(query_dim, inner_dim, bias=False)
        self.to_k = nn.Linear(context_dim, inner_dim, bias=False)
        self.to_v = nn.Linear(context_dim, inner_dim, bias=False)
        self.to_out = nn.Linear(inner_dim, query_dim)
    
    def forward(self, x: torch.Tensor, context: torch.Tensor) -> torch.Tensor:
        """
        参数：
            x: 图像特征 [B, H*W, query_dim]
            context: 文本嵌入 [B, seq_len, context_dim]
        """
        B = x.shape[0]
        
        q = self.to_q(x)       # [B, H*W, inner_dim]
        k = self.to_k(context)  # [B, seq_len, inner_dim]
        v = self.to_v(context)  # [B, seq_len, inner_dim]
        
        # 多头注意力
        q = q.reshape(B, -1, self.n_heads, q.shape[-1] // self.n_heads).transpose(1, 2)
        k = k.reshape(B, -1, self.n_heads, k.shape[-1] // self.n_heads).transpose(1, 2)
        v = v.reshape(B, -1, self.n_heads, v.shape[-1] // self.n_heads).transpose(1, 2)
        
        attn = torch.softmax(torch.matmul(q, k.transpose(-1, -2)) * self.scale, dim=-1)
        out = torch.matmul(attn, v)
        out = out.transpose(1, 2).reshape(B, -1, out.shape[-1] * self.n_heads)
        
        return self.to_out(out)


class ClassifierFreeGuidance:
    """
    无分类器引导（Classifier-Free Guidance）
    
    Ho & Salimans 2021 提出，Stable Diffusion 的核心采样技术
    
    核心思想：
    同时训练条件模型 ε_θ(x_t, t, c) 和无条件模型 ε_θ(x_t, t, ∅)
    （通过训练时随机丢弃条件实现）
    
    采样时：
    ε_guided = ε_θ(x_t, t, ∅) + s * (ε_θ(x_t, t, c) - ε_θ(x_t, t, ∅))
    
    s > 1 增强条件的影响，生成更符合文本描述的图像
    但 s 过大可能导致图像质量下降（过饱和、伪影）
    
    典型值：s = 7.5（Stable Diffusion 的默认值）
    """
    
    def __init__(self, guidance_scale: float = 7.5):
        self.guidance_scale = guidance_scale
    
    @torch.no_grad()
    def guided_denoise(self, model: nn.Module, 
                       x_t: torch.Tensor, 
                       t: torch.Tensor,
                       text_embedding: torch.Tensor,
                       uncond_embedding: torch.Tensor) -> torch.Tensor:
        """
        引导去噪一步
        
        同时预测条件和无条件噪声，然后线性外推
        """
        # 无条件预测
        noise_uncond = model(x_t, t, uncond_embedding)
        
        # 条件预测
        noise_cond = model(x_t, t, text_embedding)
        
        # 引导：远离无条件，靠近条件
        guided_noise = noise_uncond + self.guidance_scale * (
            noise_cond - noise_uncond
        )
        
        return guided_noise


class StableDiffusionPipeline:
    """
    简化版 Stable Diffusion Pipeline
    
    整合所有组件：文本编码 + 潜在扩散 + VAE 解码
    """
    
    def __init__(self, unet, vae, text_encoder, diffusion, 
                 guidance_scale: float = 7.5):
        self.unet = unet
        self.vae = vae
        self.text_encoder = text_encoder
        self.diffusion = diffusion
        self.cfg = ClassifierFreeGuidance(guidance_scale)
    
    @torch.no_grad()
    def __call__(self, prompt: str, num_inference_steps: int = 50,
                 height: int = 512, width: int = 512) -> torch.Tensor:
        """
        文本到图像生成
        
        参数：
            prompt: 文本描述
            num_inference_steps: 采样步数
            height, width: 输出图像尺寸
        """
        device = next(self.unet.parameters()).device
        
        # 步骤1：编码文本
        # 实际中使用 CLIP Text Encoder
        # 这里用随机嵌入代替演示
        text_embedding = self.text_encoder(prompt)  # [1, 77, 768]
        uncond_embedding = self.text_encoder("")     # 无条件嵌入
        
        # 步骤2：在潜在空间中采样
        latent_height = height // 8  # VAE 下采样 8 倍
        latent_width = width // 8
        latent_shape = (1, 4, latent_height, latent_width)  # 4 通道潜在空间
        
        sampler = DDIMSampler(self.diffusion)
        
        # 使用 CFG 的采样循环
        latents = torch.randn(latent_shape, device=device)
        
        T = self.diffusion.num_timesteps
        step_size = T // num_inference_steps
        timesteps = list(reversed(range(0, T, step_size)))
        
        for t_val in timesteps:
            t = torch.tensor([t_val], device=device)
            
            # CFG 引导去噪
            noise_pred = self.cfg.guided_denoise(
                self.unet, latents, t, text_embedding, uncond_embedding
            )
            
            # DDIM 更新步骤（简化）
            alpha_t = self.diffusion.alphas_cumprod[t_val]
            x0_pred = (latents - torch.sqrt(1 - alpha_t) * noise_pred) / torch.sqrt(alpha_t)
            
            t_prev = t_val - step_size if t_val > step_size else 0
            alpha_t_prev = self.diffusion.alphas_cumprod[t_prev] if t_prev > 0 else torch.tensor(1.0)
            
            latents = torch.sqrt(alpha_t_prev) * x0_pred + \
                      torch.sqrt(1 - alpha_t_prev) * noise_pred
        
        # 步骤3：VAE 解码
        image = self.vae.decode(latents)
        
        return image
```

### 八、Diffusion Transformer（DiT）——架构革命

2023年 Peebles & Xie 提出的 DiT（Diffusion Transformer），用 Transformer 替代 U-Net 作为扩散模型骨干网络。这个改变看起来简单，却深刻影响了后续发展——Sora、Stable Diffusion 3、Flux 都采用了 DiT 或其变体。

```python
"""
Diffusion Transformer (DiT) 的核心实现

参考：Peebles & Xie, "Scalable Diffusion Models with Transformers", ICCV 2023
"""

class DiTBlock(nn.Module):
    """
    DiT 块
    
    与标准 Transformer 块的区别：
    1. 使用自适应层归一化（adaLN）注入时间步和条件信息
    2. 使用 adaLN-Zero 初始化策略（残差连接最后一层初始化为0）
    
    adaLN-Zero 让训练初期接近恒等映射，加速收敛
    """
    def __init__(self, dim: int, num_heads: int, mlp_ratio: int = 4):
        super().__init__()
        self.norm1 = nn.LayerNorm(dim, elementwise_affine=False)
        self.attn = nn.MultiheadAttention(dim, num_heads, batch_first=True)
        self.norm2 = nn.LayerNorm(dim, elementwise_affine=False)
        mlp_hidden = dim * mlp_ratio
        self.mlp = nn.Sequential(
            nn.Linear(dim, mlp_hidden),
            nn.GELU(),
            nn.Linear(mlp_hidden, dim)
        )
        
        # adaLN 调制参数：每个块有 6 个参数（scale, shift, gate × 2 个子层）
        self.adaLN_modulation = nn.Sequential(
            nn.SiLU(),
            nn.Linear(dim, 6 * dim)
        )
        
        # Zero 初始化
        nn.init.zeros_(self.adaLN_modulation[-1].weight)
        nn.init.zeros_(self.adaLN_modulation[-1].bias)
    
    def forward(self, x: torch.Tensor, c: torch.Tensor) -> torch.Tensor:
        """
        参数：
            x: patch tokens [B, N, dim]
            c: 条件向量（时间步 + 类别/文本嵌入） [B, dim]
        """
        # 从条件向量计算调制参数
        shift1, scale1, gate1, shift2, scale2, gate2 = \
            self.adaLN_modulation(c).chunk(6, dim=-1)
        
        # 自注意力 + adaLN + gate
        h = self.norm1(x) * (1 + scale1[:, None, :]) + shift1[:, None, :]
        h, _ = self.attn(h, h, h)
        x = x + gate1[:, None, :] * h
        
        # MLP + adaLN + gate
        h = self.norm2(x) * (1 + scale2[:, None, :]) + shift2[:, None, :]
        h = self.mlp(h)
        x = x + gate2[:, None, :] * h
        
        return x


class DiT(nn.Module):
    """
    Diffusion Transformer
    
    工作流程：
    1. 将潜在表示切分为 patch（类似 ViT）
    2. 通过 Transformer 块处理
    3. 重组为原始空间形状，输出噪声预测
    
    为什么 DiT 比 U-Net 好？
    - 可扩展性：Transformer 架构更容易 scale up
    - 训练效率：在相同计算量下 DiT 的 FID 更低
    - 灵活性：条件注入方式更统一
    """
    def __init__(self, input_size: int = 32, in_channels: int = 4,
                 patch_size: int = 2, dim: int = 384, 
                 depth: int = 12, num_heads: int = 6):
        super().__init__()
        self.input_size = input_size
        self.patch_size = patch_size
        self.num_patches = (input_size // patch_size) ** 2
        
        # Patch 嵌入
        self.patch_embed = nn.Conv2d(
            in_channels, dim, kernel_size=patch_size, stride=patch_size
        )
        
        # 位置编码
        self.pos_embed = nn.Parameter(
            torch.randn(1, self.num_patches, dim) * 0.02
        )
        
        # Transformer 块
        self.blocks = nn.ModuleList([
            DiTBlock(dim, num_heads) for _ in range(depth)
        ])
        
        # 最终层归一化
        self.final_norm = nn.LayerNorm(dim, elementwise_affine=False)
        
        # 输出投影（预测噪声和对角方差）
        self.output_proj = nn.Linear(dim, patch_size * patch_size * in_channels)
        nn.init.zeros_(self.output_proj.weight)
        nn.init.zeros_(self.output_proj.bias)
        
        # 条件嵌入（时间步 + 类别/文本）
        self.cond_embed = nn.Sequential(
            SinusoidalPositionEmbeddings(dim),
            nn.Linear(dim, dim),
            nn.SiLU(),
            nn.Linear(dim, dim)
        )
    
    def forward(self, x: torch.Tensor, t: torch.Tensor, 
                y: torch.Tensor = None) -> torch.Tensor:
        """
        参数：
            x: 噪声潜在 [B, in_channels, H, W]
            t: 时间步 [B]
            y: 条件嵌入 [B, cond_dim]（可选）
        """
        B = x.shape[0]
        
        # Patch 嵌入 + 位置编码
        patches = self.patch_embed(x)  # [B, dim, H/P, W/P]
        patches = patches.flatten(2).transpose(1, 2)  # [B, N, dim]
        patches = patches + self.pos_embed
        
        # 条件嵌入
        c = self.cond_embed(t)
        
        # Transformer 块
        for block in self.blocks:
            patches = block(patches, c)
        
        # 输出
        patches = self.final_norm(patches)
        output = self.output_proj(patches)  # [B, N, P*P*C]
        
        # 重组为空间形状
        P = self.patch_size
        C = x.shape[1]
        H = W = self.input_size // P
        output = output.reshape(B, H, W, P, P, C)
        output = output.permute(0, 5, 1, 3, 2, 4).reshape(B, C, H * P, W * P)
        
        return output
```

### 九、Flow Matching——简化的训练范式

2022-2024年，Flow Matching 作为扩散模型的替代训练框架出现，被 Stable Diffusion 3、Flux 等最新模型采用。它用连续标准化流（CNF）替代 DDPM 的离散马尔可夫链。

```python
"""
Flow Matching 核心概念

与 DDPM 的对比：
- DDPM：训练模型预测噪声 ε，采样时从噪声逐步去噪
- Flow Matching：训练模型学习向量场 v_t，采样时沿向量场积分

优势：
- 训练目标更简单（不需要噪声调度）
- 采样路径更直（理论上更少的步数）
- 与扩散模型等价但更灵活
"""

class FlowMatching:
    """
    最简形式的 Flow Matching
    
    核心公式：
    x_t = (1 - t) * x_0 + t * x_1
    
    其中 x_0 ~ 数据分布，x_1 ~ 噪声分布（标准高斯）
    t ~ Uniform(0, 1)
    
    目标：学习向量场 v_θ(x_t, t) 使得 dx/dt = v_θ
    """
    
    def __init__(self, model: nn.Module, sigma_min: float = 1e-4):
        self.model = model
        self.sigma_min = sigma_min
    
    def compute_loss(self, x_0: torch.Tensor) -> torch.Tensor:
        """
        Flow Matching 训练损失
        
        与 DDPM 的关键区别：
        - 不需要预定义噪声调度
        - 不需要 T 步训练，只需连续时间 t ∈ [0, 1]
        - 损失直接回归向量场
        
        参数：
            x_0: 真实数据样本
        """
        batch_size = x_0.shape[0]
        device = x_0.device
        
        # 从标准高斯采样噪声
        x_1 = torch.randn_like(x_0)
        
        # 随机采样时间
        t = torch.rand(batch_size, device=device)
        
        # 线性插值（最优传输路径）
        t_shape = t.reshape(-1, *((1,) * (x_0.ndim - 1)))
        x_t = (1 - t_shape) * x_0 + t_shape * x_1
        
        # 目标向量场：从 x_t 指向 x_1 的方向
        target_v = x_1 - x_0
        
        # 模型预测向量场
        predicted_v = self.model(x_t, t)
        
        # 损失
        loss = nn.functional.mse_loss(predicted_v, target_v)
        
        return loss
    
    @torch.no_grad()
    def sample(self, shape: tuple, num_steps: int = 50, 
               device: str = 'cpu') -> torch.Tensor:
        """
        Euler 方法沿向量场积分
        
        从 x_1（噪声）到 x_0（数据）
        """
        dt = 1.0 / num_steps
        x = torch.randn(shape, device=device)  # x_1
        
        for i in range(num_steps):
            t = torch.full((shape[0],), 1.0 - i * dt, device=device)
            v = self.model(x, t)
            x = x - dt * v  # 注意是减，因为从 t=1 到 t=0
        
        return x
```

## 完整可运行的 Python 代码示例

```python
"""
扩散模型完整演示
从零实现 DDPM 训练和生成，在 MNIST 上运行

运行方法：
    python diffusion_demo.py

依赖：pip install torch torchvision numpy tqdm matplotlib
"""

import torch
import torch.nn as nn
import torch.nn.functional as F
from torch.utils.data import DataLoader
from torchvision import transforms, datasets
import numpy as np
import math
from tqdm import tqdm
from typing import Tuple, Optional
import copy


# ========== 组件1：噪声调度器 ==========

class NoiseScheduler:
    """管理所有噪声调度的预计算系数"""
    
    def __init__(self, num_timesteps: int = 1000, 
                 beta_start: float = 1e-4, 
                 beta_end: float = 0.02):
        self.num_timesteps = num_timesteps
        self.betas = torch.linspace(beta_start, beta_end, num_timesteps)
        self.alphas = 1.0 - self.betas
        self.alphas_cumprod = torch.cumprod(self.alphas, dim=0)
        self.alphas_cumprod_prev = F.pad(self.alphas_cumprod[:-1], (1, 0), value=1.0)
        
        # 前向采样系数
        self.sqrt_alphas_cumprod = torch.sqrt(self.alphas_cumprod)
        self.sqrt_one_minus_alphas_cumprod = torch.sqrt(1.0 - self.alphas_cumprod)
        
        # 反向采样系数
        self.sqrt_recip_alphas = torch.sqrt(1.0 / self.alphas)
        self.posterior_variance = (
            self.betas * (1.0 - self.alphas_cumprod_prev) / 
            (1.0 - self.alphas_cumprod)
        )
    
    def add_noise(self, x_0: torch.Tensor, t: torch.Tensor, 
                  noise: torch.Tensor = None) -> torch.Tensor:
        """前向加噪：x_t = √ᾱ_t * x_0 + √(1-ᾱ_t) * ε"""
        if noise is None:
            noise = torch.randn_like(x_0)
        sqrt_a = self._gather(self.sqrt_alphas_cumprod, t, x_0.shape)
        sqrt_1ma = self._gather(self.sqrt_one_minus_alphas_cumprod, t, x_0.shape)
        return sqrt_a * x_0 + sqrt_1ma * noise
    
    def _gather(self, a: torch.Tensor, t: torch.Tensor, shape: tuple) -> torch.Tensor:
        b = t.shape[0]
        out = a.gather(-1, t)
        return out.reshape(b, *((1,) * (len(shape) - 1)))


# ========== 组件2：简化 U-Net ==========

class TimeEmbedding(nn.Module):
    def __init__(self, dim: int):
        super().__init__()
        self.dim = dim
        self.mlp = nn.Sequential(
            nn.Linear(dim, dim * 4),
            nn.SiLU(),
            nn.Linear(dim * 4, dim * 4)
        )
    
    def forward(self, t: torch.Tensor) -> torch.Tensor:
        half = self.dim // 2
        freqs = torch.exp(-math.log(10000) * torch.arange(half, device=t.device) / half)
        args = t[:, None].float() * freqs[None]
        emb = torch.cat([torch.cos(args), torch.sin(args)], dim=-1)
        return self.mlp(emb)


class ConvBlock(nn.Module):
    def __init__(self, in_ch: int, out_ch: int, time_dim: int):
        super().__init__()
        self.conv1 = nn.Sequential(
            nn.GroupNorm(8, in_ch), nn.SiLU(),
            nn.Conv2d(in_ch, out_ch, 3, padding=1)
        )
        self.time_proj = nn.Linear(time_dim, out_ch)
        self.conv2 = nn.Sequential(
            nn.GroupNorm(8, out_ch), nn.SiLU(),
            nn.Conv2d(out_ch, out_ch, 3, padding=1)
        )
        self.shortcut = nn.Conv2d(in_ch, out_ch, 1) if in_ch != out_ch else nn.Identity()
    
    def forward(self, x: torch.Tensor, t: torch.Tensor) -> torch.Tensor:
        h = self.conv1(x)
        h = h + self.time_proj(t)[:, :, None, None]
        h = self.conv2(h)
        return h + self.shortcut(x)


class MiniUNet(nn.Module):
    """精简版 U-Net，适合 MNIST 演示"""
    def __init__(self, channels: int = 1, base: int = 32):
        super().__init__()
        td = base * 4
        self.time_emb = TimeEmbedding(base)
        
        # 编码器
        self.enc1 = ConvBlock(channels, base, td)
        self.enc2 = ConvBlock(base, base * 2, td)
        self.enc3 = ConvBlock(base * 2, base * 4, td)
        self.pool = nn.MaxPool2d(2)
        
        # 瓶颈
        self.bottleneck = ConvBlock(base * 4, base * 8, td)
        
        # 解码器
        self.up3 = nn.ConvTranspose2d(base * 8, base * 4, 2, 2)
        self.dec3 = ConvBlock(base * 8, base * 4, td)
        self.up2 = nn.ConvTranspose2d(base * 4, base * 2, 2, 2)
        self.dec2 = ConvBlock(base * 4, base * 2, td)
        self.up1 = nn.ConvTranspose2d(base * 2, base, 2, 2)
        self.dec1 = ConvBlock(base * 2, base, td)
        
        self.out = nn.Conv2d(base, channels, 1)
    
    def forward(self, x: torch.Tensor, t: torch.Tensor) -> torch.Tensor:
        t_emb = self.time_emb(t)
        e1 = self.enc1(x, t_emb)
        e2 = self.enc2(self.pool(e1), t_emb)
        e3 = self.enc3(self.pool(e2), t_emb)
        b = self.bottleneck(self.pool(e3), t_emb)
        d3 = self.dec3(torch.cat([self.up3(b), e3], 1), t_emb)
        d2 = self.dec2(torch.cat([self.up2(d3), e2], 1), t_emb)
        d1 = self.dec1(torch.cat([self.up1(d2), e1], 1), t_emb)
        return self.out(d1)


# ========== 组件3：训练 ==========

def train_ddpm(num_epochs: int = 30, batch_size: int = 128, 
               device: str = 'cpu'):
    """完整训练流程"""
    scheduler = NoiseScheduler(num_timesteps=1000)
    model = MiniUNet(channels=1, base=32).to(device)
    optimizer = torch.optim.AdamW(model.parameters(), lr=2e-4)
    
    transform = transforms.Compose([
        transforms.Resize(32),
        transforms.ToTensor(),
        transforms.Normalize([0.5], [0.5])
    ])
    dataset = datasets.MNIST('./data', train=True, download=True, transform=transform)
    loader = DataLoader(dataset, batch_size=batch_size, shuffle=True, num_workers=0)
    
    ema_model = copy.deepcopy(model)
    ema_decay = 0.999
    
    for epoch in range(num_epochs):
        model.train()
        total_loss = 0
        
        for batch, _ in tqdm(loader, desc=f"Epoch {epoch+1}/{num_epochs}"):
            batch = batch.to(device)
            bs = batch.shape[0]
            
            t = torch.randint(0, 1000, (bs,), device=device)
            noise = torch.randn_like(batch)
            x_t = scheduler.add_noise(batch, t, noise)
            
            pred_noise = model(x_t, t)
            loss = F.mse_loss(pred_noise, noise)
            
            optimizer.zero_grad()
            loss.backward()
            nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            optimizer.step()
            
            # EMA 更新
            with torch.no_grad():
                for p_ema, p in zip(ema_model.parameters(), model.parameters()):
                    p_ema.data.mul_(ema_decay).add_(p.data, alpha=1 - ema_decay)
            
            total_loss += loss.item()
        
        avg_loss = total_loss / len(loader)
        print(f"Epoch {epoch+1}: loss = {avg_loss:.4f}")
    
    return ema_model, scheduler


# ========== 组件4：采样 ==========

@torch.no_grad()
def generate(model: nn.Module, scheduler: NoiseScheduler,
             num_images: int = 16, device: str = 'cpu') -> torch.Tensor:
    """DDPM 采样：从纯噪声逐步生成图像"""
    model.eval()
    x = torch.randn(num_images, 1, 32, 32, device=device)
    
    for t_val in tqdm(reversed(range(1000)), desc="Sampling"):
        t = torch.full((num_images,), t_val, device=device, dtype=torch.long)
        
        pred = model(x, t)
        
        # 去噪均值
        beta_t = scheduler.betas[t_val]
        sqrt_1ma_t = scheduler.sqrt_one_minus_alphas_cumprod[t_val]
        sqrt_ra_t = scheduler.sqrt_recip_alphas[t_val]
        
        mean = sqrt_ra_t * (x - beta_t / sqrt_1ma_t * pred)
        
        if t_val > 0:
            sigma = torch.sqrt(scheduler.posterior_variance[t_val])
            x = mean + sigma * torch.randn_like(x)
        else:
            x = mean
    
    return (x + 1) / 2  # [-1,1] -> [0,1]


if __name__ == "__main__":
    device = 'cuda' if torch.cuda.is_available() else 'cpu'
    print(f"训练设备: {device}")
    print("开始训练 DDPM...")
    model, scheduler = train_ddpm(num_epochs=5, device=device)
    print("生成样本...")
    samples = generate(model, scheduler, num_images=4, device=device)
    print(f"生成完成！输出形状: {samples.shape}")
    print(f"像素值范围: [{samples.min():.3f}, {samples.max():.3f}]")
```

## 真实案例

### 案例1：Stable Diffusion 的工程实现

Stable Diffusion 1.5（2022年）的架构参数：

| 组件 | 参数 | 说明 |
|------|------|------|
| VAE Encoder | 34.2M 参数 | 将 512×512×3 压缩到 64×64×4 |
| VAE Decoder | 49.5M 参数 | 将 64×64×4 还原到 512×512×3 |
| CLIP Text Encoder | 123.7M 参数 | 将文本编码为 77×768 嵌入 |
| U-Net | 860.6M 参数 | 核心去噪网络，含交叉注意力层 |
| 总计 | ~1068M 参数 | ~1B 参数规模 |

关键设计决策：
- **潜在空间维度**：4 通道（不是 3 或 8），平衡压缩率和重建质量
- **下采样倍率**：8×（512→64），这是效率和质量的最优折中
- **CFG Scale**：默认 7.5，范围 1-20，越大越符合文本但多样性降低

### 案例2：Sora（OpenAI，2024）

Sora 使用 DiT（Diffusion Transformer）架构，核心改进：
- **时空 Patch**：将视频切分为 3D 时空 Patch（类似 ViT 的 2D Patch 扩展到 3D）
- **可变分辨率**：支持不同分辨率和时长，通过 Patch 化统一处理
- **规模效应**：随着计算量增加，视频质量持续提升（没有明显的饱和点）

### 案例3：Stable Diffusion 3（Stability AI，2024-2025）

SD3 的三大改进：
- **Flow Matching** 替代 DDPM 的训练目标，训练更稳定
- **MMDiT（Multimodal DiT）**：文本和图像使用不同的权重，通过交叉注意力交互
- **T5 文本编码器**：配合 CLIP，增强对复杂文本的理解

### 案例4：Flux（Black Forest Labs，2024）

Flux 由 Stable Diffusion 原始团队创建：
- **Rectified Flow**：Flow Matching 的变体，采样路径更直
- **12B 参数**的 DiT 架构
- 支持多种分辨率和宽高比
- 在 4 步采样下即可产生高质量图像

## 权衡

### 扩散模型 vs GAN

| 维度 | 扩散模型 | GAN |
|------|---------|-----|
| 训练稳定性 | 高（固定的前向过程，损失明确） | 低（对抗训练不稳定） |
| 生成质量 | 高（逐步精修） | 中-高（单次前向） |
| 多样性 | 高（覆盖数据分布的多个模式） | 低（容易模式崩塌） |
| 采样速度 | 慢（需要多步迭代，10-1000 步） | 快（单步前向） |
| 可控性 | 高（CFG、ControlNet 等方法） | 中（需要精心设计条件） |
| 理论基础 | 强（变分推断、SDE 有清晰推导） | 弱（训练动态缺乏理论保证） |

### 采样步数 vs 生成质量

| 步数 | 方法 | 速度 | 质量（FID↓） |
|------|------|------|-------------|
| 1000 | DDPM | 很慢 | 3.17（CIFAR-10） |
| 50 | DDIM | 中等 | 4.67 |
| 20 | DPM-Solver | 快 | 5.12 |
| 8 | LCM | 很快 | 7.84 |
| 4 | Consistency Model | 极快 | 8.56 |
| 1 | Consistency Model | 最快 | 12.43 |

### 模型规模 vs 训练成本

- SD 1.5（~1B 参数）：训练成本约 15,000 A100 GPU 天
- SDXL（~2.6B 参数）：训练成本约 50,000 A100 GPU 天
- SD3（~8B 参数）：训练成本估计 200,000+ A100 GPU 天
- Sora（未公开）：估计在数十万 GPU 天级别

## 要点总结

1. **扩散模型的本质**：通过"加噪声→学习去噪声"来建模数据分布。前向过程是固定的加噪过程，反向过程由神经网络学习。

2. **从数学到代码的关键路径**：
   - 重参数化技巧 → 任意时刻的闭式采样
   - 后验分布的推导 → 预测噪声（而非预测原始图像）
   - 简化损失 L_simple = E[‖ε - ε_θ(x_t, t)‖²] → 训练目标
   - 反向采样循环 → 从噪声生成图像

3. **Stable Diffusion 的三大创新**：
   - VAE 压缩到潜在空间（降低 48 倍计算量）
   - CLIP 文本条件 + 交叉注意力（文字控制生成）
   - 无分类器引导 CFG（平衡多样性和条件遵循）

4. **架构演进**：U-Net → DiT（Transformer），DDPM → Flow Matching。核心趋势是向 Transformer 靠拢、训练目标简化。

5. **前沿方向**：单步/少步生成（Consistency Models、LCM）、视频生成（Sora）、3D 生成、Flow Matching 替代扩散框架。

## 延伸阅读

**基础论文**：
- Ho, Jain, & Abbeel. "Denoising Diffusion Probabilistic Models." NeurIPS 2020. — DDPM 原始论文，整个领域的奠基之作
- Song, Meng, & Ermon. "Denoising Diffusion Implicit Models." ICLR 2021. — DDIM，将采样步数从 1000 减到 50 以下
- Nichol & Dhariwal. "Improved Denoising Diffusion Probabilistic Models." ICML 2021. — cosine 调度、学习方差

**潜在扩散与条件生成**：
- Rombach et al. "High-Resolution Image Synthesis with Latent Diffusion Models." CVPR 2022. — Stable Diffusion 的理论基础
- Ho & Salimans. "Classifier-Free Diffusion Guidance." NeurIPS Workshop 2021. — CFG，最重要的条件控制技术
- Zhang et al. "Adding Conditional Control to Text-to-Image Diffusion Models." ICCV 2023. — ControlNet

**架构演进**：
- Peebles & Xie. "Scalable Diffusion Models with Transformers." ICCV 2023. — DiT，用 Transformer 替代 U-Net
- "From U-Nets to DiTs: The Architectural Evolution of Text-to-Image Diffusion Models." ICLR Blog 2026. — 架构演变的全面综述

**前沿**：
- Song et al. "Consistency Models." ICML 2023. — 单步生成的突破
- Lipman et al. "Flow Matching for Generative Modeling." ICLR 2023. — Flow Matching 框架
- MIT 6.S184. "Flow Matching and Diffusion Models." 2026. — MIT 最新课程讲义

**教程与博客**：
- Lilian Weng. "What Are Diffusion Models?" (2021, updated 2024). — 最全面的扩散模型综述博客
- Hugging Face. "The Annotated Diffusion Model." (2022). — 逐行代码解读 DDPM
- Sander Dieleman. "Noise Schedules Considered Harmful." (2024). — 对噪声调度的深入反思
- AI Summer. "Diffusion Models: Toward State-of-the-Art Image Generation." (2022). — 从零推导 DDPM 的数学

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
