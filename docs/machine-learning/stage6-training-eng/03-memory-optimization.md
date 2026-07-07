# 显存优化与混合精度：FP16/BF16/梯度累加/激活重计算——显存不够怎么办

<!--
调研来源：
1. NVIDIA "Mixed Precision Training" 官方文档 — 混合精度训练的权威指南，涵盖FP16/BF16/FP8
2. "Mixed Precision Training" (Micikevicius et al., 2018, NVIDIA) — 混合精度训练的原始论文，loss scaling机制
3. PyTorch混合精度文档 (torch.amp) — PyTorch原生AMP的使用方法
4. "Memory Efficient Mixed Precision Optimizers" (arxiv, 2024) — 内存高效的优化器设计
5. "Training Deep Nets with Sublinear Memory Cost" (Chen et al., 2016) — 激活重计算（gradient checkpointing）的原始论文
6. Hugging Face Transformers训练指南 — 混合精度、梯度累加的实践指南

核心发现：BF16已成为2024-2026年LLM训练的主流精度格式，因为它与FP32有相同的动态范围，不需要loss scaling。激活重计算（gradient checkpointing）可将激活值显存从O(n)降到O(sqrt(n))，代价是额外33%的前向计算。梯度累加是零额外显存成本增大有效batch size的标准方法。
-->

**TL;DR：** 显存是训练大模型时最常遇到的瓶颈。本文讲解混合精度训练（FP16/BF16）、梯度累加、激活重计算（gradient checkpointing）三大显存优化技术，帮助你在有限的GPU上训练更大的模型。

## 为什么这很重要

一个残酷的现实：**你的模型太大了，GPU放不下。**

以LLaMA-2-7B为例，全量参数训练需要的显存：

| 组件 | FP32 | FP16/BF16混合精度 |
|------|------|------------------|
| 模型参数 | 28GB | 14GB |
| 梯度 | 28GB | 14GB |
| Adam优化器状态 | 84GB | 56GB (FP32 master copy + 动量 + 方差) |
| 激活值 (batch=4, seq=2048) | ~20GB | ~10GB |
| **合计** | **~160GB** | **~94GB** |

即使使用混合精度，7B模型的全量训练仍然需要约94GB显存。而一张RTX 4090只有24GB，一张A100-80GB也只有80GB。

但如果你不使用任何优化技术，实际需要的显存会更多。因为还有各种临时缓冲区、CUDA内存碎片等额外的开销。

显存优化技术能让你：

1. **在更小的GPU上训练更大的模型**：通过混合精度将参数从FP32降到FP16，显存直接减半
2. **用时间换空间**：通过梯度累加和激活重计算，在不增加显存的情况下使用更大的有效batch size
3. **推迟"显存墙"的到来**：当你的模型刚好超出GPU显存一点点时，这些技术可能就是"够"和"不够"的区别

## 核心概念

### 浮点数格式

计算机中的浮点数由三部分组成：符号位、指数位、尾数位。

```
FP32 (Single Precision): 1位符号 + 8位指数 + 23位尾数 = 32位
  动态范围: ~10^-38 到 ~10^38
  精度: ~7位有效数字

FP16 (Half Precision): 1位符号 + 5位指数 + 10位尾数 = 16位
  动态范围: ~10^-8 到 ~65504
  精度: ~3位有效数字
  问题: 动态范围太小，容易溢出或下溢

BF16 (Brain Float): 1位符号 + 8位指数 + 7位尾数 = 16位
  动态范围: 与FP32相同 (~10^-38 到 ~10^38)
  精度: ~2位有效数字
  优势: 动态范围与FP32相同，不容易溢出

FP8 (NVIDIA H100+): 
  E4M3: 1位符号 + 4位指数 + 3位尾数 (前向传播)
  E5M2: 1位符号 + 5位指数 + 2位尾数 (反向传播)
  优势: 显存再减半，训练速度再翻倍
  限制: 仅在H100及更新GPU上支持
```

**关键理解**：BF16的设计思想是"用精度换范围"。与FP16相比，BF16牺牲了3位尾数（精度更低），但多了3位指数（动态范围与FP32完全相同）。这意味着BF16几乎不会出现数值溢出的问题，使得训练过程更加稳定。

### 混合精度训练的核心思想

混合精度训练不是简单地把所有计算都换成低精度。它的核心是**"混合"**——在不同的计算阶段使用不同的精度：

```
┌────────────────────────────────────────────────────┐
│ 混合精度训练流程                                     │
│                                                     │
│ 1. 参数以FP32存储（master copy）                      │
│                                                     │
│ 2. 前向传播：FP32参数 → 转换为FP16/BF16 → 计算        │
│    所有矩阵乘法用FP16/BF16（快，省显存）               │
│                                                     │
│ 3. Loss计算：FP16/BF16 → 转换为FP32 → 计算Loss        │
│    （防止精度损失）                                    │
│                                                     │
│ 4. Loss Scaling（仅FP16需要）:                       │
│    Loss × scale_factor → 反向传播 → 梯度/scale_factor │
│    防止小梯度在FP16下下溢到零                          │
│                                                     │
│ 5. 反向传播：FP16/BF16计算梯度                        │
│                                                     │
│ 6. 优化器更新：FP16梯度 → 转换为FP32 → 更新FP32参数    │
│    参数更新必须在FP32下进行（保证精度）                  │
│                                                     │
│ 7. FP32参数 → 转换为FP16 → 用于下一步的前向传播        │
└────────────────────────────────────────────────────┘
```

### 梯度累加的核心思想

梯度累加是把一个大batch拆成多个小batch，逐步累加梯度，最后一起更新参数：

```
正常训练 (batch_size=32):
  前向(batch_32) → 反向 → 更新参数
  显存需求: 32个样本的激活值

梯度累加 (accumulation_steps=4):
  步骤1: 前向(batch_8) → 反向 → 梯度累加到buffer
  步骤2: 前向(batch_8) → 反向 → 梯度累加到buffer
  步骤3: 前向(batch_8) → 反向 → 梯度累加到buffer
  步骤4: 前向(batch_8) → 反向 → 梯度累加到buffer
  → 梯度buffer / 4 → 更新参数
  
  效果等同于batch_size=32
  但显存需求: 只需要8个样本的激活值
```

