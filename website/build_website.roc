app [main!] { cli: platform "https://github.com/roc-lang/basic-cli/releases/download/0.20.0/X73hGh05nNTkDHU06FHC0YfFaQB1pimX7gncRcao5mU.tar.br" }

import cli.Stdout
import cli.Arg exposing [Arg]
import cli.Dir
import cli.Cmd
import cli.File
import cli.Env
import cli.Path exposing [Path]
import cli.Utc

# run with: `cd website && roc ./build_website.roc`
# Usage:
#   roc ./build_website.roc           # full, clean build (no cache)
#   roc ./build_website.roc --cache   # incremental build using cache
#   roc ./build_website.roc --minify  # minify build assets after building
#
# Compiler source (for generating builtins docs):
#   By default the latest nightly (zig) compiler and the matching roc source
#   are downloaded. To use a local build instead, pass:
#     roc ./build_website.roc --roc=/path/to/roc/zig-out/bin/roc
#   The roc source dir is derived by stripping "/zig-out/bin/roc" from that
#   path; override it explicitly with:
#     --roc-src=/path/to/roc

latest_stable_tag = "alpha4-rolling"
cache_marker_path = ".cache/site.millis"
new_compiler_dir = "roc-new-compiler-nightly"
compiler_wasm_build_path = "build/echo.wasm"
compiler_wasm_optimized_path = "build/echo.wasm.optimized"
cloudflare_max_asset_size = 26214400u64
binaryen_version = "version_130"
binaryen_dir = ".cache/binaryen-version_130"
binaryen_archive_path = ".cache/binaryen-version_130-node.tar.gz"
binaryen_wasm_opt_path = ".cache/binaryen-version_130/wasm-opt.js"
binaryen_wasm_opt_module_path = ".cache/binaryen-version_130/wasm-opt.wasm"

# Describes which roc compiler + source to use for generating builtins docs.
# `downloaded` is Bool.true when we fetched the nightly compiler and roc source
# ourselves (and so should clean them up afterwards), Bool.false when the user
# pointed us at a local build via `--roc=`.
CompilerInfo : { bin : Str, src_dir : Str, downloaded : Bool }

main! : List Arg => Result {} _
main! = |raw_args|
    args = List.map(raw_args, Arg.display)
    use_cache = List.any(args, |a| a == "--cache")
    use_minify = List.any(args, |a| a == "--minify")
    compiler = resolve_compiler(args)?

    cwd_path = Env.cwd!({}) ? EncCwdFailed
    cwd_path_str = Path.display(cwd_path)

    if !(Str.ends_with(cwd_path_str, "/website")) then
        Err(Exit(1, "You must run this script inside the 'website' directory, I am currently in: ${cwd_path_str}"))?
    else
        {}

    if use_cache then
        # Create .cache/ if it doesn't exist
        _ = Dir.create!(".cache")
        build_with_cache!(compiler)?
    else
        full_clean_build!(compiler)?

    if use_minify then
        minify_build_assets!({})?
    else
        {}

    Stdout.line!("Website built in dir 'website/build'.")

minify_build_assets! : {} => Result {} _
minify_build_assets! = |{}|
    minify_build_asset!("build/compiler.js")?
    minify_build_asset!("build/site.js")?
    minify_build_asset!("build/site.css")?

    html_paths = list_matching_files!("build", ".html")?
    List.for_each_try!(html_paths, minify_html_asset!)?

    Ok({})

minify_build_asset! : Str => Result {} _
minify_build_asset! = |path|
    tmp_path = "${path}.min"

    _ = File.delete!(tmp_path)
    Cmd.exec!("minify", ["-o", tmp_path, path])?
    Cmd.exec!("mv", [tmp_path, path])?

    Ok({})

minify_html_asset! : Str => Result {} _
minify_html_asset! = |path|
    tmp_path = "${path}.min"

    _ = File.delete!(tmp_path)
    # Preserve comments because generated docs pages use invisible bang comments
    # with control bytes as stream markers for soft navigation.
    Cmd.exec!("minify", ["--html-keep-comments", "-o", tmp_path, path])?
    Cmd.exec!("mv", [tmp_path, path])?

    Ok({})

