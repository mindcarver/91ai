# CI/CD for ML：自动化训练、测试、部署流水线——ML 系统的持续交付

<!--
调研来源：
1. "CI/CD for Machine Learning Pipelines" (Google Cloud) — ML CI/CD的架构设计
2. "Machine Learning CI/CD Best Practices" ( Neptune.ai ) — 实践指南
3. GitHub Actions for ML — CI/CD与ML结合的工具生态
4. "Continuous Delivery for Machine Learning" (Martin Fowler) — CD原则在ML中的应用
5. DVC + CI/CD 集成文档 — 数据版本与CI/CD的结合
6. CML (Continuous Machine Learning) 文档 — 专门为ML设计的CI/CD工具

核心发现：ML的CI/CD比传统软件CI/CD更复杂，因为需要管理数据版本、模型版本、实验配置。核心流水线包括：数据验证→模型训练→模型评估→模型注册→部署→监控。工具方面，GitHub Actions + CML + DVC是最流行的开源组合，Vertex AI Pipelines和SageMaker Pipelines是云原生方案。
-->

**TL;DR：** ML系统的持续交付（CI/CD）将训练、测试、部署自动化，确保每次代码或数据变更都经过完整的验证流程。本文讲解ML CI/CD的核心流水线设计、GitHub Actions配置、以及自动化测试策略。

## 为什么这很重要

传统软件的CI/CD已经非常成熟：推送代码 → 自动运行测试 → 自动部署。但ML系统的CI/CD面临额外的挑战：

1. **数据是代码的一部分**：模型的表现不仅取决于代码，还取决于数据。数据变更需要触发同样的CI/CD流程。
2. **训练需要GPU和大量时间**：一次完整的训练可能需要数小时甚至数天，不能每次push都重新训练。
3. **"测试"不仅仅是单元测试**：需要验证模型性能（准确率、延迟、公平性），这些测试比传统的assert更复杂。
4. **部署不是替换一个二进制文件**：需要灰度发布、A/B测试、回滚机制。

一个没有CI/CD的ML项目通常是这样的：
- 工程师手动运行训练脚本
- 手动记录实验结果
- 手动部署模型
- 没有任何自动化验证
- 出了问题靠人工回滚

有了CI/CD后：
- 代码或数据变更自动触发训练
- 自动评估模型性能是否达标
- 自动注册到模型仓库
- 自动部署（经过灰度验证）

## 核心概念

### ML CI/CD流水线的六个阶段

```
┌─────────┐   ┌─────────┐   ┌─────────┐   ┌─────────┐   ┌─────────┐   ┌─────────┐
│  代码/   │   │  数据   │   │  模型   │   │  模型   │   │  模型   │   │  持续   │
│  数据    │──▶│  验证   │──▶│  训练   │──▶│  评估   │──▶│  注册   │──▶│  监控   │
│  变更    │   │         │   │         │   │  测试   │   │         │   │         │
└─────────┘   └─────────┘   └─────────┘   └─────────┘   └─────────┘   └─────────┘
     │              │              │              │              │              │
  Git push     Schema检查    GPU集群训练    性能基准测试    版本号管理    漂移检测
  DVC push     分布检查      超参数搜索     公平性测试     元数据存储    自动告警
               质量门禁      分布式训练     延迟测试       产物存储      自动重训练
```

### 传统CI/CD vs ML CI/CD

| 维度 | 传统CI/CD | ML CI/CD |
|------|----------|----------|
| 触发条件 | 代码变更 | 代码变更 + 数据变更 + 定时触发 |
| 测试内容 | 单元测试、集成测试 | 数据测试 + 模型性能测试 + 延迟测试 |
| 构建产物 | Docker镜像 | 模型文件 + Docker镜像 |
| 部署策略 | 滚动更新 | 灰度发布 + A/B测试 + 影子模式 |
| 回滚条件 | 测试失败 | 测试失败 或 性能退化 |
| 资源需求 | CPU | GPU（训练）+ CPU（推理） |

## 工作原理（简化的心智模型）

### 用工厂质检来理解ML CI/CD

