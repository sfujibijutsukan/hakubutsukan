#!/usr/bin/env python3
"""Prepare a LAN-facing museum .env from local Docker/Dockge metadata."""
import argparse
import datetime
import ipaddress
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import tempfile
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parent.parent
SOCKET_PATH = Path("/var/run/docker.sock")
MANAGED = ("BIND_ADDRESS", "PORT", "DOCKER_GID", "DOCKGE_URL")
ASSIGNMENT = re.compile(r"^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$")
INSPECT = '{"name":{{json .Name}},"image":{{json .Config.Image}},"ports":{{json .NetworkSettings.Ports}},"networkMode":{{json .HostConfig.NetworkMode}}}'


def run(args):
    try:
        result = subprocess.run(args, check=True, capture_output=True, text=True, timeout=15)
        return result.stdout
    except FileNotFoundError:
        raise ValueError(f"必要なコマンドがありません: {args[0]}") from None
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired):
        # Do not echo Docker output or environment values that might include secrets.
        raise ValueError(f"{args[0]} の読み取りに失敗しました。インストール・起動状態・実行権限を確認してください。") from None


def lan_ip(value):
    try:
        address = ipaddress.IPv4Address(value)
    except ipaddress.AddressValueError:
        raise ValueError("--lan-ip はサーバーのIPv4アドレスを指定してください。") from None
    if address.is_loopback or address.is_unspecified or address.is_multicast or address.is_link_local:
        raise ValueError("--lan-ip にループバック・未指定・マルチキャスト・リンクローカルは使えません。")
    return str(address)


def detect_lan_ip():
    routes = json.loads(run(["ip", "-j", "-4", "route", "show", "default"]))
    routes = [r for r in routes if r.get("dev") and not r["dev"].startswith(("lo", "docker", "br-", "veth", "tun", "wg", "tailscale"))]
    if not routes:
        raise ValueError("LAN IPを検出できません。--lan-ip で指定してください。")
    best = min(r.get("metric", 0) for r in routes)
    devices = {r["dev"] for r in routes if r.get("metric", 0) == best}
    if len(devices) != 1:
        raise ValueError("既定経路が複数あります。--lan-ip で使用するLAN IPを指定してください。")
    addresses = json.loads(run(["ip", "-j", "-4", "address", "show", "dev", next(iter(devices))]))
    candidates = {lan_ip(a["local"]) for item in addresses for a in item.get("addr_info", []) if a.get("scope") == "global" and a.get("family") == "inet"}
    if len(candidates) != 1:
        raise ValueError("LAN IPを一意に決められません。--lan-ip で指定してください。")
    return candidates.pop()


def dockge_port(value):
    try:
        port = int(value)
    except (ValueError, TypeError):
        raise ValueError("ポート番号は1〜65535の整数にしてください。") from None
    if not 1 <= port <= 65535:
        raise ValueError("ポート番号は1〜65535の整数にしてください。")
    return str(port)


def web_url(value):
    try:
        parsed = urlsplit(value)
        if parsed.scheme not in ("http", "https") or not parsed.hostname or parsed.username or parsed.password:
            raise ValueError()
        if parsed.port is not None:
            dockge_port(parsed.port)
        if any(c.isspace() or ord(c) < 32 for c in value) or "'" in value:
            raise ValueError()
    except ValueError:
        raise ValueError("Dockge URLは認証情報を含まないHTTP(S) URLを指定してください。") from None
    return value


def discover_dockge(docker, container, address):
    if container:
        container = container.lstrip("/")
        if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.-]*", container):
            raise ValueError("Dockgeのコンテナ名またはIDが不正です。")
    if not container:
        rows = [json.loads(line) for line in run(docker + ["ps", "--format", "{{json .}}"]).splitlines() if line.strip()]
        candidates = [r for r in rows if r.get("Image", "").split("/")[-1].split("@")[0].split(":")[0] == "dockge" or r.get("Names", "").lower() == "dockge"]
        if len(candidates) != 1:
            raise ValueError("稼働中のDockgeを一意に検出できません。--dockge-container または --dockge-url を指定してください。")
        container = candidates[0]["ID"]
    info = json.loads(run(docker + ["inspect", "--type", "container", "--format", INSPECT, container]))
    ports = (info.get("ports") or {}).get("5001/tcp") or []
    reachable = [p for p in ports if p.get("HostIp") in ("0.0.0.0", "", address)]
    choices = {dockge_port(p.get("HostPort")) for p in reachable}
    if len(choices) != 1:
        raise ValueError("DockgeのLAN公開ポートを一意に検出できません。リバースプロキシ・hostネットワーク・localhost限定の場合は --dockge-url で実際のURLを指定してください。")
    return web_url(f"http://{address}:{choices.pop()}")


def closing_quote(text, quote):
    escaped = False
    for index, char in enumerate(text):
        if char == quote and not escaped:
            return index
        escaped = char == "\\" and not escaped
    return -1


def assignment_lines(text):
    # Unknown multiline secrets remain opaque, even if their contents resemble assignments.
    result, quote = {}, None
    for index, line in enumerate(text.splitlines(keepends=True)):
        if quote:
            if closing_quote(line, quote) != -1:
                quote = None
            continue
        match = ASSIGNMENT.match(line.rstrip("\r\n"))
        if not match:
            continue
        result[index] = match
        raw = match[2].strip()
        if raw.startswith(("'", '"')) and closing_quote(raw[1:], raw[0]) == -1:
            quote = raw[0]
    return result


