import test from "node:test";
import assert from "node:assert/strict";
import { analyzeAuthorityDiff } from "../src/analyzers/authority-diff.js";

function makeContract(overrides = {}) {
  return {
    sourceMode: "compiler-artifact",
    inputSummary: {
      mode: "build-info",
      contract: "SimpleVault",
      path: "/tmp/SimpleVault.build-info.json",
      buildSystem: "unknown"
    },
    proxy: {
      name: "SimpleVault",
      kind: "compiler-artifact"
    },
    implementation: {
      name: "SimpleVault",
      sourceName: "SimpleVault.sol",
      solc: "0.8.25",
      buildSystem: "unknown",
      artifactFormat: "manual-solc-build-info-1",
      compiler: {
        version: "0.8.25"
      },
      metadata: {},
      bytecode: {
        creationSize: 0,
        deployedSize: 0
      }
    },
    storageLayout: [],
    abi: [],
    sourceAst: null,
    privilegedFunctions: [],
    securitySignals: {},
    ...overrides
  };
}

test("arbitrary execution entrypoints are treated as privileged authority risk", () => {
  const current = makeContract();
  const proposed = makeContract({
    abi: [
      {
        type: "function",
        name: "forward",
        inputs: [
          { type: "address" },
          { type: "bytes" }
        ],
        stateMutability: "nonpayable"
      }
    ]
  });

  const findings = analyzeAuthorityDiff(current, proposed);
  const finding = findings.find((item) => item.id === "AUTH-004-forward-address-bytes");

  assert.ok(finding);
  assert.equal(finding.severity, "critical");
  assert.ok(finding.evidence.includes("Kind: execution"));
});