### 激活重计算的核心思想

正常训练时，前向传播会把所有中间结果（激活值）保存下来，供反向传播使用。这些激活值占用大量显存。

激活重计算（也叫gradient checkpointing）的做法是：前向传播时只保存部分关键节点的激活值，反向传播需要用到被丢弃的激活值时，重新计算一遍。

```
正常训练:
  Layer 0 → [保存激活0] → Layer 1 → [保存激活1] → ... → Layer N → [保存激活N]
  反向: 直接使用保存的激活值
  显存: O(N) 个激活值

激活重计算:
  Layer 0 → [保存激活0] → Layer 1 → [丢弃] → Layer 2 → [保存激活2] → ...
  反向: 需要Layer 1的激活时，从Layer 0重新计算到Layer 1
  显存: O(sqrt(N)) 个激活值
  代价: 额外约33%的前向计算时间
```

## 工作原理（简化的心智模型）

### 用搬家来理解显存优化

把GPU显存想象成一个储物间，你要把一个巨大的模型搬进去。

**混合精度** = 把所有的衣服用真空压缩袋装起来。原本一衣柜的衣服（FP32参数），压缩后只占半个衣柜（FP16/BF16）。但你不把所有的衣服都压缩——贵重的大衣（优化器中的FP32 master copy）保持原样，因为你需要它来保证下次穿的时候形状正确（参数更新精度）。

**梯度累加** = 你要搬32箱东西，但储物间一次只能放8箱。那就分4趟搬：每次搬8箱，记住每箱的位置（累加梯度），4趟全搬完后一次性整理（更新参数）。

**激活重计算** = 你有一个装满笔记的文件柜（激活值），但储物间放不下。你决定只保留每4章的摘要（checkpoint），其他笔记扔掉。需要某章的详细内容时，从最近的摘要开始重新写（重新计算）。多花了写笔记的时间（33%额外计算），但省了大量的文件柜空间。

## 工作原理（详细机制）

### 一、混合精度训练

#### 1.1 FP16混合精度（需要Loss Scaling）

FP16的问题在于它的动态范围太小：最大值只有65504，最小正值约6e-8。在反向传播中，很多梯度值可能小于6e-8，直接变成0（下溢）。一旦梯度变成0，参数就不会更新——模型停止学习。

Loss Scaling的解决方案：在反向传播前，先把Loss乘以一个大的常数（比如65536）。这样所有的梯度也被放大了65536倍，不会下溢。反向传播完成后，再把梯度除以65536，恢复正常大小。

```python
"""
FP16混合精度训练的概念实现
展示loss scaling机制
"""
import numpy as np

class FP16MixedPrecision:
    """
    FP16混合精度训练的简化实现
    展示loss scaling如何防止梯度下溢
    """
    
    def __init__(self, init_scale: float = 2**16, growth_interval: int = 2000):
        self.scale = init_scale
        self.growth_interval = growth_interval
        self.steps_since_growth = 0
        
        # FP16的范围
        self.fp16_max = 65504.0
        self.fp16_min_positive = 6e-8
    
    def simulate_fp16(self, value: float) -> float:
        """模拟FP16的精度损失"""
        # 模拟FP16的量化
        if abs(value) < self.fp16_min_positive:
            return 0.0  # 下溢到零
        if abs(value) > self.fp16_max:
            return np.sign(value) * np.inf  # 上溢到无穷
        # 模拟10位尾数的精度（约3位有效数字）
        mantissa_bits = 10
        if value != 0:
            exp = np.floor(np.log2(abs(value)))
            mantissa = value / (2 ** exp)
            quantized = round(mantissa * (2 ** mantissa_bits)) / (2 ** mantissa_bits)
            value = quantized * (2 ** exp)
        return value
    
    def backward_with_scaling(self, loss: float, grad_fn) -> tuple:
        """
        带loss scaling的反向传播
        
        1. loss × scale
        2. 反向传播（梯度也被scale放大）
        3. 梯度 / scale
        """
        # Step 1: Scale the loss
        scaled_loss = loss * self.scale
        
        # Step 2: Compute gradients on scaled loss
        scaled_grad = grad_fn(scaled_loss)
        
        # Step 3: Unscale the gradients
        unscaled_grad = scaled_grad / self.scale
        
        # Step 4: Check for inf/nan in gradients
        grad_has_inf = np.any(np.isinf(scaled_grad)) or np.any(np.isnan(scaled_grad))
        
        if grad_has_inf:
            # 梯度溢出了，跳过这步，减小scale
            self.scale /= 2
            self.steps_since_growth = 0
            return None, True  # 返回None表示跳过更新
        
        # 正常情况，增大scale（如果连续N步都没有溢出）
        self.steps_since_growth += 1
        if self.steps_since_growth >= self.growth_interval:
            self.scale *= 2
            self.steps_since_growth = 0
        
        return unscaled_grad, False

# 演示loss scaling的必要性
np.random.seed(42)

fp16_mp = FP16MixedPrecision()

print("FP16混合精度训练演示")
print(f"FP16范围: [{fp16_mp.fp16_min_positive}, {fp16_mp.fp16_max}]")
print(f"初始scale: {fp16_mp.scale}")

# 模拟小梯度的情况
small_gradients = np.array([1e-10, 1e-9, 1e-8, 1e-7, 1e-6])

print(f"\n原始梯度: {small_gradients}")

# 不使用loss scaling（直接转换为FP16）
fp16_gradients_no_scaling = np.array([fp16_mp.simulate_fp16(g) for g in small_gradients])
print(f"无loss scaling的FP16梯度: {fp16_gradients_no_scaling}")
print(f"  → 前几个梯度下溢为0！模型学不到东西")

# 使用loss scaling
scaled_gradients = small_gradients * fp16_mp.scale
fp16_gradients_scaled = np.array([fp16_mp.simulate_fp16(g) for g in scaled_gradients])
unscaled_gradients = fp16_gradients_scaled / fp16_mp.scale
print(f"\n有loss scaling:")
print(f"  放大后: {scaled_gradients}")
print(f"  FP16量化后: {fp16_gradients_scaled}")
print(f"  缩小回来: {unscaled_gradients}")
print(f"  → 所有梯度都保留了有效值！")
```

