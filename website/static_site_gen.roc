app [main!] { pf: platform "https://github.com/lukewilliamboswell/basic-ssg/releases/download/0.11.0/3vqgmE9dzxoPRNgCbUYrfJhcsyV1DKpi8Q8qKAsSt1Br.tar.zst" }

import pf.SSG
import pf.Path
import pf.OsStr
import pf.Html
import pf.HtmlAttributes exposing [id, aria_label, aria_hidden, title, href, class, rel, content, lang, charset, name, color, src]

main! : List(OsStr) => Try({}, [Exit(I32), PagesError(Str), ParseError(Str), WriteError(Str), ..])
main! = |args|
	match args.drop_first(1) {
		[input_dir_arg, output_dir_arg] => {
			input_dir = Path.from_os_str(input_dir_arg)
			output_dir = Path.from_os_str(output_dir_arg)
			pages = SSG.markdown_pages!(input_dir)?

			process_all!(pages, output_dir)
		}

		_ => Err(Exit(1))
	}

process_all! : List(SSG.Page), Path.Path => Try({}, [ParseError(Str), WriteError(Str), ..])
process_all! = |pages, output_dir|
	match pages {
		[] => Ok({})
		[page, .. as rest] => {
			process_page!(page, output_dir)?
			process_all!(rest, output_dir)
		}
	}

process_page! : SSG.Page, Path.Path => Try({}, [ParseError(Str), WriteError(Str), ..])
process_page! = |page, output_dir| {
	in_html = SSG.parse_markdown!(page.source_path)?
	out_html = transform(page.url, in_html)

	SSG.write_file!({ output_dir, output_path: page.output_path, content: out_html })
}

PageInfo : {
	title : Str,
	description : Str,
}

page_data : Dict(Str, PageInfo)
page_data = Dict.empty()
	.insert("/bdfn.html", { title: "Governance | Roc", description: "Learn about the governance model of the Roc programming language." })
	.insert("/community.html", { title: "Community | Roc", description: "Connect with the community of the Roc programming language." })
	.insert("/donate.html", { title: "Donate | Roc", description: "Support the Roc programming language by donating or sponsoring." })
	.insert("/faq.html", { title: "FAQ | Roc", description: "Frequently asked questions about the Roc programming language." })
	.insert("/fast.html", { title: "Fast | Roc", description: "What does it mean that the Roc programming language is fast?" })
	.insert("/friendly.html", { title: "Friendly | Roc", description: "What does it mean that the Roc programming language is friendly?" })
	.insert("/functional.html", { title: "Functional | Roc", description: "What does it mean that the Roc programming language is functional?" })
	.insert("/index.html", { title: "The Roc Programming Language", description: "A fast, friendly, functional language." })
	.insert("/foundation.html", { title: "Foundation | Roc", description: "Learn about the Roc Programming Language Foundation." })
	.insert("/different-names.html", { title: "Different Names | Roc", description: "Names of things in Roc that differ from other languages." })
	.insert("/repl/index.html", { title: "REPL | Roc", description: "Try the Roc programming language in an online REPL." })
	.insert("/examples/index.html", { title: "Examples | Roc", description: "Examples built and tested with the Roc compiler used by this website." })
	.insert("/install/index.html", { title: "Install | Roc", description: "How to install the Roc programming language." })
	.insert("/install/other.html", { title: "Getting started on other systems | Roc", description: "Roc installation guide for other systems" })
	.insert("/install/unix.html", { title: "Getting started on Unix-based OS | Roc", description: "Roc installation guide for Unix-based OS" })
	.insert("/install/windows.html", { title: "Getting started on Windows | Roc", description: "Roc installation guide for Windows" })
	.insert("/install/nix.html", { title: "Getting started with Nix | Roc", description: "Roc installation guide for Nix" })
	.insert("/install/getting_started.html", { title: "Getting started | Roc", description: "How to get started with Roc" })
	.insert("/installnew/index.html", { title: "Install | Roc", description: "How to install the Roc programming language." })
	.insert("/installnew/other.html", { title: "Install on other systems | Roc", description: "Roc installation guide for other systems" })
	.insert("/installnew/unix.html", { title: "Install on Unix | Roc", description: "Roc installation guide for Unix" })
	.insert("/installnew/windows.html", { title: "Install on Windows | Roc", description: "Roc installation guide for Windows" })
	.insert("/installnew/nix.html", { title: "Usage on Nix | Roc", description: "Roc usage guide for Nix" })
	.insert("/404.html", { title: "Page Not Found | Roc", description: "The page you requested could not be found." })

