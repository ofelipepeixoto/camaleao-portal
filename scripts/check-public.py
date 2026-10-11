"""Small public-manifest guard; not a complete secret scanner or security audit."""
import pathlib
import re
import subprocess
import sys

root = pathlib.Path(__file__).resolve().parent.parent
paths = subprocess.check_output(['git', 'ls-files', '-z'], cwd=root).decode().split('\0')
rules = [
    re.compile(r'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----'),
    re.compile(r'sb_secret_[A-Za-z0-9_-]{16,}'),
    re.compile(r'(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})'),
    re.compile(r'(?:sk-proj-|sk-live-)[A-Za-z0-9_-]{20,}'),
    re.compile(r'Bearer\s+eyJ[A-Za-z0-9_-]{20,}'),
]
failures = []
for name in filter(None, paths):
    path = root / name
    if name == 'docs/PLANO-ORIGEM.md' or name == '.env' or name == '.env.local':
        failures.append(name)
        continue
    if path.is_file():
        content = path.read_bytes().decode('utf8', errors='replace')
        if any(pattern.search(content) for pattern in rules): failures.append(name)
if failures:
    print('Publicação recusada; revisar arquivos:', ', '.join(failures))
    sys.exit(1)
print(f'Manifesto público verificado: {sum(bool(p) for p in paths)} arquivos; nenhum padrão detectado.')
