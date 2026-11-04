# Luz System workflow

Sessions live in `D:\Codes\skill输出\Luz-System\NNN-名称\`: the single final `NNN-名称.html` at the root and every working file under `raw\`. Rules and templates live in `references\` of the skill, accumulated knowledge in `experience\`. Luz System covers the whole system design — software (architecture, function list, the function design of product interfaces, prototype behaviour) and on-site hardware. Everything visual (look, composition, cards, the appearance of buttons, icons, images, motion, themes, the prototype's appearance) and document layout come from Luz-Design (its `references/ui-ownership.md` draws the line); backend, interfaces, payments, regulations and compliance implementation belong to Luz-Dev.

## 0 Rule card and experience first

Run `py -X utf8 scripts/context.py <kind>` and read the whole rule card before anything else: it carries the user's preferences, matching lessons, the rule text for this kind of task (ui-standards.html by layer, the surface page, the system, function-list and hardware pages; no visual rules, the visual layer is read from Luz-Design's cards), the tools and the checks. `py -X utf8 scripts/context.py list` shows the kinds; a task touching several surfaces reads several cards. Sessions save them to `raw/00-rules/` (`new_session.py` and `add_mode.py`, `--card <kind>` for more). Templates, the prototype skeleton and `hw_build.py` are skeletons; the card decides. Then read `experience/catalog.md` and search it with `scripts/experience.py search`; for hardware, run `scripts/hw_experience.py stats`, `search`, `compat`, `suppliers` and `queries`. Reuse matching functions, interaction flows, components, palettes, type scales, rules, and research lessons; record in BRIEF `## 采用的规则` which rules the session applies and how.

## 每次调用后沉淀

Every call, including short questions and fixes that create no session, searches the experience store at the start and writes or confirms at least one note before finishing; in a session the keys go into BRIEF `## 本次沉淀`. Commands, fields, caps and the privacy rules are in SKILL.md, section 每次调用后沉淀.

## 1 Session and requirement ledger

Capture only facts supplied by the user. Create one numbered session with `scripts/new_session.py`. A system session (`--modes system`, or `system,hardware` when devices are in scope) begins with `raw/BRIEF.md`, `raw/01-system/01-module-intake.html`, an empty `raw/01-system/02-research.md`, the rule cards, the approval ledger and the manifest. In the BRIEF, translate each request into a stable REQ-ID with the verbatim request, exact module, and acceptance signal. Missing scope or ambiguous modules stop the session before research or design.

## 2 Module approval

Send the module intake; the human selects and approves the exact modules.

## 3 Frontend research with LuzCrawl

Reuse fresh experience sources first with `experience.py reuse` (snapshots copied into `raw/`, valid for 180 days), then crawl only what the library does not cover. Research is mandatory before any design writing: run LuzCrawl from `D:\Codes\Luz-Crawl` by its SKILL.md 调用协议 — `doctor` → `begin "<主题>" --new` (returns the folder) → `experience --query` → `--out <folder>` on every command. Cover both how products in the industry choose their core tasks and home-page entries, and the specifications for typography, tables, navigation, and layout of every surface in scope. Research only what users see and do: page structure, navigation, interaction flows, component states, and visual treatment. Require at least 12 unique URLs across 5 registrable domains: at least 3 page-structure, 3 interaction-flow, and 2 component-state sources. Business rules, regulations, payment callbacks, and other backend sources are rejected by the validator as frontend research records; they are not lost: industry practice, platform preconditions and regulations come from the Luz-Crawl preflight (`crawl_preflight.py run … conclude … check`), and its conclusions are written into the requirement analysis and the business logic (system-design.html 需求的写法), never into `02-research.md`.

Product UI work also requires component-library research: with LuzCrawl open the specification and component pages of the libraries registered in Luz-Design `references/visual-design.html` 组件与组件库 (`component-libraries.json`; how to research them: `references/ui-standards.html` 参考组件库) for every component type in scope (tables, filters, forms, dashboards, mini-program lists), record the library and component each main component follows in the system design, and borrow behaviour and defaults, not visual style.

Each research record names the capture it comes from and its HTTP status on the access date, and the capture's `content.json` is copied into `raw/01-system/crawl-snapshots/` (template research.md). Hash-routed documentation pages (`#/route`) count as separate URLs. How LuzCrawl batches, queues and handles rate limits is its own business; site-specific lessons (for example the NN/g limit) are in the experience store.

## 4 Frontend architecture

