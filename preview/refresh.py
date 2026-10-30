"""Generate the compiler docs snapshot used only by this preview branch."""
import argparse
import gzip
from pathlib import Path
import shutil
import subprocess
import tarfile
import tempfile

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('roc_source', type=Path, help='clean docs-prose-search checkout with a built zig-out/bin/roc')
args = parser.parse_args()
source = args.roc_source.resolve()
output = Path(__file__).resolve().parent
if subprocess.check_output(['git', 'status', '--porcelain', '--untracked-files=no'], cwd=source).strip():
    parser.error('Commit tracked compiler changes before generating a preview snapshot')
commit = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=source, text=True).strip()
compiler = source / 'zig-out/bin/roc'
version = subprocess.check_output([str(compiler), 'version'], cwd=source, text=True).strip()
with tempfile.TemporaryDirectory() as directory:
    docs = Path(directory) / 'docs'
    subprocess.run([str(compiler), 'docs', '--builtins', '--with-lang-ref',
                    f'--search-config={source / "docs/search.tsv"}', f'--output={docs}'], cwd=source, check=True)
    # Search assets can be refreshed without rebuilding the compiler executable.
    for name in ('search.js', 'search-core.js', 'styles.css'):
        shutil.copyfile(source / 'src/docs/static' / name, docs / name)
    with (output / 'docs.tar.gz').open('wb') as raw:
        with gzip.GzipFile(fileobj=raw, mode='wb', filename='', mtime=0) as compressed:
            with tarfile.open(fileobj=compressed, mode='w') as archive:
                for path in sorted(docs.rglob('*')):
                    if not path.is_file():
                        continue
                    info = archive.gettarinfo(str(path), arcname=path.relative_to(docs).as_posix())
                    info.mtime = 0
                    info.uid = info.gid = 0
                    info.uname = info.gname = ''
                    info.mode = 0o644
                    with path.open('rb') as content:
                        archive.addfile(info, content)
(output / 'SOURCE.txt').write_text(
    f'Compiler source: https://github.com/ageron/roc/tree/{commit}\n'
    f'Compiler executable: {version}\n'
    'Search JavaScript and stylesheet copied from the recorded source commit.\n'
    'Website header, examples, and FAQ are applied by the website build.\n'
)
print(f'Updated {output / "docs.tar.gz"}')
