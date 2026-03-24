import test from "node:test";
import assert from "node:assert/strict";
import { inspectProxy } from "../src/core/onchain-inspector.js";

const proxyAddress = "0x1111111111111111111111111111111111111111";
const implementationAddress = "0x2222222222222222222222222222222222222222";
const adminAddress = "0x3333333333333333333333333333333333333333";
const safeAddress = "0x4444444444444444444444444444444444444444";
const ownerA = "0x5555555555555555555555555555555555555555";
const ownerB = "0x6666666666666666666666666666666666666666";

function encodeAddress(address) {
  return `0x${"0".repeat(24)}${address.slice(2).toLowerCase()}`;
}

function encodeUint(value) {
  return `0x${value.toString(16).padStart(64, "0")}`;
}

function encodeAddressArray(addresses) {
  const offset = "0".repeat(63) + "20";
  const length = addresses.length.toString(16).padStart(64, "0");
  const values = addresses.map((address) => address.slice(2).toLowerCase().padStart(64, "0")).join("");
  return `0x${offset}${length}${values}`;
}

function createMockFetch() {
  return async (_url, init) => {
    const payload = JSON.parse(init.body);
    const { method, params, id } = payload;
    const [addressOrTx, maybeSlot] = params;

    let result = "0x";

    if (method === "eth_chainId") {
      result = "0x1";
    }

    if (method === "eth_getCode") {
      const address = String(addressOrTx).toLowerCase();
      if ([proxyAddress, adminAddress, safeAddress].includes(address)) {
        result = "0x6001600055";
      }
    }

    if (method === "eth_getStorageAt") {
      const address = String(addressOrTx).toLowerCase();
      const slot = String(maybeSlot).toLowerCase();

      if (address === proxyAddress) {
        if (slot === "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc") {
          result = encodeAddress(implementationAddress);
        }

        if (slot === "0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103") {
          result = encodeAddress(adminAddress);
        }
      }
    }

    if (method === "eth_call") {
      const to = String(addressOrTx.to).toLowerCase();
      const data = String(addressOrTx.data).toLowerCase();

      if (to === adminAddress && data === "0x8da5cb5b") {
        result = encodeAddress(safeAddress);
      }

      if (to === safeAddress && data === "0xe75235b8") {
        result = encodeUint(2);
      }

      if (to === safeAddress && data === "0xa0e67e2b") {
        result = encodeAddressArray([ownerA, ownerB]);
      }
    }

    return {
      ok: true,
      async json() {
        return {
          jsonrpc: "2.0",
          id,
          result
        };
      }
    };
  };
}

test("inspectProxy resolves admin-controlled proxies into a control path", async () => {
  const report = await inspectProxy({
    proxyAddress,
    rpcUrl: "https://rpc.example.test",
    fetchImpl: createMockFetch()
  });

  assert.equal(report.chainId, 1);
  assert.equal(report.subject.implementation, implementationAddress);
  assert.equal(report.subject.admin, adminAddress);
  assert.equal(report.subject.kind, "admin-controlled-erc1967");
  assert.ok(report.controlPath.some((entry) => entry.type === "OwnableContract"));
  assert.ok(report.controlPath.some((entry) => entry.type === "SafeLike"));
});

