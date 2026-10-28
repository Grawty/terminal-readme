const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { generate } = require("../src/generate");

const root = path.join(__dirname, "..");
const load = (file) => JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));

// every opened tag is closed in order, a cheap well-formedness check without an XML dependency
function assertBalanced(svg) {
  const stack = [];
  for (const match of svg.matchAll(/<(\/?)([a-zA-Z]+)[^>]*?(\/?)>/g)) {
    const [, closing, name, selfClosing] = match;
    if (closing) assert.equal(stack.pop(), name, `unexpected </${name}>`);
    else if (!selfClosing) stack.push(name);
  }
  assert.deepEqual(stack, []);
}

const minimal = { steps: [{ command: "whoami", output: ["hello"] }] };

test("example configs produce balanced SVG", () => {
  for (const file of ["terminal-readme.config.json", "examples/grawty.json", "examples/light.json"]) {
    assertBalanced(generate(load(file)));
  }
});

test("size follows the config", () => {
  const svg = generate({ ...minimal, width: 600 });
  assert.match(svg, /width="600"/);
});

test("height grows with the number of lines", () => {
  const short = generate(minimal);
  const long = generate({ steps: [{ command: "ls", output: ["a", "b", "c", "d"] }] });
  const height = (svg) => Number(svg.match(/height="(\d+)"/)[1]);
  assert.ok(height(long) > height(short));
});

test("text is escaped", () => {
  const svg = generate({ steps: [{ command: "echo <b>&", output: ['say "hi" & <bye>'] }] });
  assert.ok(!svg.includes("<b>"));
  assert.match(svg, /&lt;b&gt;&amp;/);
  assertBalanced(svg);
});

test("light theme changes the colours", () => {
  assert.match(generate({ ...minimal, theme: "light" }), /#ffffff/);
  assert.match(generate(minimal), /#0d1117/);
});

test("reduced motion shows the finished terminal", () => {
  assert.match(generate(minimal), /prefers-reduced-motion/);
});

test("caret can be switched off", () => {
  assert.ok(generate(minimal).includes('class="caret"'));
  assert.ok(!generate({ ...minimal, caret: false }).includes('class="caret"'));
});

test("a line wider than the window is rejected", () => {
  const long = "x".repeat(200);
  assert.throws(() => generate({ steps: [{ command: "ls", output: [long] }] }), /too wide/);
});

test("bad configs fail with a clear message", () => {
  assert.throws(() => generate({}), /steps/);
  assert.throws(() => generate({ steps: [{}] }), /command/);
  assert.throws(() => generate({ ...minimal, theme: "neon" }), /Unknown theme/);
  assert.throws(() => generate({ steps: [{ command: "ls", output: [42] }] }), /Unsupported output line/);
});