# ----------------
# Full clean build
# ----------------
full_clean_build! : CompilerInfo => Result {} _
full_clean_build! = |compiler|
    # Clean up dirs from previous runs
    _ = Dir.delete_all!("build")
    _ = Dir.delete_all!("content/examples")
    _ = Dir.delete_all!("examples-main")
    _ = Dir.delete_all!("roc")
    _ = Dir.delete_all!(new_compiler_dir)

    Cmd.exec!("cp", ["-r", "public", "build"])?
    optimize_compiler_wasm!({})?

    # Download latest examples
    Cmd.exec!("curl", ["-fL", "-o", "examples-main.zip", "https://github.com/roc-lang/examples/archive/refs/heads/main.zip"])?
    Cmd.exec!("unzip", ["-o", "-q", "examples-main.zip"])?
    Cmd.exec!("cp", ["-R", "examples-main/examples/", "content/examples/"])?
    # replace links in content/examples/index.md to work on the WIP site
    replace_all_in_file!("content/examples/index.md", "](/", "](/examples/")?
    Dir.delete_all!("examples-main") ? DeleteExamplesMainDirFailed
    File.delete!("examples-main.zip") ? DeleteExamplesMainZipFailed

    # download fonts just-in-time so we don't have to bloat the repo with them.
    design_assets_commit = "4d949642ebc56ca455cf270b288382788bce5873"
    design_assets_tarfile = "roc-lang-design-assets-4d94964.tar.gz"
    design_assets_dir = "roc-lang-design-assets-4d94964"

    Cmd.exec!("curl", ["-fLJO", "https://github.com/roc-lang/design-assets/tarball/${design_assets_commit}"])?
    Cmd.exec!("tar", ["-xzf", design_assets_tarfile])?
    Cmd.exec!("mv", ["${design_assets_dir}/fonts", "build/fonts"])?
    Dir.delete_all!(design_assets_dir) ? DeleteDesignAssetsDirFailed
    File.delete!(design_assets_tarfile) ? DeleteDesignAssetsTarFailed

    repl_tarfile = "roc_repl_wasm.tar.gz"
    _ = File.delete!(repl_tarfile)
    # Download the latest stable Web REPL archive.
    Cmd.exec!("curl", ["-fLJO", "https://github.com/roc-lang/roc/releases/download/${latest_stable_tag}/${repl_tarfile}"])?
    Dir.create!("build/repl") ? CreateReplDirFailed
    Cmd.exec!("tar", ["-xzf", repl_tarfile, "-C", "build/repl"])?
    File.delete!(repl_tarfile) ? DeleteReplTarFailed

    # Download prebuilt docs from releases
    alpha3_docs_tarfile = "alpha3-docs.tar.gz"
    alpha4_docs_tarfile = "alpha4-docs.tar.gz"
    _ = File.delete!(alpha3_docs_tarfile)
    _ = File.delete!(alpha4_docs_tarfile)

    # Download alpha3 docs
    Cmd.exec!("curl", ["-fL", "-o", alpha3_docs_tarfile, "https://github.com/roc-lang/roc/releases/download/alpha3-rolling/docs.tar.gz"])?
    Dir.create!("build/docs") ? CreateBuiltinsDirFailed
    Dir.create!("build/docs/alpha3") ? CreateAlpha3DirFailed
    Cmd.exec!("tar", ["-xzf", alpha3_docs_tarfile, "-C", "build/docs/alpha3", "--strip-components=1"])?
    File.delete!(alpha3_docs_tarfile) ? DeleteAlpha3DocsTarFailed

    # Download alpha4 docs
    Cmd.exec!("curl", ["-fL", "-o", alpha4_docs_tarfile, "https://github.com/roc-lang/roc/releases/download/alpha4-rolling/docs.tar.gz"])?
    Dir.create!("build/docs/alpha4") ? CreateAlpha4DirFailed
    Cmd.exec!("tar", ["-xzf", alpha4_docs_tarfile, "-C", "build/docs/alpha4", "--strip-components=1"])?
    File.delete!(alpha4_docs_tarfile) ? DeleteAlpha4DocsTarFailed

    # Make the new (zig) compiler and matching roc source available (downloading
    # them unless the user pointed us at a local build), then generate docs.
    generate_builtins_docs!(compiler)?

    patch_builtins_html!({})?
    write_builtins_redirects!({})?

    # Generate site markdown content
    Cmd.exec!("roc", ["build", "--linker", "legacy", "static_site_gen.roc"])?
    Cmd.exec!("./static_site_gen", ["content", "build"])?

    add_github_links_to_examples!({})?

    Ok({})

# --------------------------------
# Incremental, cached build
# --------------------------------
build_with_cache! : CompilerInfo => Result {} _
build_with_cache! = |compiler|
    # 1) Ensure build/ exists to copy assets into
    _ = Dir.create!("build")

    # 2) Ensure dependencies exist (download once, otherwise reuse)
    ensure_examples_present!({})?
    ensure_fonts_present!({})?
    ensure_repl_present!({})?
    ensure_builtins_present!(compiler)?
    patch_builtins_html!({})?
    write_builtins_redirects!({})?

    # 3) Only rebuild site output if content/public changed since last time
    last_build_millis = read_cache_millis!(cache_marker_path) |> Result.with_default(0i128)
    latest_content_millis = max_mtime_in_dirs_millis!(["content"]) |> Result.with_default(0i128)
    latest_public_millis = max_mtime_in_dirs_millis!(["public"]) |> Result.with_default(0i128)

    content_changed = latest_content_millis > last_build_millis
    public_changed = latest_public_millis > last_build_millis

    if content_changed || public_changed then
        # Copy public → build if public changed
        if public_changed then
            Cmd.exec!("cp", ["-r", "public/.", "build/"])?
            optimize_compiler_wasm!({})?
        else
            {}

        # Only run static site generation if content changed
        if content_changed then
            Cmd.exec!("roc", ["build", "--linker", "legacy", "static_site_gen.roc"])?
            Cmd.exec!("./static_site_gen", ["content", "build"])?

            add_github_links_to_examples!({})?
        else
            Stdout.line!("Content unchanged; skipping static site generation.")?

        write_cache_millis!(cache_marker_path)?
    else
        Stdout.line!("No changes detected in content/ or public/ since last cached build; skipping site generation.")?


    Ok({})

# ------------------------------
# Cache-aware helpers
# ------------------------------

ensure_binaryen_present! : {} => Result {} _
ensure_binaryen_present! = |{}|
    wasm_opt_js_exists = File.is_file!(binaryen_wasm_opt_path) |> Result.with_default(Bool.false)
    wasm_opt_module_exists = File.is_file!(binaryen_wasm_opt_module_path) |> Result.with_default(Bool.false)
    if wasm_opt_js_exists && wasm_opt_module_exists then
        Ok({})
    else
        _ = Dir.create!(".cache")
        _ = Dir.delete_all!(binaryen_dir)
        _ = File.delete!(binaryen_archive_path)
        Cmd.exec!("curl", [
            "-fsSL",
            "-o",
            binaryen_archive_path,
            "https://github.com/WebAssembly/binaryen/releases/download/${binaryen_version}/binaryen-${binaryen_version}-node.tar.gz",
        ])?
        Cmd.exec!("tar", ["-xzf", binaryen_archive_path, "-C", ".cache"])?
        _ = File.delete!(binaryen_archive_path)
        Ok({})

