# Superpowers 工作流 · TDD 是怎么被严格执行的

> 更新日期：2025/06

**TL;DR：** Superpowers 通过「铁律」强制执行 TDD——写了代码先于测试？删掉重来。RED-GREEN-REFACTOR 三个阶段每步都验证：测试先写并确实失败、最小实现、重构保持测试通过。违反规则的合理化借口都被列在 rationalization 表里，AI 识别到就触发「删掉重启」流程。

## 为什么要强制执行

软件开发里最容易妥协的是测试。我们都知道 TDD 好，但总有理由：「这个太简单了」、「我先探探路」、「写完再补测一样」。Superpowers 的判断是：一旦开口子，TDD 就消失了。

理由很简单。测试写在实现之后，测试通过不证明任何东西——它可能测错了东西、测了实现而非行为、漏掉了你忘记的边界情况。你从来没见过测试抓住那个 bug，因为实现的时候 bug 就不在了。

Superpowers 的解决方案不是「建议 TDD」，而是「强制执行」。AI 在实现任何功能前，必须先写测试、看它失败、写最小实现、看它通过、重构。写了代码再回头写测试？直接删掉代码，从测试开始重做。没有「先留着当参考」这种选项。

这不是教条，是工程实践。你保留那两小时没测试的代码，留下的是两小时技术债和零置信度。删掉重写要再花两小时，但你得到的是测试覆盖过的可信任代码。

## RED-GREEN-REFACTOR 执行细节

Superpowers 把 TDD 拆成三个阶段，每个阶段都有强制验证步骤。跳过任何一步，AI 都会被要求重新执行。

### RED - 写失败的测试

第一件事不是写代码，是写测试。测试必须满足三个条件：只测一个行为、名称清晰、用真实代码而非 mock。

```typescript
// 好的测试
test('重试失败操作 3 次', async () => {
  let attempts = 0;
  const operation = () => {
    attempts++;
    if (attempts < 3) throw new Error('fail');
    return 'success';
  };

  const result = await retryOperation(operation);

  expect(result).toBe('success');
  expect(attempts).toBe(3);
});
```

这个测试测一个行为（重试 3 次后成功），名称说清楚发生了什么，用的是真实代码而非 mock。

```typescript
// 不好的测试
test('retry works', async () => {
  const mock = jest.fn()
    .mockRejectedValueOnce(new Error())
    .mockRejectedValueOnce(new Error())
    .mockResolvedValueOnce('success');
  await retryOperation(mock);
  expect(mock).toHaveBeenCalledTimes(3);
});
```

名称模糊，测的是 mock 行为而非真实代码，看不出 retryOperation 应该怎么用。

### 验证 RED - 看测试失败

这是最关键的一步。**不能跳过**。

```bash
npm test path/to/test.test.ts
```

AI 必须确认三件事：
- 测试失败（不是报错）
- 失败信息是预期的
- 失败原因是功能缺失（不是拼写错误）

如果测试通过了？说明你在测试已存在行为，不是定义新行为。修正测试。

如果测试报错了？说明测试代码有问题，修好后再跑。

不跑测试直接实现？Superpowers 的 skill 会在执行流程里拦截。test-driven-development skill 会在实现代码前被触发，强制要求写测试并验证失败。

### GREEN - 最小实现

写最简单的代码让测试通过。不要添加功能、重构其他代码、「顺便改进」。

```typescript
// 好的实现 - 刚好够通过
async function retryOperation<T>(fn: () => Promise<T>): Promise<T> {
  for (let i = 0; i < 3; i++) {
    try {
      return await fn();
    } catch (e) {
      if (i === 2) throw e;
    }
  }
  throw new Error('unreachable');
}
```

```typescript
// 不好的实现 - 过度设计
async function retryOperation<T>(
  fn: () => Promise<T>,
  options?: {
    maxRetries?: number;
    backoff?: 'linear' | 'exponential';
    onRetry?: (attempt: number) => void;
  }
): Promise<T> {
  // YAGNI - 测试没要求的特性
}
```

测试只要求重试 3 次，你就只实现重试 3 次。后面的配置选项、回调函数、退避策略，等测试要求再写。

### 验证 GREEN - 看测试通过

```bash
npm test path/to/test.test.ts
```

AI 必须确认：
- 测试通过
- 其他测试依然通过
- 输出干净（无错误、无警告）

测试失败？修代码，别改测试。

其他测试挂了？现在就修。不要留着「回头再修」。

### REFACTOR - 清理代码

