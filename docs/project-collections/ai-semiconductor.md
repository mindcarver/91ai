# AI 半导体与芯片设计

开源 EDA 工具、AI 辅助芯片设计、半导体制造检测和相关学习资源。

数量：38

| 名称 | 概括 | 标签 | 链接 |
| --- | --- | --- | --- |
| OpenROAD - 开源 RTL-to-GDS 全流程 EDA 工具链 | 开源 RTL-to-GDS 全流程 EDA 工具链，支持综合、布局布线、时序分析等，是 DARPA IDEA 项目核心交付物 | eda, vlsi, open-source | [打开](https://github.com/The-OpenROAD-Project/OpenROAD) |
| OpenLane - 自动化 RTL-to-GDSII 芯片设计流程 | 基于 OpenROAD 的自动化 RTL-to-GDSII 流程框架，用于 SkyWater 130nm 开源 PDK，支持完整 ASIC 流程 | eda, asic, open-source | [打开](https://github.com/The-OpenROAD-Project/OpenLane) |
| Yosys - 开源硬件综合框架 | 开源硬件综合框架，支持 Verilog 综合到门级网表，是开源 EDA 生态核心工具 | eda, synthesis, verilog | [打开](https://github.com/YosysHQ/yosys) |
| Magic - 开源 VLSI 布局编辑器 | 开源 VLSI 布局编辑器，支持电路提取、设计规则检查（DRC），历史悠久且广泛使用 | eda, vlsi, layout | [打开](https://github.com/RTimothyEdwards/magic) |
| KLayout - 高性能芯片版图查看与编辑工具 | 高性能芯片版图查看与编辑工具，支持 GDS/OASIS 格式，可用于 DRC/LVS 检查 | eda, layout, gds | [打开](https://github.com/KLayout/klayout) |
| gdsfactory - Python 芯片版图设计库 | Python 芯片版图设计库，支持光子集成电路和电子集成电路的参数化版图生成，可导出 GDS 文件 | eda, python, photonic-ic | [打开](https://github.com/gdsfactory/gdsfactory) |
| Pyverilog - Python 硬件描述语言处理库 | Python 硬件描述语言处理库，提供 Verilog HDL 解析、代码分析、数据流分析和代码转换功能 | eda, verilog, python | [打开](https://github.com/PyHDI/Pyverilog) |
| OpenSTA - 开源静态时序分析工具 | 开源静态时序分析工具，用于集成电路设计中的时序验证，支持标准单元库格式 | eda, timing-analysis | [打开](https://github.com/The-OpenROAD-Project/OpenSTA) |
| skywater-pdk - Google SkyWater 130nm 开源工艺设计套件 | Google 和 SkyWater 合作的开源 130nm CMOS 工艺设计套件（PDK），包含标准单元库、I/O 库和设计规则 | pdk, open-source, asic | [打开](https://github.com/google/skywater-pdk) |
| gf180mcu-pdk - GlobalFoundries 180nm 开源工艺设计套件 | GlobalFoundries 180nm MCU 开源工艺设计套件，由 Google 和 GF 合作发布，支持教育和研究用途 | pdk, open-source | [打开](https://github.com/google/gf180mcu-pdk) |
| OpenFASOC - 开源模拟电路自动生成框架 | 开源全自动模拟电路生成框架，基于 University of Michigan 研究，支持温度传感器、LDO 等模拟 IP 自动生成 | eda, analog, generator | [打开](https://github.com/idea-fasoc/OpenFASOC) |
| Chipyard - RISC-V SoC 芯片设计框架 | UC Berkeley 开发的敏捷 SoC 芯片设计框架，集成 Chisel/Verilog 设计、仿真、综合和流片全流程 | risc-v, soc, fpga | [打开](https://github.com/ucb-bar/chipyard) |
| EDA-AI - AI 辅助 EDA 工具与资源合集 | AI 辅助 EDA 领域的工具、论文和资源合集，涵盖布局布线优化、功耗分析、测试生成等方向 | ai4eda, eda, collection | [打开](https://github.com/thinkforce-team/EDA-AI) |
| awesome_ai4eda - AI for EDA 论文精选列表 | AI for EDA 领域精选论文列表，覆盖智能布局布线、逻辑综合、物理验证和测试等研究方向 | ai4eda, papers, eda | [打开](https://github.com/ThinkBigger/awesome_ai4eda) |
| awesome-AI4EDA - AI 辅助 EDA 研究资源 | AI 辅助 EDA 研究的综合资源列表，包含论文、工具、数据集和竞赛信息 | ai4eda, papers, resources | [打开](https://github.com/ThinkBigger02/awesome-AI4EDA) |
| chipgptft - ChipGPT 面向 FPGA 的 AI HDL 生成 | ChipGPT 研究项目，探索使用大语言模型生成 FPGA 硬件描述代码，包含微调模型和数据集 | llm, hdl, fpga | [打开](https://github.com/PKU-AMD-Lab/chipgptft) |
| chipgptv - ChipGPT Verilog 代码生成 | ChipGPT Verilog 代码生成项目，研究 LLM 在硬件设计中的应用，自动生成 RTL 代码 | llm, verilog, code-generation | [打开](https://github.com/PKU-AMD-Lab/chipgptv) |
| RTLCoder - 专用 RTL 代码生成大模型 | 专为 Verilog/VHDL RTL 代码生成训练的大语言模型，基于 LLaMA 架构微调 | llm, rtl, code-generation | [打开](https://github.com/hkust-zhiywang/RTLCoder) |
| VeriReason - LLM Verilog 推理与生成基准 | LLM 在 Verilog 代码推理和生成任务上的基准测试框架，评估模型的硬件设计能力 | llm, verilog, benchmark | [打开](https://github.com/VeriReason/VeriReason) |
| VeriPrefer - LLM Verilog 偏好对齐研究 | 研究如何通过人类偏好对齐提升 LLM 生成 Verilog 代码的质量和正确性 | llm, verilog, alignment | [打开](https://github.com/VeriReason/VeriPrefer) |
| DeepPlace - 深度学习芯片布局算法 | 使用强化学习进行芯片布局放置的研究项目，探索 AI 在 VLSI 物理设计中的应用 | reinforcement-learning, placement, ai4eda | [打开](https://github.com/DiamondRam/DeepPlace) |
| PRNet - 强化学习芯片布线优化 | 基于强化学习的芯片布线优化网络，提升布线质量和效率 | reinforcement-learning, routing, ai4eda | [打开](https://github.com/PRNet-team/PRNet) |
| HubRouter - AI 芯片布线框架 | AI 驱动的芯片布线框架，结合深度学习和传统算法优化布线结果 | routing, deep-learning, ai4eda | [打开](https://github.com/HubRouter/HubRouter) |
| wafer-map-defect-classification - 晶圆缺陷分类 | 使用机器学习对半导体晶圆图进行缺陷模式分类，用于制造过程质量检测 | manufacturing, defect-detection, ml | [打开](https://github.com/boosokim/wafer-map-defect-classification) |
| Wafer-Map-Dataset - 晶圆图数据集 | 半导体制造中的晶圆图缺陷数据集，包含多种缺陷模式标注，可用于训练检测模型 | dataset, manufacturing, wafer | [打开](https://github.com/shuji-oh/Wafer-Map-Dataset) |
| wafer_fault_detection - 晶圆故障检测 ML 项目 | 使用机器学习方法检测半导体晶圆制造中的故障和异常模式 | manufacturing, fault-detection, ml | [打开](https://github.com/Codemaxx/wafer_fault_detection) |
| ngspice - 开源 SPICE 电路仿真器 | 开源 SPICE 电路仿真器，支持非线性 DC/AC/瞬态分析和蒙特卡洛仿真，广泛用于集成电路设计验证 | spice, simulation, circuit | [打开](https://git.code.sf.net/p/ngspice/ngspice) |
| Xyce - 高性能并行电路仿真器 | Sandia 国家实验室开发的高性能并行 SPICE 仿真器，支持大规模电路的并行仿真 | spice, simulation, parallel | [打开](https://github.com/Xyce/Xyce) |
| OpenFPGA - 开源 FPGA 架构探索框架 | 开源 FPGA 架构探索和原型验证框架，支持 FPGA 布线架构建模和比特流生成 | fpga, architecture, open-source | [打开](https://github.com/lnis-uofu/OpenFPGA) |
| Verible - Verilog 开发工具套件 | Google 开源的 Verilog 开发工具套件，提供格式化、lint、解析和语言服务器等功能 | verilog, linter, tooling | [打开](https://github.com/chipsalliance/verible) |
| SVUnit - SystemVerilog 单元测试框架 | SystemVerilog 的敏捷单元测试框架，支持 UVM 和非 UVM 设计的验证 | verification, systemverilog, testing | [打开](https://github.com/svunit/svunit) |
| cocotb - Python 数字电路验证框架 | 使用 Python 编写数字电路测试平台的协作验证框架，支持 VHDL/Verilog/SystemVerilog | verification, python, testbench | [打开](https://github.com/cocotb/cocotb) |
| Chisel - 硬件设计高级语言 | UC Berkeley 开发的硬件构造语言，基于 Scala，支持参数化设计和高级抽象 | hdl, chisel, hardware-design | [打开](https://github.com/chipsalliance/chisel3) |
| learn-fpga - FPGA 学习资源大全 | FPGA 开发学习资源大全，包含教程、工具、项目和社区资源，适合入门到进阶 | fpga, tutorial, learning | [打开](https://github.com/lastvolf/learn-fpga) |
| awesome-eda - EDA 工具与资源合集 | 开源 EDA 工具和相关资源的精选列表，涵盖综合、仿真、验证、版图等环节 | eda, collection, open-source | [打开](https://github.com/hubert23/awesome-eda) |
| OpenTimer - 开源静态时序分析器 | 开源的大规模集成电路静态时序分析器，C++ 实现，支持增量分析和图论算法 | eda, timing-analysis, cpp | [打开](https://github.com/OpenTimer/OpenTimer) |
| netlistsvg - 电路网表 SVG 可视化工具 | 将数字电路网表（Verilog JSON）渲染为 SVG 电路图，方便理解和文档化电路设计 | eda, visualization, verilog | [打开](https://github.com/nturley/netlistsvg) |
| circuitnet - AI 芯片设计数据集与模型 | AI 辅助芯片设计的数据集和预训练模型，覆盖拥塞预测、DRC 违规预测等任务 | ai4eda, dataset, deep-learning | [打开](https://github.com/circuitnet/circuitnet) |
