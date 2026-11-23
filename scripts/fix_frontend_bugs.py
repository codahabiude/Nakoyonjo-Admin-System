"""Frontend crash-bug fixes: clipboard catch, res.ok guards, field fixes."""
import re

BASE = "/home/z/my-project/src/components/app/"

def patch(path, old, new, required=True, count=1):
    p = BASE + path
    with open(p) as f:
        src = f.read()
    if old not in src:
        print(f"MISSING in {path}: {old[:70]!r}")
        assert not required, f"Pattern not found in {path}"
        return
    src = src.replace(old, new, count)
    with open(p, "w") as f:
        f.write(src)
    print(f"OK {path}: {old[:60]!r}")

# 1. DashboardView — user?.name?.split (name can be undefined in corrupted storage)
patch("DashboardView.tsx",
      "Welcome back, {user?.name.split(\" \")[0]}!",
      "Welcome back, {user?.name?.split(\" \")[0] ?? \"there\"}!")

# 2. TeachersView — clipboard write catch + only mark copied on success
patch("TeachersView.tsx",
      """                    if (credentialsTeacher?.user.email) {
                      navigator.clipboard.writeText(credentialsTeacher.user.email);
                      setEmailCopied(true);
                      setTimeout(() => setEmailCopied(false), 2000);
                    }""",
      """                    if (credentialsTeacher?.user.email) {
                      navigator.clipboard.writeText(credentialsTeacher.user.email)
                        .then(() => {
                          setEmailCopied(true);
                          setTimeout(() => setEmailCopied(false), 2000);
                        })
                        .catch(() => toast.error("Could not copy to clipboard"));
                    }""")

# 3. TeachersView — delete handler: check res.ok before success toast
patch("TeachersView.tsx",
      """      await apiFetch(`/api/teachers/${deleteTarget.id}`, { method: "DELETE" });
      toast.success("Teacher deleted");""",
      """      const res = await apiFetch(`/api/teachers/${deleteTarget.id}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to delete teacher");
      }
      toast.success("Teacher deleted");""")

# 4. ParentsView — clipboard catch
with open(BASE + "ParentsView.tsx") as f:
    pv = f.read()
m = re.search(r"navigator\.clipboard\.writeText\((\w+)\);\n(\s+)setCopied\(true\);", pv)
if m:
    pv = pv.replace(
        m.group(0),
        f"navigator.clipboard.writeText({m.group(1)})\n{m.group(2)}  .then(() => setCopied(true))\n{m.group(2)}  .catch(() => toast.error(\"Could not copy to clipboard\"));"
    )
    with open(BASE + "ParentsView.tsx", "w") as f:
        f.write(pv)
    print("OK ParentsView.tsx: clipboard catch")
else:
    print("MISSING ParentsView clipboard pattern")

# 5. ParentsView — delete res.ok guard
with open(BASE + "ParentsView.tsx") as f:
    pv = f.read()
m = re.search(r"(await apiFetch\(`/api/parents/\$\{[^}]+\}`, \{ method: \"DELETE\" \})\);?\n)(\s*toast\.success\(\"Parent deleted\"\);)", pv)
if m:
    pv = pv.replace(m.group(0), "const res = " + m.group(1) + m.group(2).replace(
        "toast.success(\"Parent deleted\");",
        "if (!res.ok) {\n" + m.group(2)[:m.group(2).index("toast")].replace("toast.success", "  ") + "  const err = await res.json().catch(() => ({}));\n        throw new Error(err.error || \"Failed to delete parent\");\n      }\n      toast.success(\"Parent deleted\");"
    ))
    with open(BASE + "ParentsView.tsx", "w") as f:
        f.write(pv)
    print("OK ParentsView.tsx: delete res.ok guard")
else:
    print("MISSING ParentsView delete pattern")

# 6. StudentsView — delete res.ok guard + pagination total
patch("StudentsView.tsx",
      "setTotalStudents(data.total || students.length);",
      "setTotalStudents(data.pagination?.total ?? students.length);")

with open(BASE + "StudentsView.tsx") as f:
    sv = f.read()
m = re.search(r"(await apiFetch\(`/api/students/\$\{deleteTarget\.id\}`, \{ method: \"DELETE\" \})\);\n)(\s*toast\.success\(\)", sv)
if m:
    sv = sv.replace(m.group(0), "const res = " + m.group(1) + m.group(2).replace(
        "toast.success(",
        "if (!res.ok) {\n        const err = await res.json().catch(() => ({}));\n        throw new Error(err.error || \"Failed to delete student\");\n      }\n      toast.success(", 1), 1)
    with open(BASE + "StudentsView.tsx", "w") as f:
        f.write(sv)
    print("OK StudentsView.tsx: delete res.ok guard")
else:
    print("MISSING StudentsView delete pattern")

# 7. NotificationsView — sentCount guard
patch("NotificationsView.tsx",
      "Sent ${data.sentCount} SMS",
      "Sent ${data.sentCount ?? 0} SMS")

# 8. MarksEntryView — literal \n text in JSX skeleton
with open(BASE + "MarksEntryView.tsx") as f:
    mv = f.read()
if '\\n<div>' in mv or '\\n      <div>' in mv:
    mv = re.sub(r"\\n(\s*)<div>", r"\n\1<div>", mv)
    with open(BASE + "MarksEntryView.tsx", "w") as f:
        f.write(mv)
    print("OK MarksEntryView.tsx: literal \\n removed")
else:
    print("MarksEntryView: no literal \\n found (check manually)")

# 9. ParentPortalView — literal \u2022 text
with open(BASE + "ParentPortalView.tsx") as f:
    ppv = f.read()
if "\\u2022" in ppv:
    ppv = ppv.replace("\\u2022", "•")
    with open(BASE + "ParentPortalView.tsx", "w") as f:
        f.write(ppv)
    print("OK ParentPortalView.tsx: \\u2022 replaced with •")
else:
    print("ParentPortalView: no literal \\u2022 found")

print("\nDone.")
