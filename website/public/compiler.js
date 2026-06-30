// main.js — Roc interactive examples (lazy-loads compiler on first Run click)
"use strict";

const utf8Decode = (bytes) => new TextDecoder().decode(bytes);
const utf8Encode = (str) => new TextEncoder().encode(str);

// All null until the user clicks "Run" for the first time.

let wasmModule = null; // WebAssembly.Module
let wasmInstance = null; // WebAssembly.Instance
let wasmMemory = null; // WebAssembly.Memory
let loadInProgress = null; // Promise | null — guards against concurrent loads

// Every run creates a fresh { programOutput, compilerMessages } object
// and stashes it here so the import callbacks can write into it.
let runCapture = null;

// Build a fresh imports object (needed for initial load & re-instantiation).
function buildImports() {
  return {
    env: {
      js_echo(ptr, len) {
        if (runCapture) {
          const slice = new Uint8Array(wasmMemory.buffer, ptr, len);
          runCapture.programOutput += utf8Decode(slice);
        }
      },
      js_stderr(ptr, len) {
        if (runCapture) {
          const slice = new Uint8Array(wasmMemory.buffer, ptr, len);
          runCapture.compilerMessages += utf8Decode(slice);
        }
      },
    },
  };
}

async function loadCompiler() {
  if (wasmInstance) return; // already loaded
  if (loadInProgress) return loadInProgress; // another click is loading it

  loadInProgress = (async () => {
    const response = await fetch("echo.wasm", { priority: "low" });
    const { module, instance } = await WebAssembly.instantiateStreaming(
      response,
      buildImports(),
    );
    wasmModule = module;
    wasmInstance = instance;
    wasmMemory = instance.exports.memory;
    wasmInstance.exports.init();
  })();

  await loadInProgress;
  loadInProgress = null;
}

async function recoverCompiler() {
  try {
    const instance = await WebAssembly.instantiate(wasmModule, buildImports());
    wasmInstance = instance;
    wasmMemory = instance.exports.memory;
    wasmInstance.exports.init();
  } catch (_) {
    // best-effort — if recovery fails the next run will show the error
  }
}

function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function setupExample(div) {
  // The Run button is added statically in the markup (so it shows even before
  // this script loads). Pull it out before reading the source so its label
  // doesn't end up in the Roc code, then reuse it below.
  const runButton = div.querySelector("button.roc-run");
  runButton.remove();

  const source = div.textContent.trim();
  div.textContent = "";

  const textarea = document.createElement("textarea");
  textarea.value = source;
  textarea.rows = Math.min(source.split("\n").length + 2, 18);
  textarea.spellcheck = false;
  textarea.className = "roc-source";

  // Keep Tab from leaving the textarea
  textarea.addEventListener("keydown", (e) => {
    if (e.key === "Tab") {
      e.preventDefault();
      const ta = e.target;
      const s = ta.selectionStart;
      ta.value = ta.value.slice(0, s) + "\t" + ta.value.slice(ta.selectionEnd);
      ta.selectionStart = ta.selectionEnd = s + 1;
    }
  });

  runButton.textContent = "Run \u25b6";

  const outputArea = document.createElement("div");
  outputArea.className = "roc-output";

  runButton.addEventListener("click", async () => {
    // ---- 1. lazy-load compiler on first click ----
    if (!wasmInstance) {
      outputArea.textContent = "Loading compiler\u2026";
      try {
        await loadCompiler();
      } catch (err) {
        outputArea.textContent = "Could not load the Roc compiler: " + err;
        return;
      }
    }

    // ---- 2. prepare ----
    outputArea.textContent = "Running\u2026";
    outputArea.classList.add("running");
    runButton.disabled = true;

    const captured = { programOutput: "", compilerMessages: "" };
    runCapture = captured;
    let trapped = false;

    try {
      wasmInstance.exports.init();

      const encoded = utf8Encode(textarea.value);
      const ptr = wasmInstance.exports.allocateBuffer(encoded.length);
      if (!ptr) throw new Error("allocateBuffer returned null");
      new Uint8Array(wasmMemory.buffer, ptr, encoded.length).set(encoded);

      wasmInstance.exports.compileAndRun(ptr, encoded.length);
    } catch (err) {
      captured.compilerMessages +=
        '<div class="report error"><h1>Compiler crashed</h1><pre>' +
        escapeHtml(String(err)) +
        "</pre></div>";
      trapped = true;
    }

    runCapture = null;

    // ---- 3. display results ----
    let html = "";
    if (captured.compilerMessages) html += captured.compilerMessages;
    if (captured.programOutput) {
      html +=
        '<span class="roc-output-label">Output:\n</span><pre>' +
        escapeHtml(captured.programOutput) +
        "</pre>";
    }
    outputArea.innerHTML = html || "(no output)";
    outputArea.classList.remove("running");

    // ---- 4. recover from trap so later runs work ----
    if (trapped) await recoverCompiler();

    runButton.disabled = false;
  });

  div.appendChild(textarea);
  div.appendChild(runButton);
  div.appendChild(outputArea);
}

// run the setup, when the DOM is finished loading
document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll(".roc-interactive").forEach(setupExample);

  // Pre-download the compiler in the background at low priority so the first
  // Run click is instant. Errors are ignored here — the click handler retries.
  const preload = () => loadCompiler().catch(() => {});
  if ("requestIdleCallback" in window) {
    requestIdleCallback(preload);
  } else {
    preload();
  }
});
