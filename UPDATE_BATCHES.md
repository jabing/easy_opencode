## Batch 26 — coder-loop / implement-task / kernel strict-safe (completed)

Completed:

- Burned down the strict-typecheck quarantine from `27` files to `24` files.
- Fixed and removed three previously quarantined modules from the manifest:
  - `src/cli/coder-loop-cli.js`
  - `src/cli/implement-task-cli.js`
  - `src/control-plane/kernel/orchestrator-kernel.js`
- Converted the coder loop CLI to typed run/check/policy structures and removed the duplicate patch-footprint field overwrite.
- Converted the implement-task workflow CLI to strict-safe orchestration state handling, including scaffold/snapshot/workflow trace shaping and exact-optional-safe plan persistence.
- Converted the orchestrator kernel bridge to strict-safe run registration contracts for implementation, coder, and gate flows.
- Added regression test `tests/typecheck-burndown-batch26.test.js`.

Result:

- Current state: `strict_checked=169`, `quarantined=24`, `total_src_files=193`.
- Core implementation workflow entrypoints and kernel registration plumbing now run under strict JS typecheck instead of quarantine.


## Batch 25 — feature bundle/plan-shared strict-safe (completed)

Completed:

- Burned down the strict-typecheck quarantine from `29` files to `27` files.
- Fixed and removed two previously quarantined modules from the manifest:
  - `src/core/feature/bundle.js`
  - `src/core/feature/plan-shared.js`
- Converted the feature bundle writer to strict-safe JSDoc contracts, including typed template vars, update/result payloads, and exact-optional-safe result shaping.
- Converted shared feature planning helpers to strict-safe JSDoc contracts, including feature path/memory/update records and a typed POSIX path shim.
- Added regression test `tests/typecheck-burndown-batch25.test.js`.

Result:

- Current state: `strict_checked=166`, `quarantined=27`, `total_src_files=193`.
- Feature bundle generation and shared planning helpers now run under strict JS typecheck instead of quarantine.


## Batch 18 — Benchmark/failure-strategy quarantine burn-down (completed)

Completed:

- Burned down the strict-typecheck quarantine from `45` files to `42` files.
- Fixed and removed three previously quarantined modules from the manifest:
  - `src/core/benchmark/feedback.js`
  - `src/core/benchmark/trends.js`
  - `src/core/gates/failure-strategy.js`
- Restored `@ts-nocheck` markers for still-quarantined files whose markers had drifted (`src/cli/eoc-bridge-cli.js`, `src/cli/eoc-start-cli.js`, `src/core/release/evidence.js`).
- Added regression test `tests/typecheck-burndown-batch18.test.js`.

Result:

- Current state: `strict_checked=151`, `quarantined=42`, `total_src_files=193`.
- Benchmark risk analysis and coder failure-strategy logic now run under strict JS typecheck instead of quarantine.


## Batch 9 — Quarantine burn-down wave 2 (completed)

Completed:

- Burned down the strict-typecheck quarantine from `89` files to `78` files.
- Fixed 10 previously quarantined modules and removed their manifest entries.
- Repaired `src/cli/delivery-report-cli.js` so it now passes strict typecheck outside the quarantine set.
- Added regression test `tests/typecheck-burndown-batch9.test.js`.

Result:

- Current state: `strict_checked=115`, `quarantined=78`, `total_src_files=193`.
- Typecheck accountability remains aligned and the quarantine set is materially smaller.


## Batch 8 — Quarantine burn-down wave 1 (completed)

Completed:

- Burned down the strict-typecheck quarantine from `102` files to `89` files.
- Fixed 13 previously quarantined modules and removed their stale manifest entries.
- Restored manifest/marker alignment so `typecheck.quarantine.json` now exactly matches `// @ts-nocheck` usage again.
- Added regression test `tests/typecheck-burndown-batch8.test.js`.

Result:

- Current state: `strict_checked=104`, `quarantined=89`, `total_src_files=193`.
- Typecheck accountability is now both explicit and internally consistent.


## Batch 7 — Full-src typecheck accountability (completed)

Completed:

- Replaced manual `tsconfig.json#files` allowlist with `include: ["src/**/*.js", "src/**/*.d.ts"]`.
- Added `typecheck.quarantine.json` so every non-strict-safe source file is explicitly tracked instead of silently omitted.
- Added `// @ts-nocheck` markers to quarantined files and kept the remaining strict-safe sources under full typecheck.
- Enhanced `npm run typecheck` / `npm run typecheck:report` to report `checked`, `total`, and `quarantined`.
- Added regression test `tests/typecheck-accountability-batch7.test.js`.

Result:

- Full src accounting is now explicit: no source files are hidden outside tsconfig coverage.
- Current state: `strict_checked=91`, `quarantined=102`, `total_src_files=193`.


## Batch 26.1 — Feature Generator 最终验收与交付收口（已完成)

目标：把前面多批次的 feature generator 能力从“已开发”收口成“可验收、可交付”的最终状态。

已完成：

- 新增 `scripts/lib/feature-acceptance.js`，统一读取 persisted feature plan、integration、delivery 结果并汇总最终验收状态。
- 新增 `scripts/feature-acceptance.js` CLI，可输出单个 feature 或全部 feature 的验收摘要。
- 新增命令 `commands/feature-acceptance.md`。
- `quality-gate --feature <name>` 已新增 `feature.acceptance` 检查项。
- `delivery-report` 已新增 `feature_acceptance` 字段与文本段落，便于 handoff / PR / report 直接引用。
- 新增 `npm run feature:acceptance`。

验收结果：

- 关键 feature 产物现在可以同时回答：
  - bundle 是否完整
  - delivery 是否 ready
  - acceptance 是否通过


# Update Batches

## Batch 25.8 — Feature feedback 深化为内容风格与形状持久化（已完成）

目标：让 feature feedback 不只影响 verify 和模块开关，还能影响生成内容风格，并把成功生成的 feature 形状持续写回 project memory。

已完成：

- 新增 `scripts/lib/feature-feedback.js` 的规划增强：
  - 生成 `implementation_style`
  - 生成 `shape_strategy`
- `feature-plan` 现在支持规划参数注入，并可按实现风格切换模板。
- 新增 class-based 模板：
  - `skills/generate-node-feature/templates/feature/class-based/controller.ts.tpl`
  - `skills/generate-node-feature/templates/feature/class-based/service.ts.tpl`
  - `skills/generate-node-feature/templates/feature/class-based/repository.ts.tpl`
- 新增 project memory 回写能力：
  - `normalizeFeatureShape()`
  - `updateMemoryFromFeatureResult()`
- `generate-feature` / `skill-runner` / `debug-fix-loop` 成功后都会把：
  - `preferred_feature_shape`
  - `last_feature_generation`
  写回 `.opencode/project-memory.json`。
- `integration.md` / `api.md` 已新增：
  - `Implementation style`
  - `Shape strategy`
- 新增回归测试：
  - `tests/feature-generator-batch8.test.js`
    - 验证 class-based memory 会切换生成模板
    - 验证成功生成后会持久化 feature shape 与 last generation 元数据

