# Combined documentation preview — do not merge

This branch combines the website header/navigation and documentation search PRs
for a maintainer-triggered Cloudflare preview. Keep the individual PRs as the
mergeable changes; this branch includes preview-only build wiring and a generated
archive that must not land on main.

The standard `bash build_cloudflare.sh` command still builds the website and
examples with the pinned released compiler. Its documentation generation step
instead unpacks `preview/docs.tar.gz`, generated with the modified docs compiler.
The usual website postprocessing then adds the shared header, Docs Home, Builtin
Types landing page, examples index, and FAQ index. No compiler source build or
custom Cloudflare build command is required. Refreshing the archive also
invalidates cached documentation builds.

`SOURCE.txt` records the compiler source commit and executable version. The archive
contains unmodified generated documentation, before website postprocessing, plus
the search JavaScript from that source commit. It contains no executable compiler.

To refresh from a clean, built `docs-prose-search` checkout:

```sh
python3 preview/refresh.py /path/to/roc
```

Rebuild the compiler first if its Zig sources changed. JavaScript-only search
changes do not need a compiler rebuild. Commit both `docs.tar.gz` and `SOURCE.txt`
after refreshing. Opening a draft PR does not guarantee a preview deployment:
a maintainer must trigger or approve the Cloudflare build for this fork branch.
