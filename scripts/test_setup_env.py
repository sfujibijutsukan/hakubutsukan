import contextlib
import importlib.util
import io
import json
import os
from pathlib import Path
import stat
import tempfile
import types
import unittest
from unittest.mock import Mock, patch

spec = importlib.util.spec_from_file_location("setup_env", Path(__file__).with_name("setup-env.py"))
setup = importlib.util.module_from_spec(spec)
spec.loader.exec_module(setup)


class EnvSetupTests(unittest.TestCase):
    def test_port_mapping_and_container_selection(self):
        rows = [{"ID": "db", "Image": "postgres", "Names": "db"}, {"ID": "dg", "Image": "louislam/dockge:1", "Names": "stack-dockge-1"}]
        with patch.object(setup, "run", side_effect=["\n".join(map(json.dumps, rows)), json.dumps({"ports": {"5001/tcp": [{"HostIp": "0.0.0.0", "HostPort": "5501"}, {"HostIp": "::", "HostPort": "5501"}]}})]) as run:
            self.assertEqual(setup.discover_dockge(["docker"], None, "192.168.1.10"), "http://192.168.1.10:5501")
            self.assertEqual(run.call_args.args[0][-1], "dg")
            self.assertNotIn(".Config.Env", run.call_args.args[0][-2])

    def test_ambiguous_missing_and_local_only_dockge_are_not_guessed(self):
        with self.assertRaises(ValueError):
            setup.discover_dockge(["docker"], "--format=bad", "192.168.1.10")
        for rows in [[], [{"ID": "a", "Image": "louislam/dockge:1"}, {"ID": "b", "Image": "louislam/dockge:1"}]]:
            with patch.object(setup, "run", return_value="\n".join(map(json.dumps, rows))):
                with self.assertRaises(ValueError):
                    setup.discover_dockge(["docker"], None, "192.168.1.10")
        for info in [{"networkMode": "host"}, {"ports": {"5001/tcp": [{"HostIp": "127.0.0.1", "HostPort": "5001"}]}}]:
            with patch.object(setup, "run", return_value=json.dumps(info)):
                with self.assertRaises(ValueError):
                    setup.discover_dockge(["docker"], "dockge", "192.168.1.10")

    def test_lan_ip_uses_lowest_metric_and_rejects_ambiguity(self):
        routes = [{"dev": "eth0", "metric": 10}, {"dev": "wlan0", "metric": 100}]
        addresses = [{"addr_info": [{"family": "inet", "scope": "global", "local": "192.168.1.10"}]}]
        with patch.object(setup, "run", side_effect=[json.dumps(routes), json.dumps(addresses)]) as run:
            self.assertEqual(setup.detect_lan_ip(), "192.168.1.10")
            self.assertEqual(run.call_args.args[0][-1], "eth0")
        with patch.object(setup, "run", return_value=json.dumps([{"dev": "eth0"}, {"dev": "wlan0"}])):
            with self.assertRaises(ValueError):
                setup.detect_lan_ip()

    def test_dotenv_preserves_unmanaged_values_and_does_not_execute(self):
        text = '# comment\nPORT="8097" # custom\nTOKEN=$(touch /tmp/never-execute-this)\nPREVIEW_ORIGINS=https://app.test\n'
        values = setup.env_values(text)
        self.assertEqual(values, {"PORT": "8097"})
        rendered = setup.render_env(text, {"BIND_ADDRESS": "192.168.1.10", "PORT": "8097", "DOCKGE_URL": "https://dockge.test/?value=$literal#x"})
        self.assertIn("TOKEN=$(touch /tmp/never-execute-this)", rendered)
        self.assertIn("PREVIEW_ORIGINS=https://app.test", rendered)
        self.assertIn("DOCKGE_URL='https://dockge.test/?value=$literal#x'", rendered)
        with self.assertRaises(ValueError):
            setup.env_values("PORT=8090\nPORT=8091\n")

    def test_unmanaged_multiline_values_are_never_interpreted_as_settings(self):
        text = "SECRET='line one\nPORT=secret-line\nDOCKGE_URL=secret\nline four'\nPORT=8090\n"
        self.assertEqual(setup.env_values(text), {"PORT": "8090"})
        rendered = setup.render_env(text, {"PORT": "8097"})
        self.assertIn("PORT=secret-line", rendered)
        self.assertIn("DOCKGE_URL=secret", rendered)
        self.assertTrue(rendered.endswith("PORT=8097\n"))

    def test_validation_rejects_bad_addresses_ports_and_urls(self):
        for value in ["127.0.0.1", "0.0.0.0", "192.168.1.999", "169.254.1.1"]:
            with self.assertRaises(ValueError):
                setup.lan_ip(value)
        for value in ["0", "65536", "8090\nTOKEN=x", "no"]:
            with self.assertRaises(ValueError):
                setup.dockge_port(value)
        for value in ["javascript:alert(1)", "http://user:password@host", "http://host:99999", "http://host\nPORT=123"]:
            with self.assertRaises(ValueError):
                setup.web_url(value)

    def test_atomic_write_private_backup_and_symlink_rejection(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / ".env"
            path.write_text("SECRET=private\n")
            backup = setup.save_env(path, "SECRET=private\nPORT=8090\n")
            self.assertEqual(backup.read_text(), "SECRET=private\n")
            self.assertEqual(stat.S_IMODE(path.stat().st_mode), 0o600)
            self.assertEqual(stat.S_IMODE(backup.stat().st_mode), 0o600)
            link = Path(directory) / "link"
            link.symlink_to(path)
            with self.assertRaises(ValueError):
                setup.save_env(link, "overwrite")
            self.assertIn("SECRET=private", path.read_text())

    def test_cli_dry_run_and_write_preserve_config_and_correct_gid(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / ".env"
            original = "BIND_ADDRESS=192.168.1.10\nPORT=8097\nDOCKER_GID=0\nDOCKGE_URL=http://dockge.test\nSECRET=do-not-print\nPREVIEW_ORIGINS=https://app.test\n"
            path.write_text(original)
            socket = Mock()
            socket.stat.return_value = types.SimpleNamespace(st_mode=stat.S_IFSOCK | 0o660, st_gid=998)
            socket.resolve.return_value = "/var/run/docker.sock"
            with patch.object(setup, "SOCKET_PATH", socket), patch.object(setup, "run", side_effect=AssertionError("no inspection needed")), contextlib.redirect_stdout(io.StringIO()) as output:
                self.assertEqual(setup.main(["--output", str(path)]), 0)
                self.assertEqual(path.read_text(), original)
                self.assertEqual(list(Path(directory).glob("*.backup.*")), [])
                self.assertEqual(setup.main(["--output", str(path), "--write"]), 0)
                self.assertNotIn("do-not-print", output.getvalue())
                self.assertIn("DOCKER_GID=998", path.read_text())
                self.assertIn("PORT=8097", path.read_text())
                self.assertIn("PREVIEW_ORIGINS=https://app.test", path.read_text())
                self.assertEqual(setup.main(["--output", str(path), "--write"]), 0)
                self.assertEqual(len(list(Path(directory).glob("*.backup.*"))), 1)

    def test_new_env_detects_lan_and_dockge_without_writing_on_failure(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / ".env"
            socket = Mock()
            socket.stat.return_value = types.SimpleNamespace(st_mode=stat.S_IFSOCK | 0o660, st_gid=998)
            socket.resolve.return_value = "/var/run/docker.sock"
            with patch.object(setup, "SOCKET_PATH", socket), patch.object(setup, "detect_lan_ip", return_value="192.168.1.10"), patch.object(setup, "discover_dockge", return_value="http://192.168.1.10:5501"), contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(setup.main(["--output", str(path), "--write"]), 0)
            self.assertIn("BIND_ADDRESS=192.168.1.10", path.read_text())
            self.assertIn("DOCKGE_URL=http://192.168.1.10:5501", path.read_text())
            self.assertIn("HAKUBUTSUKAN_DOMAIN=\n", path.read_text())
            previous = path.read_text()
            with contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(setup.main(["--output", str(path), "--lan-ip", "bad", "--write"]), 1)
            self.assertEqual(path.read_text(), previous)


if __name__ == "__main__":
    unittest.main()
