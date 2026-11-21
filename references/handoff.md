# Design handoff

`HANDOFF.json` is optional. Create it only when the design will be implemented by another team or skill (normally Luz-Dev).

It must contain stable references to:

- pages by `P-*`, functions by `F-*` (in a Luz-Project the function is the project's `FN-001…` from `data/client/features.json`, never renumbered), navigation by `N-*`, components by `C-*` and actions by `A-*`;
- user and recovery journeys by `FL-*` and interface states by `S-*`;
- the interaction contract written in the architecture (system-design.html 架构的交互字段): page entry, goal, primary action, exit and five states; action feedback, confirmation and undo; entity lifecycles; state transitions; flow success ends — the implementation keeps every operation's entry → feedback → result → return;
- for agents, the run event table, the seven run states, the error copy table and the per-run caps from agent-design.html (运行状态, 运行时与可靠性); Luz-Dev implements them as described in its `references/agent-foundation.md` (SSE with `Last-Event-ID` resume, heartbeat, queue and concurrency limits, idempotency keys, retries and circuit breakers, checkpoints, cancel and rollback) and may not replace streaming with polling or whole responses;
- the functions of every screen, as stated in the system design: which columns a list has, the component list of each page, which functions stay at each narrow width, the action table (IDs, copy, enable and disable conditions, results, confirmation, undo, permissions);
- visual references, generated assets, and rights evidence by stable IDs; every visual value (colour, type, radius, shadow, icon shapes, spacing, grid, breakpoints, motion) reaches the implementation through the design token file of Luz-Design (`scripts/export_tokens.py`), never through this handoff;
- for the agent platform console (platform-console-design.html), the optional `platform` object: enabled `capabilities`, the `configBoundary` (what stays in the config file and is read-only in the console, what is edited in the console), and index entries `queuePolicies`, `schedules`, `alertPolicies`, `ruleSets`, `workflows`, `knowledgeBases`, `agentTeams` and `events`, each with a stable ID (`QP-`, `SCH-`, `ALP-`, `RS-`, `WF-`, `KB-`, `TM-`), status, version and a `definitionPath` to the full definition file under `99-delivery` (workflow graph JSON, rule set JSON, alert resume payload schema); the object is optional and every older handoff stays valid;
- content constraints and unresolved assumptions;
- known API or platform intentions without inventing backend behavior;
- the entrance table `entrances.json` for Luz-Design, next to the function list: one row per front-end function (`fn`, `name`, `type`, `category`, `entry`, `destination`, `freq`; format in `scripts/entrances_check.py --schema`), checked with `scripts/entrances_check.py` before the architecture is submitted for approval; Luz-Design lays the home page out from it and adds or removes no entrance;
- editable source files, actual exports, and verification evidence recorded in `99-delivery/MANIFEST.json`.

### 页面结构与控件

新编系统的 `luz-ui-requirements/2` 合同声明顶层 `page_structure_version: 2`。运行 `scripts/ui_requirements.py <合同> --require-module-details`，Design 读取带标记的合同执行同一校验。原先的第 1 版页面结构及旧合同仍能用原命令读取。

| 位置 | 写什么 |
|---|---|
| 顶层 `modules[]` | 每个业务模块有 `id, name, owner, object, outcome`，说明谁负责哪种对象、产出什么。每个功能用 `features[].module_id` 归属一次。跨模块只引用对方的业务事实。 |
| `modules[].data_objects[]` | 每个对象用合同内唯一的 `id`、业务名称 `name`、唯一标识字段名 `identity`、读写权限 `access` 和 `fields[]` 定义。逐字段写 `name, type, source, rule`。规则按需交代必填、缺失、值域、单位及更新时机，引用合同内对象用 `reference` 指向其编号，关系数量写入字段规则。只读外部信息或无业务数据的模块可列空数组，在 `data_note` 说明来源或原因。 |
| `journeys[].module_ids` | 列出实际参与流程的模块，包含各动作的所属模块。只读模块也可以参与。纯后台模块可在 `internal_flow` 写触发、输入、业务结果和失败处理，在 `non_ui_features` 留下没有页面的原因。 |
| `entries[]` 与 `pages[].title` | 每个入口写 `id, label, source, context, page_id, return_to`（编号、名称、来源、带入的对象或筛选、落地页、回程）。合同内跳转按钮作为入口时用 `source_action_id` 绑定真实动作。每页有可理解的名称 `title`。 |
| 带一级标签的页面 | 同端、同角色工作区内共用一个 `entry_scope`。所有标签及其子页用 `tab_root_id` 指向所属一级页，一级页指向自身。为每个根登记独立入口，`source` 写一级导航，省略 `source_action_id`。用户主动切换标签属于导航操作，办理按钮与事件保留在当前栈。 |
| 同一路由内的不同屏 | 向导或原生应用的两个屏幕可以共用同一 `route`。若各有独立任务、内容与回退，在各页给不同的 `view_key`，沿用各自的页面编号。同页筛选、错误或短确认用所在页的状态表达。 |
| `entries[].paths[]` | 每条分支有 `when, steps, result`。第一屏来自入口的 `page_id`。只阅读可用空步骤。每步写目标 `page_id` 和其一：本页按钮 `action_id`、`back: true` 或触发自动变化的 `event`。留在同页仍可记录错误或反馈；成功回已有页用 `history: "return"`，替换当前页用 `"replace"`，通常进入新页用默认 `"push"`。另一角色用独立入口，由业务流程衔接。 |
| `pages[].sections[]` | 按阅读顺序排列。每组有页内唯一的 `id`、说明这组用途的 `goal` 与有序的 `component_ids`。本页全部功能控件各归一组，组内第一个对象未必最重要。用 `pages[].focus` 说明该角色第一眼要认出的事实或动作。 |
| `components[]` | 每项有 `kind, label, interaction`，如按钮 button、链接 link、标签 tab、卡片 card、字段 input、选项 choice、文字 text、图片 image。按需要扩展 kind。用原有的 `purpose, behavior, data_contract, acceptance` 说明含义、数据来源、条件与验收。装饰样式由 Design 独立处理。相同行项或选项集合用可重复模板表达。 |
| `interaction` | `display` 是展示，`input` 是采集或选择，`action` 是带人去一个地方或触发办理。输入写 `required_when, validation`，选择再写 `options`（枚举或来源、选择数量、默认值、失效规则）。输入型控件可绑定即时动作。可操作控件在每个使用它的页面绑定本页的动作；纯展示项没有自己的动作。 |
| `actions[]` 与 `journeys[]` | 写执行者、前提、成功结果、失败、恢复与跨页目的地。以 `operation_id` 标识实际执行的业务写操作。同一端及角色只声明一次，行级控件用一个模板。流程在同一端及角色中使用一个标签栈。跨角色按可查的业务记录衔接，分别写各自的入口、结果和恢复。 |

本例中，预约详情先显示生效时间和办理状态，再给出“申请改期”入口。选时页按日期展示档期，提交后回原详情看结果。纯阅读公告可以只有一个只读组。页数、组数、卡片数、列数和标签数量随任务而定。运行 `py -X utf8 scripts/ui_requirements.py examples/booking-change.ui.json --module M-requests` 查看改期受理的功能、字段、页面内容组、控件、动作与跨人流程。模块视图直接读取同一合同。

例如收货一级页 `P-receipts` 的 `tab_root_id` 是自身，收货详情、扫码确认和结果都引用它。库存有自己的 `P-stock`。收货时查某条库存资料用本栈的只读详情或选择器，带着对象回当前步骤。校验会核对已声明的根、动作、路径、各角色旅程与重复操作标识。既有合同可继续按原字段读取，实际的控件、返回及恢复需用当前成品走查。

### 动作归属与业务规则

核对实际走法用 `py -X utf8 scripts/ui_requirements.py examples/booking-change.ui.json --entry E-customer-record`。结果按分支列经过的页面和不同页数，并按页给出真实的内容组、控件、首要信息和回程。`E-store-queue` 只统计门店一侧。来源列表在示例范围外，点击后的落地页是本次的第一页。

按[入口与内容分层](ui-standards.html#entry-ownership)归组。新建 `luz-ui-requirements/2` 合同用 `action_groups` 记录组编号 `id`、主入口页 `owner_page_id` 和归属功能 `feature_ids`。同端、同角色上下文的同一功能只归一组。独立的端或角色工作区在页面写 `entry_scope`，单一上下文可省略。一个设置页可承载多组。

每个动作的 `feature_id` 标识它执行或打开的功能。执行动作位于主入口页或由 `parent_page_id` 连到它的子页面。组外快捷入口的 `target_page_id` 指向主入口，组内可以继续导航到子页面。规则变更在所属功能的已确认规则处更新，引用其他功能规则时用 `rule_refs` 写其稳定功能编号。独立合同由 `features[].basis.ref` 指向规则原文。校验器核对归属、页面关系和引用，业务审阅核对两个编号是否实际描述同一操作。已有 `/1` 合同可按原版本复核。

The approved editable source remains authoritative for UX intent: `01-system/04-system-design.html` (architecture: `01-system/03-system-architecture.html`), the complete UI package published for the visual and prototype stages (`<stage>-source.zip` beside the summary page, built in the linked Luz-Design session; sessions made before that keep `02-visual/visual-board.html` and `03-prototype/interactive-prototype.html`), and for devices `04-hardware/plan.json`. Implementation may add technical detail, but it must return to Luz System before changing a user-visible flow, permission rule, source claim, or hierarchy.

`handoff.schema.json` here is the master: Luz System produces the handoff and owns its schema. `Luz-Dev/contracts/handoff.schema.json` mirrors it and the two files are the same (Luz-Dev's `validate_skill_package.py` and its tests compare them). Change the schema here, then copy the file to Luz-Dev. Validate a handoff with Luz Dev `scripts/validate_handoff.py`.

Also hand over, in the files the client documents come from: `data/client/features.json` (functions, business logic, `acceptance`, `tags`, and hours only when explicitly requested) so Luz-Ops can map every acceptance item to test evidence; the client never receives HANDOFF.json or any HTML page, only the PDF and Excel Luz-Project builds from the data files.