def env_values(text):
    values = {}
    for match in assignment_lines(text).values():
        if match[1] not in MANAGED:
            continue
        key, raw = match.groups()
        if key in values:
            raise ValueError(f".env に {key} が複数あります。重複を解消してください。")
        raw = raw.strip()
        if raw.startswith(("'", '"')):
            quote = raw[0]
            end = raw.find(quote, 1)
            tail = raw[end + 1:].strip()
            if end == -1 or (tail and not tail.startswith("#")):
                raise ValueError(f".env の {key} は単一行の値にしてください。")
            raw = raw[1:end]
        else:
            raw = re.split(r"\s+#", raw, maxsplit=1)[0].strip()
        values[key] = raw
    return values


def render_env(text, updates):
    lines, found = [], set()
    assignments = assignment_lines(text)
    for index, line in enumerate(text.splitlines(keepends=True)):
        match = assignments.get(index)
        if match and match[1] in updates:
            key = match[1]
            newline = "\r\n" if line.endswith("\r\n") else "\n"
            value = updates[key]
            # Compose interpolates $, except in a single-quoted dotenv value.
            if "$" in value or "#" in value:
                value = "'" + value + "'"
            lines.append(f"{key}={value}{newline}")
            found.add(key)
        else:
            lines.append(line)
    result = "".join(lines)
    if result and not result.endswith("\n"):
        result += "\n"
    for key, value in updates.items():
        if key not in found:
            if "$" in value or "#" in value:
                value = "'" + value + "'"
            result += f"{key}={value}\n"
    return result


def save_env(path, content):
    if path.is_symlink():
        raise ValueError("出力先がシンボリックリンクです。--output で実体のファイルを指定してください。")
    backup = None
    if path.exists():
        stamp = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
        backup = path.with_name(path.name + ".backup." + stamp)
        with backup.open("xb") as handle:
            os.chmod(backup, 0o600)
            handle.write(path.read_bytes())
    fd, name = tempfile.mkstemp(prefix="." + path.name + ".tmp.", dir=path.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="") as handle:
            os.fchmod(handle.fileno(), 0o600)
            handle.write(content)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(name, path)
    finally:
        if os.path.exists(name):
            os.unlink(name)
    return backup


def main(argv=None):
    parser = argparse.ArgumentParser(description="Dockgeとサーバーの情報から、LAN公開用の博物館.envを準備します（初期状態は表示のみ）。")
    parser.add_argument("--lan-ip", help="サーバーのLAN IPv4。省略時は既存のLAN用BIND_ADDRESS、または既定経路から検出")
    parser.add_argument("--dockge-container", help="Dockgeのコンテナ名またはID。省略時は稼働中のDockgeから検出")
    parser.add_argument("--dockge-url", help="Dockgeの実際のHTTP(S) URL。プロキシ経由や公開ポートを変更した環境で指定")
    parser.add_argument("--port", help="博物館の公開ポート。省略時は既存値または8090")
    parser.add_argument("--output", type=Path, default=ROOT / ".env")
    parser.add_argument("--write", action="store_true", help="バックアップを作成して.envを保存")
    args = parser.parse_args(argv)
    try:
        if args.output.is_symlink():
            raise ValueError("出力先がシンボリックリンクです。--output で実体を指定してください。")
        text = args.output.read_text(encoding="utf-8") if args.output.exists() else (ROOT / ".env.example").read_text(encoding="utf-8")
        existing = env_values(text)
        # Existing explicit LAN bindings are preserved; template loopback bindings become LAN-facing.
        bind = existing.get("BIND_ADDRESS", "") if args.output.exists() else ""
        address = lan_ip(args.lan_ip) if args.lan_ip else (lan_ip(bind) if bind and bind != "0.0.0.0" and not bind.startswith("127.") else detect_lan_ip())
        socket_info = SOCKET_PATH.stat()
        if not stat.S_ISSOCK(socket_info.st_mode):
            raise ValueError("指定されたDockerソケットはUnixソケットではありません。")
        docker = ["docker", "--host", "unix://" + str(SOCKET_PATH.resolve())]
        url = web_url(args.dockge_url) if args.dockge_url else (web_url(existing["DOCKGE_URL"]) if args.output.exists() and existing.get("DOCKGE_URL") and not args.dockge_container else discover_dockge(docker, args.dockge_container, address))
        updates = {"BIND_ADDRESS": address, "PORT": dockge_port(args.port or existing.get("PORT") or "8090"), "DOCKER_GID": str(socket_info.st_gid), "DOCKGE_URL": url}
        # Do not carry a Caddy example hostname into a new LAN-only installation.
        if not args.output.exists():
            text = text.replace("HAKUBUTSUKAN_DOMAIN=museum.example.test", "HAKUBUTSUKAN_DOMAIN=")
        content = render_env(text, updates)
        print("LAN公開用 .env の設定予定（他の設定・コメントは保持）:")
        for key, value in updates.items():
            print(f"  {key}={value}")
        if args.write:
            if args.output.exists() and content == text:
                print("変更はありません。")
            else:
                backup = save_env(args.output, content)
                print(f"保存先: {args.output}")
                if backup:
                    print(f"バックアップ: {backup}")
            print("反映: 対象スタックをDockgeで再デプロイ、または docker compose up -d --build")
        else:
            print("表示のみです。保存するには同じコマンドに --write を追加してください。")
        print(f"博物館のURL: http://{address}:{updates['PORT']}")
        return 0
    except (ValueError, OSError) as error:
        print(f"設定を作成できません: {error}")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
