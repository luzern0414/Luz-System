# Luz System 工作流

入口、顺序和硬边界在 [SKILL.md](SKILL.md)，规则在规则卡和 `references/` 的规范页。本页写各阶段的进入条件、命令、产物和停止条件。

## 商业项目

Project 的 `workflow = commercial-v1` 启用下表。先取本阶段的 context、上游确认版本和原始资料，按矩阵路径交正式文件，制作资料留在状态根。后面的独立会话步骤和既有项目表适用于各自原流程。

| 阶段 | 责任与交付 | 确认 |
|---|---|---|
| scope | System 带着客户材料中的目标、现状、范围与疑问调用 Crawl 真实搜索，阅读原文，完成 conclude、check。与 Writing 整理客户事实、外部参考、假设与排除项。在 `docs/02-对接资料` 交 `01-需求说明.pdf` 和 `02-系统方案.pdf` | 一次确认两份当前版本 |
| design | System 主持，从同批已确认范围拆角色、模块、主路径与异常、权限、数据和验收口径。Dev 负责技术方案与后端，Design 和 Dev 联合说明前端、接口与反馈。在 `docs/03-开发资料` 交 `01-功能说明.html`、`02-技术方案.html`、`03-前端开发说明.html`、`04-后端开发说明.html`，将功能编号、入口和 UI 合同交给 Design | 一次确认四份当前版本 |
| demo | Design 带用户按角色操作 `05-交互原型.html`。System 核对状态、返回路径、异常和恢复。变更沿用原功能编号回到受影响的说明 | 确认当前可运行原型 |
| baseline | 用前三批确认的版本，在 `docs/02-对接资料` 交 `03-架构图.pdf`、`04-功能需求清单.xlsx`、`05-业务规则确认表.xlsx`、`06-项目实施计划表.xlsx`。System 核对功能与规则，Dev 核对实现依赖，Project 管计划与基线 | 按矩阵交给 implementation |

### 按业务选择成熟做法

核对客户已有系统、行业术语、现行流程和本地专项规范。下表用于发现适用问题，有场景、责任人和验收依据的能力才纳入范围。

| 产品或场景 | 有对应任务时核对 | 采用条件 |
|---|---|---|
| 小程序 | 从扫码、分享或已有入口办理业务，查页面栈、身份、授权拒绝、返回与中断恢复 | 涉及支付或订阅时补对应授权、结果回查 |
| App | 目标系统、账户、权限弹窗、前后台切换与弱网恢复 | 相机、定位、推送和离线写入按实际任务与设备验证 |
| ERP | 业务单据、审批、组织权限和跨部门交接 | 涉及过账或财务时确认口径、冲销与对账 |
| WMS | 入库、库位、库存变化和出库，核实计量和操作角色 | 批次、效期、条码或手持终端按仓库实际启用 |
| 智能体 | 任务成功条件、允许的工具和数据、权限、失败及用户接管 | 有写操作核对确认与审计，有知识检索核对来源和访问范围 |
| 运营系统 | 运营对象、活动规则、名单、执行结果与角色 | 有触达、权益或资金时检查同意、去重、撤回和核销 |

跨系统交接记录共同对象、权威数据源、状态和责任。按已有规则卡细化；资料冲突或调研得到的新能力标明待确认。

## 目录

```text
D:\Codes\Luz-System\
  SKILL.md  WORKFLOW.md  README.md
  references\    十一份规范页、cards.json（规则卡）、templates.txt（会话模板）、handoff.md 与 handoff.schema.json、hardware\（硬件知识）
  experience\    notes.json、sources.json、patterns.json、catalog.md；hardware\ 是硬件经验库
  scripts\       规则卡、会话、发布、校验、经验、硬件生成与导出、测试
  examples\      硬件方案示例 unmanned-gym.plan.json

E:\Skill输出\Luz-System\NNN-名称\
  NNN-名称.html                          汇总页，与目录同名
  硬件选型清单.xlsx  <阶段>-source.zip    独立任务的成品，列在汇总页里
  raw\                                   BRIEF.md、00-rules、00-crawl、00-design、01-system、02-visual、03-prototype、04-hardware、99-delivery
```

序号三位，取最大序号加一，不复用；旧的两位序号和下划线名称仍可读取。`py -X utf8 scripts/check_output_layout.py session "<会话>" [--project-linked]` 检查布局；带 `output_layout` 的会话由 `validate_session.py` 一并检查，更早的会话只给提示。

