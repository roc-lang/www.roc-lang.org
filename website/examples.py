"""Validate the examples manifest and render its categorized Markdown index."""

import argparse
from html import escape
import json
from pathlib import Path
import re


def single_line(value):
    return isinstance(value, str) and value.strip() and not any(
        char in value for char in "\t\r\n"
    )


def load_manifest(path):
    manifest = json.loads(Path(path).read_text(encoding="utf-8"))
    if not isinstance(manifest, dict) or set(manifest) != {
        "repository", "revision", "categories", "examples"
    }:
        raise ValueError("examples.json must contain exactly repository, revision, categories, and examples")

    if manifest["repository"] != "https://github.com/roc-lang/examples":
        raise ValueError("unsupported examples repository")
    if not isinstance(manifest["revision"], str) or not re.fullmatch(r"[0-9a-f]{40}", manifest["revision"]):
        raise ValueError("revision must be one full lowercase Git commit SHA")

    categories = manifest["categories"]
    if not isinstance(categories, list) or not categories:
        raise ValueError("categories must be a non-empty list")
    category_ids = set()
    for category in categories:
        if not isinstance(category, dict) or set(category) != {"id", "title"}:
            raise ValueError("each category must contain exactly id and title")
        category_id = category["id"]
        if not isinstance(category_id, str) or not re.fullmatch(r"[a-z][a-z0-9-]*", category_id):
            raise ValueError(f"invalid category id: {category_id!r}")
        if category_id in category_ids:
            raise ValueError(f"duplicate category id: {category_id}")
        category_ids.add(category_id)
        if not single_line(category["title"]):
            raise ValueError(f"invalid title for category {category_id}")

    examples = manifest["examples"]
    if not isinstance(examples, list) or not examples:
        raise ValueError("examples must be a non-empty list")
    seen = set()
    required = {"directory", "title", "description", "category", "validation"}
    for position, example in enumerate(examples, 1):
        if not isinstance(example, dict) or not required <= set(example) or set(example) - required - {"subcategory"}:
            raise ValueError(f"example {position} must contain directory, title, description, category, validation, and optionally subcategory")
        directory = example["directory"]
        if not isinstance(directory, str) or not re.fullmatch(r"[A-Za-z0-9_-]+", directory):
            raise ValueError(f"invalid example directory at position {position}: {directory!r}")
        if directory in seen:
            raise ValueError(f"duplicate example directory: {directory}")
        seen.add(directory)
        category_id = example["category"]
        if not isinstance(category_id, str) or category_id not in category_ids:
            raise ValueError(f"unknown category for {directory}: {category_id!r}")
        for field in ("title", "description", "subcategory"):
            if field in example and not single_line(example[field]):
                raise ValueError(f"invalid {field} for {directory}")
        validation = example["validation"]
        if not isinstance(validation, list) or not validation:
            raise ValueError(f"validation for {directory} must be a non-empty list")
        for action in validation:
            match = re.fullmatch(r"(build|build-dev|test):(.+)", action) if isinstance(action, str) else None
            if not match or match.group(2).startswith("/") or ".." in match.group(2) or not single_line(action):
                raise ValueError(f"invalid validation action for {directory}: {action!r}")
    return manifest


def write_records(manifest, output):
    """Keep the existing shell build/validation loop independent of presentation."""
    lines = [f'{manifest["repository"]}\t{manifest["revision"]}']
    lines.extend(
        "\t".join((example["directory"], example["title"], ",".join(example["validation"])))
        for example in manifest["examples"]
    )
    Path(output).write_text("\n".join(lines) + "\n", encoding="utf-8")


def render_index(manifest, versions, website_version):
    sections = []
    for category in manifest["categories"]:
        examples = [example for example in manifest["examples"] if example["category"] == category["id"]]
        if examples:
            sections.append((category, examples))

    lines = [
        "# Examples", "",
        "Explore Roc through small, runnable examples.", "",
        '<nav class="examples-nav" aria-label="Example categories">',
        "<ul>",
    ]
    for category, _ in sections:
        lines.append(f'<li><a href="#{category["id"]}">{escape(category["title"])}</a></li>')
    lines.extend(["</ul>", "</nav>", ""])

    for category, examples in sections:
        lines.extend([f'<h2 id="{category["id"]}">{escape(category["title"])}</h2>', ""])
        # Ungrouped entries first, then subcategories in first-appearance order.
        groups = dict.fromkeys([None] + [example.get("subcategory") for example in examples])
        for group in groups:
            members = [example for example in examples if example.get("subcategory") == group]
            if not members:
                continue
            if group is not None:
                lines.extend([f"<h3>{escape(group)}</h3>", ""])
            for example in members:
                directory = example["directory"]
                version = versions[directory]
                note = f" (Roc {version})" if version != website_version else ""
                lines.append(f'- [{example["title"]}](/examples/{directory}/README.html){note} — {example["description"]}')
            lines.append("")

    revision = manifest["revision"]
    lines.extend([
        "---", "",
        f"These examples are built and tested with Roc {website_version}, unless noted otherwise.", "",
        f'Their source comes from [roc-lang/examples at {revision[:7]}]({manifest["repository"]}/tree/{revision}/examples).', "",
    ])
    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    records = commands.add_parser("records", help="validate the manifest and write build records")
    records.add_argument("manifest")
    records.add_argument("output")
    index = commands.add_parser("index", help="render the index using the copied examples' version pins")
    index.add_argument("manifest")
    index.add_argument("versions", help="tab-separated directory and nightly records")
    index.add_argument("website_version")
    index.add_argument("output")
    args = parser.parse_args()
    try:
        manifest = load_manifest(args.manifest)
        if args.command == "records":
            write_records(manifest, args.output)
        else:
            versions = dict(line.split("\t") for line in Path(args.versions).read_text().splitlines())
            output = Path(args.output)
            rendered = render_index(manifest, versions, args.website_version)
            # Preserve mtime so the website's cached build can skip unchanged pages.
            if not output.exists() or output.read_text(encoding="utf-8") != rendered:
                output.write_text(rendered, encoding="utf-8")
    except (ValueError, KeyError) as error:
        parser.error(str(error))


if __name__ == "__main__":
    main()
