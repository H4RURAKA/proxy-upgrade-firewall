import test from "node:test";
import assert from "node:assert/strict";
import { buildUpgradePairs } from "../src/core/historical-upgrades.js";

test("buildUpgradePairs returns adjacent implementation transitions", () => {
  const pairs = buildUpgradePairs([
    {
      blockNumber: 100,
      logIndex: 0,
      transactionHash: "0xaaa",
      implementation: "0x1111111111111111111111111111111111111111"
    },
    {
      blockNumber: 200,
      logIndex: 0,
      transactionHash: "0xbbb",
      implementation: "0x2222222222222222222222222222222222222222"
    },
    {
      blockNumber: 300,
      logIndex: 0,
      transactionHash: "0xccc",
      implementation: "0x3333333333333333333333333333333333333333"
    }
  ]);

  assert.deepEqual(pairs, [
    {
      index: 1,
      currentImplementation: "0x1111111111111111111111111111111111111111",
      proposedImplementation: "0x2222222222222222222222222222222222222222",
      currentBlockNumber: 100,
      proposedBlockNumber: 200,
      currentTransactionHash: "0xaaa",
      proposedTransactionHash: "0xbbb"
    },
    {
      index: 2,
      currentImplementation: "0x2222222222222222222222222222222222222222",
      proposedImplementation: "0x3333333333333333333333333333333333333333",
      currentBlockNumber: 200,
      proposedBlockNumber: 300,
      currentTransactionHash: "0xbbb",
      proposedTransactionHash: "0xccc"
    }
  ]);
});
