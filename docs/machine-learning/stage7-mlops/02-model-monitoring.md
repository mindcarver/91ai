# 模型监控：数据漂移、概念漂移与性能退化——上线后怎么知道模型坏了

<!--
调研来源：
1. IBM "What Is Model Drift?" — 模型漂移的权威定义和分类
2. Evidently AI "Data drift in ML" — 数据漂移的检测和处理方法
3. Arize AI "Model Drift & Machine Learning" — 生产环境中的漂移检测
4. Datadog "ML model monitoring best practices" — 模型监控的最佳实践
5. Reddit讨论 "Data drift is not a good indicator of model performance degradation" — 数据漂移检测的局限性
6. Galileo AI "Model vs Data Drift" — 模型漂移和数据漂移的区别

核心发现：模型性能退化的三大原因是数据漂移（输入分布变化）、概念漂移（输入-输出关系变化）和标签漂移（输出分布变化）。数据漂移检测（如KS检验、PSI）虽然常用，但社区实践表明它并不总是好的性能退化指标。直接监控业务指标和模型输出分布通常更有效。工具方面，Evidently AI、Arize AI、NannyML是2024-2026年的主流监控工具。
-->

**TL;DR：** 模型上线不是终点，而是监控的起点。本文讲解数据漂移、概念漂移、性能退化的检测方法，以及如何建立一套完整的模型监控体系，在模型"坏了"之前发现问题。

## 为什么这很重要

2021年，Zillow的房产估值模型（Zestimate）出现系统性偏差，导致公司在房价波动期间做出了错误的购房决策，最终亏损超过5亿美元，裁员25%。

这不是个别案例。大多数部署到生产环境的ML模型都会随时间退化。原因很简单：**世界在变化，但你的模型是静态的。**

一个在2024年1月训练的推荐模型，到2024年6月可能已经明显退化了，因为：
- 用户兴趣发生了变化（夏天偏好不同类型的内容）
- 新用户加入了平台（用户画像分布变了）
- 竞品推出了新功能（用户行为模式变了）
- 季节性变化（节假日购买行为不同）

如果你不监控模型性能，你可能几个月都不知道模型已经"坏了"——直到业务指标明显下降。

## 核心概念

### 三种类型的漂移

```
┌──────────────────────────────────────────────────────────────┐
│ 数据漂移 (Data Drift / Covariate Shift)                       │
│                                                               │
│ 输入分布发生了变化，但输入-输出关系没变                          │
│                                                               │
│ 例子：训练时的用户年龄分布是20-40岁，现在大量50岁用户加入         │
│ P(X) 变了，但 P(Y|X) 没变                                      │
│                                                               │
│ 检测方法：统计检验（KS, PSI, Wasserstein）                      │
├──────────────────────────────────────────────────────────────┤
│ 概念漂移 (Concept Drift)                                      │
│                                                               │
│ 输入-输出关系发生了变化                                        │
│                                                               │
│ 例子：疫情前"外出就餐"是正面情感词，疫情期间变成负面             │
│ P(Y|X) 变了                                                    │
│                                                               │
│ 检测方法：监控模型性能指标、业务指标                             │
├──────────────────────────────────────────────────────────────┤
│ 标签漂移 (Label Drift / Prior Probability Shift)              │
│                                                               │
│ 输出分布发生了变化                                             │
│                                                               │
│ 例子：欺诈率从0.1%上升到2%（标签分布变化）                      │
│ P(Y) 变了                                                      │
│                                                               │
│ 检测方法：监控预测分布、业务KPI                                 │
└──────────────────────────────────────────────────────────────┘
```

## 工作原理（简化的心智模型）

### 用天气预报来理解模型漂移

你训练了一个预测明天是否会下雨的模型，用的是北京2010-2020年的天气数据。

**数据漂移**：你把这个模型用到上海。上海的气候数据和北京不一样（输入分布不同），但"气压低+湿度高→下雨"这个规律是一样的。模型可能在上海表现差一些，因为上海的"输入空间"有些区域是北京数据没覆盖到的。

**概念漂移**：由于气候变化，北京的降水模式发生了变化。以前7月几乎不下暴雨，现在7月暴雨频繁。气压和湿度与是否下雨的关系本身变了。即使你的输入数据还是北京的，模型也会失效。

