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

latest_stable_tag = "alpha4-rolling"
cache_marker_path = ".cache/site.millis"

main! : List Arg => Result {} _
main! = |raw_args|
    args = List.map(raw_args, Arg.display)
    use_cache = List.any(args, |a| a == "--cache")

    cwd_path = Env.cwd!({}) ? EncCwdFailed
    cwd_path_str = Path.display(cwd_path)

    if !(Str.ends_with(cwd_path_str, "/website")) then
        Err(Exit(1, "You must run this script inside the 'website' directory, I am currently in: ${cwd_path_str}"))?
    else
        {}

    if use_cache then
        # Create .cache/ if it doesn't exist
        _ = Dir.create!(".cache")
        build_with_cache!({})?
    else
        full_clean_build!({})?

    Stdout.line!("Website built in dir 'website/build'.")

# ----------------
# Full clean build
# ----------------
full_clean_build! : {} => Result {} _
full_clean_build! = |{}|
    # Clean up dirs from previous runs
    _ = Dir.delete_all!("build")
    _ = Dir.delete_all!("content/examples")
    _ = Dir.delete_all!("examples-main")
    _ = Dir.delete_all!("roc")

    Cmd.exec!("cp", ["-r", "public", "build"])?

    # Download latest examples
    Cmd.exec!("curl", ["-fL", "-o", "examples-main.zip", "https://github.com/roc-lang/examples/archive/refs/heads/main.zip"])?
    Cmd.exec!("unzip", ["-o", "-q", "examples-main.zip"])?
    Cmd.exec!("cp", ["-R", "examples-main/examples/", "content/examples/"])?
    # replace links in content/examples/index.md to work on the WIP site
    Cmd.exec!("perl", ["-pi", "-e", "s|\\]\\(/|\\]\\(/examples/|g", "content/examples/index.md"])?
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
    Dir.create!("build/builtins") ? CreateBuiltinsDirFailed
    Dir.create!("build/builtins/alpha3") ? CreateAlpha3DirFailed
    Cmd.exec!("tar", ["-xzf", alpha3_docs_tarfile, "-C", "build/builtins/alpha3", "--strip-components=1"])?
    File.delete!(alpha3_docs_tarfile) ? DeleteAlpha3DocsTarFailed

    # Download alpha4 docs
    Cmd.exec!("curl", ["-fL", "-o", alpha4_docs_tarfile, "https://github.com/roc-lang/roc/releases/download/alpha4-rolling/docs.tar.gz"])?
    Dir.create!("build/builtins/alpha4") ? CreateAlpha4DirFailed
    Cmd.exec!("tar", ["-xzf", alpha4_docs_tarfile, "-C", "build/builtins/alpha4", "--strip-components=1"])?
    File.delete!(alpha4_docs_tarfile) ? DeleteAlpha4DocsTarFailed

    # git clone main branch for latest docs
    Cmd.exec!("git", ["clone", "--branch", "main", "--depth", "1", "https://github.com/roc-lang/roc.git"])?

    # generate docs for builtins (main branch)
    Dir.create!("build/builtins/main") ? CreateMainDirFailed
    Cmd.exec!("roc", ["docs", "roc/crates/compiler/builtins/roc/main.roc","--output", "build/builtins/main", "--root-dir", "builtins/main"])?
    Dir.delete_all!("roc") ? DeleteRocRepoDirFailed

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
build_with_cache! : {} => Result {} _
build_with_cache! = |{}|
    # 1) Ensure build/ exists to copy assets into
    _ = Dir.create!("build")

    # 2) Ensure dependencies exist (download once, otherwise reuse)
    ensure_examples_present!({})?
    ensure_fonts_present!({})?
    ensure_repl_present!({})?
    ensure_builtins_present!({})?

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
        else
            {}

        # Only run static site generation if content changed
        if content_changed then
            Cmd.exec!("roc", ["build", "--linker", "legacy", "static_site_gen.roc"])?
            Cmd.exec!("./static_site_gen", ["content", "build"])?

            # Patching steps that affect builtins and examples HTML (idempotent)
            patch_builtins_html!({})?
            write_builtins_redirects!({})?
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
        Cmd.exec!("perl", ["-pi", "-e", "s|\\]\\(/|\\]\\(/examples/|g", "content/examples/index.md"])?
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

