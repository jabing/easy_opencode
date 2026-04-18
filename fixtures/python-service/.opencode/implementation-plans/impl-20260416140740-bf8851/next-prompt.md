# Repair Brief

Objective: new model
Targets: app/models/invoice.py, app/admin/invoice_admin.py, tests/test_invoice_model.py, .opencode/task-bundles/invoice-model.integration.md

## Repo Context
- Runtime: python
- Language: python
- Framework: django
- Package manager: pip

## Coder Policy
- Strategy bias: balanced
- Context scope: narrow
- AST edit mode: surgical
- Target budget: 4
- Related test budget: 8

## Validation Commands
- test: python -m pytest -q
- build: python manage.py check

## Target Summaries
- app/models/invoice.py: exports=[] symbols=[Invoice] related_tests=[tests/test_invoice_model.py]
- app/admin/invoice_admin.py: exports=[] symbols=[InvoiceAdmin] related_tests=[]
- tests/test_invoice_model.py: exports=[] symbols=[test_invoice_string_representation] related_tests=[tests/test_invoice_model.py]
- .opencode/task-bundles/invoice-model.integration.md: exports=[] symbols=[] related_tests=[]

## Failures To Fix
- No current failures. Keep the diff minimal and rerun validation after edits.

## Patch Discipline
- Current patch verdict: accept
- Touched files: (none)
- File budget: 4
- Unrelated edit ratio: 0
- Recommended patch action: apply
- Patch gate: patch is within budget and aligned to the preferred edit surface

## Failure Strategy
- No failure strategy has been computed yet.

## Automatic Repair Executor
- Mode: assisted_apply
- Summary: Patch is narrow enough to continue with a targeted repair and focused verification.
- Inspect first: app/models/invoice.py, app/admin/invoice_admin.py, tests/test_invoice_model.py, .opencode/task-bundles/invoice-model.integration.md
- Focused verify: pytest tests/test_invoice_model.py | python -m pytest -q | python manage.py check
- Planned operations: apply_targeted_fix

## Guardrails
- Keep edits local to target files and directly related tests.
- Preferred edit files: tests/test_invoice_model.py, app/admin.py, app/admin/invoice_admin.py, app/models/__init__.py
- Prefer structure-aware edits where available over broad text replacements.
- In surgical mode, use AST edits with --edit-policy surgical and avoid workspace-wide renames unless forced.
- In narrow context mode, do not pull in omitted neighbors until the current failures prove they matter.
- After editing, rerun the coder loop and stop only when all checks are green.
