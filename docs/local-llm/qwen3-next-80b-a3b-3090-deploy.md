# 在单张 RTX 3090 上部署 Qwen3-Next-80B-A3B 并实测(含 GSM8K 评测)

> 实测日期:2026-07-06。本文记录在一台单卡 RTX 3090(24GB)机器上把 Qwen3-Next-80B-A3B 跑起来、并跑通 GSM8K 测试集的全过程,包括下载、部署、调参、踩坑和最终速度/质量数据。目标是可复现。

## 背景:为什么是这个模型

DeepSeek V4-Flash(284B 总参 / 13B 激活)很强,但**单张 24GB 显卡根本装不下**——即便最激进的 2-bit 量化,最小构建也要 ~81GB。DeepSeek 也没有发布 V4-Flash 的官方蒸馏版。

如果想在单张消费级显卡上拿到「V4-Flash 同款体验」(MoE + 极小激活参数 → 又快又能搞 agent),目前最现实的对位选择是 **Qwen3-Next-80B-A3B**:

| 维度 | DeepSeek V4-Flash | Qwen3-Next-80B-A3B |
| --- | --- | --- |
| 架构 | MoE,13B 激活 | MoE,**3B 激活** |
| 总参数 | 284B | 80B |
| 官方权重 | 159.61 GB(FP8) | 可下到 GGUF,Q2_K 仅 29.2GB |
| 单张 24GB 能跑? | ❌ 装不下 | ✅ Q2/Q3 量化可跑 |

它走的和 V4-Flash 是同一条技术路线(MoE 稀疏激活),只是规模缩小到 24GB 显卡能装下,因此具备「快、省、能搞 agent」的相似手感。

## 硬件与环境

| 项目 | 配置 |
| --- | --- |
| GPU | RTX 3090 24GB |
| 内存 | 62GB(跑 80B 建议至少 32GB) |
| CPU | 72 核 |
| 推理框架 | llama.cpp(CUDA 构建,build `4fc4ec5`) |
| 系统 | Linux,CUDA 13.1 / 驱动 590 |

> 没有 llama.cpp 的话:`git clone https://github.com/ggml-org/llama.cpp && cd llama.cpp && cmake -B build -DGGML_CUDA=ON && cmake --build build --config Release`。新版二进制装好后,主程序路径类似 `~/llama.cpp/build/bin/llama`。

## 第一步:下载模型(hf-mirror + aria2c)

模型仓:`unsloth/Qwen3-Next-80B-A3B-Instruct-GGUF`(下载量最高的 GGUF 来源)。各量化体积:

| 量化 | 体积 | 24GB 单卡评价 |
| --- | --- | --- |
| Q2_K | 29.2GB | 体积最小,质量仍可用(本文选用) |
| Q3_K_M | 38.3GB | 需 CPU offload 一部分 |
| Q4_K_M | 48.5GB | 单 24GB 装不下,要 2×24GB |

**关键坑:HuggingFace 直连在大文件上慢,且 aria2c 多线程会被 403。**

HF 现在用 Xet CDN 分发大文件,每个签名 URL 绑定了**特定字节范围**。`aria2c -x 16` 多线程各自请求不同 range → 全部 403。而单线程 `wget` 只能拿 ~9 MB/s,29GB 要近一小时。

解决办法:走 `hf-mirror.com` 镜像(普通反代,不走 Xet 签名,允许 range 并发):

```bash
# 验证镜像支持 range(应返回 206)
curl -sL -r 0-1000 -o /dev/null -w "%{http_code}\n" \
  https://hf-mirror.com/unsloth/Qwen3-Next-80B-A3B-Instruct-GGUF/resolve/main/Qwen3-Next-80B-A3B-Instruct-Q2_K.gguf

# 8 线程下载,可续传
aria2c -x 8 -s 8 -k 1M --file-allocation=none -c \
  -d ~/models/qwen3-next-80b-a3b \
  -o Qwen3-Next-80B-A3B-Instruct-Q2_K.gguf \
  "https://hf-mirror.com/unsloth/Qwen3-Next-80B-A3B-Instruct-GGUF/resolve/main/Qwen3-Next-80B-A3B-Instruct-Q2_K.gguf"
```

实测 ~12–14 MB/s,断点续传稳定。中途若因累积错误退出,带 `-c` 重跑同一个命令即可接着下。

## 第二步:用 llama.cpp 部署

### 命令行单轮跑通(最快验证)

新版 llama.cpp 改成了**子命令式**:`llama cli ...` / `llama serve ...`(不是老的 `llama-cli -m ...`)。

```bash
~/llama.cpp/build/bin/llama cli \
  -m ~/models/qwen3-next-80b-a3b/Qwen3-Next-80B-A3B-Instruct-Q2_K.gguf \
  -ngl 38 -c 8192 -t 16 \
  -p "用两句话解释为什么 MoE 模型总参数很大但单 token 成本很低。" \
  -n 128 --temp 0.7
```

`-ngl 38` 是关键:把 38 层(含 expert)放到 GPU。这个模型约 47 层,38 层约占 22.7GB,正好塞进 24GB 卡还留出 KV cache 空间。

