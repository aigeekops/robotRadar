"""Check built entry URLs and all model assets without network access."""
import json
import gzip
import hashlib
import sys
import xml.etree.ElementTree as ET
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "dist"
base = sys.argv[1] if len(sys.argv) > 1 else "/"
assert base.startswith("/") and base.endswith("/"), base

class EntryParser(HTMLParser):
    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        value = attrs.get("src") if tag == "script" else attrs.get("href") if tag == "link" else None
        if not value or urlsplit(value).scheme or value.startswith("//"):
            return
        path = unquote(urlsplit(value).path)
        assert path.startswith(base), f"Wrong Pages base: {value}"
        assert (DIST / path[len(base):]).is_file(), f"Missing entry asset: {value}"

EntryParser().feed((DIST / "index.html").read_text())
models = json.loads((DIST / "robots/manifest.json").read_text())
meshes = 0
checked_sidecars = set()
for model in models:
    folder = DIST / "robots" / model["id"]
    root = ET.parse(folder / "robot.urdf").getroot()
    for mesh in root.findall(".//mesh"):
        filename = mesh.get("filename")
        assert filename and (DIST / filename.lstrip("/")).is_file(), filename
        asset = DIST / filename.lstrip("/")
        if asset.suffix.lower() in {".stl", ".dae", ".obj"} and asset not in checked_sidecars:
            sidecar = Path(str(asset) + ".gz")
            assert sidecar.is_file(), f"Compressed mesh missing: {sidecar}"
            with gzip.open(sidecar, "rb") as compressed:
                assert hashlib.sha256(compressed.read()).digest() == hashlib.sha256(asset.read_bytes()).digest(), f"Compressed mesh differs from source: {asset}"
            checked_sidecars.add(asset)
        meshes += 1
# Validate the files actually loaded by the browser, not an empty legacy directory.
for relative in (
    "vendor/mujoco/mujoco.js",
    "vendor/mujoco/mujoco.wasm",
    "vendor/mujoco/g1-worker.js",
    "vendor/mujoco/profile.json",
    "vendor/mujoco/leap-grasp/worker.js",
    "vendor/mujoco/leap-grasp/runtime.js",
    "vendor/mujoco/leap-grasp/model.xml",
    "vendor/mujoco/leap-grasp/profile.json",
):
    asset = DIST / relative
    assert asset.is_file() and asset.stat().st_size > 0, f"Browser physics asset missing: {relative}"
print(f"Pages build checked: base={base}, models={len(models)}, mesh references={meshes}")