get_page_info : Str -> PageInfo
get_page_info = |page_path_str|
	match page_data.get(page_path_str) {
		Ok(page_info) => page_info
		Err(_) =>
			if page_path_str.contains("/examples/") {
				match page_path_str.split_on("/").take_last(2) {
					[page_title, _] => {
						title: "${page_title} | Roc",
						description: "${page_title} example in the Roc programming language.",
					}
					_ => {
						crash "Expected an example page path with a parent directory, got ${page_path_str}."
					}
				}
			} else {
				crash "Web page ${page_path_str} did not have a title and description specified in page_data. Please add one to website/static_site_gen.roc."
			}
		}

transform : Str, Str -> Str
transform = |page_path_str, html_content|
	Html.render_document(view(page_path_str, html_content))

view : Str, Str -> Html.Node
view = |page_path_str, html_content|
	Html.html(
		[lang("en"), class("no-js")],
		[
			view_head(page_path_str),
			view_body(page_path_str, html_content),
		],
	)

view_head : Str -> Html.Node
view_head = |page_path_str| {
	page_info = get_page_info(page_path_str)

	Html.head(
		[],
		[
			Html.meta([charset("utf-8")]),
			Html.title([], [Html.text(page_info.title)]),
			Html.meta([name("description"), content(page_info.description)]),
			Html.meta([name("viewport"), content("width=device-width")]),
			Html.link([rel("icon"), href("/favicon.svg")]),
			Html.link([rel("prefetch"), href("/repl/roc_repl_wasm.js")]),
			Html.link([rel("stylesheet"), href("/site.css")]),
			# Safari ignores rel="icon" and only respects rel="mask-icon". It renders the
			# SVG with fill="#000" unless this hardcoded color attribute overrides it.
			Html.link([rel("mask-icon"), href("/favicon.svg"), color("#7d59dd")]),
			# Remove no-js before the body renders to avoid a flash of hidden content.
			Html.script([], [Html.text("document.documentElement.className = document.documentElement.className.replace('no-js', '');")]),
			Html.script([src("/compiler.js")], []),
		],
	)
}

view_body : Str, Str -> Html.Node
view_body = |page_path_str, html_content| {
	body_attrs =
		match page_path_str {
			"/index.html" => [id("homepage-main")]
			"/tutorial.html" => [id("tutorial-main"), class("article-layout")]
			_ =>
				if page_path_str.starts_with("/examples/") and page_path_str != "/examples/index.html" {
					[id("example-main")]
				} else {
					[class("article-layout")]
				}
			}

	Html.body(
		body_attrs,
		[
			view_navbar(page_path_str),
			# The repository's Markdown is trusted. Its rendered HTML must remain markup.
			Html.main([], [Html.raw(html_content)]),
			view_footer,
		],
	)
}

view_footer : Html.Node
view_footer = Html.footer(
	[],
	[
		Html.div(
			[id("footer")],
			[
				Html.div(
					[id("gh-link")],
					[
						Html.a(
							[id("gh-centered-link"), href("https://github.com/roc-lang/roc")],
							[gh_logo, Html.span([id("gh-link-text")], [Html.text("roc-lang/roc")])],
						),
					],
				),
			],
		),
	],
)

