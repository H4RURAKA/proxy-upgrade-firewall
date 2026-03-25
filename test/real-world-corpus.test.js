import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { runCheckCommand } from "../src/commands/check.js";

test("safe storage append remains low risk", async () => {
  const report = await runCheckCommand({
    currentBuildInfo: path.resolve(
      "fixtures/real-world/safe-storage-append/build/current.build-info.json"
    ),
    proposedBuildInfo: path.resolve(
      "fixtures/real-world/safe-storage-append/build/proposed.build-info.json"
    ),
    contract: "SafeTreasuryVault",
    format: "json",
    silent: true
  });

  assert.equal(report.summary.verdict, "allow-with-review");
  assert.equal(report.summary.maxSeverity, "info");
  assert.ok(report.findings.some((finding) => finding.id === "STORAGE-002"));
});

test("governance downgrade is escalated to manual review", async () => {
  const report = await runCheckCommand({
    currentBuildInfo: path.resolve(
      "fixtures/real-world/governance-downgrade/build/current.build-info.json"
    ),
    proposedBuildInfo: path.resolve(
      "fixtures/real-world/governance-downgrade/build/proposed.build-info.json"
    ),
    contract: "GovernedVault",
    format: "json",
    silent: true
  });

  assert.equal(report.summary.verdict, "manual-review");
  assert.ok(report.findings.some((finding) => finding.id === "AUTH-003"));
  assert.ok(report.findings.some((finding) => finding.id === "AUTH-007"));
  assert.ok(
    report.findings.some((finding) => finding.id === "AUTH-005-upgradetoandcall-address-bytes")
  );
});

test("unsafe UUPS implementation is blocked", async () => {
  const report = await runCheckCommand({
    currentBuildInfo: path.resolve(
      "fixtures/real-world/uups-unsafe-implementation/build/current.build-info.json"
    ),
    proposedBuildInfo: path.resolve(
      "fixtures/real-world/uups-unsafe-implementation/build/proposed.build-info.json"
    ),
    contract: "UUPSUnsafeVault",
    format: "json",
    silent: true
  });

  assert.equal(report.summary.verdict, "block");
  assert.ok(report.findings.some((finding) => finding.id === "IMPL-002"));
  assert.ok(report.findings.some((finding) => finding.id === "IMPL-003"));
});
