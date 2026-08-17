# Friendly

Besides having a [friendly community](/community), Roc also prioritizes being a user-friendly language. This impacts the syntax, semantics, and tools Roc ships with.

## [Syntax and Formatter](#syntax) {#syntax}

Roc's syntax isn't trivial, but there also isn't much of it to learn. It's designed to be uncluttered and unambiguous. A goal is that you can normally look at a piece of code and quickly get an accurate mental model of what it means, without having to think through several layers of indirection. Here are some examples:

- `user.email` always accesses the `email` field of a record named `user`. <span class="nowrap">(Roc has</span> no inheritance, subclassing, or proxying.)
- `Email.is_valid` always refers to the definition named `is_valid` associated with the `Email` type. Type names are capitalized, while definitions use lowercase snake case. Associated definitions are resolved statically and can't be modified at runtime; there's no [monkey patching](https://en.wikipedia.org/wiki/Monkey_patch) to consider either.
- `x = do_something(y, z)` always declares a new constant `x` whose value is whatever the `do_something` function returns when passed the arguments `y` and `z`.
- `"Name: ${name.trim()}"` uses *string interpolation* syntax: a dollar sign inside a string literal, followed by an expression in curly braces.

Roc also ships with a source code formatter that helps you maintain a consistent style with little effort. The `roc fmt` command neatly formats your source code according to a common style, and it's designed with the time-saving feature of having no configuration options. This feature saves teams all the time they would otherwise spend debating which stylistic tweaks to settle on!

## [Helpful compiler](#helpful-compiler) {#helpful-compiler}

Roc's compiler is designed to help you out. It does complete type inference across all your code, and the type system is [sound](https://en.wikipedia.org/wiki/Type_safety). This means you'll never get a runtime type mismatch if everything type-checked (including null exceptions; Roc doesn't have the [billion-dollar mistake](https://en.wikipedia.org/wiki/Null_pointer#History)), and you also don't have to write any type annotations—the compiler can infer all the types in your program.

If there's a problem at compile time, the compiler is designed to report it in a helpful way. Here's an example:

<pre><samp class="code-snippet"><span class="literal">── ✗ type mismatch ──────────────── /.../main.roc:6:33</span>

The first branch of this if does not match the previous branch.

result = if args.is_empty() {
    <span class="error">some_decimal + 1</span>
} else {

The first branch is:

    <span class="literal">Dec</span>

But the previous branch results in:

    <span class="literal">I64</span></samp></pre>

If you like, you can run a program that has compile-time errors like this. If the program reaches the error at runtime, it will crash.

This lets you try partially finished code or run tests for one part of your code base while another part has checked errors. (Note that this feature is only partially completed, and often errors out; it has a ways to go before it works for all compile errors!)

## [Testing](#testing) {#testing}

The `roc test` command runs a Roc program's tests. Each test is declared with the `expect` keyword, and the expectation itself can be as short as one line. For example, this is a complete minimal program with one test:

```roc
## One plus one should equal two.
expect 1 + 1 == 2

main! = |_args| Ok({})  # the main! function does nothing in this case
```

If the test fails, `roc test` shows its source location and source code. If you write a documentation comment right before the `expect` (like `## One plus one should equal two` here), it will appear in the test output, so you can use that to add some descriptive context to the test if you want to.

## [Inline expectations](#inline-expect) {#inline-expect}

You can also use `expect` inside functions. This lets you verify assumptions that can't reasonably be encoded in types but can be checked while running tests or development builds. If an executed inline `expect` fails, the failure is reported and execution continues.

All `expect` statements are removed in optimized builds (using `--opt=speed`), so inline expectations will have no runtime cost. It's important to note that inline expectations are development checks, not a substitute for handling errors that can occur in production.

In the future, there are plans to add built-in support for [benchmarking](https://en.wikipedia.org/wiki/Benchmark_(computing)), [generative tests](https://en.wikipedia.org/wiki/Software_testing#Property_testing), [snapshot tests](https://en.wikipedia.org/wiki/Software_testing#Output_comparison_testing), simulated I/O (so you don't have to actually run the real I/O operations, but also don't have to change your code to accommodate the tests), and "reproduction replays"—tests generated from a recording of what actually happened during a particular run of your program, which deterministically simulate all the I/O that happened.
-->

## Functional

Besides being designed to be [fast](/fast) and friendly, Roc is also a functional programming language.

[What does _functional_ mean here?](/functional)
