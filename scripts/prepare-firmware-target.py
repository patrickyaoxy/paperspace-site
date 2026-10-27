#!/usr/bin/env python3
"""Prepare a local, owner-pinned target. Never changes firmware-target.json."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import struct

SOURCE = '79f2f5ad303b9a588d551e3e0eb4b6e5735bc56b'
PARTITIONS = [['nvs', 1, 2, 0x9000, 0x5000], ['phy_init', 1, 1, 0xe000, 0x1000],
              ['ota_0', 0, 16, 0x10000, 0x500000], ['storage', 1, 129, 0x510000, 0x500000],
              ['ota_1', 0, 17, 0xa10000, 0x500000], ['otadata', 1, 0, 0xf10000, 0x2000]]

def require(condition, message):
    if not condition:
        raise ValueError(message)

def sha(data):
    return hashlib.sha256(data).hexdigest()

def safe_file(root, name):
    require(isinstance(name, str) and re.fullmatch(r'[A-Za-z0-9_./-]+', name) and
            not name.startswith('/') and all(p not in ('', '.', '..') for p in name.split('/')), 'Unsafe member path')
    path = (root / name).resolve()
    require(path.is_relative_to(root.resolve()) and path.is_file(), 'Missing/escaped member: ' + name)
    return path

def partitions(data):
    require(len(data) == 3072, 'Partition table must be 3072 bytes')
    rows = []
    for pos in range(0, len(data), 32):
        row = data[pos:pos + 32]
        if row[:2] == b'\xeb\xeb':
            require(rows and row[2:16] == b'\xff' * 14 and row[16:] == hashlib.md5(data[:pos]).digest(), 'Partition MD5 mismatch')
            require(data[pos + 32:] == b'\xff' * (len(data) - pos - 32), 'Partition padding mismatch')
            return rows
        magic, kind, subtype, address, size, label, flags = struct.unpack('<HBBII16sI', row)
        require(magic == 0x50aa and flags == 0 and b'\0' in label, 'Unknown partition magic/flags/label')
        name = label.split(b'\0')[0].decode('ascii')
        require(re.fullmatch(r'[A-Za-z0-9_-]{1,15}', name) and label[len(name):] == b'\0' * (16 - len(name)), 'Invalid partition label')
        require(kind in (0, 1) and address >= 0x9000 and address % (0x10000 if kind == 0 else 4096) == 0 and size > 0 and size % 4096 == 0 and address + size <= 0x1000000, 'Partition geometry')
        require(all(name != r[0] and (address >= r[3] + r[4] or address + size <= r[3]) for r in rows), 'Partition overlap/duplicate')
        rows.append([name, kind, subtype, address, size])
    raise ValueError('Missing partition MD5 terminator')

def image(data, app=False):
    require(len(data) >= 32 and data[0] == 0xe9 and 0 < data[1] <= 16 and struct.unpack_from('<H', data, 12)[0] == 9, 'ESP32-S3 image required')
    pos, checksum = 24, 0xef
    for _ in range(data[1]):
        require(pos + 8 <= len(data), 'Truncated segment header')
        length = struct.unpack_from('<I', data, pos + 4)[0]
        pos += 8
        require(length > 0 and pos + length <= len(data), 'Truncated segment')
        for byte in data[pos:pos + length]:
            checksum ^= byte
        pos += length
    end = (pos + 16) // 16 * 16
    require(end <= len(data) and data[pos:end - 1] == bytes(end - pos - 1) and data[end - 1] == checksum, 'ESP checksum/padding')
    require(data[23] in (0, 1) and len(data) == end + (32 if data[23] else 0), 'ESP image length/digest flag')
    if data[23]:
        require(data[end:] == hashlib.sha256(data[:end]).digest(), 'ESP appended SHA-256')
    if app:
        require(data[23] == 1 and struct.unpack_from('<I', data, 32)[0] == 0xabcd5432, 'App descriptor required')
        return {key: data[offset:offset + 32].split(b'\0')[0].decode('ascii') for key, offset in [('version', 48), ('project', 80), ('idfVersion', 144)]}

def rollback_config(data):
    return bool(re.search(r'^CONFIG_BOOTLOADER_APP_ROLLBACK_ENABLE=y$', data, re.M)) and not re.search(r'^CONFIG_BOOTLOADER_APP_ANTI_ROLLBACK=y$', data, re.M)

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--package', type=Path, required=True)
    parser.add_argument('--trust', type=Path, required=True, help='Reviewed local evidence JSON; see docs/candidate/README.md')
    parser.add_argument('--out', type=Path, required=True, help='New local staging directory; must not already exist')
    args = parser.parse_args()
    package, trust_root = args.package.resolve(), args.trust.resolve().parent
    trust_bytes = args.trust.read_bytes()
    trust = json.loads(trust_bytes)
    require(all(isinstance(trust.get(key), str) and 0 < len(trust[key]) <= 64 for key in ('board', 'model', 'project')), 'Reviewed board/model/project identity required')
    require(isinstance(trust['knownLayouts'], list) and len(trust['knownLayouts']) <= 16 and isinstance(trust['acceptedBootloaders'], list) and len(trust['acceptedBootloaders']) <= 16, 'Reviewed compatibility lists required')
    manifest_bytes = safe_file(package, 'manifest.json').read_bytes()
    require(sha(manifest_bytes) == trust['manifestSha256'], 'Manifest differs from reviewed pin')
    manifest = json.loads(manifest_bytes)
    require(manifest['schema'] == 1 and manifest['source_sha'] == SOURCE and manifest['version'] == '2.0.8' and manifest['chip'] == 'esp32s3' and manifest['flash_size'] == '16MB' and manifest['profile'] == 'product' and not manifest.get('synthetic_demo'), 'Unreviewed firmware identity')
    require(isinstance(manifest.get('files'), dict) and 0 < len(manifest['files']) <= 100, 'Production install manifest requires 1..100 members; use a separately pinned install manifest')
    config = safe_file(trust_root, trust['sdkconfig']).read_text()
    require(rollback_config(config), 'Rollback contract does not match actual sdkconfig')
    contract = {'idfVersion': 'v6.1', 'rollback': True, 'antiRollback': False}
    flash_args = json.loads(safe_file(package, 'flasher_args.json').read_bytes())
    require(flash_args['extra_esptool_args']['chip'] == 'esp32s3' and flash_args['flash_settings']['flash_size'] == '16MB', 'Flasher target mismatch')
    roles = {'bootloader': ('bootloader', 0), 'partitionTable': ('partition-table', 0x8000), 'app': ('app', 0x10000), 'otaData': ('otadata', 0xf10000)}
    images, members, mapping = {}, {'manifest.json': manifest_bytes}, {}
    for role, (arg_key, address) in roles.items():
        entry = flash_args[arg_key]
        require(int(entry['offset'], 0) == address and entry['encrypted'] == 'false', 'Wrong image offset/encryption')
        name = entry['file']
        require(name not in members, 'Duplicate image file')
        data = safe_file(package, name).read_bytes()
        expected = manifest['files'][name]
        require(expected['bytes'] == len(data) and expected['sha256'] == sha(data), 'Manifest image mismatch: ' + name)
        images[role] = {'file': name, 'url': 'firmware/v2.0.8/' + name, 'sha256': sha(data), 'bytes': len(data), 'address': address}
        members[name] = data
        mapping[entry['offset']] = name
    require(mapping == flash_args['flash_files'] == manifest['flash_files'], 'Flash file mapping differs')
    require(32 <= images['bootloader']['bytes'] <= 0x8000 and 288 <= images['app']['bytes'] <= 0x500000, 'Image region bounds')
    require(images['otaData']['bytes'] == 8192 and members[images['otaData']['file']] == b'\xff' * 8192, 'Initial otadata must be all FF')
    require(partitions(members[images['partitionTable']['file']]) == PARTITIONS, 'Target partitions differ')
    image(members[images['bootloader']['file']])
    descriptor = image(members[images['app']['file']], app=True)
    require(descriptor == {'version': '2.0.8', 'project': trust['project'], 'idfVersion': 'v6.1'}, 'App descriptor differs from reviewed identity')
    known = []
    for entry in trust['knownLayouts']:
        data = safe_file(trust_root, entry['partitionFile']).read_bytes()
        rows = partitions(data)
        migration = entry['storageMigration']
        require(re.fullmatch(r'[A-Za-z0-9_-]{1,64}', entry['id']) and all(e['id'] != entry['id'] and e['partitionSha256'] != sha(data) for e in known) and sha(data) != images['partitionTable']['sha256'], 'Duplicate/invalid known layout')
        require(len([r for r in rows if r[1] == 0]) == 1, 'Known layout must be single-slot')
        require(set(migration) == {'method', 'format', 'sectorSize', 'sourceLabel', 'targetLabel'} and migration['method'] == 'byte-copy' and migration['format'] == 'esp-idf-wl-fat' and migration['sectorSize'] == 4096, 'Unreviewed storage migration contract')
        old_storage = next((r for r in rows if r[0] == migration['sourceLabel']), None)
        new_storage = next((r for r in PARTITIONS if r[0] == migration['targetLabel']), None)
        require(old_storage and new_storage and old_storage[1:3] == new_storage[1:3] == [1, 129] and old_storage[4] == new_storage[4], 'Storage migration size/type mismatch')
        require(len([r for r in rows if r[1] == 1]) == 3 and all(r in PARTITIONS for r in rows if r[1] == 1 and r != old_storage) and all(any(r[0] == name and r in PARTITIONS for r in rows) for name in ('nvs', 'phy_init')), 'Migration must preserve exact NVS/PHY regions')
        known.append({'id': entry['id'], 'kind': 'single', 'partitionSha256': sha(data), 'partitions': rows, 'storageMigration': migration})
    accepted = []
    for entry in trust['acceptedBootloaders']:
        data = safe_file(trust_root, entry['file']).read_bytes()
        image(data)
        old_config = safe_file(trust_root, entry['sdkconfig']).read_text()
        require(entry['contract'] == contract and rollback_config(old_config) and 32 <= len(data) <= 0x8000, 'Unreviewed accepted bootloader contract')
        accepted.append({'sha256': sha(data), 'bytes': len(data), **contract})
    target = {key: trust[key] for key in ('board', 'model', 'project')}
    target.update({'version': '2.0.8', 'idfVersion': 'v6.1', 'sourceSha': SOURCE,
                   'manifest': {'url': 'firmware/v2.0.8/manifest.json', 'sha256': sha(manifest_bytes), 'bytes': len(manifest_bytes)},
                   'images': images, 'partitions': PARTITIONS, 'knownLayouts': known,
                   'bootloaderContract': contract, 'acceptedBootloaders': accepted})
    # Output is deliberately separate from the live owner policy. A browser regression
    # must still pass this through the production policy loader before any future use.
    require(not args.out.exists(), 'Staging output already exists; preserve it and select a new directory')
    args.out.mkdir(parents=True)
    for name, data in members.items():
        destination = args.out / 'firmware/v2.0.8' / name
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(data)
    (args.out / 'firmware-target.candidate.json').write_text(json.dumps({'schema': 3, 'enabled': True, 'unavailable_reason': '', 'target': target}, ensure_ascii=False, indent=2) + '\n')
    (args.out / 'preparation-receipt.json').write_text(json.dumps({'sourceSha': SOURCE, 'manifestSha256': sha(manifest_bytes), 'trustSha256': sha(trust_bytes), 'sdkconfigSha256': sha(config.encode()), 'origin': 'MindReset Read Pico 官方 Demo Firmware 二次开发；paperspace 独立维护', 'livePolicyChanged': False, 'deviceWritePerformed': False, 'hardware': 'NOT_TESTED'}, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'out': str(args.out.resolve()), 'manifestSha256': sha(manifest_bytes), 'livePolicyChanged': False}, ensure_ascii=False))

if __name__ == '__main__':
    main()
