# 分布式训练：数据并行、模型并行与 ZeRO——多卡多机怎么训大模型

<!--
调研来源：
1. "Efficient Large-Scale Language Model Training on GPU Clusters Using Megatron-LM" (NVIDIA, 2021) — 经典的3D并行策略论文，展示了数据并行+张量并行+流水线并行的组合
2. PyTorch FSDP官方文档 — Fully Sharded Data Parallel API的设计理念和使用方法
3. DeepSpeed ZeRO系列论文 (Rajbhandari et al., 2020) — ZeRO优化器的三个阶段，显存优化与通信效率的平衡
4. "A Study on Distributed Strategies for Deep Learning Applications" (arxiv, 2025) — 对比DDP/FSDP/DeepSpeed的最新研究
5. Colossal-AI "Paradigms of Parallelism" 文档 — 清晰地阐述了各种并行策略的分类和适用场景
6. Stas Bekman "ml-engineering" GitHub仓库 — 大规模训练的工程实践指南

核心发现：2024-2026年，FSDP已成为PyTorch生态中分布式训练的主流方案，DeepSpeed ZeRO-3仍然在大规模训练中广泛使用。3D并行（数据并行+张量并行+流水线并行）是训练超大规模模型（>100B参数）的标准方法。趋势是从手工配置并行策略转向自动化的并行策略搜索。
-->

**TL;DR：** 当模型太大一张卡放不下，或者训练太慢需要加速时，你需要分布式训练。本文从数据并行（DDP）讲起，经过模型并行（张量并行、流水线并行），到ZeRO优化和3D并行，帮你建立多卡多机训练的完整知识体系。

## 为什么这很重要

2024年，Llama-3-405B的训练使用了超过16,000张H100 GPU。GPT-4的训练据估计使用了数万张A100/H100 GPU，训练成本超过1亿美元。即使是7B参数的模型，全量微调在单张消费级GPU上也几乎不可能完成。

这些数字背后的核心技术问题是：**如何把一个巨大的模型和海量的训练数据，高效地分配到多张GPU上？**

这不是一个简单的工程问题。它涉及到：

- **显存限制**：一张H100有80GB显存。一个7B参数的模型在FP32下需要28GB存储参数，加上梯度、优化器状态和激活值，总共需要约120GB——单张卡根本放不下。
- **通信开销**：多张GPU之间需要同步梯度，这个通信量可能成为训练的瓶颈。在一个8卡节点内，NVLink的带宽是900GB/s；但跨节点的InfiniBand带宽通常只有400Gb/s（50GB/s）——慢了约18倍。
- **负载均衡**：如何让每张GPU的工作量大致相同，避免某些GPU空闲等待其他GPU？
- **容错性**：当使用数千张GPU训练时，硬件故障是常态而不是意外。如何设计系统使得单个GPU故障不会导致整个训练任务失败？

分布式训练不是一个可有可无的优化——它是训练现代大模型的**必要条件**。

## 核心概念

### 并行策略的分类

分布式训练的核心挑战是回答一个问题：**如何切分计算？**

有三种基本的切分方式：

```
┌─────────────────────────────────────────────────────────────┐
│                    分布式训练策略全景                           │
├─────────────┬──────────────────┬────────────────────────────┤
│  数据并行    │    模型并行       │       混合并行              │
│  (DP/DDP)   │  (MP)            │                             │
│             │                  │                             │
│ 切分数据     │ 切分模型          │ 数据并行 + 模型并行          │
│ 复制模型     │ 数据相同          │ (3D Parallelism)            │
│             │                  │                             │
│             │ ├ 张量并行(TP)    │  DP + TP + PP               │
│             │ │ 切分单层参数     │                             │
│             │ │                 │  + ZeRO显存优化              │
│             │ ├ 流水线并行(PP)  │                             │
│             │ │ 切分层组        │                             │
│             │ │                 │                             │
│             │ └ 专家并行(EP)    │                             │
│             │   切分MoE专家     │                             │
└─────────────┴──────────────────┴────────────────────────────┘
```

### 关键指标

理解分布式训练之前，需要先理解几个关键的性能指标：

**吞吐量（Throughput）**：每秒处理的训练样本数。通常用tokens/sec（语言模型）或samples/sec（视觉模型）来衡量。这是最直接的训练速度指标。

**显存占用（Memory Usage）**：训练过程中GPU显存的使用量。训练一个大模型需要的显存包括：
- 模型参数：参数量 × 每个参数的字节数（FP32=4B, FP16=2B）
- 梯度：与参数大小相同
- 优化器状态：Adam需要2倍参数量的额外存储（动量和方差）
- 激活值：前向传播中需要保存的中间结果（用于反向传播）

一个快速估算公式（FP16混合精度训练，使用Adam优化器）：

```
总显存 ≈ 参数量 × 2B (参数) 
       + 参数量 × 2B (梯度) 
       + 参数量 × 8B (Adam优化器: FP32参数副本 + 动量 + 方差)
       + 激活值 (取决于batch size和序列长度)
```

对于一个7B参数的模型：
- 参数: 7B × 2B = 14GB
- 梯度: 14GB
- 优化器状态: 7B × 8B = 56GB
- 合计（不含激活值）: 84GB

这远远超出了单张消费级GPU的显存容量。即使使用A100-80GB，不使用任何显存优化技术，也无法完成全量训练。

**通信量（Communication Volume）**：GPU之间需要传输的数据量。通信量越大，训练越慢（因为GPU需要等待数据传输完成）。

**计算效率（Model FLOPs Utilization, MFU）**：实际计算速度与理论峰值计算速度的比值。MFU越高，说明GPU越没有被通信或空闲浪费。

## 工作原理（简化的心智模型）

### 用厨房来理解分布式训练

把训练一个模型想象成在厨房里准备一场大型宴会。

**数据并行** = 请了8个厨师，每个人都能独立做完整的菜，但每个人拿到的食材不同（不同的训练数据）。做完后，大家开个会（AllReduce），交流一下各自的烹饪经验（同步梯度），然后继续用更新后的经验做下一批菜。

问题：每个厨师都需要一套完整的厨具（模型参数的完整副本），如果厨具太大（模型太大），一个厨房（一张GPU）放不下。

**模型并行** = 把一道复杂的菜拆成几道工序，分配给不同的厨师。张厨师负责备菜，李厨师负责炒菜，王厨师负责摆盘。每个人只需要自己那道工序的工具（模型的一部分）。

问题：流水线上游的厨师做完才能传给下游，下游的厨师在等待时就闲着（流水线气泡）。

**ZeRO** = 既然每个厨师都需要全套厨具的副本太浪费，那就共享。食材由大家平分（ZeRO-1：切分优化器状态），或者连调料也共享（ZeRO-2：切分梯度），甚至把灶台也拼起来用（ZeRO-3：切分参数）。需要的时候借一下，用完了还回去。

**3D并行** = 终极方案：厨房按楼层组织（流水线并行），每层楼内部按工位分工（张量并行），同时每层楼有多个团队做同样的菜但用不同的食材（数据并行）。这样既解决了模型太大放不下的问题，又充分利用了所有的人力。

## 工作原理（详细机制）

### 一、数据并行（Data Parallelism, DP）

数据并行是最简单也最常用的并行策略。核心思想：每张GPU持有模型的完整副本，但处理不同的训练数据。

#### 1.1 朴素数据并行（Naive DP）

```
GPU 0: [模型副本0] + [数据批次0] → 计算梯度0
GPU 1: [模型副本1] + [数据批次1] → 计算梯度1
GPU 2: [模型副本2] + [数据批次2] → 计算梯度2
GPU 3: [模型副本3] + [数据批次3] → 计算梯度3
                                    ↓
                    AllReduce: 梯度0 + 梯度1 + 梯度2 + 梯度3 = 平均梯度
                                    ↓
                    每张GPU用平均梯度更新各自的模型参数
```

