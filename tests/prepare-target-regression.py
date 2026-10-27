#!/usr/bin/env python3
"""Synthetic local generator controls; these are not distributable firmware."""
import copy
import hashlib
import importlib.util
import json
from pathlib import Path
import struct
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / 'scripts/prepare-firmware-target.py'
spec = importlib.util.spec_from_file_location('prepare_target', SCRIPT)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

def esp(app=False):
    payload = bytearray(256 if app else 4)
    if app:
        struct.pack_into('<I', payload, 0, 0xabcd5432)
        for offset, value in [(16, b'2.0.8'), (48, b'paperspace'), (112, b'v6.1')]:
            payload[offset:offset + len(value)] = value
    data = bytearray(24)
    data[0:2] = bytes([0xe9, 1])
    struct.pack_into('<H', data, 12, 9)
    data[23] = 1
    data += struct.pack('<II', 0x3fc90000, len(payload)) + payload
    checksum = 0xef
    for byte in payload:
        checksum ^= byte
    data += bytes((len(data) + 16) // 16 * 16 - len(data) - 1) + bytes([checksum])
    return bytes(data) + hashlib.sha256(data).digest()

def table(rows):
    data = b''.join(struct.pack('<HBBII16sI', 0x50aa, kind, subtype, address, size, name.encode(), 0) for name, kind, subtype, address, size in rows)
    data += b'\xeb\xeb' + b'\xff' * 14 + hashlib.md5(data).digest()
    return data + b'\xff' * (3072 - len(data))

checks = []
with tempfile.TemporaryDirectory(prefix='paperspace-target-') as temp:
    root = Path(temp)
    package = root / 'package'
    package.mkdir()
    members = {'bootloader.bin': esp(), 'partitions.bin': table(module.PARTITIONS), 'app.bin': esp(True), 'ota_data_initial.bin': b'\xff' * 8192}
    roles = {'bootloader': ('0x0', 'bootloader.bin'), 'partition-table': ('0x8000', 'partitions.bin'), 'app': ('0x10000', 'app.bin'), 'otadata': ('0xf10000', 'ota_data_initial.bin')}
    args = {'flash_files': {address: name for address, name in roles.values()}, 'extra_esptool_args': {'chip': 'esp32s3'}, 'flash_settings': {'flash_size': '16MB'}}
    args.update({role: {'offset': address, 'file': name, 'encrypted': 'false'} for role, (address, name) in roles.items()})
    manifest = {'schema': 1, 'source_sha': module.SOURCE, 'version': '2.0.8', 'chip': 'esp32s3', 'flash_size': '16MB', 'profile': 'product', 'flash_files': args['flash_files'], 'files': {name: {'sha256': module.sha(data), 'bytes': len(data)} for name, data in members.items()}}
    manifest_bytes = json.dumps(manifest).encode()
    for name, data in members.items():
        (package / name).write_bytes(data)
    (package / 'manifest.json').write_bytes(manifest_bytes)
    (package / 'flasher_args.json').write_text(json.dumps(args))
    (root / 'sdkconfig').write_text('CONFIG_BOOTLOADER_APP_ROLLBACK_ENABLE=y\n# CONFIG_BOOTLOADER_APP_ANTI_ROLLBACK is not set\n')
    trust = {'manifestSha256': module.sha(manifest_bytes), 'board': 'SYNTHETIC', 'model': 'MEMORY_ONLY', 'project': 'paperspace', 'sdkconfig': 'sdkconfig', 'knownLayouts': [], 'acceptedBootloaders': []}
    def run(name, value, expected):
        trust_path = root / 'trust.json'
        trust_path.write_text(json.dumps(value))
        process = subprocess.run([sys.executable, str(SCRIPT), '--package', str(package), '--trust', str(trust_path), '--out', str(root / name)], capture_output=True, text=True)
        assert (process.returncode == 0) == expected, (name, process.stdout, process.stderr)
        checks.append({'id': name, 'status': 'PASS', 'observedExit': process.returncode})
        return root / name
    out = run('GEN-SYNTHETIC-POSITIVE', trust, True)
    candidate = json.loads((out / 'firmware-target.candidate.json').read_bytes())
    assert candidate['target']['images']['app']['sha256'] == module.sha(members['app.bin'])
    assert json.loads((ROOT / 'firmware-target.json').read_bytes())['enabled'] is False
    assert not (out / 'firmware-target.json').exists()
    changed = copy.deepcopy(trust)
    changed['manifestSha256'] = '0' * 64
    run('GEN-MANIFEST-PIN-NEGATIVE', changed, False)
    changed = copy.deepcopy(trust)
    changed['sdkconfig'] = '../escaped-config'
    run('GEN-PATH-NEGATIVE', changed, False)
    (root / 'badconfig').write_text('CONFIG_BOOTLOADER_APP_ROLLBACK_ENABLE=y\nCONFIG_BOOTLOADER_APP_ANTI_ROLLBACK=y\n')
    changed = copy.deepcopy(trust)
    changed['sdkconfig'] = 'badconfig'
    run('GEN-ROLLBACK-NEGATIVE', changed, False)
    (package / 'app.bin').write_bytes(b'x' * len(members['app.bin']))
    run('GEN-CORRUPTED-IMAGE-NEGATIVE', trust, False)
    (package / 'app.bin').write_bytes(members['app.bin'])
    rows = [r.copy() for r in module.PARTITIONS if r[0] not in ('ota_1', 'otadata')]
    rows[2][2] = 0
    rows[3][3] = 0xa10000
    (root / 'old-partitions.bin').write_bytes(table(rows))
    changed = copy.deepcopy(trust)
    changed['knownLayouts'] = [{'id': 'synthetic-single', 'partitionFile': 'old-partitions.bin', 'storageMigration': {'method': 'byte-copy', 'format': 'esp-idf-wl-fat', 'sectorSize': 4096, 'sourceLabel': 'storage', 'targetLabel': 'storage'}}]
    run('GEN-KNOWN-LAYOUT-POSITIVE', changed, True)
    rows[3][4] -= 4096
    (root / 'old-partitions.bin').write_bytes(table(rows))
    run('GEN-STORAGE-SIZE-NEGATIVE', changed, False)

report = {'suite': 'prepare-target-synthetic-regression', 'scriptSha256': module.sha(SCRIPT.read_bytes()), 'checks': checks, 'realFirmwareValidated': False, 'deviceWritePerformed': False}
output = ROOT / 'evidence/local-checks/prepare-target-regression.json'
output.write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps({'passed': len(checks), 'failed': 0, 'report': str(output)}))
