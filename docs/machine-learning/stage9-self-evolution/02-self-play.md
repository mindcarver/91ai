# 自博弈——为什么自己和自己下棋能变强

<!--
调研来源：
1. "Temporal Difference Learning and TD-Gammon" (Tesauro, 1995, Communications of the ACM) — self-play 的开山之作，纯 self-play + TD(λ) 达到西洋陆棋大师级
2. "Mastering the game of Go with deep neural networks and tree search" (Silver et al., Nature 2016) — AlphaGo，用人类棋谱做监督学习 bootstrap + self-play
3. "Mastering the Game of Go without Human Knowledge" (Silver et al., Nature 2017) — AlphaGo Zero，纯 self-play，不用人类棋谱，3 天击败前代
4. "A general reinforcement learning algorithm that masters chess, shogi, and Go through self-play" (AlphaZero, Science 2018) — 推广到国际象棋、将棋
5. "AI safety via debate" (Irving, Christiano, Amodei, arxiv 1805.00899, 2018) — LLM debate 的理论原型：两个 agent 零和辩论，人类裁判
6. "Curiosity-driven Exploration by Self-supervised Prediction" (Pathak et al., ICML 2017, arxiv 1705.05363) — ICM，把好奇心定义为预测误差，内在奖励驱动探索
7. "Why Did TD-Gammon Work?" (NeurIPS) — 分析 TD-Gammon 成功的原因：西洋陆棋的随机性（骰子）让探索变得容易

核心发现：self-play 之所以能变强，不是通俗解释的"对手变强所以自己变强"（这是循环论证），而是因为两个条件同时成立——(1) 博弈有客观胜负，能区分策略好坏；(2) 策略空间被博弈规则约束，搜索可行。AlphaGo→AlphaGo Zero 的演进核心不是"要不要人类数据"，而是把策略网络和价值网络合成一个残差网络，让 self-play 能端到端训练。LLM debate 是"软博弈"——胜负靠裁判判定而非客观规则，是 self-play 思想在语言任务上的延伸。
-->

**TL;DR：** 自博弈（self-play）是策略层自进化的代表：系统跟自己下棋（或对抗），用对局结果当训练信号。本文从 TD-Gammon（1995）讲到 AlphaGo、AlphaGo Zero、AlphaZero，回答最关键的一个问题——为什么自己打自己能变强。然后把 LLM debate（软博弈）和 curiosity-driven 内在奖励作为延伸。

## 为什么这很重要

2016 年 3 月，AlphaGo 4:1 击败李世石。当时大家关注的焦点是：深度学习 + MCTS（蒙特卡洛树搜索）能下赢围棋了。

但更值得关注的细节是 AlphaGo 怎么训练的：第一版 AlphaGo 用了 3000 万步人类棋谱做监督学习（让网络学会"人类高手在这个局面下会下哪里"），然后再用 self-play 强化学习。也就是说，它先模仿人类，再超越人类。

