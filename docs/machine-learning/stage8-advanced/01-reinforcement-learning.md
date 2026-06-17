# 强化学习：MDP、Q-Learning、Policy Gradient 与 RLHF——RL 的核心框架

<!--
调研来源：
1. "Policy Gradients: The Foundation of RLHF" (Cameron Wolfe, Deep Learning Focus) — 策略梯度与RLHF的深层联系
2. "RLHF and Post-Training" (Nathan Lambert, rlhfbook.com) — RLHF的系统性教材
3. "Reinforcement Learning from Human Feedback: A Statistical Framework" (arxiv, 2025) — RLHF的统计框架
4. "RLHF Deciphered" (ACM Computing Surveys, 2025) — RLHF的全面综述
5. "Zeroth-Order Policy Gradient for RLHF" (ICLR 2025) — 不需要奖励推断的RLHF算法
6. David Silver "RL Course" (UCL) — 强化学习的经典课程

核心发现：RLHF已成为训练大语言模型的关键技术。ChatGPT的成功很大程度上归功于RLHF。2024-2026年的RLHF研究趋势包括：DPO（Direct Preference Optimization）替代传统RLHF、 Constitutional AI（自我对齐）、以及GRPO（Group Relative Policy Optimization，DeepSeek使用的方法）。理解RLHF的前提是理解强化学习的基础：MDP、Q-Learning和Policy Gradient。
-->

**TL;DR：** 强化学习是让智能体通过与环境交互来学习最优行为策略的方法论。本文从马尔可夫决策过程（MDP）讲起，经过Q-Learning和Policy Gradient，最终连接到当前大模型训练的核心技术RLHF。

## 为什么这很重要

2022年11月，ChatGPT发布，两个月内用户突破1亿。ChatGPT的成功不仅是因为大模型（GPT-3.5的参数量并不比前代多），更关键的是训练方法：**RLHF（Reinforcement Learning from Human Feedback）**。

RLHF让模型学会了"人类喜欢什么样的回答"——不仅仅是对不对，还要有帮助、无害、诚实。这个看似简单的改变，让模型从"能说话"变成了"会说话"。

理解RLHF的前提是理解强化学习。强化学习不只是在LLM中重要——它还是自动驾驶、游戏AI、机器人控制、推荐系统的核心技术。

## 核心概念

### 强化学习的基本框架

```
┌─────────────────────────────────────────────┐
│           强化学习交互循环                      │
│                                              │
│    ┌──────────┐    动作 (action)              │
│    │          │──────────────────▶            │
│    │  智能体   │                    ┌───────┐ │
│    │  (Agent) │    奖励 (reward)    │ 环境   │ │
│    │          │◀──────────────────│(Env)   │ │
│    └──────────┘    状态 (state)    └───────┘ │
│         ▲              │                      │
│         │              ▼                      │
│         └──── 观察 (observation) ────────────┘
│                                              │
│  目标：学习一个策略 π(a|s)，使得累积奖励最大化   │
└─────────────────────────────────────────────┘
```

### 马尔可夫决策过程（MDP）

MDP是强化学习的数学框架。一个MDP由五元组 (S, A, P, R, γ) 定义：

