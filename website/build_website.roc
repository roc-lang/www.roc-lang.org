app [main!] {
	pf: platform "https://github.com/roc-lang/basic-cli/releases/download/0.21.0/4rAQg8kUYZ3Vksr4qMQHpaFYNiHSn9GgS7gVxghd1XYV.tar.zst",
	roc: "nightly-2026-08-23-fb208ba",
}

import pf.Cmd
import pf.Env
import pf.OsStr exposing [OsStr]
import pf.Path
import pf.Stdout
import pf.Utc
import "./build_website.roc" as script : Str

# Run from website/ with `roc build_website.roc`.
# The compiler is pinned by the `roc:` field in the app header above, which
# is read back out of `script` at runtime. Pass --roc=/path/to/roc to use a
# local build and --roc-src=/path/to/roc/source when it cannot be derived.

cache_marker_path = ".cache/site.millis"

latest_stable_tag = "alpha4-rolling"

compiler_wasm_build_path = "build/echo.wasm"

compiler_wasm_optimized_path = "build/echo.wasm.optimized"

cloudflare_max_asset_size = 26_214_400.U64

binaryen_version = "version_130"

binaryen_dir = ".cache/binaryen-version_130"

binaryen_archive_path = ".cache/binaryen-version_130-node.tar.gz"

binaryen_wasm_opt_path = ".cache/binaryen-version_130/wasm-opt.js"

binaryen_wasm_opt_module_path = ".cache/binaryen-version_130/wasm-opt.wasm"

source_code_pro_commit = "803b7e23ec97ae58b6232ea76519a76d428ba268"

source_code_pro_font_path = "build/fonts/source-code-pro/SourceCodePro-Regular.ttf.woff2"

source_code_pro_font_url = "https://raw.githubusercontent.com/adobe-fonts/source-code-pro/${source_code_pro_commit}/WOFF2/TTF/SourceCodePro-Regular.ttf.woff2"

CompilerInfo : {
	bin : Str,
	src_dir : Str,
	managed : Bool,
	version : Str,
}

main! : List(OsStr) => Try({}, _)
main! = |raw_args| {
	args = raw_args.drop_first(1).map(OsStr.display)
	use_cache = args.any(|arg| arg == "--cache")
	use_minify = args.any(|arg| arg == "--minify")
	examples_only = args.any(|arg| arg == "--examples-only")
	compiler = resolve_compiler!(args)?

	cwd = Env.cwd!()?.display()
	if !cwd.ends_with("/website") {
		Err(RunFromWebsiteDirectory(cwd))?
	} else {}

	if examples_only {
		build_examples_only!(compiler)?
	} else if use_cache {
		path(".cache").create_all!() ?? {}
		build_with_cache!(compiler)?
	} else {
		full_clean_build!(compiler)?
	}

	if use_minify {
		minify_build_assets!()?
	} else {}

	Stdout.line!("Website built in dir 'website/build'.")?
	Ok({})
}

build_examples_only! : CompilerInfo => Try({}, _)
build_examples_only! = |compiler| {
	path("build").delete_all!() ?? {}
	run!("cp", ["-r", "public", "build"])?
	ensure_examples_present!(compiler)?
	generate_site!(compiler.bin)
}

full_clean_build! : CompilerInfo => Try({}, _)
full_clean_build! = |compiler| {
	path("build").delete_all!() ?? {}
	path("content/examples").delete_all!() ?? {}
	path("examples-main").delete_all!() ?? {}

	run!("cp", ["-r", "public", "build"])?
	optimize_compiler_wasm!()?
	ensure_examples_present!(compiler)?
	ensure_fonts_present!()?
	ensure_repl_present!()?
	ensure_builtins_present!(compiler)?
	patch_builtins_html!()?
	generate_site!(compiler.bin)?
	path(".cache").create_all!() ?? {}
	write_cache_millis!(cache_marker_path)?

	Ok({})
}