optimize_compiler_wasm! : {} => Result {} _
optimize_compiler_wasm! = |{}|
    ensure_binaryen_present!({})?
    _ = File.delete!(compiler_wasm_optimized_path)
    Cmd.exec!("node", [
        binaryen_wasm_opt_path,
        "--enable-bulk-memory",
        "--enable-nontrapping-float-to-int",
        "-Oz",
        "--converge",
        compiler_wasm_build_path,
        "-o",
        compiler_wasm_optimized_path,
    ])?
    File.rename!(compiler_wasm_optimized_path, compiler_wasm_build_path) ? ReplaceCompilerWithOptimizedWasmFailed

    optimized_size = File.size_in_bytes!(compiler_wasm_build_path)?
    if optimized_size > cloudflare_max_asset_size then
        Err(Exit(1, "Optimized echo.wasm is ${Num.to_str(optimized_size)} bytes, exceeding Cloudflare's 25 MiB (${Num.to_str(cloudflare_max_asset_size)} byte) static asset limit."))?
    else
        {}

    Ok({})

ensure_examples_present! : {} => Result {} _
ensure_examples_present! = |{}|
    # If content/examples already exists, assume it's up-to-date (no re-download on --cache)
    exists = File.is_dir!("content/examples") |> Result.with_default(Bool.false)
    if exists then
        Ok({})
    else
        Cmd.exec!("curl", ["-fL", "-o", "examples-main.zip", "https://github.com/roc-lang/examples/archive/refs/heads/main.zip"])?
        Cmd.exec!("unzip", ["-o", "-q", "examples-main.zip"])?
        Cmd.exec!("cp", ["-R", "examples-main/examples/", "content/examples/"])?
        replace_all_in_file!("content/examples/index.md", "](/", "](/examples/")?
        _ = Dir.delete_all!("examples-main")
        _ = File.delete!("examples-main.zip")
        Ok({})


ensure_fonts_present! : {} => Result {} _
ensure_fonts_present! = |{}|
    fonts_dir_exists = File.is_dir!("build/fonts") |> Result.with_default(Bool.false)
    if fonts_dir_exists then
        Ok({})
    else
        design_assets_commit = "4d949642ebc56ca455cf270b288382788bce5873"
        design_assets_tarfile = "roc-lang-design-assets-4d94964.tar.gz"
        design_assets_dir = "roc-lang-design-assets-4d94964"

        Cmd.exec!("curl", ["-fLJO", "https://github.com/roc-lang/design-assets/tarball/${design_assets_commit}"])?
        Cmd.exec!("tar", ["-xzf", design_assets_tarfile])?
        Cmd.exec!("mv", ["${design_assets_dir}/fonts", "build/fonts"])?
        _ = Dir.delete_all!(design_assets_dir)
        _ = File.delete!(design_assets_tarfile)
        Ok({})

ensure_repl_present! : {} => Result {} _
ensure_repl_present! = |{}|
    repl_dir_exists = File.is_dir!("build/repl") |> Result.with_default(Bool.false)
    if repl_dir_exists then
        Ok({})
    else
        repl_tarfile = "roc_repl_wasm.tar.gz"
        _ = File.delete!(repl_tarfile)
        Cmd.exec!("curl", ["-fLJO", "https://github.com/roc-lang/roc/releases/download/${latest_stable_tag}/${repl_tarfile}"])?
        Dir.create!("build/repl") ? CreateReplDirFailed
        Cmd.exec!("tar", ["-xzf", repl_tarfile, "-C", "build/repl"])?
        _ = File.delete!(repl_tarfile)
        Ok({})

ensure_builtins_present! : CompilerInfo => Result {} _
ensure_builtins_present! = |compiler|
    alpha3_ok = File.is_dir!("build/docs/alpha3") |> Result.with_default(Bool.false)
    alpha4_ok = File.is_dir!("build/docs/alpha4") |> Result.with_default(Bool.false)
    main_ok  = File.is_dir!("build/docs/main")  |> Result.with_default(Bool.false)

    Dir.create!("build/docs") |> Result.with_default({})

    if !alpha3_ok then
        alpha3_docs_tarfile = "alpha3-docs.tar.gz"
        _ = File.delete!(alpha3_docs_tarfile)
        Cmd.exec!("curl", ["-fL", "-o", alpha3_docs_tarfile, "https://github.com/roc-lang/roc/releases/download/alpha3-rolling/docs.tar.gz"])?
        Dir.create!("build/docs/alpha3") ? CreateAlpha3DirFailed
        Cmd.exec!("tar", ["-xzf", alpha3_docs_tarfile, "-C", "build/docs/alpha3", "--strip-components=1"])?
        File.delete!(alpha3_docs_tarfile)?
    else
        {}

    if !alpha4_ok then
        alpha4_docs_tarfile = "alpha4-docs.tar.gz"
        _ = File.delete!(alpha4_docs_tarfile)
        Cmd.exec!("curl", ["-fL", "-o", alpha4_docs_tarfile, "https://github.com/roc-lang/roc/releases/download/alpha4-rolling/docs.tar.gz"])?
        Dir.create!("build/docs/alpha4") ? CreateAlpha4DirFailed
        Cmd.exec!("tar", ["-xzf", alpha4_docs_tarfile, "-C", "build/docs/alpha4", "--strip-components=1"])?
        File.delete!(alpha4_docs_tarfile)?
    else
        {}

    if !main_ok then
        generate_builtins_docs!(compiler)?
    else
        {}

    Ok({})

# ------------------------------
# Compiler resolution & builtins docs
# ------------------------------

# Decide whether to download the nightly compiler + source or use a local build.
# `--roc=<path>` selects a local roc binary; the source dir is derived by
# stripping "/zig-out/bin/roc" from it, or set explicitly with `--roc-src=<path>`.
resolve_compiler : List Str -> Result CompilerInfo _
resolve_compiler = |args|
    when get_flag_value(args, "--roc=") is
        Err(NotFound) ->
            Ok({ bin: "./${new_compiler_dir}/roc", src_dir: "roc", downloaded: Bool.true })

        Ok(bin) ->
            src_dir =
                when get_flag_value(args, "--roc-src=") is
                    Ok(dir) -> Ok(dir)
                    Err(NotFound) ->
                        when Str.split_first(bin, "/zig-out/bin/roc") is
                            Ok({ before }) -> Ok(before)
                            Err(_) -> Err(Exit(1, "Could not derive the roc source directory from --roc=${bin}. Pass --roc-src=<path to roc repo> explicitly."))

            Ok({ bin, src_dir: src_dir?, downloaded: Bool.false })

