app [main!] { cli: platform "https://github.com/roc-lang/basic-cli/releases/download/0.20.0/X73hGh05nNTkDHU06FHC0YfFaQB1pimX7gncRcao5mU.tar.br" }

import cli.Stdout
import cli.Arg exposing [Arg]
import cli.Dir
import cli.Cmd
import cli.File
import cli.Env
import cli.Path

# run with: `cd website && roc ./build_website.roc`

latest_stable_tag = "alpha3-rolling"

main! : List Arg => Result {} _
main! = |_args|

    cwd_path = Env.cwd!({}) ? |err| EncCwdFailed(err)
    cwd_path_str = Path.display(cwd_path)

    if !(Str.ends_with(cwd_path_str, "/website")) then
        Err(Exit(1, "You must run this script inside the 'website' directory, I am currently in: ${cwd_path_str}"))?
    else
        {}

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
    # TODO do this in Roc
    Cmd.exec!("perl", ["-pi", "-e", "s|\\]\\(/|\\]\\(/examples/|g", "content/examples/index.md"])?

    Dir.delete_all!("examples-main") ? |err| DeleteExamplesMainDirFailed(err)
    File.delete!("examples-main.zip") ? |err| DeleteExamplesMainZipFailed(err)

    # download fonts just-in-time so we don't have to bloat the repo with them.
    design_assets_commit = "4d949642ebc56ca455cf270b288382788bce5873"
    design_assets_tarfile = "roc-lang-design-assets-4d94964.tar.gz"
    design_assets_dir = "roc-lang-design-assets-4d94964"

    Cmd.exec!("curl", ["-fLJO", "https://github.com/roc-lang/design-assets/tarball/${design_assets_commit}"])?

    Cmd.exec!("tar", ["-xzf", design_assets_tarfile])?

    Cmd.exec!("mv", ["${design_assets_dir}/fonts", "build/fonts"])?

    # clean up
    Dir.delete_all!(design_assets_dir) ? |err| DeleteDesignAssetsDirFailed(err)
    File.delete!(design_assets_tarfile) ? |err| DeleteDesignAssetsTarFailed(err)


    repl_tarfile = "roc_repl_wasm.tar.gz"

    # Clean up old file
    _ = File.delete!(repl_tarfile)

    # Download the latest stable Web REPL as a zip file.
    Cmd.exec!("curl", ["-fLJO", "https://github.com/roc-lang/roc/releases/download/${latest_stable_tag}/${repl_tarfile}"])?

    Dir.create!("build/repl") ? |err| CreateReplDirFailed(err)

    Cmd.exec!("tar", ["-xzf", repl_tarfile, "-C", "build/repl"])?

    File.delete!(repl_tarfile) ? |err| DeleteReplTarFailed(err)

    # Download prebuilt docs from releases
    alpha3_docs_tarfile = "alpha3-docs.tar.gz"
    alpha4_docs_tarfile = "alpha4-docs.tar.gz"

    # Clean up old files
    _ = File.delete!(alpha3_docs_tarfile)
    _ = File.delete!(alpha4_docs_tarfile)

    # Download alpha3 docs
    Cmd.exec!("curl", ["-fL", "-o", alpha3_docs_tarfile, "https://github.com/roc-lang/roc/releases/download/alpha3-rolling/docs.tar.gz"])?
    Dir.create!("build/builtins") ? |err| CreateBuiltinsDirFailed(err)
    Dir.create!("build/builtins/alpha3") ? |err| CreateAlpha3DirFailed(err)
    Cmd.exec!("tar", ["-xzf", alpha3_docs_tarfile, "-C", "build/builtins/alpha3", "--strip-components=1"])?
    File.delete!(alpha3_docs_tarfile) ? |err| DeleteAlpha3DocsTarFailed(err)

    # Download alpha4 docs
    Cmd.exec!("curl", ["-fL", "-o", alpha4_docs_tarfile, "https://github.com/roc-lang/roc/releases/download/alpha4-rolling/docs.tar.gz"])?
    Dir.create!("build/builtins/alpha4") ? |err| CreateAlpha4DirFailed(err)
    Cmd.exec!("tar", ["-xzf", alpha4_docs_tarfile, "-C", "build/builtins/alpha4", "--strip-components=1"])?
    File.delete!(alpha4_docs_tarfile) ? |err| DeleteAlpha4DocsTarFailed(err)

    # git clone main branch for latest docs
    Cmd.exec!("git", ["clone", "--branch", "main", "--depth", "1", "https://github.com/roc-lang/roc.git"])?

    # generate docs for builtins (main branch)
    Dir.create!("build/builtins/main") ? |err| CreateMainDirFailed(err)
    Cmd.exec!("roc", ["docs", "roc/crates/compiler/builtins/roc/main.roc","--output", "build/builtins/main", "--root-dir", "builtins/main"])?
    Dir.delete_all!("roc") ? |err| DeleteRocRepoDirFailed(err)

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
    ) ? |err| BuiltinsDocsReplaceFailed(err)

    # Create redirect index.html in builtins folder
    redirect_version = latest_stable_tag |> Str.split_on("-") |> List.first()?
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
    File.write_utf8!(redirect_html_content, "build/builtins/index.html") ? |err| CreateRedirectIndexFailed(err)

    # Create Cloudflare _redirects file
    redirects_content =
        """
        # prevent loops if someone is already under /builtins/redirect_version/
        /builtins/${redirect_version}/*   /builtins/${redirect_version}/:splat   200

        # handle the bare paths
        /builtins             /builtins/${redirect_version}/        301
        /builtins/            /builtins/${redirect_version}/        301

        # forward everything else
        /builtins/*           /builtins/${redirect_version}/:splat  301
        """
    File.write_utf8!(redirects_content, "build/_redirects") ? |err| CreateRedirectsFileFailed(err)

    # Generate site markdown content
    Cmd.exec!("roc", ["build", "--linker", "legacy", "static_site_gen.roc"])?
    Cmd.exec!("./static_site_gen", ["content", "build"])?


    # Add github link to examples
    examples_dir = "build/examples"
    examples_repo_link = "https://github.com/roc-lang/examples/tree/main/examples"

    github_logo_svg =
        """
        <svg viewBox="0 0 98 96" height="25" xmlns="http://www.w3.org/2000/svg" fill-rule="evenodd" clip-rule="evenodd" role="img" id="gh-logo">
        <path d='M48.854 0C21.839 0 0 22 0 49.217c0 21.756 13.993 40.172 33.405 46.69 2.427.49 3.316-1.059 3.316-2.362 0-1.141-.08-5.052-.08-9.127-13.59 2.934-16.42-5.867-16.42-5.867-2.184-5.704-5.42-7.17-5.42-7.17-4.448-3.015.324-3.015.324-3.015 4.934.326 7.523 5.052 7.523 5.052 4.367 7.496 11.404 5.378 14.235 4.074.404-3.178 1.699-5.378 3.074-6.6-10.839-1.141-22.243-5.378-22.243-24.283 0-5.378 1.94-9.778 5.014-13.2-.485-1.222-2.184-6.275.486-13.038 0 0 4.125-1.304 13.426 5.052a46.97 46.97 0 0 1 12.214-1.63c4.125 0 8.33.571 12.213 1.63 9.302-6.356 13.427-5.052 13.427-5.052 2.67 6.763.97 11.816.485 13.038 3.155 3.422 5.015 7.822 5.015 13.2 0 18.905-11.404 23.06-22.324 24.283 1.78 1.548 3.316 4.481 3.316 9.126 0 6.6-.08 11.897-.08 13.526 0 1.304.89 2.853 3.316 2.364 19.412-6.52 33.405-24.935 33.405-46.691C97.707 22 75.788 0 48.854 0z'></path>
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
    ) ? |err| ExamplesReadmeReplaceFailed(err)

    Stdout.line!("Website built in dir 'website/build'.")


replace_in_file! = |file_path_str, search_str, replace_str|
    assert(!Str.is_empty(file_path_str), FilePathWasEmptyStr)?

    file_content = File.read_utf8!(file_path_str)? 
    content_after_replace = Str.replace_each(file_content, search_str, replace_str) 
    File.write_utf8!(content_after_replace, file_path_str)

assert = |condition, err|
    if condition then
        Ok({})
    else
        Err(err)
