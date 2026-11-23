r"""
Fix hardcoded light-mode colors across all view components for dark mode support.

This script applies systematic replacements:
1. bg-white -> bg-card (most common card/row background)
2. bg-{color}-50/{opacity} -> dark-aware variants
3. bg-{color}-100 text-{color}-700/800 badges -> dark-aware badge variants
4. text-{color}-600/700/800 -> dark:text-{color}-400/300
5. border-{color}-200 -> dark-aware borders
6. StatCard colorMap gets full dark mode variants
"""
import re
import os

FILES = [
    "src/components/app/DashboardView.tsx",
    "src/components/app/ExamsView.tsx",
    "src/components/app/AttendanceView.tsx",
    "src/components/app/ReportCardView.tsx",
    "src/components/app/PerformanceReportsView.tsx",
    "src/components/app/GradingSystemView.tsx",
    "src/components/app/MarksEntryView.tsx",
    "src/components/app/ParentPortalView.tsx",
]

BASE = "/home/z/my-project"

# Color mapping: light-class -> dark-class for bg/border
COLOR_MAP = {
    "emerald": "emerald",
    "blue": "blue",
    "sky": "blue",  # sky maps to blue for simplicity
    "amber": "amber",
    "red": "red",
    "violet": "violet",
}

def fix_file(filepath):
    with open(filepath, 'r') as f:
        content = f.read()
    
    original = content
    
    # === 1. bg-white -> bg-card ===
    content = re.sub(
        r'bg-white(?!/)',
        'bg-card',
        content
    )
    
    # === 2. Badge-style patterns: bg-{color}-100 text-{color}-{700|800} ===
    # Pattern like: bg-emerald-100 text-emerald-700
    # Also handle hover variants like: hover:bg-emerald-100
    for color in COLOR_MAP:
        # Badge pattern: bg-{color}-100 text-{color}-{7|8}00 hover:bg-{color}-100
        # These are inline badge classes that look washed out in dark mode
        content = re.sub(
            rf'bg-{color}-100 text-{color}-([78])00 hover:bg-{color}-100',
            f'bg-{color}-100 dark:bg-{color}-900/40 text-{color}-\g<1>00 dark:text-{color}-300 hover:bg-{color}-200/80 dark:hover:bg-{color}-900/60',
            content
        )
        # Badge pattern without hover: bg-{color}-100 text-{color}-{7|8}00
        content = re.sub(
            rf'bg-{color}-100 text-{color}-([78])00',
            f'bg-{color}-100 dark:bg-{color}-900/40 text-{color}-\g<1>00 dark:text-{color}-300',
            content
        )
    
    # === 3. bg-{color}-50/{opacity} backgrounds (card backgrounds, row highlights) ===
    # bg-amber-50/30 -> bg-amber-50/30 dark:bg-amber-950/30
    content = re.sub(
        r'bg-([a-z]+)-50/(\.?\d+)',
        r'bg-\1-50/\2 dark:bg-\1-950/\2',
        content
    )
    # bg-emerald-50 (no opacity) -> bg-emerald-50 dark:bg-emerald-950/50
    content = re.sub(
        r'(?<!dark:bg-)bg-([a-z]+)-50(?!/)',
        r'bg-\1-50 dark:bg-\1-950/50',
        content
    )
    
    # === 4. border-{color}-200/{opacity} -> add dark variant ===
    content = re.sub(
        r'(?<!dark:)border-([a-z]+)-200(/[^\s"]*)?',
        lambda m: f'border-{m.group(1)}-200{m.group(2) or ""} dark:border-{m.group(1)}-800/40',
        content
    )
    
    # === 5. text-{color}-700/800 standalone (not part of badge) ===
    # Only match when NOT already preceded by dark: and NOT in a badge context
    for color in COLOR_MAP:
        # text-{color}-700 that's standalone (not in badge bg..text pattern)
        # We need to add dark:text-{color}-400
        # Be careful not to double-add
        content = re.sub(
            rf'(?<!dark:)text-{color}-700',
            f'text-{color}-700 dark:text-{color}-400',
            content
        )
        content = re.sub(
            rf'(?<!dark:)text-{color}-800',
            f'text-{color}-800 dark:text-{color}-300',
            content
        )
        content = re.sub(
            rf'(?<!dark:)text-{color}-600',
            f'text-{color}-600 dark:text-{color}-400',
            content
        )
    
    # === 6. Special: bg-emerald-50 text-emerald-700 border-emerald-200 ===
    # (attendance button inactive state)
    # Already covered by rules above, but let's also handle specific compound patterns
    
    # === 7. bg-blue-50 border-blue-200/60 -> add dark variants ===
    # Already covered by rules 3 and 4
    
    # === 8. StatCard colorMap in DashboardView.tsx ===
    # This is a special case - we need to handle the JS object
    if 'DashboardView' in filepath:
        statcard_fix = '''const colorMap: Record<string, { bg: string; text: string; icon: string }> = {
    emerald: { bg: "bg-emerald-50 dark:bg-emerald-950/50", text: "text-emerald-700 dark:text-emerald-400", icon: "bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600 dark:text-emerald-400" },
    blue: { bg: "bg-sky-50 dark:bg-blue-950/50", text: "text-sky-700 dark:text-blue-400", icon: "bg-sky-100 dark:bg-blue-900/50 text-sky-600 dark:text-blue-400" },
    violet: { bg: "bg-violet-50 dark:bg-violet-950/50", text: "text-violet-700 dark:text-violet-400", icon: "bg-violet-100 dark:bg-violet-900/50 text-violet-600 dark:text-violet-400" },
    amber: { bg: "bg-amber-50 dark:bg-amber-950/50", text: "text-amber-700 dark:text-amber-400", icon: "bg-amber-100 dark:bg-amber-900/50 text-amber-600 dark:text-amber-400" },
  };'''
        # Match the colorMap definition
        pattern = r'const colorMap: Record<string, \{ bg: string; text: string; icon: string \}> = \{[^}]+\};'
        content = re.sub(pattern, statcard_fix, content, flags=re.DOTALL)
    
    # === 9. CBC_COLORS in GradingSystemView.tsx ===
    if 'GradingSystemView' in filepath:
        cbc_fix = '''const CBC_COLORS: Record<string, string> = {
  EE: "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-300",
  ME: "bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300",
  AE: "bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300",
  BE: "bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-300",
};'''
        pattern = r'const CBC_COLORS: Record<string, string> = \{[^}]+\};'
        content = re.sub(pattern, cbc_fix, content, flags=re.DOTALL)
        
        # Also fix getCBCColor function returns
        content = re.sub(
            r'if \(first === "E"\) return "bg-emerald-100 text-emerald-800"',
            'if (first === "E") return "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-300"',
            content
        )
        content = re.sub(
            r'if \(first === "M"\) return "bg-blue-100 text-blue-800"',
            'if (first === "M") return "bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300"',
            content
        )
        content = re.sub(
            r'if \(first === "A"\) return "bg-amber-100 text-amber-800"',
            'if (first === "A") return "bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300"',
            content
        )
        content = re.sub(
            r'return "bg-red-100 text-red-800"',
            'return "bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-300"',
            content
        )
        
        # Fix the CBC reference card inline classes
        content = content.replace(
            '"bg-emerald-100 text-emerald-800"',
            '"bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-300"'
        )
        content = content.replace(
            '"bg-blue-100 text-blue-800"',
            '"bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300"'
        )
        content = content.replace(
            '"bg-amber-100 text-amber-800"',
            '"bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300"'
        )
        content = content.replace(
            '"bg-red-100 text-red-800"',
            '"bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-300"'
        )
    
    # === 10. getCbcGrade in MarksEntryView.tsx ===
    if 'MarksEntryView' in filepath:
        content = re.sub(
            r'return \{ grade: "EE", color: "bg-emerald-100 text-emerald-700" \}',
            'return { grade: "EE", color: "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300" }',
            content
        )
        content = re.sub(
            r'return \{ grade: "ME", color: "bg-blue-100 text-blue-700" \}',
            'return { grade: "ME", color: "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300" }',
            content
        )
        content = re.sub(
            r'return \{ grade: "AE", color: "bg-amber-100 text-amber-700" \}',
            'return { grade: "AE", color: "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300" }',
            content
        )
        content = re.sub(
            r'return \{ grade: "BE", color: "bg-red-100 text-red-700" \}',
            'return { grade: "BE", color: "bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300" }',
            content
        )
        
        # Fix text-emerald-600, text-amber-600, text-red-600 in avg column
        # These are conditional ternary and may already have been caught by rule 5
        
        # Fix bg-blue-50 border-blue-200/60 text-blue-800 status banner
        content = content.replace(
            '"bg-blue-50 border-blue-200/60 text-blue-800"',
            '"bg-blue-50 dark:bg-blue-950/50 border-blue-200/60 dark:border-blue-800/40 text-blue-800 dark:text-blue-300"'
        )
    
    # === 11. Fix specific attendance button patterns ===
    if 'AttendanceView' in filepath:
        # The P/A/L buttons have compound inactive/active classes
        # Inactive: bg-{color}-50 text-{color}-700 border-{color}-200 hover:bg-{color}-100
        # Active: bg-{color}-600 text-white border-{color}-600 hover:bg-{color}-700
        content = re.sub(
            r'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100',
            'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/40 hover:bg-emerald-100 dark:hover:bg-emerald-900/60',
            content
        )
        content = re.sub(
            r'bg-red-50 text-red-700 border-red-200 hover:bg-red-100',
            'bg-red-50 dark:bg-red-950/50 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800/40 hover:bg-red-100 dark:hover:bg-red-900/60',
            content
        )
        content = re.sub(
            r'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100',
            'bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800/40 hover:bg-amber-100 dark:hover:bg-amber-900/60',
            content
        )
        
        # Row highlights
        content = content.replace(
            '"bg-red-50/50"',
            '"bg-red-50/50 dark:bg-red-950/30"'
        )
        content = content.replace(
            '"bg-amber-50/50"',
            '"bg-amber-50/50 dark:bg-amber-950/30"'
        )
        
        # Badge in report: bg-amber-50 text-amber-700 border border-amber-200/60 hover:bg-amber-50
        content = re.sub(
            r'bg-amber-50 text-amber-700 border border-amber-200/60 hover:bg-amber-50',
            'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border border-amber-200/60 dark:border-amber-800/40 hover:bg-amber-50 dark:hover:bg-amber-950/60',
            content
        )
        content = re.sub(
            r'bg-red-50 text-red-700 border border-red-200/60 hover:bg-red-50',
            'bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-400 border border-red-200/60 dark:border-red-800/40 hover:bg-red-50 dark:hover:bg-red-950/60',
            content
        )
    
    # === 12. Fix PerformanceReportsView specific patterns ===
    if 'PerformanceReportsView' in filepath:
        # Grade color patterns
        pass  # Most caught by generic rules
    
    # === 13. Fix ReportCardView patterns ===
    if 'ReportCardView' in filepath:
        # Print template uses inline styles (hex colors) which are fine for print
        # But screen-displayed grades need dark variants
        pass  # Most caught by generic rules
    
    # === 14. Fix ParentPortalView patterns ===
    if 'ParentPortalView' in filepath:
        pass  # Most caught by generic rules
    
    # === 15. Fix ExamsView patterns ===
    if 'ExamsView' in filepath:
        pass  # Most caught by generic rules
    
    # === CLEANUP: Remove any double dark: prefixes ===
    content = re.sub(r'dark:dark:', 'dark:', content)
    
    if content != original:
        with open(filepath, 'w') as f:
            f.write(content)
        return True
    return False

# Process all files
changed = 0
for f in FILES:
    full = os.path.join(BASE, f)
    if os.path.exists(full):
        if fix_file(full):
            print(f"  ✓ Fixed: {f}")
            changed += 1
        else:
            print(f"  - No changes: {f}")
    else:
        print(f"  ! Not found: {f}")

print(f"\nTotal files modified: {changed}/{len(FILES)}")