#### 1.2 BF16混合精度（不需要Loss Scaling）

BF16的指数位与FP32相同（8位），动态范围完全一样。这意味着BF16几乎不会出现梯度下溢的问题，因此不需要loss scaling。

```python
"""
BF16 vs FP16 的数值范围对比
"""
import numpy as np

def analyze_float_format(name: str, exp_bits: int, mantissa_bits: int, total_bits: int):
    """分析浮点数格式的范围和精度"""
    max_exp = 2 ** (exp_bits - 1) - 1
    min_exp = -(2 ** (exp_bits - 1) - 1) + 1  # 简化，忽略subnormal
    
    max_value = (2 - 2**(-mantissa_bits)) * 2**max_exp
    min_positive = 2**min_exp
    
    # 有效数字位数
    significant_digits = mantissa_bits * np.log10(2)
    
    print(f"\n{name} ({total_bits}位):")
    print(f"  符号位: 1, 指数位: {exp_bits}, 尾数位: {mantissa_bits}")
    print(f"  最大值: {max_value:.2e}")
    print(f"  最小正值: {min_positive:.2e}")
    print(f"  动态范围: {max_value/min_positive:.2e}")
    print(f"  有效数字: ~{significant_digits:.1f}位")
    
    return {
        'max_value': max_value,
        'min_positive': min_positive,
        'significant_digits': significant_digits,
    }

print("=" * 60)
print("浮点数格式对比")
print("=" * 60)

fp32 = analyze_float_format("FP32", 8, 23, 32)
fp16 = analyze_float_format("FP16", 5, 10, 16)
bf16 = analyze_float_format("BF16", 8, 7, 16)

print(f"\n{'='*60}")
print(f"关键对比:")
print(f"  FP16 vs FP32: 动态范围缩小了 {fp32['max_value']/fp32['min_positive'] / (fp16['max_value']/fp16['min_positive']):.0e} 倍")
print(f"  BF16 vs FP32: 动态范围 {'相同' if bf16['max_value'] == fp32['max_value'] else '不同'}")
print(f"  BF16 vs FP16: BF16精度更低（{bf16['significant_digits']:.1f} vs {fp16['significant_digits']:.1f}位），但范围大得多")
print(f"\n  结论: BF16不需要loss scaling，训练更稳定；FP16精度更高，但需要loss scaling")
```

#### 1.3 PyTorch混合精度训练

```python
"""
PyTorch原生混合精度训练示例
使用torch.amp（Automatic Mixed Precision）
"""

import torch
import torch.nn as nn
from torch.amp import autocast, GradScaler

class TransformerBlock(nn.Module):
    def __init__(self, dim=768, n_heads=12):
        super().__init__()
        self.attention = nn.MultiheadAttention(dim, n_heads, batch_first=True)
        self.ffn = nn.Sequential(
            nn.Linear(dim, dim * 4),
            nn.GELU(),
            nn.Linear(dim * 4, dim),
        )
        self.ln1 = nn.LayerNorm(dim)
        self.ln2 = nn.LayerNorm(dim)
    
    def forward(self, x):
        residual = x
        x = self.ln1(x)
        x, _ = self.attention(x, x, x)
        x = residual + x
        residual = x
        x = self.ln2(x)
        x = self.ffn(x)
        x = residual + x
        return x

class SimpleLLM(nn.Module):
    def __init__(self, vocab_size=32000, dim=768, n_layers=12, n_heads=12):
        super().__init__()
        self.embedding = nn.Embedding(vocab_size, dim)
        self.layers = nn.ModuleList([
            TransformerBlock(dim, n_heads) for _ in range(n_layers)
        ])
        self.ln_f = nn.LayerNorm(dim)
        self.head = nn.Linear(dim, vocab_size, bias=False)
    
    def forward(self, input_ids):
        x = self.embedding(input_ids)
        for layer in self.layers:
            x = layer(x)
        x = self.ln_f(x)
        return self.head(x)

def train_with_amp():
    """使用混合精度训练"""
    device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    
    model = SimpleLLM(vocab_size=32000, dim=768, n_layers=12, n_heads=12).to(device)
    
    # 统计模型参数量
    total_params = sum(p.numel() for p in model.parameters())
    print(f"模型参数量: {total_params / 1e6:.1f}M")
    
    # === FP16混合精度 ===
    # 需要GradScaler来处理loss scaling
    scaler_fp16 = GradScaler('cuda')
    
    optimizer = torch.optim.AdamW(model.parameters(), lr=1e-4)
    
    print("\n=== FP16 混合精度训练 ===")
    for step in range(5):
        input_ids = torch.randint(0, 32000, (4, 512)).to(device)
        
        optimizer.zero_grad()
        
        # autocast: 自动选择哪些操作用FP16，哪些保持FP32
        with autocast('cuda', dtype=torch.float16):
            logits = model(input_ids)
            loss = nn.functional.cross_entropy(
                logits[:, :-1].reshape(-1, 32000),
                input_ids[:, 1:].reshape(-1)
            )
        
        # scaler.scale: 将loss放大
        scaler_fp16.scale(loss).backward()
        
        # scaler.step: 将梯度缩小回来，然后更新参数
        scaler_fp16.step(optimizer)
        
        # scaler.update: 调整scale factor
        scaler_fp16.update()
        
        if step == 0:
            print(f"  Step {step}: loss = {loss.item():.4f}")
    
    # === BF16混合精度 ===
    # 不需要GradScaler！
    optimizer = torch.optim.AdamW(model.parameters(), lr=1e-4)
    
    print("\n=== BF16 混合精度训练 ===")
    for step in range(5):
        input_ids = torch.randint(0, 32000, (4, 512)).to(device)
        
        optimizer.zero_grad()
        
        # autocast with bf16: 不需要loss scaling
        with autocast('cuda', dtype=torch.bfloat16):
            logits = model(input_ids)
            loss = nn.functional.cross_entropy(
                logits[:, :-1].reshape(-1, 32000),
                input_ids[:, 1:].reshape(-1)
            )
        
        # 直接backward和step，不需要scaler
        loss.backward()
        optimizer.step()
        
        if step == 0:
            print(f"  Step {step}: loss = {loss.item():.4f}")

# 注意：此代码需要CUDA GPU才能运行
if torch.cuda.is_available():
    train_with_amp()
else:
    print("需要CUDA GPU来运行此示例")
    print("\n模拟显存节省估算:")
    params = 100e6  # 100M参数
    print(f"  FP32: {params * 4 / 1e9:.2f} GB")
    print(f"  FP16: {params * 2 / 1e9:.2f} GB")
    print(f"  BF16: {params * 2 / 1e9:.2f} GB")
    print(f"  节省: 50%")
```