# Return the value of the first `<prefix>value` arg (e.g. `--roc=/x` -> `/x`).
get_flag_value : List Str, Str -> Result Str [NotFound]
get_flag_value = |args, prefix|
    List.walk(args, Err(NotFound), |state, a|
        when state is
            Ok(_) -> state
            Err(_) ->
                if Str.starts_with(a, prefix) then
                    when Str.split_first(a, prefix) is
                        Ok({ after }) -> Ok(after)
                        Err(_) -> state
                else
                    state)

# Ensure the compiler binary and roc source are available. When downloaded, fetch
# them; when local, just verify the binary and Builtin.roc actually exist so we
# fail early with a clear message instead of deep inside `roc docs`.
ensure_compiler_ready! : CompilerInfo => Result {} _
ensure_compiler_ready! = |compiler|
    if compiler.downloaded then
        ensure_new_compiler_downloaded!({})?
        download_roc_source_at_compiler_commit!({})?
        Ok({})
    else
        bin_exists = File.is_file!(compiler.bin) |> Result.with_default(Bool.false)
        assert(bin_exists, LocalRocBinaryNotFound(compiler.bin))?
        builtin_path = "${compiler.src_dir}/src/build/roc/Builtin.roc"
        builtin_exists = File.is_file!(builtin_path) |> Result.with_default(Bool.false)
        assert(builtin_exists, LocalRocSourceNotFound(builtin_path))?
        Ok({})

# Generate builtins docs into build/docs/main using the resolved compiler.
# `--with-lang-ref` reads the language reference articles from `docs/langref`
# relative to the current working directory (hardcoded in roc's src/cli/main.zig),
# so stage a copy of the source's docs/langref where the compiler expects it, then
# clean it up afterwards. Downloaded compiler + source are removed when done; a
# local build is left untouched.
generate_builtins_docs! : CompilerInfo => Result {} _
generate_builtins_docs! = |compiler|
    ensure_compiler_ready!(compiler)?

    Dir.create!("build/docs/main") ? CreateMainDirFailed
    _ = Dir.delete_all!("docs/langref")
    Dir.create_all!("docs/langref") ? CreateLangRefStagingDirFailed
    Cmd.exec!("cp", ["-R", "${compiler.src_dir}/docs/langref/.", "docs/langref"])?
    Cmd.exec!(compiler.bin, ["docs", "--no-cache", "${compiler.src_dir}/src/build/roc/Builtin.roc", "--output=build/docs/main", "--with-lang-ref"])?
    Dir.delete_all!("docs") ? DeleteLangRefStagingDirFailed

    if compiler.downloaded then
        Dir.delete_all!(compiler.src_dir) ? DeleteRocRepoDirFailed
        Dir.delete_all!(new_compiler_dir) ? DeleteNewCompilerDirFailed
    else
        {}

    Ok({})

# ------------------------------
# New (zig) compiler download
# ------------------------------

# Download the latest nightly build of the new (zig) roc compiler into
# `new_compiler_dir` so we can use it to generate builtins docs. If it is
# already present, skip downloading.
ensure_new_compiler_downloaded! : {} => Result {} _
ensure_new_compiler_downloaded! = |{}|
    binary_path = "${new_compiler_dir}/roc"
    already = File.is_file!(binary_path) |> Result.with_default(Bool.false)
    if already then
        Ok({})
    else
        platform = detect_platform!({})?

        # Verify jq is available (needed to parse the GitHub API response).
        _ = (Cmd.new("jq") |> Cmd.arg("--version") |> Cmd.exec_output!()) ? JqNotAvailable

        # Find the latest nightly asset URL for our platform via the GitHub API.
        # The Cloudflare build infra shares IPs across tenants, so the 60/hr
        # unauthenticated rate limit is usually exhausted. When GITHUB_TOKEN
        # is set in the env, send it as a bearer token to get the 5000/hr
        # authenticated limit. Bash inherits the env var from this process.
        # NOTE: contains one-time diagnostic prints to debug 403s on Cloudflare.
        jq_filter = ".assets[] | select(.name | contains(\"${platform}\")) | select(.name | endswith(\".tar.gz\")) | .browser_download_url"
        bash_cmd =
            """
            TMPDIR=\$(mktemp -d)
            RESPONSE_FILE="$TMPDIR/resp"
            HEADERS_FILE="$TMPDIR/headers"

            if [ -n "$GITHUB_TOKEN" ]; then
              echo "[diag] GITHUB_TOKEN present: yes (length \$(printf %s "$GITHUB_TOKEN" | wc -c))" >&2
              HTTP_STATUS=\$(curl -sS -o "$RESPONSE_FILE" -D "$HEADERS_FILE" -w "%{http_code}" -H "Authorization: Bearer $GITHUB_TOKEN" 'https://api.github.com/repos/roc-lang/nightlies/releases/latest')
            else
              echo "[diag] GITHUB_TOKEN present: no" >&2
              HTTP_STATUS=\$(curl -sS -o "$RESPONSE_FILE" -D "$HEADERS_FILE" -w "%{http_code}" 'https://api.github.com/repos/roc-lang/nightlies/releases/latest')
            fi

            echo "[diag] API HTTP status: $HTTP_STATUS" >&2
            if [ "$HTTP_STATUS" != "200" ]; then
              echo "[diag] response headers:" >&2
              cat "$HEADERS_FILE" >&2
              echo "[diag] response body:" >&2
              cat "$RESPONSE_FILE" >&2
            fi

            cat "$RESPONSE_FILE" | jq -r '${jq_filter}'
            rm -rf "$TMPDIR"
            """

        url_out =
            Cmd.new("bash")
            |> Cmd.args(["-c", bash_cmd])
            |> Cmd.exec_output!()?

        download_url = Str.trim(url_out.stdout_utf8)
        assert(!Str.is_empty(download_url), NoNightlyAssetFound(platform, url_out))?

        tarfile = "roc-nightly-new-compiler.tar.gz"
        _ = File.delete!(tarfile)
        _ = Dir.delete_all!(new_compiler_dir)

        Cmd.exec!("curl", ["-fsSL", "-o", tarfile, download_url])?
        Dir.create!(new_compiler_dir) ? CreateNewCompilerDirFailed
        Cmd.exec!("tar", ["-xzf", tarfile, "-C", new_compiler_dir, "--strip-components=1"])?
        File.delete!(tarfile) ? DeleteNewCompilerTarFailed

        Ok({})

