<div class="banner">
<strong>Compiler Rebuild in Progress:</strong> The Roc compiler is currently being rewritten in Zig. We are minimally maintaining the old Rust compiler while focusing on the new one. If you'd like to help or try out the new compiler (bugs and all), <a href="https://roc.zulipchat.com">join us on Zulip chat</a>!
</div>

<div role="presentation" id="homepage-intro-outer">
<div role="presentation" id="homepage-intro-box">
<h1 id="homepage-h1">Roc</h1>
<svg id="homepage-logo" aria-labelledby="logo-svg-title logo-svg-desc" width="240" height="240" viewBox="0 0 51 53" fill="none" xmlns="http://www.w3.org/2000/svg"><title id="logo-svg-title">The Roc logo</title><desc id="logo-svg-desc">A purple origami bird made of six triangles</desc><path d="M23.6751 22.7086L17.655 53L27.4527 45.2132L26.4673 39.3424L23.6751 22.7086Z" class="logo-dark"/><path d="M37.2438 19.0101L44.0315 26.3689L45 22L45.9665 16.6324L37.2438 19.0101Z" class="logo-light"/><path d="M23.8834 3.21052L0 0L23.6751 22.7086L23.8834 3.21052Z" class="logo-light"/><path d="M44.0315 26.3689L23.6751 22.7086L26.4673 39.3424L44.0315 26.3689Z" class="logo-light"/><path d="M50.5 22L45.9665 16.6324L45 22H50.5Z" class="logo-dark"/><path d="M23.6751 22.7086L44.0315 26.3689L37.2438 19.0101L23.8834 3.21052L23.6751 22.7086Z" class="logo-dark"/>
</svg>

<p id="homepage-tagline">A fast, friendly, functional language.</p>
<pre id="first-code-sample"><samp class="code-snippet">credits <span class="kw">=</span> List<span class="punctuation section">.</span>map<span class="punctuation section">(</span>songs<span class="punctuation section">,</span> <span class="kw">|</span>song<span class="kw">|</span>
    <span class="string">"Performed by </span><span class="kw">${</span>song<span class="punctuation section">.</span>artist<span class="kw">}</span><span class="string">"</span><br><span class="punctuation section">)</span></samp></pre>
</div>
</div>

<section class="home-goals-container" aria-label="Roc's Design: Fast, Friendly, Functional">
    <div role="presentation" class="home-goals-column">
        <a href="/fast" class="home-goals-content">
            <h3 class="home-goals-title">Fast</h3>
            <p class="home-goals-description">Roc code is designed to build fast and <span class="nowrap">run fast</span>. It compiles to machine code or WebAssembly.</p>
            <p class="home-goals-learn-more">What does <i>fast</i> mean here?</p>
        </a>
    </div>
    <div role="presentation" class="home-goals-column">
        <a href="/friendly" class="home-goals-content">
            <h3 class="home-goals-title">Friendly</h3>
            <p class="home-goals-description">Roc's syntax, semantics, and included toolset all prioritize user-friendliness.</p>
            <p class="home-goals-learn-more">What does <i>friendly</i> mean here?</p>
        </a>
    </div>
    <div role="presentation" class="home-goals-column">
        <a href="/functional" class="home-goals-content">
            <h3 class="home-goals-title">Functional</h3>
            <p class="home-goals-description">
             Roc has a small number of simple language primitives. It's a single-paradigm <span class="nowrap">functional language.</span></p>
            <p class="home-goals-learn-more">What does <i>functional</i> mean here?</p>
        </a>
    </div>
</section>

<section id="try-roc">
<h2><a href="#try-roc">Try Roc</a></h2>

<div id="homepage-repl-container" role="presentation">
    <div id="repl-description" role="presentation">
        <p>You can try Roc using this read-eval-print loop (<a href="https://en.wikipedia.org/wiki/Read%E2%80%93eval%E2%80%93print_loop">REPL</a>), which is running in your browser in <a href="https://webassembly.org">WebAssembly</a>.</p>
        <p><code>Shift-Enter</code> adds a newline.</p>
        <p>Try entering <code>0.1 + 0.2</code>
        <svg id="repl-arrow" role="presentation" width="100" height="50" viewBox="0 0 100 50" xmlns="http://www.w3.org/2000/svg">
          <polygon points="70,20 30,20 30,15 0,25 30,35 30,30 70,30"/>
        </svg>
        </p>
    </div>
    <div id="repl" role="presentation">
        <code class="history">
          <div id="repl-intro-text">Enter an expression to evaluate, or a definition (like <span class="color-blue">x = 1</span>) to use later.</div>
          <div id="history-text" aria-live="polite"></div>
        </code>
        <div id="repl-prompt" role="presentation">»</div>
        <textarea aria-label="Input Roc code here, then press Enter to submit it to the REPL" rows="5" id="source-input" placeholder="Enter some Roc code here." spellcheck="false"></textarea>
    </div>
</div>
<script type="module" src="/site.js"></script>
</section>