## 模板与生成器

| 产物 | 模板编号 | 绑定位置与生成器 |
|---|---|---|
| 系统架构页、系统设计页 | `system-architecture`、`system-design` | 阶段原稿和汇总页各选一次；从 Luz-Design `templates/documents/reading/` 的同名模板起稿，`publish.py` 核对模板外壳，正文不另写样式或脚本 |
| 硬件方案页 | `hardware-plan` | `raw/04-hardware/hardware-plan.html` 和汇总页各选一次；`hw_build.py` 用 Luz-Design 的 `references/hardware-plan.template.html` 与 `references/md-type.css` 生成 |
| 硬件选型清单 | `xlsx` | 选在 `硬件选型清单.xlsx`（项目任务选在 docs 里的目标文件）；`hw_export.py` 调用 Luz-Design 的 `make_xlsx.py` |
| 完整 UI 包 | 组件复用包 `ui-component-output`；可运行前端包 `frontend-app-task`、`frontend-web-workspace`、`frontend-existing` | 选在 `<阶段>-source.zip`，汇总页另选 `reading-html`；Luz-Design 的 `ui_package.py check` 报出包的类型，`publish.py` 按它核对，未登记的类型拒绝 |
| 只出阅读汇总 | `reading-html` | 建会话时已按 `summary` 阶段为汇总页选好；Luz-Design 的 `make_summary.py` 生成 |

选择保存模板文件、SHA-256 和快照；生成器写完登记最终哈希，交付检查再核一次，只留选择记录不算数。

## 会话与需求台账

只有想法、业务困扰或入口名称时，先运行 `py -X utf8 scripts/context.py business-discovery`。在对话里用真实场景推导候选模块、各角色如何接手、哪些规则待确认。模块和系统名经用户明确后再传给下面的会话命令。首版从一条完整可用的路径开始。正式架构依同一张卡逐页写出内容组的上下顺序、全部功能控件和相关数据与决策。

进入条件：读完规则卡，查过经验（`experience/catalog.md`、`experience.py search`；硬件另跑 `hw_experience.py stats`、`search`、`compat`、`suppliers`、`queries`）。

```powershell
py -X utf8 scripts/new_session.py --name "<名称>" --modes system --system-name "<系统名>" --modules "<模块1>,<模块2>"
py -X utf8 scripts/new_session.py --name "<名称>" --modes system,hardware --system-name "<系统名>" --modules "<模块1>"
py -X utf8 scripts/new_session.py --name "<名称>硬件选型清单" --modes hardware
py -X utf8 scripts/new_session.py --name "<名称>" --modes system --system-name "<系统名>" --modules "<模块1>" --project "<状态根>"
```

系统会话得到 `raw/BRIEF.md`、`raw/01-system/01-module-intake.html`、空的 `02-research.md`、规则卡、`APPROVALS.json` 和 `MANIFEST.json`。模式自带的卡：system 是 `system-design`、`business-discovery`、`interaction`、`remote-config`，hardware 是 `hardware`；其它卡用 `--card <类型>` 补，可重复。BRIEF 只记用户给的事实：每条要求写成稳定的 REQ 编号，带原话、所属模块和验收信号。范围缺失或模块有歧义时停下。文档和海报模式会被拒绝并指向 Luz-Design。

## 模块批准

发出模块表单，用户勾选并批准确切的模块。未批准不进入调研和架构。

## 调研

写设计之前完成，分两类：