# Download the roc source at the exact commit the downloaded compiler was built
# from (its `roc version` reports a short SHA), so the Builtin.roc we generate
# docs from stays in sync with the compiler binary instead of tracking main.
download_roc_source_at_compiler_commit! : {} => Result {} _
download_roc_source_at_compiler_commit! = |{}|
    commit = compiler_commit_sha!({})?

    src_tarfile = "roc-src.tar.gz"
    _ = File.delete!(src_tarfile)
    _ = Dir.delete_all!("roc")

    # GitHub's archive endpoint resolves the short SHA server-side.
    Cmd.exec!("curl", ["-fsSL", "-o", src_tarfile, "https://github.com/roc-lang/roc/archive/${commit}.tar.gz"])?
    Dir.create!("roc") ? CreateRocSrcDirFailed
    Cmd.exec!("tar", ["-xzf", src_tarfile, "-C", "roc", "--strip-components=1"])?
    File.delete!(src_tarfile) ? DeleteRocSrcTarFailed

    Ok({})

# Parse the short commit SHA out of the new compiler's `version` output, e.g.
# "Roc compiler version release-fast-a59573d2" -> "a59573d2". The SHA is the
# last hyphen-delimited segment of the last whitespace-separated word.
compiler_commit_sha! : {} => Result Str _
compiler_commit_sha! = |{}|
    version_out =
        Cmd.new("./${new_compiler_dir}/roc")
        |> Cmd.arg("version")
        |> Cmd.exec_output!()?

    version_str = Str.trim(version_out.stdout_utf8)
    assert(!Str.is_empty(version_str), VersionOutputWasEmpty)?

    last_word = Str.split_on(version_str, " ") |> List.take_last(1) |> List.first()?
    sha = Str.split_on(last_word, "-") |> List.take_last(1) |> List.first()?
    assert(!Str.is_empty(sha), CommitShaWasEmpty(version_str))?

    Ok(sha)

detect_platform! : {} => Result Str _
detect_platform! = |{}|
    platform = Env.platform!({})

    when (platform.os, platform.arch) is
        (MACOS, AARCH64) -> Ok("macos_apple_silicon")
        (MACOS, X64) -> Ok("macos_x86_64")
        (LINUX, X64) -> Ok("linux_x86_64")
        (LINUX, AARCH64) -> Ok("linux_arm64")
        _ -> Err(UnsupportedPlatform(Inspect.to_str(platform)))

# ------------------------------
# Content patching & redirects
# ------------------------------

