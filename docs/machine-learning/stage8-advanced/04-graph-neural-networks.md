# 图神经网络：节点分类、图分类与 GAT/GCN——理解非欧几里得数据

<!--
调研来源：
1. "Semi-Supervised Classification with Graph Convolutional Networks" (Kipf & Welling, ICLR 2017) — GCN 原始论文
2. "Graph Attention Networks" (Veličković et al., ICLR 2018) — GAT 原始论文
3. "Inductive Representation Learning on Large Graphs" (Hamilton et al., NeurIPS 2017) — GraphSAGE
4. "Neural Message Passing for Quantum Chemistry" (Gilmer et al., ICML 2017) — MPNN 统一框架
5. "A Theoretical Analysis of Graph (Over)smoothing" (NeurIPS 2022) — 过平滑问题的理论分析
6. "Demystifying Oversmoothing in Attention-Based GNNs" (NeurIPS 2023) — GAT过平滑分析
7. "Best Graph Neural Network Architectures: GCN, GAT, MPNN and More" (AI Summer, 2024) — GNN 架构综述
8. "Message Passing: How Graph Neural Networks Actually Work" (Kumo AI / PyG, 2024) — 消息传递机制详解
9. "Graph Transformer for Node Label Prediction with PyG" (Medium, 2024) — Graph Transformer 实践
10. "A Graph Neural Network Survey" (People@MIT, 2025) — 2025年GNN综述

核心发现：图神经网络（GNN）是处理图结构数据（社交网络、分子、知识图谱、交通网络）的核心方法。消息传递（Message Passing）是所有GNN的统一框架：每个节点从邻居收集信息、聚合、更新。GCN用固定的归一化聚合权重，GAT用注意力机制学习权重。过平滑（Over-smoothing）是深层GNN的核心挑战——层数增多后节点表示趋于相同。当前前沿包括Graph Transformer（将Transformer的自注意力扩展到图数据）、表达能力更强的MPNN变体、以及GNN与LLM的结合。
-->

**TL;DR：** 图神经网络（GNN）处理的是"非欧几里得"数据——社交网络、分子结构、知识图谱等。本文从消息传递的核心机制讲起，实现 GCN 和 GAT 两种经典架构，覆盖节点分类和图分类两大任务，讨论过平滑问题及其解决方案。

## 为什么这很重要

现实世界中大量的数据天然就是图结构的：

- **社交网络**：用户是节点，关注/好友关系是边。推荐系统需要理解图的拓扑结构
- **分子结构**：原子是节点，化学键是边。药物发现需要预测分子的性质
- **知识图谱**：实体是节点，关系是边。搜索引擎需要推理实体间的隐含关系
- **交通网络**：路口是节点，道路是边。导航系统需要预测拥堵
- **代码分析**：函数是节点，调用关系是边。代码审查需要理解依赖关系
- **推荐系统**：用户和商品是节点，交互是边。推荐需要建模二部图

传统的 CNN 处理网格数据（图像），RNN 处理序列数据（文本），但都无法直接处理图结构数据。GNN 填补了这个空白——它是处理关系型数据的通用框架。

## 核心概念

### 什么是图数据？

```
┌────────────────────────────────────────────────────────────┐
│                    图数据的表示                              │
│                                                            │
│  图 G = (V, E)                                             │
│  V = 节点集合 {v₁, v₂, ..., vₙ}                            │
│  E = 边集合 {(vᵢ, vⱼ), ...}                                │
│                                                            │
│  三种核心数据结构：                                          │
│                                                            │
│  1. 节点特征 X ∈ R^{n×d}                                   │
│     每个节点有一个 d 维特征向量                               │
│     例：用户的年龄、性别、兴趣向量                            │
│                                                            │
│  2. 邻接矩阵 A ∈ R^{n×n}                                   │
│     A[i][j] = 1 表示节点 i 和 j 之间有边                    │
│     例：用户 i 关注了用户 j                                 │
│                                                            │
│  3. 边特征（可选）E_feat ∈ R^{|E|×d_e}                      │
│     每条边有一个特征向量                                     │
│     例：关系的类型（朋友、同事、家人）                         │
│                                                            │
│  示例图：                                                   │
│                                                            │
│    (A) ──── (B)                                            │
│     │  ╲     │                                             │
│     │   ╲    │                                             │
│    (C)──(D)─(E)                                            │
│                                                            │
│  邻接矩阵：                                                 │
│      A  B  C  D  E                                         │
│  A [ 0  1  1  1  0 ]                                      │
│  B [ 1  0  0  0  1 ]                                      │
│  C [ 1  0  0  1  0 ]                                      │
│  D [ 1  0  1  0  1 ]                                      │
│  E [ 0  1  0  1  0 ]                                      │
└────────────────────────────────────────────────────────────┘
```

### 消息传递——GNN的统一框架

所有图神经网络的核心都是**消息传递（Message Passing）**。每个节点通过三个步骤更新自己的表示：

1. **消息生成（Message）**：每个邻居节点生成一条"消息"
2. **聚合（Aggregate）**：收集所有邻居的消息，合并为一个向量
3. **更新（Update）**：结合自身当前表示和聚合后的邻居信息，更新自己的表示

