#!/usr/bin/env python3
"""Offline installer behavior tests. No network, Docker daemon or source writes."""
import hashlib
import json
import os
import pathlib
import subprocess
import tempfile
import unittest

INSTALLER = pathlib.Path(__file__).resolve().parent.parent / "install.sh"
MOCK = r'''#!/usr/bin/env python3
import hashlib,json,os,pathlib,sys
args=sys.argv[1:]
with open(os.environ['MOCK_LOG'],'a') as log:
    log.write(json.dumps([pathlib.Path(sys.argv[0]).name]+args)+'\n')
if pathlib.Path(sys.argv[0]).name == 'docker':
    if 'run' in args and not os.environ.get('MOCK_INIT_FAIL'):
        pathlib.Path('.env').write_text('INSTALLED=true\n')
    sys.exit(0)
url=next(a for a in args if a.startswith('https://'))
if url.endswith('/releases/latest'):
    print('https://github.com/Toto0912/Xboard-u/releases/tag/v0.1.0',end='')
    sys.exit(0)
if os.environ.get('MOCK_DOWNLOAD_FAIL'):
    sys.exit(22)
def compose(name):
    return 'services:\n  xboard:\n    image: ghcr.io/toto0912/xboard-u:v0.1.0\n'+('    network_mode: host\n' if name=='compose.host.yaml' else '    ports: ["7001:7001"]\n')
name=url.rsplit('/',1)[1]
if name=='SHA256SUMS.txt':
    body=''.join(hashlib.sha256(compose(n).encode()).hexdigest()+'  '+n+'\n' for n in ['compose.yaml','compose.host.yaml'])
else:
    body=compose(name)+('# tampered\n' if os.environ.get('MOCK_TAMPER') else '')
pathlib.Path(args[args.index('-o')+1]).write_text(body)
'''


class InstallerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="xbu-installer-")
        self.root = pathlib.Path(self.temp.name)
        self.target = self.root / "new panel with spaces"
        bindir = self.root / "bin"
        bindir.mkdir()
        for name in ["curl", "docker"]:
            path = bindir / name
            path.write_text(MOCK)
            path.chmod(0o755)
        self.log = self.root / "calls.jsonl"
        self.env = dict(os.environ, PATH=f"{bindir}:{os.environ['PATH']}", MOCK_LOG=str(self.log))

    def tearDown(self):
        self.temp.cleanup()

    def run_installer(self, *args, **environment):
        return subprocess.run(["bash", str(INSTALLER), "--dir", str(self.target), *args],
                              env=dict(self.env, **environment), capture_output=True, text=True)

    def calls(self):
        return [json.loads(line) for line in self.log.read_text().splitlines()] if self.log.exists() else []

    def test_host_download_only_resolves_and_pins_release(self):
        result = self.run_installer("--layout", "host", "--download-only")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("network_mode: host", (self.target / "compose.yaml").read_text())
        self.assertEqual((self.target / ".env").stat().st_mode & 0o777, 0o600)
        self.assertFalse(any(c[0] == "docker" for c in self.calls()))
        self.assertTrue(any("/releases/download/v0.1.0/compose.host.yaml" in " ".join(c) for c in self.calls()))

    def test_fresh_sqlite_initializes_before_start(self):
        result = self.run_installer("--sqlite", "--version", "v0.1.0")
        self.assertEqual(result.returncode, 0, result.stderr)
        calls = [c for c in self.calls() if c[0] == "docker"]
        install = next(i for i, c in enumerate(calls) if "xboard:install" in c)
        start = next(i for i, c in enumerate(calls) if "up" in c)
        self.assertLess(install, start)
        self.assertIn("ENABLE_SQLITE=true", calls[install])
        self.assertFalse(any("/releases/latest" in " ".join(c) for c in self.calls()))

    def test_existing_deployment_is_untouched(self):
        self.target.mkdir()
        config = self.target / ".env"
        config.write_text("APP_KEY=existing-secret\n")
        result = self.run_installer()
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(config.read_text(), "APP_KEY=existing-secret\n")
        self.assertEqual(self.calls(), [])

    def test_invalid_checksum_never_initializes(self):
        result = self.run_installer("--download-only", MOCK_TAMPER="1")
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse(self.target.exists())

    def test_download_failure_never_creates_configuration(self):
        result = self.run_installer("--download-only", MOCK_DOWNLOAD_FAIL="1")
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse(self.target.exists())

    def test_failed_initialization_does_not_start_service(self):
        result = self.run_installer("--sqlite", MOCK_INIT_FAIL="1")
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse(any("up" in c for c in self.calls()))


if __name__ == "__main__":
    unittest.main()
