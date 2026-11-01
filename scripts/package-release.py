#!/usr/bin/env python3
"""Build release assets from tracked files, including the pinned admin submodule."""
import hashlib
import pathlib
import re
import subprocess
import sys
import tarfile

root = pathlib.Path(__file__).resolve().parent.parent
version, destination = sys.argv[1:]
if not re.fullmatch(r"v\d+\.\d+\.\d+", version):
    raise SystemExit("Expected vX.Y.Z")
out = pathlib.Path(destination).resolve()
if out == root or root in out.parents:
    raise SystemExit("Release output must be outside the source directory")
out.mkdir(parents=True, exist_ok=True)
if any(out.iterdir()):
    raise SystemExit("Release output must be empty")
for source, name in [("install.sh", "install.sh"), ("compose.sample.yaml", "compose.yaml"),
                     ("compose.host.sample.yaml", "compose.host.yaml"),
                     ("compose.xboard-u.yaml", "compose.xboard-u.yaml"), ("LICENSE", "LICENSE")]:
    content = (root / source).read_text(encoding="utf-8")
    content = re.sub(r"ghcr\.io/toto0912/xboard-u:[\w.-]+", f"ghcr.io/toto0912/xboard-u:{version}", content)
    (out / name).write_text(content, encoding="utf-8", newline="\n")

def tracked(directory):
    return subprocess.check_output(["git", "-C", str(directory), "ls-files", "-z"]).decode().split("\0")[:-1]

admin = "public/assets/admin"
if not (root / admin / "index.html").is_file():
    raise SystemExit("Initialize the pinned admin submodule first")
paths = [p for p in tracked(root) if p != admin]
paths += [f"{admin}/{p}" for p in tracked(root / admin)]
with tarfile.open(out / "xboard-u-source-with-admin.tar.gz", "w:gz") as archive:
    for path in sorted(paths):
        # Do not follow symlinks, include untracked runtime files, or traverse dirs.
        archive.add(root / path, arcname=f"xboard-u/{path}", recursive=False)
checksums = [f"{hashlib.sha256(p.read_bytes()).hexdigest()}  {p.name}\n"
             for p in sorted(out.iterdir())]
(out / "SHA256SUMS.txt").write_text("".join(checksums), encoding="utf-8", newline="\n")
print(f"Packaged {len(paths)} tracked source files and {len(checksums)} assets")
