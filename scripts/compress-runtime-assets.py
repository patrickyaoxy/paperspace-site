#!/usr/bin/env python3
"""Reproducibly gzip public runtime packages; never modify native inputs."""
import gzip
import hashlib
import json
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
RUNTIME = ROOT / 'runtime'


def identity(data, path):
    return {'path': path, 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()}


original = json.loads((RUNTIME / 'runtime-manifest.json').read_text())
manifest = {'schema': 1, 'source': original['source'], 'compression': 'gzip, level=9, mtime=0', 'assets': {}}
for key, name in [('data', 'reader.data'), ('wasm', 'reader.wasm')]:
    raw = (RUNTIME / name).read_bytes()
    expected = original['files'][name]
    assert len(raw) == expected['bytes'] and hashlib.sha256(raw).hexdigest() == expected['sha256'], name + ' original identity mismatch'
    encoded = gzip.compress(raw, compresslevel=9, mtime=0)
    assert gzip.decompress(encoded) == raw
    (RUNTIME / (name + '.gz')).write_bytes(encoded)
    manifest['assets'][key] = {'raw': identity(raw, 'runtime/' + name), 'gzip': identity(encoded, 'runtime/' + name + '.gz')}

(RUNTIME / 'runtime-assets-manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
loader = ROOT / 'runtime-assets.js'
text = loader.read_text()
text, count = re.subn(r'/\* ASSET_MANIFEST_BEGIN \*/.*?/\* ASSET_MANIFEST_END \*/', '/* ASSET_MANIFEST_BEGIN */ ' + json.dumps(manifest, separators=(',', ':')) + ' /* ASSET_MANIFEST_END */', text, flags=re.S)
assert count == 1
loader.write_text(text)
print(json.dumps({'raw_bytes': sum(a['raw']['bytes'] for a in manifest['assets'].values()), 'gzip_bytes': sum(a['gzip']['bytes'] for a in manifest['assets'].values()), 'assets': manifest['assets']}, indent=2))
