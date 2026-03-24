import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { runCheckCommand } from "../src/commands/check.js";
import { loadCompilerContract } from "../src/core/load-compiler-contract.js";

test("build-info mode yields compiler-backed findings", async () => {
  const report = await runCheckCommand({
    currentBuildInfo: path.resolve("fixtures/compiler-inputs/build-info/current.build-info.json"),
    proposedBuildInfo: path.resolve("fixtures/compiler-inputs/build-info/proposed.build-info.json"),
    contract: "contracts/TreasuryVault.sol:TreasuryVault",
    format: "json",
    silent: true
  });

  assert.equal(report.inputMode, "compiler-artifacts");
  assert.ok(report.findings.some((finding) => finding.id === "STORAGE-001"));
  assert.ok(report.findings.some((finding) => finding.id === "ABI-001"));
  assert.ok(report.findings.some((finding) => finding.id === "COMPILER-001"));
});

test("hardhat artifacts resolve storage layout through sibling dbg files", async () => {
  const current = await loadCompilerContract({
    mode: "artifact",
    path: path.resolve(
      "fixtures/compiler-inputs/hardhat/current/artifacts/contracts/TreasuryVault.sol/TreasuryVault.json"
    ),
    contract: "contracts/TreasuryVault.sol:TreasuryVault"
  });

  assert.equal(current.inputSummary.buildSystem, "hardhat");
  assert.equal(current.storageLayout.length, 4);
  assert.equal(current.implementation.compiler.version, "0.8.24");
});

test("foundry artifacts use embedded storage layout and metadata directly", async () => {
  const proposed = await loadCompilerContract({
    mode: "artifact",
    path: path.resolve(
      "fixtures/compiler-inputs/foundry/proposed/out/TreasuryVault.sol/TreasuryVault.json"
    ),
    contract: "contracts/TreasuryVault.sol:TreasuryVault"
  });

  assert.equal(proposed.inputSummary.buildSystem, "foundry");
  assert.equal(proposed.storageLayout[1].label, "emergencyAdmin");
  assert.equal(proposed.securitySignals.delegatecall, true);
});