朴素数据并行的核心操作是**AllReduce**——所有GPU互相交换梯度并计算平均值。这个操作的时间复杂度随GPU数量增长。

```python
"""
数据并行的概念演示
这里不用PyTorch的DDP，而是手动实现来展示原理
"""
import numpy as np
from typing import List

class SimpleDataParallel:
    """
    简化的数据并行实现
    用于理解原理，不用于实际训练
    """
    
    def __init__(self, model_params: np.ndarray, n_gpus: int = 4, lr: float = 0.01):
        # 每张GPU持有一个模型副本
        self.n_gpus = n_gpus
        self.lr = lr
        self.models = [model_params.copy() for _ in range(n_gpus)]
        self.opt_states = [{'m': np.zeros_like(model_params), 'v': np.zeros_like(model_params)} 
                          for _ in range(n_gpus)]
        self.step_count = 0
    
    def compute_gradient(self, gpu_id: int, data_batch: np.ndarray) -> np.ndarray:
        """
        模拟单张GPU上的梯度计算
        实际中这是一个完整的前向+反向传播
        """
        params = self.models[gpu_id]
        # 模拟: gradient = loss对参数的导数
        # 这里用简化的线性模型: y = params * x
        # loss = mean((y_pred - y_true)^2)
        # gradient = mean(2 * x * (params * x - y_true))
        x, y = data_batch[:, 0], data_batch[:, 1]
        gradient = np.mean(2 * x * (params * x - y), axis=0)
        return gradient
    
    def all_reduce(self, gradients: List[np.ndarray]) -> np.ndarray:
        """
        AllReduce操作：所有GPU交换梯度并计算平均值
        
        实际中的AllReduce有多种实现：
        - Ring AllReduce: O(n)通信步数，带宽最优
        - Tree AllReduce: O(log n)通信步数，延迟最优
        - Parameter Server: 中心化方案，简单但有瓶颈
        """
        # 简化实现：直接求平均
        stacked = np.stack(gradients)
        avg_gradient = np.mean(stacked, axis=0)
        return avg_gradient
    
    def adam_update(self, gpu_id: int, gradient: np.ndarray, beta1: float = 0.9, beta2: float = 0.999):
        """Adam优化器更新"""
        state = self.opt_states[gpu_id]
        self.step_count += 1
        t = self.step_count
        
        state['m'] = beta1 * state['m'] + (1 - beta1) * gradient
        state['v'] = beta2 * state['v'] + (1 - beta2) * gradient ** 2
        
        m_hat = state['m'] / (1 - beta1 ** t)
        v_hat = state['v'] / (1 - beta2 ** t)
        
        self.models[gpu_id] -= self.lr * m_hat / (np.sqrt(v_hat) + 1e-8)
    
    def train_step(self, data_batches: List[np.ndarray]) -> float:
        """
        一个完整的训练步骤
        
        1. 每张GPU独立计算梯度
        2. AllReduce同步梯度
        3. 每张GPU独立更新参数
        """
        assert len(data_batches) == self.n_gpus
        
        # Step 1: 独立计算梯度（并行）
        gradients = []
        for gpu_id in range(self.n_gpus):
            grad = self.compute_gradient(gpu_id, data_batches[gpu_id])
            gradients.append(grad)
        
        # Step 2: AllReduce同步梯度
        avg_gradient = self.all_reduce(gradients)
        
        # Step 3: 独立更新参数（每张GPU用相同的梯度更新）
        for gpu_id in range(self.n_gpus):
            self.adam_update(gpu_id, avg_gradient)
        
        # 返回平均loss（用于监控）
        losses = []
        for gpu_id in range(self.n_gpus):
            x, y = data_batches[gpu_id][:, 0], data_batches[gpu_id][:, 1]
            pred = self.models[gpu_id] * x
            loss = np.mean((pred - y) ** 2)
            losses.append(loss)
        
        return np.mean(losses)

# 演示
np.random.seed(42)

# 真实参数
true_params = np.array([2.0, -1.0, 0.5])

# 初始化模型
dp = SimpleDataParallel(model_params=np.array([0.0, 0.0, 0.0]), n_gpus=4, lr=0.01)

# 训练
for step in range(100):
    # 为每张GPU生成不同的数据批次
    batches = []
    for gpu_id in range(4):
        x = np.random.randn(32, 3)
        y = x @ true_params + np.random.randn(32) * 0.1
        batches.append(np.column_stack([x, y]))
    
    loss = dp.train_step(batches)
    
    if step % 20 == 0:
        print(f"Step {step:3d}: loss = {loss:.6f}, params = {dp.models[0]}")

print(f"\n真实参数: {true_params}")
print(f"学习到的参数: {dp.models[0]}")
```

#### 1.2 分布式数据并行（DDP）

PyTorch的DDP（DistributedDataParallel）是数据并行的工业级实现。与朴素DP的关键区别：

1. **Ring AllReduce**：不是把所有梯度发给一个中心节点（Parameter Server），而是用环形通信模式，每张GPU只与相邻的GPU通信。这避免了中心节点的带宽瓶颈。

2. **梯度分桶**（Bucketing）：不等待所有梯度计算完成才通信，而是把梯度分成多个桶（bucket），计算完一个桶就开始通信，实现计算和通信的重叠。

3. **进程级并行**：每个GPU是一个独立的进程，而不是线程。这避免了Python GIL的限制。

```python
"""
PyTorch DDP 实际使用示例
运行方式: torchrun --nproc_per_node=4 ddp_example.py
"""

import torch
import torch.nn as nn
import torch.distributed as dist
from torch.nn.parallel import DistributedDataParallel as DDP
from torch.utils.data import DataLoader, DistributedSampler

class SimpleModel(nn.Module):
    def __init__(self, input_dim=768, hidden_dim=2048, output_dim=10):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(input_dim, hidden_dim),
            nn.ReLU(),
            nn.Linear(hidden_dim, hidden_dim),
            nn.ReLU(),
            nn.Linear(hidden_dim, output_dim),
        )
    
    def forward(self, x):
        return self.net(x)

def setup_ddp():
    """初始化DDP环境"""
    import os
    dist.init_process_group(backend='nccl')
    local_rank = int(os.environ['LOCAL_RANK'])
    torch.cuda.set_device(local_rank)
    return local_rank

def cleanup_ddp():
    dist.destroy_process_group()

def train_ddp():
    local_rank = setup_ddp()
    
    # 创建模型并移到当前GPU
    model = SimpleModel().cuda(local_rank)
    
    # 用DDP包装模型
    model = DDP(model, device_ids=[local_rank])
    
    # 创建分布式采样器——确保不同GPU拿到不同的数据
    dataset = torch.randn(10000, 768)  # 模拟数据
    labels = torch.randint(0, 10, (10000,))
    
    dataset = torch.utils.data.TensorDataset(dataset, labels)
    sampler = DistributedSampler(dataset)
    
    dataloader = DataLoader(
        dataset,
        batch_size=32,
        sampler=sampler,
        num_workers=2,
        pin_memory=True,
    )
    
    optimizer = torch.optim.AdamW(model.parameters(), lr=1e-4)
    criterion = nn.CrossEntropyLoss()
    
    for epoch in range(10):
        # 重要：每个epoch需要设置不同的shuffle顺序
        sampler.set_epoch(epoch)
        
        for batch_idx, (data, target) in enumerate(dataloader):
            data = data.cuda(local_rank, non_blocking=True)
            target = target.cuda(local_rank, non_blocking=True)
            
            optimizer.zero_grad()
            output = model(data)
            loss = criterion(output, target)
            loss.backward()  # DDP自动处理梯度同步
            
            optimizer.step()
            
            if batch_idx % 50 == 0 and local_rank == 0:
                print(f"Epoch {epoch}, Batch {batch_idx}, Loss: {loss.item():.4f}")
    
    cleanup_ddp()

# 注意：此代码需要通过 torchrun 运行
# torchrun --nproc_per_node=4 ddp_example.py
```