build_with_cache! : CompilerInfo => Try({}, _)
build_with_cache! = |compiler| {
	path("build").create_all!() ?? {}

	last_build_millis = read_cache_millis!(cache_marker_path) ?? 0
	latest_compiler_pin_millis = max_mtime_in_dirs_millis!(["build_website.roc"]) ?? 0
	compiler_changed = latest_compiler_pin_millis > last_build_millis

	if compiler_changed {
		path("build/docs/main").delete_all!() ?? {}
	} else {}

	ensure_examples_present!(compiler)?
	ensure_fonts_present!()?
	ensure_repl_present!()?
	ensure_builtins_present!(compiler)?
	patch_builtins_html!()?

	latest_content_millis = max_mtime_in_dirs_millis!(["content"]) ?? 0
	latest_public_millis = max_mtime_in_dirs_millis!(["public"]) ?? 0
	latest_generator_millis = max_mtime_in_dirs_millis!(["static_site_gen.roc"]) ?? 0

	content_changed = latest_content_millis > last_build_millis
	public_changed = latest_public_millis > last_build_millis
	generator_changed = latest_generator_millis > last_build_millis

	if content_changed or public_changed or generator_changed or compiler_changed {
		if public_changed {
			run!("cp", ["-r", "public/.", "build/"])?
			optimize_compiler_wasm!()?
		} else {}

		if content_changed or generator_changed or compiler_changed {
			generate_site!(compiler.bin)?
		} else {
			Stdout.line!("Content and generator unchanged; skipping static site generation.")?
		}

		write_cache_millis!(cache_marker_path)?
	} else {
		Stdout.line!("No content, public asset, generator, or compiler-pin changes detected.")?
	}

	Ok({})
}

generate_site! : Str => Try({}, _)
generate_site! = |roc_bin| {
	run!(roc_bin, ["build", "static_site_gen.roc"])?
	run!("./static_site_gen", ["content", "build"])?
	add_github_links_to_examples!()
}

minify_build_assets! : () => Try({}, _)
minify_build_assets! = || {
	minify_build_asset!("build/compiler.js")?
	minify_build_asset!("build/site.css")?
	minify_html_assets!(list_matching_files!("build", ".html")?)
}

minify_html_assets! : List(Str) => Try({}, _)
minify_html_assets! = |paths|
	match paths {
		[] => Ok({})
		[first, .. as rest] => {
			minify_html_asset!(first)?
			minify_html_assets!(rest)
		}
	}

minify_build_asset! : Str => Try({}, _)
minify_build_asset! = |file_path| {
	tmp_path = "${file_path}.min"
	path(tmp_path).delete!() ?? {}
	run!("minify", ["-o", tmp_path, file_path])?
	path(tmp_path).rename!(path(file_path))
}

minify_html_asset! : Str => Try({}, _)
minify_html_asset! = |file_path| {
	tmp_path = "${file_path}.min"
	path(tmp_path).delete!() ?? {}
	# Generated docs use invisible bang comments as soft-navigation stream markers.
	run!("minify", ["--html-keep-comments", "-o", tmp_path, file_path])?
	path(tmp_path).rename!(path(file_path))
}

ensure_binaryen_present! : () => Try({}, _)
ensure_binaryen_present! = || {
	wasm_opt_js_exists = path(binaryen_wasm_opt_path).is_file!()?
	wasm_opt_module_exists = path(binaryen_wasm_opt_module_path).is_file!()?

	if wasm_opt_js_exists and wasm_opt_module_exists {
		Ok({})
	} else {
		path(".cache").create_all!() ?? {}
		path(binaryen_dir).delete_all!() ?? {}
		path(binaryen_archive_path).delete!() ?? {}
		run!(
			"curl",
			[
				"-fsSL",
				"-o",
				binaryen_archive_path,
				"https://github.com/WebAssembly/binaryen/releases/download/${binaryen_version}/binaryen-${binaryen_version}-node.tar.gz",
			],
		)?
		run!("tar", ["-xzf", binaryen_archive_path, "-C", ".cache"])?
		path(binaryen_archive_path).delete!() ?? {}
		Ok({})
	}
}

optimize_compiler_wasm! : () => Try({}, _)
optimize_compiler_wasm! = || {
	ensure_binaryen_present!()?
	path(compiler_wasm_optimized_path).delete!() ?? {}
	run!(
		"node",
		[
			binaryen_wasm_opt_path,
			"--enable-bulk-memory",
			"--enable-nontrapping-float-to-int",
			"-Oz",
			"--converge",
			compiler_wasm_build_path,
			"-o",
			compiler_wasm_optimized_path,
		],
	)?
	path(compiler_wasm_optimized_path).rename!(path(compiler_wasm_build_path))?

	optimized_size = path(compiler_wasm_build_path).size_in_bytes!()?
	if optimized_size > cloudflare_max_asset_size {
		Err(CompilerWasmExceedsCloudflareLimit({ optimized_size, cloudflare_max_asset_size }))
	} else {
		Ok({})
	}
}

