import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { runCheckCommand } from "../src/commands/check.js";

test("sample fixture yields a blocked upgrade verdict", async () => {
  const report = await runCheckCommand({
    fixture: path.resolve("fixtures/corpus/uups-admin-drift"),
    format: "json",
    silent: true
  });

  assert.equal(report.summary.verdict, "block");
  assert.equal(report.summary.maxSeverity, "critical");
  assert.ok(report.findings.some((finding) => finding.id === "STORAGE-001"));
  assert.ok(report.findings.some((finding) => finding.id === "AUTH-004"));
});