### 起一个 OpenAI 兼容服务(供应用/评测调用)

```bash
~/llama.cpp/build/bin/llama serve \
  -m ~/models/qwen3-next-80b-a3b/Qwen3-Next-80B-A3B-Instruct-Q2_K.gguf \
  -ngl 34 -c 8192 -np 8 -t 16 \
  --host 127.0.0.1 --port 8080
```

`-np 8` 开 8 个并发 slot 支持批量请求。注意 `-c` 是**所有 slot 共享的上下文预算**,-np 8 + -c 8192 ≈ 每 slot 1K 上下文,GSM8K 这类短问答够用。

## 实测结果

### 速度(token/s)

| 跑法 | Prompt | 生成 | 说明 |
| --- | --- | --- | --- |
| 纯 CPU(`-ngl 0`) | 3.2 t/s | **4.5 t/s** | 不抢 GPU 时的兜底方案 |
| GPU offload `-ngl 35` | ~50 t/s | 21.3 t/s | 留了较多 expert 在 CPU |
| **GPU offload `-ngl 38`** | **68 t/s** | **28.4 t/s** | 推荐配置,VRAM 22.7GB |

把 `-ngl` 从 35 调到 38(多搬 3 层 expert 上 GPU),生成速度从 21 → 28 t/s,提升 33%。28 t/s 已经是「日常对话基本无感」的流畅度。

**`-ngl` 怎么定**:先 `nvidia-smi` 看空闲显存,Q2_K 每层约 0.6GB。24GB 卡留 ~1.5GB 给 KV/开销,其余全给权重 → 大约 `-ngl 37–39`。设太大(如 `-ngl 999`)会直接 OOM。

### GSM8K 评测(数学推理准确率)

测试集:`openai/gsm8k` 的 test split(1319 题)。从 HF 直接下 parquet(仅 410KB):

```bash
curl -sL https://huggingface.co/datasets/openai/gsm8k/resolve/main/main/test-00000-of-00001.parquet \
  -o gsm8k_test.parquet
```

方法:随机抽 200 题,zero-shot CoT(提示「逐步思考,最后用 `#### <答案>` 收尾」),`temperature=0`,取模型末位数字与标准答案比对,8 路并发打上面那个 `llama serve`。

| 指标 | 结果 |
| --- | --- |
| 样本数 | 200(从 1319 题随机抽样,seed=42) |
| **准确率** | **94.0%(188/200)** |
| 解析失败/报错 | 0 |
| 聚合吞吐 | 36.2 tok/s(8 路并发,server 端统计) |
| 单题均耗时 | 7.02s |
| 生成长度 | 平均 ~198 token,p90 ~378 |

> 解读:这是个相当漂亮的结果。Q2_K 是相当激进的 2-bit 量化,但 GSM8K 仍拿到 94%,说明这个 80B 在重压量化下数学推理能力基本没掉。横向对比:Qwen3-Next-80B-A3B 全精度 GSM8K 公开分数大约在 95–97% 区间,也就是说 Q2_K 只损失了几个点。如果你做的是更敏感的任务(代码生成、长文严谨推理),可以上 Q3_K_M 或 Q4_K_M(需更大显存或双卡)。

## 踩坑记录(给复现者)

1. **`aria2c` 多线程对 HF 直连 403**:Xet CDN 签名绑定字节范围。换 `hf-mirror.com`。
2. **`llama-cli -m ...` 报 `unknown command`**:新版是 `llama cli -m ...`,中间多个子命令。
3. **`-fa` 报 `unknown value`**:新版 flash-attn 要带值,写 `-fa on` 或省略(默认 auto)。
4. **即便 `-ngl 0` 也会 CUDA 崩溃**:llama.cpp 启动时仍会初始化 CUDA 查设备,显存被别的进程占满时会 core dump。想强制纯 CPU,设环境变量 `CUDA_VISIBLE_DEVICES=""`。
5. **`llama serve -np 16 -c 32768 -ngl 38` 第一次请求就崩**:KV cache + 权重超 24GB。并发 slot 越多,-c 占的 KV 越大。保守组合 `-ngl 34 -c 8192 -np 8` 稳定。
6. **用 `pkill -f "llama cli"` 会误杀自己**:这个 pattern 出现在你命令行里,会匹配到当前 shell 自杀。用进程名精确杀:`pkill -x llama`。

## 结论与适用场景

- **单张 3090 跑 80B-A3B 可行且体验不错**:Q2_K + `-ngl 38` 稳定 28 tok/s,日常对话/agent 工具调用够用。
- **想跑更大就加卡**:Q4_K_M(48.5GB)质量更好,但需要 2×24GB 或一张 48GB+ 卡。
- **纯 CPU 是兜底不是日常**:4.5 tok/s 只适合「没有 GPU 但临时要跑」的场景。
- **不要拿它和 V4-Flash 比绝对能力**:284B 总参的世界知识/硬推理仍是 V4-Flash 强;80B-A3B 的价值是「在消费级硬件上给出同款手感」。

如果只是想用 V4-Flash 级别的能力而没硬件,直接调 API(输出约 $0.28/M tokens)远比自建便宜。本地部署的价值在数据合规、离线和可定制。