- **阶段前置检索**覆盖每个模块的功能逻辑、业务数据结构、布局、交互和流程。按[逐模块设计与经验](references/system-design.html#module-sheet)从模块的具体疑问出发。先查[模块经验](experience/catalog.md#按模块查经验)与当前产品。对外部可核实的问题调用 Luz-Crawl，将“模块、维度、待答问题、原文或快照、采用位置与限制”登记在本阶段依据中。同一来源可服务多项判断。公开做法供比较，交付承诺由业务方确认。
- **正式界面架构的行为参考**针对用户能实际办理的界面。业务前期在对话中推导模块时，依据真实办理、业务资料和所需的事实核对。组件外观及视觉来源归 Design。正式会话的界面参考记在 `raw/01-system/02-research.md`。先 `py -X utf8 scripts/experience.py reuse "<会话>" <来源编号…> --module <模块>` 复用 180 天内的来源，再按 Luz-Crawl 的调用协议补采（`doctor` → `begin "<主题>" --new` → `experience --query` → 每条命令带 `--out`）。这份界面附件记录能实际观察到的页面结构、导航、交互流程和组件状态。至少 12 个网址、5 个可注册域名，其中页面结构 3 条、交互流程 3 条、组件状态 2 条。每条记录写明所依据的归档和访问当日的状态码，归档的 `content.json` 复制到 `raw/01-system/crawl-snapshots/`。功能逻辑、业务字段定义、行业规则和法规的检索结果写入阶段依据，再由所属模块引用。

产品界面还要查组件库：库登记在 Luz-Design 的 `references/component-libraries.json`，查法见 ui-standards.html“参考组件库”。在系统设计里写明每个主要组件依据哪个库的哪个组件，只借行为和默认值。

## 架构

产物 `raw/01-system/03-system-architecture.html`，带稳定的角色、功能、页面、导航、组件、动作、流程、状态和页面数据编号。小节：范围与角色权限、模块与功能、页面与路由、导航树、组件与动作、交互流程与异常、界面状态、页面数据、追溯矩阵、验收标准。

- 每个页面写交互契约：`data-entry`、`data-goal`、`data-primary-action`、`data-exit`、`data-states`；动作写 `data-feedback`，破坏性动作写 `data-confirm` 或 `data-undo`；对象写 `data-lifecycle`，状态写 `data-transitions`，流程写 `data-success`。`py -X utf8 scripts/check_interaction.py "<会话>"` 对缺项、孤岛页面和重复入口报错。
- 用户要求的功能引用 REQ 编号；推断的功能至少引用两条调研记录，确认前保持未确认。
- 有智能体时写“智能体运行时与底座”；有平台配置台时写对应的清单项，并读对应规则卡。
- 有界面时同时交入口表 `entrances.json`：`py -X utf8 scripts/entrances_check.py <entrances.json> [--features features.json]`，格式见 `py -X utf8 scripts/entrances_check.py --schema`。
- 含硬件时把每台设备列为集成。

架构和之后的页面出自同一份规格，编号不漂移。停下等架构批准。

## 系统设计

架构批准后写 `raw/01-system/04-system-design.html`：按 system-design.html 的网页合同，界面逐层按 ui-standards.html 和各端规范页的同名层，保留追溯关系。停下等批准。

## 视觉与原型

外观归 Luz-Design。本技能只提供已批准的页面、入口、标签栏、组件和动作，不为迁就外观增删或移动它们；要改就退回系统设计。

新编功能合同按[页面结构与控件](references/handoff.md#页面结构与控件)写模块数据字典、业务规则、逐页阅读顺序、控件与流程，交视觉前运行 `py -X utf8 scripts/ui_requirements.py <合同> --require-module-details`。加 `--module <模块编号>` 可单看该模块的五项。用 `--entry <入口编号>` 对照各分支实际经过的页面数、逐页承载的内容和回程，已有合同可按原版本复核。结束将本阶段实际采用、纠正或验证的模块经验用 `experience.py note` 写回目录，并在简报注明键与适用范围。

1. `py -X utf8 scripts/add_mode.py "<会话>" visual --card admin-list --card miniprogram`，之后 `add_mode.py "<会话>" prototype`。它检查上游批准、登记阶段并存规则卡：visual 默认存 `admin-list` 和 `miniprogram`，智能体会话用 `--card agent-ui --card agent-runtime-ui`；prototype 存 `prototype` 和 `interaction`。它同时写入的 `02-visual/visual-board.html`、`03-prototype/interactive-prototype.html` 是旧会话的占位骨架，不是成品。
2. 把界面需求写成 `luz-ui-requirements/2` 合同（[动作归属与业务规则](references/handoff.md#动作归属与业务规则)）并检查：`py -X utf8 scripts/ui_requirements.py <文件>`。Luz-Design 在自己的会话里按组件复用合同构建、审阅，并通过 `ui_package.py check`。
3. 发布完整包：`py -X utf8 scripts/publish.py "<会话>" <visual|prototype> --source-session <Design 会话> --source-package <其 raw 内的完整包> --source-entry <登记入口>`，或在 `MANIFEST.json` 的 `source_ui_sources[阶段]` 写同名三项。发布会重新核验，导出保留全部文件的 `<阶段>-source.zip`，生成带下载链接的汇总页；阶段批准绑定这个 ZIP。`publish.py "<会话>" <阶段> --check-ui` 只读重验。单页、内部组件库和手填的审计标签不能代替完整包。

集成页（功能清单、小程序、后台同在一页）：三部分的编号来自架构，小程序与后台共用一套演示数据，页面由 Luz-Design 作为完整 UI 包构建。

旧会话已有的视觉板和原型仍按原合同校验：按钮用已批准的动作编号，视图用已批准的页面编号，演示数据覆盖加载、空、错误、成功、禁用；后台页在 1280、1366、1440、1920 宽度下不被右侧裁切；智能体会话保留七种运行状态各一块。

## 硬件

进入条件：规模、运营模式、已有设备、预算和现场事实记在 `raw/04-hardware/requirements.md`，预算只是选型约束。按 hardware-design.html 梳理完整业务流程，把每一步映射到设备，接口对照兼容库，每台联网设备写接入方式与协议，断网兜底写明，消防、供电、网络写成现场条件。型号、渠道和参考价用 Luz-Crawl 调研：`hw_crawl_digest.py <任务目录>` 整理候选，`hw_fetch_images.py` 补实物图，站点经验见 `references/hardware/research-playbook.md`。方案写进 `raw/04-hardware/plan.json`，字段见 `references/hardware/plan-schema.md`。

```powershell
py -X utf8 scripts/hw_build.py "<会话>"
py -X utf8 scripts/hw_export.py "<会话>"
py -X utf8 scripts/publish.py "<会话>" hardware
```

`hw_build.py` 校验方案、生成 `raw/04-hardware/hardware-plan.html` 并跑 Luz-Design 文档检查。清单由用户批准后，先 `hw_export.py` 导出 `硬件选型清单.xlsx`（设备清单、现场条件两张表），再发布，汇总页才能列出它；项目任务的 Excel 写进 `docs\01-需求对接`。客户清单默认没有任何价格列；用户明确要求预算、`plan.json` 写了 `budget_requested`（谁、何时、原话）才带“参考价”，逐项有来源链接，无价设备写“待询价”且不进合计。

## 审批

`raw/99-delivery/APPROVALS.json` 记录每次批准的状态、产物路径、SHA-256、时间、批准人和备注：模块范围、架构、系统设计、视觉、原型（附浏览器验收截图），有硬件时加硬件清单。产物一改，它的批准和下游门禁都失效。`add_mode.py` 和 `publish.py` 检查模式和全部上游批准，顺序是模块范围、架构、系统设计、视觉；硬件只看硬件清单自己的批准。用户可以一次审阅多个阶段，但每个阶段单独批准。预览、编造的来源、缺快照、未批准的编号、坏掉的原型动作、缺浏览器验收截图，都不算完成。

**平台演示的一次授权**（`new_session.py --approval-mode authorization`）只限软件演示会话，不含硬件，Luz-Dev 不接收这类会话。

- 用户确认背景并点击生成时，平台把背景存成独立文件，在 `APPROVALS.json` 的 `authorizations` 追加一条：`id`（如 `AUTH-001`）、`authorized_by`、`authorized_at`、`scope`、`statement`、`context_path`、`context_sha256`。`scope` 取 `module_scope`、`architecture`、`system_design`、`visual`、`prototype`。
- 每个阶段过检查后，平台照常写该阶段记录：`status` 为 `approved`，`approval_basis` 为 `authorization`，带 `authorization_id`，`approved_by` 是签署人。
- 校验只在这些条件都满足时接受：会话是授权模式，阶段在授权范围内，签署人是真人，记录晚于签署，背景文件与哈希一致，引用的是当时有效的授权。
- 失败的执行可在同一授权下恢复。背景变了或要重做阶段，就重新授权（`AUTH-002`，用自己的背景文件），此后的记录引用新授权。

## 沉淀与发布

- 软件：`py -X utf8 scripts/experience.py harvest "<会话>" --industry <行业>` 收割已交付会话，`experience.py add <文件.json>` 加入判断过的模式和来源。
- 硬件：`py -X utf8 scripts/hw_experience.py add experience\hardware\inbox\<文件>.json` 合并产品、价格样本、接口匹配、渠道和查询效果。产品按品牌和型号合并，每款留最近 5 条价格样本；个人联系方式只写 `experience/hardware/contacts.local.json`。
- 偏好、教训、事实用 `experience.py note`（SKILL.md“沉淀”），键写进 BRIEF“本次沉淀”；没有会话时在回复里说明写了哪些键。`list [--kind]` 列出，`prune` 执行上限并列出 180 天未确认的，`check` 查重复、缺字段、超限和隐私数据。
- 代表客户调用本技能的程序（如生成演示的平台）直接写通用经验，不需人工逐条确认：先搜索并确认已有键，不新建重复键，不记客户背景。
- BRIEF“采用的规则”逐条写规则小节或偏好键，以及本次怎么落实。
- `py -X utf8 scripts/publish.py "<会话>" <阶段>` 把阶段页发布成汇总页，并列出旁边的成品。缺当前规则卡、“采用的规则”为空、“本次沉淀”为空或键过期（不在 `notes.json`，或最后确认早于会话创建）、缺上游批准或本阶段检索，都会被拒绝。项目任务不发布：它报错并给出该阶段的 `project.py document` 命令。
- 页面图标：模板按系统名填 `{{TAB_ICON}}` 和 `{{BRAND_MARK}}`，手写页面用 `py -X utf8 scripts/new_session.py icon "<系统名>"` 取得；最终页缺图标会被拒绝。
- `LUZ_EXPERIENCE_STORE=<notes.json 路径>` 只用于测试和演练，把经验的读写都指向那个文件；真实交付不设置。

## 校验

```powershell
py -X utf8 scripts/validate_session.py "<会话>" --strict-production
py -X utf8 scripts/check_interaction.py "<会话>"
py -X utf8 scripts/check_output_layout.py session "<会话>" [--project-linked]
py -X utf8 scripts/features_check.py "<状态根>\data\client"
py -X utf8 D:\Codes\Luz-Design\scripts\check_document.py "<交付文件>" --allow interface
```

`validate_session.py` 会对架构和旧会话的原型运行 `check_interaction.py`；`--strict-production` 另外核对调研来源仍可访问，并要求交付记录完整。阅读页的文档检查不加 `--allow interface`。列表默认每页 20 行，缺分页器或默认行数不符时 `validate_session.py` 给出警告。技能包自身的检查命令见 SKILL.md“校验”；`validate_skill.py` 先打印 `PACKAGE PASS` 或 `PACKAGE FAIL`，不带 `--package-only` 时再列输出目录里各会话的问题。

## 既有逐文件项目任务

入口是 SKILL.md“项目模式”，路径照 Luz-Project 的 [runbook.md](../Luz-Project/references/runbook.md)。各阶段本技能做什么：

| 阶段 | 做什么 | 先读的卡 |
|---|---|---|
| proposal | 把需求写成可验证的需求项，写 `data/client/features.json`（模块、功能、使用端、角色、基础或可选、业务逻辑、标签、验收），给方案说明书和架构图册提供内容；`features_check.py` 零错误后交 Luz-Project 生成 | `client-docs`、`function-list` |
| client-intake | 每个功能的 `rules` 写成可确认的拟定逻辑；`intake-extra.json` 只放项目专属的待决问题和只有客户才有的资料 | `function-list` |
| architecture | 交 `01-系统架构.html` 的事实数据（技术栈、总体架构、功能与技术方案、决策与质量四个页签，每个功能一张功能卡）；有界面的项目同时交界面功能说明、入口表和 UI 需求合同，按 Luz-Project [dev-documents.md](../Luz-Project/references/dev-documents.md)“随附产物”登记；`project.py link` 登记每个功能的落点 | `system-design` |

- 人日和报价：项目在 `config/documents.json` 打开 `estimate.workdays`、`estimate.quote`（带要求人、日期、原话）才写。人日写 `hours` 和 `hours_basis`，用户批准前标“拟定”；报价数字只来自人工报价单 `quote.json`，缺了就把“等待人工报价”列为用户待办并停下。
- 功能编号 `FN-001…` 发布后不复用；新增、改规则、删除先在 Luz-Project 的变更台账登记，再改数据文件。
- 交接：架构、系统设计和原型的编号与交互契约进 `HANDOFF.json`（[handoff.md](references/handoff.md)）给 Luz-Dev；每个功能的 `acceptance` 和 `tags` 给 Luz-Ops 映射测试证据；界面功能说明和入口表给 Luz-Design。
- 待审的永远只有 `project.py next` 指定的那一个文件；不自己判定“用户已批准”，修改意见走 `project.py review`。design 阶段的原型由 Luz-Design 交付，本技能只提供行为和数据规则。