#### 1.3 DDP的显存问题

DDP最大的问题是：**每张GPU都保存一份完整的模型参数、梯度和优化器状态**。

对于7B参数的模型（FP16 + Adam）：

| 组件 | 大小 | 每张GPU需要 |
|------|------|-----------|
| 模型参数（FP16） | 14GB | 14GB |
| 梯度（FP16） | 14GB | 14GB |
| 优化器状态（FP32参数+动量+方差） | 56GB | 56GB |
| 激活值 | 取决于batch size | ~10-30GB |
| **合计** | | **~94-114GB** |

即使用8张A100-80GB做数据并行，每张卡也需要约94GB来存储模型相关数据——已经超出了A100的80GB显存。

这就是为什么数据并行不够用——你需要**切分模型**，而不只是切分数据。

### 二、模型并行（Model Parallelism）

模型并行的核心思想是：**把模型本身切分到多张GPU上**。

#### 2.1 张量并行（Tensor Parallelism, TP）

张量并行是最细粒度的模型并行方式——把单个层的参数矩阵切分到多张GPU上。

**线性层的切分**：

一个线性层 Y = XW，其中 W 是一个 (in_features, out_features) 的矩阵。有两种切法：

**列切分（Column Parallel）**：把 W 按列切分成 W₁, W₂（每张GPU持有 W 的不同列）。

```
原始计算: Y = XW = X[W₁ | W₂]

GPU 0: Y₁ = XW₁   (输出的一部分)
GPU 1: Y₂ = XW₂   (输出的另一部分)

拼接: Y = [Y₁ | Y₂]
```

**行切分（Row Parallel）**：把 W 按行切分。输入也对应切分。

```
原始计算: Y = XW = [X₁ | X₂] [W₁; W₂] = X₁W₁ + X₂W₂

GPU 0: Y₁ = X₁W₁
GPU 1: Y₂ = X₂W₂

AllReduce: Y = Y₁ + Y₂
```

Megatron-LM论文的关键洞察：**列切分和行切分可以配对使用，使得MLP块只需要在开头和结尾各做一次通信**。

```python
"""
张量并行的概念实现
展示如何将Transformer的MLP层切分到多张GPU上
"""
import numpy as np

class TensorParallelLinear:
    """
    张量并行的线性层
    
    展示Megatron-LM风格的列并行+行并行配对
    """
    
    def __init__(self, in_features: int, out_features: int, 
                 n_gpus: int = 2, split: str = 'column'):
        self.n_gpus = n_gpus
        self.split = split
        
        if split == 'column':
            # 按列切分：每张GPU持有 out_features/n_gpus 列
            assert out_features % n_gpus == 0
            self.local_out = out_features // n_gpus
            # 每张GPU的权重：(in_features, out_features/n_gpus)
            self.weights = [
                np.random.randn(in_features, self.local_out) * 0.02
                for _ in range(n_gpus)
            ]
        elif split == 'row':
            # 按行切分：每张GPU持有 in_features/n_gpus 行
            assert in_features % n_gpus == 0
            self.local_in = in_features // n_gpus
            # 每张GPU的权重：(in_features/n_gpus, out_features)
            self.weights = [
                np.random.randn(self.local_in, out_features) * 0.02
                for _ in range(n_gpus)
            ]
    
    def forward(self, x: np.ndarray) -> np.ndarray:
        """
        前向传播
        
        x: 输入张量 (batch, in_features)
        返回: 输出张量 (batch, out_features)
        """
        if self.split == 'column':
            # 列并行：每张GPU计算输出的一部分
            local_outputs = []
            for gpu_id in range(self.n_gpus):
                local_out = x @ self.weights[gpu_id]
                local_outputs.append(local_out)
            # 拼接：不涉及通信（假设NVLink互联）
            return np.concatenate(local_outputs, axis=-1)
        
        elif self.split == 'row':
            # 行并行：先切分输入
            x_splits = np.split(x, self.n_gpus, axis=-1)
            local_outputs = []
            for gpu_id in range(self.n_gpus):
                local_out = x_splits[gpu_id] @ self.weights[gpu_id]
                local_outputs.append(local_out)
            # AllReduce: 需要通信
            return sum(local_outputs)

class TensorParallelMLP:
    """
    Megatron-LM风格的张量并行MLP
    
    结构: Gate(列并行) → GeLU → Up(行并行) → AllReduce
    
    关键：列并行和行并行配对使用，中间不需要通信
    """
    
    def __init__(self, hidden_dim: int, intermediate_dim: int, n_gpus: int = 2):
        self.n_gpus = n_gpus
        
        # 第一个线性层：列并行
        # 原始: (hidden_dim, intermediate_dim)
        # 切分后每张GPU: (hidden_dim, intermediate_dim/n_gpus)
        self.gate_proj = TensorParallelLinear(
            hidden_dim, intermediate_dim, n_gpus, split='column'
        )
        
        # 第二个线性层：行并行
        # 原始: (intermediate_dim, hidden_dim)
        # 切分后每张GPU: (intermediate_dim/n_gpus, hidden_dim)
        self.up_proj = TensorParallelLinear(
            intermediate_dim, hidden_dim, n_gpus, split='row'
        )
    
    def forward(self, x: np.ndarray) -> np.ndarray:
        """
        前向传播
        
        通信分析：
        1. gate_proj(列并行): 无需通信
        2. GeLU激活: 无需通信（本地操作）
        3. up_proj(行并行): 一次AllReduce
        
        整个MLP块只需要一次AllReduce！
        """
        # 列并行：每张GPU得到 intermediate_dim/n_gpus 的输出
        h = self.gate_proj.forward(x)
        
        # 本地激活函数
        h = self._gelu(h)
        
        # 行并行：需要AllReduce
        output = self.up_proj.forward(h)
        
        return output
    
    @staticmethod
    def _gelu(x: np.ndarray) -> np.ndarray:
        """GELU激活函数的近似实现"""
        return 0.5 * x * (1 + np.tanh(np.sqrt(2 / np.pi) * (x + 0.044715 * x**3)))

# 演示张量并行MLP
np.random.seed(42)
batch_size = 4
hidden_dim = 512
intermediate_dim = 2048
n_gpus = 2

# 创建张量并行MLP
tp_mlp = TensorParallelMLP(hidden_dim, intermediate_dim, n_gpus)

# 模拟输入
x = np.random.randn(batch_size, hidden_dim)

# 前向传播
output = tp_mlp.forward(x)
print(f"输入形状: {x.shape}")
print(f"输出形状: {output.shape}")

# 显存分析
print(f"\n显存分析（每张GPU）:")
print(f"  Gate权重: {hidden_dim} x {intermediate_dim // n_gpus} x 2B = {hidden_dim * intermediate_dim // n_gpus * 2 / 1e6:.1f} MB")
print(f"  Up权重: {intermediate_dim // n_gpus} x {hidden_dim} x 2B = {intermediate_dim // n_gpus * hidden_dim * 2 / 1e6:.1f} MB")
print(f"  总权重: {(hidden_dim * intermediate_dim // n_gpus + intermediate_dim // n_gpus * hidden_dim) * 2 / 1e6:.1f} MB")
print(f"  原始总权重: {hidden_dim * intermediate_dim * 2 * 2 / 1e6:.1f} MB")
print(f"  节省: {(1 - 1/n_gpus) * 100:.0f}%")
```

#### 2.2 流水线并行（Pipeline Parallelism, PP）

流水线并行把模型按层切分到不同的GPU上。GPU 0负责前几层，GPU 1负责中间几层，GPU 2负责后面几层，以此类推。