```python
"""
消息传递的伪代码

对于每个节点 v：
    messages = {}
    for 每个邻居 u of v:
        messages[u] = message_fn(h_u, h_v, edge_feature)
    
    aggregated = aggregate_fn(messages)  # 如求和、平均、最大值
    h_v_new = update_fn(h_v, aggregated)
"""

# 不同GNN的区别在于 message_fn、aggregate_fn、update_fn 的具体实现：
#
# GCN: message = W · h_u（线性变换）
#      aggregate = 均值（用度归一化）
#      update = σ(aggregated)（激活函数）
#
# GAT: message = α_uv · W · h_u（注意力加权的线性变换）
#      aggregate = 加权求和
#      update = 激活函数
#
# GraphSAGE: message = W · h_u
#            aggregate = LSTM / Pool / Mean
#            update = concat + linear(h_v, aggregated)
```

### GNN 的两大任务

| 任务 | 输入 | 输出 | 示例 |
|------|------|------|------|
| 节点分类 | 图 + 部分节点标签 | 每个节点的类别 | 论文主题分类、用户画像 |
| 图分类 | 多个图 + 图级标签 | 每个图的类别 | 分子毒性预测、蛋白质功能分类 |
| 链接预测 | 图 | 节点对之间是否有边 | 好友推荐、知识图谱补全 |
| 边分类 | 图 | 每条边的类别 | 关系类型预测 |

## 工作原理（简化的心智模型）

### 用"朋友圈八卦传播"来理解 GNN

**消息传递** = 朋友圈里的信息传播。每个人（节点）通过和朋友交流（边）来获取信息。

**GCN** = 每个人把所有朋友的信息取平均，加上自己的信息，形成新的认识。但"平均"意味着每个朋友的影响力相同——无论是密友还是泛泛之交。

**GAT** = 你对不同朋友的信任程度不同。GAT 自动学习每对朋友之间的"注意力权重"——密友的话权重高，陌生人的话权重低。这更符合真实的信息传播方式。

**过平滑问题** = 如果信息传播太多轮（GNN太深），所有人的认识都趋同了——大家都知道了同样的事情，失去了个性。这就像八卦传了太多轮，最终每个人的认知都变成了"大众共识"，失去了个体特色。

**图分类** = 先通过消息传递让每个节点获得丰富的表示，然后用一个"总结"步骤（读出/Readout）把所有节点的信息汇总为一个图级别的向量，再分类。

## 工作原理（详细机制）

### 一、GCN——图卷积网络

GCN（Graph Convolutional Network）由 Kipf & Welling 在 2017 年提出，是图神经网络最经典的架构。

**核心公式**：

```
H^(l+1) = σ(D̃^(-1/2) Ã D̃^(-1/2) H^(l) W^(l))
```

其中：
- Ã = A + I（邻接矩阵加自环，让节点考虑自身）
- D̃ 是 Ã 的度矩阵
- H^(l) 是第 l 层的节点表示
- W^(l) 是可学习的权重矩阵
- σ 是激活函数（如 ReLU）

**直觉解读**：
- `D̃^(-1/2) Ã D̃^(-1/2)` 是归一化的邻接矩阵——让每个节点的更新受其度数影响。度数高的节点（朋友多）信息被稀释，度数低的节点（朋友少）信息更集中
- `H^(l) W^(l)` 对每个节点的特征做线性变换
- σ 引入非线性

```python
"""
GCN 层的完整实现
"""

import torch
import torch.nn as nn
import torch.nn.functional as F
from typing import Optional


class GCNLayer(nn.Module):
    """
    GCN 图卷积层
    
    H^(l+1) = σ(D̃^(-1/2) Ã D̃^(-1/2) H^(l) W^(l))
    
    参数：
        in_features: 输入特征维度
        out_features: 输出特征维度
        bias: 是否使用偏置
    """
    def __init__(self, in_features: int, out_features: int, 
                 bias: bool = True):
        super().__init__()
        self.weight = nn.Parameter(
            torch.FloatTensor(in_features, out_features)
        )
        if bias:
            self.bias = nn.Parameter(
                torch.FloatTensor(out_features)
            )
        else:
            self.register_parameter('bias', None)
        self.reset_parameters()
    
    def reset_parameters(self):
        nn.init.xavier_uniform_(self.weight)
        if self.bias is not None:
            nn.init.zeros_(self.bias)
    
    def forward(self, x: torch.Tensor, 
                adj: torch.Tensor) -> torch.Tensor:
        """
        参数：
            x: 节点特征 [N, in_features]
            adj: 邻接矩阵 [N, N]（可以带自环）
        返回：
            更新后的节点特征 [N, out_features]
        """
        # 线性变换：XW
        support = x @ self.weight
        
        # 计算归一化的邻接矩阵：D̃^(-1/2) Ã D̃^(-1/2)
        # 首先确保自环
        adj_with_self = adj + torch.eye(adj.size(0), device=adj.device)
        
        # 度矩阵
        degree = adj_with_self.sum(dim=1)
        degree_inv_sqrt = torch.pow(degree, -0.5)
        degree_inv_sqrt[torch.isinf(degree_inv_sqrt)] = 0.
        
        # D^(-1/2) A D^(-1/2)
        D_inv_sqrt = torch.diag(degree_inv_sqrt)
        norm_adj = D_inv_sqrt @ adj_with_self @ D_inv_sqrt
        
        # 图卷积：归一化邻接 × 变换后的特征
        output = norm_adj @ support
        
        if self.bias is not None:
            output += self.bias
        
        return output


class GCN(nn.Module):
    """
    多层 GCN 模型
    
    用于节点分类的完整模型
    
    架构：
    Input → GCNLayer → ReLU → Dropout → GCNLayer → Softmax
    
    典型使用2层，因为深层GCN会遇到过平滑问题
    """
    def __init__(self, input_dim: int, hidden_dim: int, 
                 output_dim: int, dropout: float = 0.5):
        super().__init__()
        self.conv1 = GCNLayer(input_dim, hidden_dim)
        self.conv2 = GCNLayer(hidden_dim, output_dim)
        self.dropout = dropout
    
    def forward(self, x: torch.Tensor, adj: torch.Tensor) -> torch.Tensor:
        """
        参数：
            x: 节点特征 [N, input_dim]
            adj: 邻接矩阵 [N, N]
        返回：
            分类 logits [N, output_dim]
        """
        # 第一层
        x = self.conv1(x, adj)
        x = F.relu(x)
        x = F.dropout(x, p=self.dropout, training=self.training)
        
        # 第二层
        x = self.conv2(x, adj)
        
        return F.log_softmax(x, dim=1)
```