### 二、梯度累加

梯度累加是最简单也最安全的显存优化技术——它不改变任何计算逻辑，只是改变了参数更新的频率。

```python
"""
梯度累加的完整实现
展示如何用小batch模拟大batch的训练效果
"""

import torch
import torch.nn as nn
from typing import Optional

class GradientAccumulator:
    """
    梯度累加器
    
    核心原理：
    1. 前向+反向计算梯度，但不更新参数
    2. 梯度会自动累加到.grad属性中（PyTorch默认行为）
    3. 累加N步后，执行一次参数更新
    4. 清空梯度，重复
    
    等效batch_size = micro_batch_size × accumulation_steps
    """
    
    def __init__(self, model: nn.Module, optimizer: torch.optim.Optimizer,
                 accumulation_steps: int = 4, 
                 max_grad_norm: Optional[float] = 1.0):
        self.model = model
        self.optimizer = optimizer
        self.accumulation_steps = accumulation_steps
        self.max_grad_norm = max_grad_norm
        self.current_step = 0
    
    def should_update(self) -> bool:
        """判断是否应该执行参数更新"""
        return (self.current_step + 1) % self.accumulation_steps == 0
    
    def train_step(self, loss: torch.Tensor) -> dict:
        """
        执行一步训练
        
        参数:
            loss: 当前micro-batch的loss
        
        返回:
            训练状态信息
        """
        # 计算归一化的loss
        # 重要：loss要除以accumulation_steps，使得累加后的梯度
        # 等价于使用完整batch计算的梯度
        normalized_loss = loss / self.accumulation_steps
        
        # 反向传播（梯度会自动累加到.grad）
        normalized_loss.backward()
        
        self.current_step += 1
        info = {
            'micro_step': self.current_step,
            'accumulated': not self.should_update(),
        }
        
        if self.should_update():
            # 梯度裁剪
            if self.max_grad_norm is not None:
                grad_norm = torch.nn.utils.clip_grad_norm_(
                    self.model.parameters(), self.max_grad_norm
                )
                info['grad_norm'] = grad_norm.item()
            
            # 参数更新
            self.optimizer.step()
            
            # 清空梯度
            self.optimizer.zero_grad()
            
            info['updated'] = True
        
        return info

# 演示
device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')

# 创建一个简单的模型
model = nn.Sequential(
    nn.Linear(100, 256),
    nn.ReLU(),
    nn.Linear(256, 256),
    nn.ReLU(),
    nn.Linear(256, 10),
).to(device)

optimizer = torch.optim.AdamW(model.parameters(), lr=1e-3)

# 梯度累加：4个micro-batch = 1个有效batch
accumulator = GradientAccumulator(
    model, optimizer,
    accumulation_steps=4,
    max_grad_norm=1.0
)

# 对比：直接用大batch vs 梯度累加
micro_batch_size = 8
effective_batch_size = micro_batch_size * 4  # 32

print("梯度累加训练过程:")
print(f"  Micro batch size: {micro_batch_size}")
print(f"  Accumulation steps: 4")
print(f"  Effective batch size: {effective_batch_size}")
print()

for global_step in range(3):
    for micro_step in range(4):
        # 生成micro-batch数据
        x = torch.randn(micro_batch_size, 100).to(device)
        y = torch.randint(0, 10, (micro_batch_size,)).to(device)
        
        logits = model(x)
        loss = nn.functional.cross_entropy(logits, y)
        
        info = accumulator.train_step(loss)
        
        status = "累积中" if info['accumulated'] else "参数已更新 ✓"
        print(f"  Global step {global_step}, Micro step {micro_step+1}/4: "
              f"loss={loss.item():.4f} [{status}]")
    
    print()
```

#### 梯度累加的注意事项

```python
"""
梯度累加的几个重要注意事项
"""

# 1. Loss归一化
# 错误做法：直接累加loss
# 正确做法：loss / accumulation_steps
# 原因：backward()会把梯度加到.grad上，如果不归一化，累加后的梯度
# 是N个micro-batch梯度的总和，而不是平均值

accumulation_steps = 4

# 错误：
# loss.backward()  # 累加4次后，梯度是4倍

# 正确：
# (loss / accumulation_steps).backward()  # 累加4次后，梯度是1倍（平均）

# 2. BatchNorm的行为
# 使用梯度累加时，BatchNorm的统计量（running mean/var）是基于micro-batch计算的
# 而不是基于整个有效batch。这可能导致训练和推理时的统计量不一致。
# 解决方案：
#   - 使用GroupNorm或LayerNorm替代BatchNorm
#   - 或者将BatchNorm设为eval模式，使用固定的统计量

# 3. 学习率调度
# 学习率调度器应该按"有效step"（参数更新次数）来调度，而不是micro-step
# 在Hugging Face Trainer中，这已经自动处理了

# 4. 与DDP/FSDP配合
# 当使用DDP时，需要在no_sync上下文中进行累加，避免每步都同步梯度
# 在最后一步才同步

print("梯度累加注意事项:")
print("1. Loss要除以accumulation_steps")
print("2. BatchNorm的统计量基于micro-batch（建议用LayerNorm）")
print("3. 学习率调度按有效step调度")
print("4. DDP模式下使用no_sync减少通信")
```