ensure_builtins_present! : {} => Result {} _
ensure_builtins_present! = |{}|
    alpha3_ok = File.is_dir!("build/builtins/alpha3") |> Result.with_default(Bool.false)
    alpha4_ok = File.is_dir!("build/builtins/alpha4") |> Result.with_default(Bool.false)
    main_ok  = File.is_dir!("build/builtins/main")  |> Result.with_default(Bool.false)

    Dir.create!("build/builtins") |> Result.with_default({})

    if !alpha3_ok then
        alpha3_docs_tarfile = "alpha3-docs.tar.gz"
        _ = File.delete!(alpha3_docs_tarfile)
        Cmd.exec!("curl", ["-fL", "-o", alpha3_docs_tarfile, "https://github.com/roc-lang/roc/releases/download/alpha3-rolling/docs.tar.gz"])?
        Dir.create!("build/builtins/alpha3") ? CreateAlpha3DirFailed
        Cmd.exec!("tar", ["-xzf", alpha3_docs_tarfile, "-C", "build/builtins/alpha3", "--strip-components=1"])?
        File.delete!(alpha3_docs_tarfile)?
    else
        {}

    if !alpha4_ok then
        alpha4_docs_tarfile = "alpha4-docs.tar.gz"
        _ = File.delete!(alpha4_docs_tarfile)
        Cmd.exec!("curl", ["-fL", "-o", alpha4_docs_tarfile, "https://github.com/roc-lang/roc/releases/download/alpha4-rolling/docs.tar.gz"])?
        Dir.create!("build/builtins/alpha4") ? CreateAlpha4DirFailed
        Cmd.exec!("tar", ["-xzf", alpha4_docs_tarfile, "-C", "build/builtins/alpha4", "--strip-components=1"])?
        File.delete!(alpha4_docs_tarfile)?
    else
        {}

    if !main_ok then
        Cmd.exec!("git", ["clone", "--branch", "main", "--depth", "1", "https://github.com/roc-lang/roc.git"])?
        Dir.create!("build/builtins/main") ? CreateMainDirFailed
        Cmd.exec!("roc", ["docs", "roc/crates/compiler/builtins/roc/main.roc","--output", "build/builtins/main", "--root-dir", "builtins/main"])?
        Dir.delete_all!("roc")?
    else
        {}

    Ok({})

# ------------------------------
# Content patching & redirects
# ------------------------------

patch_builtins_html! : {} => Result {} _
patch_builtins_html! = |{}|
    find_index_output =
        Cmd.new("find")
        |> Cmd.args(["build/builtins", "-type", "f", "-name", "index.html"])
        |> Cmd.exec_output!()?

    index_clean_paths =
        Str.split_on(find_index_output.stdout_utf8, "\n")
        |> List.keep_if(|path| !Str.is_empty(path))

    assert(!List.is_empty(index_clean_paths), IndexCleanPathsWasEmpty)?

    List.for_each_try!(
        index_clean_paths,
        |index_path|
            replace_in_file!(
                index_path,
                "<\nav>",
                """<div class="builtins-tip"><b>Tip:</b> <a href="/different-names">Some names</a> differ from other languages.</div></nav>"""
            )
    ) ? BuiltinsDocsReplaceFailed

    Ok({})