```
┌────────────────────────────────────────────────────────────┐
│ 朴素流水线并行（效率低）                                      │
│                                                            │
│  GPU 0    GPU 1    GPU 2    GPU 3                         │
│  Layer    Layer    Layer    Layer                          │
│  0-5      6-11     12-17    18-23                         │
│                                                            │
│  时间 →                                                     │
│  [F0] ──→ [F1] ──→ [F2] ──→ [F3] ──→ [Loss]              │
│                                   ←── [B3] ←── [B2]       │
│                         ←── [B1] ←── [B0]                  │
│                                                            │
│  问题：GPU利用率极低，大部分时间在等待                          │
└────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────┐
│ 微批次流水线并行（效率高）                                    │
│                                                            │
│  把一个大batch切成多个micro-batch，流水线执行                  │
│                                                            │
│  GPU 0    GPU 1    GPU 2    GPU 3                         │
│  [F0m1]→ [F1m1]→ [F2m1]→ [F3m1]                         │
│  [F0m2]→ [F1m2]→ [F2m2]→ [F3m2]                         │
│  [F0m3]→ [F1m3]→ ...                                     │
│  [F0m4]→ ...                                              │
│                                                            │
│  前向和反向交叉进行，减少空闲时间（气泡）                       │
└────────────────────────────────────────────────────────────┘
```

```python
"""
流水线并行的概念实现
展示微批次流水线调度
"""
from dataclasses import dataclass
from typing import List, Optional
import numpy as np

@dataclass
class PipelineStage:
    """流水线的一个阶段（对应一组层）"""
    stage_id: int
    n_layers: int
    hidden_dim: int
    
    def forward(self, x: np.ndarray) -> np.ndarray:
        """模拟一个阶段的前向传播"""
        # 简化：用矩阵乘法模拟多层Transformer
        for _ in range(self.n_layers):
            weight = np.random.randn(self.hidden_dim, self.hidden_dim) * 0.02
            x = x @ weight
            x = np.maximum(x, 0)  # ReLU
        return x
    
    def backward(self, grad: np.ndarray) -> np.ndarray:
        """模拟反向传播（简化）"""
        return grad * 0.5  # 梯度缩放（简化）

class PipelineParallel:
    """流水线并行调度器"""
    
    def __init__(self, n_stages: int, n_layers_per_stage: int, 
                 hidden_dim: int, n_micro_batches: int = 4):
        self.n_stages = n_stages
        self.n_micro_batches = n_micro_batches
        
        self.stages = [
            PipelineStage(i, n_layers_per_stage, hidden_dim)
            for i in range(n_stages)
        ]
    
    def execute_naive(self, batch: np.ndarray) -> float:
        """
        朴素流水线：一个batch完成前向后，再做反向
        问题：GPU利用率很低
        """
        micro_batches = np.array_split(batch, self.n_micro_batches, axis=0)
        
        # 1. 全部前向传播
        activations = [[] for _ in range(self.n_stages + 1)]
        activations[0] = micro_batches
        
        for stage_id in range(self.n_stages):
            for mb_id in range(self.n_micro_batches):
                out = self.stages[stage_id].forward(activations[stage_id][mb_id])
                activations[stage_id + 1].append(out)
        
        # 2. 全部反向传播
        total_loss = 0
        for mb_id in range(self.n_micro_batches):
            loss = np.mean(activations[-1][mb_id] ** 2)  # 简化的loss
            total_loss += loss
            
            grad = 2 * activations[-1][mb_id] / activations[-1][mb_id].size
            for stage_id in range(self.n_stages - 1, -1, -1):
                grad = self.stages[stage_id].backward(grad)
        
        return total_loss / self.n_micro_batches
    
    def execute_gpipe(self, batch: np.ndarray) -> float:
        """
        GPipe风格流水线：微批次前向和反向交叉执行
        减少"气泡"（GPU空闲时间）
        """
        micro_batches = np.array_split(batch, self.n_micro_batches, axis=0)
        
        # 调度表：每个时间步每张GPU执行什么操作
        schedule = []
        
        # Phase 1: 前向传播（微批次依次进入流水线）
        forward_results = [[] for _ in range(self.n_stages)]
        for mb_id in range(self.n_micro_batches):
            activations = micro_batches[mb_id]
            for stage_id in range(self.n_stages):
                activations = self.stages[stage_id].forward(activations)
                forward_results[stage_id].append(activations)
                schedule.append((f't={len(schedule)}', f'GPU {stage_id}', 
                               f'Forward MB {mb_id}'))
        
        # Phase 2: 反向传播（微批次依次反向）
        total_loss = 0
        for mb_id in range(self.n_micro_batches):
            loss = np.mean(forward_results[-1][mb_id] ** 2)
            total_loss += loss
            
            grad = 2 * forward_results[-1][mb_id] / forward_results[-1][mb_id].size
            for stage_id in range(self.n_stages - 1, -1, -1):
                grad = self.stages[stage_id].backward(grad)
                schedule.append((f't={len(schedule)}', f'GPU {stage_id}', 
                               f'Backward MB {mb_id}'))
        
        # 打印调度表
        if True:  # 总是打印
            print("GPipe调度表:")
            for t, gpu, op in schedule[:20]:  # 只打印前20步
                print(f"  {t}: {gpu}: {op}")
            if len(schedule) > 20:
                print(f"  ... (共 {len(schedule)} 步)")
        
        # 计算气泡率
        total_steps = len(schedule)
        ideal_steps = self.n_micro_batches * self.n_stages * 2  # 无气泡的理想步数
        bubble_ratio = 1 - ideal_steps / total_steps if total_steps > 0 else 0
        print(f"\n气泡率: {bubble_ratio:.1%} (越低越好)")
        
        return total_loss / self.n_micro_batches

# 演示
np.random.seed(42)
batch = np.random.randn(32, 256)  # 32个样本，256维

pp = PipelineParallel(
    n_stages=4, 
    n_layers_per_stage=2, 
    hidden_dim=256,
    n_micro_batches=4
)

print("=== GPipe 流水线并行 ===")
loss = pp.execute_gpipe(batch)
print(f"Loss: {loss:.4f}")
```

#### 2.3 张量并行 vs 流水线并行

| 特性 | 张量并行 (TP) | 流水线并行 (PP) |
|------|-------------|---------------|
| 切分粒度 | 单层内部 | 层组之间 |
| 通信频率 | 每层都需要 | 只在阶段边界 |
| 通信带宽要求 | 高（需要NVLink） | 低（可以用InfiniBand） |
| 适用范围 | 节点内（同一台机器的GPU） | 节点间（不同机器的GPU） |
| 气泡问题 | 无 | 有（需要微批次缓解） |
| 典型值 | TP=2,4,8 | PP=2,4,8 |

**经验法则**：
- 张量并行适用于节点内（同一台机器的GPU之间，通过NVLink高速互联）
- 流水线并行适用于节点间（不同机器之间，通过InfiniBand互联）
- 数据并行适用于大规模扩展（在节点间复制模型）

### 三、ZeRO优化

ZeRO（Zero Redundancy Optimizer）是Microsoft DeepSpeed团队提出的显存优化技术。核心思想：**数据并行中，每张GPU保存了完整的模型参数、梯度和优化器状态，这是巨大的冗余。ZeRO通过切分这些冗余来降低显存占用。**

#### 3.1 ZeRO的三个阶段