- **S**：状态空间（所有可能的状态）
- **A**：动作空间（所有可能的动作）
- **P**：状态转移概率 P(s'|s,a)（在状态s执行动作a后转移到s'的概率）
- **R**：奖励函数 R(s,a)（在状态s执行动作a获得的即时奖励）
- **γ**：折扣因子（0到1之间，衡量未来奖励的重要性）

**马尔可夫性质**：当前状态包含了做决策所需的所有信息，不需要记住历史。就像下棋——你只需要看当前的棋盘状态，不需要记住之前每一步是怎么走的（实际上象棋是完美信息博弈，当前状态确实包含了所有信息）。

### 三种核心方法

| 方法 | 代表算法 | 思路 | 适用场景 |
|------|---------|------|---------|
| 值函数方法 | Q-Learning, DQN | 学习"每个状态下每个动作有多好" | 离散动作空间 |
| 策略梯度方法 | REINFORCE, PPO | 直接学习最优策略 | 连续动作空间 |
| Actor-Critic | A2C, A3C, SAC | 同时学习策略和值函数 | 通用 |

## 工作原理（简化的心智模型）

### 用学骑自行车来理解强化学习

**MDP** = 骑自行车的完整描述：你在某个位置（状态），可以选择蹬左脚/右脚/刹车（动作），每次选择后自行车会移动到新位置（状态转移），如果你保持平衡获得正奖励，如果摔倒获得负奖励。

**Q-Learning** = 你在大脑中建了一张表：在每种情况下每种动作的"好坏分数"（Q值）。开始时这张表是空的，通过不断尝试和犯错，逐渐填满这张表。最终你只需要查表，选分数最高的动作。

**Policy Gradient** = 你不去记表了，而是培养一种直觉（策略）。你尝试了很多次，哪些尝试让你保持平衡更久，你就增加类似行为的概率；哪些尝试让你摔倒了，你就减少类似行为的概率。

**RLHF** = 你找了一个教练（人类）。教练看着你骑车，给出评价："刚才那个转弯很好"或"你骑得太快了"。你根据教练的反馈调整你的骑行策略，逐渐学会教练认为"好"的骑行方式。

## 工作原理（详细机制）

### 一、Q-Learning

```python
"""
Q-Learning完整实现
在一个简化的网格世界环境中
"""

import numpy as np
from typing import Tuple, List

class GridWorld:
    """
    简单的网格世界环境
    
    4x4网格：
    - 起点(0,0)，终点(3,3)
    - 每步-1奖励（鼓励尽快到达终点）
    - 到达终点+10奖励
    - 碰墙留在原地
    """
    
    def __init__(self, size: int = 4):
        self.size = size
        self.start = (0, 0)
        self.goal = (size-1, size-1)
        self.state = self.start
        self.actions = [(0, 1), (0, -1), (1, 0), (-1, 0)]  # 右、左、下、上
        self.action_names = ['右', '左', '下', '上']
        self.n_actions = len(self.actions)
        self.n_states = size * size
    
    def reset(self) -> Tuple[int, int]:
        self.state = self.start
        return self.state
    
    def step(self, action: int) -> Tuple[Tuple[int, int], float, bool]:
        """执行一个动作，返回 (新状态, 奖励, 是否结束)"""
        dx, dy = self.actions[action]
        new_x = self.state[0] + dx
        new_y = self.state[1] + dy
        
        # 碰墙检查
        if 0 <= new_x < self.size and 0 <= new_y < self.size:
            self.state = (new_x, new_y)
        
        # 到达终点
        if self.state == self.goal:
            return self.state, 10.0, True
        
        return self.state, -1.0, False
    
    def state_to_idx(self, state: Tuple[int, int]) -> int:
        return state[0] * self.size + state[1]

class QLearningAgent:
    """Q-Learning智能体"""
    
    def __init__(self, n_states: int, n_actions: int, 
                 learning_rate: float = 0.1,
                 discount_factor: float = 0.95,
                 epsilon: float = 1.0,
                 epsilon_decay: float = 0.995,
                 epsilon_min: float = 0.01):
        self.q_table = np.zeros((n_states, n_actions))
        self.lr = learning_rate
        self.gamma = discount_factor
        self.epsilon = epsilon
        self.epsilon_decay = epsilon_decay
        self.epsilon_min = epsilon_min
        self.n_actions = n_actions
    
    def choose_action(self, state_idx: int) -> int:
        """ε-greedy策略选择动作"""
        if np.random.random() < self.epsilon:
            return np.random.randint(self.n_actions)  # 随机探索
        return np.argmax(self.q_table[state_idx])      # 选择最优
    
    def update(self, state_idx: int, action: int, reward: float,
               next_state_idx: int, done: bool):
        """
        Q-Learning更新规则：
        
        Q(s,a) ← Q(s,a) + α[r + γ max_a' Q(s',a') - Q(s,a)]
        
        核心思想：
        - 用当前估计的Q值和实际获得的奖励来更新
        - 目标值 = 即时奖励 + 折扣后的未来最大Q值
        - 更新量 = 目标值 - 当前估计值（TD误差）
        """
        if done:
            target = reward
        else:
            target = reward + self.gamma * np.max(self.q_table[next_state_idx])
        
        td_error = target - self.q_table[state_idx, action]
        self.q_table[state_idx, action] += self.lr * td_error
    
    def decay_epsilon(self):
        """衰减探索率"""
        self.epsilon = max(self.epsilon_min, self.epsilon * self.epsilon_decay)

# 训练Q-Learning
env = GridWorld(size=4)
agent = QLearningAgent(n_states=16, n_actions=4)

print("Q-Learning训练")
print("=" * 50)

n_episodes = 500
rewards_history = []

for episode in range(n_episodes):
    state = env.reset()
    state_idx = env.state_to_idx(state)
    total_reward = 0
    steps = 0
    
    while True:
        action = agent.choose_action(state_idx)
        next_state, reward, done = env.step(action)
        next_state_idx = env.state_to_idx(next_state)
        
        agent.update(state_idx, action, reward, next_state_idx, done)
        
        total_reward += reward
        steps += 1
        state_idx = next_state_idx
        
        if done or steps > 100:
            break
    
    agent.decay_epsilon()
    rewards_history.append(total_reward)
    
    if episode % 100 == 0:
        avg_reward = np.mean(rewards_history[-100:])
        print(f"Episode {episode:4d}: avg_reward={avg_reward:.2f}, "
              f"epsilon={agent.epsilon:.3f}")

# 显示学到的策略
print("\n学到的最优策略:")
action_symbols = ['→', '←', '↓', '↑']
for i in range(4):
    row = ""
    for j in range(4):
        if (i, j) == env.goal:
            row += "  ★  "
        else:
            state_idx = env.state_to_idx((i, j))
            best_action = np.argmax(agent.q_table[state_idx])
            row += f"  {action_symbols[best_action]}  "
    print(row)

print(f"\nQ值范围: [{agent.q_table.min():.2f}, {agent.q_table.max():.2f}]")
```

### 二、Policy Gradient（REINFORCE）

```python
"""
REINFORCE算法实现（策略梯度方法）
"""

import torch
import torch.nn as nn
import torch.optim as optim
import numpy as np
from torch.distributions import Categorical

class PolicyNetwork(nn.Module):
    """策略网络：输入状态，输出各动作的概率"""
    
    def __init__(self, state_dim: int, action_dim: int, hidden_dim: int = 64):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(state_dim, hidden_dim),
            nn.ReLU(),
            nn.Linear(hidden_dim, hidden_dim),
            nn.ReLU(),
            nn.Linear(hidden_dim, action_dim),
            nn.Softmax(dim=-1),
        )
    
    def forward(self, x):
        return self.net(x)

class REINFORCEAgent:
    """
    REINFORCE算法
    
    核心思想：
    - 策略 π_θ(a|s) 直接输出动作概率
    - 梯度更新：∇J ≈ Σ ∇log π_θ(a|s) × G_t
    - G_t 是从时刻t开始的累积奖励
    - 好的动作（高G_t）→ 增加其概率
    - 差的动作（低G_t）→ 减少其概率
    """
    
    def __init__(self, state_dim: int, action_dim: int, lr: float = 1e-3, 
                 gamma: float = 0.99):
        self.policy = PolicyNetwork(state_dim, action_dim)
        self.optimizer = optim.Adam(self.policy.parameters(), lr=lr)
        self.gamma = gamma
        
        # 存储一个episode的轨迹
        self.log_probs = []
        self.rewards = []
    
    def choose_action(self, state: np.ndarray) -> int:
        """根据策略网络选择动作"""
        state_tensor = torch.FloatTensor(state).unsqueeze(0)
        probs = self.policy(state_tensor)
        distribution = Categorical(probs)
        action = distribution.sample()
        self.log_probs.append(distribution.log_prob(action))
        return action.item()
    
    def store_reward(self, reward: float):
        """存储奖励"""
        self.rewards.append(reward)
    
    def compute_returns(self) -> torch.Tensor:
        """
        计算每个时刻的累积奖励（折扣回报）
        
        G_t = r_t + γ r_{t+1} + γ² r_{t+2} + ...
        """
        returns = []
        G = 0
        for r in reversed(self.rewards):
            G = r + self.gamma * G
            returns.insert(0, G)
        returns = torch.tensor(returns, dtype=torch.float32)
        
        # 标准化（减少方差）
        if len(returns) > 1:
            returns = (returns - returns.mean()) / (returns.std() + 1e-8)
        
        return returns
    
    def update(self):
        """
        策略梯度更新
        
        Loss = -Σ log π_θ(a_t|s_t) × G_t
        
        负号因为我们要做梯度上升（最大化期望奖励）
        """
        returns = self.compute_returns()
        
        policy_loss = []
        for log_prob, G in zip(self.log_probs, returns):
            policy_loss.append(-log_prob * G)
        
        loss = torch.stack(policy_loss).sum()
        
        self.optimizer.zero_grad()
        loss.backward()
        self.optimizer.step()
        
        # 清空轨迹
        self.log_probs = []
        self.rewards = []
        
        return loss.item()

# 简单环境：CartPole（平衡杆）
class SimpleCartPole:
    """简化的CartPole环境（用于演示）"""
    
    def __init__(self):
        self.state_dim = 4
        self.action_dim = 2
        self.max_steps = 200
    
    def reset(self):
        self.state = np.random.uniform(-0.05, 0.05, 4)
        self.steps = 0
        return self.state
    
    def step(self, action: int):
        """简化物理模拟"""
        x, x_dot, theta, theta_dot = self.state
        
        # 简化的动力学
        force = 1.0 if action == 1 else -1.0
        x_dot += force * 0.1
        theta_dot += (force * 0.1 - np.sin(theta) * 0.5) * 0.1
        
        x += x_dot * 0.1
        theta += theta_dot * 0.1
        
        self.state = np.array([x, x_dot, theta, theta_dot])
        self.steps += 1
        
        done = abs(x) > 2.4 or abs(theta) > 0.21 or self.steps >= self.max_steps
        reward = 1.0 if not done else 0.0
        
        return self.state, reward, done

# 训练REINFORCE
print("REINFORCE训练")
print("=" * 50)

env = SimpleCartPole()
agent = REINFORCEAgent(state_dim=4, action_dim=2, lr=1e-3)

n_episodes = 200
episode_rewards = []

for episode in range(n_episodes):
    state = env.reset()
    total_reward = 0
    
    while True:
        action = agent.choose_action(state)
        next_state, reward, done = env.step(action)
        agent.store_reward(reward)
        total_reward += reward
        state = next_state
        
        if done:
            break
    
    loss = agent.update()
    episode_rewards.append(total_reward)
    
    if episode % 50 == 0:
        avg = np.mean(episode_rewards[-50:])
        print(f"Episode {episode:4d}: avg_reward={avg:.1f}, loss={loss:.4f}")
```

### 三、PPO（Proximal Policy Optimization）与RLHF

```python
"""
PPO算法与RLHF的概念实现
展示ChatGPT训练中使用的核心算法
"""

import torch
import torch.nn as nn
import numpy as np

class PPOWithRLHF:
    """
    PPO + RLHF的概念实现
    
    RLHF的三个阶段：
    1. 监督微调（SFT）：用人类写的优质对话数据微调LLM
    2. 奖励模型训练（RM）：训练一个模型预测人类偏好
    3. PPO优化：用奖励模型的反馈优化LLM
    
    PPO的核心改进：
    - 限制策略更新的幅度（clip），防止"走太远"
    - 比REINFORCE更稳定
    """
    
    def __init__(self, policy_model, reward_model, ref_model, 
                 clip_ratio: float = 0.2, lr: float = 1e-5,
                 kl_coeff: float = 0.1):
        self.policy = policy_model      # 待优化的策略模型（LLM）
        self.reward_model = reward_model  # 奖励模型
        self.ref_model = ref_model        # 参考模型（SFT后的模型，用于KL惩罚）
        self.clip_ratio = clip_ratio
        self.kl_coeff = kl_coeff
        
        self.optimizer = torch.optim.Adam(self.policy.parameters(), lr=lr)
    
    def compute_ppo_loss(self, old_log_probs, new_log_probs, advantages):
        """
        PPO的clip目标函数
        
        L_CLIP = E[min(r(θ) × A, clip(r(θ), 1-ε, 1+ε) × A)]
        
        其中：
        - r(θ) = π_θ(a|s) / π_old(a|s) 是新旧策略的概率比
        - A 是优势函数（当前动作比平均水平好多少）
        - ε 是clip范围（通常0.2）
        
        clip的作用：当概率比偏离1太远时，截断梯度，
        防止策略更新过大导致训练不稳定
        """
        # 概率比
        ratio = torch.exp(new_log_probs - old_log_probs)
        
        # 未clip的目标
        surr1 = ratio * advantages
        
        # clip后的目标
        surr2 = torch.clamp(ratio, 1 - self.clip_ratio, 1 + self.clip_ratio) * advantages
        
        # 取较小值（保守更新）
        loss = -torch.min(surr1, surr2).mean()
        
        return loss
    
    def compute_kl_penalty(self, generated_ids):
        """
        KL散度惩罚
        
        防止策略模型偏离参考模型太远。
        如果偏离太远，模型可能生成不连贯的文本。
        
        KL(π_θ || π_ref) = Σ π_θ(a|s) × log(π_θ(a|s) / π_ref(a|s))
        """
        # 简化实现：实际中需要计算两个模型的输出分布
        return torch.tensor(0.0)  # placeholder
    
    def training_step(self, prompts, old_log_probs, advantages):
        """
        一个PPO训练步骤
        
        完整的RLHF训练循环：
        1. 给定prompt，用当前策略生成response
        2. 用奖励模型对response打分
        3. 计算优势函数
        4. 用PPO更新策略
        """
        # 新策略的log概率
        new_log_probs = self._compute_log_probs(self.policy, prompts)
        
        # PPO损失
        ppo_loss = self.compute_ppo_loss(old_log_probs, new_log_probs, advantages)
        
        # KL惩罚
        kl_penalty = self.compute_kl_penalty(prompts)
        
        # 总损失
        total_loss = ppo_loss + self.kl_coeff * kl_penalty
        
        self.optimizer.zero_grad()
        total_loss.backward()
        self.optimizer.step()
        
        return {
            'ppo_loss': ppo_loss.item(),
            'kl_penalty': kl_penalty.item(),
            'total_loss': total_loss.item(),
        }
    
    def _compute_log_probs(self, model, inputs):
        """计算模型对输入的log概率"""
        return torch.randn(len(inputs))  # 简化

# RLHF流程演示
print("RLHF训练流程")
print("=" * 60)

print("""
阶段1: 监督微调 (SFT)
━━━━━━━━━━━━━━━━━━━━━
输入: 人类编写的高质量对话数据
  用户: 什么是机器学习？
  助手: 机器学习是人工智能的一个分支...

过程: 用标准语言模型目标（下一个token预测）微调LLM
输出: SFT模型（作为RLHF的起点和参考模型）

阶段2: 奖励模型训练 (Reward Model)
━━━━━━━━━━━━━━━━━━━━━
输入: 人类偏好标注数据
  Prompt: "解释量子力学"
  Response A: [简洁准确的解释]  ← 人类偏好
  Response B: [冗长模糊的解释]

过程: 训练一个模型，使其输出 r(prompt, response) 
      反映人类对response质量的评分
      使用Bradley-Terry模型: P(A>B) = σ(r(A) - r(B))

输出: 奖励模型，可以为任何(prompt, response)对打分

阶段3: PPO优化
━━━━━━━━━━━━━━━━━━━━━
输入: SFT模型 + 奖励模型

过程:
  1. 从SFT模型生成多个response
  2. 用奖励模型对每个response打分
  3. 计算优势函数: A = r(response) - baseline
  4. 用PPO更新SFT模型，使高分response的概率增大
  5. 加入KL惩罚，防止偏离SFT模型太远

输出: 经过RLHF优化的模型（更符合人类偏好）

关键公式:
  目标 = E[r(x, y)] - β × KL(π_θ || π_ref)
  
  最大化奖励的同时，不要离参考模型太远
""")

# PPO的clip可视化
print("PPO Clip机制可视化:")
print("当优势A > 0（好动作）时:")
print("  r(θ) > 1+ε → 梯度被截断，不继续增大概率")
print("  r(θ) < 1+ε → 正常增大概率")
print()
print("当优势A < 0（差动作）时:")
print("  r(θ) < 1-ε → 梯度被截断，不继续减小概率")
print("  r(θ) > 1-ε → 正常减小概率")
print()
print("效果：防止策略在一次更新中变化太大，保证训练稳定性")
```

### 四、DPO（Direct Preference Optimization）

```python
"""
DPO: Direct Preference Optimization
RLHF的简化替代方案

论文: "Direct Preference Optimization: Your Language Model is Secretly a Reward Model" (2023)
"""

print("""
DPO vs 传统RLHF
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

传统RLHF流程:
  数据 → 训练奖励模型 → 用PPO训练策略
  需要三个模型：策略模型、奖励模型、参考模型
  训练复杂，不稳定

DPO流程:
  数据 → 直接用偏好数据训练策略
  只需要一个模型
  训练简单，稳定

DPO的核心洞察：
  奖励模型和策略模型之间有闭式映射关系。
  因此可以跳过显式训练奖励模型，
  直接用偏好数据优化策略。

DPO损失函数:
  L_DPO = -E[log σ(β × (log π_θ(y_w|x) / π_ref(y_w|x)
                          - log π_θ(y_l|x) / π_ref(y_l|x)))]

  其中:
  - y_w: 人类偏好的response (winner)
  - y_l: 人类不偏好的response (loser)
  - β: 温度参数
  - π_θ: 当前策略
  - π_ref: 参考策略（SFT模型）

直观理解：
  - 如果模型对偏好response的概率高于参考模型 → 好的
  - 如果模型对不偏好response的概率低于参考模型 → 好的
  - DPO直接优化这个目标，不需要显式的奖励模型

2024-2026年的趋势：
  - DPO成为许多开源LLM训练的标准方法
  - DeepSeek使用GRPO（Group Relative Policy Optimization）
  - Meta在Llama-3中使用了DPO变体
""")
```

## 代码示例（完整可运行的 Python）

```python
"""
完整的强化学习算法对比
在同一环境上运行Q-Learning和REINFORCE
"""

import numpy as np

class BanditEnvironment:
    """多臂老虎机环境（最简单的RL环境）"""
    
    def __init__(self, n_arms: int = 5):
        self.n_arms = n_arms
        self.true_values = np.random.normal(0, 1, n_arms)
        self.best_arm = np.argmax(self.true_values)
    
    def pull(self, arm: int) -> float:
        return np.random.normal(self.true_values[arm], 1)
    
    def is_optimal(self, arm: int) -> bool:
        return arm == self.best_arm

# Q-Learning (ε-greedy)
def q_learning_bandit(env, n_steps=1000, epsilon=0.1, lr=0.1):
    q_values = np.zeros(env.n_arms)
    counts = np.zeros(env.n_arms)
    rewards = []
    optimal = []
    
    for step in range(n_steps):
        if np.random.random() < epsilon:
            arm = np.random.randint(env.n_arms)
        else:
            arm = np.argmax(q_values)
        
        reward = env.pull(arm)
        counts[arm] += 1
        q_values[arm] += lr * (reward - q_values[arm])
        
        rewards.append(reward)
        optimal.append(env.is_optimal(arm))
    
    return rewards, optimal

# Thompson Sampling
def thompson_sampling_bandit(env, n_steps=1000):
    successes = np.ones(env.n_arms)
    failures = np.ones(env.n_arms)
    rewards = []
    optimal = []
    
    for step in range(n_steps):
        samples = [np.random.beta(s, f) for s, f in zip(successes, failures)]
        arm = np.argmax(samples)
        
        reward = env.pull(arm)
        
        # 将奖励归一化到[0,1]
        normalized = 1 / (1 + np.exp(-reward))
        
        successes[arm] += normalized
        failures[arm] += 1 - normalized
        
        rewards.append(reward)
        optimal.append(env.is_optimal(arm))
    
    return rewards, optimal

# 对比
np.random.seed(42)
env = BanditEnvironment(n_arms=5)
print(f"真实值: {env.true_values.round(2)}")
print(f"最优臂: {env.best_arm} (值: {env.true_values[env.best_arm]:.2f})")

q_rewards, q_optimal = q_learning_bandit(env)
ts_rewards, ts_optimal = thompson_sampling_bandit(env)

# 滑动平均
window = 50
q_avg = [np.mean(q_rewards[max(0,i-window):i+1]) for i in range(len(q_rewards))]
ts_avg = [np.mean(ts_rewards[max(0,i-window):i+1]) for i in range(len(ts_rewards))]

print(f"\n{'='*60}")
print(f"Q-Learning (ε-greedy):")
print(f"  平均奖励: {np.mean(q_rewards[-100:]):.3f}")
print(f"  最优臂选择率: {np.mean(q_optimal[-100:]):.1%}")

print(f"\nThompson Sampling:")
print(f"  平均奖励: {np.mean(ts_rewards[-100:]):.3f}")
print(f"  最优臂选择率: {np.mean(ts_optimal[-100:]):.1%}")
```

## 真实案例

### 案例1：AlphaGo

DeepMind的AlphaGo使用强化学习掌握了围棋：
- 第一阶段：监督学习（模仿人类棋谱）
- 第二阶段：策略梯度强化学习（自我对弈）
- 第三阶段：蒙特卡洛树搜索 + 价值网络
- 结果：击败世界冠军李世石

### 案例2：ChatGPT的RLHF训练

OpenAI的ChatGPT训练分三步：
1. SFT：用人类标注的对话数据微调GPT-3.5
2. RM：训练奖励模型预测人类偏好
3. PPO：用奖励模型的反馈进一步优化GPT-3.5
- 结果：从"能生成文本"到"能进行对话"

### 案例3：DeepSeek的GRPO

DeepSeek在2024年提出了GRPO（Group Relative Policy Optimization）：
- 不需要显式的奖励模型
- 直接使用组内的相对排名作为奖励信号
- 训练效率比传统RLHF高
- 已被多个开源LLM项目采用

## 权衡取舍以及何时不该使用

### RLHF的成本

RLHF需要人类标注偏好数据，成本很高。DPO虽然简化了训练，但仍需要偏好数据。

### 样本效率

RL的样本效率通常远低于监督学习。需要大量的交互才能学到好的策略。

### 何时不该用RL

1. **有充足的标注数据**：监督学习通常更高效
2. **环境难以模拟**：如果无法快速获得奖励信号，RL难以应用
3. **安全性要求高**：RL通过试错学习，试错过程可能产生危险行为

## 关键要点

1. **强化学习通过与环境交互学习最优策略**。核心框架是MDP（马尔可夫决策过程），定义了状态、动作、转移概率、奖励和折扣因子。

2. **Q-Learning学习值函数**——每个状态下每个动作的好坏。通过不断试错和更新Q表，最终找到最优策略。适合离散动作空间。

3. **Policy Gradient直接优化策略**——通过增加好动作的概率、减少差动作的概率来学习。适合连续动作空间和高维问题。

4. **PPO是RLHF的核心算法**，通过clip机制限制策略更新幅度，保证训练稳定性。RLHF的三个阶段：SFT→奖励模型→PPO优化。

5. **DPO是RLHF的简化替代**，不需要显式的奖励模型，直接用偏好数据优化策略。2024-2026年已成为主流方法。

6. **RLHF让模型从"能生成"变成"会对话"**。它教会模型人类偏好：什么是有帮助的回答、什么是安全的回答、什么是诚实的回答。

## 延伸阅读

**经典教材**：
- Sutton & Barto "Reinforcement Learning: An Introduction" — RL的圣经
- David Silver RL课程 (UCL) — 系统的RL课程

**RLHF论文**：
- "Training language models to follow instructions with human feedback" (InstructGPT, 2022)
- "Direct Preference Optimization" (DPO, 2023)
- "RLHF Deciphered" (ACM Computing Surveys, 2025)

**工具**：
- OpenAI Gym/Gymnasium — RL环境标准库
- Stable Baselines3 — RL算法实现库
- TRL (Transformer Reinforcement Learning) — Hugging Face的RLHF工具

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