**标签漂移**：某个区域突然进入了雨季，下雨的概率从10%变成了60%。模型可能还在准确预测"给定的天气条件下是否下雨"，但总体预测"下雨"的频率与实际不符。

## 工作原理（详细机制）

### 一、数据漂移检测

```python
"""
数据漂移检测方法实现
包含KS检验、PSI、Wasserstein距离
"""

import numpy as np
from scipy import stats
from typing import Dict, Tuple, List
from collections import defaultdict

class DataDriftDetector:
    """数据漂移检测器"""
    
    def __init__(self, reference_data: np.ndarray, feature_names: List[str] = None):
        """
        参数:
            reference_data: 参考数据集（训练时的数据分布）
            feature_names: 特征名称列表
        """
        self.reference = reference_data
        self.feature_names = feature_names or [f'feature_{i}' for i in range(reference_data.shape[1])]
    
    def ks_test(self, current_data: np.ndarray, alpha: float = 0.05) -> Dict:
        """
        Kolmogorov-Smirnov检验
        
        原理：比较两个分布的累积分布函数(CDF)的最大差异
        如果差异超过阈值，认为分布发生了显著变化
        
        H0: 两个分布相同
        H1: 两个分布不同
        p < alpha → 拒绝H0 → 存在漂移
        """
        n_features = self.reference.shape[1]
        results = {}
        
        for i in range(n_features):
            ref_col = self.reference[:, i]
            cur_col = current_data[:, i]
            
            # 移除NaN
            ref_clean = ref_col[~np.isnan(ref_col)]
            cur_clean = cur_col[~np.isnan(cur_col)]
            
            statistic, p_value = stats.ks_2samp(ref_clean, cur_clean)
            
            results[self.feature_names[i]] = {
                'statistic': statistic,
                'p_value': p_value,
                'drift_detected': p_value < alpha,
                'threshold': alpha,
            }
        
        return results
    
    def population_stability_index(self, current_data: np.ndarray, 
                                    n_bins: int = 10, threshold: float = 0.2) -> Dict:
        """
        Population Stability Index (PSI)
        
        PSI是银行业广泛使用的漂移指标：
        PSI < 0.1: 无显著变化
        0.1 ≤ PSI < 0.2: 轻微变化，需要关注
        PSI ≥ 0.2: 显著变化，需要行动
        
        计算方法：
        1. 将参考数据和当前数据分成相同的区间（bins）
        2. 计算每个区间中参考数据和当前数据的比例
        3. PSI = sum((cur_pct - ref_pct) * ln(cur_pct / ref_pct))
        """
        n_features = self.reference.shape[1]
        results = {}
        
        for i in range(n_features):
            ref_col = self.reference[:, i]
            cur_col = current_data[:, i]
            
            # 使用参考数据的分位数定义bins
            bins = np.percentile(ref_col, np.linspace(0, 100, n_bins + 1))
            bins[0] = -np.inf
            bins[-1] = np.inf
            
            # 计算每个bin中的比例
            ref_counts = np.histogram(ref_col, bins=bins)[0]
            cur_counts = np.histogram(cur_col, bins=bins)[0]
            
            ref_pct = ref_counts / len(ref_col)
            cur_pct = cur_counts / len(cur_col)
            
            # 避免除零
            ref_pct = np.clip(ref_pct, 1e-6, 1)
            cur_pct = np.clip(cur_pct, 1e-6, 1)
            
            psi = np.sum((cur_pct - ref_pct) * np.log(cur_pct / ref_pct))
            
            if psi < 0.1:
                severity = 'LOW'
            elif psi < 0.2:
                severity = 'MEDIUM'
            else:
                severity = 'HIGH'
            
            results[self.feature_names[i]] = {
                'psi': psi,
                'severity': severity,
                'drift_detected': psi >= threshold,
            }
        
        return results
    
    def wasserstein_distance(self, current_data: np.ndarray) -> Dict:
        """
        Wasserstein距离（Earth Mover's Distance）
        
        直观理解：把一个分布"变形"为另一个分布需要的最小"工作量"
        距离越大，两个分布越不同
        """
        n_features = self.reference.shape[1]
        results = {}
        
        for i in range(n_features):
            ref_col = self.reference[:, i]
            cur_col = current_data[:, i]
            
            distance = stats.wasserstein_distance(ref_col, cur_col)
            
            # 用参考数据的标准差归一化
            ref_std = np.std(ref_col)
            normalized_distance = distance / ref_std if ref_std > 0 else distance
            
            results[self.feature_names[i]] = {
                'wasserstein_distance': distance,
                'normalized_distance': normalized_distance,
            }
        
        return results
    
    def full_report(self, current_data: np.ndarray) -> Dict:
        """生成完整的漂移检测报告"""
        ks_results = self.ks_test(current_data)
        psi_results = self.population_stability_index(current_data)
        wasserstein_results = self.wasserstein_distance(current_data)
        
        # 汇总
        n_drifted_ks = sum(1 for v in ks_results.values() if v['drift_detected'])
        n_drifted_psi = sum(1 for v in psi_results.values() if v['drift_detected'])
        
        report = {
            'ks_test': ks_results,
            'psi': psi_results,
            'wasserstein': wasserstein_results,
            'summary': {
                'n_features': len(self.feature_names),
                'n_drifted_ks': n_drifted_ks,
                'n_drifted_psi': n_drifted_psi,
                'drift_detected': n_drifted_ks > 0 or n_drifted_psi > 0,
            }
        }
        
        # 打印报告
        print("数据漂移检测报告")
        print("=" * 70)
        print(f"特征数: {report['summary']['n_features']}")
        print(f"KS检验检测到漂移: {n_drifted_ks} 个特征")
        print(f"PSI检测到漂移: {n_drifted_psi} 个特征")
        print()
        
        print(f"{'特征':<15} {'KS p-value':>12} {'KS漂移':>8} {'PSI':>8} {'PSI严重度':>10}")
        print("-" * 60)
        for fname in self.feature_names:
            ks = ks_results[fname]
            psi = psi_results[fname]
            print(f"{fname:<15} {ks['p_value']:>12.6f} {'是' if ks['drift_detected'] else '否':>8} "
                  f"{psi['psi']:>8.4f} {psi['severity']:>10}")
        
        return report

# 演示
np.random.seed(42)
n_features = 5
n_ref = 5000
n_cur = 3000

feature_names = ['age', 'income', 'credit_score', 'loan_amount', 'interest_rate']

# 参考数据（训练时的分布）
ref_data = np.column_stack([
    np.random.normal(35, 10, n_ref),        # age
    np.random.lognormal(10.5, 0.5, n_ref),  # income
    np.random.normal(700, 50, n_ref),       # credit_score
    np.random.exponential(50000, n_ref),    # loan_amount
    np.random.normal(5, 1, n_ref),          # interest_rate
])

# 当前数据（分布有变化）
cur_data = np.column_stack([
    np.random.normal(40, 12, n_cur),         # age分布变了（均值35→40）
    np.random.lognormal(10.8, 0.6, n_cur),   # income分布变了
    np.random.normal(700, 50, n_cur),        # credit_score没变
    np.random.exponential(60000, n_cur),     # loan_amount变了
    np.random.normal(5, 1, n_cur),           # interest_rate没变
])

detector = DataDriftDetector(ref_data, feature_names)
report = detector.full_report(cur_data)
```

