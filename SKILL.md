---
name: luz-system
description: 从模糊需求推导 Luz 系统的业务模块、角色、规则和闭环。定义各端每页自上而下的模块、入口、标签、按钮、卡片、字段、文案和图片用途，设计功能清单、原型行为或现场硬件。先用 scripts/context.py 读任务规则卡。界面视觉归 Luz-Design，后端实现归 Luz-Dev。
---

# Luz 系统

把需求写成可检查的业务模块、功能入口、角色权限、动作和状态。按[交接分工](../Luz-Design/references/ui-ownership.md)把界面功能合同交给 Luz-Design，把已批准的业务规则交给 Luz-Dev。

用户只有一个想法时，先读 `context.py business-discovery`，从一件事的开始、办理、结果与恢复推导候选模块。做界面功能设计时，同读这张卡，按[页面模块与控件](references/system-design.html#page-structure)逐页确定内容、动作、主次与上下顺序。在业务方确认范围后进入正式会话。可运行[预约改期合同示例](examples/booking-change.ui.json)，参考[功能清单设计](references/function-list-design.html)。

## 调用协议

商业系统按岗位列出模块与控件。每项功能记录入口、查询维度、业务对象、可执行动作、生效条件、关联记录和验证结果。第二批确认前确定原型操作范围，以及依赖实物或外部服务的验收条件。仓储系统中的商品、库存、收货上架、拣货发运各有独立入口，单据与库存流水通过单号关联。

商业项目先读 `project.py next` 与 `project.py context <项目> <阶段> --skill luz-system`。System 主持范围和设计两批，详见[商业项目](WORKFLOW.md#商业项目)。独立设计由本会话审批，既有项目沿用创建时的矩阵。

每个用户入口按[从入口推到实际页面](references/system-design.html#entry-pages)交可走查路径。各页只承担一个主要职责，同一端与角色中的同一业务动作有一个正式办理位置。一级标签的办理、结果与返回在本栈完成，用户通过一级导航主动切换，其他角色从自己的待办接手。运行 `ui_requirements.py <合同> --entry <入口编号>` 可展开页面、内容与标签归属。

商业系统先核对[成熟系统与界面取证](references/system-design.html#research-evidence)，再完成角色和功能、[架构视图与部署](references/system-design.html#architecture-views)、[业务逻辑与结果](references/system-design.html#business-logic)。功能编号连接入口、规则、接口、状态、数据与验收结果。仓储的完整示例与检查表见[系统设计规范](references/handbooks/系统设计规范.pdf)。

按[逐模块设计与经验](references/system-design.html#module-sheet)写清每个模块的功能逻辑、业务数据结构、页面布局顺序、交互和完整流程。开始时查[模块经验](experience/catalog.md#按模块查经验)，用 `experience.py search <模块名> <问题>` 找可复用的判断。五项均可按具体缺口调用 Luz-Crawl，结论回到相应模块。结束用 `experience.py note` 更新同一份经验 Markdown，记录依据、适用范围和下次怎样复核。

按 [WORKFLOW.md](WORKFLOW.md) 执行。项目任务接入[项目流程](../Luz-Project/references/skill-architecture.md)，需要的阶段质量规则用 `quality_rules.py list --owner luz-system --stage <阶段>` 选取。

1. `py -X utf8 scripts/context.py list` 选类型，`scripts/context.py <类型> [<类型> …]` 读所选规则卡。按手册用 `new_session.py` 建独立会话，有显式项目上下文时传 `--project <状态根>`。
2. 按[阶段依据](../Luz-Crawl/references/evidence-policy.md)和[调用方法](../Luz-Crawl/references/preflight.md)运行 `crawl_preflight.py run --caller luz-system`。本地依据登记后 `check`。联网依据读正文、`conclude` 后 `check`。
3. 按手册为该阶段和准确产出路径绑定 Design 模板。使用对应生成器登记哈希，运行 `validate_session.py --strict-production` 与 Design 的 `check_document.py`，再实看桌面与 390 px 手机。硬件清单另用 `hw_build.py`。
4. 独立会话按[审批](WORKFLOW.md#审批)逐个确认模块范围、架构、系统设计、视觉、原型和硬件清单。独立会话批准绑定文件哈希。平台销售演示可按手册在生成前取得单次授权，各阶段照常产出和复核。
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

商业项目的 design 阶段及既有项目的架构阶段交界面功能说明、用 `entrances_check.py` 检查的 `entrances.json`，以及用 `ui_requirements.py` 检查的[动作与业务规则合同](references/handoff.md#动作归属与业务规则)。按 Project 手册登记 `rules` 与 `specialist`，交付文件由 Project 路由。

经验沿用同一个键确认。项目经验用 `--scope project`，维护经验用 `--scope maintenance`，已写入规则页的加 `--codified`。硬件样本用 `hw_experience.py add`。修改技能后用 `context.py check` 与 `validate_skill.py --package-only`。

界面合同登记动作所属页面、受控内容、结果容器和返回位置。导航、选择器及填写页服从 [Design 成品要求](../Luz-Design/references/design/hard-rules.md)，颜色与具体组件由 Design 决定。