**持续集成（CI）** = 原材料到货时的自动检查。每次有新的原材料（数据）或新的生产工艺（代码）进来，自动检查质量。如果质量不达标，拒绝进入生产线。

**持续部署（CD）** = 产成品出厂前的自动检验和分发。每个新产品（模型）出厂前，自动检测性能是否达标。达标的自动送到商店（部署），不达标的打回重做。

**持续监控** = 产品在商店里的质量跟踪。顾客反馈（业务指标）和定期抽检（漂移检测）确保产品持续合格。

## 工作原理（详细机制）

### 一、GitHub Actions配置

```python
"""
GitHub Actions工作流配置生成器
为ML项目生成标准的CI/CD工作流
"""

# .github/workflows/ml-pipeline.yml 的内容

github_actions_workflow = """
name: ML Pipeline

on:
  push:
    branches: [main, develop]
    paths:
      - 'src/**'
      - 'data/**'
      - 'configs/**'
  pull_request:
    branches: [main]
  schedule:
    - cron: '0 2 * * 0'  # 每周日凌晨2点重新训练

jobs:
  # ============================================================
  # 阶段1: 数据验证
  # ============================================================
  data-validation:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: '3.11'
      
      - name: Install dependencies
        run: pip install -r requirements.txt
      
      - name: Validate data schema
        run: python scripts/validate_data.py --config configs/data_schema.json
      
      - name: Check data distribution
        run: python scripts/check_distribution.py --reference data/reference/ --current data/current/
      
      - name: Data quality report
        run: python scripts/data_quality_report.py

  # ============================================================
  # 阶段2: 模型训练（仅在需要时运行）
  # ============================================================
  model-training:
    needs: data-validation
    runs-on: [self-hosted, gpu]  # 需要GPU
    if: |
      github.ref == 'refs/heads/main' ||
      contains(github.event.head_commit.message, '[train]')
    steps:
      - uses: actions/checkout@v4
      
      - name: Pull data (DVC)
        run: dvc pull
      
      - name: Train model
        run: |
          python src/train.py \\
            --config configs/training_config.yaml \\
            --output-dir models/ \\
            --experiment-name "ci-training-${{ github.sha }}"
      
      - name: Evaluate model
        run: |
          python src/evaluate.py \\
            --model-path models/latest.pt \\
            --test-data data/test/ \\
            --metrics-file metrics.json
      
      - name: Check performance threshold
        run: |
          python scripts/check_threshold.py \\
            --metrics metrics.json \\
            --baseline metrics/baseline.json
      
      - name: Register model
        if: success()
        run: |
          python scripts/register_model.py \\
            --model-path models/latest.pt \\
            --metrics metrics.json \\
            --git-sha ${{ github.sha }}

  # ============================================================
  # 阶段3: 模型测试
  # ============================================================
  model-testing:
    needs: model-training
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Unit tests
        run: pytest tests/unit/ -v
      
      - name: Integration tests
        run: pytest tests/integration/ -v
      
      - name: Model performance tests
        run: |
          python tests/test_model_performance.py \\
            --model models/latest.pt \\
            --min-accuracy 0.85 \\
            --max-latency-ms 100
      
      - name: Fairness tests
        run: python tests/test_fairness.py --model models/latest.pt
      
      - name: API endpoint tests
        run: python tests/test_api.py --endpoint http://localhost:8000

  # ============================================================
  # 阶段4: 部署
  # ============================================================
  deploy:
    needs: [model-testing]
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v4
      
      - name: Build Docker image
        run: |
          docker build -t ml-model:${{ github.sha }} .
          docker tag ml-model:${{ github.sha }} ml-model:latest
      
      - name: Push to registry
        run: |
          docker push registry.example.com/ml-model:${{ github.sha }}
          docker push registry.example.com/ml-model:latest
      
      - name: Deploy to staging
        run: |
          kubectl set image deployment/ml-model-staging \\
            ml-model=registry.example.com/ml-model:${{ github.sha }}
      
      - name: Run smoke tests on staging
        run: python tests/test_staging.py
      
      - name: Deploy to production (canary)
        run: |
          kubectl apply -f k8s/canary-deployment.yaml
          sleep 300  # 等待5分钟观察canary
          python scripts/check_canary_health.py
      
      - name: Promote to full production
        if: success()
        run: kubectl apply -f k8s/production-deployment.yaml
"""

print("GitHub Actions ML Pipeline工作流已定义")
print(f"总行数: {len(github_actions_workflow.strip().splitlines())}")
```

