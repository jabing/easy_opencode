# UI UX Review Command

Run a professional UI/UX review for:
$ARGUMENTS

## Objective

Identify high-impact UX friction, visual hierarchy issues, and interaction risks, then provide prioritized, implementation-ready fixes.

## Review Dimensions

1. Information architecture and task clarity
2. Interaction flow and state completeness
3. Visual hierarchy and consistency
4. Accessibility and keyboard/focus behavior
5. Responsiveness and performance perception

## Required Output

### 1. Scope Summary
### 2. Findings (P0/P1/P2)
### 3. Recommended Redesign Actions
### 4. Validation Checklist
### 5. Risks / Tradeoffs

## Constraint

Do not return abstract style advice only. Every finding must include an actionable change.

## Optional Evidence Pipeline (Recommended)

```bash
# 1) Generate full design-system recommendation
python3 skills/ui-ux-pro-max/scripts/search.py "your product and UX goals" --design-system -p "Project Name"

# 2) Deep-dive a specific domain
python3 skills/ui-ux-pro-max/scripts/search.py "accessibility keyboard focus" --domain ux

# 3) Stack-specific guidance (example: vue)
python3 skills/ui-ux-pro-max/scripts/search.py "dashboard state management and rendering" --stack vue
```
