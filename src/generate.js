const PALETTES = {
  dark: {
    bg: "#0d1117", bar: "#161b22", border: "#30363d", text: "#e6edf3",
    gray: "#8b949e", green: "#7ee787", blue: "#79c0ff", orange: "#ffa657", red: "#ff7b72", violet: "#d2a8ff",
  },
  light: {
    bg: "#ffffff", bar: "#f6f8fa", border: "#d0d7de", text: "#1f2328",
    gray: "#59636e", green: "#1a7f37", blue: "#0969da", orange: "#bc4c00", red: "#cf222e", violet: "#8250df",
  },
};

// advance width of the 15px monospace stack, used to size the typing mask and to catch lines that overflow
const CHAR_W = 9.1;
const LEFT = 24;
const VALUE_X = 96;
const LINE_H = 22;
const TOP = 80;

const escapeXml = (text) => String(text)
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;");

const segmentText = (segments) => segments.map((segment) => segment.text).join("");

/**
 * Turns one output line from the config into positioned parts.
 * "text"                          grey text at the left edge
 * { label, color, text }          coloured label, grey value aligned in a second column
 * [{ text, color }, ...]          free mix of coloured pieces on one line
 */
function lineParts(line) {
  if (typeof line === "string") return [{ x: LEFT, segments: [{ text: line, color: "gray" }] }];
  if (Array.isArray(line)) return [{ x: LEFT, segments: line.map((s) => ({ color: "gray", ...s })) }];
  if (line && typeof line === "object" && "label" in line) {
    return [
      { x: LEFT, segments: [{ text: line.label, color: line.color || "gray" }] },
      { x: VALUE_X, segments: [{ text: line.text ?? "", color: "gray" }] },
    ];
  }
  throw new Error(`Unsupported output line: ${JSON.stringify(line)}`);
}

function validate(config) {
  if (!config || !Array.isArray(config.steps) || !config.steps.length) {
    throw new Error('Config needs a non-empty "steps" array');
  }
  config.steps.forEach((step, index) => {
    if (!step || typeof step.command !== "string" || !step.command) {
      throw new Error(`steps[${index}] needs a "command" string`);
    }
  });
}

/** Builds the terminal SVG for a config object and returns it as a string. */
function generate(config) {
  validate(config);

  const width = config.width || 760;
  const theme = config.theme || "dark";
  const palette = PALETTES[theme];
  if (!palette) throw new Error(`Unknown theme "${theme}", use one of: ${Object.keys(PALETTES).join(", ")}`);

  const prompt = config.prompt || "$";
  const commandX = Math.round(LEFT + (prompt.length + 1) * CHAR_W);
  const colorClass = (name) => (name in palette && !["bg", "bar", "border"].includes(name) ? `c-${name}` : "c-gray");

  const defs = [];
  const body = [];
  let y = TOP;
  let time = 0.5;
  let lastBaseline = y;

  config.steps.forEach((step, index) => {
    const length = step.command.length;
    const typing = Math.min(1.2, 0.05 * length + 0.2);

    defs.push(
      `<clipPath id="c${index}"><rect class="type" x="${commandX}" y="${y - 18}" height="26" `
      + `style="--w:${Math.ceil(length * CHAR_W + 4)}px;animation:type ${typing.toFixed(2)}s steps(${length}, end) ${time.toFixed(2)}s forwards"/></clipPath>`,
    );
    body.push(`<text x="${LEFT}" y="${y}" class="c-green show" style="animation-delay:${time.toFixed(2)}s">${escapeXml(prompt)}</text>`);
    body.push(`<text x="${commandX}" y="${y}" class="c-text" clip-path="url(#c${index})">${escapeXml(step.command)}</text>`);
    lastBaseline = y;
    time += typing + 0.5;

    (step.output || []).forEach((line, lineIndex) => {
      y += lineIndex === 0 ? LINE_H + 2 : LINE_H;
      for (const part of lineParts(line)) {
        const chars = segmentText(part.segments).length;
        if (part.x + chars * CHAR_W > width - LEFT) {
          throw new Error(`Line is too wide for ${width}px, shorten it or raise "width": "${segmentText(part.segments)}"`);
        }
        const spans = part.segments
          .map((segment) => `<tspan class="${colorClass(segment.color)}">${escapeXml(segment.text)}</tspan>`)
          .join("");
        body.push(`<text x="${part.x}" y="${y}" class="show" xml:space="preserve" style="white-space:pre;animation-delay:${time.toFixed(2)}s">${spans}</text>`);
      }
      lastBaseline = y;
      time += 0.35;
    });

    y = lastBaseline + 34;
    time += 0.3;
  });

  const showCaret = config.caret !== false;
  let height;
  if (showCaret) {
    const caretY = lastBaseline + 28;
    body.push(`<text x="${LEFT}" y="${caretY}" class="c-green show" style="animation-delay:${time.toFixed(2)}s">${escapeXml(prompt)}</text>`);
    body.push(`<rect class="caret" x="${commandX}" y="${caretY - 13}" width="9" height="16" fill="${palette.text}" style="animation-delay:${time.toFixed(2)}s,${(time + 0.1).toFixed(2)}s"/>`);
    height = caretY + 14;
  } else {
    height = lastBaseline + 22;
  }

  const colorRules = ["text", "gray", "green", "blue", "orange", "red", "violet"]
    .map((name) => `.c-${name} { fill: ${palette[name]}; }`)
    .join("\n    ");
  const title = escapeXml(config.title || "user@host: ~");
  const label = escapeXml(config.label || `Terminal window: ${config.title || "profile"}`);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${label}">
  <title>${title}</title>
  <style>
    text { font-family: ui-monospace, SFMono-Regular, Consolas, "DejaVu Sans Mono", monospace; font-size: 15px; }
    ${colorRules}
    .show { opacity: 0; animation: show 0.01s forwards; }
    .type { width: 0; }
    .caret { opacity: 0; animation: show 0.01s forwards, blink 1s steps(1) infinite; }
    @keyframes show { to { opacity: 1; } }
    @keyframes type { to { width: var(--w); } }
    @keyframes blink { 50% { fill-opacity: 0; } }
    @media (prefers-reduced-motion: reduce) {
      .show, .caret { animation: none !important; opacity: 1; }
      .type { animation: none !important; width: var(--w); }
    }
  </style>
  <defs>
    ${defs.join("\n    ")}
  </defs>

  <rect x="0.5" y="0.5" width="${width - 1}" height="${height - 1}" rx="10" fill="${palette.bg}" stroke="${palette.border}"/>
  <path d="M0.5 38 V10.5 a10 10 0 0 1 10 -10 H${width - 10.5} a10 10 0 0 1 10 10 V38 Z" fill="${palette.bar}"/>
  <line x1="0" y1="38.5" x2="${width}" y2="38.5" stroke="${palette.border}"/>
  <circle cx="24" cy="20" r="6" fill="#ff5f56"/>
  <circle cx="44" cy="20" r="6" fill="#ffbd2e"/>
  <circle cx="64" cy="20" r="6" fill="#27c93f"/>
  <text x="${width / 2}" y="25" text-anchor="middle" class="c-gray" style="font-size:13px">${title}</text>

  ${body.join("\n  ")}
</svg>
`;
}

module.exports = { generate, PALETTES };