### 三、激活重计算（Gradient Checkpointing）

激活重计算是"用时间换空间"的经典技术。

```python
"""
激活重计算的原理实现
"""
import torch
import torch.nn as nn
from torch.utils.checkpoint import checkpoint

class CheckpointedTransformerBlock(nn.Module):
    """
    支持梯度检查点的Transformer块
    
    当use_checkpoint=True时：
    - 前向传播不保存中间激活值
    - 反向传播时重新计算需要的激活值
    - 显存从O(n)降到O(sqrt(n))
    - 代价：额外约33%的前向计算时间
    """
    
    def __init__(self, dim=768, n_heads=12, use_checkpoint=False):
        super().__init__()
        self.use_checkpoint = use_checkpoint
        self.attention = nn.MultiheadAttention(dim, n_heads, batch_first=True)
        self.ffn = nn.Sequential(
            nn.Linear(dim, dim * 4),
            nn.GELU(),
            nn.Linear(dim * 4, dim),
        )
        self.ln1 = nn.LayerNorm(dim)
        self.ln2 = nn.LayerNorm(dim)
    
    def _forward(self, x):
        """实际的前向计算"""
        residual = x
        x = self.ln1(x)
        x, _ = self.attention(x, x, x)
        x = residual + x
        residual = x
        x = self.ln2(x)
        x = self.ffn(x)
        x = residual + x
        return x
    
    def forward(self, x):
        if self.use_checkpoint and self.training:
            # 使用gradient checkpointing
            # PyTorch会自动处理前向/重计算逻辑
            return checkpoint(self._forward, x, use_reentrant=False)
        else:
            return self._forward(x)

class CheckpointedLLM(nn.Module):
    """
    支持选择性梯度检查点的LLM
    
    策略：
    - 每隔checkpoint_every层设置一个检查点
    - 检查点之间的层在前向传播时丢弃中间激活值
    - 反向传播时从最近的检查点重新计算
    """
    
    def __init__(self, vocab_size=32000, dim=768, n_layers=12, 
                 n_heads=12, checkpoint_every=2):
        super().__init__()
        self.embedding = nn.Embedding(vocab_size, dim)
        self.layers = nn.ModuleList([
            CheckpointedTransformerBlock(
                dim, n_heads, 
                use_checkpoint=(i % checkpoint_every != 0)
            )
            for i in range(n_layers)
        ])
        self.ln_f = nn.LayerNorm(dim)
        self.head = nn.Linear(dim, vocab_size, bias=False)
    
    def forward(self, input_ids):
        x = self.embedding(input_ids)
        for layer in self.layers:
            x = layer(x)
        x = self.ln_f(x)
        return self.head(x)

# 显存分析
def analyze_memory_with_checkpointing(
    n_layers: int, hidden_dim: int, batch_size: int, seq_length: int,
    checkpoint_every: int = 1  # 1=每层都checkpoint, inf=不checkpoint
):
    """
    分析不同检查点策略下的显存使用
    
    假设每层的激活值大小相同
    """
    # 每层激活值大小（粗略估算）
    # 主要的激活值来源：
    # 1. Self-attention的Q, K, V: 3 * batch * seq * dim * 2bytes
    # 2. Attention scores: batch * n_heads * seq * seq * 2bytes
    # 3. FFN中间结果: batch * seq * (4 * dim) * 2bytes
    attention_activations = 3 * batch_size * seq_length * hidden_dim * 2
    attention_scores = batch_size * 12 * seq_length * seq_length * 2
    ffn_activations = batch_size * seq_length * 4 * hidden_dim * 2
    
    activation_per_layer = attention_activations + attention_scores + ffn_activations
    
    # 不使用检查点：保存所有层的激活值
    total_no_checkpoint = activation_per_layer * n_layers
    
    # 使用检查点：只保存checkpoint层的激活值 + 重计算时的临时激活值
    n_checkpoints = n_layers // checkpoint_every
    # 保存的checkpoint + 最多checkpoint_every层的临时激活值
    total_with_checkpoint = (n_checkpoints + checkpoint_every) * activation_per_layer
    
    return {
        'activation_per_layer_mb': activation_per_layer / 1e6,
        'no_checkpoint_mb': total_no_checkpoint / 1e6,
        'with_checkpoint_mb': total_with_checkpoint / 1e6,
        'savings': (1 - total_with_checkpoint / total_no_checkpoint),
        'recompute_overhead': checkpoint_every / (checkpoint_every + 1),
    }

# 对比不同策略
configs = [
    ("不使用检查点", 999),
    ("每2层检查点", 2),
    ("每4层检查点", 4),
    ("每层都检查点", 1),
]

print("激活值显存分析 (12层, hidden=768, batch=4, seq=512)")
print("-" * 60)

for name, every in configs:
    result = analyze_memory_with_checkpointing(
        n_layers=12, hidden_dim=768, batch_size=4, seq_length=512,
        checkpoint_every=every
    )
    print(f"{name:16s}: {result['with_checkpoint_mb'] if every < 999 else result['no_checkpoint_mb']:8.1f} MB  "
          f"(节省 {result['savings'] if every < 999 else 0:.0%})")
```

### 四、综合优化：将所有技术组合起来