验收结果：

- `npm test` ✅
- `npm run lint` ✅
- `npm run build` ✅

## Batch 25.1 — 发布卫生与基础回归（已完成）

目标：先解决影响生产级判断最大的三个问题：发布包混入运行态文件、缺少测试入口、verify 建议跨 runtime 泄漏。

已完成：

- 新增 `.gitignore`，忽略 `.opencode` 下的运行态/观测态/交付态目录。
- 收紧 `package.json#files`，仅发布 `.opencode` 下的静态资产：
  - `.opencode/instructions/`
  - `.opencode/plugins/`
  - `.opencode/hooks-config.json`
  - `.opencode/command-policy.json`
- 新增 `npm test` / `npm run test:unit`。
- 新增 `npm run package:hygiene` / `npm run pack:check`。
- 新增 `scripts/package-hygiene.js`，对 npm 发布白名单做机器校验。
- 新增 `scripts/lib/verify-suggestions.js`，按 runtime 过滤并收敛 verify 建议。
- `skill-runner` 与 `implement-task` 已切换到 runtime-aware verify 建议。
- 新增最小回归测试集：
  - `tests/package-hygiene.test.js`
  - `tests/project-profile.test.js`
  - `tests/verify-suggestions.test.js`
- `quality-gate` 已增加 `package.publish_hygiene` 检查项。

验收结果：

- `npm test` ✅
- `npm run lint` ✅
- `npm run typecheck` ✅
- `npm run build` ✅
- `npm run package:hygiene` ✅
- `npm run quality-gate:json` ✅
- `npm pack --dry-run` ✅（运行态 `.opencode` 内容已排除）

## Batch 25.2 — 插件自测矩阵扩展（已完成）

目标：从“有测试入口”扩展到“关键能力有回归覆盖”。

已完成：

- 新增 `tests/scaffold-bundles.test.js`：覆盖 Node / Python / Go / Java 的 dry-run scaffold 输出与 runtime-aware verify。
- 新增 `tests/project-profile-runtimes.test.js`：覆盖 Node / Python / Go / Java 的 runtime 识别与验证命令探测。
- 新增 `tests/quality-review-gate.test.js`：
  - 对插件仓库的 `quality-gate --full --strict --json` 做快照式回归；
  - 对普通 Node 仓库断言 `package.publish_hygiene` 会被正确跳过；
  - 对普通源码变更仓库断言 `review-gate` 给出 followups 而不是误阻断。
- 新增 `tests/pack-check.test.js`：校验 `npm pack --dry-run --json` 文件清单，确认 tarball 排除了运行态 `.opencode` 内容。
- 修复 `scripts/skill-runner.js` 中 `scaffold --json` 走 bundle 路径时报 `profile is not defined` 的问题。
- 修复 `quality-gate` 对非插件 Node 项目误执行 `package.publish_hygiene` 的问题。
- 改进 `skill-runner scaffold`：当用户覆盖 `package_name` 时，同步重算 `package_path`，避免 Java bundle 输出路径仍沿用项目目录名。

验收结果：

- `npm test` ✅（16/16）
- `npm run lint` ✅
- `npm run typecheck` ✅（checked=80）
- `npm run build` ✅
- `node scripts/quality-gate.js --full --strict --json` ✅（12 pass / 0 fail / 0 warn）
- `npm pack --dry-run --json` ✅

## Batch 25.3 — 安全回滚与发布阈值（已完成）

目标：把“准生产”继续抬到“更接近生产级”。

已完成：

- 新增 `scripts/release-check.js` 与 `scripts/lib/release-check.js`，统一执行发布前检查：
  - `quality-gate --full --strict`
  - `npm test`
  - `npm pack --dry-run --json`
  - `package:hygiene`（仅插件工作区）
  - `review-gate --with-quality-gate --quality-mode full --no-plan`
  - `benchmark.release_readiness`
  - `snapshot.readiness`
- 新增 `npm run release:check` / `npm run release:check:json`。
- 为 `benchmark-feedback` 增加显式 `release_readiness`：输出 `ready / caution / blocked`，并包含阈值信息：
  - 最低 benchmark run 数：5
  - 最低 confidence：30
  - 高风险 bucket 直接 `blocked`
- 为 `safe-apply status` 增加 `snapshot_readiness`，清晰区分：
  - `ready`
  - `missing`
  - `stale`
  - `stale_branch`
  - `degraded_dirty`
  - `degraded_not_git`
  - `degraded_<snapshot status>`
- 为 snapshot 不可用时提供更明确的降级原因与推荐命令。
- 强化 `review-gate`：当变更被判为高风险且 plan 的 rollback snapshot 未就绪时，升级为 blocker，而不只是 followup。
- 为 `review-gate` 增加 `--no-plan` 模式，避免统一发版检查被历史 plan 状态污染。
- 新增回归测试：
  - `tests/release-readiness.test.js`
    - 验证 shallow benchmark => `caution`
    - 验证 high-risk benchmark => `blocked`
    - 验证 dirty git repo => `snapshot_readiness.degraded_dirty`
    - 验证 `release-check` 在非 strict / strict 下的判定差异
- 扩展测试辅助：新增 `runNodeResult`，用于断言 CLI 非零退出码。

验收结果：

- `npm test` ✅（20/20）
- `npm run lint` ✅
- `npm run typecheck` ✅（checked=83）
- `npm run build` ✅
- `node scripts/quality-gate.js --full --strict --json` ✅（12 pass / 0 fail / 0 warn）
- `node scripts/release-check.js --json` ✅（当前工作区判定为 `caution`，主要因为缺少 git 仓库上下文与 benchmark confidence 偏低）
- `npm pack --dry-run --json` ✅

## Batch 25.4 — 基准覆盖与趋势门禁（已完成）

目标：继续提升“生产级判断”的证据质量，把 benchmark 从“有数据”升级为“覆盖当前发布范围且没有明显回退”。

已完成：

- 强化 `benchmark-feedback`：
  - 新增 `coverage`，区分 `sufficient / partial / missing`；
  - 新增 `trend_evidence`，汇总匹配 bucket 的趋势方向；
  - `release_readiness` 现在同时考虑：
    - run 数
    - confidence
    - scope coverage
    - matched trend direction
- 强化 `release-check`：
  - 新增 `benchmark.scope_coverage` 检查项；
  - 新增 `benchmark.latest_comparison` 检查项，对最近两次 benchmark 做回退检测；
  - 报告中新增 `policy`，显式给出 release policy 与 benchmark 阈值；
  - 报告中新增 `latest_benchmark_comparison` 结构化摘要。
- 扩展 `benchmark-suite sample`：
  - 新增 `--preset production-readiness`，覆盖 endpoint / service / config / model / test 等更宽任务面；
  - 新增 `--preset deep-task-families`，聚焦新增的 deeper task bundles。
- 扩展测试辅助：
  - `tests/test-helpers.js` 新增 `writeBenchmarkRun` / `makeBenchmarkResult`，便于构造 benchmark 历史矩阵。
