---
name: luz-system
description: 设计 Luz 系统的需求、模块与业务规则、功能清单、首页与各端的入口归属、界面流程、原型行为或现场硬件时使用。产出前先读任务对应的 context.py 规则卡，并完成本阶段调研。界面外观与文档排版由 Luz-Design 负责，后端实现由 Luz-Dev 负责。
---

# Luz 系统

把需求写成可检查的业务模块、功能入口、角色权限、动作和状态。按[交接分工](../Luz-Design/references/ui-ownership.md)把界面功能合同交给 Luz-Design，把已批准的业务规则交给 Luz-Dev。

## 调用协议

按 [WORKFLOW.md](WORKFLOW.md) 执行。项目任务接入[项目流程](../Luz-Project/references/skill-architecture.md)，需要的阶段质量规则用 `quality_rules.py list --owner luz-system --stage <阶段>` 选取。

1. `py -X utf8 scripts/context.py list` 选类型，`scripts/context.py <类型> [<类型> …]` 读所选规则卡。按手册用 `new_session.py` 建独立会话，有显式项目上下文时传 `--project <状态根>`。
2. 按[阶段依据](../Luz-Crawl/references/evidence-policy.md)和[调用方法](../Luz-Crawl/references/preflight.md)运行 `crawl_preflight.py run --caller luz-system`。本地依据登记后 `check`。联网依据读正文、`conclude` 后 `check`。
3. 按手册为该阶段和准确产出路径绑定 Design 模板。使用对应生成器登记哈希，运行 `validate_session.py --strict-production` 与 Design 的 `check_document.py`，再实看桌面与 390 px 手机。硬件清单另用 `hw_build.py`。
4. 按[审批](WORKFLOW.md#审批)逐个确认模块范围、架构、系统设计、视觉、原型和硬件清单。独立会话批准绑定文件哈希。平台销售演示可按手册在生成前取得单次授权，各阶段照常产出和复核。
5. `experience.py note` 写入或确认实践，BRIEF 写“采用的规则”和“本次沉淀”，`publish.py` 在阶段条件满足后发布。正式成果按[文档验收](../Luz-Design/references/document-evidence.md)复核。

## 规则页

- [模块与业务规则](references/system-design.html)、[共用界面行为](references/ui-standards.html)、[功能清单](references/function-list-design.html)。
- [后台](references/admin-design.html)、[小程序](references/miniprogram-design.html)、[网站](references/website-design.html)。
- [智能体](references/agent-design.html)、[智能体配置台](references/platform-console-design.html)、[远程配置](references/config-design.html)。
- [交易与营销](references/commerce-design.html)、[硬件](references/hardware-design.html)。

先确定角色的主任务和各模块的办理入口。按[入口与内容分层](references/ui-standards.html#entry-ownership)检查首页、导航、「我的」、设置和业务办理页，再按[业务模块与规则归属](references/system-design.html#module-boundaries)核对状态及跨模块交接。

## 硬边界

- 改版保留现有功能集合，建议在界面之外交给用户。真实系统使用实际品牌、范围、登录方式和后端数据。原型演示条件按 [WORKFLOW.md](WORKFLOW.md#视觉与原型)。
- 产品主题与外观开关仅在已批准任务要求时提供。页面组件语义、状态与动作按本技能规则页，视觉和文档样式按 Luz-Design 的[组件复用](../Luz-Design/references/component-reuse.md)和[文件设计](../Luz-Design/references/file-design.html)。
- 联系方式和未获公开授权的第三方素材仅保存在本地。

## 项目与经验

项目的架构阶段交界面功能说明、用 `entrances_check.py` 检查的 `entrances.json`，以及用 `ui_requirements.py` 检查的[动作与业务规则合同](references/handoff.md#动作归属与业务规则)。按 Project 手册登记 `rules` 与 `specialist`，交付文件由 Project 路由。

经验沿用同一个键确认。项目经验用 `--scope project`，维护经验用 `--scope maintenance`，已写入规则页的加 `--codified`。硬件样本用 `hw_experience.py add`。修改技能后用 `context.py check` 与 `validate_skill.py --package-only`。
