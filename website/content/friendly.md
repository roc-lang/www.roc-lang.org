# Friendly

Besides having a [friendly community](/community), Roc also prioritizes being a user-friendly language. This impacts the syntax, semantics, and tools Roc ships with.

## [Syntax and Formatter](#syntax) {#syntax}

Roc's syntax isn't trivial, but there also isn't much of it to learn. It's designed to be uncluttered and unambiguous. A goal is that you can normally look at a piece of code and quickly get an accurate mental model of what it means, without having to think through several layers of indirection. Here are some examples:

- `user.email` always accesses the `email` field of a record named `user`. <span class="nowrap">(Roc has</span> no inheritance, subclassing, or proxying.)
- `Email.isValid` always refers to something named `isValid` exported by a module named `Email`. (Module names are always capitalized, and variables/constants never are.) Modules are always defined statically and can't be modified at runtime; there's no [monkey patching](https://en.wikipedia.org/wiki/Monkey_patch) to consider either.
- `x = doSomething(y, z)` always declares a new constant `x` to be whatever the `doSomething` function returns when passed the arguments `y` and `z`.
- `"Name: ${name.trim()}"` uses *string interpolation* syntax: a dollar sign inside a string literal, followed by an expression in parentheses.

Roc also ships with a source code formatter that helps you maintain a consistent style with little effort. The `roc fmt` command neatly formats your source code according to a common style, and it's designed with the time-saving feature of having no configuration options. This feature saves teams all the time they would otherwise spend debating which stylistic tweaks to settle on!

## [Helpful compiler](#helpful-compiler) {#helpful-compiler}

Roc's compiler is designed to help you out. It does complete type inference across all your code, and the type system is [sound](https://en.wikipedia.org/wiki/Type_safety). This means you'll never get a runtime type mismatch if everything type-checked (including null exceptions; Roc doesn't have the [billion-dollar mistake](https://en.wikipedia.org/wiki/Null_pointer#History)), and you also don't have to write any type annotations—the compiler can infer all the types in your program.

If there's a problem at compile time, the compiler is designed to report it in a helpful way. Here's an example:

<pre><samp class="code-snippet"><span class="literal">── TYPE MISMATCH ─────────────────────────────────</span>

This expression is used in an unexpected way:
   ┌─ /.../main.roc:4:9
   │
<span class="literal">4 │</span> <span class="error">        if some_decimal > 0</span>
<span class="literal">5 │</span> <span class="error">            some_decimal + 1</span>
<span class="literal">6 │</span> <span class="error">        else</span>
<span class="literal">7 │</span> <span class="error">            0</span>

It has the type:

    <span class="literal">I64</span>

But you are trying to use it as:

    <span class="literal">Dec</span></samp></pre>

If you like, you can run a program that has compile-time errors like this by using the flag `--allow-errors`. If the program reaches the error at runtime, it will crash.

This lets you do things like trying out code that's only partially finished, or running tests for one part of your code base while other parts have compile errors. (Note that this feature is only partially completed, and often errors out; it has a ways to go before it works for all compile errors!)

## [Serialization inference](#serialization-inference) {#serialization-inference}

When dealing with [serialized data](https://en.wikipedia.org/wiki/Serialization), an important question is how and when that data will be decoded from a binary format (such as network packets or bytes on disk) into your program's data structures in memory.

A technique used in some popular languages today is to decode without validation. For example, some languages parse [JSON](https://www.json.org) using a function whose return type is unchecked at compile time (commonly called an `any` type). This technique has a low up-front cost, because it does not require specifying the expected shape of the JSON data.

Unfortunately, if there's any mismatch between the way that returned value ends up being used and the runtime shape of the JSON, it can result in errors that are time-consuming to debug because they are distant from (and may appear unrelated to) the JSON decoding where the problem originated. Since Roc has a [sound type system](https://en.wikipedia.org/wiki/Type_safety), it does not have an `any` type, and cannot support this technique.

Another technique is to validate the serialized data against a schema specified at compile time, and give an error during decoding if the data doesn't match this schema. Serialization formats like [protocol buffers](https://protobuf.dev/) require this approach, but some languages encourage (or require) doing it for _all_ serialized data formats, which prevents decoding errors from propagating throughout the program and causing distant errors. Roc supports and encourages using this technique.

In addition to this, Roc also supports serialization _inference_. It has some characteristics of both other approaches:
- Like the first technique, it does not require specifying a schema up front.
- Like the second technique, it reports any errors immediately during decoding rather than letting the problems propagate through the program.

TODO: update the text below for the new Roc compiler once [roc-json](https://github.com/lukewilliamboswell/roc-json) is updated.

This technique works by using Roc's type inference to infer the expected shape of serialized data based on how it's used in your program. Here's an example, using [`Decode.fromBytes`](https://www.roc-lang.org/builtins/Decode#fromBytes) to decode some JSON:

<pre><samp class="code-snippet"><span class="kw">when</span> Decode<span class="punctuation section">.</span>fromBytes data Json<span class="punctuation section">.</span>codec <span class="kw">is</span>
    <span class="literal">Ok</span> decoded <span class="kw">-></span> <span class="comment"># (use the decoded data here)</span>
    <span class="literal">Err</span> err <span class="kw">-></span> <span class="comment"># handle the decoding failure</span></samp></pre>

In this example, whether the `Ok` or `Err` branch gets taken at runtime is determined by the way the `decoded` value is used in the source code.

For example, if `decoded` is used like a record with a `username` field and an `email` field, both of which are strings, then this will fail at runtime if the JSON doesn't have fields with those names and those types. No type annotations are needed for this; it relies entirely on Roc's type inference, which by design can correctly infer types for your entire program even without annotations.

Serialization inference has a low up-front cost in the same way that the decode-without-validating technique does, but it doesn't have the downside of decoding failures propagating throughout your program to cause distant errors at runtime. (It also works for encoding; there is an [Encode.toBytes](https://www.roc-lang.org/builtins/Encode#toBytes) function which encodes similarly to how [`Decode.fromBytes`](https://www.roc-lang.org/builtins/Decode#fromBytes) decodes.)

Explicitly writing out a schema has its own benefits that can balance out the extra up-front time investment, but having both techniques available means you can choose whatever will work best for you in a given scenario.

## [Testing](#testing) {#testing}

The `roc test` command runs a Roc program's tests. Each test is declared with the `expect` keyword, and can be as short as one line. For example, this is a complete test:

```roc
## One plus one should equal two.
expect 1 + 1 == 2
```

If the test fails, `roc test` will show you the line number of the `expect` that failed. <a href="https://github.com/roc-lang/roc/issues/9320">You can help improve this to make it friendlier</a>!
We've been adding builtin functions to Set in Builtin.roc.
Only the intersection function is giving us some trouble, let's fix this refcounting problem:
1. Investigate
2. Find the root cause
3. Consider if there are multiple solutions possible
4. Choose the best solution that treats the root cause, no lazy workarounds or fallbacks.
```
❯ zig build test -- --test-filter "Set."          
Roc cache not found (nothing to clear)
test
└─ tests_summary
   └─ run test eval 27/28 passed, 1 failed
error: 'test.eval_test.test.Set.intersection - common elements' failed: LEAK: rc_addr=0x9e5410530 shadow_rc=1
  alloc(1) via allocate_with_refcount
  incref(+1)=2 via incref_rc_ptr
  decref=1 via decref_rc_ptr
  incref(+1)=2 via incref_rc_ptr
  incref(+1)=3 via incref_rc_ptr
  decref=2 via decref_rc_ptr
  decref=1 via decref_rc_ptr
  incref(+1)=2 via incref_rc_ptr
  decref=1 via decref_rc_ptr
  incref(+1)=2 via incref_rc_ptr
  incref(+1)=3 via incref_rc_ptr
  decref=2 via decref_rc_ptr
  decref=1 via decref_rc_ptr
  incref(+1)=2 via incref_rc_ptr
  decref=1 via decref_rc_ptr
  incref(+1)=2 via incref_rc_ptr
  decref=1 via decref_rc_ptr
  incref(+1)=2 via incref_rc_ptr
  decref=1 via decref_rc_ptr
  incref(+1)=2 via incref_rc_ptr
  decref=1 via decref_rc_ptr
  incref(+1)=2 via incref_rc_ptr
  decref=1 via decref_rc_ptr
  incref(+1)=2 via incref_rc_ptr
  decref=1 via decref_rc_ptr
LEAK: rc_addr=0x9e5410598 shadow_rc=4
  alloc(1) via allocate_with_refcount
  incref(+1)=2 via incref_rc_ptr
  decref=1 via decref_rc_ptr
  incref(+1)=2 via incref_rc_ptr
  incref(+1)=3 via incref_rc_ptr
  decref=2 via decref_rc_ptr
  decref=1 via decref_rc_ptr
  incref(+1)=2 via incref_rc_ptr
  decref=1 via decref_rc_ptr
  incref(+1)=2 via incref_rc_ptr
  incref(+1)=3 via incref_rc_ptr
  decref=2 via decref_rc_ptr
  decref=1 via decref_rc_ptr
  incref(+1)=2 via incref_rc_ptr
  decref=1 via decref_rc_ptr
  incref(+1)=2 via incref_rc_ptr
  decref=1 via decref_rc_ptr
  incref(+1)=2 via incref_rc_ptr
  decref=1 via decref_rc_ptr
  incref(+1)=2 via incref_rc_ptr
  incref(+1)=3 via incref_rc_ptr
  decref=2 via decref_rc_ptr
  incref(+1)=3 via incref_rc_ptr
  decref=2 via decref_rc_ptr
  incref(+1)=3 via incref_rc_ptr
  decref=2 via decref_rc_ptr
  incref(+1)=3 via incref_rc_ptr
  incref(+1)=4 via incref_rc_ptr
  decref=3 via decref_rc_ptr
  incref(+1)=4 via incref_rc_ptr
  decref=3 via decref_rc_ptr
  incref(+1)=4 via incref_rc_ptr
  decref=3 via decref_rc_ptr
  incref(+1)=4 via incref_rc_ptr
  incref(+1)=5 via incref_rc_ptr
  decref=4 via decref_rc_ptr
  incref(+1)=5 via incref_rc_ptr
  decref=4 via decref_rc_ptr
  incref(+1)=5 via incref_rc_ptr
  decref=4 via decref_rc_ptr
child executeAndFormat error: error.ChildExecFailed
/Users/username/gitrepos/roc7/roc/src/eval/test/helpers.zig:438:13: 0x108b4fc5f in forkAndExecute (eval)
            return error.ChildExecFailed;
            ^
/Users/username/gitrepos/roc7/roc/src/eval/test/helpers.zig:303:9: 0x108a7c23b in devEvaluatorStr (eval)
        return forkAndExecute(allocator, &dev_eval, &executable);
        ^
/Users/username/gitrepos/roc7/roc/src/eval/test/helpers.zig:555:21: 0x108b1d82b in compareFloatWithBackends__anon_20438 (eval)
    const dev_str = try devEvaluatorStr(allocator, module_env, inspect_expr, builtin_module_env);
                    ^
/Users/username/gitrepos/roc7/roc/src/eval/test/helpers.zig:2558:5: 0x108b1e80b in runExpectI64 (eval)
    try compareFloatWithBackends(test_allocator, interpreter_str, resources.module_env, resources.expr_idx, resources.builtin_module.env, f32);
    ^
/Users/username/gitrepos/roc7/roc/src/eval/test/eval_test.zig:4374:5: 0x1095db347 in test.Set.intersection - common elements (eval)
    try runExpectI64(
    ^
error: while executing test 'test.eval_test.test.Set.map - deduplicates after transform', the following test command failed:
./.zig-cache/o/faf5d2a1792629fab4496f4e5c99d81b/eval --cache-dir=./.zig-cache --seed=0xe0a33f65 --listen=-
Build succeeded!

Build Summary: 111/114 steps succeeded; 1 failed; 50/51 tests passed; 1 failed
test transitive failure
└─ tests_summary transitive failure
   └─ run test eval 27/28 passed, 1 failed

error: the following build command failed with exit code 1:
.zig-cache/o/7e509db139db76a7fe4cf11785ef053b/build /opt/homebrew/Cellar/zig/0.15.2/bin/zig /opt/homebrew/Cellar/zig/0.15.2/lib/zig /Users/username/gitrepos/roc7/roc .zig-cache /Users/username/.cache/zig --seed 0xe0a33f65 -Z2bc43df5fcf75849 test -- --test-filter Set.
```

# general tips

That repo contains the Roc CLI, a compiler and interpreter written in zig.
You can rebuild the roc binary with `zig build roc`, this will put it in `./zig-out/bin/roc`. 

Searching:
- Very important: always exclude the crates folder (at the root of the repo) from all your searches, it contains the old compiler.
- The source code of zig 0.15.2 is in /Users/username/gitrepos/zig, you can use it as documentation.

Debugging:
- I encourage you to add debug prints and other necessary code to verify your hypothesis.
- You can enable printing of std.log.debug statements by altering the log_level at the top of src/cli/main.zig
- If you are missing a tool that is not installed and that would help significantly, stop execution and tell me what I need to install.
- If you believe an issue is memory related, try building roc with refcount tracing: `zig build roc -Dtrace-refcount`

Style:
- Avoid using shortcuts, workarounds and special cases to get something to work. Avoid hardcoding things.
- Try to follow existing patterns in the codebase when applicable.
- Do not just change code when there are comments above it that explain the need for something to be done a certain way.
- Write high quality code, this is a production codebase.


If you encounter a network error when fetching dependencies, just run the command again.

Some zig commands do not output anything on success and just exit with code 0.

Note that `zig test` often does not work with our project, so we typically rely on `zig build test`, the flag `--summary all` can give your more info about which tests ran. You can run a single test with `zig build test -- --test-filter "substring that occurs in test name"`. If you add `--summary all` it must be located before the `-- --test-filter`.

It's recommended to always run with `--no-cache`, so `./zig-out/bin/roc myfile.roc --no-cache`, to prevent caching from behaving in unexpected ways.

Note that Roc has changed since your training data, it's recommended to check all_syntax_test.roc (and other .roc files if needed) if you're getting confusing errors when adding Roc code.

**Very Important**: when debugging, make sure you have found the root cause, and fix that, instead of trying to fix downstream symptoms. Do your best to avoid fallbacks and workarounds.

If you see an error like `ld64.lld: error: cannot open test/fx/./platform/targets/arm64mac/libhost.a: No such file or directory`, run `zig build test-platforms -Dplatform=fx`.

After you've done focused tests, run `zig build minici` to make sure you have not broken any other tests.




TODO uncomment once https://github.com/roc-lang/roc/issues/9320 is implemented
If the test fails, `roc test` will show you the source code of the `expect`, along with the values of any named variables inside it, so you don't have to separately check what they were.

If you write a documentation comment right before it (like `## One plus one should equal two` here), it will appear in the test output, so you can use that to add some descriptive context to the test if you want to.
-->

<!-- TODO uncomment once https://github.com/roc-lang/roc/issues/9323 is implemented
## [Inline expectations](#inline-expect) {#inline-expect}

You can also use `expect` in the middle of functions. This lets you verify assumptions that can't reasonably be encoded in types, but which can be checked at runtime. Similarly to [assertions](https://en.wikipedia.org/wiki/Assertion_(software_development)) in other languages, these will run not only during normal program execution, but also during your tests—and they will fail the test if any of them fails.

Unlike assertions (and unlike the `crash` keyword), failed `expect`s do not halt the program; instead, the failure will be reported and the program will continue. This means all `expect`s can be safely removed during `--optimize` builds without affecting program behavior—and so `--optimize` does remove them. This means you can add inline `expect`s without having to weigh each one's helpfulness against the performance cost of its runtime check, because they won't have any runtime cost after `--optimize` removes them.

In the future, there are plans to add built-in support for [benchmarking](https://en.wikipedia.org/wiki/Benchmark_(computing)), [generative tests](https://en.wikipedia.org/wiki/Software_testing#Property_testing), [snapshot tests](https://en.wikipedia.org/wiki/Software_testing#Output_comparison_testing), simulated I/O (so you don't have to actually run the real I/O operations, but also don't have to change your code to accommodate the tests), and "reproduction replays"—tests generated from a recording of what actually happened during a particular run of your program, which deterministically simulate all the I/O that happened.
-->

## Functional

Besides being designed to be [fast](/fast) and friendly, Roc is also a functional programming language.

[What does _functional_ mean here?](/functional)