### 二、GAT——图注意力网络

GAT（Graph Attention Network）由 Veličković 等人在 2018 年提出。与 GCN 使用固定的归一化权重不同，GAT 使用注意力机制自动学习邻居的重要性。

```python
class GATLayer(nn.Module):
    """
    GAT 图注意力层
    
    核心创新：用注意力机制替代 GCN 的固定归一化权重
    
    步骤：
    1. 对每对相邻节点 (i,j) 计算注意力系数：
       e_ij = LeakyReLU(a^T [Wh_i || Wh_j])
    
    2. 对注意力系数做 softmax 归一化：
       α_ij = softmax_j(e_ij) = exp(e_ij) / Σ_k exp(e_ik)
    
    3. 用注意力系数加权聚合邻居信息：
       h'_i = σ(Σ_j α_ij W h_j)
    
    多头注意力：独立计算 K 组注意力，拼接或平均
    """
    def __init__(self, in_features: int, out_features: int,
                 n_heads: int = 8, concat: bool = True,
                 dropout: float = 0.6, 
                 negative_slope: float = 0.2):
        super().__init__()
        self.n_heads = n_heads
        self.out_features = out_features
        self.concat = concat
        
        # 每个头的线性变换
        self.W = nn.Parameter(
            torch.FloatTensor(n_heads, in_features, out_features)
        )
        
        # 注意力参数
        self.a_src = nn.Parameter(
            torch.FloatTensor(n_heads, out_features, 1)
        )
        self.a_dst = nn.Parameter(
            torch.FloatTensor(n_heads, out_features, 1)
        )
        
        self.dropout = nn.Dropout(dropout)
        self.leaky_relu = nn.LeakyReLU(negative_slope)
        self.reset_parameters()
    
    def reset_parameters(self):
        nn.init.xavier_uniform_(self.W)
        nn.init.xavier_uniform_(self.a_src)
        nn.init.xavier_uniform_(self.a_dst)
    
    def forward(self, x: torch.Tensor, 
                edge_index: torch.Tensor) -> torch.Tensor:
        """
        参数：
            x: 节点特征 [N, in_features]
            edge_index: 边列表 [2, E]（稀疏格式）
                       edge_index[0] = 源节点, edge_index[1] = 目标节点
        返回：
            更新后的节点特征 [N, n_heads * out_features] 或 [N, out_features]
        """
        N = x.shape[0]
        
        # 线性变换 [N, n_heads, out_features]
        h = torch.einsum('ni,hio->nho', x, self.W)
        
        # 计算注意力系数
        # 源节点注意力分量
        attn_src = torch.einsum('nho,hol->nhl', h, self.a_src).squeeze(-1)
        # 目标节点注意力分量
        attn_dst = torch.einsum('nho,hol->nhl', h, self.a_dst).squeeze(-1)
        
        # 在边上计算注意力
        src, dst = edge_index
        
        # e_ij = LeakyReLU(a_src^T * Wh_i + a_dst^T * Wh_j)
        edge_attn = self.leaky_relu(
            attn_src[src] + attn_dst[dst]
        )  # [E, n_heads]
        
        # 对每个目标节点的入边做 softmax
        # 需要按目标节点分组
        edge_attn_exp = torch.exp(edge_attn)
        
        # 计算每个目标节点的注意力分母
        attn_sum = torch.zeros(N, self.n_heads, device=x.device)
        attn_sum.scatter_add_(0, dst.unsqueeze(1).expand_as(edge_attn_exp), 
                              edge_attn_exp)
        
        # 归一化
        alpha = edge_attn_exp / (attn_sum[dst] + 1e-16)  # [E, n_heads]
        alpha = self.dropout(alpha)
        
        # 加权聚合
        out = torch.zeros(N, self.n_heads, self.out_features, device=x.device)
        aggregated = h[src] * alpha.unsqueeze(-1)  # [E, n_heads, out_features]
        out.scatter_add_(0, 
                         dst.unsqueeze(1).unsqueeze(2).expand_as(aggregated),
                         aggregated)
        
        # 多头拼接或平均
        if self.concat:
            out = out.reshape(N, -1)  # [N, n_heads * out_features]
        else:
            out = out.mean(dim=1)  # [N, out_features]
        
        return out


class GAT(nn.Module):
    """
    多层 GAT 模型
    
    架构：
    Input → GATLayer (multi-head) → ELU → Dropout → GATLayer (single-head) → Softmax
    """
    def __init__(self, input_dim: int, hidden_dim: int, 
                 output_dim: int, n_heads: int = 8,
                 dropout: float = 0.6):
        super().__init__()
        # 第一层：多头注意力 + 拼接
        self.conv1 = GATLayer(input_dim, hidden_dim, 
                               n_heads=n_heads, concat=True, dropout=dropout)
        # 第二层：单头注意力
        self.conv2 = GATLayer(hidden_dim * n_heads, output_dim,
                               n_heads=1, concat=False, dropout=dropout)
        self.dropout = dropout
    
    def forward(self, x: torch.Tensor, 
                edge_index: torch.Tensor) -> torch.Tensor:
        x = F.dropout(x, p=self.dropout, training=self.training)
        x = self.conv1(x, edge_index)
        x = F.elu(x)
        x = F.dropout(x, p=self.dropout, training=self.training)
        x = self.conv2(x, edge_index)
        return F.log_softmax(x, dim=1)
```