Create `raw/01-system/03-system-architecture.html` with stable role, function, page, navigation, component, action, flow, state, and page-data IDs. Sections: 范围与角色权限, 模块与功能, 页面与路由, 导航树, 组件与动作, 交互流程与异常, 界面状态, 页面数据, 追溯矩阵, 验收标准. Every approved module has at least one interface state. Write the interaction contract from the template (references/system-design.html 架构的交互字段): every page `data-entry`, `data-goal`, `data-primary-action`, `data-exit`, `data-states`; actions `data-feedback` and, when destructive, `data-confirm` or `data-undo`; entities `data-lifecycle`; states `data-transitions`; flows `data-success`. `validate_session.py` runs `check_interaction.py`: an architecture written to the contract fails on gaps, island pages and duplicate entries. With an agent in scope, add the item 智能体运行时与底座 from the architecture checklist and read the agent-ui and agent-runtime-ui cards. When the agent platform console is in scope (queues and quotas, scheduled tasks, the risk-alert loop back to the agent, rules and config-driven calculation, knowledge bases, workflow canvas, multi-agent teams), also write the matching checklist items (排队与容量, 定时任务, 预警闭环, 规则配置, 知识库, 业务流编排, 智能体协同) and read the cards platform-console, queue-capacity, scheduler-ui, alert-loop, rule-engine-ui, kb-console, workflow-canvas and multi-agent (`--card <kind>` saves them into the session). Each user-required function cites REQ-IDs; each inferred function cites at least two research records and stays unconfirmed until resolved. Stop for human architecture approval.

Keep the architecture and every later page generated from one specification file so IDs never drift.

Reading pages (the module form, architecture, system design, function list page and hardware list, plus the rule pages) set their text hierarchy like a rendered Markdown document, from Luz-Design `references/file-design.html` 网页文件 › 排版参数 (the sizes live only there and in the block below). The block lives in `references/md-type.css` (a copy of the Luz-Design master, kept equal by `D:\Codes\Luz-Design\scripts\sync_md_type.py`); the templates carry it between `luz-md-type` markers and `hw_render_plan.py` reads the file when it renders, so a page does not write its own title or body sizes. Product interfaces (prototype, visual board, UI kits) keep the product type scale instead.

## 5 System design

Create `raw/01-system/04-system-design.html` after architecture approval. Apply the system HTML contract in `references/system-design.html`; design layer by layer with `references/ui-standards.html` (设计架构 → 功能架构 → 信息架构与导航 → 页面内容与优先级 → 组件 → 视觉交接 → 文案) and, for each layer, the same-named layer of every surface the product has (`references/admin-design.html`, `references/miniprogram-design.html`, `references/agent-design.html`, `references/website-design.html`), `references/platform-console-design.html` for the console behind an agent platform, plus `references/function-list-design.html` for the function list and `references/commerce-design.html` (card `commerce`) when the product sells, takes orders, runs promotions or keeps members; retain traceability, and stop for human approval.

## 6 Visual and prototype

The look of the visual board and of the prototype is Luz-Design's work: read its cards (`interface-visual`, `interface-components`, `interface-layout`, `interface-motion`, `interface-icons`), run its `style_match.py` and have the style confirmed. This skill supplies only the approved system design (pages, entrances, tab bars, components, actions) and never adds, removes or moves any of them to suit a look; such a change goes back to the system design. List the Design cards applied in BRIEF `## 采用的规则`. Create `raw/02-visual/visual-board.html` after system-design approval; it shows the interfaces at their real sizes, so it follows the prototype's type rules (Luz-Design's type roles). Stop for human visual approval. Then create `raw/03-prototype/interactive-prototype.html`: every button uses an approved action ID (inside `<dialog>` or `role="dialog"`, the button that submits the action repeats the opening action's ID and is not a second entry; a generic confirm and the cancel, close and done buttons carry `data-control` instead), views use approved page IDs, simulated data covers loading, empty, error, success, and disabled states. Prototypes render real interfaces with one font family and the product type roles of Luz-Design `references/visual-design.html` (七级字体角色; mini-programs use its compact usage), never italic; reading pages use the Markdown type block above, not the product scale. Check every admin page at 1280, 1366, 1440, and 1920 px for content clipped at the right edge. Walk every operation trigger → feedback → result → return; one action has one visible entry per page. An agent session (agent rule cards in `raw/00-rules/`) gets the seven run states in its skeleton (templates.txt agent-run-states.html); keep one `data-state` block per state. Exercise the prototype in a browser with no script errors, save the acceptance screenshot, and approve both hashes.

When the user wants one page with the function list, an operable mini-program, and the admin console, follow “Integrated system design page” in `SKILL.md`.

## 7 Hardware