只有测试全绿之后才重构：
- 删除重复代码
- 改善命名
- 提取辅助函数

重构时保持测试通过。不要添加新行为。

### 重复循环

下一个功能，下一个失败的测试。

## "未测先写就删掉"的铁律

Superpowers 的核心规则写在 skill 里：

```
NO PRODUCTION CODE WITHOUT A FAILING TEST FIRST
```

不是「推荐」，是**强制**。

AI 检测到以下任何情况，都会触发删代码重来的流程：

- 代码写在测试之前
- 测试通过后写的（说明测的是已存在行为）
- 测试没看过失败就写了实现
- 「我先留着当参考」
- 「我写完再补测试」

处理方式很简单：`rm` 删掉代码，从 RED 阶段开始。

为什么要这么极端？因为「先留着」是个谎言。你会在写测试的时候不自觉地参考那堆代码。测试不再是「定义应该做什么」，变成「验证我写的代码做什么」。你失去了 TDD 的核心价值——通过测试先思考行为，再考虑实现。

更糟的是，保留的代码可能有 bug。你为 buggy 的代码写测试，测试可能就在验证那个 bug。删掉重写看起来浪费，但保留问题代码的浪费更大：你要花时间调试、修 bug、补测试，最后还是得回到 TDD。

## Testing Anti-Patterns 的核心

Superpowers 有个独立的 reference 文件 `testing-anti-patterns.md`，列出了测试中最容易犯的错误。AI 在写测试时会被要求参考这份文件，避免掉坑。

### 测试 Mock 行为而非真实行为

```typescript
// ❌ 错误：测试 mock 存在性
test('renders sidebar', () => {
  render(<Page />);
  expect(screen.getByTestId('sidebar-mock')).toBeInTheDocument();
});
```

你在验证 mock 在那，不是 sidebar 真的渲染了。测试在 mock 存在时通过，不在时失败，但和真实行为无关。

```typescript
// ✅ 正确：测真实组件或不 mock
test('renders sidebar', () => {
  render(<Page />);  // 别 mock sidebar
  expect(screen.getByRole('navigation')).toBeInTheDocument();
});
```

### 生产类里的测试专用方法

```typescript
// ❌ 错误：destroy() 只在测试里用
class Session {
  async destroy() {  // 看起来像生产 API！
    await this._workspaceManager?.destroyWorkspace(this.id);
  }
}
```

生产类被测试代码污染了。这个方法如果被意外调用在生产里，会删掉用户的 session。

```typescript
// ✅ 正确：测试工具处理清理
export async function cleanupSession(session: Session) {
  const workspace = session.getWorkspaceInfo();
  if (workspace) {
    await workspaceManager.destroyWorkspace(workspace.id);
  }
}

// 测试里
afterEach(() => cleanupSession(session));
```

### 不理解依赖就 Mock

```typescript
// ❌ 错误：mock 破坏了测试依赖的行为
test('detects duplicate server', () => {
  vi.mock('ToolCatalog', () => ({
    discoverAndCacheTools: vi.fn().mockResolvedValue(undefined)
  }));

  await addServer(config);
  await addServer(config);  // 应该抛错——但不会！
});
```

mock 的方法有测试需要的副作用（写配置），但被你删掉了。测试会通过，但不是因为你测对了。

```typescript
// ✅ 正确：在正确层级 mock
test('detects duplicate server', () => {
  vi.mock('MCPServerManager'); // 只 mock 慢的服务器启动

  await addServer(config);  // 配置写入
  await addServer(config);  // 重复检测 ✓
});
```

### 不完整的 Mock

```typescript
// ❌ 错误：只 mock 你知道的字段
const mockResponse = {
  status: 'success',
  data: { userId: '123', name: 'Alice' }
  // 缺失：下游代码用的 metadata
};

// 后来：代码访问 response.metadata.requestId 时挂了
```

部分 mock 隐藏了结构性假设。你只 mock 了你知道的字段，但下游代码可能依赖你没包含的字段。测试通过，集成失败。

```typescript
// ✅ 正确：镜像真实 API 完整性
const mockResponse = {
  status: 'success',
  data: { userId: '123', name: 'Alice' },
  metadata: { requestId: 'req-789', timestamp: 1234567890 }
  // 真实 API 返回的所有字段
};
```

## Rationalization 表

Superpowers 识别到合理化借口时，会拒绝执行并列出为什么。以下是完整的 rationalization 表：