view_navbar : Str -> Html.Node
view_navbar = |page_path_str| {
	is_homepage = page_path_str == "/index.html"
	home_link_attrs = [id("nav-home-link"), href("/"), title("The Roc Programming Language Homepage")]
		.concat(
			if is_homepage {
				[aria_hidden("true")]
			} else {
				[]
			},
		)

	Html.header(
		[id("top-bar")],
		[
			Html.nav(
				[aria_label("primary")],
				[
					Html.a(home_link_attrs, [roc_logo, Html.span([class("home-link-text")], [Html.text("Roc")])]),
					Html.div(
						[id("top-bar-links")],
						[
							Html.a([href("https://github.com/roc-lang/roc/blob/main/docs/mini-tutorial-new-compiler.md")], [Html.text("Tutorial")]),
							Html.a([href("/install")], [Html.text("Install")]),
							Html.a([href("/examples")], [Html.text("Examples")]),
							Html.a([href("/community")], [Html.text("Community")]),
							Html.a([href("/docs/main/")], [Html.text("Docs")]),
							Html.a([href("/donate")], [Html.text("Donate")]),
						],
					),
				],
			),
		],
	)
}

roc_logo : Html.Node
roc_logo = Html.element("svg")(
	[
		Html.attribute("viewBox")("0 -6 51 58"),
		Html.attribute("xmlns")("http://www.w3.org/2000/svg"),
		Html.attribute("aria-labelledby")("logo-link"),
		Html.attribute("role")("img"),
		class("roc-logo"),
	],
	[
		Html.element("title")([id("logo-link")], [Html.text("Return to Roc Home")]),
		Html.element("polygon")(
			[
				Html.attribute("role")("presentation"),
				Html.attribute("points")("0,0 23.8834,3.21052 37.2438,19.0101 45.9665,16.6324 50.5,22 45,22 44.0315,26.3689 26.4673,39.3424 27.4527,45.2132 17.655,53 23.6751,22.7086"),
			],
			[],
		),
	],
)

gh_logo : Html.Node
gh_logo = Html.element("svg")(
	[
		Html.attribute("viewBox")("0 0 98 96"),
		Html.attribute("height")("25"),
		Html.attribute("xmlns")("http://www.w3.org/2000/svg"),
		Html.attribute("fill-rule")("evenodd"),
		Html.attribute("clip-rule")("evenodd"),
		Html.attribute("role")("img"),
		id("gh-logo"),
	],
	[
		Html.element("path")(
			[Html.attribute("d")("M48.854 0C21.839 0 0 22 0 49.217c0 21.756 13.993 40.172 33.405 46.69 2.427.49 3.316-1.059 3.316-2.362 0-1.141-.08-5.052-.08-9.127-13.59 2.934-16.42-5.867-16.42-5.867-2.184-5.704-5.42-7.17-5.42-7.17-4.448-3.015.324-3.015.324-3.015 4.934.326 7.523 5.052 7.523 5.052 4.367 7.496 11.404 5.378 14.235 4.074.404-3.178 1.699-5.378 3.074-6.6-10.839-1.141-22.243-5.378-22.243-24.283 0-5.378 1.94-9.778 5.014-13.2-.485-1.222-2.184-6.275.486-13.038 0 0 4.125-1.304 13.426 5.052a46.97 46.97 0 0 1 12.214-1.63c4.125 0 8.33.571 12.213 1.63 9.302-6.356 13.427-5.052 13.427-5.052 2.67 6.763.97 11.816.485 13.038 3.155 3.422 5.015 7.822 5.015 13.2 0 18.905-11.404 23.06-22.324 24.283 1.78 1.548 3.316 4.481 3.316 9.126 0 6.6-.08 11.897-.08 13.526 0 1.304.89 2.853 3.316 2.364 19.412-6.52 33.405-24.935 33.405-46.691C97.707 22 75.788 0 48.854 0z")],
			[],
		),
	],
)