When the system needs on-site devices, add `--modes hardware` (or create a hardware-only session). Record scale, operation model, existing devices, budget and site facts in `raw/04-hardware/requirements.md`. Follow `references/hardware-design.html`: storyboard the whole lifecycle, map every step to devices, check interfaces against the compatibility library, give every networked device an access mode and protocol, make offline fallbacks explicit, and turn fire, power and network into site requirements. Research models, prices and channels with LuzCrawl (same protocol as above; site lessons in `references/hardware/research-playbook.md`), write `raw/04-hardware/plan.json`, then run `scripts/hw_build.py <session>`, which validates the plan, renders `raw/04-hardware/hardware-plan.html` and runs Luz-Design's document check. Show the list to the person and record their approval of the file (`APPROVALS.json` hardware) before publishing it. The client reads an Excel, not the page: after the plan validates, `scripts/hw_export.py <session>` writes `raw/04-hardware/client/硬件选型清单.xlsx` (sheets 设备清单 and 现场条件) through Luz-Design's table script and its document check; `hardware-plan.html` stays the review and development page. List every device as an integration in the system architecture when software and hardware share the session.

Pages follow Luz-Design's visual standards and its `check_document.py` (`D:\Codes\Luz-Design\scripts`); reports, spreadsheets and Word documents produced alongside a system go to Luz-Design.

## 8 Sediment and publish

Run `experience.py harvest <session> --industry <行业>` and add judged knowledge with `experience.py add <file.json>`: components, design ideas, frontend rules, type-scale facts, research lessons. For hardware, add products, price samples, compatibility, suppliers and query outcomes with `hw_experience.py add experience\hardware\inbox\<file>.json`; personal contacts go only to the local contacts file. Write or confirm notes with `experience.py note` and list their keys in BRIEF `## 本次沉淀`; fill BRIEF `## 采用的规则` from the rule cards.

Then publish the final HTML with `scripts/publish.py <session> <system_design | visual | prototype | hardware>`; nothing else may sit next to `raw/`. Publishing refuses a session without a current rule card in `raw/00-rules/`, with an empty 采用的规则, or with an empty or stale 本次沉淀.

## 9 Validate and deliver

~~~powershell
py -X utf8 -m py_compile scripts/*.py
py -X utf8 scripts/context.py check
py -X utf8 scripts/validate_skill.py
py -X utf8 scripts/experience.py check
py -X utf8 scripts/validate_session.py "<session-folder>" --strict-production
py -X utf8 scripts/check_interaction.py "<session-folder>"
py -X utf8 scripts/hw_experience.py check
py -X utf8 D:\Codes\Luz-Design\scripts\check_document.py "<final html>" --allow interface
py -X utf8 -m unittest discover -s scripts -p "test_*.py"
~~~

Any artifact change invalidates its approval hash and all downstream gates. `publish.py <session> <stage>` refuses a stage whose mode was never declared or whose upstream approvals (module scope, architecture, system design, visual, in that order; for hardware, the hardware list itself) are missing or no longer match their files; a refusal means stop and ask the person, not route around it. A platform demo session (`--approval-mode authorization`) replaces the per-stage stops with one authorization the person signs before generation; every stage is still produced and checked, and each record cites the authorization (SKILL.md, Approvals). A preview, fabricated source list, missing snapshot, unapproved stable ID, broken prototype action, or missing browser acceptance screenshot is not a completed deliverable.


## 客户文件与 Luz-Project 交接

交给客户的只有 PDF 和 Excel，HTML 只给评审、开发和演示（SKILL.md“客户文件与上下游衔接”）。完整项目里，`luz-project` 提供已批准的需求和 Crawl 任务，本技能按阶段做：

1. **proposal**：读规则卡 `client-docs`，把需求写成需求项（可验证、单一、无歧义，见 system-design.html“需求的写法”），再写 `data/client/features.json`——模块、功能、使用端、角色、基础或可选、业务逻辑、工时、标签、验收；方案说明书的需求分析与解决方案内容、系统架构图册的节点与数据流按 system-design.html“方案说明书的内容来源”“架构图的画法”提供。`py -X utf8 scripts/features_check.py <项目>\data\client` 零错误后交 Luz-Project 生成客户的 Excel 与 PDF；工时是估算，须请用户确认。
2. **client-intake**：每个功能的 `rules` 就是“拟定逻辑”：先给方案让客户确认或修改；`intake-extra.json` 只放项目专属的待决规则和只有客户才有的资料，不问每个项目都一样的通用信息。
3. **architecture**：产出三个页签的系统架构 HTML（功能逻辑架构、前端架构、后端架构）及机器可读的编号，登记产物与哈希，停在架构批准。批准后 Luz-Design 只取前端结构与交互要求做视觉决定，Luz-Dev 取架构与随后的设计交接；功能在架构里的落点用 `project.py link FN-001 --arch …` 登记。
4. 客户新增需求、改规则、补细节：先在 Luz-Project 的变更台账登记，再改数据文件；已发布的功能编号不复用，删除用变更把 status 置为 removed。

单独调用本技能不创建项目目录，也不等待下游阶段。
