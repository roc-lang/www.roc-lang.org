app [main!] { cli: platform "https://github.com/roc-lang/basic-cli/releases/download/0.19.0/Hj-J_zxz7V9YurCSTFcFdu6cQJie4guzsPMUi5kBYUk.tar.br" }

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

    run_cmd!("cp", ["-r", "public", "build"])?

    # Download latest examples
    run_cmd!("curl", ["-fL", "-o", "examples-main.zip", "https://github.com/roc-lang/examples/archive/refs/heads/main.zip"])?

    run_cmd!("unzip", ["-o", "-q", "examples-main.zip"])?

    run_cmd!("cp", ["-R", "examples-main/examples/", "content/examples/"])?

    # replace links in content/examples/index.md to work on the WIP site
    # TODO do this in Roc
    run_cmd!("perl", ["-pi", "-e", "s|\\]\\(/|\\]\\(/examples/|g", "content/examples/index.md"])?

    Dir.delete_all!("examples-main") ? |err| DeleteExamplesMainDirFailed(err)
    File.delete!("examples-main.zip") ? |err| DeleteExamplesMainZipFailed(err)

    # download fonts just-in-time so we don't have to bloat the repo with them.
    design_assets_commit = "4d949642ebc56ca455cf270b288382788bce5873"
    design_assets_tarfile = "roc-lang-design-assets-4d94964.tar.gz"
    design_assets_dir = "roc-lang-design-assets-4d94964"

    run_cmd!("curl", ["-fLJO", "https://github.com/roc-lang/design-assets/tarball/${design_assets_commit}"])?

    run_cmd!("tar", ["-xzf", design_assets_tarfile])?

    run_cmd!("mv", ["${design_assets_dir}/fonts", "build/fonts"])?

    # clean up
    Dir.delete_all!(design_assets_dir) ? |err| DeleteDesignAssetsDirFailed(err)
    File.delete!(design_assets_tarfile) ? |err| DeleteDesignAssetsTarFailed(err)


    repl_tarfile = "roc_repl_wasm.tar.gz"

    # Clean up old file
    _ = File.delete!(repl_tarfile)

    # Download the latest stable Web REPL as a zip file.
    run_cmd!("curl", ["-fLJO", "https://github.com/roc-lang/roc/releases/download/${latest_stable_tag}/${repl_tarfile}"])?

    Dir.create!("build/repl") ? |err| CreateReplDirFailed(err)

    run_cmd!("tar", ["-xzf", repl_tarfile, "-C", "build/repl"])?

    File.delete!(repl_tarfile) ? |err| DeleteReplTarFailed(err)

    # git clone latest_stable_tag
    run_cmd!("git", ["clone", "--branch", latest_stable_tag, "--depth", "1", "https://github.com/roc-lang/roc.git"])?

    # generate docs for builtins
    run_cmd!("roc", ["docs", "roc/crates/compiler/builtins/roc/main.roc","--output", "build/builtins", "--root-dir", "builtins"])?
    Dir.delete_all!("roc") ? |err| DeleteRocRepoDirFailed(err)

    find_index_stdout = run_cmd_w_output!("find", ["build/builtins", "-type", "f", "-name", "index.html"])?
    index_clean_paths =
        Str.split_on(find_index_stdout, "\n")
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


    # Generate site markdown content
    run_cmd!("roc", ["build", "--linker", "legacy", "static_site_gen.roc"])?
    run_cmd!("./static_site_gen", ["content", "build"])?


    # Add github link to examples
    examples_dir = "build/examples"
    examples_repo_link = "https://github.com/roc-lang/examples/tree/main/examples"

    github_logo_svg =
        """
        <svg viewBox="0 0 98 96" height="25" xmlns="http://www.w3.org/2000/svg" fill-rule="evenodd" clip-rule="evenodd" role="img" id="gh-logo">
        <path d='M48.854 0C21.839 0 0 22 0 49.217c0 21.756 13.993 40.172 33.405 46.69 2.427.49 3.316-1.059 3.316-2.362 0-1.141-.08-5.052-.08-9.127-13.59 2.934-16.42-5.867-16.42-5.867-2.184-5.704-5.42-7.17-5.42-7.17-4.448-3.015.324-3.015.324-3.015 4.934.326 7.523 5.052 7.523 5.052 4.367 7.496 11.404 5.378 14.235 4.074.404-3.178 1.699-5.378 3.074-6.6-10.839-1.141-22.243-5.378-22.243-24.283 0-5.378 1.94-9.778 5.014-13.2-.485-1.222-2.184-6.275.486-13.038 0 0 4.125-1.304 13.426 5.052a46.97 46.97 0 0 1 12.214-1.63c4.125 0 8.33.571 12.213 1.63 9.302-6.356 13.427-5.052 13.427-5.052 2.67 6.763.97 11.816.485 13.038 3.155 3.422 5.015 7.822 5.015 13.2 0 18.905-11.404 23.06-22.324 24.283 1.78 1.548 3.316 4.481 3.316 9.126 0 6.6-.08 11.897-.08 13.526 0 1.304.89 2.853 3.316 2.364 19.412-6.52 33.405-24.935 33.405-46.691C97.707 22 75.788 0 48.854 0z'></path>
        </svg>
        """

    find_readme_html_output = run_cmd_w_output!("find", [examples_dir, "-type", "f", "-name", "README.html", "-exec", "realpath", "{}", ";"])?

    clean_readme_paths =
        Str.split_on(find_readme_html_output, "\n")
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

run_cmd! : Str, List Str => Result {} [BadCmdOutput(Str)]_
run_cmd! = |cmd_str, args|
    _ = run_cmd_w_output!(cmd_str, args)?

    Ok({})

run_cmd_w_output! : Str, List Str => Result Str [BadCmdOutput(Str)]_
run_cmd_w_output! = |cmd_str, args|
    cmd_out =
        Cmd.new(cmd_str)
        |> Cmd.args(args)
        |> Cmd.output!()

    stdout_utf8 = Str.from_utf8_lossy(cmd_out.stdout)

    when cmd_out.status is
        Ok(0) ->
            Ok(stdout_utf8)
        _ ->
            stderr_utf8 = Str.from_utf8_lossy(cmd_out.stderr)
            err_data =
                """
                Cmd `${cmd_str} ${Str.join_with(args, " ")}` failed:
                - status: ${Inspect.to_str(cmd_out.status)}
                - stdout: ${stdout_utf8}
                - stderr: ${stderr_utf8}
                """

            Err(BadCmdOutput(err_data))

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
