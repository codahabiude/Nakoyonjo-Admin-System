r"""Second pass: fix remaining dark mode issues."""
import re, os

BASE = '/home/z/my-project'

def fix(filepath):
    with open(filepath, 'r') as f:
        c = f.read()
    orig = c
    
    # 1. Fix duplicate dark: prefixes (e.g., dark:text-emerald-400 dark:text-emerald-300)
    # Keep only the first dark: variant for each property+color combo
    c = re.sub(r'dark:text-(\[\w-\]+)-(\d+) dark:text-\1-\d+', r'dark:text-\1-\2', c)
    
    # 2. Fix hover:bg-{color}-100 -> add dark variant
    c = re.sub(r'(?<!dark:)hover:bg-emerald-100', 'hover:bg-emerald-100 dark:hover:bg-emerald-900/60', c)
    c = re.sub(r'(?<!dark:)hover:bg-blue-100', 'hover:bg-blue-100 dark:hover:bg-blue-900/60', c)
    c = re.sub(r'(?<!dark:)hover:bg-amber-100', 'hover:bg-amber-100 dark:hover:bg-amber-900/60', c)
    c = re.sub(r'(?<!dark:)hover:bg-red-100', 'hover:bg-red-100 dark:hover:bg-red-900/60', c)
    
    # 3. Fix standalone bg-amber-100 (icon containers) - add dark variant
    # In DashboardView and ReportCardView
    c = re.sub(
        r'bg-amber-100(?! dark:bg-)(?!/)(?!.*text-amber)',
        'bg-amber-100 dark:bg-amber-900/50',
        c
    )
    
    # 4. Fix bg-sky-50 dark:bg-sky-950/50 -> sky doesn't have 950, use blue
    c = c.replace('dark:bg-sky-950/50', 'dark:bg-blue-950/50')
    c = c.replace('dark:bg-violet-950/50', 'dark:bg-violet-950/50')  # violet is fine
    
    # 5. Fix bg-emerald-100 text-emerald-600 dark:text-emerald-400 -> add bg dark
    # This is in StatCard icon class
    c = c.replace(
        'bg-emerald-100 text-emerald-600 dark:text-emerald-400',
        'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600 dark:text-emerald-400'
    )
    c = c.replace(
        'bg-sky-100 text-sky-600 dark:text-sky-400',
        'bg-sky-100 dark:bg-blue-900/50 text-sky-600 dark:text-blue-400'
    )
    c = c.replace(
        'bg-violet-100 text-violet-600 dark:text-violet-400',
        'bg-violet-100 dark:bg-violet-900/50 text-violet-600 dark:text-violet-400'
    )
    c = c.replace(
        'bg-amber-100 text-amber-600 dark:text-amber-400',
        'bg-amber-100 dark:bg-amber-900/50 text-amber-600 dark:text-amber-400'
    )
    
    # 6. Fix bg-red-50/50 dark:bg-red-950/50 -> too bright in dark, use /30
    c = c.replace('dark:bg-red-950/50', 'dark:bg-red-950/30')
    c = c.replace('dark:bg-amber-950/50', 'dark:bg-amber-950/30')
    
    # 7. Fix hover:bg-amber-50 -> add dark variant
    c = re.sub(r'(?<!dark:)hover:bg-amber-50(?!/)', 'hover:bg-amber-50 dark:hover:bg-amber-950/50', c)
    
    # 8. Fix border-emerald-200/60 dark:border-emerald-800/40
    # The /60 was in the border opacity
    
    # 9. bg-emerald-50/50 dark:bg-emerald-950/50 -> fix to /30 for subtlety
    c = c.replace('dark:bg-emerald-950/50', 'dark:bg-emerald-950/30')
    
    # CLEANUP
    c = re.sub(r'dark:dark:', 'dark:', c)
    
    if c != orig:
        with open(filepath, 'w') as f:
            f.write(c)
        return True
    return False

files = [
    'src/components/app/DashboardView.tsx',
    'src/components/app/ExamsView.tsx',
    'src/components/app/AttendanceView.tsx',
    'src/components/app/ReportCardView.tsx',
    'src/components/app/PerformanceReportsView.tsx',
    'src/components/app/GradingSystemView.tsx',
    'src/components/app/MarksEntryView.tsx',
    'src/components/app/ParentPortalView.tsx',
    'src/components/app/TeacherProfileView.tsx',
]

for f in files:
    full = os.path.join(BASE, f)
    if os.path.exists(full):
        if fix(full):
            print(f'  Fixed: {f}')
        else:
            print(f'  No change: {f}')
