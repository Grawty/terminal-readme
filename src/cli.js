#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const { generate } = require("./generate");

const [configArg = "terminal-readme.config.json", outputArg = "terminal.svg"] = process.argv.slice(2);
const configPath = path.resolve(configArg);

if (!fs.existsSync(configPath)) {
  console.error(`Config not found: ${configPath}\nUsage: node src/cli.js [config.json] [output.svg]`);
  process.exit(1);
}

try {
  const svg = generate(JSON.parse(fs.readFileSync(configPath, "utf8")));
  const output = path.resolve(outputArg);
  fs.writeFileSync(output, svg);
  console.log(`Wrote ${output} (${svg.length} bytes)`);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