### 三、GraphSAGE——归纳式学习

GCN 和 GAT 都是**直推式**（transductive）的——训练时需要看到所有节点。GraphSAGE 提出了**归纳式**（inductive）方法，可以对训练时未见过的节点进行预测。

```python
class GraphSAGELayer(nn.Module):
    """
    GraphSAGE 层
    
    核心思想：
    1. 对每个节点，采样固定数量的邻居（而非使用全部邻居）
    2. 聚合邻居信息（支持 Mean/LSTM/Pooling 三种方式）
    3. 将自身特征和聚合特征拼接后变换
    
    优势：
    - 归纳式：可以处理新节点
    - 可扩展：通过采样控制计算量
    - 灵活：多种聚合方式可选
    """
    def __init__(self, in_features: int, out_features: int,
                 aggregator: str = 'mean'):
        super().__init__()
        self.aggregator = aggregator
        
        # 自身特征的变换
        self.W_self = nn.Linear(in_features, out_features, bias=False)
        # 邻居特征的变换
        self.W_neigh = nn.Linear(in_features, out_features, bias=False)
        
    def forward(self, x: torch.Tensor, 
                edge_index: torch.Tensor) -> torch.Tensor:
        """
        参数：
            x: 节点特征 [N, in_features]
            edge_index: 边列表 [2, E]
        """
        N = x.shape[0]
        src, dst = edge_index
        
        # 聚合邻居特征
        if self.aggregator == 'mean':
            # 计算每个节点的邻居均值
            neigh_sum = torch.zeros_like(x)
            neigh_count = torch.zeros(N, 1, device=x.device)
            
            neigh_sum.scatter_add_(0, dst.unsqueeze(1).expand_as(x[src]), x[src])
            neigh_count.scatter_add_(0, dst.unsqueeze(1),
                                      torch.ones(src.shape[0], 1, device=x.device))
            
            neigh_mean = neigh_sum / (neigh_count + 1e-16)
            
            # 拼接自身和邻居特征
            out = self.W_self(x) + self.W_neigh(neigh_mean)
        
        return out


class GraphSAGE(nn.Module):
    """GraphSAGE 模型"""
    def __init__(self, input_dim: int, hidden_dim: int,
                 output_dim: int, num_layers: int = 2):
        super().__init__()
        self.layers = nn.ModuleList()
        self.layers.append(GraphSAGELayer(input_dim, hidden_dim))
        for _ in range(num_layers - 2):
            self.layers.append(GraphSAGELayer(hidden_dim, hidden_dim))
        self.layers.append(GraphSAGELayer(hidden_dim, output_dim))
    
    def forward(self, x: torch.Tensor, edge_index: torch.Tensor) -> torch.Tensor:
        for layer in self.layers[:-1]:
            x = layer(x, edge_index)
            x = F.relu(x)
        x = self.layers[-1](x, edge_index)
        return F.log_softmax(x, dim=1)
```

### 四、图分类——从节点到图

图分类需要将所有节点的表示汇总为一个图级别的向量，这个步骤叫做**读出（Readout）**或**池化（Pooling）**。

