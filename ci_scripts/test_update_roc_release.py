import json
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
            with patch.object(updater, "fetch_latest_release", return_value={"assets": assets}), \
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
                for mock in (build, sh, ps1, examples):
                    self.assertEqual(mock.call_count, int(changed))
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