ensure_examples_present! : CompilerInfo => Try({}, _)
ensure_examples_present! = |compiler| {
	if compiler.managed {
		ensure_pinned_compiler_downloaded!(compiler)?
	} else if !path(compiler.bin).is_file!()? {
		Err(LocalRocBinaryNotFound(compiler.bin))?
	} else {}

	run!("bash", ["prepare_examples.sh", compiler.bin])
}

ensure_fonts_present! : () => Try({}, _)
ensure_fonts_present! = || {
	if !path("build/fonts").is_dir!()? {
		design_assets_commit = "4d949642ebc56ca455cf270b288382788bce5873"
		design_assets_tarfile = "roc-lang-design-assets-4d94964.tar.gz"
		design_assets_dir = "roc-lang-design-assets-4d94964"

		run!("curl", ["-fLJO", "https://github.com/roc-lang/design-assets/tarball/${design_assets_commit}"])?
		run!("tar", ["-xzf", design_assets_tarfile])?
		run!("mv", ["${design_assets_dir}/fonts", "build/fonts"])?
		path(design_assets_dir).delete_all!() ?? {}
		path(design_assets_tarfile).delete!() ?? {}
	} else {}

	if path(source_code_pro_font_path).exists!()? {
		Ok({})
	} else {
		tmp_path = "${source_code_pro_font_path}.download"
		path("build/fonts/source-code-pro").create_all!()?
		path(tmp_path).delete!() ?? {}
		run!("curl", ["-fL", "-o", tmp_path, source_code_pro_font_url])?
		path(tmp_path).rename!(path(source_code_pro_font_path))
	}
}

ensure_repl_present! : () => Try({}, _)
ensure_repl_present! = || {
	if path("build/repl").is_dir!()? {
		Ok({})
	} else {
		repl_tarfile = "roc_repl_wasm.tar.gz"
		path(repl_tarfile).delete!() ?? {}
		run!("curl", ["-fLJO", "https://github.com/roc-lang/roc/releases/download/${latest_stable_tag}/${repl_tarfile}"])?
		path("build/repl").create_all!()?
		run!("tar", ["-xzf", repl_tarfile, "-C", "build/repl"])?
		path(repl_tarfile).delete!() ?? {}
		Ok({})
	}
}

ensure_builtins_present! : CompilerInfo => Try({}, _)
ensure_builtins_present! = |compiler| {
	path("build/docs").create_all!() ?? {}
	ensure_release_docs!("alpha3", "alpha3-rolling")?
	ensure_release_docs!("alpha4", "alpha4-rolling")?

	if path("build/docs/main").is_dir!()? {
		Ok({})
	} else {
		generate_builtins_docs!(compiler)
	}
}

ensure_release_docs! : Str, Str => Try({}, _)
ensure_release_docs! = |directory, release_tag| {
	output_dir = "build/docs/${directory}"
	if path(output_dir).is_dir!()? {
		Ok({})
	} else {
		tarfile = "${directory}-docs.tar.gz"
		path(tarfile).delete!() ?? {}
		run!("curl", ["-fL", "-o", tarfile, "https://github.com/roc-lang/roc/releases/download/${release_tag}/docs.tar.gz"])?
		path(output_dir).create_all!()?
		run!("tar", ["-xzf", tarfile, "-C", output_dir, "--strip-components=1"])?
		path(tarfile).delete!()?
		Ok({})
	}
}

resolve_compiler! : List(Str) => Try(CompilerInfo, _)
resolve_compiler! = |args| {
	version = extract_roc_version(script)?

	match get_flag_value(args, "--roc=") {
		Ok(bin) => {
			resolved_source =
				match get_flag_value(args, "--roc-src=") {
					Ok(explicit_dir) => Ok({ dir: explicit_dir, managed: Bool.False })
					Err(_) =>
						match bin.split_first("/zig-out/bin/roc") {
							Ok({ before, after: _ }) => Ok({ dir: before, managed: Bool.False })
							Err(_) => {
								Ok({ dir: ".cache/${version}/source", managed: Bool.True })
							}
						}
					}

			resolved = resolved_source?
			Ok({ bin, src_dir: resolved.dir, managed: resolved.managed, version })
		}

		Err(_) => {
			compiler_dir = ".cache/${version}"
			Ok({
				bin: "${compiler_dir}/roc",
				src_dir: "${compiler_dir}/source",
				managed: Bool.True,
				version,
			})
		}
	}
}

