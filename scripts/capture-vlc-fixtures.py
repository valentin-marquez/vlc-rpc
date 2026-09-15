"""Capture status.json and playlist.json fixtures by driving VLC's HTTP interface.

Usage:
    python scripts/capture-vlc-fixtures.py <label> <file-or-url> [--seek=N] [--pause]

Output lands in ./captured next to this script. Move the files into
src/main/features/vlc/__fixtures__/ once you are happy with them.

The VLC flags are passed on the command line, so the user's vlcrc is never
touched and the settings apply to that single run.

Four things that cost an hour to find out, all of which fail silently:

  * VLC on Windows does not queue paths with forward slashes. It sits in
    `stopped` with `currentplid: -1` and reports no error at all.
  * Without an audio output device, VLC never leaves `stopped`. `--aout=dummy`
    fixes it on machines with no sound card.
  * One-instance mode hands the file to an already running VLC and drops every
    flag on the floor. `--no-one-instance` is mandatory here.
  * `--no-video` on a file with no audio track leaves VLC without a clock, so it
    races to the end instantly. Use `--vout=dummy` instead: it keeps the timing
    and opens no window.

Note that VLC localizes the keys inside `information.category` to its interface
language. A fixture captured on a Spanish VLC says `Tipo: Vídeo`, not
`Type: Video`. That is deliberate: capturing on a single locale would hide the
bug those fixtures exist to pin down.
"""

import base64
import json
import pathlib
import subprocess
import sys
import time
import urllib.error
import urllib.request

VLC = r"C:\Program Files\VideoLAN\VLC\vlc.exe"
PORT = 9099
PASSWORD = "fixtures"
OUT = pathlib.Path(__file__).parent / "captured"
AUTH = "Basic " + base64.b64encode(f":{PASSWORD}".encode()).decode()


def request(path, timeout=3):
    req = urllib.request.Request(
        f"http://127.0.0.1:{PORT}/requests/{path}", headers={"Authorization": AUTH}
    )
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8", "replace"))


def wait_for(predicate, limit=20.0):
    deadline = time.time() + limit
    while time.time() < deadline:
        try:
            status = request("status.json")
            if predicate(status):
                return status
        except (urllib.error.URLError, OSError, json.JSONDecodeError):
            pass
        time.sleep(0.4)
    return None


def wait_port_free(limit=15.0):
    """La instancia anterior de VLC puede seguir reteniendo el puerto unos segundos.
    Si arrancamos antes, la nueva no consigue levantar su interfaz HTTP y parece
    que nunca reproduce."""
    import socket

    deadline = time.time() + limit
    while time.time() < deadline:
        with socket.socket() as s:
            s.settimeout(0.3)
            if s.connect_ex(("127.0.0.1", PORT)) != 0:
                return True
        time.sleep(0.4)
    return False


def write_fixture(path, payload):
    """Tab indented, LF, trailing newline: what biome expects of a JSON file in
    this repo, so a fresh capture does not fail the format check."""
    text = json.dumps(payload, indent="\t", ensure_ascii=False) + "\n"
    path.write_text(text, encoding="utf-8", newline="\n")


def normalize(target):
    """VLC en Windows no encola rutas con forward slashes: se queda en stopped
    sin emitir ningun error. Las URLs se dejan intactas."""
    if "://" in target:
        return target
    return str(pathlib.Path(target))


def capture(label, target, pause=False, seek=None):
    OUT.mkdir(parents=True, exist_ok=True)
    target = normalize(target)
    if not wait_port_free():
        print(f"  {label}: el puerto {PORT} sigue ocupado")
        return False
    proc = subprocess.Popen(
        [
            VLC, "--intf", "dummy", "--extraintf", "http",
            "--http-host", "127.0.0.1", "--http-port", str(PORT),
            "--http-password", PASSWORD,
            "--no-qt-privacy-ask", "--no-qt-updates-notif",
            # sin dispositivo de audio VLC se queda en stopped; one-instance
            # reenviaria el archivo a una instancia existente e ignoraria estos flags
            "--aout=dummy", "--no-one-instance",
            "--vout=dummy", "--loop", str(target),
        ],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    try:
        # Esperar a que haya streams, no a que haya duracion. Un mp3 VBR sin
        # cabecera Xing reporta length -1 durante un rato, y un stream de red
        # reporta 0 para siempre, asi que la duracion no dice si VLC ya parseo
        # el medio. La presencia de streams si.
        status = wait_for(
            lambda s: s.get("state") == "playing"
            and any(k != "meta" for k in s.get("information", {}).get("category", {}))
        )
        if status is None:
            print(f"  {label}: TIMEOUT, VLC no llego a reproducir")
            return False
        if seek is not None:
            request(f"status.json?command=seek&val={seek}")
            status = wait_for(lambda s: abs(s.get("time", 0) - seek) <= 2) or status
        if pause:
            request("status.json?command=pl_pause")
            status = wait_for(lambda s: s.get("state") == "paused") or status
        playlist = request("playlist.json")
        write_fixture(OUT / f"{label}.status.json", status)
        write_fixture(OUT / f"{label}.playlist.json", playlist)
        meta = status.get("information", {}).get("category", {}).get("meta", {})
        streams = [
            v.get("Type")
            for k, v in status.get("information", {}).get("category", {}).items()
            if k != "meta" and isinstance(v, dict)
        ]
        print(
            f"  {label}: state={status.get('state')} length={status.get('length')} "
            f"plid={status.get('currentplid')} streams={streams} meta={sorted(meta)}"
        )
        return True
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()
        subprocess.run(
            ["taskkill", "/F", "/IM", "vlc.exe"],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False,
        )


if __name__ == "__main__":
    label, target = sys.argv[1], sys.argv[2]
    pause = "--pause" in sys.argv
    seek = next((int(a.split("=")[1]) for a in sys.argv if a.startswith("--seek=")), None)
    ok = capture(label, target, pause=pause, seek=seek)
    sys.exit(0 if ok else 1)