patch_builtins_html! : {} => Result {} _
patch_builtins_html! = |{}|
    runtime_highlight_css =
        """

        /* Roc docs runtime syntax highlights */
        pre:has(> code.roc-highlight),
        .entry-signature:has(.roc-highlight),
        .entry-type-def.roc-highlight {
            background-color: var(--code-bg);
            color: #202746;
        }

        pre > code.roc-highlight,
        .entry-signature-code.roc-highlight,
        .type-ahead-signature.roc-highlight {
            background: transparent;
            color: #202746;
        }

        ::highlight(roc-c) {
            color: #596078;
        }

        ::highlight(roc-n),
        ::highlight(roc-s),
        ::highlight(roc-u) {
            color: #087f78;
        }

        ::highlight(roc-k),
        ::highlight(roc-o),
        ::highlight(roc-d) {
            color: #6633bf;
        }

        ::highlight(roc-f),
        ::highlight(roc-p) {
            color: #3e496d;
        }

        ::highlight(roc-v) {
            color: #202746;
        }

        ::highlight(roc-e) {
            color: #b42338;
        }

        @media (prefers-color-scheme: dark) {
            pre:has(> code.roc-highlight),
            .entry-signature:has(.roc-highlight),
            .entry-type-def.roc-highlight {
                background-color: #202746;
                color: #e0d6f0;
            }

            pre > code.roc-highlight,
            .entry-signature-code.roc-highlight,
            .type-ahead-signature.roc-highlight {
                color: #e0d6f0;
            }

            ::highlight(roc-c) {
                color: #ccc;
            }

            ::highlight(roc-n),
            ::highlight(roc-s),
            ::highlight(roc-u) {
                color: #4eefd9;
            }

            ::highlight(roc-k),
            ::highlight(roc-o),
            ::highlight(roc-d) {
                color: #9b6bf2;
            }

            ::highlight(roc-f),
            ::highlight(roc-p) {
                color: #aeb4c6;
            }

            ::highlight(roc-v) {
                color: white;
            }

            ::highlight(roc-e) {
                color: hsl(0, 96%, 67%);
            }
        }

        /* End Roc docs runtime syntax highlights */
        """

    sidebar_chevron_css =
        """

        /* Roc docs sidebar chevrons */
        :is(.sidebar-module-link, .sidebar-module-summary) > .entry-toggle {
            align-items: center;
            appearance: none;
            background: none;
            border: 0;
            color: currentColor;
            display: inline-flex;
            flex: 0 0 auto;
            font-size: 0;
            justify-content: center;
            line-height: 0;
            transition: color 80ms linear;
        }

        .sidebar-module-link > .entry-toggle {
            pointer-events: none;
        }

        .sidebar-module-summary > .entry-toggle {
            cursor: pointer;
            pointer-events: auto;
        }

        .sidebar-module-link:is(:hover, :focus, :focus-within, :active) > .entry-toggle {
            transition: color 80ms linear, rotate 80ms linear;
        }

        .sidebar-module-summary > .entry-toggle:hover,
        .sidebar-module-summary:focus-visible > .entry-toggle {
            color: var(--violet);
            transition: color 80ms linear, rotate 80ms linear;
        }

        .sidebar-module-link:hover,
        .sidebar-module-link:hover > span,
        .sidebar-module-link:hover > .entry-toggle {
            color: var(--violet);
        }

        :is(.sidebar-module-link, .sidebar-module-summary) > .entry-toggle::before {
            -webkit-mask: none;
            background: none;
            border: solid currentColor;
            border-width: 0 2px 2px 0;
            content: "";
            display: block;
            height: 0.45rem;
            mask: none;
            transform: rotate(-45deg);
            width: 0.45rem;
        }

        """

    top_level_entry_alignment_css =
        """

        /* Roc docs top-level entry alignment */
        /* Align a module's outermost entries with its title. Nested entries
           retain the normal hierarchy indentation, and .entry-doc continues
           to indent each member's prose and examples. */
        .main-content > .entry > :is(h2, h3, h4, h5, h6),
        .main-content > .entry > .entry-type-def,
        .main-content > .entry > .entry-children-container {
            margin-left: 0;
        }

        /* End Roc docs top-level entry alignment */

        """

    builtins_tip_html =
        """<div class="builtins-tip"><b>Tip:</b> <a href="/different-names">Some names</a> differ from other languages.</div>"""

    docs_index_replacements = [
        ("<title>Builtin Docs</title>", "<title>Roc Docs</title>"),
        ("<title>Documentation Docs</title>", "<title>Roc Docs</title>"),
        ("<title> - Documentation</title>", "<title>Roc Docs</title>"),
        (">Builtin</a></h1>", ">Roc Docs</a></h1>"),
        (">Documentation</a></h1>", ">Roc Docs</a></h1>"),
    ]

    main_index_paths = list_matching_files!("build/docs/main", "/index.html")?

    assert(!List.is_empty(main_index_paths), IndexCleanPathsWasEmpty)?

    List.for_each_try!(
        main_index_paths,
        |index_path|
            patch_builtins_nav_in_file!(index_path, builtins_tip_html)
    ) ? BuiltinsDocsReplaceFailed

    List.for_each_try!(main_index_paths, add_module_name_to_type_definition!) ? BuiltinsDocsReplaceFailed

    replace_each_in_file_prefix!("build/docs/main/index.html", 20000, docs_index_replacements) ? BuiltinsDocsReplaceFailed

    append_to_file_if_missing!("build/docs/main/styles.css", "/* Roc docs sidebar chevrons */", sidebar_chevron_css) ? BuiltinsDocsCssReplaceFailed
    replace_block_or_append_to_file!("build/docs/main/styles.css", "/* Roc docs runtime syntax highlights */", "/* End Roc docs runtime syntax highlights */", runtime_highlight_css) ? BuiltinsDocsCssReplaceFailed
    replace_block_or_append_to_file!("build/docs/main/styles.css", "/* Roc docs top-level entry alignment */", "/* End Roc docs top-level entry alignment */", top_level_entry_alignment_css) ? BuiltinsDocsCssReplaceFailed

    Cmd.exec!("go", ["-C", "tools/docs-runtime-highlights", "run", ".", "../../build/docs/main"]) ? BuiltinsDocsRuntimeHighlightFailed

    Ok({})

write_builtins_redirects! : {} => Result {} _
write_builtins_redirects! = |{}|
    # Create redirect index.html in the docs folder, pointing at the default
    # (main) version. Cloudflare uses the _redirects rules below; this static
    # page is the fallback that makes `/docs/` work in local `serve.py` previews.
    redirect_html_content =
        """
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <meta http-equiv="refresh" content="0; url=main/index.html">
            <title>Redirecting to Roc Documentation</title>
        </head>
        <body>
            <p>Redirecting to <a href="main/index.html">Roc Documentation</a>...</p>
        </body>
        </html>
        """
    File.write_utf8!(redirect_html_content, "build/docs/index.html") ? CreateRedirectIndexFailed

    # The docs used to live under /builtins/; they now live under /docs/.
    # Version-prefixed URLs (e.g. /builtins/alpha4/Str) map to the same version
    # under /docs. Everything else — bare /builtins, /docs, and un-versioned
    # module links like /builtins/Dict (still used by some example READMEs) —
    # resolves to the default `main` version. First match wins, so the specific
    # version rules precede the catch-all. This stays module-list-free: any
    # module, present or future, is handled without editing this file.
    redirects_content =
        """
        /docs                /docs/main/ 301
        /docs/               /docs/main/ 301
        /builtins            /docs/main/ 301
        /builtins/           /docs/main/ 301
        /builtins/main       /docs/main/ 301
        /builtins/alpha3     /docs/alpha3/ 301
        /builtins/alpha4     /docs/alpha4/ 301
        /builtins/main/*     /docs/main/:splat 301
        /builtins/alpha3/*   /docs/alpha3/:splat 301
        /builtins/alpha4/*   /docs/alpha4/:splat 301
        /builtins/*          /docs/main/:splat 301
        /platforms           /docs/main/langref/platforms 301
        /platforms/          /docs/main/langref/platforms 301
        /tutorial            https://github.com/roc-lang/roc/blob/main/docs/mini-tutorial-new-compiler.md 301
        /examples            https://github.com/roc-lang/roc/blob/main/test/echo/all_syntax_test.roc 301
        """
    File.write_utf8!(redirects_content, "build/_redirects") ? CreateRedirectsFileFailed

    Ok({})

