# Functional

Roc is best described as a pure [functional programming](https://en.wikipedia.org/wiki/Functional_programming) language. Most Roc code is written with immutable values and pure functions, while effects are kept explicit and separate.

Roc also offers locally mutable variables and imperative control flow—including `for`, `while`, `break`, and `return`. These features make Roc more approachable for people coming from imperative languages and can make a few algorithms clearer even for experienced Roc developers. They do not introduce shared mutable state or sacrifice function-level purity: a variable can only be reassigned inside the function where it was declared.

<!-- TODO uncomment once opportunistic mutation is implemented
## [Opportunistic mutation](#opportunistic-mutation) {#opportunistic-mutation}

Roc values are semantically immutable, but may be opportunistically mutated behind the scenes when it would improve performance (without affecting the program's behavior). For example:

```roc
colors
    .insert("Purple")
    .insert("Orange")
    .insert("Blue")
```

The [`Set.insert`](https://www.roc-lang.org/docs/main/Set#insert) function takes a `Set` and returns a `Set` with the given value inserted. It might seem like these three `Set.insert` calls would result in the creation of three brand-new sets, but Roc's *opportunistic mutation* optimizations mean this will be much more efficient.

Opportunistic mutation works by detecting when a semantically immutable value can be safely mutated in-place without changing the behavior of the program. If `colors` is *unique* here—that is, nothing else is currently referencing it—then `Set.insert` will mutate it and then return it. Cloning it first would have no benefit, because nothing in the program could possibly tell the difference!

If `colors` is _not_ unique, however, then the first call to `Set.insert` will not mutate it. Instead, it will clone `colors`, insert `"Purple"` into the clone, and then return that. At that point, since the clone will be unique (nothing else is referencing it, since it was just created), the subsequent `Set.insert` calls will all mutate in-place.

Roc has ways of detecting uniqueness at compile time, so this optimization will often have no runtime cost, but in some cases it instead uses automatic reference counting to tell when something that was previously shared has become unique over the course of the running program.
-->

## [Immutable by default](#immutable-by-default) {#immutable-by-default}

Roc values are semantically immutable. Passing a list, record, or other value to a function cannot let that function modify the value seen by its caller. In languages with shared mutable values, programmers often need to clone defensively to prevent unexpected changes. Roc makes that protection the default.

A reliability benefit of semantic immutability is that it rules out [data races](https://en.wikipedia.org/wiki/Race_condition#Data_race). These concurrency bugs can be difficult to reproduce and time-consuming to debug, and they require shared mutation that Roc does not expose.

Ordinary definitions are immutable too. Once `greeting = "Hello"` has introduced `greeting` in a scope, it is not intended to be reassigned or shadowed in that scope. Experienced Roc developers will generally use this functional style, with operations such as `map`, `fold`, pattern matching, and recursion.

When local mutation makes an algorithm easier to learn or clearer to read, Roc provides an explicit alternative.

## [Explicit local mutation](#no-reassignment) {#no-reassignment}

Writing the same ordinary definition twice is not how Roc expresses reassignment. The compiler reports a shadowing warning for code like this:

```roc
x = 1
x = 2
```

For intentional reassignment, declare a variable with `var` and use its `$` prefix at every subsequent reference:

```roc
var $count = 0
$count = $count + 1
```

The `$` makes possible reassignment visible at every use site. A variable can only be reassigned within the same function that declared it; a nested function cannot reassign a variable captured from an outer function. This restriction keeps mutation local and preserves the containing function's purity.

The same principle applies to imperative control flow. Using `for`, `while`, `break`, or `return` does not by itself make a function effectful. These constructs only control evaluation inside the current function.

### [Functional and imperative styles](#functional-and-imperative) {#functional-and-imperative}

For example, a list can be summed in a functional style with `fold`:

```roc
sum : List(I64) -> I64
sum = |numbers| numbers.fold(0, |total, number| total + number)
```

The same function can use a local variable and a `for` loop:

```roc
sum : List(I64) -> I64
sum = |numbers| {
    var $total = 0
    for number in numbers {
        $total = $total + number
    }
    $total
}
```

Both versions are pure: given the same list, they always return the same result and have no externally visible side effects. The first is the style experienced Roc developers will generally prefer; the second can be more familiar to beginners and useful when direct control flow makes an algorithm easier to follow.

### [Avoiding regressions](#avoiding-regressions) {#avoiding-regressions}

A benefit of this design is that it makes Roc code easier to rearrange without causing regressions. Consider this code:

```roc
make_message = |name| {
    greeting = "Hello"
    welcome = |recipient| "${greeting}, ${recipient}!"

    welcome(name)
}
```

Suppose I decide to extract the `welcome` function to the top level, so I can reuse it elsewhere:

```roc
make_message = |name| welcome("Hello", name)

welcome = |greeting, name| "${greeting}, ${name}!"
```

In warning-free Roc code, neither `greeting` nor the local `welcome` can be silently reassigned between their definitions and uses. Names that can change carry the visible `$` prefix, so refactoring immutable code requires less searching for hidden mutation.

Looping can also be expressed with `List.fold` or recursion. Roc performs tail-call optimization for eligible recursive functions.

## [Pure and effectful functions](#managed-effects) {#managed-effects}

Roc makes a first-class distinction between pure and effectful functions. A pure function always returns the same answer for the same arguments and has no externally visible side effects. An effectful function may perform I/O or call another effectful function.

Pure function types use `->`. Effectful function types use `=>`, and effectful function names end in `!`:

```roc
format_name : Str -> Str
format_name = |name| "Hello, ${name.trim()}!"

announce! : Str => {}
announce! = |name| echo!(format_name(name))
```

Unlike the former `Task`-based design, current Roc code calls effectful functions directly. Pure functions cannot call effectful functions, while effectful functions can call both. The compiler infers effectfulness and checks annotations, making the effectful boundary visible in names and types.

The application's [platform](https://roc-lang.org/docs/main/langref/platforms/) provides effectful functions and decides how each effect is implemented. A platform can use synchronous blocking I/O, asynchronous I/O, or another strategy appropriate to its domain.

This explicit separation is another reason Roc is a pure functional language: application logic can remain pure by construction, while the smaller effectful boundary is easy to identify.

## [Pure functions](#pure-functions) {#pure-functions}

Pure functions have valuable properties such as [referential transparency](https://en.wikipedia.org/wiki/Referential_transparency): a call can be replaced with its result without changing program behavior. They are straightforward to test because their results depend only on their arguments, and they are amenable to optimizations such as memoization and compile-time evaluation.

Local variables do not change these properties. A pure function may reassign its own `$` variables internally, but callers cannot observe those intermediate states. They can only observe the function's return value.

Roc permits `dbg` and `expect` inside pure functions as special development tools. Their output is for the programmer and is not part of the program's semantics, so program behavior must not depend on it.

Roc evaluates top-level values at compile time because they can only call pure functions. Purity can also enable optimizations such as dead-code elimination, loop fusion, and hoisting work out of loops.

## Get started

If this design sounds interesting to you, you can give Roc a try by heading over to the [tutorial](https://github.com/roc-lang/roc/blob/main/docs/mini-tutorial-new-compiler.md)!