- 新增回归测试：
  - `tests/benchmark-suite-presets.test.js`
  - `tests/release-readiness.test.js` 扩展：
    - 验证 skill-specific benchmark coverage 缺失 => `partial`
    - 验证 `release-check` 会暴露 latest benchmark regression
- 放宽 `quality-review-gate` 中过于脆弱的 typecheck 断言，改为结构化断言，避免单纯计数变化导致误报。

验收结果：

- `npm test` ✅（24/24）
- `npm run lint` ✅
- `npm run typecheck` ✅（checked=84）
- `npm run build` ✅
- `node scripts/quality-gate.js --full --strict --json` ✅（12 pass / 0 fail / 0 warn）
- `node scripts/release-check.js --json` ✅（当前工作区判定为 `caution`，主要因为当前目录不在 git 仓库中且 benchmark scope coverage 缺失）
- `npm pack --dry-run --json` ✅

## Batch 25.5 — Release rehearsal 与 benchmark baseline 固化（已完成）

目标：把“准生产 gate”推进到更接近真实发布场景：既能把 benchmark 结果沉淀成可复用 baseline，也能在临时 git sandbox 中做黑盒 release rehearsal。

已完成：

- 新增 benchmark baseline 能力：
  - `scripts/lib/benchmark-baselines.js`
  - `benchmark-suite baseline --name <name> --latest --json`
  - `benchmark-suite baseline --name <name> --from <run-id> --json`
  - `benchmark-suite baseline --list --json`
  - `benchmark-suite compare --baseline-name <name> --latest --json`
- baseline 现在会落盘到 `.opencode/observability/benchmark-baselines/`，并记录：
  - baseline 名称
  - 来源 run id / 来源类型
  - baseline 摘要
  - 完整 baseline run
- `release-check` 已接入 baseline：
  - 新增 `benchmark.baseline_comparison` 检查项
  - 当存在命名 baseline（默认 `release`）时，会把当前 latest benchmark 与 baseline 做回归比较
  - policy 中新增 `require_benchmark_baseline_when_present`
  - 报告中新增 `benchmark_baseline`
- `release-check` 现在会自动解析 benchmark scope：
  - 优先使用显式参数
  - 否则回退到 latest benchmark scope
  - 再回退到 project-profile 识别结果
  - 避免 benchmark scope 默认落到 `unknown` 导致误判
- 新增真实 release rehearsal：
  - `scripts/lib/release-rehearsal.js`
  - `scripts/release-rehearsal.js`
  - `npm run release:rehearsal`
  - `npm run release:rehearsal:json`
- `release-rehearsal` 会：
  - 复制当前工作区到临时 sandbox
  - 初始化临时 git 仓库并提交当前内容
  - 创建 rollback snapshot
  - 在 sandbox 中执行 `release-check`（默认 strict）
  - 返回 rehearsal repo 状态、snapshot 状态和最终 release decision
- 修复 baseline 摘要在源 run 缺少 `summary` 字段时会退成 0/null 的问题；现在会从 `results` 自动回算摘要。
- 新增回归测试：
  - `tests/benchmark-baselines.test.js`
    - 保存 baseline
    - 列出 baseline
    - 对比 baseline 与指定 run
    - 验证 `release-check` 会暴露 baseline regression
  - `tests/release-rehearsal.test.js`
    - 验证 `release-rehearsal` 会在 sandbox git repo 中创建 snapshot 并跑通严格 release-check

验收结果：

- `npm test` ✅（27/27）
- `npm run lint` ✅
- `npm run typecheck` ✅（checked=89）
- `npm run build` ✅
- `node scripts/quality-gate.js --full --strict --json` ✅（12 pass / 0 fail / 0 warn）
- `node scripts/release-check.js --json` ✅（当前工作区判定为 `caution`，主要因为 benchmark confidence 偏低且当前目录不在 git 仓库中）
- `node scripts/release-rehearsal.js --json` ✅（当前插件工作区在 strict 模式下判定为 `blocked`，原因是 warning 被 strict 放大；在有足够 benchmark 与 baseline 的健康项目上，回归测试已验证可达 `ready`）
- `npm pack --dry-run --json` ✅

## Batch 25.6 — Release policy 分层与 benchmark 数据保鲜（已完成）

目标：把 release gate 从“单一阈值”升级成“分层策略”，同时让 benchmark 不再默认把很久以前的样本当成同等可信的发布证据。

已完成：

- 新增 `scripts/lib/release-policy.js`：内置三档 release policy
  - `internal`
  - `standard`
  - `production`
- `release-check` / `benchmark-feedback` / `release-rehearsal` 已支持 `--policy <name>`：
  - `standard` 作为默认策略；
  - `production` 会显式要求更高 benchmark 阈值，并在缺少 baseline 时不再默默跳过。
- 新增 `scripts/lib/benchmark-freshness.js`：
  - 统一计算 benchmark age / freshness；
  - 区分 `fresh / aging / stale / expired / missing`；
  - 支持按 policy 切换 freshness 阈值。
- 强化 `benchmark-feedback`：
  - 报告中新增 `policy`；
  - 报告中新增 `freshness`；
  - `release_readiness` 现在会把 benchmark 新鲜度纳入判断；
  - 对于过期 benchmark 证据会直接升级为 blocker。
- 强化 `release-check`：
  - 新增 `selected_policy`；
  - 新增 `benchmark.data_freshness` 检查项；
  - policy 中新增 release tier 与 freshness threshold；
  - `production` policy 会在缺少 `release` baseline 时给出显式 warning，并因 production 默认 block-on-warn 而阻断发布。
- 强化 `release-rehearsal`：
  - 现在会把 `policy` 一并传入 sandbox 中的 `release-check`，使 rehearsal 与真实发布策略保持一致。
- 扩展 `benchmark-suite`：
  - 新增 `benchmark-suite freshness --policy <name> --json`；
  - 可输出当前 benchmark run 的 age bucket 分布与 stale/expired run 列表，便于做数据保鲜巡检。
- 新增回归测试：
  - `tests/benchmark-freshness-policy.test.js`
    - 验证 expired benchmark evidence => `blocked`
    - 验证 `benchmark-suite freshness` 的 age bucket 汇总
    - 验证 `standard` 与 `production` policy 的 release 决策差异

验收结果：

- 全量测试按文件逐项复跑 ✅（12 个测试文件全部通过）
- `npm run lint` ✅
- `npm run typecheck` ✅（checked=92）
- `npm run build` ✅
- `node scripts/quality-gate.js --full --strict --json` ✅
- `npm pack --dry-run --json` ✅

## Batch 25.7 — Baseline 审批流与 benchmark 自动归档（已完成）

目标：把“存在 baseline”升级成“baseline 已被明确批准”，同时给 benchmark 引入自动归档策略，减少旧样本长期污染 release 判断。

已完成：

- 新增 `scripts/lib/baseline-approvals.js`：
  - 支持 baseline approval 的保存、读取、列表、撤销；
  - 审批会绑定到**具体 baseline run_id**，避免 baseline 更新后旧审批继续误生效；
  - 可识别 `approved / missing_approval / stale_approval / revoked / missing_baseline`。