### 二、自动化测试策略

```python
"""
ML系统的自动化测试框架
包含数据测试、模型测试、API测试
"""

import torch
import torch.nn as nn
import numpy as np
import json
import time
from typing import Dict, List

class MLTestSuite:
    """ML测试套件"""
    
    def __init__(self, config: Dict):
        self.config = config
        self.results = []
    
    def test_data_schema(self, data: Dict) -> bool:
        """测试数据是否符合预期的schema"""
        expected_columns = self.config.get('expected_columns', [])
        actual_columns = list(data.keys())
        
        missing = set(expected_columns) - set(actual_columns)
        extra = set(actual_columns) - set(expected_columns)
        
        passed = len(missing) == 0
        
        self.results.append({
            'test': 'data_schema',
            'passed': passed,
            'details': {'missing_columns': list(missing), 'extra_columns': list(extra)}
        })
        
        return passed
    
    def test_data_distribution(self, reference: np.ndarray, current: np.ndarray,
                               psi_threshold: float = 0.2) -> bool:
        """测试数据分布是否与参考分布一致"""
        from scipy import stats
        
        # PSI计算
        n_bins = 10
        bins = np.percentile(reference, np.linspace(0, 100, n_bins + 1))
        bins[0], bins[-1] = -np.inf, np.inf
        
        ref_counts = np.histogram(reference, bins=bins)[0]
        cur_counts = np.histogram(current, bins=bins)[0]
        
        ref_pct = np.clip(ref_counts / len(reference), 1e-6, 1)
        cur_pct = np.clip(cur_counts / len(current), 1e-6, 1)
        
        psi = np.sum((cur_pct - ref_pct) * np.log(cur_pct / ref_pct))
        
        passed = psi < psi_threshold
        self.results.append({
            'test': 'data_distribution',
            'passed': passed,
            'details': {'psi': psi, 'threshold': psi_threshold}
        })
        
        return passed
    
    def test_model_performance(self, model: nn.Module, test_data, 
                               min_accuracy: float = 0.85,
                               max_latency_ms: float = 100) -> bool:
        """测试模型性能是否达标"""
        device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
        model = model.to(device)
        model.eval()
        
        # 准确率测试
        correct = 0
        total = 0
        latencies = []
        
        with torch.no_grad():
            for x, y in test_data:
                x, y = x.to(device), y.to(device)
                
                start = time.time()
                output = model(x)
                latency = (time.time() - start) * 1000
                latencies.append(latency)
                
                predicted = output.argmax(1)
                correct += (predicted == y).sum().item()
                total += len(y)
        
        accuracy = correct / total if total > 0 else 0
        avg_latency = np.mean(latencies)
        p99_latency = np.percentile(latencies, 99)
        
        accuracy_passed = accuracy >= min_accuracy
        latency_passed = p99_latency <= max_latency_ms
        
        self.results.append({
            'test': 'model_performance',
            'passed': accuracy_passed and latency_passed,
            'details': {
                'accuracy': accuracy,
                'min_accuracy': min_accuracy,
                'avg_latency_ms': avg_latency,
                'p99_latency_ms': p99_latency,
                'max_latency_ms': max_latency,
            }
        })
        
        return accuracy_passed and latency_passed
    
    def test_model_regression(self, current_metrics: Dict, baseline_metrics: Dict,
                               max_degradation: float = 0.05) -> bool:
        """测试模型性能是否比基线退化"""
        passed = True
        degradations = {}
        
        for metric, baseline_value in baseline_metrics.items():
            if metric in current_metrics:
                current_value = current_metrics[metric]
                if baseline_value > 0:
                    degradation = (baseline_value - current_value) / baseline_value
                    degradations[metric] = degradation
                    if degradation > max_degradation:
                        passed = False
        
        self.results.append({
            'test': 'model_regression',
            'passed': passed,
            'details': {
                'degradations': degradations,
                'max_allowed': max_degradation,
            }
        })
        
        return passed
    
    def get_report(self) -> str:
        """生成测试报告"""
        report = "ML测试报告\n"
        report += "=" * 60 + "\n"
        
        total = len(self.results)
        passed = sum(1 for r in self.results if r['passed'])
        
        report += f"总测试数: {total}, 通过: {passed}, 失败: {total - passed}\n\n"
        
        for result in self.results:
            status = "✓ PASS" if result['passed'] else "✗ FAIL"
            report += f"{status} | {result['test']}\n"
            if not result['passed'] and 'details' in result:
                for k, v in result['details'].items():
                    if isinstance(v, float):
                        report += f"       {k}: {v:.4f}\n"
                    else:
                        report += f"       {k}: {v}\n"
        
        return report

# 演示
test_config = {
    'expected_columns': ['age', 'income', 'credit_score', 'loan_amount'],
}

suite = MLTestSuite(test_config)

# 测试1: 数据schema
data = {'age': [25, 30], 'income': [50000, 60000], 'credit_score': [700, 750], 'loan_amount': [10000, 20000]}
suite.test_data_schema(data)

# 测试2: 数据分布
np.random.seed(42)
ref = np.random.normal(0, 1, 1000)
cur = np.random.normal(0.1, 1.1, 1000)
suite.test_data_distribution(ref, cur)

# 测试4: 模型回归
baseline = {'accuracy': 0.90, 'f1': 0.88}
current = {'accuracy': 0.89, 'f1': 0.85}
suite.test_model_regression(current, baseline, max_degradation=0.05)

print(suite.get_report())
```