```
┌─────────────────────────────────────────────────────────────┐
│ ZeRO的三个阶段                                               │
│                                                              │
│ 原始DDP（无优化）:                                            │
│ GPU 0: [完整参数] [完整梯度] [完整优化器状态]                    │
│ GPU 1: [完整参数] [完整梯度] [完整优化器状态]                    │
│ GPU 2: [完整参数] [完整梯度] [完整优化器状态]                    │
│ GPU 3: [完整参数] [完整梯度] [完整优化器状态]                    │
│ 冗余: 4x参数 + 4x梯度 + 4x优化器状态                           │
│                                                              │
│ ZeRO-1 (切分优化器状态):                                      │
│ GPU 0: [完整参数] [完整梯度] [优化器状态 1/4]                   │
│ GPU 1: [完整参数] [完整梯度] [优化器状态 2/4]                   │
│ GPU 2: [完整参数] [完整梯度] [优化器状态 3/4]                   │
│ GPU 3: [完整参数] [完整梯度] [优化器状态 4/4]                   │
│ 显存节省: ~4x（优化器状态占总显存的大部分）                      │
│                                                              │
│ ZeRO-2 (切分优化器状态 + 梯度):                                │
│ GPU 0: [完整参数] [梯度 1/4] [优化器状态 1/4]                  │
│ GPU 1: [完整参数] [梯度 2/4] [优化器状态 2/4]                  │
│ GPU 2: [完整参数] [梯度 3/4] [优化器状态 3/4]                  │
│ GPU 3: [完整参数] [梯度 4/4] [优化器状态 4/4]                  │
│ 显存节省: ~8x                                                 │
│                                                              │
│ ZeRO-3 (切分所有):                                            │
│ GPU 0: [参数 1/4] [梯度 1/4] [优化器状态 1/4]                  │
│ GPU 1: [参数 2/4] [梯度 2/4] [优化器状态 2/4]                  │
│ GPU 2: [参数 3/4] [梯度 3/4] [优化器状态 3/4]                  │
│ GPU 3: [参数 4/4] [梯度 4/4] [优化器状态 4/4]                  │
│ 显存节省: ~12x (与GPU数量成正比)                               │
│ 额外通信: 前向和反向时需要All-Gather参数                       │
└─────────────────────────────────────────────────────────────┘
```

```python
"""
ZeRO显存优化的数值分析
"""
import numpy as np

def analyze_memory(model_params_b: float, n_gpus: int, precision: str = 'fp16'):
    """
    分析不同并行策略下的显存占用
    
    参数:
        model_params_b: 模型参数量（单位：十亿）
        n_gpus: GPU数量
        precision: 'fp16' 或 'fp32'
    """
    bytes_per_param = 2 if precision == 'fp16' else 4
    params_bytes = model_params_b * 1e9 * bytes_per_param
    
    # Adam优化器的额外存储:
    # - FP32参数副本 (4B/param)
    # - 动量 (4B/param)
    # - 方差 (4B/param)
    optimizer_bytes = model_params_b * 1e9 * 12  # 3 * 4B
    
    # 梯度 (与参数同精度)
    gradient_bytes = params_bytes
    
    results = {}
    
    # DDP (无优化)
    ddp_per_gpu = params_bytes + gradient_bytes + optimizer_bytes
    results['DDP'] = {
        'params': params_bytes / 1e9,
        'gradients': gradient_bytes / 1e9,
        'optimizer': optimizer_bytes / 1e9,
        'total_per_gpu': ddp_per_gpu / 1e9,
        'total_all_gpus': ddp_per_gpu * n_gpus / 1e9,
    }
    
    # ZeRO-1: 切分优化器状态
    z1_per_gpu = params_bytes + gradient_bytes + optimizer_bytes / n_gpus
    results['ZeRO-1'] = {
        'params': params_bytes / 1e9,
        'gradients': gradient_bytes / 1e9,
        'optimizer': optimizer_bytes / n_gpus / 1e9,
        'total_per_gpu': z1_per_gpu / 1e9,
        'savings_vs_ddp': (1 - z1_per_gpu / ddp_per_gpu),
    }
    
    # ZeRO-2: 切分优化器状态 + 梯度
    z2_per_gpu = params_bytes + gradient_bytes / n_gpus + optimizer_bytes / n_gpus
    results['ZeRO-2'] = {
        'params': params_bytes / 1e9,
        'gradients': gradient_bytes / n_gpus / 1e9,
        'optimizer': optimizer_bytes / n_gpus / 1e9,
        'total_per_gpu': z2_per_gpu / 1e9,
        'savings_vs_ddp': (1 - z2_per_gpu / ddp_per_gpu),
    }
    
    # ZeRO-3: 切分所有
    z3_per_gpu = (params_bytes + gradient_bytes + optimizer_bytes) / n_gpus
    results['ZeRO-3'] = {
        'params': params_bytes / n_gpus / 1e9,
        'gradients': gradient_bytes / n_gpus / 1e9,
        'optimizer': optimizer_bytes / n_gpus / 1e9,
        'total_per_gpu': z3_per_gpu / 1e9,
        'savings_vs_ddp': (1 - z3_per_gpu / ddp_per_gpu),
    }
    
    return results

# 分析不同规模模型在不同策略下的显存需求
models = [
    ('Llama-2-7B', 7),
    ('Llama-2-13B', 13),
    ('Llama-2-70B', 70),
    ('Llama-3-405B', 405),
]

n_gpus = 8

for name, params_b in models:
    print(f"\n{'='*60}")
    print(f"模型: {name} ({params_b}B 参数)")
    print(f"GPU: {n_gpus} x A100-80GB")
    print(f"{'='*60}")
    
    results = analyze_memory(params_b, n_gpus)
    
    for strategy, data in results.items():
        if 'savings_vs_ddp' in data:
            print(f"  {strategy:8s}: {data['total_per_gpu']:8.1f} GB/GPU "
                  f"(节省 {data['savings_vs_ddp']:.1%})")
        else:
            print(f"  {strategy:8s}: {data['total_per_gpu']:8.1f} GB/GPU")
    
    # 判断能否在A100-80GB上运行（预留20GB给激活值）
    available = 60  # 80GB - 20GB激活值预留
    z3_per_gpu = results['ZeRO-3']['total_per_gpu']
    feasible = "✓ 可以" if z3_per_gpu <= available else "✗ 不够"
    print(f"  ZeRO-3可行性: {feasible} (需要 {z3_per_gpu:.1f}GB, 可用 {available}GB)")
```

#### 3.2 ZeRO-3的通信开销

ZeRO-3通过切分参数来节省显存，但代价是额外的通信：

- **前向传播时**：需要All-Gather当前层的参数（从其他GPU收集该层的完整参数）
- **反向传播时**：需要All-Gather当前层的参数，然后Reduce-Scatter梯度（把梯度发送给"拥有"该参数的GPU）

这意味着ZeRO-3的通信量大约是DDP的1.5倍。但因为通信可以和计算重叠（pipeline），实际训练速度的下降通常在10-20%。

### 四、3D并行

3D并行是将数据并行（DP）、张量并行（TP）和流水线并行（PP）组合使用的策略。这是训练超大规模模型的标准方法。

```
┌────────────────────────────────────────────────────────────────────┐
│ 3D并行示例: 64张GPU                                                 │
│                                                                    │
│ DP=4 (4个数据并行组)                                                │
│ PP=2 (每个数据并行组内，模型分成2个流水线阶段)                         │
│ TP=8 (每个流水线阶段内，层参数切分到8张GPU)                           │
│                                                                    │
│ 4 x 2 x 8 = 64 张GPU                                              │
│                                                                    │
│ ┌──────────────────────────────────────────────────────────────┐  │
│ │ DP Group 0                                                   │  │
│ │ ┌─────────────────────┬─────────────────────┐                │  │
│ │ │ Pipeline Stage 0     │ Pipeline Stage 1     │                │  │
│ │ │ [TP: 8 GPUs]        │ [TP: 8 GPUs]        │                │  │
│ │ │ Layers 0-15         │ Layers 16-31        │                │  │
│ │ └─────────────────────┴─────────────────────┘                │  │
│ ├──────────────────────────────────────────────────────────────┤  │
│ │ DP Group 1 (同上)                                            │  │
│ ├──────────────────────────────────────────────────────────────┤  │
│ │ DP Group 2 (同上)                                            │  │
│ ├──────────────────────────────────────────────────────────────┤  │
│ │ DP Group 3 (同上)                                            │  │
│ └──────────────────────────────────────────────────────────────┘  │
│                                                                    │
│ 通信拓扑:                                                          │
│ - TP: NVLink (节点内, 900GB/s)                                     │
│ - PP: InfiniBand (节点间, 400Gb/s)                                 │
│ - DP: InfiniBand (节点间, AllReduce梯度)                           │
└────────────────────────────────────────────────────────────────────┘
```

