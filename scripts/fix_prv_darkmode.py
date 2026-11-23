"""Fix dark mode bugs in PerformanceReportsView.tsx"""
import re

PATH = "/home/z/my-project/src/components/app/PerformanceReportsView.tsx"
with open(PATH) as f:
    src = f.read()

orig = src

# 1. Chart grid lines: hardcoded light gray -> theme border color
src = src.replace('stroke="#e5e7eb"', 'stroke="var(--color-border)"')

# 2. Axis ticks: default #666 fill -> theme muted-foreground
src = src.replace(
    'tick={{ fontSize: 11 }}',
    'tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}'
)

# 3. Tooltips: add themed content/item/label styles to every <Tooltip
src = src.replace("<Tooltip ", "<Tooltip {...TOOLTIP_STYLE} ")

# 4. Add TOOLTIP_STYLE constant after CHART_COLORS
anchor = 'const CHART_COLORS = ["#2563EB", "#7C3AED", "#059669", "#D97706", "#DC2626", "#0891B2", "#C026D3", "#EA580C"];'
tooltip_const = anchor + '''

// Theme-aware Recharts tooltip styles (work in light + dark mode)
const TOOLTIP_STYLE = {
  contentStyle: {
    background: "var(--color-card)",
    border: "1px solid var(--color-border)",
    borderRadius: "8px",
    fontSize: "13px",
  },
  itemStyle: { color: "var(--color-foreground)" },
  labelStyle: { color: "var(--color-muted-foreground)" },
};'''
assert anchor in src, "CHART_COLORS anchor not found"
src = src.replace(anchor, tooltip_const, 1)

# 5. Text color dark variants
fixes = [
    ('<TrendingUp className="w-4 h-4 text-green-600" />',
     '<TrendingUp className="w-4 h-4 text-green-600 dark:text-green-400" />'),
    ('font-bold ${s.mean >= 50 ? "text-green-700" : "text-red-600 dark:text-red-400"}',
     'font-bold ${s.mean >= 50 ? "text-green-700 dark:text-green-400" : "text-red-600 dark:text-red-400"}'),
    ('font-bold text-purple-700',
     'font-bold text-purple-700 dark:text-purple-300'),
    ('text-center font-semibold text-green-700',
     'text-center font-semibold text-green-700 dark:text-green-400'),
    ('font-medium text-green-700',
     'font-medium text-green-700 dark:text-green-400'),
    ('text-xs text-purple-600 font-medium',
     'text-xs text-purple-600 dark:text-purple-400 font-medium'),
    ('text-2xl font-bold mt-1 text-green-700',
     'text-2xl font-bold mt-1 text-green-700 dark:text-green-400'),
    ('mark.marks >= 50 ? "text-green-700" : "text-red-600 dark:text-red-400"',
     'mark.marks >= 50 ? "text-green-700 dark:text-green-400" : "text-red-600 dark:text-red-400"'),
]
for old, new in fixes:
    if old in src:
        src = src.replace(old, new)
        print(f"FIXED: {old[:60]}")
    else:
        print(f"NOT FOUND (already fixed?): {old[:60]}")

with open(PATH, "w") as f:
    f.write(src)

print("\nGrid stroke replacements:", orig.count('stroke="#e5e7eb"'), "were present")
print("Tooltip spread applied:", src.count("{...TOOLTIP_STYLE}"))
print("Done.")