### 三、CML (Continuous Machine Learning)

```python
"""
CML配置示例
CML是专门为ML设计的CI/CD工具，由DVC团队开发
"""

cml_config = """
# .github/workflows/cml.yaml
name: CML Pipeline

on:
  push:
    branches: [main]

jobs:
  train-and-report:
    runs-on: ubuntu-latest
    container: docker://dvcorg/cml:0.18.1
    
    steps:
      - uses: actions/checkout@v4
      
      - name: Train model
        env:
          REPO_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          pip install -r requirements.txt
          python train.py
          
          # 生成训练报告
          dvc metrics show --show-md > report.md
          
          # 生成loss曲线图
          python -c "
          import matplotlib.pyplot as plt
          import json
          with open('metrics.json') as f:
              metrics = json.load(f)
          plt.plot(metrics['train_loss'], label='Train Loss')
          plt.plot(metrics['val_loss'], label='Val Loss')
          plt.legend()
          plt.savefig('loss_curve.png')
          "
          
          # 使用CML在PR中发布报告
          cml comment create report.md
          cml comment create --publish loss_curve.png
          
          # 比较与baseline的差异
          dvc metrics diff main --show-md > diff.md
          cml comment create diff.md
"""

print("CML (Continuous Machine Learning) 配置")
print(cml_config)
```

## 代码示例（完整可运行的 Python）

