---
name: luz-system
description: Use when designing a complete product system, software and hardware together — requirements and module scope, LuzCrawl research, system architecture, the function list, the functional design of product interfaces (pages, entrances, tab bars, components, button actions, flows, states) for admin consoles, mini-programs, agent UIs, platform consoles and websites with closed-loop interaction checks, the behaviour and data of interactive prototypes, and on-site hardware selection (devices, interfaces, protocols, models, prices, site requirements), with hash-bound human approvals and experience libraries. Everything visual (look, composition, cards, buttons' appearance, icons, images, motion, themes, prototype appearance), posters and document layout belong to Luz-Design; backend to Luz-Dev. Start every call with scripts/context.py <kind> — its rule card carries the user's preferences, lessons, rule text, tools and checks; templates and builders are skeletons only.
---

# Luz System

Luz System turns a scoped request into an auditable system design: what the system does, how users move through it, what every screen contains and does (pages, entrances, tab bars, components, button actions, states), and which devices on site carry each step. How it looks is Luz-Design's. One session can hold the software design, the hardware design, or both.

## 调用协议（每次调用都按顺序做，不可跳过）

**先判定模式与检索。** 若提供显式 project context / `LUZ_PROJECT_ROOT`（指项目状态根），先读取 `project.py context <project> <stage> --skill luz-system`，建会话时加 `--project`（默认取 `LUZ_PROJECT_ROOT`）：源文件、过程文件和审批记录在会话的 `raw\`，成果只写进项目目录的 `docs\`，项目不保存任何原始文件（见下面的 Layout）。没有项目上下文就是独立任务，不创建完整项目目录。

**项目模式下的原型。** design 阶段的可交互原型（每个系统、设备端一个单文件，各占设计文档一页签、只放原型，路径写进“前端规范”；`03-手机原型.html`、`04-后台原型.html`）的行为、数据与场景遵守本技能的 `prototype`、`interaction-patterns`、`nav-levels` 规则卡（外观、组件库与动效由 Luz-Design 规定，项目模式下原型随前端界面设计阶段由 Luz-Design 交付）：场景配置面板按端的一级导航分类、场景逐一列出、全局含网络、外观（跟随系统 / 浅色 / 深色）、减少动态、角色、重置演示数据；手机宽度可完整操作，浅色与深色两种外观下每页都能打开（`audit_rendered.py --scheme dark`）；`project.py document` 读构建出的文件，缺减少动态效果分支、对话框角色或配置面板就不放行。**原型的控件一律来自所选组件库的真实组件**（Luz-Design 规则卡 `interface-components`，库登记在 `Luz-Design/references/component-libraries.json`）：每个前端先选一个库，写进前端架构；不手写 HTML/CSS 自造控件，不由模型直接写整页代码；`prototype` 块写 `library`，构建后用 `audit_rendered.py --library <编号>` 逐页核对。**文本框的聚焦样式、焦点轮廓与点按高亮不在本技能规定**，按 Luz-Design 的规则卡 `interface-visual`、`interface-components` 执行，`audit_rendered.py` 报“聚焦框”算不通过（键盘可达与焦点不被遮挡见 `ui-standards.html` 五、组件 › 无障碍底线）。页面清单、令牌与六种布局可参考 `examples/base-prototype-next/`（用 Element Plus 与 Vant 的真实组件构建：后台 17 页、小程序 25 页）；它只是参考，按本次内容推导页面，不整套复制。

**项目模式下的架构文档。** architecture 阶段交给开发看的文档是 `docs/02-产品开发/01-系统架构.html`，章节、必须有的图和表、事实来源与检查见 [dev-documents.md](../Luz-Project/references/dev-documents.md)（上下文图、部署图、时序图、模块表、技术栈、架构决策、质量属性、已知限制）；`project.py document` 校验它，所在阶段没有完成 Luz-Crawl 前置检索就写不出来。

每次业务调用都按 [前置检索协议](../Luz-Crawl/references/preflight.md) 在方案/正式实现之前执行 `crawl_preflight.py run --caller luz-system --session <本技能会话或项目根> --topic <任务>`，已有任务加 `--task <任务目录>`，项目加 `--stage <阶段>`；阅读正文后 `conclude --file <补充信息.json>`，再 `check`。补充信息写回所属方案，结论交付 HTML；短任务也保留编号会话与检索结论 HTML。仅 doctor、空结果、手填 URL 或只读经验不算检索完成。本要求覆盖下面旧的条件式调研或无会话例外；不会为每条内部脚本命令重新建立任务。

Templates, the prototype skeleton and the hardware builder are the cheap path, and following them alone is how outputs miss the rules. They are skeletons, not rules. What a system, a screen or a hardware list must contain comes from the rule pages, the user's preferences and past lessons, and the rule card puts all of that in front of you.

1. **Route.** Everything visual (look, composition, cards, the appearance of buttons, icons, images, motion, themes, the prototype's appearance), posters and document layout go to Luz-Design; backend to Luz-Dev; prose to Luz-Writing; web research to Luz-Crawl (table below).
2. **Read the rule card before producing anything.** `py -X utf8 scripts/context.py list` shows the task kinds (system-design, client-docs, function-list, interaction, remote-config, admin-list, admin-dashboard, admin-form, miniprogram, commerce, agent-ui, agent-runtime-ui, agent-composer, platform-console, queue-capacity, workflow-canvas, rule-engine-ui, scheduler-ui, alert-loop, kb-console, multi-agent, website, prototype, interaction-patterns, nav-levels, hardware). `py -X utf8 scripts/context.py <kind> [--topic 词 …]` prints the card: the user's preferences (all binding), matching lessons and facts, the rule text cut from the rule pages (ui-standards.html by layer, the surface page, the system, function-list and hardware pages; no visual rules), the tools to use and the checks to pass. Read all of it; one task often needs several cards (a console with lists and a dashboard reads admin-list and admin-dashboard). Cards that share a rule-page section each print it; read a repeated section once. The visual layer of any interface (palette and theme, type, composition, the look of cards and buttons, icons, images, motion) is not decided here: read Luz-Design's cards (`interface-visual`, `interface-components`, `interface-layout`, `interface-pattern`, `interface-motion`, `interface-icons`) with `py -X utf8 D:\Codes\Luz-Design\scripts\context.py <kind>`. For anything a card does not settle, read the named rule-page section in full.
3. **Produce with the tools the card names.** Where a template, the prototype skeleton or `hw_build.py` differs from the card, follow the card. Sessions get their cards automatically in `raw/00-rules/<kind>.md`: `new_session.py` saves the mode's card (system → system-design, interaction and remote-config, hardware → hardware), `add_mode.py` the stage's (visual → the surface cards named with `--card`, by default admin-list and miniprogram, agent sessions `--card agent-ui --card agent-runtime-ui`; prototype → prototype and interaction), and `--card <kind>` (repeatable) adds more on either. In the `visual` and `prototype` stages this skill supplies only the approved pages, entrances, tab bars, components and actions; the look comes from Luz-Design's cards and tools (`style_match.py`, theme tokens, the component library), and BRIEF `## 采用的规则` lists the Design cards applied.
4. **Record what you applied.** In the session BRIEF, `## 采用的规则` lists one row per rule section (规范页 › 小节) or preference key and how this work applies it. `publish.py` refuses a session without a current card or with an empty table, and validation flags a published session without it. Without a session, name the cards you followed in the reply.
5. **Pass the checks on the card.** `validate_session.py` (with `--strict-production` before delivery; it runs `check_interaction.py` on the architecture and prototype), Luz-Design's `check_document.py` (interfaces with `--allow interface`), the browser at desktop and 390 px, and for hardware `hw_build.py`, which validates the plan and runs the document check.
6. **Stop at every approval.** Module scope, architecture, system design, visual board and prototype are each approved by the person, in that order, on the file as it is (hash-bound, `APPROVALS.json`); a hardware list is approved the same way before it is published. At each one, show the artifact, ask, and wait. When a script refuses for a missing approval, that is the answer: never write an approval yourself, never skip a stage (a prototype needs the system design and the visual board before it), never declare a mode by editing the manifest, and never publish around the gate — `add_mode.py` and `publish.py` both check the mode and every upstream approval. A user in a hurry can review several stages in one sitting, but each still gets its own approval. One exception, decided by the user on 2026-10-29: a demo that a platform generates for sales runs in `--approval-mode authorization` — the person confirms the background and signs one authorization before generation, every stage is still produced and checked in order, and the platform records each stage under that authorization (section Approvals below).
7. **Sediment (mandatory; publish checks it).** Every call writes or confirms at least one note with `experience.py note` and lists its key in BRIEF `## 本次沉淀`; `publish.py` refuses keys missing from `experience/notes.json` or last confirmed before the session was created (section 每次调用后沉淀).

## 职责边界：功能归本技能，视觉归 Luz-Design

完整对照表、交接物和容易划错的几处见 [ui-ownership.md](../Luz-Design/references/ui-ownership.md)，两个技能的规则冲突时以它为准。

| 本技能决定（功能） | 交给 Luz-Design（视觉） |
|---|---|
| 页面与路由、每个功能的类别（核心、信息、营销、辅助）与唯一入口归属、标签栏几项与名称顺序、侧栏菜单层级 | 首页的布局范式、模块划分与精简去重，入口怎么排，标签栏与导航的样子 |
| 用哪些组件承担哪个任务；组件的行为、状态、键盘操作与可访问名称 | 组件库与主题；组件的外观、尺寸、圆角、颜色 |
| 按钮：哪个动作、文案、可用与禁用条件、结果与反馈、确认与撤销、权限、这页的主动作 | 按钮的层级样式、尺寸、图标图形，悬停、按下、禁用的外观 |
| 卡片承载什么内容、点了去哪、有哪些操作 | 卡片的构图、层次、圆角、阴影 |
| 哪些对象要有图或图标，图缺失时怎么降级 | 图的风格与内容、图标集、插画、配图 |
| 哪个操作要有反馈、变化不许让周围内容跳位、撤销时限、减少动态效果下保留什么 | 动画的形态、时长、缓动 |
| 窄屏上保留哪些功能，手机上必须能完整操作 | 断点、栅格、各档怎么排 |
| 有没有外观设置、放在哪一页 | 浅色与深色两套取值 |

本技能的规则与文档里不写颜色、字号、圆角、阴影、描边、图标图形、配图内容、栅格与间距、动画时长和缓动；需要时写“见视觉设计规范某节”。Luz-Design 不增删页面、入口、标签栏项数、组件、按钮与流程，发现需要改动时退回本技能。

功能类型的默认入口位置见 [ui-standards.html](references/ui-standards.html) 二、功能架构 › 入口与内容分层（功能类型的默认入口位置）。每个功能带类别（核心、信息、营销、辅助）和唯一入口归属，这是交给 Luz-Design 设计首页的输入：首页怎么排、分成哪些模块由它决定，但只能在入口归属允许出现在首页的功能里选。

架构阶段交付功能说明时，同时交一份入口表 `entrances.json`：每个前台功能一行，写 `fn`、`name`、`type`、`category`、`entry`（tab、home、mine、context、in-page 五选一）、`destination`、`freq`；格式以 Luz-Design 的 `py -X utf8 D:\Codes\Luz-Design\scripts\page_pattern.py show entrances_schema` 为准。交出前用 `py -X utf8 scripts/entrances_check.py <entrances.json> [--features features.json]` 检查（找不到视觉技能的校验器时只提示，不阻塞）。

## Not this skill — route instead

| Request | Use |
|---|---|
| Colours, type, icons, spacing, composition, the appearance of cards and buttons, images, motion and themes of any interface or prototype; posters, brand key visuals, campaign images, Imagegen; layout of reports, reading HTML, Excel, Word (contracts, proposals, reports, minutes), PowerPoint, PDF | **Luz-Design** (`D:\Codes\Luz-Design`) |
| Backend services, APIs, databases, business logic, payments, deployment, qualifications, launch | **Luz-Dev** (`D:\Codes\Luz-Dev`) |
| Articles, copy, agreements, privacy policies and other prose | **Luz-Writing** (`D:\Codes\Luz-Writing`) |
| Browser search and capture | **Luz-Crawl** (`D:\Codes\Luz-Crawl`), called from here for research |

`new_session.py` and `add_mode.py` refuse document and poster modes and name Luz-Design.

## Layout

```text
D:\Codes\Luz-System\                   the skill (rules, templates, knowledge, scripts)
  SKILL.md   WORKFLOW.md   README.md   LICENSE   NOTICE
  agents\openai.yaml
  references\
    ui-standards.html                  界面通用规范: seven layers — 设计架构 → 功能架构 → 信息架构与导航 → 页面内容与优先级 → 组件 → 视觉交接 (hand-over to Luz-Design, no visual values) → 文案
    admin-design.html                  网页管理后台设计规范 (same seven layers, admin specifics)
    miniprogram-design.html            小程序设计规范
    agent-design.html                  智能体设计规范
    website-design.html                网站设计规范
    function-list-design.html          系统功能列表规范
    commerce-design.html               交易与营销界面规范
    config-design.html                 远程配置规范
    platform-console-design.html       智能体平台配置台设计规范 (queues and capacity, scheduler, alert loop, rule engine and computation, multi-agent, knowledge base, workflow canvas)
    system-design.html                 系统设计规范 (gates, architecture and system-design HTML, prototype panel, phone operability)
    hardware-design.html               硬件设计规范 (business flow → devices → interfaces → protocols → backend; site requirements; list layout)
    hardware\                          hardware knowledge: device categories, protocols, scenarios, research playbook, plan schema
    cards.json                         rule cards: per task kind, the rule-page sections, tools and checks (scripts/context.py)
    guidelines.css  md-type.css (copy of Luz-Design's Markdown type block for reading pages)  templates.txt  handoff.md  handoff.schema.json
  experience\
    catalog.md  sources.json  patterns.json      software: functions, flows, components, rules, research lessons
    hardware\                                    hardware: products, compatibility, suppliers, queries, lessons
  examples\unmanned-gym.plan.json   examples\base-prototype-next\ (admin and mini-program prototypes built from Element Plus and Vant components: a reference for page lists, tokens and layouts)
  scripts\                             rule cards (context.py), sessions, publish, validation, experience, hardware build and export, client function-list check (features_check.py), tests

D:\Codes\skill输出\Luz-System\         outputs only
  NNN-名称\                            three digits, largest number plus one, never reused (older two-digit and underscore names stay readable)
    NNN-名称.html                      summary page, same name as the folder
    硬件选型清单.xlsx                  deliverable files of a standalone task, listed in the page
    raw\                               BRIEF, 00-rules (rule cards), 00-crawl, research, crawl snapshots, 01-system, 02-visual, 03-prototype, 04-hardware, 99-delivery
```

Never write outputs into the skill, and never put rules, templates or scripts into the output folder. The root holds only `raw\` and the summary page, which `publish.py <session> <architecture | system_design | visual | prototype | hardware>` writes from the stage page: the system design page is itself the summary page (one h1 first, `lang="zh-CN"`, zoom not disabled, the md-type block of the reading templates) and lists the files beside it in a section 成果文件. `check_output_layout.py session <会话目录> [--project-linked]` is the check; `validate_session.py` runs it for every session with `output_layout` in its MANIFEST, an older session keeps its layout and only gets a hint.

**Project task** (`new_session.py --project <状态根>` or `LUZ_PROJECT_ROOT`, the state root: the folder holding `project.json`; its `deliver_root` is the project directory, and a project not yet migrated keeps `project.json` and the results in the project root): `publish.py … [--as <名称>]` writes the page to `docs\02-产品开发\NN-名称.html` and `hw_export.py` the hardware list to `docs\01-需求对接\NN-硬件选型清单.xlsx` (the same name keeps its number); the session root keeps `raw\` and a generated summary page listing the results by their paths in the project, and the project holds no source or process file.

Personal contacts (`experience/hardware/contacts.local.json`) and third-party product photos (`experience/hardware/images/`) stay on this machine and are ignored by git.

## Route

| Task | Read | Entry condition |
|---|---|---|
| Any product interface (start here) | [ui-standards.html](references/ui-standards.html) layer by layer, then the surface page's same-named layer | Know which surfaces the product has |
| Web admin console | [admin-design.html](references/admin-design.html) | Approved system design |
| Mini-program | [miniprogram-design.html](references/miniprogram-design.html) | Approved system design; core tasks identified |
| Agent UI | [agent-design.html](references/agent-design.html) | Approved system design; tools and approval points listed |
| Website or landing page | [website-design.html](references/website-design.html) | Approved system design or brief; main action per page known |
| Architecture, system-design HTML, prototype panel | [system-design.html](references/system-design.html) | Requirement IDs, exact modules, module approval, research, then architecture approval |
| Function list (in the design page) | [function-list-design.html](references/function-list-design.html) | Approved functions, pages, actions, states |
| Client function list, business logic to confirm, proposal and architecture-atlas content | [function-list-design.html](references/function-list-design.html) (客户功能清单 and the sections after it), [system-design.html](references/system-design.html) (需求的写法, 方案说明书的内容来源, 架构图的画法); card `client-docs` | Requirements and research recorded; client-documents standard of Luz-Project |
| Ordering, retail, membership, promotions (prices, coupons, cart, checkout, popups and notices) | [commerce-design.html](references/commerce-design.html) | Transaction model and price rules known; card `commerce` |
| Remote configuration and hot updates (limits, timeouts, switches, minimum versions, config centre, code updates) | [config-design.html](references/config-design.html) | Card `remote-config`; every system with a client |
| Agent platform console (queue and quotas, scheduled tasks, risk-alert loop back to the agent, rule engine and scorecards, config-driven performance and document calculation, multi-agent teams, knowledge-base building, visual workflow canvas) | [platform-console-design.html](references/platform-console-design.html) | Cards `platform-console`, `scheduler-ui`, `alert-loop`, `rule-engine-ui`, `multi-agent`, `kb-console`, `workflow-canvas`; agent-design.html keeps the chat and run UI, this page keeps the console and its contracts |
| How the effects (struck prices, corner badges, coupon notches, irregular and breakout cards, sticky rails, safe-area bars) are drawn | Luz-Design `references/ui-recipes.html` | Luz-Design card `interface-recipes`; skeleton `commerce-kit.html` in Luz-Design `references/templates.txt`, example `references/ui-kit/commerce-kit/`; when linkage, countdowns, strong notices and add-to-cart fly-ins fire is decided in commerce-design.html |
| On-site hardware | [hardware-design.html](references/hardware-design.html) and `references/hardware/` | Scale, operation model, budget and site facts recorded |
| Colour, type, icons, corners, motion, spacing | Luz-Design `references/visual-design.html` | Luz-Design card `interface-visual` |

The UI rules are layered: ui-standards.html holds what every surface shares; each surface page repeats the same seven headings with only its specifics and may tighten, never relax, a common rule. The sixth layer (视觉交接) decides no visual values: it states what goes to Luz-Design and where the appearance setting lives; the visual standards themselves (palette, type, icons, composition, the look of components, motion, themes) are Luz-Design's [visual-design.html](https://github.com/luzern0414/Luz-Design/blob/master/references/visual-design.html), and `check_document.py` comes from `D:\Codes\Luz-Design\scripts`. Read [WORKFLOW.md](WORKFLOW.md) for phases and stop conditions, and [experience/catalog.md](experience/catalog.md) before researching.

## Output baseline

These hold for every deliverable; everything else (the seven layers, each surface, closed loops, tables, density, type, icons and visuals) comes from the rule cards, not from memory of a summary.

- The first visible line of every page is the main title; the first section starts directly below it. No subtitle, summary, tags, timestamps, tool names, source counts, hashes, file paths or design-reference notes.
- Interfaces show only product functions and the system's own data. Strategy, advice, playbooks, recommended campaigns or explanations of how the business should operate never appear inside an admin console or mini-program; research conclusions stay in `raw/`.
- A redesign keeps exactly the existing function set; never add modules, cards, KPIs, batch actions, analytics or settings on your own initiative — list ideas for the user outside the interface.
- Use the real brand and scope: the brand appears in the browser title, login page and top bar; a single-store business never shows store switchers or multi-store wording.
- A delivered real system shows only live backend data; dashboards show only metrics the backend returns or the user requests.
- Real or commercial (商业版) systems ship without the prototype configuration panel and start at a login page with the existing account system. Otherwise the configuration panel is grouped by tab (admin: by menu) plus 全局 and pre-rendered into the delivered file (system-design.html 原型配置面板).
- Delivered pages work on a 390 px phone (system-design.html, 手机上可操作). Verify at desktop and phone width in a real browser.
- Product interfaces (admin, mini-program, mobile web, website, agent UI and their interactive prototypes) ship two themes, light and dark: follow `prefers-color-scheme` by default and offer a 跟随系统 / 浅色 / 深色 switch (prototype: the 全局 group of the configuration panel; real systems: the top-bar account menu or settings). Light is the baseline for design and acceptance; dark takes the `dark` mapping of Luz-Design `themes.json`, a second palette and not an inversion. Check both in a real browser (`audit_rendered.py --scheme dark`). Reading pages (module form, architecture, system design page, hardware list, rule pages) stay light only and print light.
- Reading pages (module form, architecture, system design page, hardware list, rule pages) use the Markdown type hierarchy of Luz-Design `file-design.html` 网页文件 › 排版参数: body 18 px on a desktop (768 px and wider), 16 px on a phone, headings, tables and code in the fixed steps of `references/md-type.css`; the templates carry that block and `hw_render_plan.py` reads it, so write no title or body sizes of your own. Product interfaces (admin, mini-program, agent, website prototypes, UI kits) keep the product type scale of Luz-Design visual-design.html (字体与字号) and do not shrink on a phone.

## Common control patterns

Login, password field, inputs, pickers, dates, money, search, admin lists, switches, dialogs, toasts, icon buttons, account menu, sidebar, avatars and badges: see ui-standards.html, 五、组件 → 常用控件做法. Front-end interaction behaviour (two-state controls, list changes, card interaction, multi-level navigation, the agent input box): cards `interaction-patterns`, `nav-levels`, `agent-composer`; the problem families to sweep are in ui-standards.html, 问题的同类判断 → 交互与排布的问题族; how a wide table behaves (frozen columns, scrolling, column settings) is in card `admin-list`, and what the icon-grid entrance block of a mini-program home page is for in card `miniprogram`. Layout, grids, the numbers of the icon grid, table column widths, card and icon sizes and animation timings are not decided here: they come from Luz-Design cards `interface-layout` (grids, spacing, icon grid, table columns, navigation numbers), `interface-pattern` (which of the six page layouts a page uses, and the UI kit that implements them), `interface-icons` (icons and how they pair with titles and cards) and `interface-motion` (durations, easing, list and card animation).

## 每次调用后沉淀

Mandatory on every call, not only at delivery: whenever the skill is called, at least one note is written or confirmed. One store, `experience/notes.json`, with the same shape and commands in Luz-System, Luz-Design, Luz-Dev and Luz-Writing:

- **Start:** the rule card already lists every preference and the matching lessons and facts; `py -X utf8 scripts/experience.py search <关键词> [--kind preference|lesson|fact]` finds more.
- **Before finishing:** `py -X utf8 scripts/experience.py note --kind preference|lesson|fact --key <主题> --text "<一句话原则>" [--why "<依据>"]`. What to record, not limited to: preference — what the user newly stated or corrected; lesson — a rule correction, a pitfall, a problem the checks did not catch and the right way; fact — a design approach that worked (palette steps, layout, type scale, which library's component was followed), research sources and scope (which sites or documents helped or failed, the search words), generation parameters. An existing note used again is confirmed by writing the same key again; a conflicting one is rewritten under the same key. The general principle, not task trivia.
- **In the session:** list every key written or confirmed in BRIEF `## 本次沉淀` (key, kind, one line). `publish.py` refuses a session whose table is empty, names a key missing from `notes.json`, or names a note last confirmed before the session was created; `validate_session.py` reports the same for a published session or with `--strict`. Without a session, say in the reply which keys were written.
- **Fields:** `key`, `kind`, `text`, `why` (optional), `uses`, `first_seen`, `last_confirmed` (YYYY-MM-DD), `previous` (`{text, replaced_at}`, only after a replacement).
- **Replace, never pile up:** the same key replaces the text (one `previous` kept, `uses` +1); the same statement under another key confirms that note. Caps: preference 60, lesson 120, fact 120; over a cap the fewest uses, then the oldest confirmation, go first. `list [--kind]` shows notes; `prune` enforces caps and lists notes unconfirmed for 180 days; `check` fails on duplicate keys or statements, missing fields, overflow and private data.
- **Public repository:** no phone numbers, emails, WeChat IDs, user-home paths, credentials, personal or client names; `note` refuses them.
- **Tests and rehearsals only:** `LUZ_EXPERIENCE_STORE=<path to a notes.json>` points `note`, `list`, `search`, `prune`, the rule cards and the 本次沉淀 gates at that file for the whole process and leaves the skill's own notes and catalog untouched; the gates print a reminder while it is set. Real deliveries never set it, because the skill learns only from its own store. A program that calls the skill on behalf of clients (for example an app publishing demos) writes its generic notes directly, without a person confirming them (the user's decision of 2026-10-29); it searches first and confirms an existing key rather than adding a new one, and never records client context.

