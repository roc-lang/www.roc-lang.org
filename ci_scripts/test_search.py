"""Tests for indexing generated website content in documentation search."""

import importlib.util
from pathlib import Path
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("website_search", ROOT / "website/search.py")
search = importlib.util.module_from_spec(spec)
spec.loader.exec_module(search)


class SearchTests(unittest.TestCase):
    def test_faq_sections_keep_anchors_and_exclude_site_chrome(self):
        with tempfile.TemporaryDirectory() as directory:
            page = Path(directory) / "faq.html"
            index = Path(directory) / "search-index.html"
            page.write_text('''<header>Outside navigation</header><main><h1>FAQ</h1>
<nav>Inside navigation</nav><h2 id="option-type">Why no <code>Maybe</code>?</h2>
<p>Use <code>Try</code> &amp; tags.</p><pre><samp>x &lt; y</samp></pre>
<h3 id="details">More details</h3><p>Answer text</p>
<svg><title>Decorative text</title></svg><script>unwanted()</script>
</main><footer>Outside footer</footer>''', encoding="utf-8")
            original = '<article data-category="api">API docs</article>\n<!-- examples -->\n'
            index.write_text(original, encoding="utf-8")
            search.index_faq(page, index)
            result = index.read_text(encoding="utf-8")
            self.assertTrue(result.startswith(original))
            self.assertIn('data-full-navigation data-sections', result)
            self.assertIn('data-category="guides" data-title="FAQ" data-href="/faq"', result)
            self.assertIn('<h2 id="option-type">Why no <code>Maybe</code>?</h2>', result)
            self.assertIn('<h3 id="details">More details</h3>', result)
            self.assertIn('Use <code>Try</code> &amp; tags.', result)
            self.assertIn('x &lt; y', result)
            for excluded in ('navigation', 'footer', 'Decorative text', 'unwanted'):
                self.assertNotIn(excluded, result.replace('data-full-navigation', ''))
            search.index_faq(page, index)
            self.assertEqual(index.read_text(encoding="utf-8"), result)
            page.write_text('<main><h1>FAQ</h1><h2 id="new">New question</h2></main>')
            search.index_faq(page, index)
            self.assertNotIn('option-type', index.read_text())
            self.assertIn('id="new"', index.read_text())

    def test_invalid_input_preserves_existing_index(self):
        with tempfile.TemporaryDirectory() as directory:
            page = Path(directory) / "faq.html"
            index = Path(directory) / "search-index.html"
            for html in ('<p>No main</p>', '<main><p>Unclosed main</p>'):
                page.write_text(html)
                index.write_text('Original index')
                with self.assertRaisesRegex(ValueError, 'complete main'):
                    search.index_faq(page, index)
                self.assertEqual(index.read_text(), 'Original index')
            page.write_text('<main><p>FAQ</p></main>')
            broken = 'Original index\n' + search.SEARCH_START
            index.write_text(broken)
            with self.assertRaisesRegex(ValueError, 'Incomplete website FAQ'):
                search.index_faq(page, index)
            self.assertEqual(index.read_text(), broken)


if __name__ == "__main__":
    unittest.main()