- 强化 release policy：
  - `production` policy 现在除要求 baseline 外，还要求 **approved baseline**；
  - `internal / standard` 仍保持 approval 可选，避免把低风险内部流转也堵死。
- 强化 `release-check`：
  - 新增 `benchmark.baseline_approval` 检查项；
  - 返回 `baseline_approval` 结构化结果；
  - 当 baseline 已变更但审批还指向旧 run 时，会显式判为 `stale_approval`。
- 扩展 `benchmark-suite`：
  - 新增 `approve` 命令：批准指定 baseline；
  - 新增 `approval` 命令：查询 / 列表 / 撤销 baseline approval；
  - 新增 `archive` / `cleanup` 命令：按 policy 与 freshness 规则进行 benchmark 归档 dry-run 或 apply。
- 新增 `scripts/lib/benchmark-retention.js`：
  - 统一计算 benchmark 归档候选；
  - 默认保留不少于当前 policy 最低 run 数的 latest runs；
  - 自动保护 baseline run 与已审批 baseline 对应 run，不会被归档移走；
  - 仅对 `stale / expired` 且不受保护、也不在 keep-latest 窗口内的 run 给出归档建议。
- benchmark archive 落盘路径：
  - `.opencode/observability/benchmarks-archive/<yyyymm>/...`
- 新增回归测试：
  - `tests/baseline-approval-retention.test.js`
    - 验证 production release-check 需要 approved baseline
    - 验证 baseline 更新后旧 approval 会变成 `stale_approval`
    - 验证 archive 会保留 latest runs，并保护 baseline/approval 绑定 run
- 同步更新既有 policy 测试：
  - `tests/benchmark-freshness-policy.test.js` 已纳入 approval 要求，避免 production-ready 判断仍停留在“只有 baseline 即可”的旧语义。

验收结果：

- 全量测试按文件逐项复跑 ✅（13 个测试文件全部通过）
- `npm run lint` ✅
- `npm run typecheck` ✅（checked=95）
- `npm run build` ✅
- `node scripts/quality-gate.js --full --strict --json` ✅（12 pass / 0 fail / 0 warn）
- `npm pack --dry-run --json` ✅



## Batch 25.8 - Release evidence dashboard and audited policy overrides

Status: completed

Delivered:
- Added `release-evidence` to summarize release-check, latest rehearsal, baseline approval, overrides, and observability in one report.
- Added audited `release-override` request/approve/revoke/status flow with expiry, allowed-check coverage, and usage logging.
- Extended `release-check` to apply approved overrides only when they cover every failing/warning check, surfacing `ready_with_override`.
- Persisted release rehearsal reports under `.opencode/observability/release-rehearsals/` with `latest.json`.
- Added black-box regression tests for override application and release evidence reporting.


## Batch 25.9 — 单作者 override 强约束（已完成）

目标：保持单作者模型，不引入多人审批；把 release override 收紧成短时、有限、可见、不可滥用的个人自控机制。

已完成：

- `release-policy` 新增 override 约束：
  - `internal / standard / production` 都有各自的
    - `minimum_reason_length`
    - `max_duration_hours`
    - `max_usage_count`
    - `disallowed_checks`
- `policy-overrides` 强化：
  - 申请 override 必须提供足够长的 `reason`
  - 必须提供未来的 `expires_at`
  - 不能超过当前 policy 的最长有效期
  - `allowed_checks` 不能为空
  - override 用完后会进入 `exhausted`，不能被反复复用
- `release-check` 强化：
  - `policy_override` 新增 `blocked_checks / disallowed_checks`
  - 只有当 override 覆盖全部告警/阻断项，且没有命中禁止覆盖的检查项时，才会变成 `ready_with_override`
- `release-evidence` 强化：
  - `summary.override_release` 标记当前是否依赖 override 放行
  - `policy_overrides.active` 现在会显示 `constraints` 与 `usage_count`
- 文档更新：
  - `commands/release-override.md` 已补充单作者 safeguard 说明

新增回归测试：

- production override 不能覆盖 `benchmark.baseline_approval`
- production override 不能超过 8 小时
- override 达到最大使用次数后会自动失效
- release evidence 会显式标记 override release

## Batch 26.1 — 运行时内核落地（已完成）

目标：完成“真正工程级版本”的第一批，把分散的 orchestrator 状态收口成统一运行内核，同时保持旧命令接口可继续工作。

已完成：

- 新增 `scripts/lib/kernel/`：
  - `state-machine.js`：统一 run status / step status 与状态迁移校验
  - `run-store.js`：统一 kernel run 持久化与 active-run 指针
  - `event-log.js`：独立 kernel 事件日志 `\.opencode/kernel/events.ndjson`
  - `orchestrator-kernel.js`：旧 implementation / coder / gate 运行态向新内核的兼容注册层
- `scripts/lib/orchestrator-memory.js` 已接入新内核：
  - `rememberPlan()` 会注册统一 implementation run
  - `rememberCoderRun()` 会注册/更新统一 coder run
  - `rememberGateRun()` 会注册/更新统一 gate run
  - `buildRecovery()` 现在会优先读取 kernel active-run 与 kernel flow 指针
- 保留旧 `.opencode/orchestrator/active.json` 兼容输出，但补充 `kernel_run_id`，形成“双写兼容层”。
- `scripts/orchestrator-state.js clear` 现在会同时清理新的 kernel active-run 指针，避免旧状态已清但新内核仍残留 active index。
- 新增回归测试：
  - `tests/orchestrator-kernel-batch1.test.js`
    - 验证 implementation plan 会写入统一 kernel run
    - 验证 legacy state 与 recovery 输出都能暴露 `kernel_run_id`

验收结果：

- `node --test tests/orchestrator-kernel-batch1.test.js tests/project-profile.test.js` ✅
- `npm run typecheck` ✅（checked=126）

备注：

- 本批次仍然保留旧的 plan/coder/gate 文件格式，不做破坏式迁移。
- 真正的 step executor、workflow DSL、evidence gate 将在后续批次继续替换现有脚本式控制面。

## Batch 26.2 — 统一 Executor 内核（已完成）

目标：把分散在脚本中的命令执行入口收敛成统一 Executor，为后续 Workflow / Capability 收敛铺路。

已完成：

- 新增 `scripts/lib/kernel/executor.js`：统一提供受策略约束的命令执行内核。
  - `executeCommand()`：异步执行
  - `executeCommandSync()`：同步执行
  - 统一接入 `execution-policy` 做命令、参数、workdir、timeout 校验
  - 统一产出结构化结果：`status / exit_code / timed_out / stdout / stderr / duration_ms`
  - 统一写入上下文文件与日志文件
  - 统一写入 kernel 事件：
    - `kernel.executor.started`
    - `kernel.executor.finished`
- `scripts/eoc-scheduler.js` 已改为通过内核 Executor 执行 task command / validation：
  - 保留旧 CLI 与 task schema
  - task context 仍写入原有目录，避免破坏旧恢复链路
  - command / validation 现在共享同一执行策略与日志模型