```python
class ReadoutLayer(nn.Module):
    """
    图读出层（Graph Readout / Pooling）
    
    将所有节点表示汇总为图级表示
    
    常见方法：
    1. 简单求和/平均/最大值
    2. 注意力加权池化
    3. 分层池化（DiffPool, SAGPool）
    """
    def __init__(self, method: str = 'mean'):
        super().__init__()
        self.method = method
    
    def forward(self, node_features: torch.Tensor, 
                batch: torch.Tensor) -> torch.Tensor:
        """
        参数：
            node_features: 所有节点的特征 [total_nodes, feat_dim]
                          （多个图的节点拼接在一起）
            batch: 每个节点属于哪个图 [total_nodes]
                  例：[0,0,0,1,1,1,1,2,2] 表示3个图
        返回：
            图级表示 [num_graphs, feat_dim]
        """
        num_graphs = batch.max().item() + 1
        
        if self.method == 'sum':
            out = torch.zeros(num_graphs, node_features.size(1), 
                            device=node_features.device)
            out.scatter_add_(0, batch.unsqueeze(1).expand_as(node_features),
                           node_features)
        elif self.method == 'mean':
            out = torch.zeros(num_graphs, node_features.size(1),
                            device=node_features.device)
            count = torch.zeros(num_graphs, 1, device=node_features.device)
            out.scatter_add_(0, batch.unsqueeze(1).expand_as(node_features),
                           node_features)
            count.scatter_add_(0, batch.unsqueeze(1),
                             torch.ones(node_features.size(0), 1, device=node_features.device))
            out = out / (count + 1e-16)
        elif self.method == 'max':
            out = torch.full((num_graphs, node_features.size(1)), float('-inf'),
                           device=node_features.device)
            out.scatter_reduce_(0, batch.unsqueeze(1).expand_as(node_features),
                              node_features, reduce='amax')
        
        return out


class GraphClassifier(nn.Module):
    """
    图分类模型
    
    架构：
    1. 多层 GCN/GAT 提取节点级特征
    2. Readout 层将节点特征汇总为图级特征
    3. MLP 分类器输出图类别
    
    应用：分子性质预测、蛋白质功能分类等
    """
    def __init__(self, input_dim: int, hidden_dim: int,
                 num_classes: int, num_gnn_layers: int = 3,
                 gnn_type: str = 'gcn'):
        super().__init__()
        
        # GNN 层
        if gnn_type == 'gcn':
            self.gnn_layers = nn.ModuleList()
            self.gnn_layers.append(GCNLayer(input_dim, hidden_dim))
            for _ in range(num_gnn_layers - 1):
                self.gnn_layers.append(GCNLayer(hidden_dim, hidden_dim))
        elif gnn_type == 'gat':
            self.gnn_layers = nn.ModuleList()
            self.gnn_layers.append(
                GATLayer(input_dim, hidden_dim, n_heads=4, concat=False)
            )
            for _ in range(num_gnn_layers - 1):
                self.gnn_layers.append(
                    GATLayer(hidden_dim, hidden_dim, n_heads=4, concat=False)
                )
        
        # Batch Normalization
        self.batch_norms = nn.ModuleList([
            nn.BatchNorm1d(hidden_dim) for _ in range(num_gnn_layers)
        ])
        
        # Readout
        self.readout = ReadoutLayer(method='sum')
        
        # 分类 MLP
        self.classifier = nn.Sequential(
            nn.Linear(hidden_dim, hidden_dim),
            nn.ReLU(),
            nn.Dropout(0.5),
            nn.Linear(hidden_dim, num_classes)
        )
    
    def forward(self, x: torch.Tensor, adj: torch.Tensor,
                batch: torch.Tensor) -> torch.Tensor:
        """
        参数：
            x: 节点特征 [N, input_dim]
            adj: 邻接矩阵 [N, N]
            batch: 节点所属图的索引 [N]
        """
        # GNN 层
        for gnn, bn in zip(self.gnn_layers, self.batch_norms):
            x = gnn(x, adj)
            x = bn(x)
            x = F.relu(x)
        
        # 图级 Readout
        graph_repr = self.readout(x, batch)
        
        # 分类
        return self.classifier(graph_repr)
```

### 五、过平滑问题与解决方案

过平滑（Over-smoothing）是 GNN 的核心挑战：随着 GNN 层数增加，所有节点的表示趋于相同，失去区分能力。

```python
class JumpingKnowledge(nn.Module):
    """
    跳跃连接（Jumping Knowledge）
    
    解决过平滑的经典方法
    
    思路：不仅仅使用最后一层的输出，而是结合所有层的输出
    这样即使深层过平滑了，浅层的区分性信息仍然保留
    
    三种结合方式：
    - concat：拼接所有层的输出
    - max：取每层的最大值
    - attention：学习每层的权重
    """
    def __init__(self, mode: str = 'attention', 
                 num_layers: int = 3, hidden_dim: int = 64):
        super().__init__()
        self.mode = mode
        
        if mode == 'attention':
            # 学习每层的权重
            self.attn = nn.Parameter(torch.FloatTensor(num_layers, 1))
            nn.init.xavier_uniform_(self.attn)
            self.proj = nn.Linear(hidden_dim * num_layers, hidden_dim)
    
    def forward(self, layer_outputs: list) -> torch.Tensor:
        """
        参数：
            layer_outputs: 各层输出的列表 [H_1, H_2, ..., H_L]
        """
        if self.mode == 'concat':
            return torch.cat(layer_outputs, dim=-1)
        elif self.mode == 'max':
            return torch.max(torch.stack(layer_outputs), dim=0)[0]
        elif self.mode == 'attention':
            # 注意力加权
            weights = F.softmax(self.attn, dim=0)  # [L, 1]
            stacked = torch.stack(layer_outputs)    # [L, N, d]
            weighted = stacked * weights.unsqueeze(-1)
            combined = weighted.sum(dim=0)          # [N, d]
            return combined


class ResidualGNNLayer(nn.Module):
    """
    带残差连接的 GNN 层
    
    残差连接缓解过平滑：
    h^(l+1) = h^(l) + GNN(h^(l), A)
    
    这样即使 GNN 层学到的变换很小，
    信息仍然可以通过残差路径传播
    """
    def __init__(self, in_features: int, out_features: int):
        super().__init__()
        self.gcn = GCNLayer(in_features, out_features)
        self.bn = nn.BatchNorm1d(out_features)
        
        # 如果维度不匹配，用投影层对齐
        self.residual = (
            nn.Linear(in_features, out_features, bias=False)
            if in_features != out_features else nn.Identity()
        )
    
    def forward(self, x: torch.Tensor, adj: torch.Tensor) -> torch.Tensor:
        h = self.gcn(x, adj)
        h = self.bn(h)
        h = F.relu(h)
        return h + self.residual(x)


class DeepGNN(nn.Module):
    """
    深层 GNN
    
    使用残差连接 + Jumping Knowledge
    可以堆叠更多层而不严重过平滑
    """
    def __init__(self, input_dim: int, hidden_dim: int, 
                 output_dim: int, num_layers: int = 8):
        super().__init__()
        
        self.input_proj = nn.Linear(input_dim, hidden_dim)
        
        self.layers = nn.ModuleList([
            ResidualGNNLayer(hidden_dim, hidden_dim)
            for _ in range(num_layers)
        ])
        
        self.jk = JumpingKnowledge('attention', num_layers, hidden_dim)
        self.output_proj = nn.Linear(hidden_dim, output_dim)
    
    def forward(self, x: torch.Tensor, adj: torch.Tensor) -> torch.Tensor:
        x = self.input_proj(x)
        
        layer_outputs = [x]
        for layer in self.layers:
            x = layer(x, adj)
            layer_outputs.append(x)
        
        x = self.jk(layer_outputs)
        return self.output_proj(x)
```