```python
"""
完整的ML CI/CD流水线模拟
从代码变更到生产部署的完整流程
"""

class MLPipeline:
    """ML CI/CD流水线模拟器"""
    
    def __init__(self, project_name: str):
        self.project = project_name
        self.stages = []
        self.current_stage = None
    
    def run_pipeline(self, trigger: str = 'push') -> Dict:
        """运行完整的CI/CD流水线"""
        print(f"ML CI/CD Pipeline - {self.project}")
        print(f"触发: {trigger}")
        print("=" * 60)
        
        results = {}
        
        # Stage 1: 数据验证
        print("\n[Stage 1/5] 数据验证...")
        data_result = self._validate_data()
        results['data_validation'] = data_result
        if not data_result['passed']:
            print("  ✗ 数据验证失败，流水线终止")
            return results
        print("  ✓ 数据验证通过")
        
        # Stage 2: 模型训练
        print("\n[Stage 2/5] 模型训练...")
        train_result = self._train_model()
        results['training'] = train_result
        print(f"  ✓ 训练完成 (accuracy: {train_result['accuracy']:.4f})")
        
        # Stage 3: 模型评估
        print("\n[Stage 3/5] 模型评估...")
        eval_result = self._evaluate_model(train_result)
        results['evaluation'] = eval_result
        if not eval_result['passed']:
            print(f"  ✗ 评估未达标 (accuracy: {eval_result['accuracy']:.4f} < {eval_result['threshold']})")
            return results
        print(f"  ✓ 评估达标")
        
        # Stage 4: 模型注册
        print("\n[Stage 4/5] 模型注册...")
        register_result = self._register_model(train_result, eval_result)
        results['registration'] = register_result
        print(f"  ✓ 模型已注册 (version: {register_result['version']})")
        
        # Stage 5: 部署
        print("\n[Stage 5/5] 部署...")
        deploy_result = self._deploy(register_result)
        results['deployment'] = deploy_result
        if deploy_result['success']:
            print(f"  ✓ 部署成功 (strategy: {deploy_result['strategy']})")
        else:
            print(f"  ✗ 部署失败")
        
        return results
    
    def _validate_data(self):
        return {'passed': True, 'checks': ['schema', 'distribution', 'completeness']}
    
    def _train_model(self):
        np.random.seed(42)
        accuracy = 0.85 + np.random.random() * 0.1
        return {'accuracy': accuracy, 'training_time': '2.5 hours', 'model_path': 'models/latest.pt'}
    
    def _evaluate_model(self, train_result):
        threshold = 0.85
        accuracy = train_result['accuracy']
        return {
            'accuracy': accuracy,
            'f1_score': accuracy - 0.02,
            'latency_p99_ms': 45,
            'threshold': threshold,
            'passed': accuracy >= threshold,
        }
    
    def _register_model(self, train_result, eval_result):
        version = f"v1.{int(time.time()) % 1000}"
        return {'version': version, 'model_path': train_result['model_path'], 'metrics': eval_result}
    
    def _deploy(self, register_result):
        return {
            'success': True,
            'strategy': 'canary',
            'canary_percentage': 10,
            'endpoint': 'https://api.example.com/predict',
        }

# 运行流水线
pipeline = MLPipeline("sentiment-classifier")
import time
result = pipeline.run_pipeline(trigger='push')
```

## 真实案例

### 案例1：Google的ML CI/CD

Google使用内部的ML管线系统（TFX）实现端到端的CI/CD：
- 数据验证使用TensorFlow Data Validation (TFDV)
- 模型训练使用Kubeflow Pipelines
- 模型评估使用TensorFlow Model Analysis (TFMA)
- 部署使用TensorFlow Serving
- 所有步骤通过Kubeflow Pipelines编排

### 案例2：Netflix的Meson

Netflix开发了Meson系统管理ML工作流：
- 基于Airflow的调度系统
- 支持定时训练和事件触发训练
- 自动化的模型验证和A/B测试
- 与Netflix的微服务架构无缝集成

## 权衡取舍以及何时不该使用

### CI/CD的复杂度成本

搭建完整的ML CI/CD系统可能需要数周的时间。对于小型项目或探索阶段，手动操作可能更高效。

### 训练成本

每次CI触发训练可能消耗大量GPU资源。策略：只在main分支push或有[train]标签时触发训练。

## 关键要点

1. **ML CI/CD需要管理三个版本**：代码版本（Git）、数据版本（DVC）、模型版本（MLflow/Registry）。
2. **流水线应分为六个阶段**：数据验证→训练→评估→注册→部署→监控。
3. **测试应包含四个层面**：数据测试、模型性能测试、回归测试、API测试。
4. **GitHub Actions + CML + DVC是最流行的开源组合**。
5. **部署应使用灰度策略**：canary deployment逐步放量，观察指标后再全量发布。

## 延伸阅读

- CML文档 (cml.dev)
- Kubeflow Pipelines (kubeflow.org)
- TFX文档 (tensorflow.org/tfx)
- Martin Fowler "Continuous Delivery for Machine Learning"
