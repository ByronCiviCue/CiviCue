#!/usr/bin/env node
import { execSync } from "node:child_process";

const run = (cmd, opts = {}) => {
  try { return execSync(cmd, { stdio: "inherit", ...opts }); }
  catch (e) { if (opts.allowFail) return; throw e; }
};

console.log("\n=== Diff Summary ===");
run("git diff --staged --stat", { allowFail: true });

console.log("\n=== Patch (staged) ===");
run("git -c color.ui=always --no-pager diff --staged -- . ':(exclude)*.png' ':(exclude)*.jpg' ':(exclude)*.jpeg' ':(exclude)*.gif' ':(exclude)*.lock'", { allowFail: true });

console.log("\n=== Tests ===");
run("pnpm -s test");

console.log("\n=== Lint ===");
run("pnpm -s lint");

console.log("\n=== Typecheck ===");
run("pnpm -s typecheck");