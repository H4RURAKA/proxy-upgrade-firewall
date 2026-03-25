import test from "node:test";
import assert from "node:assert/strict";
import { analyzeAuthorityDiff } from "../src/analyzers/authority-diff.js";
import { buildAuthorityContext } from "../src/core/build-authority-context.js";

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

test("delegateBySig style flows are not treated as privileged admin entrypoints", () => {
  const current = makeContract();
  const proposed = makeContract({
    abi: [
      {
        type: "function",
        name: "delegateBySig",
        inputs: [
          { type: "address" },
          { type: "uint256" },
          { type: "uint256" },
          { type: "uint8" },
          { type: "bytes32" },
          { type: "bytes32" }
        ],
        stateMutability: "nonpayable"
      }
    ]
  });

  const findings = analyzeAuthorityDiff(current, proposed);
  assert.equal(findings.some((item) => item.id.startsWith("AUTH-004")), false);
});

test("body-level owner checks are recognized as meaningful guards", () => {
  const contract = makeContract({
    abi: [
      {
        type: "function",
        name: "pause",
        inputs: [],
        stateMutability: "nonpayable"
      }
    ],
    sourceAst: {
      nodes: [
        {
          nodeType: "ContractDefinition",
          name: "SimpleVault",
          nodes: [
            {
              nodeType: "FunctionDefinition",
              kind: "function",
              name: "pause",
              visibility: "public",
              stateMutability: "nonpayable",
              parameters: { parameters: [] },
              modifiers: [],
              body: {
                nodeType: "Block",
                statements: [
                  {
                    nodeType: "ExpressionStatement",
                    expression: {
                      nodeType: "FunctionCall",
                      expression: {
                        nodeType: "Identifier",
                        name: "_checkOwner"
                      },
                      arguments: []
                    }
                  }
                ]
              }
            }
          ]
        }
      ]
    }
  });

  const context = buildAuthorityContext(contract);
  const pause = context.privilegedFunctions.find((item) => item.signature === "pause()");

  assert.equal(pause?.guard, "onlyOwner(body)");
  assert.equal(pause?.guardSource, "body");
});