Here also: hardware calls run `hw_experience.py search / compat / queries`; products merge by brand and model (latest 5 price samples), queries by platform and text; personal contacts go only to `experience/hardware/contacts.local.json`.

## Session sequence

0. Read the rule card for the task (`context.py <kind>`; sessions save it to `raw/00-rules/`), then `experience/catalog.md` and `experience.py search`, and for hardware `hw_experience.py stats / search / compat / suppliers / queries`.
1. Create the session with `new_session.py` (commands below); it writes the BRIEF, the module intake and the rule cards. Record every user request in BRIEF as a stable REQ-ID with module and acceptance signal.
2. Software: send the module intake and wait for human module approval. Hardware only: record scale, operation model, existing devices, budget and site facts in `raw/04-hardware/requirements.md`.
3. Research with LuzCrawl by its SKILL.md 调用协议: `doctor` → `begin "<主题>" --new` (returns the folder) → `experience --query` → `--out <folder>` on every command. Frontend references for software (at least 12 URLs across 5 domains) and models, prices and channels for hardware. Reuse fresh experience sources first. Business rules, regulations and platform preconditions are not frontend research records: they come from the preflight conclusions and go into the requirement analysis and business logic.
4. Write the architecture: roles, functions, pages, navigation, components and actions, flows with recovery, states, integrations (including every device and its protocol when hardware is in scope), traceability, acceptance. Wait for architecture approval.
5. System design, then product visual board, then interactive prototype, each with its own human approval; exercise the prototype in a real browser.
6. Hardware: storyboard the whole lifecycle, map every step to devices, fill `raw/04-hardware/plan.json`, then `hw_build.py` (validates, renders `hardware-plan.html`, runs Luz-Design's document check); the person approves the list (`APPROVALS.json` hardware) before it is published; `hw_export.py` writes the client's Excel (`硬件选型清单.xlsx`: sheet 设备清单 and sheet 现场条件, from the same plan) beside the summary page or into the project, and comes before `publish.py` so the page lists it.
7. Sediment: `experience.py harvest` and `experience.py add` for software; `hw_experience.py add experience\hardware\inbox\<file>.json` for hardware; `experience.py note` for preferences, lessons and facts, with the keys listed in BRIEF 本次沉淀 (每次调用后沉淀). Fill BRIEF 采用的规则 from the rule cards.
8. Publish the summary page with `publish.py <session> <architecture | system_design | visual | prototype | hardware>`; it refuses a session without a current rule card, 采用的规则 or 本次沉淀.

~~~powershell
py -X utf8 scripts/context.py list
py -X utf8 scripts/context.py admin-list --topic 订单 导出
py -X utf8 scripts/new_session.py --name "<名称>" --modes system --system-name "<系统名>" --modules "<模块1>,<模块2>"
py -X utf8 scripts/new_session.py --name "<名称>" --modes system,hardware --system-name "<系统名>" --modules "<模块1>"
py -X utf8 scripts/new_session.py --name "<名称>硬件选型清单" --modes hardware
py -X utf8 scripts/new_session.py --name "<名称>" --modes system --system-name "<系统名>" --modules "<模块1>" --project "<状态根>"
py -X utf8 scripts/add_mode.py "<会话目录>" visual --card admin-list --card admin-dashboard --card miniprogram
py -X utf8 scripts/add_mode.py "<会话目录>" prototype
py -X utf8 scripts/hw_build.py "<会话目录>"
py -X utf8 scripts/hw_export.py "<会话目录>"
py -X utf8 scripts/features_check.py "<状态根>\data\client"
py -X utf8 scripts/publish.py "<会话目录>" prototype
py -X utf8 scripts/new_session.py icon "<系统名>"
~~~

Every published page carries an inline SVG tab icon and admin or website prototypes a graphic brand mark of the same pictogram (ui-standards.html 页头与品牌标识): templates fill `{{TAB_ICON}}` and `{{BRAND_MARK}}` from the system name, `new_session.py icon` prints both for hand-made pages, and `publish.py` and `validate_session.py` reject a final HTML without the icon. List tables paginate with 20 rows by default (admin-design.html 分页); the prototype template ships a working pager and `validate_session.py` warns when one is missing or defaults to another size.

## Approvals

Every approval records status, artifact path, SHA-256, time, approver and note in `raw/99-delivery/APPROVALS.json`: module scope, architecture, system design, visual, prototype (with the browser acceptance screenshot) and, for hardware, the hardware list. Scripts and the model never approve.

**One authorization for platform demos** (`new_session.py --approval-mode authorization`; software demo sessions only, no hardware; Luz-Dev refuses them): when the person confirms the background and presses generate, the platform saves that background to its own file and appends to `APPROVALS.json` `authorizations` one entry `{id: "AUTH-001", authorized_by: <the person>, authorized_at, scope: [module_scope, architecture, system_design, visual, prototype], statement: <their own words>, context_path, context_sha256}`. After each stage passes its checks, the platform writes that stage's record as usual with `status: "approved"`, `approval_basis: "authorization"`, `authorization_id` and `approved_by` equal to the signer. `validate_session.py`, `add_mode.py` and `publish.py` accept such a record only in an authorization session, inside the scope, signed by a person, written after signing, while the context file still matches its hash, and citing the authorization in force at that time. A failed run resumes under the same authorization; changed background or a request to redo a stage needs a new authorization (AUTH-002, its own context file), and records written after it cite it.

## Integrated system design page

When the user asks for one page holding the function list, an operable mini-program and the admin console, build `raw/03-prototype/interactive-prototype.html` with exactly three parts — 系统功能列表, 小程序界面, 后台管理界面 — and publish it. Function, page and action IDs come from the architecture; mini-program and admin share one demo dataset; prototype controls sit beside the phone frame; the three parts share one font family, type scale and alignment; the prototype test checks family, italics, type scale, right-edge overflow at 1280/1366/1440/1920, centred headers and duplicate entries. When the system also has hardware, the hardware list is published from the same session or kept in `raw/04-hardware/` and referenced by the architecture's integrations.

## Validate

~~~powershell
py -X utf8 scripts/context.py check
py -X utf8 scripts/validate_skill.py
py -X utf8 scripts/validate_skill.py --package-only
py -X utf8 scripts/experience.py check
py -X utf8 scripts/hw_experience.py check
py -X utf8 scripts/features_check.py "<data/client>"
py -X utf8 scripts/validate_session.py "<会话目录>" --strict-production
py -X utf8 scripts/check_output_layout.py session "<会话目录>" [--project-linked]
py -X utf8 scripts/check_interaction.py "<会话目录>"
py -X utf8 D:\Codes\Luz-Design\scripts\check_document.py "<delivered file>" --allow interface
py -X utf8 -m unittest discover -s scripts -p "test_*.py"
~~~

`validate_skill.py` checks the skill structure, the eleven rule pages, the rule cards, the experience library and every session in the output folder. Its first line is the package result (`PACKAGE PASS` or `PACKAGE FAIL`), then the session findings, then the overall `PASS:` or `FAIL:`; `--package-only` skips the sessions. Any ERROR in the session being delivered blocks it; a clean run is necessary, not sufficient.


## 客户文件与上下游衔接

**交给客户的文件只有 PDF 和 Excel**（Word 只是方案说明书的排版源，不交给客户；HTML 只给评审、开发和演示）。本技能的 HTML（模块表单、系统架构、系统设计、视觉稿、原型、`hardware-plan.html`）都属于后者；客户拿到的是同一批事实派生出的 PDF 与 Excel，每份文件把自己的内容写完整，不提及其他文件。事实写在数据文件里，成品是它的派生物，不手改成品。项目里客户文件只在 `docs\01-需求对接`（Luz-Project 写入；硬件选型清单由 `hw_export.py` 直接写入），数据文件与描述文件都留在状态根，不进项目目录。

| 客户文件 | 本技能负责的内容 | 数据文件与生成 |
|---|---|---|
| 功能清单（含报价清单）Excel | 模块、功能、使用端、角色、基础或可选、业务逻辑、工时；规则卡 `function-list` 与 `client-docs` | `data/client/features.json`，Luz-Project 经 Luz-Design 的表格脚本生成；先跑 `features_check.py` |
| 业务逻辑确认表 Excel | 每个功能拟定的业务逻辑（`rules` 按“；”拆成逐条）和项目专属的待决规则、只有客户才有的资料 | `features.json` 与 `intake-extra.json`，Luz-Project 生成与回收 |
| 方案说明书 PDF | 需求分析（现状问题、各使用方的核心需求）、系统构成、角色与权限、业务流程、各系统的功能与业务逻辑、统一业务规则 | Luz-Writing 写，Luz-Design 排版，Luz-Project 编排；内容来源见 system-design.html“方案说明书的内容来源” |
| 系统架构图册 PDF | 节点与数据流的业务含义、模块输入处理输出、依赖、数据链路、泳道流程、状态、数据隔离、部署、各端功能分布 | `data/client/architecture.json`，Luz-Design 的展示版脚本；画法见 system-design.html“架构图的画法” |
| 硬件选型清单 Excel | 设备、数量、单价与采购渠道、接口与供电、现场条件 | `raw/04-hardware/plan.json`，本技能 `hw_export.py` 经 Luz-Design 表格脚本生成（独立任务放会话根） |

**输入。** 项目模式读 `project.py context <项目> <阶段> --skill luz-system`（前序阶段产物、`client` 段里的数据文件、客户确认过的答案、待确认变更）；独立调用读用户原话。Luz-Crawl 的前置检索结论是调研的唯一来源；视觉基础来自 Luz-Design 的 `interface-visual` 规则卡。**输出。** 功能清单与业务逻辑进 Luz-Project 的数据文件（稳定功能编号 `FN-001…`，发布后永不复用，改动走变更台账）；架构、系统设计与原型的编号和交互契约进 `HANDOFF.json` 与 `references/handoff.md` 交给 Luz-Dev；每个功能的 `acceptance` 与 `tags` 交给 Luz-Ops 映射测试证据；前端结构与交互要求交给 Luz-Design，色板、字体、图标不在本技能选择。

**项目模式的阶段分工。**

| 阶段 | 本技能做什么 | 第一步 |
|---|---|---|
| proposal | 读规则卡 `client-docs`，写 `features.json`（含 `hours`）、给方案与架构图册提供内容；`features_check.py` 零错误后交 Luz-Project 生成 | `py -X utf8 scripts/context.py client-docs` |
| client-intake | 把每个功能的 `rules` 写成可确认的逻辑，补 `intake-extra.json`（只放项目专属问题） | 同上，再跑 `features_check.py <data/client>` |
| architecture | 交 `01-系统架构.html`（四个页签：技术栈、总体架构、功能与技术方案、决策与质量，每个功能一张功能卡，标准见 dev-documents.md）；有界面的项目同时交界面功能说明（页面与路由、入口、标签栏、组件、按钮动作、状态、数据需求、文案键，不选色板、字体、图标和阴影，属于 Luz-Design）、入口表 `entrances*.json` 和原型逻辑，登记为本阶段产物（`project.py artifact … --kind frontend-spec \| frontend-spec-page \| entrances \| proto-logic`）；后端细节交给 Luz-Dev；`project.py link` 登记每个功能的落点 | `context.py system-design` |

没有显式 project context 时是独立任务，不创建项目目录；项目任务的成果去向见 Layout。
