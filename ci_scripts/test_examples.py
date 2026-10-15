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
        self.versions = {entry["directory"]: self.version for entry in self.manifest["examples"]}

    def validate(self, manifest):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "examples.json"
            path.write_text(json.dumps(manifest))
            return examples.load_manifest(path)

    def test_each_example_has_one_link_and_build_record(self):
        rendered = examples.render_index(self.manifest, self.versions, self.version)
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "records.tsv"
            examples.write_records(self.manifest, path)
            records = path.read_text().splitlines()
        self.assertEqual(len(records), len(self.manifest["examples"]) + 1)
        for entry, record in zip(self.manifest["examples"], records[1:]):
            self.assertEqual(record.split("\t"), [entry["directory"], entry["title"], ",".join(entry["validation"])])
            self.assertEqual(rendered.count(f'/examples/{entry["directory"]}/README.html'), 1)
            self.assertIn(entry["description"], rendered)

    def test_category_order_and_empty_categories(self):
        self.manifest["categories"].reverse()
        self.manifest["categories"].insert(0, {"id": "empty", "title": "Empty"})
        rendered = examples.render_index(self.manifest, self.versions, self.version)
        self.assertNotIn('#empty', rendered)
        self.assertNotIn('id="empty"', rendered)
        active = {entry["category"] for entry in self.manifest["examples"]}
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
        self.assertLess(rendered.index('/Tuples/'), rendered.index('<h3>Second</h3>'))
        self.assertLess(rendered.index('/AllSyntax/'), rendered.index('<h3>First</h3>'))

    def test_version_notes_and_source_revision_are_preserved(self):
        self.versions["HelloWorld"] = "nightly-2026-09-18-1d982dc"
        rendered = examples.render_index(self.manifest, self.versions, self.version)
        self.assertIn('/HelloWorld/README.html) (Roc nightly-2026-09-18-1d982dc)', rendered)
        self.assertNotIn(f'/FizzBuzz/README.html) (Roc {self.version})', rendered)
        self.assertIn(f'/tree/{self.manifest["revision"]}/examples', rendered)

    def test_invalid_metadata_is_rejected(self):
        for field, value in [("category", "missing"), ("category", []), ("description", ""), ("subcategory", "two\nlines"), ("directory", "../escape"), ("validation", ["build:../escape.roc"])]:
            with self.subTest(field=field, value=value):
                manifest = copy.deepcopy(self.manifest)
                manifest["examples"][0][field] = value
                with self.assertRaises(ValueError):
                    self.validate(manifest)

    def test_duplicate_categories_and_examples_are_rejected(self):
        for field in ["categories", "examples"]:
            with self.subTest(field=field):
                manifest = copy.deepcopy(self.manifest)
                manifest[field].append(manifest[field][0])
                with self.assertRaisesRegex(ValueError, "duplicate"):
                    self.validate(manifest)


if __name__ == "__main__":
    unittest.main()