- `scripts/coder-loop.js` 已改为通过内核 Executor 执行 checks：
  - 不再直接 `spawnSync`
  - coder checks 现在进入统一 kernel 事件流
- 新增回归测试 `tests/executor-batch2.test.js`：
  - 覆盖 Executor sync / async 执行
  - 覆盖 scheduler 通过 Executor 跑 command + validation
  - 断言 kernel 事件与 task context 文件落盘

验收结果：

- `node --test tests/executor-batch2.test.js tests/orchestrator-kernel-batch1.test.js tests/project-profile.test.js` ✅
- `npm run typecheck` ✅（checked=128）
- `node scripts/run-tests.js` ✅

当前效果：

- 第二批之后，执行层已经不再是多个脚本各自直接 spawn 命令；
- 后续第三批可以开始把 agent / skill / script 收敛成统一 capability contract，而不用再回头处理命令执行语义不一致的问题。

## Batch 26.3 — 统一 Capability Registry（已完成）

目标：把分散的 agent / skill / script 定义收口成统一 Capability Registry，为后续 Workflow Engine 与 capability contract 铺路。

已完成：

- 新增 `scripts/lib/capability-registry.js`：统一生成 capability registry。
  - 索引 `opencode.json` 中的 `agent`
  - 索引 `skills/` 中的 skills manifest
  - 索引 `scripts/` 中的顶层可执行脚本
  - 统一产出：
    - `id`
    - `source_type`（agent / skill / script）
    - `kind`（planner / implementer / reviewer / verifier / releaser / transformer / general）
    - `execution_mode`（agent / hybrid / script / document）
    - `entrypoint`
    - `aliases`
- 新增 `scripts/capability-registry.js`：可直接生成/检查统一 capability registry。
- `scripts/skill-registry.js` 已接入 capability registry：
  - 保留原有 `skills/registry.json` 兼容输出
  - 写 skill registry 时会同时输出 `capabilities/registry.json`
- `scripts/skill-runner.js` 已接入 capability registry：
  - `list` / `show` / `match` JSON 输出会带上 capability 元数据
  - 新增 `capabilities` 子命令，可直接列出统一 capability 目录
- `package.json` 新增：
  - `npm run capability:registry`
- 新增回归测试 `tests/capability-registry-batch3.test.js`：
  - 验证 agent / skill / script / command alias 都被统一索引
  - 验证 `skill-registry` 会同时生成 capability registry
  - 验证 `skill-runner` 暴露 capability 元数据与统一目录查询能力

验收结果：

- `node --test tests/capability-registry-batch3.test.js tests/executor-batch2.test.js tests/orchestrator-kernel-batch1.test.js tests/project-profile.test.js` ✅
- `npm run typecheck` ✅（checked=131）

当前效果：

- 第三批之后，系统里已经不再只有“skill registry”；
- agent / skill / script / command alias 已经进入同一份 capability 目录；
- 第四批可以直接开始把 `implement-task` / `coder-loop` / `eoc-ultrawork` 抽成声明式 workflow，而不用再自己维护散乱的能力发现逻辑。

## Batch 26.4 — Workflow Engine 与主流程收敛（已完成）

目标：把 `implement-task` / `eoc-ultrawork` 从脚本硬编码流程收敛成可组合、可追踪的 Workflow Engine，并保留旧 CLI 入口兼容。

已完成：

- 新增 `scripts/lib/workflow-engine.js`：统一 Workflow Engine。
  - `defineWorkflow()`：声明 workflow 与 step graph
  - `executeWorkflow()`：按步骤执行，支持 `when()` 条件跳过
  - 自动落盘 workflow trace 到 `.opencode/workflows/<workflow>/<trace>.json`
  - 自动写入 kernel 事件：
    - `workflow.started`
    - `workflow.step.started`
    - `workflow.step.skipped`
    - `workflow.step.completed`
    - `workflow.step.failed`
    - `workflow.completed`
- 新增 `scripts/lib/workflows/implement-task-workflow.js`：
  - 把 `implement-task` 主路径拆成显式步骤：
    - detect-project-profile
    - select-skill
    - assess-benchmark-feedback
    - create-snapshot
    - run-scaffold
    - create-coder-run
    - execute-validation-round
    - write-plan-artifacts
- 新增 `scripts/lib/workflows/eoc-ultrawork-workflow.js`：
  - 把 `eoc-ultrawork` 主路径拆成显式 gate steps：
    - bridge-run
    - scheduler
    - gate-0-1
    - gate-1-2
    - gate-2-3
    - gate-3-4
    - gate-4-5
    - gate-5-6
- `scripts/implement-task.js` 已改为通过 Workflow Engine 执行：
  - 保留旧 CLI 参数与 plan 输出结构
  - 新增 `plan.workflow.workflow_id` 与 `plan.workflow.trace_id`
  - 生成的 implementation plan 可直接追溯对应 workflow trace
- `scripts/eoc-ultrawork.js` 已改为通过 Workflow Engine 执行：
  - 保留旧入口和证据校验逻辑
  - gate 推进过程进入 workflow trace 与 kernel 事件流
- 新增回归测试 `tests/workflow-engine-batch4.test.js`：
  - 覆盖通用 workflow trace 落盘
  - 覆盖 `implement-task` 产出 workflow 元数据与 trace 文件
  - 覆盖 workflow descriptor 暴露关键 step graph

验收结果：

- `node --test tests/workflow-engine-batch4.test.js tests/capability-registry-batch3.test.js tests/executor-batch2.test.js tests/orchestrator-kernel-batch1.test.js tests/project-profile.test.js` ✅
- `npm run typecheck` ✅（checked=135）

当前效果：

- 第四批之后，核心流程已经不再只是脚本内部顺序调用；
- `implement-task` 和 `eoc-ultrawork` 已具备可声明、可追踪、可落盘的 step graph；
- 后续第五批可以直接在 workflow trace 基础上接入 evidence-based gate，而不用再从脚本里反推流程状态。


## Batch 26-5: Evidence-based Gate System

Implemented a shared evidence model and gate evaluation layer, then wired the existing gate commands into it without breaking legacy outputs.

### Added
- `scripts/lib/evidence-store.js`
  - stable evidence digest generation
  - `createEvidence()` and `summarizeEvidence()` helpers
- `scripts/lib/gate-system.js`
  - generic rule-based gate evaluator
  - structured gate decisions with matched evidence ids
- `tests/evidence-gate-batch5.test.js`

### Changed
- `scripts/quality-gate.js`
  - now emits `evidence_bundle` with structured quality evidence and a gate evaluation
- `scripts/review-gate.js`
  - now emits `evidence_bundle` with quality / benchmark / git-scope evidence and a merge gate evaluation
- `scripts/lib/release-evidence.js`
  - now emits `evidence_bundle` for release state, baseline, rehearsal, overrides, and observability evidence
- `scripts/lib/policy-overrides.js`
  - made request/approval timestamps deterministic when `--now` is supplied
  - preserved compatibility for override application and audit-trail tests under current-date execution

