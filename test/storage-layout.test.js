import test from "node:test";
import assert from "node:assert/strict";
import { analyzeStorageLayout } from "../src/analyzers/storage-layout.js";

test("storage diff ignores label-only rename when slot and type are unchanged", () => {
  const current = {
    storageLayout: [
      {
        label: "_owner",
        slot: "57",
        offset: "0",
        type: "t_address",
        typeLabel: "address"
      }
    ]
  };
  const proposed = {
    storageLayout: [
      {
        label: "owner",
        slot: "57",
        offset: "0",
        type: "t_address",
        typeLabel: "address"
      }
    ]
  };

  const findings = analyzeStorageLayout(current, proposed);
  assert.equal(findings.length, 0);
});

test("storage diff ignores compiler-internal type id churn when slot shape is unchanged", () => {
  const current = {
    storageLayout: [
      {
        label: "_nonces",
        slot: "153",
        offset: "0",
        type: "t_mapping(t_address,t_struct(Counter)1807_storage)",
        typeLabel: "mapping(address => struct Counter)"
      }
    ]
  };
  const proposed = {
    storageLayout: [
      {
        label: "_nonces",
        slot: "153",
        offset: "0",
        type: "t_mapping(t_address,t_struct(Counter)1821_storage)",
        typeLabel: "mapping(address => struct Counter)"
      }
    ]
  };

  const findings = analyzeStorageLayout(current, proposed);
  assert.equal(findings.length, 0);
});