extract_roc_version : Str -> Try(Str, _)
extract_roc_version = |source| {
	after_prefix = source.split_first("roc: \"")?
	before_quote = after_prefix.after.split_first("\"")?
	Ok(before_quote.before)
}

get_flag_value : List(Str), Str -> Try(Str, [NotFound])
get_flag_value = |args, prefix|
	match args {
		[] => Err(NotFound)
		[first, .. as rest] =>
			if first.starts_with(prefix) {
				match first.split_first(prefix) {
					Ok({ before: _, after }) => Ok(after)
					Err(_) => get_flag_value(rest, prefix)
				}
			} else {
				get_flag_value(rest, prefix)
			}
		}

ensure_compiler_ready! : CompilerInfo => Try({}, _)
ensure_compiler_ready! = |compiler| {
	if compiler.managed {
		ensure_pinned_compiler_downloaded!(compiler)?
		ensure_roc_source_at_compiler_commit!(compiler)
	} else {
		if !path(compiler.bin).is_file!()? {
			Err(LocalRocBinaryNotFound(compiler.bin))?
		} else {}

		builtin_path = "${compiler.src_dir}/src/build/roc/Builtin.roc"
		if !path(builtin_path).is_file!()? {
			Err(LocalRocSourceNotFound(builtin_path))?
		} else {}

		Ok({})
	}
}

generate_builtins_docs! : CompilerInfo => Try({}, _)
generate_builtins_docs! = |compiler| {
	ensure_compiler_ready!(compiler)?

	path("build/docs/main").create_all!()?
	path("docs/langref").delete_all!() ?? {}
	path("docs/langref").create_all!()?
	run!("cp", ["-R", "${compiler.src_dir}/docs/langref/.", "docs/langref"])?
	run!(
		compiler.bin,
		[
			"docs",
			"--no-cache",
			"${compiler.src_dir}/src/build/roc/Builtin.roc",
			"--output=build/docs/main",
			"--with-lang-ref",
		],
	)?
	path("docs").delete_all!()?
	Ok({})
}

ensure_pinned_compiler_downloaded! : CompilerInfo => Try({}, _)
ensure_pinned_compiler_downloaded! = |compiler| {
	if path(compiler.bin).is_file!()? {
		Ok({})
	} else {
		target_platform = detect_platform!()?
		version_suffix =
			match compiler.version.split_first("nightly-") {
				Ok({ before: _, after }) => after
				Err(_) => compiler.version
			}
		asset_name = "roc_nightly-${target_platform}-${version_suffix}.tar.gz"
		download_url = "https://github.com/roc-lang/nightlies/releases/download/${compiler.version}/${asset_name}"
		tarfile = ".cache/${asset_name}"
		compiler_dir = ".cache/${compiler.version}"

		path(".cache").create_all!()?
		path(compiler_dir).delete_all!() ?? {}
		path(tarfile).delete!() ?? {}
		run!("curl", ["-fsSL", "-o", tarfile, download_url])?
		path(compiler_dir).create_all!()?
		run!("tar", ["-xzf", tarfile, "-C", compiler_dir, "--strip-components=1"])?
		path(tarfile).delete!()?
		Ok({})
	}
}

ensure_roc_source_at_compiler_commit! : CompilerInfo => Try({}, _)
ensure_roc_source_at_compiler_commit! = |compiler| {
	builtin_path = "${compiler.src_dir}/src/build/roc/Builtin.roc"
	if path(builtin_path).is_file!()? {
		Ok({})
	} else {
		commit = compiler_commit_sha!(compiler.bin)?
		tarfile = ".cache/roc-src-${commit}.tar.gz"
		path(tarfile).delete!() ?? {}
		path(compiler.src_dir).delete_all!() ?? {}
		run!("curl", ["-fsSL", "-o", tarfile, "https://github.com/roc-lang/roc/archive/${commit}.tar.gz"])?
		path(compiler.src_dir).create_all!()?
		run!("tar", ["-xzf", tarfile, "-C", compiler.src_dir, "--strip-components=1"])?
		path(tarfile).delete!()?
		Ok({})
	}
}