```python
"""
3D并行配置计算器
帮你决定如何分配GPU
"""

def compute_3d_parallel_config(
    model_params_b: float,
    n_gpus: int,
    gpu_memory_gb: float = 80,
    hidden_dim: int = 8192,
    n_layers: int = 32,
):
    """
    计算3D并行的最优配置
    
    参数:
        model_params_b: 模型参数量（十亿）
        n_gpus: 总GPU数量
        gpu_memory_gb: 每张GPU的显存（GB）
        hidden_dim: 模型隐藏维度
        n_layers: Transformer层数
    """
    # 显存需求估算（FP16 + Adam）
    bytes_per_param = 16  # 参数(2B) + 梯度(2B) + 优化器(12B)
    total_memory_gb = model_params_b * 1e9 * bytes_per_param / 1e9
    
    # 约束条件
    configs = []
    
    for tp in [1, 2, 4, 8]:
        if n_gpus % tp != 0:
            continue
        
        for pp in [1, 2, 4, 8, 16]:
            if (n_gpus // tp) % pp != 0:
                continue
            
            dp = n_gpus // (tp * pp)
            if dp < 1:
                continue
            
            # 每张GPU的显存需求
            # 参数被TP和PP同时切分
            params_per_gpu = model_params_b / (tp * pp)  # ZeRO-3不额外切分
            
            # 显存估算
            memory_per_gpu = total_memory_gb / (tp * pp)  # 简化估算
            
            # TP通信：每层2次AllReduce (前向1次，反向1次)
            # PP通信：每个stage边界1次点对点通信
            # DP通信：每步1次AllReduce
            
            tp_comm_per_layer = 2  # AllReduce次数
            pp_comm_per_step = (pp - 1) * 2  # 前向+反向的点对点
            dp_comm_per_step = 1  # 梯度AllReduce
            
            # 气泡率估算（简化）
            n_micro_batches = dp * 4  # 典型值
            bubble_ratio = (pp - 1) / n_micro_batches
            
            feasible = memory_per_gpu <= gpu_memory_gb * 0.7  # 预留30%给激活值
            
            configs.append({
                'tp': tp, 'pp': pp, 'dp': dp,
                'total': tp * pp * dp,
                'memory_per_gpu_gb': memory_per_gpu,
                'feasible': feasible,
                'bubble_ratio': bubble_ratio,
                'dp_comm_per_step': dp_comm_per_step,
            })
    
    # 按可行性排序，优先选择可行且DP最大的配置
    configs.sort(key=lambda c: (-c['feasible'], -c['dp'], c['bubble_ratio']))
    
    print(f"3D并行配置分析: {model_params_b}B参数, {n_gpus} GPU, {gpu_memory_gb}GB/GPU")
    print(f"{'TP':>3} {'PP':>3} {'DP':>3} | {'GPU总数':>6} | {'显存/GPU':>10} | {'可行':>4} | {'气泡率':>6}")
    print("-" * 60)
    
    for c in configs[:10]:  # 显示前10个配置
        print(f"{c['tp']:3d} {c['pp']:3d} {c['dp']:3d} | "
              f"{c['total']:6d} | "
              f"{c['memory_per_gpu_gb']:8.1f}GB | "
              f"{'✓' if c['feasible'] else '✗':>4} | "
              f"{c['bubble_ratio']:5.1%}")
    
    return configs

# 示例
print("=== Llama-2-70B, 64 GPUs ===")
configs_70b = compute_3d_parallel_config(70, 64, gpu_memory_gb=80)

print(f"\n=== Llama-3-405B, 1024 GPUs ===")
configs_405b = compute_3d_parallel_config(405, 1024, gpu_memory_gb=80)
```

### 五、FSDP（Fully Sharded Data Parallel）

FSDP是PyTorch原生的ZeRO-3实现。与DeepSpeed ZeRO-3相比，FSDP有更好的PyTorch集成和更简单的API。

```python
"""
PyTorch FSDP 使用示例
展示如何在FSDP模式下训练一个大模型

运行方式: torchrun --nproc_per_node=4 fsdp_example.py
"""

import torch
import torch.nn as nn
from torch.distributed.fsdp import FullyShardedDataParallel as FSDP
from torch.distributed.fsdp import ShardingStrategy, MixedPrecision
from torch.distributed.fsdp.wrap import transformer_auto_wrap_policy

class TransformerBlock(nn.Module):
    def __init__(self, dim=2048, n_heads=8):
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
        # Self-attention with residual
        residual = x
        x = self.ln1(x)
        x, _ = self.attention(x, x, x)
        x = residual + x
        # FFN with residual
        residual = x
        x = self.ln2(x)
        x = self.ffn(x)
        x = residual + x
        return x

class LLMModel(nn.Module):
    def __init__(self, vocab_size=32000, dim=2048, n_layers=24, n_heads=8):
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

def train_fsdp():
    """
    FSDP训练的主函数
    
    关键配置：
    1. ShardingStrategy: 
       - FULL_SHARD: 等同ZeRO-3（最省显存，通信最多）
       - SHARD_GRAD_OP: 等同ZeRO-2（平衡方案）
       - NO_SHARD: 等同DDP（不切分）
    
    2. MixedPrecision: 自动处理混合精度训练
    
    3. auto_wrap_policy: 决定如何把模型分成多个"分片单元"
    """
    import os
    import torch.distributed as dist
    
    # 初始化
    dist.init_process_group(backend='nccl')
    local_rank = int(os.environ['LOCAL_RANK'])
    torch.cuda.set_device(local_rank)
    
    # 混合精度配置
    bf16_mp = MixedPrecision(
        param_dtype=torch.bfloat16,
        reduce_dtype=torch.bfloat16,
        buffer_dtype=torch.bfloat16,
    )
    
    # 创建模型
    model = LLMModel(
        vocab_size=32000,
        dim=2048,
        n_layers=24,
        n_heads=8,
    )
    
    # 定义分片策略：每个TransformerBlock作为独立的分片单元
    auto_wrap_policy = transformer_auto_wrap_policy(
        transformer_layer_cls={TransformerBlock}
    )
    
    # 用FSDP包装
    model = FSDP(
        model,
        sharding_strategy=ShardingStrategy.FULL_SHARD,  # ZeRO-3
        mixed_precision=bf16_mp,
        auto_wrap_policy=auto_wrap_policy,
        device_id=local_rank,
    )
    
    # 训练循环
    optimizer = torch.optim.AdamW(model.parameters(), lr=1e-4)
    
    for step in range(100):
        # 生成模拟数据
        input_ids = torch.randint(0, 32000, (4, 512)).cuda()
        
        optimizer.zero_grad()
        logits = model(input_ids)
        loss = nn.functional.cross_entropy(
            logits[:, :-1].reshape(-1, 32000),
            input_ids[:, 1:].reshape(-1),
        )
        loss.backward()
        optimizer.step()
        
        if step % 10 == 0 and local_rank == 0:
            print(f"Step {step}, Loss: {loss.item():.4f}")
    
    dist.destroy_process_group()

# 注意：此代码需要通过 torchrun 运行
# torchrun --nproc_per_node=4 fsdp_example.py
```

### 六、DeepSpeed ZeRO 实践

DeepSpeed是Microsoft开发的分布式训练框架，ZeRO是其中的核心特性。