## [Examples](#examples) {#examples}

Roc is a young language. It doesn't even have a numbered release yet, just alpha builds!

However, it can already be used for several things if you're up for being an early adopter—<br>
with all the bugs and missing features which come with that territory.

Here are some examples of how it can be used today.

<div role="presentation" class="home-examples-container">
    <div role="presentation" class="home-examples-column">
        <h3 class="home-examples-title">Command-Line Interfaces</h3>
    <pre><samp class="code-snippet">main! <span class="kw">=</span> <span class="kw">|</span>args<span class="kw">|</span>
    Stdout<span class="punctuation section">.</span>line<span class="punctuation section">!</span><span class="punctuation section">(</span><span class="literal">"Hello!"</span><span class="punctuation section">)</span></samp></pre>
        <p>You can use Roc to create scripts and command-line interfaces (CLIs). The compiler produces binary executables, so Roc programs can run on devices that don't have Roc itself installed.</p>
        <p>As an example, the HTML for this website is generated using a <a href="https://github.com/roc-lang/www.roc-lang.org/blob/main/website/static_site_gen.roc">simple Roc script</a>.</p>
        <p>If you’re looking for a starting point for building a command-line program in Roc, <a href="https://github.com/roc-lang/basic-cli">basic-cli</a> is a popular <a href="/platforms">platform</a> to check out.</p>
    </div>
    <div role="presentation" class="home-examples-column">
        <h3 class="home-examples-title">Web Servers</h3>
<pre><samp class="code-snippet">handle_req! <span class="kw">=</span> <span class="kw">|</span>request<span class="kw">|</span>
    Ok<span class="punctuation section">(</span><span class="literal">{</span> body: <span class="comment">…</span> <span class="literal">}</span><span class="punctuation section">)</span></samp></pre>
        <p>You can also build web servers in Roc. <a href="https://github.com/roc-lang/basic-webserver">basic-webserver</a> is a <a href="/platforms">platform</a> with
        a simple interface: you write a function which takes a <code>Request</code>, does some I/O, and returns a <code>Response</code>.</p>
        <p>Behind the scenes, it uses Rust's high-performance <a href="https://docs.rs/hyper/latest/hyper/">hyper</a> and <a href="https://tokio.rs/">tokio</a> libraries to execute your Roc function on incoming requests.</p>
        <p>For database access, <a href="https://github.com/agu-z/roc-pg">roc-pg</a> lets you access a <a href="https://www.postgresql.org/">PostgreSQL</a> database&mdash;with your Roc types checked against the types in your database's schema.</p>
    </div>
    <div role="presentation" class="home-examples-column">
        <h3 class="home-examples-title">Embedding</h3>
        <pre><samp class="code-snippet">fn <span class="kw">=</span> require(<span class="string">"foo.roc"</span>)<span class="kw">;</span>
log(<span class="string">`Roc says </span><span class="kw">${</span>fn()<span class="kw">}</span><span class="string">`</span>)<span class="kw">;</span></samp></pre>
        <p>You can call Roc functions from other languages. There are several <a href="https://github.com/roc-lang/roc/tree/main/examples">basic examples</a> of how to call Roc functions from Python, Node.js, Swift, WebAssembly, and JVM languages.</p>
        <p>Any language that supports C interop can call Roc functions, using similar techniques to the ones found in these examples.</p>
        <p>Most of those are minimal proofs of concept, but <a href="https://github.com/vendrinc/roc-esbuild">roc-esbuild</a> is a work in progress that's used at <a href="https://www.vendr.com/careers">Vendr</a> to call Roc functions from Node.js.</p>
    </div>
</div>

### [Other Examples](#other-examples) {#other-examples}

You can find more use cases and examples on the [examples page](/examples)!

</section>

## [Code Sample with Explanations](#code-sample) {#code-sample}

Here's a code sample that shows a few different aspects of Roc:

- File I/O and HTTP requests
- Pattern matching for error handling
- JSON deserialization via type inference
- Common syntax sugar: the `?` infix and postfix operators and string interpolation

The [tutorial](/tutorial) introduces these gradually and in more depth, but this gives a brief overview.

<!-- THIS COMMENT WILL BE REPLACED BY THE LARGER EXAMPLE -->

## [Sponsors](#sponsors) {#sponsors}