真正的突破在第二年。2017 年 10 月，DeepMind 发了 [AlphaGo Zero](https://www.nature.com/articles/nature24270)：完全不用人类棋谱，从随机下棋开始纯 self-play。**3 天后，它击败了那个学过人类棋谱、战胜李世石的版本**。2018 年的 [AlphaZero](https://www.science.org/doi/10.1126/science.aar6404) 把同一套方法推广到国际象棋和将棋，都达到超越人类水平。

这件事颠覆了一个常识：**我们一直以为要超越人类，得先学习人类**。AlphaGo Zero 说，不一定。在博弈规则明确的环境里，纯 self-play 能自己长出超越人类先验的策略，而且下出来的某些棋步人类棋手从来没见过。

这就引出了本文要回答的核心问题：**为什么自己跟自己下棋，能变强？**

这是策略层自进化的代表案例（参考本系列 #1 篇的五层级模型）。在五层级里，self-play 改的是"行为策略"——系统在博弈环境里怎么选动作。

## 核心概念

### self-play 的基本框架

```
┌─────────────────────────────────────────────────────┐
│              Self-Play 训练循环（策略层）             │
│                                                      │
│   ┌──────────┐   对局记录     ┌──────────────┐       │
│   │ 当前策略  │ ────────────▶ │  训练数据生成 │       │
│   │  π_θ     │               │ (局面,动作,  │       │
│   └────┬─────┘               │   胜负)      │       │
│        ▲                     └──────┬───────┘       │
│        │                            │               │
│        │                            ▼               │
│   ┌────┴─────┐               ┌──────────────┐       │
│   │  更新权重 │ ◀──────────── │  评估 + 学习 │       │
│   │  π_θ_new │               │ (策略梯度 /  │       │
│   └──────────┘               │  TD 学习)    │       │
│                              └──────────────┘       │
│                                                      │
│   关键：对手 = 自己（上一版或同版）                    │
│   信号 = 对局胜负 + MCTS 搜出来的更优动作分布          │
└─────────────────────────────────────────────────────┘
```

self-play 套用 #1 篇建立的统一四步循环：

1. **采集**：当前策略跟自己（或上一版自己）下完整对局，产生（局面, 动作, 胜负）记录
2. **变异**：MCTS 在每个局面搜出比当前策略更准的动作分布（这是 self-play 的"变异"来源——不是随机变异，是搜索出来的改进）
3. **选择**：用对局胜负 + MCTS 的价值评估给局面打分
4. **回写**：用（局面, MCTS 动作分布）做监督、用（局面, 胜负）训价值网络，更新权重

注意第 2 步——这是 self-play 和普通 self-training 的关键区别。普通 self-training 只是"自己高置信度的预测回流"，没有改进机制；self-play 通过 MCTS 或博弈本身的结构，能在每一步搜出"比当前策略更好"的动作，这就是它能持续进步的发动机。

## 工作原理（简化的心智模型）

### 为什么自己跟自己下棋能变强——破掉一个循环论证

最常见的通俗解释是这样的："因为对手是你自己，你变强了对手就变强，对手变强你就被逼着更强，所以循环进步。"

这个解释听起来很顺，但它是循环论证——"变强"这个概念本身没定义。如果一个棋手只会一种死法（比如只会送子），自己跟自己下，会越练越会送子，永远变不强。

self-play 能变强的真正原因，是两个条件同时成立：

**条件 1：博弈有客观胜负。** 围棋有输赢，胜负是机器可判定的硬反馈。这一条保证了"哪些策略好、哪些策略差"是有客观标准的。如果没有胜负判定，self-play 就没有学习信号——就像 #1 篇讲的，没有机器可判定的反馈，自进化转不起来。

**条件 2：策略空间被博弈规则约束到可搜索。** 围棋虽然状态空间巨大（10^170），但每一步的合法动作有限（最多 361 个点），MCTS 能在这个受约束的空间里搜出更优解。如果是完全无结构的搜索空间，self-play 也找不到改进方向。

这两个条件缺一不可。西洋陆棋（backgammon）额外有一个优势——**有骰子，随机性让探索变容易**。这就是为什么 1995 年的 TD-Gammon 用很简单的 self-play + TD 学习就能达到大师级（[Why Did TD-Gammon Work?](http://papers.neurips.cc/paper/1292-why-did-td-gammon-work.pdf) 这篇分析专门讨论了这点）。围棋是确定性博弈，没有骰子的随机性帮忙探索，所以 AlphaGo 必须靠 MCTS 来制造有效的探索。

### 用"两个人互相挑刺"理解 LLM debate

self-play 思想可以推广到没有客观胜负的语言任务。这就是 [AI safety via debate](https://arxiv.org/abs/1805.00899)（Irving, Christiano, Amodei 2018）的思路：

给一个有争议的问题（比如"这个回答是否准确"），让两个 agent 一个正方一个反方轮流陈述，人类（或 AI）裁判谁赢了。如果一个 agent 在胡说，另一个 agent 应该能挑出漏洞。

这里没有客观胜负（不像围棋），胜负靠裁判判定——所以叫"软博弈"。但核心机制和 self-play 一样：通过对抗产生信号。LLM debate 用在 RLHF 的替代方案上：与其训练一个奖励模型（容易被 reward hacking），不如让两个模型对抗，由人类裁判。

## 工作原理（详细机制）

### 一、TD-Gammon（1995）：self-play 的开山之作

Gerald Tesauro 在 IBM 工作时，把一个多层神经网络用 TD(λ) 算法训练下西洋陆棋，完全 self-play（自己跟自己下），1995 年达到了世界级水平。这是 self-play + 神经网络的第一次大规模成功。

TD(λ) 的核心更新规则（简化）：

```
对每一步局面 s_t 和下一步 s_{t+1}：
    价值网络 V(s_t) ← V(s_t) + α × [r_t + γV(s_{t+1}) - V(s_t)]

其中：
- r_t 是奖励（终局才是 +1 赢 / -1 输，中间步是 0）
- γ 是折扣因子
- [r_t + γV(s_{t+1}) - V(s_t)] 叫 TD 误差——"我以为的"和"实际发生的"的差
```

TD-Gammon 之所以能成，关键是西洋陆棋的骰子让探索几乎免费——每一步本来就有 21 种骰子组合的随机性，self-play 自然就会探索到各种局面。换成围棋这种确定性博弈，光靠 TD 学习就不够了，得靠 MCTS。

### 二、AlphaGo（2016）：人类棋谱 bootstrap + self-play

AlphaGo 的训练分三步：

```
1. 监督学习（SL）策略网络：用 3000 万步人类棋谱训练，预测人类高手会下哪里
   准确率约 57%（已经能赢很多业余选手）

2. 强化学习（RL）策略网络：用 SL 策略网络初始化，然后 self-play
   对手 = 自己上一版（从历史 checkpoint 池里抽）
   信号 = 赢了 +1，输了 -1（终局才给）

3. 价值网络：用 self-play 产生的对局训练，预测某个局面最终赢的概率
   配合 MCTS，在搜索时剪枝

实战：策略网络提候选动作 → MCTS 搜索 → 价值网络评估 → 选最优
```

注意一个细节：**AlphaGo 用了四个网络**——SL 策略网络、RL 策略网络、价值网络、快速走子网络（rollout policy）。每个网络各司其职。这是工程上的妥协，但也意味着 self-play 没法端到端训练——网络之间是割裂的。

### 三、AlphaGo Zero（2017）：纯 self-play 的突破

AlphaGo Zero 做了三个关键改变，每一个都值得记住：

| 改变 | AlphaGo | AlphaGo Zero |
|------|---------|--------------|
| 人类棋谱 | 用了 3000 万步 bootstrap | **完全不用**，从随机初始化开始 |
| 网络数量 | 4 个网络（SL/RL 策略 + 价值 + rollout） | **1 个**：策略和价值共享主干的双头残差网络 |
| 输入特征 | 手工设计（气、征子等围棋术语特征） | **原始棋盘**（直接喂 19×19 的局面） |

其中第二个改变是最关键的工程突破。把策略头和价值头合成一个网络后，self-play 的训练信号能端到端反向传播，不再有割裂。这才是 Zero 能超越 AlphaGo 的真正技术原因——不是"不用人类数据"本身有多神奇，而是**架构简化让 self-play 的学习效率大幅提升**。

AlphaGo Zero 的 self-play 循环：

```
循环：
  1. 当前最好的策略 π_θ 跟自己下一盘棋
     每一步用 MCTS 搜出动作分布（MCTS 内部用 π_θ 当先验、用价值头当评估）
     记录：(局面 s_t, MCTS 搜出的动作分布 π_MCTS, 最终胜负 z)
  
  2. 训练：
     - 策略头：让 π_θ(s_t) 靠近 π_MCTS(s_t)（学 MCTS 搜出来的更好动作）
     - 价值头：让 V_θ(s_t) 靠近 z（学预测胜负）
  
  3. 评估：新版本跟旧版本下一批棋，如果新版本胜率 > 55%，换掉旧版本
```

第 1 步的"MCTS 搜出动作分布"是关键——这就是 #1 篇讲的"变异"。MCTS 不是随机扰动，它通过模拟搜索搜出比当前策略更准的动作分布，这个分布当成监督信号训策略网络。策略网络变强后，下一轮 MCTS 的先验更准，搜得更好，形成正循环。

### 四、curiosity-driven 内在奖励：没有外部奖励也能探索

self-play 要求有明确的胜负信号。如果环境没有奖励怎么办？[Pathak et al. 2017](https://arxiv.org/abs/1705.05363) 的 ICM（Intrinsic Curiosity Module）给了一个答案：**让系统自己制造奖励**。

ICM 的核心：好奇心 = 预测误差。训练一个"前向动力学模型"预测"在状态 s 执行动作 a 后会到哪个状态"，如果预测错了（预测误差大），说明这个状态是"新奇的"，给一个内在奖励，鼓励系统去探索。

```
内在奖励 r_intrinsic = ‖φ̂(s_{t+1}) - φ(s_{t+1})‖²

其中：
- φ(s) 是用一个反向动力学模型学出来的特征空间
  （只编码"受 agent 动作影响"的部分，过滤掉无关噪声）
- φ̂(s_{t+1}) 是前向模型预测的下一状态特征
- φ(s_{t+1}) 是真实的下一状态特征
```

为什么需要反向动力学模型过滤特征？因为如果直接在像素空间预测，电视屏幕上的随机噪点会让预测误差永远很大，agent 会盯着电视看个不停（这叫"television problem"）。反向动力学模型只保留"agent 动作能影响"的特征，过滤掉这种噪声。

ICM 落在策略层——它改的是 agent 在环境里的探索策略。这跟 self-play 同属策略层自进化，但信号源不同：self-play 的信号来自博弈胜负，ICM 的信号来自"自己的预测模型哪里错了"。

## 代码示例（完整可运行的 Python）

下面实现一个最小 self-play：两个简单策略网络在 tic-tac-toe（井字棋）上互打，演示 self-play 如何让胜率/平局率随训练变化。

```python
"""
最小 Self-Play：tic-tac-toe（井字棋）上的策略网络互打
演示 self-play 让胜率随训练变化
依赖：pip install numpy
（不依赖 PyTorch，纯 numpy 实现一个极简的"策略网络"）

设计选择：
- 不用神经网络，用一个简单的线性打分函数当"策略"
  s 的评分 = w · features(s)，features 是手工特征（每条线上的棋子数）
- self-play：让当前策略自己跟自己下，记录对局
- 训练：对赢的局面，把 w 往"让这些局面分数更高"的方向调
- 这是 self-play 的最简骨架，演示四步循环
"""

import numpy as np
from typing import List, Tuple


# --- 井字棋环境 ---
BOARD_SIZE = 9  # 3x3
WIN_LINES = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],  # 行
    [0, 3, 6], [1, 4, 7], [2, 5, 8],  # 列
    [0, 4, 8], [2, 4, 6],              # 对角线
]


class TicTacToe:
    def __init__(self):
        self.board = np.zeros(BOARD_SIZE, dtype=int)  # 0=空, 1=X, -1=O
        self.current_player = 1  # X 先手

    def reset(self):
        self.board[:] = 0
        self.current_player = 1
        return self.board.copy()

    def legal_moves(self) -> List[int]:
        return [i for i in range(BOARD_SIZE) if self.board[i] == 0]

    def step(self, action: int) -> Tuple[np.ndarray, float, bool]:
        """执行动作，返回 (新棋盘, 奖励, 是否结束)"""
        assert self.board[action] == 0
        self.board[action] = self.current_player
        winner = self._check_winner()
        done = winner != 0 or len(self.legal_moves()) == 0
        reward = float(winner)  # 1=X 赢, -1=O 赢, 0=平局/未结束
        self.current_player *= -1
        return self.board.copy(), reward, done

    def _check_winner(self) -> int:
        for line in WIN_LINES:
            s = self.board[line[0]] + self.board[line[1]] + self.board[line[2]]
            if s == 3:
                return 1
            if s == -3:
                return -1
        return 0


# --- 极简策略：线性打分函数 ---
# 特征：8 条线，每条线上"自己的棋子数 - 对手的棋子数"
def board_features(board: np.ndarray, player: int) -> np.ndarray:
    """
    把棋盘转成 8 维特征（每条 WIN_LINE 一个值）
    player 视角：自己的棋子算 +1，对手的算 -1
    """
    feats = np.zeros(len(WIN_LINES))
    for i, line in enumerate(WIN_LINES):
        cells = board[line]
        feats[i] = np.sum(cells == player) - np.sum(cells == -player)
    return feats


class LinearPolicy:
    """
    最简策略：对每个合法动作打分，softmax 选动作
    动作 a 的分数 = w · features(走完 a 之后的局面)
    """
    def __init__(self, n_features: int = 8, lr: float = 0.05,
                 temperature: float = 0.5, seed: int = 0):
        self.rng = np.random.default_rng(seed)
        self.w = np.zeros(n_features)
        self.lr = lr
        self.temperature = temperature

    def choose_action(self, env: TicTacToe) -> int:
        legal = env.legal_moves()
        if len(legal) == 1:
            return legal[0]
        # 对每个合法动作，模拟走一步后算特征分数
        scores = np.array([
            np.dot(self.w, board_features(_simulate(env, a), env.current_player))
            for a in legal
        ])
        # softmax 采样（带温度）
        probs = _softmax(scores / self.temperature)
        return legal[self.rng.choice(len(legal), p=probs)]


def _simulate(env: TicTacToe, action: int) -> np.ndarray:
    b = env.board.copy()
    b[action] = env.current_player
    return b


def _softmax(x: np.ndarray) -> np.ndarray:
    x = x - x.max()
    e = np.exp(x)
    return e / e.sum()


# --- Self-Play 训练循环 ---
def self_play_train(n_games: int = 2000, eval_every: int = 200):
    """
    self-play 训练：
    1. 采集：当前策略自己跟自己下完整对局
    2. 变异/选择：用赢方的局面当正样本、输方的当负样本
    3. 回写：梯度上升，让 w 更偏向赢方局面
    """
    policy = LinearPolicy(seed=42)
    env = TicTacToe()

    print(f"Self-Play 训练（{n_games} 局）")
    print("=" * 55)

    for game_i in range(n_games):
        # --- 第 1 步：采集（下一整局）---
        board = env.reset()
        history = []  # [(玩家, 走完后棋盘), ...]
        done = False
        winner = 0

        while not done:
            player = env.current_player
            action = policy.choose_action(env)
            board, reward, done = env.step(action)
            history.append((player, board.copy()))
            if done and reward != 0:
                winner = reward  # 1=X 赢, -1=O 赢

        # --- 第 2、3 步：变异 + 选择 ---
        # 赢方的所有局面当正样本（标签 +1），输方当负样本（标签 -1）
        # 平局不学习
        if winner == 0:
            continue

        # --- 第 4 步：回写（简单梯度更新）---
        # 让赢方局面的分数更高、输方更低
        for player, b in history:
            feats = board_features(b, player)
            score = np.dot(policy.w, feats)
            label = 1.0 if player == winner else -1.0
            # 简单的感知机式更新
            if label == 1 and score < 1:
                policy.w += policy.lr * feats
            elif label == -1 and score > -1:
                policy.w -= policy.lr * feats

        # --- 评估：跟一个"纯随机策略"下棋，看胜率 ---
        if (game_i + 1) % eval_every == 0:
            win_rate, draw_rate = _evaluate_vs_random(policy, n_eval=100)
            print(f"Game {game_i+1:5d}: vs 随机 胜率={win_rate:.2f} "
                  f"平局率={draw_rate:.2f}")

    return policy


def _evaluate_vs_random(policy: LinearPolicy, n_eval: int = 100):
    """跟随机策略下 n_eval 局，policy 执 X"""
    wins, draws = 0, 0
    for _ in range(n_eval):
        env = TicTacToe()
        done = False
        while not done:
            if env.current_player == 1:  # policy 走
                action = policy.choose_action(env)
            else:  # 随机走
                action = np.random.choice(env.legal_moves())
            _, reward, done = env.step(action)
        if reward == 1:
            wins += 1
        elif reward == 0:
            draws += 1
    return wins / n_eval, draws / n_eval


# 运行
if __name__ == "__main__":
    np.random.seed(0)
    policy = self_play_train(n_games=2000, eval_every=400)
    print("\n学到的策略权重 w：")
    print(policy.w.round(2))
    print("\n观察：self-play 训练后，对随机策略的胜率应该明显上升。")
    print("但注意一个 self-play 的隐患——如果训练不充分，")
    print("策略可能收敛到一个'自己跟自己下不会输，但跟新对手下会输'的局部最优。")
    print("这就是为什么 AlphaGo 要保留 checkpoint 池，跟历史版本下棋。")
```

跑起来你会看到一个现象：训练初期胜率涨得快，但**到了某个点会停滞甚至回落**——因为 self-play 有"自我对弈局部最优"问题。策略学到一个"自己跟自己下不会输"的均衡后，就很难再进步，因为它没见过足够多样的对手。AlphaGo 的对策是保留一个 checkpoint 池，新版本要跟池里的多个历史版本都下得过才算数。这是 self-play 工程上的核心难点。

## 真实案例

### 案例 1：TD-Gammon（1995）—— 开山之作

Tesauro 的 [TD-Gammon](https://dl.acm.org/doi/10.1145/203330.203343) 是 self-play + 神经网络的第一次大规模成功。纯 self-play，达到西洋陆棋世界级水平。它的成功很大程度上依赖骰子的随机性——探索几乎免费。后来 [Why Did TD-Gammon Work?](http://papers.neurips.cc/paper/1292-why-did-td-gammon-work.pdf) 专门分析了这一点，发现 TD-Gammon 在围棋这种确定性博弈上会失败，正是探索不足。

### 案例 2：AlphaZero —— 推广到三种棋

2018 年的 [AlphaZero](https://www.science.org/doi/10.1126/science.aar6404) 用同一套 self-play + MCTS 算法，分别训练围棋、国际象棋、将棋。四个小时学会国际象棋，超过当时的顶级引擎 Stockfish；两小时学会将棋，超过 Elmo。这说明 self-play 是个**通用方法**，不依赖某个具体游戏的人类知识。

### 案例 3：LLM Debate —— self-play 思想在语言任务上的延伸

[AI safety via debate](https://arxiv.org/abs/1805.00899)（Irving, Christiano, Amodei 2018）把 self-play 推广到语言任务：两个 agent 辩论，人类裁判。后续工作把它用到 LLM 训练上，发现 [self-play debate 能提高 AI 裁判的准确率](https://openreview.net/forum?id=gAEEjGv5Oa)。这是"软博弈"——胜负靠裁判判定而非客观规则，是 self-play 思想在没有硬胜负信号的任务上的延伸。

## 权衡取舍以及何时不该使用

### self-play 的几个固有难点

**容易陷入局部最优。** 策略自己跟自己下，可能收敛到一个"自己跟自己下不会输、但跟新对手下会输"的均衡。AlphaGo 的对策是 checkpoint 池（跟多个历史版本下），但这也只是缓解。

**模式坍塌。** 长时间 self-play，策略多样性会丢失，探索不到新策略。需要刻意注入探索（如 MCTS 的随机模拟、温度参数）。

**需要可模拟的环境。** self-play 要求能快速大量地跑对局。围棋、象棋都能模拟，所以 self-play 能成功。但如果环境模拟很慢或不可模拟（比如真实世界对话），self-play 就用不起来——这是 self-play 在 LLM 上进展有限的原因之一。

### 何时不该用 self-play

1. **没有客观胜负或可模拟环境时。** 不能快速跑对局、不能判定胜负的任务，self-play 转不起来。
2. **任务不是对抗性的时。** self-play 本质是对抗结构。对于合作性或开放式任务（比如写诗、做产品决策），对抗框架不一定合适。
3. **探索成本极高的环境。** 如果环境模拟很贵（比如真实物理世界），self-play 的样本成本吃不消。

## 关键要点

1. **self-play 能变强的真正原因不是"对手变强所以自己变强"（循环论证）**，而是两个条件同时成立：博弈有客观胜负能区分策略好坏 + 策略空间被博弈规则约束到可搜索。缺一不可。

2. **TD-Gammon（1995）是 self-play + 神经网络的开山之作**，靠西洋陆棋的骰子随机性让探索变容易。围棋是确定性博弈，必须靠 MCTS 制造探索。

3. **AlphaGo → AlphaGo Zero 的关键突破不是"不用人类数据"本身**，而是把策略网络和价值网络合成一个残差双头网络，让 self-play 能端到端训练。3 天击败前代是架构简化的结果。

4. **AlphaZero 把 self-play 推广到围棋、象棋、将棋三种棋**，证明 self-play 是不依赖具体游戏人类知识的通用方法。

5. **LLM debate 是 self-play 在"软博弈"上的延伸**——胜负靠裁判判定而非客观规则。curiosity-driven 内在奖励（ICM）则是 self-play 思想在"没有外部奖励"环境上的延伸——信号来自"自己的预测模型哪里错了"。

6. **self-play 的核心难点是局部最优和模式坍塌**。checkpoint 池、刻意注入探索、温度调度都是工程对策。

## 延伸阅读

**self-play 经典论文**：
- [TD-Gammon (Tesauro, 1995)](https://dl.acm.org/doi/10.1145/203330.203343) — self-play 开山之作
- [AlphaGo (Silver et al., Nature 2016)](https://www.nature.com/articles/nature16961) — 人类棋谱 bootstrap + self-play
- [AlphaGo Zero (Silver et al., Nature 2017)](https://www.nature.com/articles/nature24270) — 纯 self-play
- [AlphaZero (Silver et al., Science 2018)](https://www.science.org/doi/10.1126/science.aar6404) — 推广到三种棋

**延伸方向**：
- [AI safety via debate (Irving et al., 2018)](https://arxiv.org/abs/1805.00899) — LLM debate 的理论原型
- [Curiosity-driven Exploration by Self-supervised Prediction (Pathak et al., 2017)](https://arxiv.org/abs/1705.05363) — ICM 内在奖励
- [Why Did TD-Gammon Work?](http://papers.neurips.cc/paper/1292-why-did-td-gammon-work.pdf) — 分析 self-play 成功的条件

**本系列关联文章**：
- #1 自进化到底是什么 —— self-play 落在策略层的统一四步循环
- #8 自进化的边界与风险 —— reward hacking 在 self-play 里如何表现
