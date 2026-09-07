#!/usr/bin/env python3
"""Capture private recovery state and import unchanged Git histories locally."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import stat
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parents[2]
SOURCES = {'campusweave': 'planner', 'rexp-studio': 'policy-engine'}
ENV = {**os.environ, 'GIT_OPTIONAL_LOCKS': '0'}


def git(repo, *args, data=None):
    return subprocess.run(['git', '-C', str(repo), *args], input=data,
                          stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                          env=ENV, check=True).stdout


def write_json(path, value):
    path.write_text(json.dumps(value, indent=2, sort_keys=True) + '\n')


def file_record(path):
    info = path.lstat()
    if stat.S_ISLNK(info.st_mode):
        data = os.readlink(path).encode()
        mode = '120000'
    elif stat.S_ISREG(info.st_mode):
        data = path.read_bytes()
        mode = '100755' if info.st_mode & 0o111 else '100644'
    else:
        raise RuntimeError(f'Unsupported file type: {path}')
    return {'sha256': hashlib.sha256(data).hexdigest(), 'git_mode': mode,
            'mode': stat.S_IMODE(info.st_mode), 'size': len(data)}


def inventory(source):
    refs = git(source, 'for-each-ref', '--format=%(refname) %(objectname) %(symref)').decode()
    index = git(source, 'ls-files', '--stage', '-z')
    if any(row.split(b'\t')[0].split()[-1] != b'0' for row in index.split(b'\0') if row):
        raise RuntimeError('Unmerged index; capture cannot produce checkpoints')
    untracked = git(source, 'ls-files', '--others', '--exclude-standard', '-z').decode().split('\0')
    tracked = git(source, 'ls-files', '-z').decode().split('\0')
    files = {}
    for name in sorted(set(tracked + untracked) - {''}):
        path = source / name
        if path.exists() or path.is_symlink():
            files[name] = file_record(path)
    return {'refs': refs, 'head': git(source, 'rev-parse', 'HEAD').decode().strip(),
            'head_symbolic': git(source, 'symbolic-ref', 'HEAD').decode().strip(),
            'index': index.decode(), 'untracked': sorted(set(untracked) - {''}),
            'files': files,
            'staged_sha256': hashlib.sha256(git(source, 'diff', '--cached', '--binary', '--full-index', 'HEAD')).hexdigest(),
            'unstaged_sha256': hashlib.sha256(git(source, 'diff', '--binary', '--full-index')).hexdigest()}


def tree_manifest(root, paths):
    return {name: file_record(root / name) for name in paths
            if (root / name).exists() or (root / name).is_symlink()}


def capture(recovery):
    recovery.mkdir(mode=0o700, parents=True, exist_ok=False)
    os.chmod(recovery, 0o700)
    for name in SOURCES:
        source = ROOT.parent / name
        target = recovery / name
        target.mkdir(mode=0o700)
        before = inventory(source)
        common = Path(git(source, 'rev-parse', '--path-format=absolute', '--git-common-dir').decode().strip())
        shutil.copytree(common, target / 'git-common', symlinks=True)
        # The common directory includes all linked-worktree administrative directories,
        # reflogs, stashes, loose objects and packs, including unreachable objects.
        (target / 'worktrees.txt').write_bytes(git(source, 'worktree', 'list', '--porcelain'))
        (target / 'index.entries').write_bytes(git(source, 'ls-files', '--stage', '-z'))
        (target / 'staged.patch').write_bytes(git(source, 'diff', '--cached', '--binary', '--full-index', 'HEAD'))
        (target / 'unstaged.patch').write_bytes(git(source, 'diff', '--binary', '--full-index'))
        for rel in before['files']:
            dst = target / 'working-tree' / rel
            dst.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source / rel, dst, follow_symlinks=False)
        after = inventory(source)
        if before != after or tree_manifest(target / 'working-tree', before['files']) != before['files']:
            raise RuntimeError(f'{name} changed during capture; abort before import')
        # Confirm copied object/index/ref/reflog bytes against the source metadata.
        metadata = [str(p.relative_to(common)) for p in common.rglob('*') if p.is_file() or p.is_symlink()]
        if tree_manifest(common, metadata) != tree_manifest(target / 'git-common', metadata):
            raise RuntimeError(f'{name} Git metadata changed during backup')
        write_json(target / 'inventory.json', before)
        print(f'{name}: stable capture, {len(before["files"])} files, {len(before["untracked"])} untracked')


def checkpoint(message):
    if git(ROOT, 'diff', '--cached', '--name-only').strip():
        git(ROOT, 'commit', '-m', message)
    return git(ROOT, 'rev-parse', 'HEAD').decode().strip()


def import_sources(recovery):
    if (ROOT / '.git').exists():
        raise RuntimeError('Destination already initialized; refusing to repeat import')
    for name in SOURCES:
        saved = json.loads((recovery / name / 'inventory.json').read_text())
        if inventory(ROOT.parent / name) != saved:
            raise RuntimeError(f'{name} changed since capture; recapture required')
    git(ROOT, 'init', '-b', 'main')
    git(ROOT, 'add', '.')
    git(ROOT, 'commit', '-m', 'Scaffold CampusWeave monorepo and migration contract')
    report = {'recovery': str(recovery), 'sources': {}}
    for name, app in SOURCES.items():
        source = ROOT.parent / name
        backup = recovery / name
        saved = json.loads((backup / 'inventory.json').read_text())
        prefix = f'apps/{app}'
        namespace = f'refs/migration-sources/{name}'
        git(ROOT, 'fetch', '--no-tags', '--no-write-fetch-head', str(backup / 'git-common'), f'+refs/*:{namespace}/*')
        for line in saved['refs'].splitlines():
            ref, oid, *sym = line.split()
            destref = namespace + ref.removeprefix('refs')
            if git(ROOT, 'rev-parse', destref).decode().strip() != oid:
                raise RuntimeError(f'Ref mismatch: {ref}')
            if sym:
                git(ROOT, 'symbolic-ref', destref, namespace + sym[0].removeprefix('refs'))
        main = git(ROOT, 'rev-parse', f'{namespace}/heads/main').decode().strip()
        git(ROOT, 'merge', '--no-ff', '--allow-unrelated-histories', '-s', 'ours', '--no-commit', main)
        git(ROOT, 'read-tree', f'--prefix={prefix}/', '-u', main)
        git(ROOT, 'commit', '-m', f'Import {name} history intact under {prefix}')
        imported = git(ROOT, 'rev-parse', 'HEAD').decode().strip()
        if git(ROOT, 'rev-parse', f'HEAD:{prefix}') != git(ROOT, 'rev-parse', f'{main}^{{tree}}'):
            raise RuntimeError('Imported subtree differs from original main')
        if saved['head'] != main:
            raise RuntimeError('Source checkout is not main; explicit HEAD checkpoint needed')
        commits = {}
        for stage in ['staged', 'unstaged']:
            patch = (backup / f'{stage}.patch').read_bytes()
            if patch:
                git(ROOT, 'apply', '--index', '--binary', f'--directory={prefix}', '-', data=patch)
            commits[stage] = checkpoint(f'Capture {name} local {stage} changes')
        for rel in saved['untracked']:
            # Reviewed source/docs/tests/fonts only; all ignored files were excluded at capture.
            if Path(rel).parts[0] not in {'docs', 'src', 'tests', 'tools', 'web', 'design-preview'}:
                raise RuntimeError(f'Unreviewed untracked path: {rel}')
            dst = ROOT / prefix / rel
            dst.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(backup / 'working-tree' / rel, dst, follow_symlinks=False)
            git(ROOT, 'add', '-f', '--', f'{prefix}/{rel}')
        commits['untracked'] = checkpoint(f'Capture {name} reviewed local additions')
        current = tree_manifest(ROOT / prefix, saved['files'])
        # Git preserves executable mode and symlink identity, not arbitrary POSIX bits.
        comparable = lambda rows: {p: {k:v for k,v in r.items() if k != 'mode'} for p,r in rows.items()}
        tracked = set(git(ROOT, 'ls-files', '-z', '--', prefix).decode().split('\0')) - {''}
        if tracked != {f'{prefix}/{p}' for p in saved['files']} or comparable(current) != comparable(saved['files']):
            raise RuntimeError('Local-content checkpoint does not match captured manifest')
        git(ROOT, 'merge-base', '--is-ancestor', main, 'HEAD')
        if inventory(source) != saved:
            raise RuntimeError('Source changed during import')
        write_json(ROOT / 'docs/migration' / f'{name}-manifest.json', {'files': saved['files'], 'refs': saved['refs'], 'head': saved['head'], 'head_symbolic': saved['head_symbolic']})
        report['sources'][name] = {'original_main': main, 'import_commit': imported, 'checkpoints': commits, 'file_count': len(current), 'verified': True}
        print(f'{name}: history, refs, ancestry and authoritative local files verified')
    git(ROOT, 'fsck', '--full')
    report['object_integrity'] = 'git fsck --full passed'
    write_json(ROOT / 'docs/migration/import-report.json', report)


if __name__ == '__main__':
    command, directory = sys.argv[1:]
    {'capture': capture, 'import': import_sources}[command](Path(directory).resolve())