write_builtins_redirects! : {} => Result {} _
write_builtins_redirects! = |{}|
    redirect_version = latest_stable_tag |> Str.split_on("-") |> List.first()?

    # Create redirect index.html in builtins folder
    redirect_html_content =
        """
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <meta http-equiv="refresh" content="0; url=${redirect_version}/index.html">
            <title>Redirecting to Roc Builtins Documentation</title>
        </head>
        <body>
            <p>Redirecting to <a href="${redirect_version}/index.html">Roc Builtins Documentation</a>...</p>
        </body>
        </html>
        """
    File.write_utf8!(redirect_html_content, "build/builtins/index.html") ? CreateRedirectIndexFailed

    redirects_content =
        """
        /builtins           /builtins/${redirect_version}/ 301
        /builtins/          /builtins/${redirect_version}/ 301
        /builtins/stable    /builtins/${redirect_version}/ 301
        /builtins/stable/   /builtins/${redirect_version}/ 301
        /builtins/stable/*  /builtins/${redirect_version}/:splat 301
        /builtins/llms.txt  /builtins/${redirect_version}/llms.txt 301
        /builtins/search.js /builtins/${redirect_version}/search.js 301
        /builtins/Str       /builtins/${redirect_version}/Str 301
        /builtins/Str/      /builtins/${redirect_version}/Str/ 301
        /builtins/Str/*     /builtins/${redirect_version}/Str/:splat 301
        /builtins/Bool      /builtins/${redirect_version}/Bool 301
        /builtins/Bool/     /builtins/${redirect_version}/Bool/ 301
        /builtins/Bool/*    /builtins/${redirect_version}/Bool/:splat 301
        /builtins/List      /builtins/${redirect_version}/List 301
        /builtins/List/     /builtins/${redirect_version}/List/ 301
        /builtins/List/*    /builtins/${redirect_version}/List/:splat
        /builtins/Result    /builtins/${redirect_version}/Result 301
        /builtins/Result/   /builtins/${redirect_version}/Result/ 301
        /builtins/Result/*  /builtins/${redirect_version}/Result/:splat
        /builtins/Num       /builtins/${redirect_version}/Num 301
        /builtins/Num/      /builtins/${redirect_version}/Num/ 301
        /builtins/Num/*     /builtins/${redirect_version}/Num/:splat 301
        /builtins/Dict      /builtins/${redirect_version}/Dict 301
        /builtins/Dict/     /builtins/${redirect_version}/Dict/ 301
        /builtins/Dict/*    /builtins/${redirect_version}/Dict/:splat 301
        /builtins/Set       /builtins/${redirect_version}/Set 301
        /builtins/Set/      /builtins/${redirect_version}/Set/ 301
        /builtins/Set/*     /builtins/${redirect_version}/Set/:splat
        /builtins/Decode    /builtins/${redirect_version}/Decode 301
        /builtins/Decode/   /builtins/${redirect_version}/Decode/ 301
        /builtins/Decode/*  /builtins/${redirect_version}/Decode/:splat
        /builtins/Encode    /builtins/${redirect_version}/Encode 301
        /builtins/Encode/   /builtins/${redirect_version}/Encode/ 301
        /builtins/Encode/*  /builtins/${redirect_version}/Encode/:splat
        /builtins/Hash      /builtins/${redirect_version}/Hash 301
        /builtins/Hash/     /builtins/${redirect_version}/Hash/ 301
        /builtins/Hash/*    /builtins/${redirect_version}/Hash/:splat
        /builtins/Box       /builtins/${redirect_version}/Box 301
        /builtins/Box/      /builtins/${redirect_version}/Box/ 301
        /builtins/Box/*     /builtins/${redirect_version}/
        /builtins/Inspect   /builtins/${redirect_version}/Inspect 301
        /builtins/Inspect/  /builtins/${redirect_version}/Inspect/ 301
        /builtins/Inspect/* /builtins/${redirect_version}/Inspect/:splat
        https://foundation.roc-lang.org/* https://roc-lang.org/foundation/:splat 301
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

        find_readme_html =
            Cmd.new("find")
            |> Cmd.args([examples_dir, "-type", "f", "-name", "README.html", "-exec", "realpath", "{}", ";"])
            |> Cmd.exec_output!()?

        clean_readme_paths =
            Str.split_on(find_readme_html.stdout_utf8, "\n")
            |> List.keep_if(|path| !Str.is_empty(path))

        assert(!List.is_empty(clean_readme_paths), CleanReadmePathsWasEmptyList)?

        List.for_each_try!(
            clean_readme_paths,
            |readme_path|
                example_folder_name = Str.split_on(readme_path, "/") |> List.take_last(2) |> List.first()?
                specific_example_link = Str.join_with([examples_repo_link, example_folder_name], "/")
                replace_in_file!(
                    readme_path,
                    "</h1>",
                    """</h1><a id="gh-example-link" href="${specific_example_link}" aria-label="view on github">${github_logo_svg}</a>"""
                )
        ) ? ExamplesReadmeReplaceFailed

        Ok({})


# ------------------------------
# Replace helper
# ------------------------------

replace_in_file! = |file_path_str, search_str, replace_str|
    assert(!Str.is_empty(file_path_str), FilePathWasEmptyStr)?
    file_content = File.read_utf8!(file_path_str)?
    content_after_replace = Str.replace_each(file_content, search_str, replace_str)
    File.write_utf8!(content_after_replace, file_path_str)

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
