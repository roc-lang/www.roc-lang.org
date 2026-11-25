# Editors

## VS Code

Install the official [Roc extension for VS Code](https://marketplace.visualstudio.com/items?itemName=roclang.roc).

## Zed

Install the community-maintained [Roc extension for Zed](https://zed.dev/extensions/roc). It requires `roc` to be on your `PATH`.

## Other editors

The Roc compiler has a built-in language server that should work with any editor that supports the [Language Server Protocol](https://microsoft.github.io/language-server-protocol/) (LSP).

Configure your editor's LSP client with:

- **Command:** `roc`, or the full path to it if it's not on your `PATH`
- **Arguments:** `experimental-lsp`
- **Transport:** stdio
- **Language ID / file type:** `roc`, for files ending in `.roc`

Some editors have a preset that runs `roc_language_server`. That is the old language server, so change the command to the one above.

For syntax highlighting, editors that use [Tree-sitter](https://tree-sitter.github.io/tree-sitter/) can use the community-maintained [tree-sitter-roc](https://github.com/faldor20/tree-sitter-roc) grammar.

### Neovim

With Neovim 0.11 or newer, add this to your `init.lua`:

```lua
vim.lsp.config("roc", {
    cmd = { "roc", "experimental-lsp" },
    filetypes = { "roc" },
    root_markers = { "main.roc", ".git" },
})
vim.lsp.enable("roc")
```

### Helix

Add this to your `languages.toml`:

```toml
[language-server.roc]
command = "roc"
args = ["experimental-lsp"]

[[language]]
name = "roc"
scope = "source.roc"
file-types = ["roc"]
shebangs = ["roc"]
comment-token = "#"
indent = { tab-width = 4, unit = "    " }
language-servers = ["roc"]
auto-format = true
```

Run `hx --health roc` to check the setup. For syntax highlighting, follow the grammar and query steps in the [tree-sitter-roc README](https://github.com/faldor20/tree-sitter-roc#helix), but keep the language server settings above.

### Emacs

Install the community-maintained [roc-ts-mode](https://melpa.org/#/roc-ts-mode). To use the language server with Eglot, add this to your `init.el`:

```elisp
(with-eval-after-load 'eglot
  (add-to-list 'eglot-server-programs
               '(roc-ts-mode . ("roc" "experimental-lsp"))))
```

Then run `M-x eglot` in a Roc file.

### Troubleshooting

If you get stuck, ask for help on [Roc Zulip](https://roc.zulipchat.com).

## Next Steps

- [Tutorial](/tutorial/)
- [Examples](https://www.roc-lang.org/examples)
- [Frequently Asked Questions](https://www.roc-lang.org/faq)
- [Roc Exercism Track](https://exercism.org/tracks/roc)
