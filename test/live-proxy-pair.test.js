import test from "node:test";
import assert from "node:assert/strict";
import { loadComparisonPair } from "../src/core/load-comparison-pair.js";

function makeContract({ name, path, mode = "build-info" }) {
  return {
    inputSummary: {
      mode,
      contract: `${name}.sol:${name}`,
      path,
      buildSystem: "unknown"
    },
    proxy: {
      name,
      kind: "compiler-artifact"
    },
    implementation: {
      name,
      sourceName: `${name}.sol`,
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
    securitySignals: {}
  };
}

test("loadComparisonPair supports live proxy current vs local proposed artifact", async () => {
  let cleanedUp = false;
  const current = makeContract({
    name: "CurrentVault",
    path: "/tmp/current.build-info.json",
    mode: "build-info"
  });
  const proposed = makeContract({
    name: "ProposedVault",
    path: "/tmp/proposed.build-info.json",
    mode: "build-info"
  });

  const pair = await loadComparisonPair(
    {
      proxy: "0x8d0d000ee44948fc98c9b98a4fa4921476f08b0d",
      rpcUrl: "https://rpc.example",
      proposedBuildInfo: "/tmp/proposed.build-info.json",
      contract: "ProposedVault"
    },
    {
      inspectProxy: async () => ({
        chainId: 1,
        subject: {
          proxyAddress: "0x8d0d000ee44948fc98c9b98a4fa4921476f08b0d",
          kind: "admin-controlled-erc1967",
          implementation: "0x3398385c205c060ef54744ee817c1487e28a6616",
          admin: "0xa032fe6c496732bdfc0d235066f55f171fa4aece",
          beacon: null
        },
        controlPath: [
          { label: "Proxy(admin-controlled-erc1967)" },
          { label: "AdminSlot(0xa032...aece)" },
          { label: "SafeLike(threshold=3)" }
        ],
        notes: ["The proxy has a non-zero EIP-1967 admin slot."]
      }),
      resolveVerifiedBuildInfo: async () => ({
        buildInfoPath: "/tmp/current.build-info.json",
        contractSelector: "CurrentVault.sol:CurrentVault",
        matchType: "full_match",
        cleanup: async () => {
          cleanedUp = true;
        }
      }),
      loadCompilerContract: async (spec) => {
        if (spec.path === "/tmp/current.build-info.json") {
          return structuredClone(current);
        }

        if (spec.path === "/tmp/proposed.build-info.json") {
          return structuredClone(proposed);
        }

        throw new Error(`Unexpected spec path ${spec.path}`);
      }
    }
  );

  assert.equal(pair.inputMode, "live-proxy-vs-local-artifact");
  assert.equal(pair.current.proxy.address, "0x8d0d000ee44948fc98c9b98a4fa4921476f08b0d");
  assert.equal(pair.proposed.proxy.address, "0x8d0d000ee44948fc98c9b98a4fa4921476f08b0d");
  assert.deepEqual(pair.current.governance.controllerPath, [
    "Proxy(admin-controlled-erc1967)",
    "AdminSlot(0xa032...aece)",
    "SafeLike(threshold=3)"
  ]);
  assert.deepEqual(pair.proposed.governance.controllerPath, [
    "Proxy(admin-controlled-erc1967)",
    "AdminSlot(0xa032...aece)",
    "SafeLike(threshold=3)"
  ]);
  assert.equal(pair.current.inputSummary.mode, "live-proxy:full_match");
  assert.equal(pair.proposed.inputSummary.mode, "build-info");
  assert.match(pair.proposed.inputSummary.path, /live proxy/);
  assert.equal(pair.current.implementation.address, "0x3398385c205c060ef54744ee817c1487e28a6616");
  assert.equal(pair.proposed.implementation.address, undefined);
  assert.equal(cleanedUp, true);
});