### 二、概念漂移检测

```python
"""
概念漂移检测
当输入-输出关系发生变化时，模型性能会下降
"""

import numpy as np
from collections import deque
from typing import List, Dict

class ConceptDriftDetector:
    """
    概念漂移检测器
    
    方法：监控模型性能指标的变化趋势
    当性能持续下降时，认为发生了概念漂移
    """
    
    def __init__(self, window_size: int = 100, threshold: float = 2.0):
        """
        参数:
            window_size: 滑动窗口大小
            threshold: 标准差倍数阈值
        """
        self.window_size = window_size
        self.threshold = threshold
        self.errors = deque(maxlen=window_size * 2)
        self.reference_mean = None
        self.reference_std = None
    
    def set_reference(self, errors: List[float]):
        """设置参考基线（初始性能水平）"""
        self.reference_mean = np.mean(errors)
        self.reference_std = np.std(errors)
        self.errors.extend(errors)
        print(f"参考基线: mean_error={self.reference_mean:.4f}, std={self.reference_std:.4f}")
    
    def update(self, error: float) -> Dict:
        """
        添加一个新的误差值并检测漂移
        
        使用Page-Hinkley变化检测方法：
        监控误差的累积变化量，当累积变化超过阈值时触发警报
        """
        self.errors.append(error)
        
        if len(self.errors) < self.window_size:
            return {'drift_detected': False, 'status': 'warming_up'}
        
        # 计算最近窗口的性能
        recent = list(self.errors)[-self.window_size:]
        recent_mean = np.mean(recent)
        
        # 与参考基线比较
        if self.reference_mean is None:
            return {'drift_detected': False, 'status': 'no_reference'}
        
        # 使用z-score检测
        z_score = (recent_mean - self.reference_mean) / max(self.reference_std, 1e-8)
        
        # Page-Hinkley累积和
        cumsum = 0
        max_cumsum = 0
        for e in list(self.errors)[-self.window_size:]:
            cumsum += (e - self.reference_mean - self.reference_std * 0.005)
            max_cumsum = max(max_cumsum, cumsum)
        
        drift_detected = (z_score > self.threshold) or (max_cumsum > self.threshold * self.reference_std)
        
        return {
            'drift_detected': drift_detected,
            'recent_mean': recent_mean,
            'reference_mean': self.reference_mean,
            'z_score': z_score,
            'degradation_pct': (recent_mean - self.reference_mean) / self.reference_mean * 100,
        }

# 演示：模拟模型性能随时间退化
np.random.seed(42)
detector = ConceptDriftDetector(window_size=50, threshold=2.0)

# 设置参考基线
initial_errors = np.random.normal(0.1, 0.02, 200)
detector.set_reference(initial_errors)

print("\n模拟概念漂移检测:")
print(f"{'步骤':>6} {'误差':>8} {'z-score':>8} {'退化%':>8} {'漂移':>6}")
print("-" * 45)

for step in range(200):
    # 前100步：正常误差
    # 后100步：概念漂移导致误差增大
    if step < 100:
        error = np.random.normal(0.1, 0.02)
    else:
        # 逐渐增大（模拟概念漂移）
        drift_amount = 0.002 * (step - 100)
        error = np.random.normal(0.1 + drift_amount, 0.02)
    
    result = detector.update(error)
    
    if step % 20 == 0 or result['drift_detected']:
        print(f"{step:6d} {error:8.4f} {result.get('z_score', 0):8.2f} "
              f"{result.get('degradation_pct', 0):7.1f}% "
              f"{'⚠ 漂移!' if result['drift_detected'] else '正常':>6}")
    
    if result['drift_detected']:
        break
```