compiler_commit_sha! : Str => Try(Str, _)
compiler_commit_sha! = |roc_bin| {
	version_output = output!(roc_bin, ["version"])?.stdout_utf8.trim()
	match version_output.split_on("-").last() {
		Ok(commit) if !commit.is_empty() => Ok(commit)
		_ => Err(CannotParseCompilerCommit(version_output))
	}
}

detect_platform! : () => Try(Str, _)
detect_platform! = || {
	target_platform = Env.platform!()
	match (target_platform.os, target_platform.arch) {
		(MACOS, AARCH64) => Ok("macos_apple_silicon")
		(MACOS, X64) => Ok("macos_x86_64")
		(LINUX, X64) => Ok("linux_x86_64")
		(LINUX, AARCH64) => Ok("linux_arm64")
		_ => Err(UnsupportedPlatform(Str.inspect(target_platform)))
	}
}

patch_builtins_html! : () => Try({}, _)
patch_builtins_html! = || {
	index_paths = list_matching_files!("build/docs/main", "/index.html")?
	if index_paths.is_empty() {
		Err(NoGeneratedDocsIndexes)?
	} else {}

	patch_docs_indexes!(index_paths)?
	replace_each_in_file_prefix!(
		"build/docs/main/index.html",
		20_000,
		[
			("<title>Builtin Docs</title>", "<title>Roc Docs</title>"),
			("<title>Documentation Docs</title>", "<title>Roc Docs</title>"),
			("<title> - Documentation</title>", "<title>Roc Docs</title>"),
			(">Builtin</a></h1>", ">Roc Docs</a></h1>"),
			(">Documentation</a></h1>", ">Roc Docs</a></h1>"),
		],
	)?
	# The generated table of contents derives this fragment from heading text,
	# while the heading itself has the stable `underscore` id.
	replace_all_in_file!(
		"build/docs/main/langref/index.html",
		"pattern-matching/#catch-all-patterns-_",
		"pattern-matching/#underscore",
	)?

	css_patch = path("tools/docs-runtime-highlights/website-patches.css").read_utf8!()?
	replace_block_or_append_to_file!(
		"build/docs/main/styles.css",
		"/* Roc website docs patches */",
		"/* End Roc website docs patches */",
		css_patch,
	)?

	run!("go", ["-C", "tools/docs-runtime-highlights", "run", ".", "../../build/docs/main"])?
	Ok({})
}

patch_docs_indexes! : List(Str) => Try({}, _)
patch_docs_indexes! = |paths|
	match paths {
		[] => Ok({})
		[first, .. as rest] => {
			patch_builtins_nav_in_file!(first)?
			add_module_name_to_type_definition!(first)?
			replace_all_in_file!(
				first,
				"pattern-matching/#catch-all-patterns-_",
				"pattern-matching/#underscore",
			)?
			patch_docs_indexes!(rest)
		}
	}

patch_builtins_nav_in_file! : Str => Try({}, _)
patch_builtins_nav_in_file! = |file_path| {
	content = path(file_path).read_utf8!()?
	if content.contains("builtins-tip") {
		Ok({})
	} else {
		match content.split_first("</nav>") {
			Ok({ before, after }) => {
				tip = "<div class=\"builtins-tip\"><b>Tip:</b> <a href=\"/different-names\">Some names</a> differ from other languages.</div>"
				path(file_path).write_utf8!("${before}${tip}</nav>${after}")
			}
			Err(_) => Ok({})
		}
	}
}