```python
"""
综合显存优化训练脚本
将混合精度、梯度累加、激活重计算组合使用
"""

import torch
import torch.nn as nn
from torch.amp import autocast, GradScaler
from torch.utils.checkpoint import checkpoint
from typing import Optional

class OptimizedTrainingConfig:
    """训练优化配置"""
    
    def __init__(
        self,
        precision: str = 'bf16',  # 'fp32', 'fp16', 'bf16'
        gradient_accumulation_steps: int = 4,
        use_gradient_checkpointing: bool = True,
        max_grad_norm: float = 1.0,
    ):
        self.precision = precision
        self.gradient_accumulation_steps = gradient_accumulation_steps
        self.use_gradient_checkpointing = use_gradient_checkpointing
        self.max_grad_norm = max_grad_norm
        
        # BF16不需要loss scaling
        self.use_scaler = (precision == 'fp16')
    
    def estimate_memory_savings(self, model_params_b: float) -> dict:
        """估算显存节省"""
        p = model_params_b * 1e9
        
        # FP32基线
        baseline = p * 4 + p * 4 + p * 12  # 参数+梯度+优化器
        
        # 混合精度
        if self.precision in ('fp16', 'bf16'):
            mp_params = p * 2  # FP16/BF16参数
            mp_grads = p * 2   # FP16/BF16梯度
            mp_optim = p * 12  # FP32优化器状态不变
            mp_total = mp_params + mp_grads + mp_optim
        else:
            mp_total = baseline
        
        savings_precision = 1 - mp_total / baseline
        
        # 梯度累加（不节省参数/优化器显存，只节省激活值显存）
        savings_accumulation = f"激活值显存减少到 1/{self.gradient_accumulation_steps}"
        
        # 激活重计算
        if self.use_gradient_checkpointing:
            savings_checkpoint = "激活值显存减少约70%"
        else:
            savings_checkpoint = "无节省"
        
        return {
            'baseline_fp32_gb': baseline / 1e9,
            'optimized_gb': mp_total / 1e9,
            'precision_savings': f'{savings_precision:.0%}',
            'accumulation_savings': savings_accumulation,
            'checkpoint_savings': savings_checkpoint,
            'recommended_gpu': self._recommend_gpu(mp_total),
        }
    
    def _recommend_gpu(self, memory_bytes: float) -> str:
        memory_gb = memory_bytes / 1e9
        if memory_gb <= 24:
            return "RTX 4090 (24GB)"
        elif memory_gb <= 40:
            return "A100-40GB"
        elif memory_gb <= 80:
            return "A100-80GB / H100-80GB"
        else:
            return f"需要 {memory_gb:.0f}GB 显存 → 多卡分布式训练"

# 配置对比
configs = [
    ("无优化", OptimizedTrainingConfig(precision='fp32', gradient_accumulation_steps=1, 
                                        use_gradient_checkpointing=False)),
    ("仅混合精度", OptimizedTrainingConfig(precision='bf16', gradient_accumulation_steps=1, 
                                            use_gradient_checkpointing=False)),
    ("混合精度+累加", OptimizedTrainingConfig(precision='bf16', gradient_accumulation_steps=4, 
                                               use_gradient_checkpointing=False)),
    ("全部优化", OptimizedTrainingConfig(precision='bf16', gradient_accumulation_steps=4, 
                                          use_gradient_checkpointing=True)),
]

print("显存优化策略对比 (7B参数模型)")
print("=" * 70)
for name, config in configs:
    result = config.estimate_memory_savings(7.0)
    print(f"\n{name}:")
    print(f"  参数+梯度+优化器: {result['optimized_gb']:.1f}GB (节省{result['precision_savings']})")
    print(f"  梯度累加: {result['accumulation_savings']}")
    print(f"  激活重计算: {result['checkpoint_savings']}")
    print(f"  推荐GPU: {result['recommended_gpu']}")
```

### 五、CPU卸载（Offloading）

当GPU显存实在不够时，可以将部分数据卸载到CPU内存或NVMe SSD。

```python
"""
CPU卸载的概念说明
实际使用通过DeepSpeed或FSDP的配置实现
"""

print("CPU卸载策略")
print("=" * 60)

print("""
1. 优化器状态卸载 (最常用，推荐)
   - 将Adam的动量和方差保存在CPU内存
   - GPU上只保留FP16参数和梯度
   - 代价：每步需要CPU↔GPU数据传输
   - 适用：模型参数能放进GPU，但优化器状态放不下的情况
   - DeepSpeed配置: offload_optimizer.device = "cpu"

2. 参数卸载 (更激进)
   - 将不在使用的模型参数卸载到CPU
   - 需要时再传回GPU
   - 代价：频繁的CPU↔GPU数据传输，训练速度可能下降50%+
   - 适用：模型参数也放不进GPU的情况
   - DeepSpeed配置: offload_param.device = "cpu"

3. NVMe卸载 (最激进)
   - 将数据卸载到NVMe SSD
   - CPU内存也不够时使用
   - 代价：训练速度可能下降5-10x
   - 适用：极大规模模型
   - DeepSpeed配置: offload_optimizer.device = "nvme"

显存节省估算 (7B模型, 8卡, ZeRO-3):

原始（不卸载）:
  每张GPU: ~12GB参数 + ~12GB梯度 + ~48GB优化器 = ~72GB

仅优化器卸载:
  GPU: ~12GB参数 + ~12GB梯度 = ~24GB
  CPU: ~48GB优化器状态
  → 单张A100-40GB就够了！

参数也卸载:
  GPU: ~6GB参数 + ~6GB梯度 = ~12GB
  CPU: ~6GB参数 + ~48GB优化器
  → 单张RTX 4090理论上可以训练7B模型
""")
```

## 代码示例（完整可运行的 Python）

