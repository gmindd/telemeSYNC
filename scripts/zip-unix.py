"""Zips a folder with Unix file modes and symlinks, so the archive opens correctly on macOS even when built on Windows.

    python scripts/zip-unix.py <base-dir> <folder> <out.zip> [--link path/in/zip=relative/target ...]

Executables (the launcher, Node, FFmpeg, esbuild) get mode 755 and everything else 644, whatever the source file system
says: NTFS has no execute bit. Symlinks and Windows junctions inside the folder are stored as relative symlinks, and
--link adds extra ones.
"""

import argparse
import os
import re
import stat
import zipfile

EXECUTABLE = re.compile(r'(\.command$|^runtime/[^/]+/(node|ffmpeg)$|/@esbuild/[^/]+/bin/esbuild$)')


def link_target(path):
    """Target of a symlink or junction, or None for a regular file or folder."""
    try:
        return os.readlink(path)
    except (OSError, ValueError):
        return None


def add_symlink(z, arcname, target):
    info = zipfile.ZipInfo(arcname)
    info.create_system = 3  # Unix, so external_attr is read as a mode
    info.external_attr = (stat.S_IFLNK | 0o777) << 16
    z.writestr(info, target)


def add_file(z, path, arcname, executable):
    info = zipfile.ZipInfo.from_file(path, arcname)
    info.create_system = 3
    info.external_attr = (stat.S_IFREG | (0o755 if executable else 0o644)) << 16
    info.compress_type = zipfile.ZIP_DEFLATED
    with open(path, 'rb') as f, z.open(info, 'w', force_zip64=True) as out:
        while chunk := f.read(1 << 20):
            out.write(chunk)


def add_dir(z, arcname):
    info = zipfile.ZipInfo(arcname.rstrip('/') + '/')
    info.create_system = 3
    info.external_attr = (stat.S_IFDIR | 0o755) << 16
    z.writestr(info, b'')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('base')
    parser.add_argument('folder')
    parser.add_argument('out')
    parser.add_argument('--link', action='append', default=[])
    args = parser.parse_args()
    base, folder, out = args.base, args.folder, args.out
    links = [a.split('=', 1) for a in args.link]
    root = os.path.join(base, folder)
    if os.path.exists(out):
        os.remove(out)
    with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        add_dir(z, folder)
        for dirpath, dirnames, filenames in os.walk(root):
            rel_dir = os.path.relpath(dirpath, base).replace(os.sep, '/')
            for name in sorted(dirnames):
                full = os.path.join(dirpath, name)
                arc = f'{rel_dir}/{name}'
                target = link_target(full)
                if target is not None:
                    dirnames.remove(name)
                    add_symlink(z, arc, relative_target(full, target))
                else:
                    add_dir(z, arc)
            for name in sorted(filenames):
                full = os.path.join(dirpath, name)
                arc = f'{rel_dir}/{name}'
                target = link_target(full)
                if target is not None:
                    add_symlink(z, arc, relative_target(full, target))
                else:
                    in_app = arc[len(folder) + 1:]
                    add_file(z, full, arc, bool(EXECUTABLE.search(in_app)))
        for arc, target in links:
            add_symlink(z, arc, target)


def relative_target(path, target):
    """Symlink targets are made relative to the link's folder; Windows junctions are absolute (\\\\?\\F:\\...)."""
    target = re.sub(r'^\\\\\?\\', '', target)
    if os.path.isabs(target):
        target = os.path.relpath(target, os.path.dirname(path))
    return target.replace(os.sep, '/')


if __name__ == '__main__':
    main()
