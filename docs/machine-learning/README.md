# Machine Learning Learning Path

> 目标：帮助技术人建立从经典 ML 到深度学习到前沿方向的系统知识体系，能读论文、能写代码、能判断方案取舍。

机器学习不要从 Transformer 开始。更合理的路线是先理解经典算法和数据思维，再进入深度学习、CV/NLP、训练工程和生产化。

## 资料筛选原则

这个专题不追求链接数量。优先收录：

- 经典教材和顶级课程（Stanford、MIT、fast.ai 等）。
- 能解释"为什么"的资料，而不是只给 API 调用的教程。
- 有完整代码、有数学推导、有真实案例的内容。
- 对学习路线某个阶段有明确帮助的资源。

暂不优先收录：

- 只包装概念、不讲原理的营销文章。
- 没有数学推导、只有调库代码的"实战教程"。
- 过时的框架教程（TensorFlow 1.x、旧版 Keras 等）。

## 精选学习资料

### Stage 0: 机器学习基础

| 资源 | 为什么收录 | 适合阶段 |
| --- | --- | --- |
| [Andrew Ng - Machine Learning Specialization](https://www.coursera.org/specializations/machine-learning-introduction) | 全球最受欢迎的 ML 入门课程，2022 年更新为 Python 版，Ng 教授教学清晰度无出其右 | 0 |
| [Stanford CS229](https://cs229.stanford.edu/) | Coursera 版的"真实"斯坦福课程，数学更深，适合想扎实理解原理的人 | 0 |
| [Google ML Crash Course](https://developers.google.com/machine-learning/crash-course) | 最快的实用入门（15 小时），Google 教学设计优秀，适合快速概览 | 0 |
| [StatQuest (Josh Starmer)](https://www.youtube.com/c/joshstarmer) | 最佳可视化 ML 解释，把复杂概念拆成 10-20 分钟的清晰视频 | 0 |
| [ISLR - An Introduction to Statistical Learning](https://www.statlearning.com/) | 最好的第一本 ML 教材，免费 PDF，第二版含 Python 和深度学习章节 | 0 |
| [Hands-On ML with Scikit-Learn, Keras, and TensorFlow (Geron)](https://www.oreilly.com/library/view/hands-on-machine-learning/9781098125967/) | 最好的"动手实践"ML 书籍，代码驱动，第三版覆盖 Transformer | 0 |

判断：入门阶段不要先学深度学习框架。先通过经典算法建立"数据 → 特征 → 模型 → 评估"的完整思维。

### Stage 1: 模型评估与选择

| 资源 | 为什么收录 | 适合阶段 |
| --- | --- | --- |
| [ISLR Ch.5-7](https://www.statlearning.com/) | 交叉验证、bootstrapping、模型选择的经典教材讲解 | 1 |
| [Google ML Crash Course - Classification](https://developers.google.com/machine-learning/crash-course/classification/video-lecture) | ROC/AUC/精确率/召回率的最佳入门可视化讲解 | 1 |
| [Kaggle Learn - Feature Engineering](https://www.kaggle.com/learn/feature-engineering) | 实用特征工程练习，真实数据集驱动 | 1 |
| [Optuna Docs](https://optuna.readthedocs.io/) | 当前最好的超参数调优框架，贝叶斯优化实战首选 | 1 |

判断：评估和特征工程比模型选择更重要。一个简单的模型配上好的特征工程，往往胜过复杂模型配上烂特征。

### Stage 2: 深度学习基础

| 资源 | 为什么收录 | 适合阶段 |
| --- | --- | --- |
| [Andrew Ng - Deep Learning Specialization](https://www.coursera.org/specializations/deep-learning) | 深度学习最系统的入门课程，从神经网络到 CNN/RNN 完整覆盖 | 2 |
| [Andrej Karpathy - Neural Networks: Zero to Hero](https://karpathy.ai/zero-to-hero.html) | 从零构建 GPT，独特的"理解每一行代码"教学法 | 2 |
| [fast.ai - Practical Deep Learning](https://course.fast.ai/) | 自上而下教学法，第一课就能跑模型，适合工程师转型 | 2 |
| [MIT 6.S191 - Intro to Deep Learning](https://introtodeeplearning.com/) | MIT 短期课程，每年更新，广度好、节奏快 | 2 |
| [Deep Learning Book (Goodfellow et al.)](https://www.deeplearningbook.org/) | 深度学习"圣经"，理论最全面，免费在线版 | 2 |
| [Dive into Deep Learning (d2l.ai)](https://zh.d2l.ai/) | 交互式在线教材，代码+数学+文字一体，完整中文版 | 2 |

判断：学深度学习不要只调库。至少要手动实现一次反向传播和梯度下降，才能真正理解训练过程。

### Stage 3: 计算机视觉

| 资源 | 为什么收录 | 适合阶段 |
| --- | --- | --- |
| [Stanford CS231n](https://cs231n.stanford.edu/) | CV 深度学习的黄金标准，作业质量极高（从零构建 CNN） | 3 |
| [PyTorch Vision Tutorials](https://pytorch.org/tutorials/)| PyTorch 官方 CV 教程，覆盖分类、检测、分割 | 3 |
| [YOLO Official Docs](https://docs.ultralytics.com/) | 目标检测实战首选，文档和代码质量都很高 | 3 |

判断：CV 学到 ResNet 和 YOLO 就够用了。除非做 CV 研究，否则不需要深入每个架构变体。

### Stage 4: NLP 基础

| 资源 | 为什么收录 | 适合阶段 |
| --- | --- | --- |
| [Stanford CS224n](https://web.stanford.edu/class/cs224n/) | NLP/LLM 深度学习的黄金标准，Manning 教授，从 word2vec 到 Transformer | 4 |
| [Hugging Face NLP Course](https://huggingface.co/learn/nlp-course) | 最实用的 NLP 课程，直接用 Transformers 库 | 4 |
| [Jay Alammar - The Illustrated Transformer/BERT/GPT](https://jalammar.github.io/) | 最佳可视化架构解释，社区标准参考资料 | 4 |

判断：NLP 的重点不是每个模型都学，而是理解从词向量 → RNN → Attention → Transformer 的演进逻辑。

### Stage 5: Transformer 与现代架构

| 资源 | 为什么收录 | 适合阶段 |
| --- | --- | --- |
| [Attention Is All You Need (原论文)](https://arxiv.org/abs/1706.03762) | Transformer 原始论文，必读 | 5 |
| [Stanford CS25 - Transformers United](https://web.stanford.edu/class/cs25/) | 唯一专注 Transformer 的课程，包含发明者的客座讲座 | 5 |
| [Hugging Face LLM Course](https://huggingface.co/learn/llm-course) | 最新的 LLM 课程，覆盖架构、训练、微调、部署 | 5 |
| [Lil'Log (Lilian Weng)](https://lilianweng.github.io/) | 最具影响力的个人 ML 博客，Transformer/LLM 文章是社区标准参考 | 5 |
| [Andrej Karpathy - Let's build GPT-2](https://www.youtube.com/watch?v=l8pRSuU81PU) | 从零构建 GPT-2，理解大模型内部机制的最佳实践 | 5 |

判断：理解 Transformer 不等于会用 LLM API。重点在自注意力、位置编码、预训练-微调范式的原理，而不是推理 API 调用。

### Stage 6: 训练工程

| 资源 | 为什么收录 | 适合阶段 |
| --- | --- | --- |
| [DataTalks.Club - ML Zoomcamp](https://github.com/DataTalksClub/machine-learning-zoomcamp) | 最实用的免费 ML 工程课程，端到端覆盖 | 6 |
| [Full Stack Deep Learning](https://fullstackdeeplearning.com/) | "软件工程师需要了解的 ML 全部知识"，UC Berkeley 训练营 | 6 |
| [DeepLearning.AI - MLOps Specialization](https://www.deeplearning.ai/courses/machine-learning-in-production) | Andrew Ng 出品，生产 ML 系统设计与部署 | 6 |
| [MLflow Docs](https://mlflow.org/docs/latest/index.html) | 实验管理标准工具 | 6 |
| [Weights & Biases Docs](https://docs.wandb.ai/) | 实验跟踪和可视化首选 | 6 |

判断：训练工程的重点不是分布式框架怎么配，而是数据质量、实验可复现、训练调试方法论。

### Stage 7: MLOps 与生产化

| 资源 | 为什么收录 | 适合阶段 |
| --- | --- | --- |
| [DataTalks.Club - MLOps Zoomcamp](https://github.com/DataTalksClub/mlops-zoomcamp) | 唯一覆盖完整 MLOps 生命周期的免费课程 | 7 |
| [Made With ML - MLOps Course](https://madewithml.com/) | 端到端 ML 系统，代码优先 | 7 |
| [Evidently AI Docs](https://docs.evidentlyai.com/) | 数据漂移和模型监控的开源工具 | 7 |
| [ONNX Runtime](https://onnxruntime.ai/) | 跨平台推理优化的工业标准 | 7 |

判断：MLOps 的核心是"模型上线后怎么知道它坏了"，而不是部署工具本身。数据漂移监控比推理框架选择更重要。

### Stage 8: 进阶方向

| 资源 | 为什么收录 | 适合阶段 |
| --- | --- | --- |
| [David Silver - RL Course (UCL/DeepMind)](https://www.davidsilver.uk/teaching/) | RL 黄金标准课程，AlphaGo 首席研究员讲授 | 8 |
| [OpenAI Spinning Up](https://spinningup.openai.com/) | 最佳实践型 RL 资源，代码优先 | 8 |
| [Sutton & Barto - RL: An Introduction](http://incompleteideas.net/book/the-book.html) | RL 领域定义性教材，免费 PDF | 8 |
| [DeepLearning.AI - How Diffusion Models Work](https://www.deeplearning.ai/short-courses/how-diffusion-models-work/) | 扩散模型最易懂的入门 | 8 |
| [Papers With Code](https://paperswithcode.com/) | 论文与代码实现的桥梁，SOTA 追踪必备 | 8 |

判断：进阶方向按兴趣选择。RL 是大模型对齐（RLHF）的基础，扩散模型是生成式 AI 的核心。

### Stage 9: 自进化 AI 方法论

| 资源 | 为什么收录 | 适合阶段 |
| --- | --- | --- |
| [A Survey of Self-Evolving Agents (arxiv 2507.21046)](https://arxiv.org/abs/2507.21046) | 自进化 agent 最新综述，提供统一分类框架 | 9 |
| [Darwin Gödel Machine (Sakana AI)](https://arxiv.org/abs/2505.22954) | 自改写代码 agent 的代表作，代码层自进化 | 9 |
| [AlphaZero (Science)](https://www.science.org/doi/10.1126/science.aar6404) | self-play 的里程碑，策略层自进化经典 | 9 |
| [DSPy GEPA Optimization](https://dspy.ai/getting-started/gepa-optimization/) | 自动 prompt 优化的工程化实现，prompt 层自进化 | 9 |
| [Awesome Self-Evolving Agents](https://github.com/EvoAgentX/Awesome-Self-Evolving-Agents) | 自进化方向的论文/项目聚合，追踪前沿 | 9 |

判断：自进化是"系统用自己的输出当信号改进自己"，覆盖参数、结构、策略、prompt 到代码五个层级。理解它的前提是先掌握 RL（Stage 8）和 LLM 训练（Stage 5）。

## 中文学习资源

| 资源 | 内容 | 适合阶段 |
| --- | --- | --- |
| [李宏毅 ML/DL 2025](https://speech.ee.ntu.edu.tw/~hylee/ml/2025-spring.php) | 最受欢迎的中文 ML 课程，每年更新，幽默清晰 | 0-5 |
| [李沐 - 动手学深度学习](https://zh.d2l.ai/) | 最好的动手实践型中文 DL 教材，B 站 60 小时视频 | 2-5 |
| [吴恩达机器学习中文版](https://www.bilibili.com/video/BV1Bq421A7GH/) | Coursera 课程完整中文翻译 | 0 |
| [Datawhale 开源社区](https://github.com/datawhalechina) | 学习笔记、习题解答、学习小组 | 0-5 |
| [南瓜书 (Pumpkin Book)](https://github.com/datawhalechina/pumpkin-book) | 西瓜书数学推导详解，中国学生的必备伴侣 | 0 |

## 学习路线总览

| 阶段 | 主题 | 文章 | 目标产出 |
| --- | --- | --- | --- |
| 0 | 机器学习基础 | [6 篇](./stage0-ml-basics/) | 能用经典算法完成 Kaggle 入门赛 |
| 1 | 模型评估与选择 | [5 篇](./stage1-evaluation/) | 能诊断过拟合、选择评估指标、做特征工程 |
| 2 | 深度学习基础 | [5 篇](./stage2-deep-learning/) | 能从零搭建神经网络，理解反向传播和优化器 |
| 3 | 计算机视觉 | [4 篇](./stage3-cv/) | 能用 CNN 做图像分类和目标检测 |
| 4 | NLP 基础 | [4 篇](./stage4-nlp/) | 能理解从词向量到 Attention 的 NLP 演进 |
| 5 | Transformer 与现代架构 | [5 篇](./stage5-transformer/) | 能理解 BERT/GPT/LLM 的技术基础 |
| 6 | 训练工程 | [5 篇](./stage6-training-eng/) | 能管理数据、调试训练、做实验跟踪 |
| 7 | MLOps 与生产化 | [4 篇](./stage7-mlops/) | 能部署模型、监控漂移、优化推理 |
| 8 | 进阶方向 | [4 篇](./stage8-advanced/) | 能选择 RL/扩散模型/多模态等方向深入学习 |
| 9 | 自进化 AI 方法论 | [8 篇](./stage9-self-evolution/) | 能理解系统如何用自身信号迭代，从自博弈到自改写代码 |

## 系列文章

每篇文章 8000+ 字，从直觉到数学到代码的完整路径，包含可运行的 Python 示例。

### Stage 0：机器学习基础

| # | 文章 | 核心问题 |
| --- | --- | --- |
| 0.1 | [什么是机器学习](./stage0-ml-basics/01-what-is-ml.md) | 监督/无监督/强化学习到底在做什么，什么时候该用哪个 |
| 0.2 | [线性回归](./stage0-ml-basics/02-linear-regression.md) | 从一条直线开始，理解损失函数、梯度下降和模型训练的全过程 |
| 0.3 | [逻辑回归](./stage0-ml-basics/03-logistic-regression.md) | 分类问题的起点，sigmoid、决策边界、概率输出 |
| 0.4 | [决策树与随机森林](./stage0-ml-basics/04-decision-tree-random-forest.md) | 树怎么分裂、集成为什么比单树强、过拟合怎么控制 |
| 0.5 | [支持向量机](./stage0-ml-basics/05-svm.md) | 最大间隔、核技巧、为什么在高维空间好用 |
| 0.6 | [聚类与降维](./stage0-ml-basics/06-clustering-pca.md) | K-Means、DBSCAN、PCA，无监督学习什么时候有用 |

### Stage 1：模型评估与选择

| # | 文章 | 核心问题 |
| --- | --- | --- |
| 1.1 | [过拟合与欠拟合](./stage1-evaluation/01-overfitting-underfitting.md) | 偏差-方差权衡、学习曲线诊断、正则化思路 |
| 1.2 | [交叉验证与数据泄露](./stage1-evaluation/02-cross-validation.md) | 为什么 train/test split 不够，常见的数据泄露坑 |
| 1.3 | [评估指标全解](./stage1-evaluation/03-metrics.md) | 准确率/精确率/召回率/F1/AUC-ROC，每个指标什么时候看 |
| 1.4 | [超参数调优](./stage1-evaluation/04-hyperparameter-tuning.md) | 网格搜索、随机搜索、贝叶斯优化，实际怎么选 |
| 1.5 | [特征工程](./stage1-evaluation/05-feature-engineering.md) | 数值/类别/文本/时间特征的处理方法，什么真的有效 |

### Stage 2：深度学习基础

| # | 文章 | 核心问题 |
| --- | --- | --- |
| 2.1 | [神经网络入门](./stage2-deep-learning/01-neural-network-intro.md) | 感知机 → 多层网络 → 通用近似定理，为什么需要深层 |
| 2.2 | [反向传播](./stage2-deep-learning/02-backpropagation.md) | 计算图、链式法则、梯度如何一层层传回去 |
| 2.3 | [激活函数](./stage2-deep-learning/03-activation-functions.md) | ReLU/Sigmoid/Tanh/GELU 的选择，为什么不用线性激活 |
| 2.4 | [优化器](./stage2-deep-learning/04-optimizers.md) | SGD/Adam/LR Schedule，学习率是最重要的超参数 |
| 2.5 | [正则化与训练技巧](./stage2-deep-learning/05-regularization.md) | Dropout/Batch Norm/权重衰减/残差连接，训练不稳定的解法 |

### Stage 3：计算机视觉

| # | 文章 | 核心问题 |
| --- | --- | --- |
| 3.1 | [CNN 基础](./stage3-cv/01-cnn-basics.md) | 卷积/池化/感受野，为什么图像不用全连接 |
| 3.2 | [经典架构演进](./stage3-cv/02-classic-architectures.md) | LeNet → AlexNet → VGG → ResNet → EfficientNet |
| 3.3 | [目标检测](./stage3-cv/03-object-detection.md) | YOLO/R-CNN 系列，从分类到定位的跳跃 |
| 3.4 | [图像分割](./stage3-cv/04-image-segmentation.md) | 语义分割 vs 实例分割，U-Net 和 Mask R-CNN |

### Stage 4：NLP 基础

| # | 文章 | 核心问题 |
| --- | --- | --- |
| 4.1 | [文本表示](./stage4-nlp/01-text-representation.md) | 从 One-Hot 到 TF-IDF 到词向量，文本怎么变成数字 |
| 4.2 | [Word2Vec 与词嵌入](./stage4-nlp/02-word-embeddings.md) | CBOW/Skip-gram、负采样，词向量的几何意义 |
| 4.3 | [RNN 与 LSTM](./stage4-nlp/03-rnn-lstm.md) | 序列建模的问题、梯度消失、LSTM 的门控机制 |
| 4.4 | [Attention 机制](./stage4-nlp/04-attention.md) | 为什么 Attention 比 RNN 好，Query/Key/Value 是什么 |

### Stage 5：Transformer 与现代架构

| # | 文章 | 核心问题 |
| --- | --- | --- |
| 5.1 | [Transformer 详解](./stage5-transformer/01-transformer-explained.md) | 自注意力、多头注意力、位置编码，逐层拆解 |
| 5.2 | [BERT](./stage5-transformer/02-bert.md) | 双向编码、MLM/NSP 预训练、微调范式 |
| 5.3 | [GPT 与自回归模型](./stage5-transformer/03-gpt-autoregressive.md) | 因果语言模型、为什么生成用自回归 |
| 5.4 | [预训练与微调范式](./stage5-transformer/04-pretrain-finetune-prompt.md) | Pre-train → Fine-tune → Prompt，范式的三次变化 |
| 5.5 | [大模型的缩放定律](./stage5-transformer/05-scaling-laws.md) | Scaling Law、Chinchilla、MoE，为什么模型越大越好 |

### Stage 6：训练工程

| # | 文章 | 核心问题 |
| --- | --- | --- |
| 6.1 | [数据工程](./stage6-training-eng/01-data-engineering.md) | 数据收集/清洗/标注/增强，数据质量决定模型上限 |
| 6.2 | [分布式训练](./stage6-training-eng/02-distributed-training.md) | 数据并行/模型并行/ZeRO，多卡多机怎么训 |
| 6.3 | [显存优化与混合精度](./stage6-training-eng/03-memory-optimization.md) | FP16/BF16/梯度累加/激活重计算，显存不够怎么办 |
| 6.4 | [训练调试](./stage6-training-eng/04-training-debugging.md) | Loss 不下降/震荡/Nan 的排查清单 |
| 6.5 | [实验管理](./stage6-training-eng/05-experiment-management.md) | 版本控制/实验跟踪/可复现性，MLflow 与 W&B |

### Stage 7：MLOps 与生产化

| # | 文章 | 核心问题 |
| --- | --- | --- |
| 7.1 | [模型部署](./stage7-mlops/01-model-deployment.md) | 从 Jupyter Notebook 到 API 的完整路径 |
| 7.2 | [模型监控](./stage7-mlops/02-model-monitoring.md) | 数据漂移/概念漂移/性能退化，上线后怎么知道模型坏了 |
| 7.3 | [CI/CD for ML](./stage7-mlops/03-cicd-for-ml.md) | 自动化训练/测试/部署流水线，ML 系统的持续交付 |
| 7.4 | [推理优化](./stage7-mlops/04-inference-optimization.md) | 量化/蒸馏/剪枝/ONNX/TensorRT，延迟和成本的权衡 |

### Stage 8：进阶方向

| # | 文章 | 核心问题 |
| --- | --- | --- |
| 8.1 | [强化学习](./stage8-advanced/01-reinforcement-learning.md) | MDP/Q-Learning/Policy Gradient/RLHF，RL 的核心框架 |
| 8.2 | [扩散模型](./stage8-advanced/02-diffusion-models.md) | 从噪声到图像，DDPM/Stable Diffusion 的原理 |
| 8.3 | [多模态学习](./stage8-advanced/03-multimodal-learning.md) | 视觉-语言模型/CLIP/多模态 Agent |
| 8.4 | [图神经网络](./stage8-advanced/04-graph-neural-networks.md) | 节点分类/图分类/GAT/GCN，非欧几里得数据怎么学 |

### Stage 9：自进化 AI 方法论

| # | 文章 | 核心问题 |
| --- | --- | --- |
| 9.1 | [自进化到底是什么](./stage9-self-evolution/01-what-is-self-evolution.md) | 自进化定义、五层级模型（参数/结构/策略/prompt/代码）、统一四步循环 |
| 9.2 | [自博弈](./stage9-self-evolution/02-self-play.md) | 为什么自己和自己下棋能变强，TD-Gammon → AlphaGo → AlphaZero |
| 9.3 | [进化算法与神经进化](./stage9-self-evolution/03-neuroevolution.md) | 不靠梯度也能优化，NEAT/ES/NAS，无梯度改结构 |
| 9.4 | [元学习](./stage9-self-evolution/04-meta-learning.md) | 学会如何学习，MAML 双层循环、少样本、meta-RL |
| 9.5 | [自动 prompt 优化](./stage9-self-evolution/05-automatic-prompt-optimization.md) | 让模型优化自己的 prompt，OPRO/DSPy/TextGrad |
| 9.6 | [自进化的大模型](./stage9-self-evolution/06-self-evolving-llm.md) | STaR/self-rewarding/合成数据回流，宪法 AI 自我对齐 |
| 9.7 | [自进化 Agent 与 Gödel 之梦](./stage9-self-evolution/07-self-evolving-agent.md) | 代码层自进化，Gödel Machine、Darwin Gödel、AI Scientist |
| 9.8 | [自进化的边界与风险](./stage9-self-evolution/08-limits-and-risks.md) | reward hacking、model collapse、真实进展 vs 炒作 |

## 推荐学习路径

### 路径 A：实用工程师（偏应用）

```
Stage 0 (经典 ML) → Stage 1 (评估) → Stage 2 (深度学习)
→ Stage 6 (训练工程) → Stage 7 (MLOps) → Kaggle 实战
```

适合目标是用 ML 解决实际问题的工程师。

### 路径 B：AI 应用开发者（偏 LLM）

```
Stage 0 (经典 ML) → Stage 2 (深度学习) → Stage 4 (NLP)
→ Stage 5 (Transformer) → Agent Learning Path
```

适合目标是构建 AI 应用和 Agent 的开发者。Stage 3-4 可选。

### 路径 C：研究导向（偏理论）

```
Stage 0 (CS229) → Stage 2 (Goodfellow) → Stage 3 (CS231n)
→ Stage 4 (CS224n) → Stage 5 (CS25) → Stage 8 (论文阅读)
```

适合目标是读论文、做研究的人。每门课的作业必须完成。

### 路径 D：中文优先

```
3Blue1Brown → 李宏毅 ML 2025 → 李沐动手学深度学习
→ 吴恩达中文版 → Datawhale 学习小组 → Kaggle
```

适合中文学习环境，资料质量同样很高。

## 推荐第一个项目

做一个 **房价预测管道**。

它应该能：

- 从 CSV 读取真实数据。
- 做数据清洗和特征工程。
- 训练至少 3 个不同模型（线性回归、随机森林、XGBoost）。
- 用交叉验证评估，选出最优模型。
- 记录实验（MLflow 或 W&B）。
- 部署为 API（FastAPI + Docker）。
- 监控预测分布变化。

这个项目覆盖了 Stage 0-1 的全部核心概念，同时涉及 Stage 6-7 的工程实践。

## 常见误区

- 一上来就学深度学习，跳过经典 ML。
- 只调库，不理解算法原理。
- 不做特征工程，直接把原始数据扔给模型。
- 不看评估指标，只看准确率。
- 不做交叉验证，用训练集上的表现判断模型好坏。
- 数据泄露：在特征工程时用了测试集信息。
- 追求最新架构，ResNet 和随机森林依然能解决大部分问题。
- 不做实验记录，改了什么、为什么改、效果如何全忘了。
- 模型上线后不监控，不知道性能什么时候退化。

## 与其他专题的关系

| 专题 | 关系 |
| --- | --- |
| [Agent Learning Path](../agent/) | Stage 5 是 Agent 路径的技术基础，理解 Transformer 才能更好地用 LLM |
| [AI Coding](../ai-coding/) | ML 知识帮助更好地使用 AI 编程工具生成 ML 代码 |
| [AI App Developer Path](../paths/ai-app-developer.md) | ML 基础是 AI 应用开发的理论支撑 |
| [Backend Path](../paths/backend.md) | Stage 7 MLOps 与后端路径的生产化阶段对接 |

## 推荐学习顺序

1. 经典 ML 算法（Stage 0）
2. 模型评估与选择（Stage 1）
3. 深度学习基础（Stage 2）
4. CV 或 NLP（Stage 3 或 4，按兴趣选一个）
5. Transformer（Stage 5）
6. 训练工程（Stage 6）
7. MLOps（Stage 7）
8. 进阶方向（Stage 8，按兴趣选择）
9. 自进化 AI 方法论（Stage 9，进阶，需先掌握 RL 和 LLM 训练）
