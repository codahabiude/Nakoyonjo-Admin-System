"""Global cleanup: duplicate dark: classes, remaining light-only issues, invalid /300 opacities."""
import re
import glob

files = glob.glob("/home/z/my-project/src/components/app/*.tsx") + glob.glob("/home/z/my-project/src/components/ui/*.tsx")

dup_patterns = [
    (r"dark:text-amber-400 dark:text-amber-300", "dark:text-amber-300"),
    (r"dark:text-emerald-400 dark:text-emerald-300", "dark:text-emerald-300"),
    (r"dark:text-blue-400 dark:text-blue-300", "dark:text-blue-300"),
    (r"dark:text-amber-500 dark:text-amber-300", "dark:text-amber-300"),
]

total = 0
for path in files:
    with open(path) as f:
        src = f.read()
    orig = src
    for pat, rep in dup_patterns:
        src = re.sub(pat, rep, src)
    if src != orig:
        with open(path, "w") as f:
            f.write(src)
        n = sum(1 for p, _ in dup_patterns if re.search(p, orig))
        print(f"DEDUPED {path.split('/')[-1]}: {n} pattern groups")
        total += n

print(f"\nTotal duplicate groups removed: {total}")

# Check remaining invalid /300 opacity modifiers anywhere
print("\n--- Remaining /300 invalid opacities ---")
for path in glob.glob("/home/z/my-project/src/**/*.tsx", recursive=True):
    with open(path) as f:
        for i, line in enumerate(f, 1):
            if re.search(r"(dark:)?(bg|text|border|from|to)-[a-z]+-\d+/300", line):
                print(f"{path.split('/')[-1]}:{i}: {line.strip()[:120]}")

# Check remaining bare (no dark:) light backgrounds in app views
print("\n--- Light bg without dark: variant on same line (app views) ---")
light_bg = re.compile(r"\b(bg-(white|gray-50|gray-100|emerald-50|amber-50|blue-50|red-50|orange-50|sky-50|violet-50|purple-50|emerald-100|amber-100|blue-100|red-100|gray-200))\b")
for path in glob.glob("/home/z/my-project/src/components/app/*.tsx"):
    with open(path) as f:
        for i, line in enumerate(f, 1):
            if "print" in path.lower():
                continue
            m = light_bg.search(line)
            if m and "dark:" not in line and "hover:bg" not in line:
                print(f"{path.split('/')[-1]}:{i}: {line.strip()[:130]}")