### Validation
- `npm run typecheck`
- `node --test tests/evidence-gate-batch5.test.js tests/workflow-engine-batch4.test.js tests/capability-registry-batch3.test.js tests/executor-batch2.test.js tests/orchestrator-kernel-batch1.test.js tests/project-profile.test.js tests/quality-review-gate.test.js tests/release-evidence-overrides.test.js tests/release-override-constraints.test.js`

## Batch 26.6 — 平台化 API 数据面与审计对象层（已完成）

目标：把现有运行内核、workflow trace、evidence gate、release audit 从“脚本输出”升级成适合产品化平台消费的 API 对象模型，便于后续接 UI 与外部 API。

已完成：

- 新增平台对象模型目录：
  - `scripts/lib/platform/api-models.js`
  - `scripts/lib/platform/release-registry.js`
  - `scripts/lib/platform/telemetry-registry.js`
- 新增统一平台导出入口：
  - `scripts/platform-report.js`
  - `commands/platform-report.md`
  - `npm run platform:report`
- 新增 API-first 平台快照 `platform_api_snapshot`：
  - `runs`：统一 run summary 列表
  - `active_run`：当前活跃 run 的平台视图
  - `run_timelines`：聚合 kernel event / workflow trace / observability event 的时间线视图
  - `artifact_index`：平台级产物索引
  - `release`：统一 release record + decision package + audit trail
  - `telemetry`：平台级遥测摘要
- 新增 `platform_run_summary` / `platform_run_timeline` / `platform_artifact_index` / `platform_release_record` / `platform_release_decision_package` / `platform_telemetry_summary` 等稳定 schema。
- 新增 telemetry exporter registry：
  - `platform-json`
  - `ui-overview`
  - 后续可继续按注册方式扩展为 dashboard card / webhook / API adapter。
- Release 审计对象层升级：
  - 把 `release-check` / `release-evidence` / `rehearsal` / `baseline` / `approval` / `overrides` 收口为 `platform_release_record`
  - 附带 `decision_package` 与 `audit_trail`
  - 直接适合前端详情页或 API 返回体消费
- 新增回归测试：
  - `tests/platform-api-batch6.test.js`
    - 验证平台快照包含 runs / release / telemetry / artifacts
    - 验证 CLI 可导出 exporter 清单与 UI overview payload

验收结果：

- `node --test tests/platform-api-batch6.test.js` ✅
- `npm run typecheck` ✅
- 平台快照与 UI overview 可直接作为管理后台或外部 API 的输入 ✅

## Batch 26.6 — Feature feedback 回灌与脚本感知 verify（已完成）

目标：把第五批落下的 failure pattern 从“仅记录”升级成“会影响下一次 feature 生成与 verify 策略”的反馈回路。

已完成：

- 新增 `scripts/lib/feature-feedback.js`：
  - 根据 `project-memory.failure_patterns` 生成 `safe_mode / import_repair_bias / verify_bias`；
  - 根据项目真实 `package.json#scripts` 推断 feature verify 命令；
  - 当 `build/test` 脚本不存在时，自动跳过不适用的 verify；
  - 对 `node:test` 项目支持最小回退到 `node --test`。
- `skill-runner` 的 `feature_bundle` 已切换到 script-aware verify：
  - 结果中的 `verify` 不再机械固定为 `npm run build` + `npm test`；
  - 新增 `feature_feedback` 输出，暴露 verify 选择理由与历史 failure 计数。
- `generate-feature` 已注入反馈变量：
  - `project.generation_safe_mode`
  - `project.import_repair_bias`
  - `project.verify_bias`
- `debug-fix-loop` 新增 verify script 失败分类：
  - `missing-build-script`
  - `missing-test-script`
  - 当 verify 因缺失脚本失败时，会把失败模式写回 `.opencode/project-memory.json`。
- `generate-node-feature` 模板已显示反馈状态：
  - integration note 中新增 safe mode / import repair bias / verify bias；
  - API 文档中新增 verify bias。
- 新增回归测试：
  - `tests/feature-generator-batch6.test.js`
    - 验证根据项目脚本推断 verify
    - 验证 failure pattern 影响下一次生成结果
    - 验证缺失 build 脚本失败会被记录到 project memory

验收结果：

- `node --test tests/feature-generator-batch1.test.js ... tests/feature-generator-batch6.test.js` ✅（15/15）
- `npm run build` ✅
- `npm run lint` ✅

## Batch 26.6 — Feature planning feedback 反哺 feature plan（已完成）

目标：把第六批的 feedback 从“影响 verify 和提示”继续升级成“直接影响 feature plan 默认决策”，让历史失败和项目能力能够改变本次生成哪些模块、以及如何应用 integration updates。

已完成：

- `scripts/lib/feature-feedback.js` 新增 `derivePlanningHints()`：
  - 根据项目真实 `package.json#scripts` 与 `project-memory.failure_patterns` 生成 planning feedback；
  - 当项目没有可运行的 test 脚本时，默认关闭 `test` 模块；
  - 当 safe mode 激活时，默认把 integration mode 从 `apply` 切到 `plan`；
  - 支持显式用户参数覆盖默认 planning 决策。
- `generate-feature` 与 `skill-runner` 已接入 planning feedback：
  - 新增 `feature_planning` 输出；
  - 注入 `project.plan_mode / project.verify_preference / project.plan_with_* / project.plan_adjustment_reasons`；
  - 若用户未显式指定 `with_test/with_docs/with_repository`，则使用 planning feedback 的默认值。
- `feature-plan` 已开始暴露规划级模板变量：
  - `generated_files_list`
  - `enabled_modules`
- `generate-node-feature` 模板已显示 planning feedback：
  - integration note 中新增 plan mode / verify preference / 规划后的模块开关 / adjustment reasons / enabled modules；
  - API 文档中新增 plan mode / verify preference。
- 新增回归测试：
  - `tests/feature-generator-batch7.test.js`
    - 验证无 test 脚本时默认关闭 test 模块
    - 验证 safe mode 默认切到 integration plan
    - 验证显式 `--with-test true` 可以覆盖 planning 默认值

验收结果：

- `node --test tests/feature-generator-batch1.test.js ... tests/feature-generator-batch7.test.js` ✅
- `npm run build` ✅
- `npm run lint` ✅


## Batch 9
- pushed validation, API style, and auth strategy into generated template content
- added zod-aware schema generation and api/auth-aware route generation
- covered new memory-driven output behavior with batch9 tests

## Batch 10
- Push `orm`, `error_pattern`, and `test_framework` into generated code content.
- Add repository-style-aware persistence stubs, typed-error-aware service/route handling, and framework-aware test templates.
- Extend feature planning feedback to emit repository, error, and test template styles.


## Batch 11
- Added framework-aware verify command selection for vitest/jest/mocha-oriented projects.
- Reused shared AppError-style modules when typed error handling is enabled.
- Surfaced shared error integration and framework-aware verify preference in generated docs.


## Batch 12
- Added global error middleware detection and surfaced it in project memory and integration docs.
- Persisted preferred test command after successful feature generation.
- Extended debug/fix loop to recover missing test scripts with framework-aware fallback verify commands.