```python
"""
完整的显存优化训练流水线
包含：混合精度、梯度累加、激活重计算、梯度裁剪

可以在单张GPU上运行（需要修改模型大小适配你的GPU）
"""

import torch
import torch.nn as nn
from torch.amp import autocast, GradScaler
from torch.utils.checkpoint import checkpoint
from typing import Optional, Dict
import time

# ============================================================
# 模型定义
# ============================================================

class OptimizedTransformerBlock(nn.Module):
    def __init__(self, dim, n_heads, use_checkpoint=False):
        super().__init__()
        self.use_checkpoint = use_checkpoint
        self.attention = nn.MultiheadAttention(dim, n_heads, batch_first=True)
        self.ffn = nn.Sequential(
            nn.Linear(dim, dim * 4),
            nn.GELU(),
            nn.Linear(dim * 4, dim),
        )
        self.ln1 = nn.LayerNorm(dim)
        self.ln2 = nn.LayerNorm(dim)
    
    def _forward(self, x):
        residual = x
        x = self.ln1(x)
        x, _ = self.attention(x, x, x)
        x = residual + x
        residual = x
        x = self.ln2(x)
        x = self.ffn(x)
        x = residual + x
        return x
    
    def forward(self, x):
        if self.use_checkpoint and self.training:
            return checkpoint(self._forward, x, use_reentrant=False)
        return self._forward(x)

class OptimizedLLM(nn.Module):
    def __init__(self, vocab_size=32000, dim=768, n_layers=12, 
                 n_heads=12, checkpoint_every=2):
        super().__init__()
        self.embedding = nn.Embedding(vocab_size, dim)
        self.layers = nn.ModuleList([
            OptimizedTransformerBlock(
                dim, n_heads,
                use_checkpoint=(i % checkpoint_every != 0)
            )
            for i in range(n_layers)
        ])
        self.ln_f = nn.LayerNorm(dim)
        self.head = nn.Linear(dim, vocab_size, bias=False)
    
    def forward(self, input_ids):
        x = self.embedding(input_ids)
        for layer in self.layers:
            x = layer(x)
        x = self.ln_f(x)
        return self.head(x)

# ============================================================
# 优化训练器
# ============================================================

class MemoryOptimizedTrainer:
    """显存优化的训练器"""
    
    def __init__(
        self,
        model: nn.Module,
        learning_rate: float = 1e-4,
        precision: str = 'bf16',  # 'fp32', 'fp16', 'bf16'
        gradient_accumulation_steps: int = 4,
        max_grad_norm: float = 1.0,
        vocab_size: int = 32000,
    ):
        self.model = model
        self.gradient_accumulation_steps = gradient_accumulation_steps
        self.max_grad_norm = max_grad_norm
        self.vocab_size = vocab_size
        
        self.optimizer = torch.optim.AdamW(model.parameters(), lr=learning_rate)
        
        # 混合精度设置
        self.precision = precision
        self.dtype = {
            'fp32': torch.float32,
            'fp16': torch.float16,
            'bf16': torch.bfloat16,
        }[precision]
        
        # FP16需要GradScaler
        self.scaler = GradScaler('cuda') if precision == 'fp16' else None
        
        self.global_step = 0
    
    def train_epoch(self, n_steps: int = 100, micro_batch_size: int = 4, 
                    seq_length: int = 512) -> Dict:
        """训练一个epoch"""
        self.model.train()
        device = next(self.model.parameters()).device
        
        total_loss = 0
        start_time = time.time()
        
        for step in range(n_steps):
            # 生成模拟数据
            input_ids = torch.randint(0, self.vocab_size, (micro_batch_size, seq_length)).to(device)
            
            # 混合精度前向传播
            if self.precision != 'fp32':
                with autocast('cuda', dtype=self.dtype):
                    logits = self.model(input_ids)
                    loss = nn.functional.cross_entropy(
                        logits[:, :-1].reshape(-1, self.vocab_size),
                        input_ids[:, 1:].reshape(-1)
                    )
                    # 归一化loss
                    loss = loss / self.gradient_accumulation_steps
            else:
                logits = self.model(input_ids)
                loss = nn.functional.cross_entropy(
                    logits[:, :-1].reshape(-1, self.vocab_size),
                    input_ids[:, 1:].reshape(-1)
                )
                loss = loss / self.gradient_accumulation_steps
            
            # 反向传播
            if self.scaler:
                self.scaler.scale(loss).backward()
            else:
                loss.backward()
            
            total_loss += loss.item() * self.gradient_accumulation_steps
            
            # 梯度累加完成，执行参数更新
            if (step + 1) % self.gradient_accumulation_steps == 0:
                # 梯度裁剪
                if self.max_grad_norm > 0:
                    if self.scaler:
                        self.scaler.unscale_(self.optimizer)
                    grad_norm = torch.nn.utils.clip_grad_norm_(
                        self.model.parameters(), self.max_grad_norm
                    )
                
                # 参数更新
                if self.scaler:
                    self.scaler.step(self.optimizer)
                    self.scaler.update()
                else:
                    self.optimizer.step()
                
                self.optimizer.zero_grad()
                self.global_step += 1
        
        elapsed = time.time() - start_time
        avg_loss = total_loss / n_steps
        
        return {
            'avg_loss': avg_loss,
            'global_steps': self.global_step,
            'elapsed_seconds': elapsed,
            'samples_per_second': n_steps * micro_batch_size / elapsed,
        }

# ============================================================
# 运行对比实验
# ============================================================

# 只在CPU上运行概念演示（GPU上才能真正看到显存差异）
device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')

if device.type == 'cuda':
    # 在GPU上运行对比
    configs = [
        ('FP32 无优化', {'precision': 'fp32', 'gradient_accumulation_steps': 1}),
        ('BF16 混合精度', {'precision': 'bf16', 'gradient_accumulation_steps': 1}),
        ('BF16 + 累加x4', {'precision': 'bf16', 'gradient_accumulation_steps': 4}),
    ]
    
    for name, kwargs in configs:
        model = OptimizedLLM(dim=768, n_layers=12, checkpoint_every=2).to(device)
        trainer = MemoryOptimizedTrainer(model, vocab_size=32000, **kwargs)
        
        # 测量显存
        torch.cuda.reset_peak_memory_stats()
        result = trainer.train_epoch(n_steps=20, micro_batch_size=4, seq_length=512)
        peak_memory = torch.cuda.max_memory_allocated() / 1e9
        
        print(f"{name}: loss={result['avg_loss']:.4f}, "
              f"峰值显存={peak_memory:.2f}GB, "
              f"速度={result['samples_per_second']:.1f} samples/s")
else:
    print("（无CUDA GPU，显示概念性输出）")
    print("\n显存优化策略对比 (100M参数模型, batch=4, seq=512):")
    print("-" * 60)
    print(f"{'策略':<25} {'显存/GPU':>10} {'速度':>10}")
    print("-" * 60)
    print(f"{'FP32 无优化':<25} {'~4.8GB':>10} {'100%':>10}")
    print(f"{'BF16 混合精度':<25} {'~2.8GB':>10} {'~150%':>10}")
    print(f"{'BF16 + 梯度累加x4':<25} {'~1.5GB':>10} {'~120%':>10}")
    print(f"{'BF16 + 累加 + 检查点':<25} {'~0.9GB':>10} {'~90%':>10}")
    print("-" * 60)
    print("注：具体数值取决于模型结构和GPU型号")
```

