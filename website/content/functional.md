# Functional

Roc is designed to have a small number of simple language primitives. This goal leads Roc to be a [functional](https://en.wikipedia.org/wiki/Functional_programming) language, while its [performance goals](/fast) lead to some design choices that are uncommon in functional languages.

<!-- TODO uncomment once opportunistic mutation is implemented
## [Opportunistic mutation](#opportunistic-mutation) {#opportunistic-mutation}

Roc values are semantically immutable, but may be opportunistically mutated behind the scenes when it would improve performance (without affecting the program's behavior). For example:

```roc
colors
    .insert("Purple")
    .insert("Orange")
    .insert("Blue")
```

The [`Set.insert`](https://www.roc-lang.org/builtins/Set#insert) function takes a `Set` and returns a `Set` with the given value inserted. It might seem like these three `Set.insert` calls would result in the creation of three brand-new sets, but Roc's *opportunistic mutation* optimizations mean this will be much more efficient.

Opportunistic mutation works by detecting when a semantically immutable value can be safely mutated in-place without changing the behavior of the program. If `colors` is *unique* here—that is, nothing else is currently referencing it—then `Set.insert` will mutate it and then return it. Cloning it first would have no benefit, because nothing in the program could possibly tell the difference!

If `colors` is _not_ unique, however, then the first call to `Set.insert` will not mutate it. Instead, it will clone `colors`, insert `"Purple"` into the clone, and then return that. At that point, since the clone will be unique (nothing else is referencing it, since it was just created), the subsequent `Set.insert` calls will all mutate in-place.

Roc has ways of detecting uniqueness at compile time, so this optimization will often have no runtime cost, but in some cases it instead uses automatic reference counting to tell when something that was previously shared has become unique over the course of the running program.
-->

## [Immutable by default](#immutable-by-default) {#immutable-by-default}

By default, Roc values are semantically immutable. In many languages, everything is mutable by default, and it's up to the programmer to "defensively" clone to avoid undesirable modification. Roc's approach means that cloning happens automatically, which can be less error-prone than defensive cloning (which might be forgotten), but <span class="nowrap">which—to be fair—can</span> also increase unintentional cloning. It's a different default with different tradeoffs.

A reliability benefit of semantic immutability is that it rules out [data races](https://en.wikipedia.org/wiki/Race_condition#Data_race). These concurrency bugs can be difficult to reproduce and time-consuming to debug, and they are only possible through direct mutation.

Direct mutation primitives have benefits too. Some algorithms are more concise or otherwise easier to read when written with direct mutation, and direct mutation can make the performance characteristics of some operations clearer. To address this, Roc provides opt-in mutable variables (described in the next section), while keeping immutability as the default.

As such, Roc's design means that data races and reference cycles can be ruled out for the vast majority of code, and that functions will tend to be more amenable for chaining, while mutable variables provide an escape hatch for algorithms where direct mutation leads to clearer code.

## [No reassignment or shadowing by default](#no-reassignment) {#no-reassignment}

In some languages, the following is allowed.

<pre><samp class="code-snippet"><span class="literal">x <span class="kw">=</span> <span class="literal">1</span>
x <span class="kw">=</span> <span class="literal">2</span></samp></pre>

In Roc, you can only execute that code when using the `--allow-errors` flag.
That flag is intended to give you the freedom to quickly debug something or try something out even though some parts of the code contain errors.

For cases where reassignment is the most natural way to express something, Roc provides mutable variables. These are declared with `var` and marked with a `$` prefix. For example, `var $count = 0` declares a mutable variable that can later be reassigned with `$count = $count + 1`. The `$` prefix makes it immediately clear at every use site that a value might change, preserving the readability benefits of immutability by default while providing a convenient way to express algorithms that are more natural with mutation.

### [Avoiding regressions](#avoiding-regressions) {#avoiding-regressions}

A benefit of this design is that it makes Roc code easier to rearrange without causing regressions. Consider this code:

<pre><samp class="code-snippet">func <span class="kw">=</span> <span class="kw">|</span>arg<span class="kw">|</span>
    greeting <span class="kw">=</span> <span class="string">"Hello"</span>
    welcome <span class="kw">=</span> <span class="kw">|</span>name<span class="kw">|</span> <span class="string">"</span><span class="kw">${</span>greeting<span class="kw">}</span><span class="string">, </span><span class="kw">${</span>name<span class="kw">}</span><span class="string">!"</span>

    <span class="comment"># …</span>

    message <span class="kw">=</span> welcome<span class="kw">(</span><span class="string">"friend"</span><span class="kw">)</span>

    <span class="comment"># …</span></samp></pre>

Suppose I decide to extract the `welcome` function to the top level, so I can reuse it elsewhere:

<pre><samp class="code-snippet">func <span class="kw">=</span> <span class="kw">|</span>arg<span class="kw">|</span>
    <span class="comment"># …</span>

    message <span class="kw">=</span> welcome<span class="kw">(</span><span class="string">"Hello"</span><span class="punctuation section">,</span> <span class="string">"friend"</span><span class="kw">)</span>

    <span class="comment"># …</span>

welcome <span class="kw">=</span> <span class="kw">|</span>prefix<span class="punctuation section">,</span> name<span class="kw">|</span> <span class="string">"</span><span class="kw">${</span>prefix<span class="kw">}</span><span class="string">, </span><span class="kw">${</span>name<span class="kw">}</span><span class="string">!"</span></samp></pre>

Even without knowing the rest of `func`, we can be confident this change will not alter the code's behavior.

In contrast, suppose Roc allowed reassignment. Then it's possible something in the `# …` parts of the code could have modified `greeting` before it was used in the `message =` declaration. For example:

<pre><samp class="code-snippet">func <span class="kw">=</span> <span class="kw">|</span>arg<span class="kw">|</span>
    greeting <span class="kw">=</span> <span class="string">"Hello"</span>
    welcome <span class="kw">=</span> <span class="kw">|</span>name<span class="kw">|</span> <span class="string">"</span><span class="kw">${</span>greeting<span class="kw">}</span><span class="string">, </span><span class="kw">${</span>name<span class="kw">}</span><span class="string">!"</span>

    <span class="comment"># …</span>

    <span class="kw">if</span> someCondition
        greeting <span class="kw">=</span> <span class="string">"Hi"</span>
        <span class="comment"># …</span>
    <span class="kw">else</span>
        <span class="comment"># …</span>

    <span class="comment"># …</span>
    message <span class="kw">=</span> welcome<span class="kw">(</span><span class="string">"friend"</span><span class="kw">)</span>
    <span class="comment"># …</span></samp></pre>

If we didn't read the whole function and notice that `greeting` was sometimes (but not always) reassigned from `"Hello"` to `"Hi"`, we might not have known that changing it to `message = welcome("Hello", "friend")` would cause a regression due to having the greeting always be `"Hello"`.

Even if Roc disallowed reassignment but allowed shadowing, a similar regression could happen if the `welcome` function were shadowed between when it was defined here and when `message` later called it in the same scope. Because Roc allows neither shadowing nor reassignment for regular bindings, these regressions can't happen, and rearranging code can be done with more confidence. (Mutable variables, with their `$` prefix, make it obvious which names can change.)

Mutable variables work naturally with Roc's `for` loop syntax. For example, here's a function that sums a list of numbers:

```roc
sum = |num_list| {
    var $total = 0

    for num in num_list {
        $total = $total + num
    }

    $total
}
```

Looping can also be done with convenience functions like `List.walk` or with recursion (Roc implements [tail-call optimization](https://en.wikipedia.org/wiki/Tail_call)).

## [Managed effects over side effects](#managed-effects) {#managed-effects}

Many languages support first-class [asynchronous](https://en.wikipedia.org/wiki/Asynchronous_I/O) effects, which can improve a system's throughput (usually at the cost of some latency) especially in the presence of long-running I/O operations like network requests.

Asynchronous effects are commonly represented by a value such as a [Promise or Future](https://en.wikipedia.org/wiki/Futures_and_promises) (Roc calls these Tasks), which represent an effect to be performed. Tasks can be composed together, potentially while customizing concurrency properties and supporting I/O interruptions like cancellation and timeouts.

Most languages also have a separate system for synchronous effects, namely [side effects](https://en.wikipedia.org/wiki/Side_effect_(computer_science)). Having two different ways to perform every I/O operation—one synchronous and one asynchronous—can lead to a lot of duplication across a language's ecosystem.

Instead of having [side effects](https://en.wikipedia.org/wiki/Side_effect_(computer_science)), Roc functions exclusively use *managed effects* in which they return descriptions of effects to run, in the form of Tasks. Tasks can be composed and chained together, until they are ultimately handed off (usually via a `main` function or something similar) to an effect runner outside the program, which actually performs the effects the tasks describe.

Having only (potentially asynchronous) *managed effects* and no (synchronous) *side effects* both simplifies the language's ecosystem and makes certain guarantees possible. For example, the combination of managed effects and semantically immutable values means all Roc functions are [pure](https://en.wikipedia.org/wiki/Pure_function)—that is, they have no side effects and always return the same answer when called with the same arguments.

## [Pure functions](#pure-functions) {#pure-functions}

Pure functions have some valuable properties, such as [referential transparency](https://en.wikipedia.org/wiki/Referential_transparency) and being trivial to [memoize](https://en.wikipedia.org/wiki/Memoization). They also have testing benefits; for example, all Roc tests which either use simulated effects (or which do not involve Tasks at all) can never flake. They either consistently pass or consistently fail. Because of this, their results can be cached, so `roc test` can skip re-running them unless their source code (including dependencies) changed. (This caching has not yet been implemented, but is planned.)

Roc does support [tracing](https://en.wikipedia.org/wiki/Tracing_(software)) via the `dbg` keyword, an essential [debugging](https://en.wikipedia.org/wiki/Debugging) tool which is unusual among side effects in that using it should not affect the behavior of the program. As such, it typically does not impact the guarantees of pure functions in practice.

Pure functions are notably amenable to compiler optimizations, and Roc already takes advantage of them to implement [function-level dead code elimination](https://elm-lang.org/news/small-assets-without-the-headache). Here are some other examples of optimizations that will benefit from this in the future; these are planned, but not yet implemented:

- [Loop fusion](https://en.wikipedia.org/wiki/Loop_fission_and_fusion), which can do things like combining consecutive `List.map` calls (potentially intermingled with other operations that traverse the list) into one pass over the list.
- [Hoisting](https://en.wikipedia.org/wiki/Loop-invariant_code_motion), which moves certain operations outside loops to prevent them from being re-evaluated unnecessarily on each step of the loop. It's always safe to hoist calls to pure functions, and in some cases they can be hoisted all the way to the top level, at which point they become eligible for compile-time evaluation.

There are other optimizations (some of which have yet to be considered) that pure functions enable; this is just a sample!

## Get started

If this design sounds interesting to you, you can give Roc a try by heading over to the [tutorial](/tutorial)!