```python
"""
DeepSpeed ZeRO 配置文件示例
通常保存为 ds_config.json
"""

ds_config_zero3 = {
    "train_batch_size": 128,
    "train_micro_batch_size_per_gpu": 4,
    "gradient_accumulation_steps": 4,
    
    # ZeRO优化配置
    "zero_optimization": {
        "stage": 3,  # ZeRO-3: 切分参数+梯度+优化器状态
        
        # 参数卸载到CPU（进一步节省GPU显存）
        "offload_param": {
            "device": "cpu",
            "pin_memory": True
        },
        
        # 优化器状态卸载到CPU
        "offload_optimizer": {
            "device": "cpu",
            "pin_memory": True
        },
        
        # 通信重叠
        "overlap_comm": True,
        "contiguous_gradients": True,
        
        # 参数收集的chunk大小
        "stage3_prefetch_bucket_size": "auto",
        "stage3_param_persistence_threshold": "auto",
        "stage3_max_live_parameters": 1e9,
        "stage3_max_reuse_distance": 1e9,
    },
    
    # 混合精度训练
    "bf16": {
        "enabled": True,
    },
    
    # 梯度裁剪
    "gradient_clipping": 1.0,
    
    # 学习率调度
    "scheduler": {
        "type": "WarmupDecayLR",
        "params": {
            "warmup_min_lr": 0,
            "warmup_max_lr": 2e-5,
            "warmup_num_steps": 1000,
            "total_num_steps": 100000,
        }
    },
}

ds_config_zero2 = {
    "train_batch_size": 128,
    "train_micro_batch_size_per_gpu": 8,
    
    "zero_optimization": {
        "stage": 2,  # ZeRO-2: 切分梯度+优化器状态
        "offload_optimizer": {
            "device": "cpu",  # 优化器卸载到CPU
            "pin_memory": True
        },
        "overlap_comm": True,
        "contiguous_gradients": True,
    },
    
    "bf16": {
        "enabled": True,
    },
    
    "gradient_clipping": 1.0,
}

# DeepSpeed与Hugging Face Transformers结合使用
# 启动命令:
# deepspeed --num_gpus=8 train.py --deepspeed ds_config.json

print("DeepSpeed ZeRO 配置文件已创建")
print(f"\nZeRO-3 配置要点:")
print(f"  - stage 3: 参数+梯度+优化器全部切分")
print(f"  - offload_param/offload_optimizer: 卸载到CPU进一步节省显存")
print(f"  - overlap_comm: 通信和计算重叠")
print(f"\nZeRO-2 配置要点:")
print(f"  - stage 2: 梯度+优化器切分，参数完整保留")
print(f"  - 适合模型参数能放进单张GPU但优化器状态放不下的场景")
```

## 代码示例（完整可运行的 Python）

```python
"""
分布式训练策略选择器
根据你的硬件和模型规模，推荐最合适的训练策略
"""
import numpy as np
from dataclasses import dataclass
from typing import List, Dict, Optional

@dataclass
class GPUConfig:
    name: str
    memory_gb: float
    fp16_tflops: float
    nvlink_bandwidth_gbs: float  # 节点内带宽

@dataclass 
class ModelConfig:
    name: str
    params_b: float  # 十亿参数
    hidden_dim: int
    n_layers: int
    n_heads: int
    vocab_size: int = 32000

@dataclass
class TrainingConfig:
    batch_size: int
    seq_length: int
    precision: str = 'bf16'

class DistributedTrainingAdvisor:
    """分布式训练策略推荐器"""
    
    # 常见GPU规格
    GPUs = {
        'A100-40GB': GPUConfig('A100-40GB', 40, 312, 600),
        'A100-80GB': GPUConfig('A100-80GB', 80, 312, 600),
        'H100-80GB': GPUConfig('H100-80GB', 80, 990, 900),
        'H200-141GB': GPUConfig('H200-141GB', 141, 990, 900),
        'RTX-4090': GPUConfig('RTX-4090', 24, 165, 64),  # 无NVLink
    }
    
    def __init__(self, model: ModelConfig, gpu_type: str, n_gpus: int,
                 training: TrainingConfig):
        self.model = model
        self.gpu = self.GPUs[gpu_type]
        self.n_gpus = n_gpus
        self.training = training
    
    def estimate_memory(self) -> dict:
        """估算显存需求"""
        p = self.model.params_b * 1e9
        
        if self.training.precision in ('fp16', 'bf16'):
            param_bytes = p * 2  # 参数
            grad_bytes = p * 2   # 梯度
            opt_bytes = p * 12   # Adam: FP32副本(4) + 动量(4) + 方差(4)
        else:
            param_bytes = p * 4
            grad_bytes = p * 4
            opt_bytes = p * 12
        
        # 激活值估算（粗略）
        # 每层激活: batch_size * seq_length * hidden_dim * 2 bytes
        activation_per_layer = (self.training.batch_size * self.training.seq_length * 
                               self.model.hidden_dim * 2)
        total_activation = activation_per_layer * self.model.n_layers
        
        total = param_bytes + grad_bytes + opt_bytes + total_activation
        
        return {
            'parameters_gb': param_bytes / 1e9,
            'gradients_gb': grad_bytes / 1e9,
            'optimizer_gb': opt_bytes / 1e9,
            'activations_gb': total_activation / 1e9,
            'total_gb': total / 1e9,
            'per_gpu_available_gb': self.gpu.memory_gb * 0.75,  # 预留25%
        }
    
    def recommend_strategy(self) -> dict:
        """推荐最优训练策略"""
        mem = self.estimate_memory()
        total_needed = mem['total_gb']
        gpu_available = mem['per_gpu_available_gb']
        
        recommendations = []
        
        # 检查是否能单卡运行（不需要分布式）
        if total_needed <= gpu_available:
            recommendations.append({
                'strategy': '单卡训练',
                'feasible': True,
                'description': f'模型完全可以在单张{self.gpu.name}上训练',
                'memory_usage': f'{total_needed:.1f}GB / {gpu_available:.1f}GB',
            })
        
        # 检查DDP
        non_model_mem = mem['activations_gb']  # 激活值不能被DDP切分
        model_mem_per_gpu = mem['parameters_gb'] + mem['gradients_gb'] + mem['optimizer_gb']
        ddp_feasible = model_mem_per_gpu + non_model_mem <= gpu_available
        
        recommendations.append({
            'strategy': 'DDP (数据并行)',
            'feasible': ddp_feasible,
            'description': f'每张GPU需要{model_mem_per_gpu + non_model_mem:.1f}GB' if not ddp_feasible else f'每张GPU约{model_mem_per_gpu + non_model_mem:.1f}GB',
            'recommended_gpus': max(1, self.n_gpus),
            'memory_per_gpu': model_mem_per_gpu + non_model_mem,
        })
        
        # 检查ZeRO-2
        zero2_model_per_gpu = mem['parameters_gb'] + (mem['gradients_gb'] + mem['optimizer_gb']) / self.n_gpus
        zero2_feasible = zero2_model_per_gpu + non_model_mem <= gpu_available
        
        recommendations.append({
            'strategy': 'ZeRO-2 (切分梯度+优化器)',
            'feasible': zero2_feasible,
            'description': f'每张GPU约{zero2_model_per_gpu + non_model_mem:.1f}GB',
            'memory_per_gpu': zero2_model_per_gpu + non_model_mem,
            'savings': f'{(1 - zero2_model_per_gpu / model_mem_per_gpu):.0%} vs DDP',
        })
        
        # 检查ZeRO-3
        zero3_per_gpu = total_needed / self.n_gpus
        zero3_feasible = zero3_per_gpu <= gpu_available
        
        recommendations.append({
            'strategy': 'ZeRO-3 / FSDP (切分全部)',
            'feasible': zero3_feasible,
            'description': f'每张GPU约{zero3_per_gpu:.1f}GB',
            'memory_per_gpu': zero3_per_gpu,
            'savings': f'{(1 - zero3_per_gpu / (model_mem_per_gpu + non_model_mem)):.0%} vs DDP',
        })
        
        # 检查3D并行需求
        if not zero3_feasible:
            tp_candidates = [t for t in [2, 4, 8] if zero3_per_gpu / t <= gpu_available]
            if tp_candidates:
                tp = tp_candidates[0]
                recommendations.append({
                    'strategy': f'3D并行 (ZeRO-3 + TP={tp})',
                    'feasible': True,
                    'description': f'ZeRO-3 + 张量并行 TP={tp}',
                    'memory_per_gpu': zero3_per_gpu / tp,
                })
        
        return {
            'model': self.model.name,
            'gpu': f'{self.n_gpus}x {self.gpu.name}',
            'total_memory_needed': f'{total_needed:.1f}GB',
            'per_gpu_available': f'{gpu_available:.1f}GB',
            'recommendations': recommendations,
        }

# 使用示例
print("="*70)
print("分布式训练策略推荐")
print("="*70)

# 场景1: 7B模型微调，4张RTX 4090
advisor1 = DistributedTrainingAdvisor(
    model=ModelConfig('Llama-2-7B', 7, 4096, 32, 32),
    gpu_type='RTX-4090',
    n_gpus=4,
    training=TrainingConfig(batch_size=4, seq_length=2048)
)
result1 = advisor1.recommend_strategy()
print(f"\n场景1: {result1['model']} on {result1['gpu']}")
for r in result1['recommendations']:
    print(f"  {r['strategy']}: {'✓' if r['feasible'] else '✗'} - {r.get('description', '')}")

# 场景2: 70B模型，8张A100-80GB
advisor2 = DistributedTrainingAdvisor(
    model=ModelConfig('Llama-2-70B', 70, 8192, 80, 64),
    gpu_type='A100-80GB',
    n_gpus=8,
    training=TrainingConfig(batch_size=2, seq_length=4096)
)
result2 = advisor2.recommend_strategy()
print(f"\n场景2: {result2['model']} on {result2['gpu']}")
for r in result2['recommendations']:
    print(f"  {r['strategy']}: {'✓' if r['feasible'] else '✗'} - {r.get('description', '')}")

# 场景3: 405B模型，256张H100
advisor3 = DistributedTrainingAdvisor(
    model=ModelConfig('Llama-3-405B', 405, 16384, 126, 128),
    gpu_type='H100-80GB',
    n_gpus=256,
    training=TrainingConfig(batch_size=1, seq_length=8192)
)
result3 = advisor3.recommend_strategy()
print(f"\n场景3: {result3['model']} on {result3['gpu']}")
for r in result3['recommendations']:
    print(f"  {r['strategy']}: {'✓' if r['feasible'] else '✗'} - {r.get('description', '')}")
```