### 三、完整的模型监控系统

```python
"""
完整的模型监控系统
整合数据漂移、概念漂移、性能监控
"""

from dataclasses import dataclass, field
from typing import Dict, List, Optional
import time
import json

@dataclass
class Alert:
    """告警"""
    timestamp: str
    alert_type: str  # 'data_drift', 'concept_drift', 'performance', 'error_rate'
    severity: str    # 'info', 'warning', 'critical'
    message: str
    metric_name: str
    metric_value: float
    threshold: float
    action: str

class ModelMonitor:
    """
    模型监控系统
    
    功能：
    1. 数据漂移检测（定期检测输入数据分布变化）
    2. 概念漂移检测（监控模型性能趋势）
    3. 性能监控（延迟、吞吐量、错误率）
    4. 自动告警（超过阈值时触发告警）
    """
    
    def __init__(
        self,
        model_name: str,
        drift_check_interval: int = 1000,  # 每N个请求检查一次漂移
        performance_window: int = 100,      # 性能监控窗口
        latency_threshold_ms: float = 100,  # 延迟阈值
        error_rate_threshold: float = 0.01, # 错误率阈值
    ):
        self.model_name = model_name
        self.drift_check_interval = drift_check_interval
        self.performance_window = performance_window
        self.latency_threshold_ms = latency_threshold_ms
        self.error_rate_threshold = error_rate_threshold
        
        self.request_count = 0
        self.error_count = 0
        self.latencies = deque(maxlen=1000)
        self.predictions = deque(maxlen=10000)
        self.alerts = []
    
    def log_prediction(self, input_features: np.ndarray, prediction: float, 
                       latency_ms: float, error: bool = False) -> Optional[Alert]:
        """
        记录一次预测
        
        在每次预测后调用，自动检测异常
        """
        self.request_count += 1
        self.latencies.append(latency_ms)
        self.predictions.append(prediction)
        
        if error:
            self.error_count += 1
        
        # 检查延迟
        if latency_ms > self.latency_threshold_ms:
            alert = Alert(
                timestamp=time.strftime('%Y-%m-%d %H:%M:%S'),
                alert_type='performance',
                severity='warning',
                message=f'延迟超过阈值: {latency_ms:.1f}ms > {self.latency_threshold_ms:.1f}ms',
                metric_name='latency_p99',
                metric_value=latency_ms,
                threshold=self.latency_threshold_ms,
                action='检查服务器负载，考虑扩容'
            )
            self.alerts.append(alert)
        
        # 检查错误率
        if self.request_count >= 100:
            error_rate = self.error_count / self.request_count
            if error_rate > self.error_rate_threshold:
                alert = Alert(
                    timestamp=time.strftime('%Y-%m-%d %H:%M:%S'),
                    alert_type='error_rate',
                    severity='critical',
                    message=f'错误率超过阈值: {error_rate:.2%} > {self.error_rate_threshold:.2%}',
                    metric_name='error_rate',
                    metric_value=error_rate,
                    threshold=self.error_rate_threshold,
                    action='检查模型输入数据和服务状态'
                )
                self.alerts.append(alert)
        
        return self.alerts[-1] if self.alerts else None
    
    def get_dashboard(self) -> Dict:
        """获取监控面板数据"""
        latencies = list(self.latencies)
        
        return {
            'model': self.model_name,
            'total_requests': self.request_count,
            'error_rate': self.error_count / max(self.request_count, 1),
            'latency': {
                'p50': np.percentile(latencies, 50) if latencies else 0,
                'p95': np.percentile(latencies, 95) if latencies else 0,
                'p99': np.percentile(latencies, 99) if latencies else 0,
                'avg': np.mean(latencies) if latencies else 0,
            },
            'prediction_stats': {
                'mean': np.mean(list(self.predictions)) if self.predictions else 0,
                'std': np.std(list(self.predictions)) if self.predictions else 0,
                'min': np.min(list(self.predictions)) if self.predictions else 0,
                'max': np.max(list(self.predictions)) if self.predictions else 0,
            },
            'total_alerts': len(self.alerts),
            'recent_alerts': [
                {'type': a.alert_type, 'severity': a.severity, 'message': a.message}
                for a in self.alerts[-5:]
            ],
        }

# 演示
monitor = ModelMonitor("sentiment-v1")

print("模型监控演示")
print("=" * 60)

# 模拟1000次请求
np.random.seed(42)
for i in range(1000):
    features = np.random.randn(10)
    prediction = np.random.random()
    latency = np.random.exponential(20) + 5
    
    # 模拟一些异常
    error = np.random.random() < 0.005  # 0.5%错误率
    if i > 800:
        latency *= 2  # 后期延迟增加
    
    alert = monitor.log_prediction(features, prediction, latency, error)

# 打印监控面板
dashboard = monitor.get_dashboard()
print(f"\n模型监控面板 - {dashboard['model']}")
print(f"  总请求数: {dashboard['total_requests']}")
print(f"  错误率: {dashboard['error_rate']:.2%}")
print(f"  延迟: P50={dashboard['latency']['p50']:.1f}ms, "
      f"P95={dashboard['latency']['p95']:.1f}ms, "
      f"P99={dashboard['latency']['p99']:.1f}ms")
print(f"  预测统计: mean={dashboard['prediction_stats']['mean']:.4f}, "
      f"std={dashboard['prediction_stats']['std']:.4f}")
print(f"  告警数: {dashboard['total_alerts']}")
for alert in dashboard['recent_alerts']:
    print(f"    [{alert['severity']}] {alert['message']}")
```

