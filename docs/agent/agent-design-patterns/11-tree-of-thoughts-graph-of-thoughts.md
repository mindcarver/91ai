# 搜索与树：Tree of Thoughts 与 Graph of Thoughts

**TL;DR：** ReAct 每次只走一条推理路径，错了就从头来。Tree of Thoughts（ToT）把推理组织成树结构，同时探索多条路径，在 Game of 24 上把成功率从 CoT 的 4% 拉到 74%。Graph of Thoughts（GoT）更进一步，把树扩展成有向无环图，允许路径合并和 refinement，在排序任务上比 ToT 再提升 62%。代价是计算成本——ToT 的 LLM 调用次数是 CoT 的 5-10 倍。

## 它解决什么失控点

CoT（Chain-of-Thought）和 ReAct 都是线性的——模型生成一条推理链，从头走到尾。如果中间某一步走错了，模型要么将错就错，要么从头开始。没有"回头看看其他路"的机制。

这在需要探索的任务上特别明显。比如 Game of 24：给定四个数字，用加减乘除凑出 24。CoT 的做法是"先试这条路"，如果算出来不是 24，就只能重新开始。ToT 的做法是"同时试好几条路，哪条有希望就走哪条"。

论文数据很清楚：在 Game of 24 上，CoT 成功率 4%，ToT 成功率 74%。差距的根源在于——这类任务的正确解不是"想清楚就能找到"的，而是需要试错和回溯。

## Tree of Thoughts：把推理变成搜索

ToT 出自论文 *Tree of Thoughts: Deliberate Problem Solving with Large Language Models*（Yao et al., NeurIPS 2023）。核心思想：把 LLM 的推理过程从"生成一条链"变成"搜索一棵树"。

```text
CoT:  A → B → C → D（一条路走到黑）
ToT:  A ┬ B1 ┬ C1 → ✗
          │   └ C2 → ✓ 解
          └ B2 ┬ C3 → ✗
              └ C4 → ✗（但可以回溯到 A 试 B3）
```

### 四个组件

ToT 需要四个组件协同工作：

1. **Thought 分解**：把问题拆成一个个"思维步骤"（thought），每个步骤是树的节点
2. **Thought 生成**：给定当前状态，生成多个候选的下一步（广度优先或深度优先）
3. **状态评估**：对每个候选步骤打分，判断"这条路有没有希望"
4. **搜索算法**：BFS（广度优先）或 DFS（深度优先），根据评估结果决定探索方向

### 代码示意

```python
# ToT 的核心循环（伪代码）
def tree_of_thoughts(problem, generator, evaluator, search_algo, b=3, d=3):
    """
    b: 每步生成几个候选（广度）
    d: 最大深度
    """
    root = Node(state=problem)

    for depth in range(d):
        # 1. 对当前所有叶节点，各生成 b 个候选
        leaves = get_leaf_nodes(root)
        for leaf in leaves:
            candidates = generator.generate(leaf.state, num=b)
            for c in candidates:
                child = Node(state=c, parent=leaf)
                leaf.children.append(child)

        # 2. 评估所有候选
        leaves = get_leaf_nodes(root)
        for leaf in leaves:
            leaf.score = evaluator.evaluate(leaf.state)

        # 3. 搜索：只保留 top-k 有希望的路径
        if search_algo == "bfs":
            keep_top_k(leaves, k=b)

    # 返回得分最高的完整路径
    return best_path(root)
```

### 关键实现细节

**Thought 的粒度决定了搜索效率**。粒度太细（一个 Thought 是一个 token），搜索空间爆炸；粒度太粗（一个 Thought 是完整的解题方案），又退回到 CoT。Game of 24 论文中，每个 Thought 是"一个算术步骤"，比如 `1 + 2 = 3`。

**状态评估是瓶颈**。每次评估都调用一次 LLM，b=3, d=3 的 BFS 需要评估 3×3=9 个节点，加上 3×3=9 次生成，总共 18 次 LLM 调用。CoT 只需 1 次。这是 ToT 的核心 trade-off。

**搜索策略的选择**：
- BFS：适合解空间宽但浅的任务（如 Game of 24）。每次看 b 个候选，保留最好的 k 个继续。
- DFS：适合解空间窄但深的任务（如创意写作规划）。沿一条路走到底，不行就回溯。

### 基准数据

| 任务 | CoT | ToT (BFS) | 提升 |
|------|-----|-----------|------|
| Game of 24 | 4.0% | 74.0% | +70pp |
| Creative Writing | 人类评分 6.19/10 | 7.56/10 | +22% |
| Mini Crosswords | 15.6% | 60.0% | +44pp |
| 5x5 填字游戏 | 4.0% | 20.0% | +16pp |

## Graph of Thoughts：让路径可以合并

GoT 出自论文 *Graph of Thoughts: Solving Elaborate Problems with Large Language Models*（Besta et al., 2023）。ToT 是树结构——每条路径只能分叉不能合并。GoT 把它扩展成有向无环图（DAG），允许：

- **合并**：把两条路径的中间结果融合
- **Refinement**：对已有节点做局部改进
- **回溯连接**：把后面发现的洞察反馈到前面