| 借口 | 现实 |
|------|------|
| 「太简单不值得测」 | 简单代码也会坏。写个测试 30 秒。 |
| 「我回头再测」 | 测试立即通过证明不了什么。 |
| 「回头测效果一样」 | 测试后回答「这代码干嘛？」测试前回答「这代码该干嘛？」 |
| 「我手动测过所有边界情况」 | 临时 ≠ 系统。没记录，无法重跑。 |
| 「删掉 X 小时的成果是浪费」 | 沉没成本谬误。保留未验证代码才是技术债。 |
| 「留着当参考，先写测试」 | 你会不自觉适配它。删掉就是删掉。 |
| 「我需要先探探路」 | 可以。扔掉探索代码，TDD 起手。 |
| 「难测说明设计不清楚」 | 听测试的。难测 = 难用。 |
| 「TDD 会拖慢我」 | TDD 比 debug 快。实用就是测试先行。 |
| 「手动测更快」 | 手动无法证明边界情况。每次改代码都要重测。 |
| 「现有代码没测试」 | 你在改进它。为现有代码加测试。 |

这个表不是装饰。当 AI 说「这个太简单了」，Superpowers 会回：「简单代码也会坏。写个测试 30 秒。」当 AI 说「我先留着当参考」，Superpowers 会回：「你会不自觉适配它。删掉就是删掉。」

## 红旗标志

出现以下任何情况，AI 必须删掉代码、从 TDD 重新开始：

- 代码写在测试之前
- 实现后才写测试
- 测试立即通过
- 无法解释为什么测试失败
- 测试是「回头」加的
- 合理化「就这一次」
- 「我手动测过了」
| 「回头测效果一样」
- 「是精神不是仪式」
- 「留着当参考」或「适配现有代码」
- 「已经花了 X 小时，删掉是浪费」
- 「TDD 是教条，我这是实用」
- 「这个情况不同因为...」

所有这些信号触发同一个动作：删代码，TDD 重新来。

## 验证清单

Superpowers 要求 AI 在标记工作完成前检查每一项：

- [ ] 每个新函数/方法都有测试
- [ ] 每个测试都在实现前看过它失败
- [ ] 每个测试都因预期原因失败（功能缺失，不是拼写错误）
- [ ] 写了最小代码来通过每个测试
- [ ] 所有测试通过
- [ ] 输出干净（无错误、无警告）
- [ ] 测试用真实代码（只在无法避免时用 mock）
- [ ] 边界情况和错误处理覆盖了

无法勾选全部？说明你跳过 TDD。重来。

## 权衡与局限

Superpowers 的强制 TDD 不是免费午餐。

**成本：** 严格 TDD 确实慢过「先写后测」。一个 2 小时的功能，TDD 可能要 2.5 小时。差出来的 30 分钟，你在写测试、看测试失败、重构。但你得到的是可信任的代码、自动化回归保护、可读的行为文档。不做 TDD 的 2 小时，后面要花 4 小时 debug。

**适用范围：** Superpowers 的 TDD 强制适用于新功能、bug 修复、重构、行为变更。以下情况允许例外（但需人工确认）：一次性原型、生成的代码、配置文件。例外不是默认，是人工显式批准的。

**学习曲线：** 严格 TDD 需要练习。一开始会觉得别扭：「为什么一定要看测试失败？」但习惯了之后，你会发现看不失败就写代码反而更别扭——你怎么知道自己写的代码是对还是错？

**团队阻力：** 团队里有人不信 TDD？Superpowers 的 skill 会在 AI 层面强制执行，但团队文化仍然需要认同。如果有人手动绕过 skill、直接写代码，强制执行就失效了。你需要团队共识。

## 延伸阅读

- [Superpowers GitHub 仓库](https://github.com/obra/superpowers) - 完整技能库和最新文档
- [test-driven-development SKILL.md](https://github.com/obra/superpowers/blob/master/skills/test-driven-development/SKILL.md) - TDD skill 完整实现
- [testing-anti-patterns.md](https://github.com/obra/superpowers/blob/master/skills/test-driven-development/testing-anti-patterns.md) - 测试反模式参考
- [systematic-debugging SKILL.md](https://github.com/obra/superpowers/blob/master/skills/systematic-debugging/SKILL.md) - 系统 Debug 流程，常与 TDD 配合使用
- [receiving-code-review SKILL.md](https://github.com/obra/superpowers/blob/master/skills/receiving-code-review/SKILL.md) - 接收代码审查时处理 TDD 相关反馈

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
