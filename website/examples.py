"""Validate the examples manifest and render its categorized Markdown index."""

import argparse
from html import escape
import json
from pathlib import Path
import re
import shutil


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
        if not isinstance(example, dict) or not required <= set(example) or set(example) - required - {"subcategory", "enabled"}:
            raise ValueError(f"example {position} must contain directory, title, description, category, validation, and optionally subcategory and enabled")
        directory = example["directory"]
        if not isinstance(directory, str) or not re.fullmatch(r"[A-Za-z0-9_-]+", directory):
            raise ValueError(f"invalid example directory at position {position}: {directory!r}")
        if directory in seen:
            raise ValueError(f"duplicate example directory: {directory}")
        seen.add(directory)
        if "enabled" in example and not isinstance(example["enabled"], bool):
            raise ValueError(f"enabled for {directory} must be a boolean")
        category_id = example["category"]
        if not isinstance(category_id, str) or category_id not in category_ids:
            raise ValueError(f"unknown category for {directory}: {category_id!r}")
        for field in ("title", "description", "subcategory"):
            if field in example and not single_line(example[field]):
                raise ValueError(f"invalid {field} for {directory}")
        validation = example["validation"]
        if not isinstance(validation, list):
            raise ValueError(f"validation for {directory} must be a list")
        for action in validation:
            match = re.fullmatch(r"(build|build-dev|test|check):(.+)", action) if isinstance(action, str) else None
            if not match or match.group(2).startswith("/") or ".." in match.group(2) or not single_line(action):
                raise ValueError(f"invalid validation action for {directory}: {action!r}")
    return manifest


def enabled_examples(manifest):
    return [example for example in manifest["examples"] if example.get("enabled", True)]


def write_records(manifest, output):
    """Keep the existing shell build/validation loop independent of presentation."""
    lines = [f'{manifest["repository"]}\t{manifest["revision"]}']
    lines.extend(
        "\t".join((example["directory"], example["title"], ",".join(example["validation"])))
        for example in enabled_examples(manifest)
    )
    Path(output).write_text("\n".join(lines) + "\n", encoding="utf-8")


def render_index(manifest):
    enabled = enabled_examples(manifest)
    sections = []
    for category in manifest["categories"]:
        examples = [example for example in enabled if example["category"] == category["id"]]
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
                # MultiLineComments contains only comments, with no code to validate.
                note = "" if example["validation"] or directory == "MultiLineComments" else " (not validated)"
                lines.append(f'- [{example["title"]}](/examples/{directory}/README.html){note} — {example["description"]}')
            lines.append("")

    revision = manifest["revision"]
    lines.extend([
        "---", "",
        "Each example’s page lists the Roc version used to validate it.", "",
        f'Their source comes from [roc-lang/examples at {revision[:7]}]({manifest["repository"]}/tree/{revision}/examples).', "",
    ])
    return "\n".join(lines)


def copy_images(manifest, source, output):
    """Copy example images alongside the HTML generated from their READMEs."""
    source, output = Path(source), Path(output)
    for example in manifest["examples"]:
        if not example.get("enabled", True):
            continue
        for image in (source / example["directory"]).rglob("*"):
            if image.is_file() and image.suffix.lower() in {".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp"}:
                destination = output / image.relative_to(source)
                destination.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(image, destination)


def add_version_notes(manifest, versions, output):
    """Show the validated compiler version on each example's generated page."""
    for example in enabled_examples(manifest):
        directory = example["directory"]
        page = Path(output) / directory / "README.html"
        html = page.read_text(encoding="utf-8")
        if example["validation"]:
            message = f'Validated with Roc <code>{escape(versions[directory])}</code>.'
        else:
            message = "This example is not validated."
        note = f'<p class="example-version">{message}</p>'
        html = re.sub(r'<p class="example-version">.*?</p>', "", html)
        if "</main>" not in html:
            raise ValueError(f"No main content found in {page}")
        html = html.replace("</main>", note + "\n</main>", 1)
        page.write_text(html, encoding="utf-8")


SEARCH_START = "<!-- Website examples search start -->"
SEARCH_END = "<!-- Website examples search end -->"


def index_search(manifest, source, pages, index_path):
    """Add published examples to the compiler's extensible HTML search index."""
    source, pages, index_path = Path(source), Path(pages), Path(index_path)
    original = index_path.read_text(encoding="utf-8")
    entries = []
    for example in enabled_examples(manifest):
        directory = example["directory"]
        root = source / directory
        readme = root / "README.md"
        destination = pages / directory / "README.html"
        if not readme.is_file() or not destination.is_file():
            raise ValueError(f"Cannot index unpublished example {directory}: README source or page missing")
        files = sorted(path for path in root.rglob("*")
                       if path.is_file() and path.suffix in {".md", ".roc"}
                       and not any(part.startswith(".") for part in path.relative_to(root).parts))
        text = example["description"] + "\n" + "\n".join(
            path.read_text(encoding="utf-8") for path in files)
        entries.append(
            f'<article data-category="guides" data-title="{escape(example["title"], quote=True)}" '
            f'data-href="/examples/{directory}/README.html"><p>{escape(text)}</p></article>')
    fragment = SEARCH_START + "\n" + "\n".join(entries) + "\n" + SEARCH_END
    if SEARCH_START in original:
        before, _, rest = original.partition(SEARCH_START)
        _, separator, after = rest.partition(SEARCH_END)
        if not separator:
            raise ValueError("Incomplete website examples search section")
        updated = before + fragment + after
    else:
        updated = original.rstrip() + "\n" + fragment + "\n"
    if updated != original:
        index_path.write_text(updated, encoding="utf-8")
    return len(entries)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    records = commands.add_parser("records", help="validate the manifest and write build records")
    records.add_argument("manifest")
    records.add_argument("output")
    index = commands.add_parser("index", help="render the categorized examples index")
    index.add_argument("manifest")
    index.add_argument("output")
    images = commands.add_parser("images", help="copy enabled examples' images into the generated site")
    images.add_argument("manifest")
    images.add_argument("source")
    images.add_argument("output")
    versions = commands.add_parser("versions", help="add compiler version notes to example pages")
    versions.add_argument("manifest")
    versions.add_argument("versions", help="tab-separated directory and nightly records")
    versions.add_argument("output")
    search = commands.add_parser("search", help="index published examples in generated docs search")
    search.add_argument("manifest")
    search.add_argument("source")
    search.add_argument("pages")
    search.add_argument("index")
    args = parser.parse_args()
    try:
        manifest = load_manifest(args.manifest)
        if args.command == "search":
            count = index_search(manifest, args.source, args.pages, args.index)
            print(f"Indexed {count} published examples in documentation search")
        elif args.command == "records":
            write_records(manifest, args.output)
        elif args.command == "images":
            copy_images(manifest, args.source, args.output)
        elif args.command == "versions":
            versions = dict(line.split("\t") for line in Path(args.versions).read_text().splitlines())
            add_version_notes(manifest, versions, args.output)
        else:
            output = Path(args.output)
            rendered = render_index(manifest)
            # Preserve mtime so the website's cached build can skip unchanged pages.
            if not output.exists() or output.read_text(encoding="utf-8") != rendered:
                output.write_text(rendered, encoding="utf-8")
    except (ValueError, KeyError) as error:
        parser.error(str(error))


if __name__ == "__main__":
    main()