add_github_links_to_examples! : {} => Result {} _
add_github_links_to_examples! = |{}|
    examples_dir = "build/examples"
    exists = File.is_dir!(examples_dir) |> Result.with_default(Bool.false)
    if !exists then
        # Nothing to patch yet
        Ok({})
    else
        examples_repo_link = "https://github.com/roc-lang/examples/tree/main/examples"

        github_logo_svg =
            """
            <svg viewBox="0 0 98 96" height="25" xmlns="http://www.w3.org/2000/svg" fill-rule="evenodd" clip-rule="evenodd" role="img" id="gh-logo">
            <path d='M48.854 0C21.839 0 0 22 0 49.217c0 21.756 13.993 40.172 33.405 46.69 2.427.49 3.316-1.059 3.316-2.362 0-1.141-.80-5.052-.80-9.127-13.59 2.934-16.42-5.867-16.42-5.867-2.184-5.704-5.42-7.17-5.42-7.17-4.448-3.015.324-3.015.324-3.015 4.934.326 7.523 5.052 7.523 5.052 4.367 7.496 11.404 5.378 14.235 4.074.404-3.178 1.699-5.378 3.074-6.6-10.839-1.141-22.243-5.378-22.243-24.283 0-5.378 1.94-9.778 5.014-13.2-.485-1.222-2.184-6.275.486-13.038 0 0 4.125-1.304 13.426 5.052a46.97 46.97 0 0 1 12.214-1.63c4.125 0 8.33.571 12.213 1.63 9.302-6.356 13.427-5.052 13.427-5.052 2.67 6.763.97 11.816.485 13.038 3.155 3.422 5.015 7.822 5.015 13.2 0 18.905-11.404 23.06-22.324 24.283 1.78 1.548 3.316 4.481 3.316 9.126 0 6.6-.08 11.897-.08 13.526 0 1.304.89 2.853 3.316 2.364 19.412-6.52 33.405-24.935 33.405-46.691C97.707 22 75.788 0 48.854 0z'></path>
            </svg>
            """

        clean_readme_paths = list_matching_files!(examples_dir, "/README.html")?

        assert(!List.is_empty(clean_readme_paths), CleanReadmePathsWasEmptyList)?

        List.for_each_try!(
            clean_readme_paths,
            |readme_path|
                example_folder_name = Str.split_on(readme_path, "/") |> List.take_last(2) |> List.first()?
                specific_example_link = Str.join_with([examples_repo_link, example_folder_name], "/")
                insert_after_first_if_missing!(
                    readme_path,
                    "id=\"gh-example-link\"",
                    "</h1>",
                    """<a id="gh-example-link" href="${specific_example_link}" aria-label="view on github">${github_logo_svg}</a>"""
                )
        ) ? ExamplesReadmeReplaceFailed

        Ok({})


# ------------------------------
# Replace helper
# ------------------------------

append_to_file_if_missing! = |file_path_str, marker_str, append_str|
    assert(!Str.is_empty(file_path_str), FilePathWasEmptyStr)?
    file_content = File.read_utf8!(file_path_str)?
    if Str.contains(file_content, marker_str) then
        Ok({})
    else
        File.write_utf8!(Str.concat(file_content, append_str), file_path_str)

replace_block_or_append_to_file! = |file_path_str, start_marker_str, end_marker_str, replacement_str|
    assert(!Str.is_empty(file_path_str), FilePathWasEmptyStr)?
    file_content = File.read_utf8!(file_path_str)?

    when Str.split_first(file_content, start_marker_str) is
        Ok({ before, after }) ->
            when Str.split_first(after, end_marker_str) is
                Ok(after_end) ->
                    File.write_utf8!(Str.concat(before, Str.concat(replacement_str, after_end.after)), file_path_str)

                Err(_) ->
                    File.write_utf8!(Str.concat(before, replacement_str), file_path_str)

        Err(_) ->
            File.write_utf8!(Str.concat(file_content, replacement_str), file_path_str)

list_matching_files! = |root_str, suffix_str|
    files = list_files_recursive!(Path.from_str(root_str))?

    Ok(
        files
        |> List.map(|path| Path.display(path))
        |> List.keep_if(|path| Str.ends_with(path, suffix_str))
    )

replace_all = |content, search_str, replace_str|
    Str.replace_each(content, search_str, replace_str)

replace_all_in_file! = |file_path_str, search_str, replace_str|
    assert(!Str.is_empty(file_path_str), FilePathWasEmptyStr)?
    file_content = File.read_utf8!(file_path_str)?
    content_after_replace = replace_all(file_content, search_str, replace_str)

    if content_after_replace == file_content then
        Ok({})
    else
        File.write_utf8!(content_after_replace, file_path_str)

patch_builtins_nav_in_file! = |file_path_str, builtins_tip_html|
    assert(!Str.is_empty(file_path_str), FilePathWasEmptyStr)?
    file_bytes = File.read_bytes!(file_path_str)?
    nav_end = find_bytes_start(file_bytes, Str.to_utf8("</nav>"))

    if nav_end.found then
        before_nav_bytes = List.take_first(file_bytes, nav_end.start)
        nav_and_after_bytes = List.drop_first(file_bytes, nav_end.start)
        tip_marker = find_bytes_start(before_nav_bytes, Str.to_utf8("builtins-tip"))

        if tip_marker.found then
            Ok({})
        else
            with_tip_bytes = List.concat(before_nav_bytes, Str.to_utf8(builtins_tip_html))
            patched_bytes = List.concat(with_tip_bytes, nav_and_after_bytes)
            File.write_bytes!(patched_bytes, file_path_str)
    else
        Ok({})