## 代码示例（完整可运行的 Python）

```python
"""
端到端的模型监控流水线
将漂移检测、性能监控、自动告警整合
"""

# 已在上面完整实现
# 核心组件：
# 1. DataDriftDetector — 数据漂移检测（KS, PSI, Wasserstein）
# 2. ConceptDriftDetector — 概念漂移检测（Page-Hinkley）
# 3. ModelMonitor — 综合监控系统（延迟、错误率、预测分布）
# 4. Alert — 告警系统

# 典型的监控流水线配置
monitoring_config = {
    "model_name": "fraud-detection-v2",
    "checks": {
        "data_drift": {
            "method": "psi",
            "threshold": 0.2,
            "frequency": "daily",
            "features": ["amount", "merchant_category", "time_of_day", "location"],
        },
        "concept_drift": {
            "method": "page_hinkley",
            "threshold": 3.0,
            "metric": "f1_score",
            "window_size": 500,
        },
        "performance": {
            "latency_p99_threshold_ms": 50,
            "error_rate_threshold": 0.001,
            "min_requests_per_hour": 100,
        }
    },
    "alerts": {
        "channels": ["email", "slack", "pagerduty"],
        "escalation": {
            "warning": "slack",
            "critical": "pagerduty",
        }
    },
    "retraining": {
        "auto_trigger": False,  # 自动触发重训练（需要人工确认）
        "condition": "concept_drift_detected and degradation > 10%",
    }
}

print("监控配置:")
print(json.dumps(monitoring_config, indent=2, ensure_ascii=False))
```