add_module_name_to_type_definition! : Str => Try({}, _)
add_module_name_to_type_definition! = |file_path| {
	module_name_start = \\<h1 class="module-name">"""
	module_name_end = "</h1>"
	type_definition_start = "<code class=\"entry-type-def"
	content = path(file_path).read_utf8!()?

	match content.split_first(module_name_start) {
		Ok({ before: before_heading, after: after_heading_start }) =>
			match after_heading_start.split_first(module_name_end) {
				Ok({ before: module_name, after: after_heading }) =>
					match after_heading.split_first(type_definition_start) {
						Ok({ before: before_type_definition, after: after_type_definition_start }) => {
							if before_type_definition.contains("<article") {
								Ok({})
							} else {
								match after_type_definition_start.split_first(">") {
									Ok({ before: opening_tag_rest, after: declaration }) => {
										prefix = "${module_name} "
										if declaration.starts_with(prefix) {
											Ok({})
										} else {
											updated = "${before_heading}${module_name_start}${module_name}${module_name_end}${before_type_definition}${type_definition_start}${opening_tag_rest}>${prefix}${declaration}"
											path(file_path).write_utf8!(updated)
										}
									}
									Err(_) => Ok({})
								}
							}
						}
						Err(_) => Ok({})
					}
				Err(_) => Ok({})
			}
		Err(_) => Ok({})
	}
}

add_github_links_to_examples! : () => Try({}, _)
add_github_links_to_examples! = || {
	if !path("build/examples").is_dir!()? {
		Ok({})
	} else {
		readme_paths = list_matching_files!("build/examples", "/README.html")?
		if readme_paths.is_empty() {
			Err(NoGeneratedExampleReadmes)?
		} else {}

		examples_sha = path("content/examples/.source-revision").read_utf8!()?.trim()
		patch_example_readmes!(readme_paths, examples_sha)
	}
}

patch_example_readmes! : List(Str), Str => Try({}, _)
patch_example_readmes! = |paths, examples_sha|
	match paths {
		[] => Ok({})
		[first, .. as rest] => {
			segments = first.split_on("/").take_last(2)
			example_name =
				match segments {
					[name, _] => name
					_ => ""
				}
			github_logo = "<svg viewBox=\"0 0 98 96\" height=\"25\" xmlns=\"http://www.w3.org/2000/svg\" fill-rule=\"evenodd\" clip-rule=\"evenodd\" role=\"img\" id=\"gh-logo\"><path d='M48.854 0C21.839 0 0 22 0 49.217c0 21.756 13.993 40.172 33.405 46.69 2.427.49 3.316-1.059 3.316-2.362 0-1.141-.80-5.052-.80-9.127-13.59 2.934-16.42-5.867-16.42-5.867-2.184-5.704-5.42-7.17-5.42-7.17-4.448-3.015.324-3.015.324-3.015 4.934.326 7.523 5.052 7.523 5.052 4.367 7.496 11.404 5.378 14.235 4.074.404-3.178 1.699-5.378 3.074-6.6-10.839-1.141-22.243-5.378-22.243-24.283 0-5.378 1.94-9.778 5.014-13.2-.485-1.222-2.184-6.275.486-13.038 0 0 4.125-1.304 13.426 5.052a46.97 46.97 0 0 1 12.214-1.63c4.125 0 8.33.571 12.213 1.63 9.302-6.356 13.427-5.052 13.427-5.052 2.67 6.763.97 11.816.485 13.038 3.155 3.422 5.015 7.822 5.015 13.2 0 18.905-11.404 23.06-22.324 24.283 1.78 1.548 3.316 4.481 3.316 9.126 0 6.6-.80 11.897-.80 13.526 0 1.304.89 2.853 3.316 2.364 19.412-6.52 33.405-24.935 33.405-46.691C97.707 22 75.788 0 48.854 0z'></path></svg>"
			link = "https://github.com/roc-lang/examples/tree/${examples_sha}/examples/${example_name}"
			insert = "<a id=\"gh-example-link\" href=\"${link}\" aria-label=\"view on github\">${github_logo}</a>"
			insert_after_first_if_missing!(first, "id=\"gh-example-link\"", "</h1>", insert)?
			patch_example_readmes!(rest, examples_sha)
		}
	}

replace_all_in_file! : Str, Str, Str => Try({}, _)
replace_all_in_file! = |file_path, search, replacement| {
	content = path(file_path).read_utf8!()?
	updated = content.replace_each(search, replacement)
	if updated == content {
		Ok({})
	} else {
		path(file_path).write_utf8!(updated)
	}
}

replace_block_or_append_to_file! : Str, Str, Str, Str => Try({}, _)
replace_block_or_append_to_file! = |file_path, start_marker, end_marker, replacement| {
	content = path(file_path).read_utf8!()?
	match content.split_first(start_marker) {
		Ok({ before, after }) =>
			match after.split_first(end_marker) {
				Ok({ before: _, after: after_end }) => path(file_path).write_utf8!("${before}${replacement}${after_end}")
				Err(_) => path(file_path).write_utf8!("${before}${replacement}")
			}
		Err(_) => path(file_path).write_utf8!("${content}${replacement}")
	}
}

replace_each_in_file_prefix! : Str, U64, List((Str, Str)) => Try({}, _)
replace_each_in_file_prefix! = |file_path, prefix_len, replacements| {
	bytes = path(file_path).read_bytes!()?
	prefix_bytes = bytes.take_first(prefix_len)
	rest_bytes = bytes.drop_first(prefix_len)
	prefix = Str.from_utf8(prefix_bytes)?
	updated = replacements.fold(prefix, |content, (search, replacement)| content.replace_each(search, replacement))

	if updated == prefix {
		Ok({})
	} else {
		path(file_path).write_bytes!(Str.to_utf8(updated).concat(rest_bytes))
	}
}

insert_after_first_if_missing! : Str, Str, Str, Str => Try({}, _)
insert_after_first_if_missing! = |file_path, marker, search, insertion| {
	content = path(file_path).read_utf8!()?
	if content.contains(marker) {
		Ok({})
	} else {
		match content.split_first(search) {
			Ok({ before, after }) => path(file_path).write_utf8!("${before}${search}${insertion}${after}")
			Err(_) => Ok({})
		}
	}
}

list_matching_files! : Str, Str => Try(List(Str), _)
list_matching_files! = |root, suffix| {
	files = list_files_recursive!(path(root))?
	Ok(files.map(Path.display).keep_if(|file_path| file_path.ends_with(suffix)))
}

list_files_recursive! : Path.Path => Try(List(Path.Path), _)
list_files_recursive! = |root|
	match root.type!() {
		Ok(IsFile) => Ok([root])
		Ok(IsDir) => list_child_files_recursive!(root.list!()?, [])
		Ok(_) => Ok([])
		Err(err) => Err(err)
	}

list_child_files_recursive! : List(Path.Path), List(Path.Path) => Try(List(Path.Path), _)
list_child_files_recursive! = |children, accumulated|
	match children {
		[] => Ok(accumulated)
		[first, .. as rest] => {
			nested = list_files_recursive!(first)?
			list_child_files_recursive!(rest, accumulated.concat(nested))
		}
	}

read_cache_millis! : Str => Try(U128, _)
read_cache_millis! = |file_path|
	U128.from_str(path(file_path).read_utf8!()?)

write_cache_millis! : Str => Try({}, _)
write_cache_millis! = |file_path|
	path(file_path).write_utf8!(Utc.to_millis_since_epoch(Utc.now!()).to_str())

max_mtime_in_dirs_millis! : List(Str) => Try(U128, _)
max_mtime_in_dirs_millis! = |roots|
	max_mtime_in_roots!(roots, 0)

max_mtime_in_roots! : List(Str), U128 => Try(U128, _)
max_mtime_in_roots! = |roots, maximum|
	match roots {
		[] => Ok(maximum)
		[first, .. as rest] =>
			match max_mtime_in_path_millis!(path(first)) {
				Ok(value) => max_mtime_in_roots!(rest, U128.max(maximum, value))
				Err(_) => max_mtime_in_roots!(rest, maximum)
			}
		}

max_mtime_in_path_millis! : Path.Path => Try(U128, _)
max_mtime_in_path_millis! = |root| {
	files = list_files_recursive!(root)?
	max_mtime_in_files!(files, 0)
}

max_mtime_in_files! : List(Path.Path), U128 => Try(U128, _)
max_mtime_in_files! = |files, maximum|
	match files {
		[] => Ok(maximum)
		[first, .. as rest] => {
			modified_millis = Utc.to_millis_since_epoch(first.time_modified!()?)
			max_mtime_in_files!(rest, U128.max(maximum, modified_millis))
		}
	}

path : Str -> Path.Path
path = |str| Path.utf8(str)

run! : Str, List(Str) => Try({}, _)
run! = |program, args|
	Cmd.new_str(program).args_str(args).exec_cmd!()

output! : Str, List(Str) => Try({ stdout_utf8 : Str, stderr_utf8_lossy : Str }, _)
output! = |program, args|
	Cmd.new_str(program).args_str(args).exec_output!()