## 完整可运行的 Python 代码示例

```python
"""
图神经网络完整演示
在合成数据上演示节点分类和图分类

运行方法：
    python gnn_demo.py

依赖：pip install torch numpy
"""

import torch
import torch.nn as nn
import torch.nn.functional as F
import numpy as np
from typing import Tuple


# ========== 数据生成 ==========

def generate_cora_like_data(num_nodes: int = 270, 
                             num_features: int = 50,
                             num_classes: int = 5,
                             k_neighbors: int = 5) -> Tuple:
    """
    生成类似 Cora 的引用网络数据
    
    Cora 是 GNN 研究中最常用的基准数据集：
    - 2708 篇论文（节点）
    - 5429 条引用关系（边）
    - 1433 维特征（词袋表示）
    - 7 个类别
    
    这里用合成数据模拟其结构
    """
    # 生成社区结构（同类节点更可能相连）
    labels = torch.randint(0, num_classes, (num_nodes,))
    
    # 生成特征（同类节点特征相似）
    class_centers = torch.randn(num_classes, num_features)
    features = class_centers[labels] + 0.3 * torch.randn(num_nodes, num_features)
    
    # 生成边（同构边概率更高）
    edges = []
    for i in range(num_nodes):
        for j in range(i + 1, num_nodes):
            if labels[i] == labels[j]:
                prob = 0.15  # 同类节点 15% 概率相连
            else:
                prob = 0.01  # 不同类 1% 概率相连
            if np.random.random() < prob:
                edges.append([i, j])
                edges.append([j, i])
    
    if len(edges) == 0:
        # 退路：确保至少有一些边
        for i in range(num_nodes):
            j = (i + 1) % num_nodes
            edges.extend([[i, j], [j, i]])
    
    edge_index = torch.tensor(edges, dtype=torch.long).t()
    adj = torch.zeros(num_nodes, num_nodes)
    adj[edge_index[0], edge_index[1]] = 1
    
    # 训练/验证/测试划分
    train_mask = torch.zeros(num_nodes, dtype=torch.bool)
    val_mask = torch.zeros(num_nodes, dtype=torch.bool)
    test_mask = torch.zeros(num_nodes, dtype=torch.bool)
    
    indices = torch.randperm(num_nodes)
    train_mask[indices[:int(0.6 * num_nodes)]] = True
    val_mask[indices[int(0.6 * num_nodes):int(0.8 * num_nodes)]] = True
    test_mask[indices[int(0.8 * num_nodes):]] = True
    
    return features, adj, edge_index, labels, train_mask, val_mask, test_mask


def generate_graph_classification_data(
        num_graphs: int = 200, 
        nodes_per_graph: int = 20,
        num_features: int = 10,
        num_classes: int = 3) -> Tuple:
    """生成图分类的合成数据"""
    all_features = []
    all_adj = []
    all_labels = []
    all_batch = []
    
    for i in range(num_graphs):
        n = nodes_per_graph + np.random.randint(-5, 6)
        n = max(5, n)
        
        label = torch.randint(0, num_classes, (1,)).item()
        
        # 生成图结构
        features = torch.randn(n, num_features)
        
        # 根据类别生成不同的图拓扑
        if label == 0:
            # 类别0：密集图
            adj = (torch.rand(n, n) > 0.3).float()
        elif label == 1:
            # 类别1：链状图
            adj = torch.zeros(n, n)
            for j in range(n - 1):
                adj[j, j+1] = adj[j+1, j] = 1
        else:
            # 类别2：星形图
            adj = torch.zeros(n, n)
            for j in range(1, n):
                adj[0, j] = adj[j, 0] = 1
        
        adj = adj + torch.eye(n)  # 自环
        
        all_features.append(features)
        all_adj.append(adj)
        all_labels.append(label)
        all_batch.extend([i] * n)
    
    return (all_features, all_adj, 
            torch.tensor(all_labels), 
            torch.tensor(all_batch))


# ========== 训练循环 ==========

def train_node_classification():
    """节点分类训练演示"""
    print("=" * 60)
    print("GCN 节点分类演示（合成 Cora-like 数据）")
    print("=" * 60)
    
    # 生成数据
    features, adj, edge_index, labels, train_mask, val_mask, test_mask = \
        generate_cora_like_data()
    
    num_nodes, num_features = features.shape
    num_classes = labels.max().item() + 1
    
    print(f"节点数: {num_nodes}, 特征维度: {num_features}, 类别数: {num_classes}")
    print(f"边数: {adj.sum().item():.0f}")
    print(f"训练集: {train_mask.sum()}, 验证集: {val_mask.sum()}, "
          f"测试集: {test_mask.sum()}")
    
    # 初始化模型
    model = GCN(num_features, hidden_dim=32, output_dim=num_classes)
    optimizer = torch.optim.Adam(model.parameters(), lr=0.01, weight_decay=5e-4)
    
    # 训练
    best_val_acc = 0
    for epoch in range(200):
        model.train()
        optimizer.zero_grad()
        
        logits = model(features, adj)
        loss = F.nll_loss(logits[train_mask], labels[train_mask])
        loss.backward()
        optimizer.step()
        
        # 验证
        if (epoch + 1) % 20 == 0:
            model.eval()
            with torch.no_grad():
                logits = model(features, adj)
                pred = logits.argmax(dim=1)
                
                train_acc = (pred[train_mask] == labels[train_mask]).float().mean()
                val_acc = (pred[val_mask] == labels[val_mask]).float().mean()
                
                if val_acc > best_val_acc:
                    best_val_acc = val_acc
                    test_acc = (pred[test_mask] == labels[test_mask]).float().mean()
                
                print(f"Epoch {epoch+1:3d}: loss={loss.item():.4f}, "
                      f"train_acc={train_acc:.4f}, val_acc={val_acc:.4f}")
    
    print(f"\n最佳测试准确率: {test_acc:.4f}")


def train_graph_classification():
    """图分类训练演示"""
    print("\n" + "=" * 60)
    print("GCN 图分类演示（合成数据）")
    print("=" * 60)
    
    all_features, all_adj, all_labels, all_batch = \
        generate_graph_classification_data()
    
    num_classes = all_labels.max().item() + 1
    num_features = all_features[0].shape[1]
    
    print(f"图数量: {len(all_features)}, 特征维度: {num_features}")
    print(f"类别数: {num_classes}")
    
    model = GraphClassifier(num_features, hidden_dim=32, 
                             num_classes=num_classes, num_gnn_layers=2)
    optimizer = torch.optim.Adam(model.parameters(), lr=0.01)
    
    # 训练
    train_size = int(0.8 * len(all_features))
    
    for epoch in range(100):
        model.train()
        total_loss = 0
        correct = 0
        
        # 随机选一批图训练
        indices = torch.randperm(len(all_features))[:32]
        
        for idx in indices:
            x = all_features[idx.item()]
            adj = all_adj[idx.item()]
            label = all_labels[idx.item()]
            batch = torch.zeros(x.shape[0], dtype=torch.long)
            
            logits = model(x, adj, batch).unsqueeze(0)
            loss = F.cross_entropy(logits, label.unsqueeze(0))
            
            optimizer.zero_grad()
            loss.backward()
            optimizer.step()
            
            total_loss += loss.item()
            if logits.argmax(dim=1).item() == label.item():
                correct += 1
        
        if (epoch + 1) % 20 == 0:
            avg_loss = total_loss / len(indices)
            acc = correct / len(indices)
            print(f"Epoch {epoch+1}: loss={avg_loss:.4f}, acc={acc:.4f}")
    
    print("图分类训练完成")


if __name__ == "__main__":
    train_node_classification()
    train_graph_classification()
```