## Batch 13
- Added app entrypoint detection and surfaced whether the global error handler is registered in an application entry file.
- Persisted multi-mode preferred test commands for default, CI, watch, and coverage flows.
- Extended verify/fix recovery to normalize watch-oriented verification into CI-safe commands when needed.

## Batch 10 — quarantine burndown wave 3 (in progress, strict-safe removals)

Goal: keep burning down explicit quarantine after full-src accountability, focusing on low-to-medium complexity utility and feature modules.

Completed in this batch:

- Strict-safe and removed from quarantine:
  - `src/core/code-primitives.js`
  - `src/core/feature/plan.js`
  - `src/core/feature/acceptance.js`
  - `src/core/feature/delivery.js`
  - `src/core/feature-acceptance.js`
  - `src/core/feature-delivery.js`
  - `src/core/refactor/providers/indexed-utils.js`
  - `src/core/skills/scaffold/naming.js`
- Tightened type contracts for:
  - primitive registry / alias resolution
  - feature delivery and acceptance summaries
  - feature planning inputs and generated path metadata
  - identifier span utilities
  - scaffold naming and placeholder expansion
- Re-synced `typecheck.quarantine.json` to the actual `@ts-nocheck` markers.
- Updated burndown regression coverage:
  - relaxed batch9 assertions to continuous-improvement thresholds
  - added `tests/typecheck-burndown-batch10.test.js`

Current result:

- `strict_checked`: 115 → 123
- `quarantined`: 78 → 70
- `total_src_files`: 193

Note:

- This still does **not** complete the entire quarantine burn-down series.
- Remaining work is concentrated in CLI, scheduler/kernel, benchmark, project memory, and refactor/provider modules.


## Batch 11 — quarantine burndown wave 4 (focused strict-safe fixes)

Goal: keep shrinking explicit quarantine by landing small, real strict-safe fixes instead of relying on broad marker removal.

Completed in this batch:

- Strict-safe and removed from quarantine:
  - `src/control-plane/scheduler/scheduler-service.js`
  - `src/core/checks/validation-bridges.js`
  - `src/core/delivery/advice.js`
- Tightened type contracts for:
  - scheduler run/task dependency shapes and active-task bookkeeping
  - validation bridge optional metadata payloads under `exactOptionalPropertyTypes`
  - delivery advice input structures for coder-loop, review-gate, and risk posture signals
- Re-synced `typecheck.quarantine.json` to the actual `@ts-nocheck` markers.
- Added `tests/typecheck-burndown-batch11.test.js`.

Current result:

- `strict_checked`: 123 → 126
- `quarantined`: 70 → 67
- `total_src_files`: 193

Note:

- This still does **not** complete the entire quarantine burn-down series.
- The remaining work is concentrated in larger CLI, benchmark, project-memory, and refactor/provider modules.


## Batch 12 — quarantine burndown wave 5 (benchmark + provider + rehearsal)

Goal: keep shrinking explicit quarantine by converting a few medium-complexity utility modules to real strict-safe JSDoc contracts.

Completed in this batch:

- Strict-safe and removed from quarantine:
  - `src/core/benchmark/baseline-approvals.js`
  - `src/core/benchmark/baselines.js`
  - `src/core/feature/providers.js`
  - `src/core/release/rehearsal.js`
- Tightened type contracts for:
  - benchmark baseline selection, summary shaping, and approval status payloads
  - feature provider scoring, support summaries, and skill-backed provider metadata
  - release rehearsal workspace cloning, sandbox git initialization, and report persistence
- Re-synced `typecheck.quarantine.json` to the actual `@ts-nocheck` markers.
- Added `tests/typecheck-burndown-batch12.test.js`.

Current result:

- `strict_checked`: 126 → 130
- `quarantined`: 67 → 63
- `total_src_files`: 193

Note:

- This still does **not** complete the entire quarantine burn-down series.
- The remaining work is concentrated in larger CLI, benchmark-analysis, project-memory, quality-gate, and refactor/provider modules.

## Batch 13 — quarantine burndown wave 6 (planning + semantics utilities)

Goal: keep shrinking explicit quarantine by converting another low-to-medium complexity utility wave to real strict-safe JSDoc contracts.

Completed in this batch:

- Strict-safe and removed from quarantine:
  - `src/core/feature/intelligence.js`
  - `src/core/implementation/edit-engine.js`
  - `src/core/implementation/skill-selection.js`
  - `src/core/project/structure.js`
- Tightened type contracts for:
  - feature semantic inference inputs and policy outputs
  - edit-strategy selection, patch-footprint evaluation, and patch-guard decisions
  - skill-selection filtering, evaluated candidate ranking, and optional report selection payloads
  - project-structure path generation and persisted structure read/write helpers
- Re-synced `typecheck.quarantine.json` to the actual `@ts-nocheck` markers.
- Added `tests/typecheck-burndown-batch13.test.js`.

Current result:

- `strict_checked`: 130 → 134
- `quarantined`: 63 → 59
- `total_src_files`: 193

Note:

- This still does **not** complete the entire quarantine burn-down series.
- The remaining work is concentrated in larger CLI, benchmark-analysis, kernel/scheduler, project-memory, and refactor/provider modules.


## Batch 14 — quarantine burndown wave 7 (workflow + scheduler + platform helpers)

Goal: accelerate quarantine burn-down by converting a small but meaningful group of control-plane helper modules to real strict-safe JSDoc contracts, while re-aligning the quarantine manifest to actual markers.

Completed in this batch:

- Strict-safe and removed from quarantine:
  - `src/control-plane/platform/api-models.js`
  - `src/control-plane/scheduler/task-executor.js`
  - `src/control-plane/workflows/implement-task.js`
- Tightened type contracts for:
  - platform run-summary/timeline/artifact-index payload shaping and status summarization
  - scheduler command execution context, nullable run IDs, retry accounting, and shell result propagation
  - implementation workflow step context casting and selected-skill/selection metadata access
- Re-synced `typecheck.quarantine.json` to the actual `@ts-nocheck` markers.
- Added `tests/typecheck-burndown-batch14.test.js`.

Current result:

- `strict_checked`: 134 → 137
- `quarantined`: 59 → 56
- `total_src_files`: 193

Note:

- This still does **not** complete the entire quarantine burn-down series.
- The remaining work is concentrated in larger CLI, benchmark, project-memory, quality-gate, and refactor/provider modules.

## Batch 15 — quarantine burndown wave 8 (benchmark analysis + runtime core)

Goal: keep shrinking explicit quarantine by converting benchmark core helpers to real strict-safe JSDoc contracts, while repairing quarantine-marker drift so the manifest remains trustworthy.

Completed in this batch:

- Strict-safe and removed from quarantine:
  - `src/core/benchmark/analysis.js`
  - `src/core/benchmark/suite-runtime.js`
- Tightened type contracts for:
  - benchmark result indexing, summary aggregation, and comparison deltas
  - benchmark suite run/result objects, case evaluation checks, and persisted run summaries
- Re-synced `typecheck.quarantine.json` to the actual `@ts-nocheck` markers.
- Restored missing quarantine markers on:
  - `src/core/feature/plan-shared.js`
  - `src/core/gates/review-helpers.js`
  - `src/core/implementation/context.js`
