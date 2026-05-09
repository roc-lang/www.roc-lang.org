# Fast

Roc code is designed to build fast and run fast...but what does "fast" mean here? And how close is Roc's current implementation to realizing that goal?

## [Fast programs](#fast-programs) {#fast-programs}

What "fast" means in embedded systems is different from what it means in games, which in turn is different from what it means on the Web. To better understand Roc's performance capabilities, let's look at the upper bound of how fast optimized Roc programs are capable of running, and the lower bound of what types of languages Roc should generally outperform.

### [Limiting factors: memory management and async I/O](#limiting-factors) {#limiting-factors}

<span class="nowrap">Roc is a</span> [memory-safe](https://en.wikipedia.org/wiki/Memory_safety) language with [automatic memory management](https://en.wikipedia.org/wiki/Garbage_collection_(computer_science)#Reference_counting). Automatic memory management has some unavoidable runtime overhead, and memory safety based on static analysis rules out certain performance optimizations—which is why [unsafe Rust](https://doc.rust-lang.org/book/ch19-01-unsafe-rust.html) can outperform safe Rust. This gives Roc a lower performance ceiling than languages which support memory unsafety and manual memory management, such as C, C++, Zig, and Rust.

Another part of Roc's design is that all I/O operations are done using a lightweight state machine so that they can be asynchronous. This has potential performance benefits compared to synchronous I/O, but it also has some unavoidable overhead.

### [Generally faster than dynamic or gradual languages](#faster-than) {#faster-than}

As a general rule, Roc programs should have almost strictly less runtime overhead than equivalent programs written in languages with dynamic types and automatic memory management. This doesn't mean all Roc programs will outperform all programs in these languages, but it does mean Roc should have a higher ceiling on what performance is achievable.

This is because dynamic typing (and gradual typing) requires tracking types at runtime, which has overhead. Roc tracks types only at compile time, and tends to have [minimal (often zero) runtime overhead](https://vimeo.com/653510682) for language constructs compared to the top performers in industry. For example, Roc's generics, records, functions, numbers, and tag unions have no more runtime overhead than they would in their Rust or C++ equivalents.

When [benchmarking compiled Roc programs](https://www.youtube.com/watch?v=vzfy4EKwG_Y), the goal is to have them normally outperform the fastest mainstream garbage-collected languages (for example, Go, C#, Java, and JavaScript), but it's a non-goal to outperform languages that support memory unsafety or manual memory management. There will always be some individual benchmarks where mainstream garbage-collected languages outperform Roc, but the goal is for these to be uncommon rather than the norm.

### [Domain-specific memory management](#domain-specific-memory-management) {#domain-specific-memory-management}

Roc's ["platforms and applications" design](/platforms) means its automatic memory management can take advantage of domain-specific properties to improve performance.

For example, if you build an application on the [`basic-cli` platform](https://github.com/roc-lang/basic-cli) compared to the [`basic-webserver` platform](https://github.com/roc-lang/basic-webserver), each of those platforms may use a different memory management strategy under the hood that's tailored to their respective use cases. Your application's performance can benefit from this, even though building on either of those platforms feels like using ordinary automatic memory management.

This is because Roc [platforms](/platforms) get to determine how memory gets allocated and deallocated in applications built on them. ([`basic-cli`](https://github.com/roc-lang/basic-cli) and [`basic-webserver`](https://github.com/roc-lang/basic-webserver) are examples of platforms, but anyone can build their own platform.) Here are some examples of how platforms can use this to improve application performance:

- A platform for noninteractive command-line scripts can skip deallocations altogether, since any allocated memory will be cheaply reclaimed by the operating system anyway once the script exits. (This strategy is domain-specific; it would not work well for a long-running, interactive program!)
- A platform for Web servers can put all allocations for each request into a particular [region of memory](https://en.wikipedia.org/wiki/Region-based_memory_management) (this is known as "arena allocation" or "bump allocation") and then deallocate the entire region in one cheap operation after the response has been sent. This would essentially drop memory reclamation times to zero. (This strategy relies on Web servers' request/response architecture, and wouldn't make sense in other use cases.)
- A platform for applications that have very long-lived state could implement [meshing compaction](https://youtu.be/c1UBJbfR-H0?si=D9Gp0cdpjZ_Is5v8) to decrease memory fragmentation. (Compaction would probably be a net negative for performance in the previous two examples.)

[This talk](https://www.youtube.com/watch?v=cpQwtwVKAfU&t=75s) has more information about platforms and applications, including demos and examples of other benefits they unlock besides performance.

## Fast Feedback Loops

One of Roc's goals is to provide fast feedback loops by making builds normally feel "instant" except on truly enormous projects.

It's a concrete goal to have them almost always complete in under 1 second on the median computer being used to write Roc (assuming that system is not bogged down with other programs using up its resources), and ideally under the threshold at which humans typically find latency perceptible (around 100 milliseconds). In the future, hot code loading can make the feedback loop even faster, by letting you see changes without having to restart your program.

Note that although having fast "clean" builds (without the benefit of caching) is a goal, the "normally feels instant" goal refers to builds where caching was involved. After all, the main downside of build latency is that it comes up over and over in a feedback loop; a fast initial "clean" build is valuable too, but it comes up rarely by comparison.

## Friendly

In addition to being fast, Roc also aims to be a friendly programming language.

[What does _friendly_ mean here?](/friendly)
