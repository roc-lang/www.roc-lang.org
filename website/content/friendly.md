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

## [Testing](#testing) {#testing}

The `roc test` command runs a Roc program's tests. Each test is declared with the `expect` keyword, and can be as short as one line. For example, this is a complete test:

```roc
## One plus one should equal two.
expect 1 + 1 == 2
```

If the test fails, `roc test` will show you the line number of the `expect` that failed. <a href="https://github.com/roc-lang/roc/issues/9320">You can help improve this to make it friendlier</a>!


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