## 真实案例

### 案例1：Cora 引用网络节点分类

Cora 是 GNN 领域最常用的基准数据集，包含 2708 篇机器学习论文，分为 7 个主题类别。论文之间通过引用关系形成图。

典型结果（测试准确率）：

| 方法 | 准确率 | 层数 |
|------|--------|------|
| MLP（不用图结构） | ~55% | 2 |
| DeepWalk | ~67% | - |
| Chebyshev (Kipf & Welling 2016) | 81.6% | 2 |
| GCN (Kipf & Welling 2017) | 81.5-83.0% | 2 |
| GAT (Veličković et al. 2018) | 83.0-84.0% | 2-3 |
| GraphSAGE | ~82% | 2 |

注意 MLP（完全忽略图结构）只有 55%，而 GNN 达到 83%+——这说明**图结构信息对节点分类至关重要**。

### 案例2：分子性质预测

在药物发现中，分子被表示为图：原子是节点（特征为原子类型、电荷等），化学键是边（特征为键类型）。

- **量子化学**：预测分子的能量、偶极矩等量子性质（QM9 数据集）
- **毒性预测**：预测分子是否有毒（Tox21 数据集）
- **溶解度预测**：预测分子在水中的溶解度（MoleculeNet）

GNN（尤其是 DimeNet、SphereNet 等考虑 3D 结构的变体）在这个领域的表现已经接近量子化学计算方法的精度，但速度快了数个数量级。