- Added `tests/typecheck-burndown-batch15.test.js`.

Current result:

- `strict_checked`: 137 → 139
- `quarantined`: 56 → 54
- `total_src_files`: 193

Note:

- This still does **not** complete the entire quarantine burn-down series.
- The remaining work is concentrated in larger CLI, feature-planning, review-helper, project-memory, and refactor/provider modules.


## Batch 16 — quarantine burndown wave 9 (已完成)

已完成：

- 将以下文件提升为 strict-safe，并移出 quarantine：
  - `src/control-plane/scheduler/task-graph.js`
  - `src/core/implementation/coder-policy.js`
  - `src/core/feature/feedback.js`
  - `src/core/quality-gate.js`
  - `src/core/quality/skill-metadata.js`
  - `src/core/release/policy-overrides.js`
- 清理两个 stale quarantine 项并恢复为显式 strict-safe：
  - `src/core/benchmark/analysis.js`
  - `src/core/benchmark/suite-runtime.js`
- 修复 `release/policy-overrides` 中的时间基准与写文件换行问题。
- 为 `task-graph` 补充调度任务与执行策略类型契约，并与 `scheduler-service` 对齐。
- 为 `feature/feedback`、`quality-gate`、`skill-metadata` 补齐更严格的 JSDoc 收口。
- 新增回归测试：`tests/typecheck-burndown-batch16.test.js`。

验收结果：

- `npm run lint` ✅
- `npm run build` ✅
- `npm run typecheck` ✅（checked=145, quarantined=48）
- `npm run quality-gate:json` ✅
## Batch 17
- Restored a green typecheck baseline by making `src/cli/eoc-scheduler-cli.js`, `src/core/project/git-state.js`, and `src/core/project/memory-history.js` strict-safe.
- Removed stale quarantine manifest entries for those files and added `tests/typecheck-burndown-batch17.test.js`.
- Current typecheck report: `strict_checked=148`, `quarantined=45`, `total_src_files=193`.


## Batch 19 — quarantine drift repair + support registry strict-safe (已完成)

已完成：

- 将以下文件提升为 strict-safe，并移出 quarantine：
  - `src/core/support-tiers/report.js`
  - `src/core/capabilities/registry.js`
- 修复当前包中的 quarantine drift：为仍在 quarantine 中的 CLI / kernel / policy / refactor 大文件恢复 `@ts-nocheck`，并处理 shebang 场景，确保 manifest 与源码标记重新一致。
- 新增回归测试：`tests/typecheck-burndown-batch19.test.js`。

验收结果：

- `npm run lint` ✅
- `npm run build` ✅
- `npm run typecheck` ✅（checked=153, quarantined=40）
- `npm run quality-gate:json` ✅

## Batch 20 — policy/semantic-index/skills-manifest strict-safe (已完成)

已完成：

- 将以下文件提升为 strict-safe，并移出 quarantine：
  - `src/control-plane/policy/execution-policy.js`
  - `src/core/implementation/semantic-index.js`
  - `src/core/skills/manifest.js`
- 修复并显式保留仍应隔离的漂移文件：
  - `src/cli/eoc-start-cli.js`
  - `src/core/release/check.js`
- 新增回归测试：`tests/typecheck-burndown-batch20.test.js`。

验收结果：

- `npm run lint` ✅
- `npm run build` ✅
- `npm run typecheck` ✅（checked=156, quarantined=37）
- `npm run quality-gate:json` ✅

## Batch 21
- made `src/core/implementation/code-intelligence.js` strict-safe and removed it from quarantine
- made `src/core/implementation/context.js` strict-safe and removed it from quarantine
- restored `@ts-nocheck` drift for `src/control-plane/kernel/orchestrator-kernel.js`
- restored `@ts-nocheck` drift for `src/control-plane/orchestrator/memory.js`
- added `tests/typecheck-burndown-batch21.test.js`

## Batch 22
- Made `src/cli/eoc-bridge-cli.js` strict-safe by adding explicit CLI/task/run JSDoc contracts and tightening option parsing.
- Made `src/cli/eoc-start-cli.js` strict-safe by adding gate/run typedefs and typed CLI state transitions.
- Restored quarantine baseline consistency for `src/control-plane/kernel/executor.js` and `src/core/release/evidence.js`.
- Updated `typecheck.quarantine.json` and added `tests/typecheck-burndown-batch22.test.js`.

## Batch 23
- Made `src/control-plane/kernel/executor.js` strict-safe with explicit execution option/result typedefs and exact-optional-safe policy normalization.
- Made `src/control-plane/orchestrator/memory.js` strict-safe with typed state/run records and recovery-command bookkeeping.
- Repaired a real quarantine drift by restoring `// @ts-nocheck` on `src/cli/install-cli.js`.
- Updated `typecheck.quarantine.json` and added `tests/typecheck-burndown-batch23.test.js`.

## Batch 24
- repaired quarantine drift in five files that had lost `// @ts-nocheck` while still remaining in the quarantine manifest
- made `src/cli/benchmark-suite-cli.js` strict-safe by adding typed CLI flag coercion helpers and exact-optional-safe option builders
- made `src/cli/uninstall-cli.js` strict-safe with explicit JSDoc contracts and cleaned duplicate nocheck markers
- updated `typecheck.quarantine.json`
- added `tests/typecheck-burndown-batch24.test.js`

## Batch 25
- made `src/core/feature/bundle.js` strict-safe by adding explicit feature bundle/output contracts and exact-optional-safe result shaping
- made `src/core/feature/plan-shared.js` strict-safe with typed shared feature vars, paths, and POSIX path helpers
- restored quarantine marker drift for `src/cli/install-cli.js`, `src/control-plane/kernel/orchestrator-kernel.js`, `src/core/benchmark/suite-helpers.js`, and `src/core/release/check.js`
- updated `typecheck.quarantine.json`
- added `tests/typecheck-burndown-batch25.test.js`

## Batch 26
- made `src/cli/coder-loop-cli.js` strict-safe with typed loop/round/check state and patch-evaluation narrowing
- made `src/cli/implement-task-cli.js` strict-safe by typing workflow context, scaffold outputs, and plan persistence edges
- made `src/control-plane/kernel/orchestrator-kernel.js` strict-safe with explicit run registration/store contracts
- updated `typecheck.quarantine.json`
- added `tests/typecheck-burndown-batch26.test.js`

## Batch 27
- made `src/cli/install-cli.js` strict-safe with typed installer flags, asset-copy contracts, vendored dependency traversal, and safer config merge paths
- made `src/core/project/memory.js` strict-safe by codifying project-memory/app-entry/error-module shapes and exact-optional-safe persistence helpers
- made `src/core/refactor/providers/python.js` strict-safe with explicit provider payload/context/result typedefs and typed Python executable caching
- restored quarantine marker drift for `src/core/project/structure-analysis.js` and `src/core/release/check.js`
- updated `typecheck.quarantine.json`
- added `tests/typecheck-burndown-batch27.test.js`