## 真实案例

### 案例1：Meta训练Llama-2-70B

Meta在Llama-2论文中描述了70B模型的训练配置：
- **硬件**：使用约2,000张A100-80GB GPU
- **策略**：3D并行（TP=8, PP=?）
- **训练时间**：约1,720,320 GPU小时
- **通信优化**：使用NVLink进行节点内通信，InfiniBand进行节点间通信
- **容错**：训练过程中平均每2-3天出现一次硬件故障，自动恢复机制

### 案例2：DeepSpeed训练176B参数模型

Microsoft使用DeepSpeed ZeRO-3训练了176B参数的模型：
- **ZeRO-3 + NVMe Offload**：不仅将参数卸载到CPU，还进一步卸载到NVMe SSD
- **效果**：单张V100-32GB GPU就能训练176B参数的模型（虽然速度很慢）
- **意义**：证明了即使硬件资源有限，通过极致的显存优化也能训练超大模型

### 案例3：LLaMA-Factory的开源实践

LLaMA-Factory是一个流行的开源LLM微调框架，支持多种并行策略：
- **小模型（<7B）**：单卡 + LoRA
- **中等模型（7B-30B）**：DDP或ZeRO-2，2-4卡
- **大模型（30B-70B）**：ZeRO-3或FSDP，4-8卡
- **超大模型（>70B）**：3D并行，需要多节点

## 权衡取舍以及何时不该使用

### 通信 vs 计算的权衡

分布式训练的核心权衡是：**更多的并行度带来更低的显存需求，但更高的通信开销。**

- **TP=2**：每层2次AllReduce，通信量翻倍
- **TP=4**：每层2次AllReduce，通信量3倍
- **PP=2**：气泡率约50%（只有2个micro-batch时）
- **ZeRO-3**：前向和反向各需要一次All-Gather

当GPU的计算能力远大于通信能力时（消费级GPU，无NVLink），增加并行度的收益可能为负。

### 何时不该使用分布式训练

1. **模型能单卡放下**：如果模型参数+梯度+优化器能在单卡上运行，单卡训练通常比多卡更快（无通信开销）。
2. **数据量很小**：如果训练数据只有几千条，多卡的加速效果有限。
3. **推理任务**：推理通常不需要分布式训练的技术，而是用推理优化技术（量化、蒸馏等）。
4. **LoRA等参数高效微调**：如果你只用LoRA微调7B模型的少量参数，单张消费级GPU就够了，不需要分布式训练。

### ZeRO-2 vs ZeRO-3 的选择

| 场景 | 推荐 | 原因 |
|------|------|------|
| 参数能放进GPU，优化器放不下 | ZeRO-2 | 无需All-Gather参数 |
| 参数放不进GPU | ZeRO-3 | 必须切分参数 |
| 追求训练速度 | ZeRO-2 | 通信开销更小 |
| 追求最大模型规模 | ZeRO-3 | 显存优化最极致 |

## 关键要点

1. **数据并行（DDP）是最简单的并行策略**，每张GPU持有一个完整的模型副本，处理不同的数据。适合模型能单卡放下的场景。通信操作是AllReduce（同步梯度）。

2. **张量并行（TP）把单层参数切分到多张GPU**，适合节点内（NVLink互联）的细粒度并行。Megatron-LM的列并行+行并行配对是经典设计，一个MLP块只需要一次AllReduce。

3. **流水线并行（PP）把层组切分到不同GPU**，适合节点间（InfiniBand互联）的粗粒度并行。GPipe的微批次调度通过增加micro-batch数量来减少气泡率。

4. **ZeRO通过切分冗余数据来降低显存**。ZeRO-1切分优化器状态，ZeRO-2额外切分梯度，ZeRO-3切分所有。ZeRO-3与FSDP本质上是同一个思路。

5. **3D并行是训练超大模型的标准方法**。典型配置：TP用于节点内，PP用于层组切分，DP用于大规模扩展。选择正确的TP/PP/DP比例需要考虑通信带宽、显存需求和计算效率。

6. **通信是分布式训练的最大瓶颈**。NVLink（900GB/s）>> InfiniBand（50GB/s）>> 以太网（1.25GB/s）。确保TP在NVLink节点内，PP和DP的跨节点通信尽量少。

7. **FSDP是PyTorch原生的推荐方案**，与DeepSpeed ZeRO-3功能等价但API更简洁。新项目建议从FSDP开始。

## 延伸阅读

**论文**：
- "ZeRO: Memory Optimizations Toward Training Trillion Parameter Models" (Rajbhandari et al., 2020) — ZeRO优化器原始论文
- "Efficient Large-Scale Language Model Training on GPU Clusters Using Megatron-LM" (NVIDIA, 2021) — 3D并行
- "GPipe: Efficient Training of Giant Neural Networks using Pipeline Parallelism" (Huang et al., 2019) — 流水线并行
- "Megatron-LM: Training Multi-Billion Parameter Language Models" (Shoeybi et al., 2019) — 张量并行

**框架文档**：
- PyTorch FSDP Tutorial — PyTorch官方FSDP教程
- DeepSpeed Documentation — DeepSpeed官方文档
- Megatron-LM GitHub — NVIDIA的Megatron-LM实现
- LLaMA-Factory Documentation — 包含完整的分布式训练配置示例

**教程**：
- Stas Bekman's ML Engineering Guide — 大规模训练的工程实践
- Hugging Face Accelerate Documentation — 简化分布式训练的高层API
- UvA Deep Learning Notebooks — 张量并行和流水线并行的交互式教程

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
