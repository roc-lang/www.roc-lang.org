import io
import json
import tarfile
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import update_roc_release as updater


class BrowserCompilerUpdateTests(unittest.TestCase):
    def run_update(self, assets, invalid=False):
        info = dict(tag="nightly-2026-10-01-a932c65", version_date="2026-10-01",
                    build_id="a932c65", shas={key: "a" * 64 for key in updater.ASSET_KEYS})
        with tempfile.TemporaryDirectory() as directory:
            manifest = Path(directory) / "compiler-wasm.json"
            manifest.write_text('{"release": null}')
            with patch.object(updater, "fetch_latest_examples", return_value=("b" * 40, info["tag"])), \
                 patch.object(updater, "fetch_release", return_value={"assets": assets}) as release, \
                 patch.object(updater, "parse_release", return_value=info), \
                 patch.object(updater, "COMPILER_WASM_PATH", str(manifest)), \
                 patch.object(updater, "update_build_website_roc") as build, \
                 patch.object(updater, "update_sh") as sh, \
                 patch.object(updater, "update_ps1") as ps1, \
                 patch.object(updater, "update_examples_json") as examples:
                if invalid:
                    with self.assertRaises(SystemExit):
                        updater.main()
                    changed = False
                else:
                    updater.main()
                    changed = bool(assets)
                release.assert_called_once_with(info["tag"])
                for mock in (build, sh, ps1, examples):
                    self.assertEqual(mock.call_count, int(changed))
                if changed:
                    examples.assert_called_once_with("b" * 40)
                value = json.loads(manifest.read_text())
                self.assertEqual(value, {"release": info["tag"], "sha256": "a" * 64}
                                 if changed else {"release": None})

    def test_missing_artifact_preserves_all_pins(self):
        self.run_update([])

    def test_invalid_digest_preserves_all_pins(self):
        for digest in (None, "", "sha256:abc", "sha512:" + "a" * 64):
            self.run_update([{"name": "echo.wasm.zst", "digest": digest}], invalid=True)

    def test_matching_artifact_updates_browser_and_native_pins(self):
        self.run_update([{"name": "echo.wasm.zst", "digest": "sha256:" + "a" * 64}])


class ExamplePinTests(unittest.TestCase):
    def archive(self, files):
        data = io.BytesIO()
        with tarfile.open(fileobj=data, mode="w:gz") as tar:
            for name, text in files.items():
                content = text.encode()
                member = tarfile.TarInfo(f"examples-{'c' * 40}/{name}")
                member.size = len(content)
                tar.addfile(member, io.BytesIO(content))
        data.seek(0)
        return data

    def test_newest_example_pin_is_chosen(self):
        archive = self.archive({
            "examples/Old/main.roc": 'app [main!] { pf: platform "x.tar.zst", roc: "nightly-2026-10-06-c34079d" }',
            "examples/New/main.roc": 'app [main!] {\n    roc: "nightly-2026-10-21-5349569",\n}',
            "examples/New/Helper.roc": "module [helper]",
            "examples/New/README.md": 'roc: "nightly-2026-10-22-0000000"',
        })
        self.assertEqual(updater.newest_pinned_nightly(archive), "nightly-2026-10-21-5349569")

    def test_examples_without_pins_are_rejected(self):
        archive = self.archive({"examples/HelloWorld/main.roc": "app [main!] {}"})
        with self.assertRaises(SystemExit):
            updater.newest_pinned_nightly(archive)