```text
ToT:  A ┬ B1 → C1
          └ B2 → C2（C1 和 C2 互相独立）

GoT:  A ┬ B1 → C1 ─┐
          └ B2 → C2 ─┼→ D（合并 C1 和 C2 的优点）
              ↑         │
              └─────────┘（refinement 回路）
```

### 核心操作

```python
# GoT 的三种核心操作
class GraphOfThoughts:
    def generate(self, parent_states, num=1):
        """生成新节点（类似 ToT）"""
        pass

    def aggregate(self, states_to_merge):
        """合并：把多个中间推理结果融合成一个更好的结果"""
        merged = llm.invoke(
            f"综合以下 {len(states_to_merge)} 个候选方案的优点，"
            f"生成一个更好的版本：\n"
            + "\n".join(states_to_merge)
        )
        return merged

    def refine(self, state, feedback):
        """改进：对已有节点做局部修正"""
        refined = llm.invoke(
            f"改进以下方案，参考反馈：{feedback}\n"
            f"原方案：{state}"
        )
        return refined
```

### 适用场景

GoT 的优势在"需要多轮综合"的任务上：

- **排序问题**：先分组排序，再合并排序结果（类似归并排序）。GoT 比线性 CoT 在排序任务上提升 62%，比 ToT 提升 26%。
- **长文写作**：先写多个段落，合并成章节，再对章节做 refinement。Storm 模式的底层就是这个思路。
- **方案设计**：探索多个设计方向，合并各自优点，迭代改进。

### 权衡

GoT 比 ToT 更复杂——你需要管理图的拓扑结构、决定什么时候合并、什么时候 refine。实现成本显著更高。

一个实用的建议：**先用 ToT，只有当你发现"两条路径的结果需要融合"时，才升级到 GoT**。大多数场景下 ToT 的树结构已经足够。

## 工程考量

### 成本控制

ToT/GoT 的最大问题是成本。以 GPT-4o 为例：

```text
CoT:     1 次 LLM 调用
ToT(3,3): ~18 次 LLM 调用（3 广度 × 3 深度 × 2 生成+评估）
GoT:      18+ 次 LLM 调用（额外合并和 refinement 步骤）

单次 CoT 成本:    ~$0.03
单次 ToT(3,3)成本: ~$0.54（18x）
单次 GoT 成本:    ~$0.80+（27x+）
```

所以 ToT/GoT 只适合高价值任务——比如关键决策、创意竞赛、一次性规划。不适合实时问答或批量处理。

### 评估器的设计

状态评估器决定了搜索质量。两种常见策略：

1. **LLM 评估**：让 LLM 对每个候选打分（如 1-10 分）。灵活但慢。
2. **规则评估**：用确定性函数判断（如 Game of 24 中检查中间结果是否在合理范围）。快但不够灵活。

实际中常用混合策略：先用规则快速过滤明显不行的候选，再用 LLM 对剩余候选精细评估。

### 与其他模式的组合

ToT/GoT 通常不是单独使用的，而是作为其他模式的一个组件：

- **ToT + ReAct**：在 ReAct 的 Thought 阶段用 ToT 探索多个推理方向，选择最有希望的一个执行 Action
- **ToT + LATS**：LATS 就是把 ToT 的搜索算法换成蒙特卡洛树搜索（MCTS），更适合大搜索空间
- **GoT + Storm**：Storm 的多轮大纲-研究-写作流程，本质上是 GoT 的 refine 操作在长文生成上的应用

## 选择指南

| 场景 | 推荐模式 | 原因 |
|------|---------|------|
| 需要试错的推理（数学、谜题） | ToT (BFS) | 广度搜索覆盖多路径 |
| 创意生成需要多方案比较 | ToT (DFS) | 深度探索更完整的方案 |
| 需要合并多个方案 | GoT | DAG 支持合并操作 |
| 任务线性、步骤确定 | CoT/ReAct | 搜索的开销不值得 |
| 探索空间巨大 | LATS | MCTS 比 BFS/DFS 更高效 |

一句话原则：如果任务需要"回头看"和"换个方向试试"，ToT 值得考虑；如果还需要"把不同路径的结果融合"，GoT 才有必要。

## 延伸阅读

- [Tree of Thoughts 原始论文](https://arxiv.org/abs/2305.10601) — Yao et al., NeurIPS 2023，Game of 24 和 Creative Writing 基准数据
- [Graph of Thoughts 原始论文](https://arxiv.org/abs/2308.09687) — Besta et al., 2023，DAG 推理框架和排序任务基准
- [Language Agent Tree Search (LATS)](https://arxiv.org/abs/2310.04444) — 把 ToT 的搜索换成 MCTS，详见[反思与搜索章节](09-reflection-search-basic-reflexion-lats.md)
- [Self-Discover: Reasoning Strategy Discovery](https://arxiv.org/abs/2402.03668) — 自动选择推理策略（包括 ToT），详见[元认知章节](10-metacognition-self-discover-storm.md)
- [Building Effective Agents - Anthropic](https://www.anthropic.com/engineering/building-effective-agents) — 从工程实践角度讨论何时使用搜索类模式