We are very grateful for our corporate sponsors! They are [Lambda Class](https://lambdaclass.com), <a href="https://www.ohne-makler.net"><span class="nowrap">ohne-makler</span></a>, and [Martian](https://withmartian.com).

<p id="sponsor-logos" aria-hidden="true"> <!-- aria-hidden because for screen readers this whole section is redundant with the preceding paragraph -->
    <a href="https://lambdaclass.com"><svg class="logo-lambda-class" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 191 52"><path d="M56.42,35.71l-8.04-18.12-7.81,17.59c-1.07,2.29-1.91,3.14-3.98,3.29h-5.74l10.41-23.55h-4.13l2.99-6.65h8.19c3.22,0,4.67,.99,6.28,4.82l7.96,17.82V14.91h-2.84l-3.44-6.65h8.96c3.22,0,4.67,.99,6.28,4.82l7.89,17.89,7.88-17.89c1.68-3.75,3.06-4.82,6.28-4.82h2.6v30.28h-6.81v-14.99l-5.36,12.16c-1.15,2.14-2.3,2.75-4.67,2.75-.92,.1-1.85-.09-2.66-.55-.81-.45-1.46-1.14-1.86-1.98l-5.51-12.39v14.91l-8.34,.08c-2.37,0-3.37-.69-4.52-2.83Z"/><path d="M0,52l3.83-8.64h3.6c3.22,0,3.98-.99,5.59-4.82L29.7,0h10.1L21.13,43.36H61.47l-3.83,8.64H0Z"/><path d="M191,52h-57.64l-3.83-8.64h40.34l-11.02-25.62-7.43,16.75c-1.46,3.14-2.22,4.05-5.21,4.13h-4.98l2.14-4.74c-1.42,1.5-3.12,2.69-5.02,3.51-1.9,.82-3.94,1.23-6,1.23l-8.34-.08V18.35h6.66v13.53h1.76c2.23,0,4.38-.89,5.95-2.46,1.58-1.58,2.47-3.72,2.47-5.95s-.89-4.37-2.47-5.95c-1.58-1.58-3.72-2.46-5.95-2.46h-8.34l-3.44-6.65h11.79c4.02,0,7.87,1.61,10.71,4.44,2.84,2.84,4.44,6.68,4.45,10.7,.01,.41-.01,.82-.08,1.22l7.27-16.36-3.44-8.41h10.11l16.54,38.54c1.68,3.75,2.37,4.82,5.59,4.82h3.6l3.83,8.64Z"/><path d="M117.36,20.26c.52-1.1,.78-2.3,.76-3.52,0-1.11-.21-2.2-.63-3.22-.42-1.02-1.04-1.95-1.82-2.73-.78-.78-1.71-1.4-2.74-1.82-1.02-.42-2.12-.64-3.23-.63h-9.95v6.65h9.95c.45,0,.88,.18,1.19,.49,.32,.32,.49,.74,.49,1.19s-.18,.87-.49,1.19c-.32,.32-.74,.49-1.19,.49h-9.95v20.11l11.71,.08c2.14,0,4.22-.67,5.95-1.93,1.73-1.26,3.01-3.03,3.67-5.06,.65-2.03,.65-4.22-.02-6.25-.67-2.03-1.97-3.79-3.7-5.04h0Zm-5.89,11.55h-5.05v-6.73h5.12c.45,0,.89,.09,1.3,.26,.41,.17,.79,.42,1.1,.74,.31,.32,.56,.69,.73,1.11,.17,.41,.25,.86,.25,1.3,0,.45-.1,.89-.27,1.29-.18,.41-.43,.78-.75,1.09-.32,.31-.7,.55-1.11,.71-.42,.16-.86,.24-1.31,.23h0Z"/><path d="M75.32,49.49c-.31,.35-.69,.63-1.12,.83-.48,.21-1.01,.31-1.54,.3-.5,0-1-.08-1.46-.26-.43-.17-.83-.42-1.16-.74-.33-.32-.6-.71-.78-1.14-.19-.47-.29-.96-.28-1.47,0-.51,.09-1.02,.29-1.49,.18-.43,.44-.81,.78-1.13,.34-.32,.74-.56,1.18-.72,.47-.17,.96-.26,1.46-.25,.49,0,.97,.09,1.43,.26,.44,.15,.83,.41,1.14,.75l-1.12,1.12c-.15-.21-.37-.38-.61-.47-.24-.1-.51-.15-.77-.15-.27,0-.55,.05-.8,.16-.24,.1-.45,.25-.62,.44-.18,.19-.32,.42-.41,.66-.1,.27-.15,.55-.14,.83,0,.29,.05,.58,.14,.85,.09,.24,.23,.47,.4,.66,.17,.18,.38,.33,.61,.43,.25,.1,.51,.16,.78,.15,.3,0,.59-.06,.86-.19,.23-.12,.43-.29,.59-.5l1.15,1.08Zm5.43,.95v-6.83h1.66v5.39h2.65v1.44h-4.31Zm14.44,0l-.53-1.34h-2.65l-.5,1.34h-1.8l2.87-6.83h1.6l2.84,6.83h-1.84Zm-1.84-5.01l-.87,2.35h1.72l-.85-2.35Zm12.58-.05c-.15-.19-.34-.33-.56-.43-.21-.1-.43-.16-.66-.16-.11,0-.22,0-.33,.03-.11,.02-.21,.06-.3,.11-.09,.05-.17,.13-.23,.21-.06,.1-.1,.22-.09,.33,0,.1,.02,.2,.07,.29,.05,.08,.13,.15,.21,.2,.11,.06,.22,.12,.33,.16,.13,.05,.27,.1,.43,.15,.23,.08,.47,.16,.73,.26,.24,.09,.48,.22,.69,.37,.21,.16,.38,.35,.51,.58,.14,.26,.21,.56,.2,.85,0,.35-.07,.7-.22,1.02-.14,.28-.33,.52-.58,.71-.25,.19-.54,.33-.84,.41-.32,.09-.65,.14-.98,.14-.49,0-.97-.09-1.42-.26-.43-.15-.82-.4-1.14-.73l1.08-1.1c.18,.22,.41,.39,.66,.52,.25,.13,.53,.2,.82,.21,.12,0,.24-.01,.36-.04,.11-.02,.21-.07,.3-.13,.09-.06,.16-.14,.21-.23,.05-.11,.08-.23,.08-.35,0-.12-.03-.23-.1-.33-.07-.1-.17-.18-.28-.25-.14-.08-.29-.15-.44-.2-.18-.06-.38-.13-.6-.2-.22-.07-.43-.15-.64-.25-.21-.09-.4-.22-.56-.37-.17-.16-.3-.34-.4-.55-.11-.25-.16-.52-.15-.79-.01-.34,.07-.68,.23-.97,.15-.26,.36-.49,.61-.67,.26-.18,.55-.31,.85-.38,.31-.08,.63-.12,.96-.12,.4,0,.8,.07,1.18,.21,.39,.13,.75,.35,1.06,.63l-1.06,1.11Zm10.43,0c-.15-.19-.34-.33-.56-.43-.21-.1-.43-.16-.66-.16-.11,0-.22,0-.33,.03-.11,.02-.21,.06-.3,.11-.09,.05-.17,.13-.23,.21-.06,.1-.1,.22-.09,.33,0,.1,.02,.2,.07,.29,.05,.08,.13,.15,.21,.2,.11,.06,.22,.12,.33,.16,.13,.05,.27,.1,.44,.15,.23,.08,.47,.16,.72,.26,.24,.09,.48,.22,.69,.37,.21,.16,.38,.35,.51,.58,.14,.26,.21,.56,.2,.85,0,.35-.07,.7-.22,1.02-.14,.28-.33,.52-.58,.71-.25,.19-.54,.33-.84,.41-.32,.09-.65,.14-.98,.14-.49,0-.97-.09-1.42-.26-.43-.15-.82-.4-1.14-.73l1.08-1.1c.18,.22,.41,.39,.66,.52,.25,.13,.53,.2,.82,.21,.12,0,.24-.01,.36-.04,.11-.02,.21-.07,.3-.13,.09-.06,.16-.14,.21-.23,.05-.11,.08-.23,.08-.35,0-.12-.03-.23-.1-.33-.07-.1-.17-.18-.28-.25-.14-.08-.29-.15-.44-.2-.18-.06-.38-.13-.6-.2-.22-.07-.43-.15-.64-.25-.21-.09-.4-.22-.56-.37-.17-.16-.3-.34-.4-.55-.11-.25-.16-.52-.15-.79-.01-.34,.07-.68,.23-.97,.15-.26,.36-.49,.61-.67,.26-.18,.55-.31,.85-.38,.31-.08,.63-.12,.96-.12,.4,0,.8,.07,1.18,.21,.39,.13,.75,.35,1.06,.63l-1.06,1.11Z"/></svg></a>
    <a href="https://www.ohne-makler.net"><svg class="ohne-makler-logo" xmlns="http://www.w3.org/2000/svg" width="202" height="64" fill="none"><path fill="#236BE9" d="M147.206 38.4c-.312 1.722-.324 3.96-.324 6.653v7.89l6.228-5.388-1.296-.352v-1.161c1.261.07 2.557.088 3.8.088 1.008 0 2.034-.036 3.024-.088v1.161l-1.584.352c-2.395 1.584-4.699 3.434-6.932 5.3 2.16 2.342 6.736 7.219 8.931 9.244l.896.243 1.48-.278c.304-1.685.323-3.862.325-6.48v-8.3c-.002-2.598-.021-4.774-.325-6.471-.683-.123-1.423-.283-2.16-.407v-1.161c1.224-.07 3.798-.51 5.131-.845h1.674c-.304 1.683-.322 3.862-.324 6.478v10.75c0 2.596.021 4.772.324 6.471l1.872.352v1.162c-1.386-.035-2.808-.088-4.194-.088-1.123 0-2.272.046-3.403.073v.015c-2.413 0-3.962.123-5.258.387l-2.448-2.87-2.934-3.274-2.845-3.187v.8c0 2.675.013 4.912.323 6.648l1.872.352v1.161c-1.385-.035-2.808-.088-4.193-.088-1.388 0-2.81.07-4.196.088l.018-1.216 1.872-.352c.304-1.683.323-3.86.325-6.476v-8.304c-.002-2.596-.021-4.772-.325-6.47-.683-.122-1.422-.282-2.16-.406v-1.161c1.224-.07 3.798-.51 5.131-.845h1.675ZM9.614 45.654c6.572 0 9.616 4.261 9.616 9.136 0 3.999-2.648 9.175-9.616 9.175C3.637 63.965 0 60.514 0 54.792c0-5.264 4.123-9.138 9.614-9.138Zm60.244 0c3.456 0 7.417 1.99 7.417 6.901v.97H64.71c0 4.982 1.872 7.605 5.707 7.605 2.288 0 4.16-1.285 5.869-2.94l1.315 1.197c-1.62 1.92-4.357 4.578-8.318 4.578-6.77 0-9.093-4.754-9.093-8.416 0-6.656 5.006-9.895 9.669-9.895Zm108.369 0c3.456 0 7.418 1.99 7.418 6.901v.97h-12.567c0 4.982 1.872 7.605 5.708 7.605 2.288 0 4.16-1.285 5.87-2.94l1.314 1.197c-1.621 1.92-4.357 4.578-8.319 4.578-6.768 0-9.091-4.754-9.091-8.416 0-6.656 5.005-9.895 9.667-9.895Zm-47.099-.017c6.229 0 7.13 2.71 7.13 6.267 0 .8.105 3.187.22 5.682l.01.232.016.345.011.23c.048 1.079.098 2.148.138 3.089l1.765.916-.018 1.18a53.341 53.341 0 0 0-2.845-.088c-.864 0-1.747.035-2.611.088l-.323-3.839h-.072c-1.099 1.76-2.611 4.226-7.023 4.226-2.07 0-5.76-.95-5.76-4.754 0-5.352 7.021-6.656 12.476-6.656v-1.76c0-1.955-.736-2.87-3.637-2.87-2.322 0-3.637.528-4.736.968v1.726l-1.187.317a20.165 20.165 0 0 0-1.711-3.82c2.071-.67 4.573-1.48 8.157-1.48Zm-33.723.016-.234 3.029.072.035.058-.061.118-.123c1.475-1.528 3.223-2.88 5.819-2.88 2.756 0 3.856 1.456 4.608 3.115l.048.107.026.055c1.386-1.727 3.456-3.276 6.067-3.276 3.781 0 5.312 2.341 5.312 5.616v3.821c0 2.835 0 5.194.323 7.008l1.872.352v1.162a71.04 71.04 0 0 0-2.513-.08l-.176-.003-.768-.005a45.22 45.22 0 0 0-2.896.088c.07-1.392.16-2.941.16-4.947v-3.874c0-4.63-.736-6.269-3.186-6.269-3.205-.016-3.835 3.082-3.835 6.586 0 2.835 0 5.193.323 7.008l1.872.352v1.161c-1.385-.035-2.808-.088-4.193-.088-1.388 0-2.81.07-4.196.088v-1.179l1.872-.352c.301-1.669.324-3.822.325-6.645v-.662c0-4.63-.739-6.269-3.187-6.269-3.187 0-3.835 3.082-3.835 6.586 0 2.835 0 5.193.325 7.008l1.872.352v1.161c-1.386-.035-2.81-.088-4.196-.088-1.387 0-2.808.07-4.195.088V62.47l1.872-.352c.304-1.685.323-3.863.325-6.48v-2.571a37.87 37.87 0 0 0-.325-4.948c-.683-.123-1.422-.281-2.16-.404l-.017-1.215c1.224-.07 3.798-.512 5.13-.845h1.513v-.001Zm-51.168 0-.235 3.029.072.035c1.512-1.6 3.296-3.063 5.995-3.063 3.78 0 5.312 2.341 5.312 5.616v4.359c0 2.595.02 4.771.325 6.47l1.872.352v1.162a70.24 70.24 0 0 0-2.253-.075l-.176-.004-.175-.003a45.32 45.32 0 0 0-3.753.08c.054-1.389.163-2.939.163-4.945v-3.874c0-4.63-.74-6.269-3.187-6.269-3.312 0-4.123 3.082-4.123 6.586v.537c.001 2.597.02 4.772.324 6.47l1.872.353v1.161c-1.385-.035-2.808-.088-4.195-.088-1.385 0-2.808.07-4.195.088v-1.216l1.872-.352c.312-1.72.325-3.958.325-6.652v-2.396c0-1.656-.109-3.312-.325-4.948-.683-.124-1.422-.282-2.16-.405v-1.162c1.224-.07 3.798-.512 5.131-.845h1.512l.002-.001ZM26.339 38.4c-.297 1.646-.321 3.766-.323 6.304v4.013c1.512-1.6 3.294-3.063 5.995-3.063 3.781 0 5.312 2.341 5.312 5.616v3.821c0 2.835 0 5.194.323 7.008l1.872.352v1.162a75.87 75.87 0 0 0-3.456-.088c-1.099 0-2.09.035-2.899.088.072-1.392.162-2.941.162-4.947v-3.874c0-4.63-.738-6.269-3.187-6.269-3.312 0-4.124 3.082-4.124 6.586 0 2.835 0 5.193.325 7.008l1.872.352v1.161c-1.385-.035-2.808-.088-4.195-.088-1.386 0-2.808.07-4.195.088v-1.216l1.872-.352c.304-1.683.323-3.86.325-6.464v-8.315c0-2.597-.021-4.773-.324-6.47-.684-.123-1.424-.283-2.16-.407v-1.161c1.224-.07 3.799-.51 5.13-.845h1.675Zm166.237 7.272c-.162 1.392-.235 2.957-.36 4.613l.053.053c.649-1.584 2.521-4.666 5.87-4.666.72 0 1.44.158 2.088.475a25.95 25.95 0 0 0-1.584 4.42l-1.189-.194v-1.48a1.586 1.586 0 0 0-.737-.192c-1.189 0-3.997 1.161-3.997 7.253 0 2.078.126 4.192.251 6.144.811.124 1.584.23 2.395.352v1.163a150.74 150.74 0 0 0-4.896-.088c-1.712 0-3.187.07-3.926.088v-1.197l1.872-.352c.304-1.685.323-3.862.325-6.464v-2.57c0-1.654-.107-3.308-.325-4.947-.683-.123-1.422-.281-2.16-.405v-1.161c1.224-.07 3.798-.512 5.131-.845h1.189Zm-182.98 2.06c-3.924 0-5.294 3.24-5.294 7.06 0 3.997 1.837 7.096 5.295 7.096 2.971-.018 5.293-2.307 5.293-7.096 0-4.192-2.088-7.06-5.293-7.06Zm124.665 6.708h-.973c-2.358 0-7.184.915-7.184 4.138 0 1.284.973 2.552 3.098 2.552 3.006 0 4.896-2.552 5.059-6.69Zm-44.795-1.109a10.554 10.554 0 0 0-.973 2.27c-1.8-.035-3.475-.087-5.184-.087-1.712 0-3.386.07-5.096.088.413-.722.736-1.479.971-2.272 1.8.036 3.475.09 5.186.09 1.71 0 3.385-.073 5.096-.089ZM69.768 47.54c-3.098 0-4.555 2.042-4.86 4.295l8.047-.388c0-1.672-.198-3.908-3.187-3.908v.001Zm108.37 0c-3.096 0-4.556 2.042-4.861 4.295l8.048-.388c0-1.672-.199-3.908-3.187-3.908v.001ZM39.194 14.474l.17.172.01-.008 18.304 18.565V20.371h6.138v16.064l-8.046-.019-16.56-16.795L25.875 33.13H20.8l18.394-18.656ZM73.12 20.37v16.064h-5.04V20.371h5.04Zm-6.48 0v16.064H65.2V20.371h1.44ZM66.182 0l.167.17.006-.007 33.962 34.427h-5.093L66.192 5.15l-15.87 16.096-2.544-2.582L66.18 0h.001Zm64.986 2.027c.685 0 1.368.056 2.053.165 6.982 1.131 11.734 7.776 10.617 14.86-.864 5.487-5.632 10.058-11.179 10.81v10.452h-3.6V27.802c-.673-.103-1.481-.218-2.133-.39a12.786 12.786 0 0 1-7.584 4.954V41.6h-3.6v-8.98a11.915 11.915 0 0 1-3.204-.657c-6.696-2.32-10.26-9.677-7.991-16.467 2.285-6.79 9.538-10.405 16.234-8.104l-.163-.054.003-.004c.046.016.093.032.141.052l.012.003c2.42-3.248 6.384-5.36 10.394-5.36v-.002Zm6.174 5.514c-4.067-3.45-10.304-2.72-13.705 1.406l.069-.083.009.006a9.607 9.607 0 0 0-1.573 2.666l-.048.128a10.001 10.001 0 0 0-2.91-1.384l-.005.014c-3.6-1.004-7.451.22-9.864 3.12-3.419 4.11-2.88 10.261 1.171 13.71 4.048 3.468 10.116 2.92 13.516-1.186l.004.003c.634-.818 1.248-1.864 1.6-2.815a9.506 9.506 0 0 0 2.914 1.37l-.082-.024c3.552.827 7.752-.408 10.092-3.222 3.401-4.127 2.88-10.26-1.188-13.71Z"/></svg></a>
    <a href="https://www.withmartian.com"><svg class="logo-martian" width="150" viewBox="0 0 1235 540" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="248.835" cy="286.784" r="90.5369" fill="#FF563F"/>
    <path fill-rule="evenodd" clip-rule="evenodd" d="M160.952 301.798C188.336 329.183 232.735 329.183 260.119 301.798C287.504 274.414 287.504 230.015 260.119 202.63C232.735 175.246 188.336 175.246 160.952 202.63C133.567 230.015 133.567 274.414 160.952 301.798ZM274.554 316.233C239.197 351.589 181.874 351.589 146.517 316.233C111.161 280.876 111.161 223.552 146.517 188.196C181.874 152.84 239.197 152.84 274.554 188.196C309.91 223.552 309.91 280.876 274.554 316.233Z"/>
    <path d="M398.726 338.402V239.774H418.931V251.377H422.132C423.999 247.909 427 244.842 431.135 242.174C435.269 239.507 440.871 238.173 447.94 238.173C455.275 238.173 461.143 239.707 465.545 242.774C470.079 245.709 473.48 249.51 475.748 254.178H478.948C481.216 249.643 484.483 245.842 488.751 242.774C493.152 239.707 499.354 238.173 507.357 238.173C513.758 238.173 519.427 239.507 524.361 242.174C529.296 244.708 533.231 248.576 536.165 253.778C539.099 258.846 540.566 265.181 540.566 272.783V338.402H519.96V274.383C519.96 268.382 518.293 263.78 514.959 260.58C511.758 257.245 507.156 255.578 501.155 255.578C494.753 255.578 489.618 257.645 485.75 261.78C481.883 265.914 479.949 271.849 479.949 279.585V338.402H459.343V274.383C459.343 268.382 457.676 263.78 454.341 260.58C451.141 257.245 446.539 255.578 440.538 255.578C434.136 255.578 429.001 257.645 425.133 261.78C421.265 265.914 419.331 271.849 419.331 279.585V338.402H398.726Z"/>
    <path d="M600.868 341.203C593.799 341.203 587.464 340.002 581.862 337.601C576.394 335.201 571.993 331.666 568.658 326.998C565.457 322.33 563.857 316.662 563.857 309.994C563.857 303.192 565.457 297.59 568.658 293.189C571.993 288.654 576.461 285.253 582.062 282.986C587.797 280.719 594.266 279.585 601.468 279.585H631.476V273.183C631.476 267.448 629.742 262.847 626.275 259.379C622.807 255.912 617.472 254.178 610.27 254.178C603.202 254.178 597.8 255.845 594.066 259.179C590.331 262.513 587.864 266.848 586.664 272.183L567.458 265.981C569.059 260.646 571.593 255.845 575.06 251.577C578.661 247.176 583.396 243.641 589.264 240.974C595.133 238.307 602.201 236.973 610.47 236.973C623.274 236.973 633.343 240.24 640.679 246.776C648.014 253.311 651.682 262.58 651.682 274.584V315.195C651.682 319.196 653.549 321.197 657.284 321.197H665.686V338.402H650.282C645.614 338.402 641.813 337.201 638.878 334.801C635.944 332.4 634.477 329.132 634.477 324.998V324.398H631.476C630.409 326.398 628.809 328.732 626.675 331.4C624.541 334.067 621.407 336.401 617.272 338.402C613.138 340.269 607.67 341.203 600.868 341.203ZM603.868 324.198C612.137 324.198 618.806 321.864 623.874 317.196C628.942 312.394 631.476 305.859 631.476 297.59V295.59H602.668C597.2 295.59 592.799 296.79 589.464 299.191C586.13 301.458 584.463 304.859 584.463 309.393C584.463 313.928 586.197 317.529 589.664 320.197C593.132 322.864 597.867 324.198 603.868 324.198Z"/>
    <path d="M685.721 338.402V239.774H705.927V251.377H709.128C710.729 247.242 713.263 244.242 716.73 242.374C720.331 240.374 724.733 239.374 729.934 239.374H741.737V257.979H729.134C722.465 257.979 716.997 259.846 712.729 263.58C708.461 267.181 706.327 272.783 706.327 280.385V338.402H685.721Z"/>
    <path d="M800.098 338.402C794.096 338.402 789.295 336.601 785.694 333C782.226 329.399 780.492 324.598 780.492 318.596V257.179H753.284V239.774H780.492V207.164H801.098V239.774H830.506V257.179H801.098V314.995C801.098 318.996 802.965 320.997 806.7 320.997H827.306V338.402H800.098Z"/>
    <path d="M854.715 338.402V239.774H875.321V338.402H854.715ZM865.118 226.37C861.117 226.37 857.716 225.103 854.915 222.569C852.248 219.901 850.914 216.5 850.914 212.366C850.914 208.231 852.248 204.897 854.915 202.363C857.716 199.696 861.117 198.362 865.118 198.362C869.252 198.362 872.653 199.696 875.321 202.363C877.988 204.897 879.322 208.231 879.322 212.366C879.322 216.5 877.988 219.901 875.321 222.569C872.653 225.103 869.252 226.37 865.118 226.37Z"/>
    <path d="M936.51 341.203C929.441 341.203 923.106 340.002 917.505 337.601C912.036 335.201 907.635 331.666 904.301 326.998C901.1 322.33 899.5 316.662 899.5 309.994C899.5 303.192 901.1 297.59 904.301 293.189C907.635 288.654 912.103 285.253 917.705 282.986C923.44 280.719 929.908 279.585 937.11 279.585H967.119V273.183C967.119 267.448 965.385 262.847 961.917 259.379C958.45 255.912 953.115 254.178 945.913 254.178C938.844 254.178 933.443 255.845 929.708 259.179C925.974 262.513 923.506 266.848 922.306 272.183L903.101 265.981C904.701 260.646 907.235 255.845 910.703 251.577C914.304 247.176 919.038 243.641 924.907 240.974C930.775 238.307 937.844 236.973 946.113 236.973C958.916 236.973 968.986 240.24 976.321 246.776C983.657 253.311 987.325 262.58 987.325 274.584V315.195C987.325 319.196 989.192 321.197 992.926 321.197H1001.33V338.402H985.924C981.256 338.402 977.455 337.201 974.521 334.801C971.587 332.4 970.12 329.132 970.12 324.998V324.398H967.119C966.052 326.398 964.451 328.732 962.317 331.4C960.183 334.067 957.049 336.401 952.915 338.402C948.78 340.269 943.312 341.203 936.51 341.203ZM939.511 324.198C947.78 324.198 954.449 321.864 959.517 317.196C964.585 312.394 967.119 305.859 967.119 297.59V295.59H938.311C932.842 295.59 928.441 296.79 925.107 299.191C921.773 301.458 920.105 304.859 920.105 309.393C920.105 313.928 921.839 317.529 925.307 320.197C928.775 322.864 933.509 324.198 939.511 324.198Z"/>
    <path d="M1021.36 338.402V239.774H1041.57V254.578H1044.77C1046.64 250.577 1049.97 246.842 1054.77 243.375C1059.57 239.907 1066.71 238.173 1076.18 238.173C1083.65 238.173 1090.25 239.84 1095.99 243.175C1101.85 246.509 1106.45 251.244 1109.79 257.379C1113.12 263.38 1114.79 270.649 1114.79 279.185V338.402H1094.18V280.785C1094.18 272.25 1092.05 265.981 1087.78 261.98C1083.52 257.845 1077.65 255.778 1070.18 255.778C1061.64 255.778 1054.77 258.579 1049.57 264.181C1044.5 269.782 1041.97 277.918 1041.97 288.588V338.402H1021.36Z"/>
    </svg>
    </a>
</p>

If you would like your organization to become an official sponsor of Roc's development, please [DM Richard Feldman on Zulip](https://roc.zulipchat.com/#narrow/pm-with/281383-user281383)!

We'd also like to express our gratitude to our generous [individual sponsors](https://github.com/sponsors/roc-lang/)! A special thanks to those sponsoring $25/month or more:

<ul id="individual-sponsors">
    <li><a href="https://github.com/gamebox">Anthony Bullard</a></li>
    <li><a href="https://github.com/pmarreck">Peter Marreck</a></li>
    <li><a href="https://github.com/chiroptical">Barry Moore</a></li>
    <li>Eric Andresen</li>
    <li><a href="https://github.com/jluckyiv">Jackson Lucky</a></li>
    <li><a href="https://github.com/agu-z">Agus Zubiaga</a></li>
    <li><a href="https://github.com/AngeloChecked">Angelo Ceccato</a></li>
    <li><a href="https://github.com/noverby">Niclas Overby</a></li>
    <li><a href="https://github.com/krzysztofgb">Krzysztof G.</a></li>
    <li><a href="https://github.com/smores56">Sam Mohr</a></li>
    <li><a href="https://github.com/megakilo">Steven Chen</a></li>
    <li><a href="https://github.com/asteroidb612">Drew Lazzeri</a></li>
    <li><a href="https://github.com/mrmizz">Alex Binaei</a></li>
    <li><a href="https://github.com/jonomallanyk">Jono Mallanyk</a></li>
    <li><a href="https://github.com/chris-packett">Chris Packett</a></li>
    <li><a href="https://github.com/jamesbirtles">James Birtles</a></li>
    <li><a href="https://github.com/Ivo-Balbaert">Ivo Balbaert</a></li>
    <li><a href="https://github.com/rvcas">Lucas Rosa</a></li>
    <li><a href="https://github.com/Ocupe">Jonas Schell</a></li>
    <li><a href="https://github.com/cdolan">Christopher Dolan</a></li>
    <li><a href="https://github.com/nick-gravgaard">Nick Gravgaard</a></li>
    <li><a href="https://github.com/popara">Zeljko Nesic</a></li>
    <li><a href="https://github.com/shritesh">Shritesh Bhattarai</a></li>
    <li><a href="https://github.com/rtfeldman">Richard Feldman</a></li>
    <li><a href="https://github.com/ayazhafiz">Ayaz Hafiz</a></li>
</ul>

Thank you all for your contributions! Roc would not be what it is without your generosity. 💜

We are currently trying to raise $4,000 USD/month in donations to fund one longtime Roc contributor to continue his work on Roc full-time. We are a small group trying to do big things, and every donation helps! You can donate using:

- [GitHub Sponsors](https://github.com/sponsors/roc-lang)
- [Liberapay](https://liberapay.com/roc_lang)

All donations go through the [Roc Programming Language Foundation](/foundation), a registered <a href="https://en.wikipedia.org/wiki/501(c)(3)_organization">US <span class="nowrap">501(c)(3)</span> nonprofit organization</a>, which means these donations are tax-exempt in the US.
