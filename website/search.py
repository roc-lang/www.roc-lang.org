"""Add the website FAQ to the compiler's extensible HTML search index."""

import argparse
from html import escape
from html.parser import HTMLParser
from pathlib import Path


class MainContent(HTMLParser):
    """Extract article markup without site navigation or decorative SVGs."""

    def __init__(self):
        super().__init__()
        self.in_main = False
        self.found_main = False
        self.ignored = []
        self.parts = []

    def handle_starttag(self, tag, attrs):
        if tag == "main":
            self.in_main = self.found_main = True
        elif self.in_main:
            if tag in {"svg", "script", "style", "nav", "footer"}:
                self.ignored.append(tag)
            elif not self.ignored:
                self.parts.append(self.get_starttag_text())

    def handle_endtag(self, tag):
        if tag == "main":
            self.in_main = False
        elif self.in_main:
            if self.ignored:
                if tag == self.ignored[-1]:
                    self.ignored.pop()
            else:
                self.parts.append(f"</{tag}>")

    def handle_data(self, data):
        if self.in_main and not self.ignored:
            self.parts.append(escape(data))


SEARCH_START = "<!-- Website FAQ search start -->"
SEARCH_END = "<!-- Website FAQ search end -->"


def index_faq(page_path, index_path):
    page = MainContent()
    page.feed(Path(page_path).read_text(encoding="utf-8"))
    page.close()
    if not page.found_main or page.in_main:
        raise ValueError(f"No complete main content found in {page_path}")
    fragment = (
        SEARCH_START + '\n<article data-full-navigation data-sections '
        'data-category="guides" data-title="FAQ" data-href="/faq">\n'
        + "".join(page.parts) + "\n</article>\n" + SEARCH_END
    )
    index_path = Path(index_path)
    original = index_path.read_text(encoding="utf-8")
    if SEARCH_START in original:
        before, _, rest = original.partition(SEARCH_START)
        _, separator, after = rest.partition(SEARCH_END)
        if not separator:
            raise ValueError("Incomplete website FAQ search section")
        updated = before + fragment + after
    else:
        updated = original.rstrip() + "\n" + fragment + "\n"
    if updated != original:
        index_path.write_text(updated, encoding="utf-8")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("page", help="generated FAQ HTML page")
    parser.add_argument("index", help="generated documentation search index")
    args = parser.parse_args()
    try:
        index_faq(args.page, args.index)
    except (OSError, ValueError) as error:
        parser.error(str(error))