add_module_name_to_type_definition! = |file_path_str|
    module_name_start = """<h1 class="module-name">"""
    module_name_end = "</h1>"
    type_definition_start = "<code class=\"entry-type-def"

    file_content = File.read_utf8!(file_path_str)?

    when Str.split_first(file_content, module_name_start) is
        Ok(before_module_name) ->
            when Str.split_first(before_module_name.after, module_name_end) is
                Ok(after_module_name) ->
                    module_name = after_module_name.before
                    module_name_prefix = "${module_name} "

                    when Str.split_first(after_module_name.after, type_definition_start) is
                        Ok(before_type_definition) ->
                            # Only declarations placed directly below a module heading need this
                            # prefix. Other type definitions already have an entry heading.
                            if Str.contains(before_type_definition.before, "<article") then
                                Ok({})
                            else
                                when Str.split_first(before_type_definition.after, ">") is
                                    Ok(after_type_definition_opening_tag) ->
                                        if Str.starts_with(after_type_definition_opening_tag.after, module_name_prefix) then
                                            Ok({})
                                        else
                                            before_declaration =
                                                Str.concat(
                                                    before_module_name.before,
                                                    Str.concat(
                                                        module_name_start,
                                                        Str.concat(
                                                            module_name,
                                                            Str.concat(
                                                                module_name_end,
                                                                Str.concat(
                                                                    before_type_definition.before,
                                                                    Str.concat(
                                                                        type_definition_start,
                                                                        Str.concat(after_type_definition_opening_tag.before, ">"),
                                                                    ),
                                                                ),
                                                            ),
                                                        ),
                                                    ),
                                                )

                                            File.write_utf8!(Str.concat(before_declaration, Str.concat(module_name_prefix, after_type_definition_opening_tag.after)), file_path_str)

                                    Err(_) ->
                                        Ok({})

                        Err(_) ->
                            Ok({})

                Err(_) ->
                    Ok({})

        Err(_) ->
            Ok({})

find_bytes_start = |bytes, needle|
    initial = { found: Bool.false, matched: 0u64, start: 0u64 }
    needle_len = List.len(needle)

    List.walk_with_index_until(bytes, initial, |state, byte, index|
        when List.get(needle, state.matched) is
            Ok(expected) ->
                if byte == expected then
                    next_matched = state.matched + 1

                    if next_matched == needle_len then
                        Break({ state & found: Bool.true, matched: next_matched, start: index + 1 - needle_len })
                    else
                        Continue({ state & matched: next_matched })
                else
                    next_matched =
                        when List.first(needle) is
                            Ok(first) -> if byte == first then 1u64 else 0u64
                            Err(_) -> 0u64

                    Continue({ state & matched: next_matched })

            Err(_) ->
                Break(state)
    )

replace_each_in_file_prefix! = |file_path_str, prefix_len, replacements|
    assert(!Str.is_empty(file_path_str), FilePathWasEmptyStr)?
    file_bytes = File.read_bytes!(file_path_str)?
    prefix_bytes = List.take_first(file_bytes, prefix_len)
    rest_bytes = List.drop_first(file_bytes, prefix_len)
    prefix = Str.from_utf8(prefix_bytes)?
    prefix_after_replace =
        List.walk(replacements, prefix, |content, replacement|
            (search_str, replace_str) = replacement
            replace_all(content, search_str, replace_str)
        )
    if prefix_after_replace == prefix then
        Ok({})
    else
        File.write_bytes!(List.concat(Str.to_utf8(prefix_after_replace), rest_bytes), file_path_str)

insert_after_first_if_missing! = |file_path_str, marker_str, search_str, insert_str|
    assert(!Str.is_empty(file_path_str), FilePathWasEmptyStr)?
    file_content = File.read_utf8!(file_path_str)?
    if Str.contains(file_content, marker_str) then
        Ok({})
    else
        when Str.split_first(file_content, search_str) is
            Ok({ before, after }) ->
                File.write_utf8!(Str.concat(before, Str.concat(search_str, Str.concat(insert_str, after))), file_path_str)

            Err(_) ->
                Ok({})

# ------------------------------
# Cache timestamp helpers
# ------------------------------

read_cache_millis! : Str => Result I128 _
read_cache_millis! = |path|
    txt = File.read_utf8!(path)?
    Str.to_i128(txt) |> Result.map_err(CacheParseFailed)

write_cache_millis! : Str => Result {} _
write_cache_millis! = |path|
    now = Utc.now!({})
    millis = Utc.to_millis_since_epoch(now)
    File.write_utf8!(Num.to_str(millis), path)

# ------------------------------
# Directory mtime helpers
# ------------------------------

max_mtime_in_dirs_millis! : List Str => Result I128 _
max_mtime_in_dirs_millis! = |dirs|
    List.walk_try!(
        dirs,
        0i128,
        |acc, dir_str|
            when max_mtime_in_dir_millis!(dir_str) is
                Ok(val) -> Ok(Num.max(acc, val))
                Err(_e) -> Ok(acc) # missing dirs just count as 0
    )

max_mtime_in_dir_millis! : Str => Result I128 _
max_mtime_in_dir_millis! = |dir_str|
    is_dir = File.is_dir!(dir_str)?
    if !is_dir then
        Ok(0i128)
    else
        root = Path.from_str(dir_str)
        files = list_files_recursive!(root)?
        List.walk_try!(
            files,
            0i128,
            |acc, p|
                p_str = Path.display(p)
                when File.type!(p_str) is
                    Ok(IsFile) ->
                        m = File.time_modified!(p_str)?
                        Ok(Num.max(acc, Utc.to_millis_since_epoch(m)))
                    _ ->
                        Ok(acc)
        )


list_files_recursive! : Path => Result (List Path) _
list_files_recursive! = |p|
    when Path.type!(p) is
        Ok(IsFile) ->
            Ok([p])

        Ok(IsDir) ->
            children = Path.list_dir!(p)?
            List.walk_try!(
                children,
                [],
                |acc, child|
                    sub = list_files_recursive!(child)?
                    Ok(List.concat(acc, sub))
            )

        _ ->
            Ok([])

# ------------------------------
# tiny assert
# ------------------------------

assert = |condition, err|
    if condition then
        Ok({})
    else
        Err(err)