## 真实案例

### 案例1：Llama-2的训练

Meta在训练Llama-2系列模型时使用的显存优化组合：
- **混合精度**：BF16（不需要loss scaling，训练更稳定）
- **梯度累加**：根据GPU数量和batch size调整，确保有效batch size足够大
- **激活重计算**：选择性使用（不是每层都重计算）
- **结果**：7B模型可以在单台8xA100-80GB服务器上全量训练

### 案例2：Stable Diffusion的微调

Stable Diffusion是一个约860M参数的UNet模型。在消费级GPU上微调时：
- **混合精度**：FP16（注意：SD的VAE对精度敏感，部分操作需要保持FP32）
- **梯度累加**：micro_batch=1，累加4-8步
- **激活重计算**：开启（UNet的激活值非常大）
- **8-bit优化器**：使用bitsandbytes的8-bit Adam，优化器显存从参数量x12降到参数量x2
- **结果**：在24GB RTX 4090上可以微调SDXL

### 案例3：LoRA微调中的显存优化

LoRA（Low-Rank Adaptation）本身就是一种显存优化：只训练低秩矩阵，不训练原始参数。配合其他技术：
- **4-bit量化**：将模型参数量化到4-bit（QLoRA），进一步减少显存
- **分页优化器**：当显存不足时，将优化器状态分页到CPU内存
- **结果**：在24GB RTX 4090上可以微调65B参数的模型

## 权衡取舍以及何时不该使用

### 混合精度的权衡

**精度损失**：BF16只有约2位有效数字（FP32有7位）。对于大多数任务这不影响最终结果，但某些对精度敏感的任务可能受影响：
- 数值优化（如科学计算）
- 某些损失函数（如contrastive loss中的温度参数）
- 小梯度的累积（可能导致学习缓慢）

**硬件依赖**：BF16需要Ampere架构及更新（A100, H100, RTX 3000/4000系列）。旧的GPU（V100, RTX 2000系列）不支持BF16，只能用FP16。

### 激活重计算的权衡

**33%的额外计算**：这是最常见的代价。如果你的训练已经是计算瓶颈（GPU利用率接近100%），额外的33%计算会显著增加训练时间。

**不适用于小模型**：如果你的模型只有几百万参数，激活值本身不大，使用激活重计算反而增加了不必要的复杂性和计算。

### 梯度累加的权衡

**训练速度**：梯度累加不增加显存，但也不减少计算量。4步累加=1次更新，总计算量不变。但它让你能在显存有限的情况下使用更大的有效batch size，间接提高了GPU利用率。

**BatchNorm问题**：如果模型使用了BatchNorm，梯度累加会导致统计量基于micro-batch而非有效batch。Transformer通常使用LayerNorm，这不是问题。但CNN模型需要注意。

### 何时不该使用

1. **模型已经能在GPU上训练**：如果一切都能放下，不需要任何优化。优化技术会增加代码复杂性和调试难度。
2. **追求最大训练速度**：混合精度在大多数现代GPU上会加速训练，但激活重计算会减慢。
3. **推理任务**：推理不需要梯度，不需要优化器状态，不需要激活重计算。推理优化应该用量化、剪枝等技术。
4. **已经使用LoRA/QLoRA**：参数高效微调已经大幅减少了显存需求，如果仍然不够，再考虑梯度累加和激活重计算。

## 关键要点

1. **混合精度训练是最基础的显存优化**，将参数和梯度从FP32降到FP16/BF16，显存直接减少50%。2024年后BF16是首选（不需要loss scaling，训练更稳定）。PyTorch的`torch.amp`让实现变得非常简单。

2. **梯度累加是零显存成本增大有效batch size的标准方法**。核心是loss除以累加步数，让累加后的梯度等价于大batch的梯度。需要注意BatchNorm的行为和DDP的同步策略。

3. **激活重计算（gradient checkpointing）将激活值显存从O(n)降到O(sqrt(n))**，代价是额外约33%的前向计算。对于层数多、激活值大的模型（Transformer），这是最有效的"用时间换空间"技术。

4. **CPU卸载是最激进的显存优化**，将优化器状态或参数卸载到CPU/NVMe。适合极端显存不足的场景，但训练速度会显著下降。

5. **这些技术可以组合使用**，且应该组合使用。典型的LLM微调配置：BF16混合精度 + 梯度累加(4步) + 激活重计算 + 8-bit优化器。

6. **FP16需要loss scaling，BF16不需要**。如果你在Ampere及更新的GPU上训练，总是选择BF16。FP16只在旧的GPU（V100及更早）上是唯一选择。

7. **优化策略的选择取决于你的瓶颈**：显存不够→混合精度+激活重计算+CPU卸载；batch size太小→梯度累加；训练太慢→混合精度（加速计算）+ 不要用激活重计算（减慢训练）。

## 延伸阅读

**论文**：
- "Mixed Precision Training" (Micikevicius et al., 2018) — 混合精度训练原始论文
- "Training Deep Nets with Sublinear Memory Cost" (Chen et al., 2016) — 激活重计算原始论文
- "8-bit Optimizers via Block-wise Quantization" (Dettmers et al., 2022) — 8-bit优化器
- "QLoRA: Efficient Finetuning of Quantized LLMs" (Dettmers et al., 2023) — 量化+LoRA

**工具**：
- PyTorch AMP文档 (torch.amp) — PyTorch原生混合精度
- bitsandbytes — 8-bit/4-bit优化器和量化
- DeepSpeed — CPU/NVMe卸载配置
- Hugging Face Trainer — 内置所有优化技术的训练器
