"""Tests for the published examples manifest and index generation."""

import copy
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("examples", ROOT / "website/examples.py")
examples = importlib.util.module_from_spec(spec)
spec.loader.exec_module(examples)


class ExamplesTests(unittest.TestCase):
    def setUp(self):
        self.manifest = examples.load_manifest(ROOT / "website/examples.json")
        self.version = "nightly-2026-10-09-258ab27"
        self.versions = {entry["directory"]: self.version for entry in self.manifest["examples"] if entry.get("enabled", True)}

    def validate(self, manifest):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "examples.json"
            path.write_text(json.dumps(manifest))
            return examples.load_manifest(path)

    def test_each_enabled_example_has_one_link_and_build_record(self):
        rendered = examples.render_index(self.manifest, self.versions, self.version)
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "records.tsv"
            examples.write_records(self.manifest, path)
            records = path.read_text().splitlines()
        enabled = [entry for entry in self.manifest["examples"] if entry.get("enabled", True)]
        self.assertEqual(len(records), len(enabled) + 1)
        for entry, record in zip(enabled, records[1:]):
            self.assertEqual(record.split("\t"), [entry["directory"], entry["title"], ",".join(entry["validation"])])
            self.assertEqual(rendered.count(f'/examples/{entry["directory"]}/README.html'), 1)
            self.assertIn(entry["description"], rendered)

    def test_category_order_and_empty_categories(self):
        self.manifest["categories"].reverse()
        self.manifest["categories"].insert(0, {"id": "empty", "title": "Empty"})
        rendered = examples.render_index(self.manifest, self.versions, self.version)
        self.assertNotIn('#empty', rendered)
        self.assertNotIn('id="empty"', rendered)
        active = {entry["category"] for entry in self.manifest["examples"] if entry.get("enabled", True)}
        positions = []
        for category in self.manifest["categories"]:
            if category["id"] in active:
                self.assertEqual(rendered.count(f'href="#{category["id"]}"'), 1)
                positions.append(rendered.index(f'id="{category["id"]}"'))
        self.assertEqual(positions, sorted(positions))

    def test_subcategories_are_grouped_in_first_appearance_order(self):
        entries = self.manifest["examples"][:4]
        self.manifest["examples"] = entries
        for entry, group in zip(entries, ["Second", "First", "Second", None]):
            entry["category"] = "getting-started"
            if group:
                entry["subcategory"] = group
        rendered = examples.render_index(self.manifest, self.versions, self.version)
        self.assertEqual(rendered.count('<h3>Second</h3>'), 1)
        self.assertLess(rendered.index(f'/{entries[3]["directory"]}/'), rendered.index('<h3>Second</h3>'))
        self.assertLess(rendered.index(f'/{entries[2]["directory"]}/'), rendered.index('<h3>First</h3>'))

    def test_version_notes_and_source_revision_are_preserved(self):
        self.versions["HelloWorld"] = "nightly-2026-09-18-1d982dc"
        rendered = examples.render_index(self.manifest, self.versions, self.version)
        self.assertIn('/HelloWorld/README.html) (Roc nightly-2026-09-18-1d982dc)', rendered)
        self.assertNotIn(f'/FizzBuzz/README.html) (Roc {self.version})', rendered)
        self.assertIn(f'/tree/{self.manifest["revision"]}/examples', rendered)

    def test_invalid_metadata_is_rejected(self):
        invalid = [
            ("category", "missing"), ("category", []), ("description", ""),
            ("subcategory", "two\nlines"), ("directory", "../escape"),
            ("validation", ["build:../escape.roc"]), ("validation", "check:main.roc"),
            ("validation", ["run:main.roc"]), ("validation", ["check:/main.roc"]),
            ("enabled", "false"), ("enabled", None), ("enabled", 0),
        ]
        for field, value in invalid:
            with self.subTest(field=field, value=value):
                manifest = copy.deepcopy(self.manifest)
                manifest["examples"][0][field] = value
                with self.assertRaises(ValueError):
                    self.validate(manifest)

    def test_disabled_examples_are_omitted_and_can_be_reenabled(self):
        entry = self.manifest["examples"][0]
        entry["enabled"] = False
        self.validate(self.manifest)
        del self.versions[entry["directory"]]
        rendered = examples.render_index(self.manifest, self.versions, self.version)
        self.assertNotIn(f'/examples/{entry["directory"]}/README.html', rendered)
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "records.tsv"
            examples.write_records(self.manifest, path)
            self.assertNotIn(f'{entry["directory"]}\t', path.read_text())

            entry["enabled"] = True
            self.validate(self.manifest)
            self.versions[entry["directory"]] = self.version
            rendered = examples.render_index(self.manifest, self.versions, self.version)
            self.assertIn(f'/examples/{entry["directory"]}/README.html', rendered)
            examples.write_records(self.manifest, path)
            self.assertIn(f'{entry["directory"]}\t', path.read_text())

    def test_disabled_examples_do_not_create_empty_headings(self):
        entry = self.manifest["examples"][0]
        entry["enabled"] = False
        entry["subcategory"] = "Disabled group"
        rendered = examples.render_index(self.manifest, self.versions, self.version)
        self.assertNotIn('<h3>Disabled group</h3>', rendered)

        entry["category"] = "disabled-only"
        self.manifest["categories"].append({"id": "disabled-only", "title": "Disabled only"})
        rendered = examples.render_index(self.manifest, self.versions, self.version)
        self.assertNotIn('href="#disabled-only"', rendered)
        self.assertNotIn('id="disabled-only"', rendered)

    def test_check_actions_are_preserved(self):
        self.manifest["examples"][0]["validation"] = ["check:main.roc"]
        manifest = self.validate(self.manifest)
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "records.tsv"
            examples.write_records(manifest, path)
            self.assertIn("HelloWorld\tHello, World!\tcheck:main.roc\n", path.read_text())

    def test_unvalidated_examples_need_no_version(self):
        self.manifest["examples"][0]["validation"] = []
        manifest = self.validate(self.manifest)
        del self.versions["HelloWorld"]
        rendered = examples.render_index(manifest, self.versions, self.version)
        self.assertIn('/HelloWorld/README.html) (not validated)', rendered)

    def test_duplicate_categories_and_examples_are_rejected(self):
        for field in ["categories", "examples"]:
            with self.subTest(field=field):
                manifest = copy.deepcopy(self.manifest)
                manifest[field].append(manifest[field][0])
                with self.assertRaisesRegex(ValueError, "duplicate"):
                    self.validate(manifest)

    def test_images_keep_relative_paths_and_exclude_disabled_examples(self):
        manifest = copy.deepcopy(self.manifest)
        manifest["examples"] = manifest["examples"][:2]
        enabled, disabled = manifest["examples"]
        disabled["enabled"] = False
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "source"
            output = Path(directory) / "build"
            for entry in manifest["examples"]:
                folder = source / entry["directory"] / "images"
                folder.mkdir(parents=True)
                (folder / "screenshot.png").write_bytes(b"example image")
                (folder / "main.roc").write_text("source code")
            examples.copy_images(manifest, source, output)
            self.assertEqual(
                (output / enabled["directory"] / "images/screenshot.png").read_bytes(),
                b"example image",
            )
            self.assertFalse((output / enabled["directory"] / "images/main.roc").exists())
            self.assertFalse((output / disabled["directory"]).exists())


if __name__ == "__main__":
    unittest.main()