### 案例3：推荐系统（PinSage）

Pinterest 的 PinSage 是 GraphSAGE 的大规模工业应用：
- 30 亿个节点（图片/Pin）
- 180 亿条边（用户行为关系）
- 使用 GraphSAGE 的采样策略，在 CPU 集群上分布式训练
- 推荐点击率提升约 40%

### 案例4：GNN + LLM 的结合（2024-2026前沿）

最新的研究方向是将 GNN 的结构推理能力与 LLM 的语义理解能力结合：
- **GraphGPT**：将图结构编码后与文本一起输入 LLM
- **GraphLLM**：用 LLM 理解节点/边的语义，用 GNN 做结构推理
- **LLM as GNN**：用 LLM 的上下文学习能力隐式地执行图推理

## 权衡

### GCN vs GAT vs GraphSAGE

| 维度 | GCN | GAT | GraphSAGE |
|------|-----|-----|-----------|
| 邻居权重 | 固定（度归一化） | 学习（注意力） | 采样+聚合 |
| 表达能力 | 中等 | 高（可区分不同邻居） | 中等 |
| 计算复杂度 | O(\|E\|d²) | O(\|E\|d² + \|E\|dh) | O(bkLd²) |
| 归纳能力 | 弱（直推式） | 弱（直推式） | 强（归纳式） |
| 可扩展性 | 中等 | 中等 | 高（采样控制计算量） |
| 超参数 | 少 | 多（heads, dropout） | 中等（采样数） |

其中 d=特征维度，h=注意力头数，b=batch大小，k=邻居采样数，L=层数。

### 层数 vs 过平滑

| 层数 | 优势 | 问题 |
|------|------|------|
| 2层 | 简单高效，不过平滑 | 感受野有限（2-hop） |
| 4层 | 更大感受野 | 开始过平滑 |
| 8层 | 全局感受野 | 严重过平滑 |
| 16+层 | 理论上更好 | 需要特殊设计（JKNet、残差等） |

大多数实际应用中 2-3 层就足够了。深层 GNN 需要残差连接、Jumping Knowledge、PairNorm 等技术来缓解过平滑。

### 稀疏矩阵 vs 密集矩阵

| 表示方式 | 内存 | 适合场景 |
|---------|------|---------|
| 密集邻接矩阵 A[N,N] | O(N²) | 小图（<10K节点） |
| 稀疏 COO edge_index[2,E] | O(E) | 大图（百万节点） |
| CSR/CSC 格式 | O(E) | 高效邻居查找 |

PyTorch Geometric 默认使用稀疏 COO 格式，能处理十亿级别的图。

## 要点总结

1. **消息传递是统一框架**：所有GNN都可以看作消息传递——邻居生成消息、聚合消息、更新自身表示。GCN用固定权重聚合，GAT用注意力加权聚合，GraphSAGE用采样+聚合实现归纳式学习。

2. **图结构信息至关重要**：在 Cora 基准上，利用图结构的 GNN（83%+）比忽略图结构的 MLP（55%）高出近 30 个百分点。这说明在很多任务中，关系信息和特征信息同样重要。

3. **过平滑是核心挑战**：GNN层数增加会导致节点表示趋同。解决方案包括残差连接、跳跃连接（JKNet）、归一化技巧、以及最简单的——不要堆太多层（2-3层通常足够）。

4. **节点分类 vs 图分类**：节点分类是每个节点预测一个标签（如论文主题），图分类是每个图预测一个标签（如分子毒性）。图分类额外需要一个 Readout 层将节点表示汇总为图级表示。

5. **前沿方向**：Graph Transformer（将 Transformer 的自注意力扩展到图数据，解决长程依赖）、GNN+LLM（结合结构推理和语义理解）、以及 O(1) 复杂度的图采样方法（处理十亿级图）。

## 延伸阅读

**基础论文**：
- Kipf & Welling. "Semi-Supervised Classification with Graph Convolutional Networks." ICLR 2017. — GCN，引用最多的 GNN 论文
- Veličković et al. "Graph Attention Networks." ICLR 2018. — GAT，注意力机制引入图神经网络
- Hamilton et al. "Inductive Representation Learning on Large Graphs." NeurIPS 2017. — GraphSAGE，归纳式学习
- Gilmer et al. "Neural Message Passing for Quantum Chemistry." ICML 2017. — MPNN 统一框架

**过平滑与深层 GNN**：
- Xu et al. "Representation Learning on Graphs with Jumping Knowledge Networks." ICML 2018. — JKNet
- "A Theoretical Analysis of Graph (Over)smoothing." NeurIPS 2022. — 过平滑的理论分析
- "Demystifying Oversmoothing in Attention-Based GNNs." NeurIPS 2023. — GAT 的过平滑分析

**前沿**：
- "Graph Transformers" 系列工作（Graphormer、GRIT 等）
- "A Graph Neural Network Survey" (MIT, 2025) — 最新 GNN 综述
- Ying et al. "Hierarchical Graph Representation Learning with Differentiable Pooling." NeurIPS 2018. — DiffPool

**工具**：
- PyTorch Geometric (PyG) — 最流行的 GNN 库
- DGL (Deep Graph Library) — 支持多种框架的 GNN 库
- GraphNets (DeepMind) — 基于 TensorFlow/JAX 的 GNN 库