## 真实案例

### 案例1：Tesla自动驾驶的影子模式

Tesla的自动驾驶系统采用"影子模式"监控：模型在后台对驾驶员的行为进行预测，但不实际控制车辆。当模型的预测与驾驶员的实际操作不一致时，记录这些差异。通过分析大量的不一致案例，Tesla可以：
- 识别模型在哪些场景下表现差
- 自动收集新的训练数据
- 验证新模型是否在这些场景上有改进

### 案例2：Spotify的推荐监控

Spotify为推荐系统建立了多层监控：
- 数据层：监控用户行为日志的完整性
- 特征层：监控特征分布变化
- 模型层：监控推荐准确率（点击率、收听完成率）
- 业务层：监控用户留存率和收听时长

### 案例3：金融风控模型监控

银行的风控模型有严格的监管要求：
- 每日检查输入数据的完整性
- 每周计算PSI检测数据漂移
- 每月评估模型区分度（AUC、KS统计量）
- 每季度提交模型性能报告给监管机构
- PSI超过0.25时必须重新训练模型

## 权衡取舍以及何时不该使用

### 数据漂移检测的局限性

数据漂移检测是一个间接指标——输入分布变化不一定会导致模型性能下降。Reddit社区的一个讨论指出："数据漂移不是模型性能退化的好指标"——因为模型可能对分布变化有天然的鲁棒性。

**更好的做法**：直接监控模型输出和业务指标。如果业务指标正常，即使检测到数据漂移，也不需要紧急行动。

### 监控成本

完整的监控系统需要存储大量数据（输入特征、预测结果、实际标签），这增加了存储成本和计算成本。对于低价值的模型，过度监控可能不值得。

## 关键要点

1. **模型上线后，监控是必须的，不是可选的**。不监控的模型就像不体检的人——出了问题才发现就晚了。

2. **数据漂移检测使用PSI和KS检验**。PSI < 0.1表示无显著变化，PSI > 0.2需要行动。KS检验更敏感，适合检测单个特征的漂移。

3. **概念漂移是最危险的漂移类型**，因为它改变了输入-输出的关系本身。最可靠的检测方法是直接监控模型性能指标（准确率、F1等）。

4. **监控应该是多层的**：数据层（数据质量）、特征层（分布变化）、模型层（性能指标）、业务层（业务KPI）。

5. **告警需要分级**：info（记录即可）、warning（需要关注）、critical（需要立即行动）。避免告警疲劳。

6. **数据漂移 ≠ 模型性能退化**。输入分布变化不一定影响模型效果。优先监控业务指标和模型输出分布。

## 延伸阅读

**工具**：
- Evidently AI — 开源的ML监控工具
- Arize AI — ML可观测性平台
- NannyML — 无标签的性能估计
- WhyLabs — 数据和模型监控

**文章**：
- IBM "What Is Model Drift?" — 漂移的权威定义
- Evidently AI博客 — 各种漂移检测方法的详细讲解
- Datadog "ML Model Monitoring Best Practices" — 生产监控的最佳实践

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
