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

### 动作归属与业务规则

按[入口与内容分层](ui-standards.html#entry-ownership)归组。新建 `luz-ui-requirements/2` 合同用 `action_groups` 记录组编号 `id`、主入口页 `owner_page_id` 和归属功能 `feature_ids`。同端、同角色上下文的同一功能只归一组。独立的端或角色工作区在页面写 `entry_scope`，单一上下文可省略。一个设置页可承载多组。

每个动作的 `feature_id` 标识它执行或打开的功能。执行动作位于主入口页或由 `parent_page_id` 连到它的子页面。组外快捷入口的 `target_page_id` 指向主入口，组内可以继续导航到子页面。规则变更在所属功能的已确认规则处更新，引用其他功能规则时用 `rule_refs` 写其稳定功能编号。独立合同由 `features[].basis.ref` 指向规则原文。校验器核对归属、页面关系和引用，业务审阅核对两个编号是否实际描述同一操作。已有 `/1` 合同可按原版本复核。

The approved editable source remains authoritative for UX intent: `01-system/04-system-design.html` (architecture: `01-system/03-system-architecture.html`), the complete UI package published for the visual and prototype stages (`<stage>-source.zip` beside the summary page, built in the linked Luz-Design session; sessions made before that keep `02-visual/visual-board.html` and `03-prototype/interactive-prototype.html`), and for devices `04-hardware/plan.json`. Implementation may add technical detail, but it must return to Luz System before changing a user-visible flow, permission rule, source claim, or hierarchy.

`handoff.schema.json` here is the master: Luz System produces the handoff and owns its schema. `Luz-Dev/contracts/handoff.schema.json` mirrors it and the two files are the same (Luz-Dev's `validate_skill_package.py` and its tests compare them). Change the schema here, then copy the file to Luz-Dev. Validate a handoff with Luz Dev `scripts/validate_handoff.py`.

Also hand over, in the files the client documents come from: `data/client/features.json` (functions, business logic, `acceptance`, `tags`, and hours only when explicitly requested) so Luz-Ops can map every acceptance item to test evidence; the client never receives HANDOFF.json or any HTML page, only the PDF and Excel Luz-Project builds from the data files.
