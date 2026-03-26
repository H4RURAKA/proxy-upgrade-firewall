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

test("storage diff downgrades address-shaped type changes to semantic review findings", () => {
  const current = {
    storageLayout: {
      storage: [
        {
          label: "_allowlist",
          slot: "8",
          offset: "0",
          type: "t_contract(IAllowlist)900"
        }
      ],
      types: {
        "t_contract(IAllowlist)900": {
          encoding: "inplace",
          label: "contract IAllowlist",
          numberOfBytes: "20"
        }
      }
    }
  };
  const proposed = {
    storageLayout: {
      storage: [
        {
          label: "allowlist",
          slot: "8",
          offset: "0",
          type: "t_address"
        }
      ],
      types: {
        t_address: {
          encoding: "inplace",
          label: "address",
          numberOfBytes: "20"
        }
      }
    }
  };

  const findings = analyzeStorageLayout(current, proposed);

  assert.ok(!findings.some((finding) => finding.id === "STORAGE-001"));
  assert.ok(findings.some((finding) => finding.id === "STORAGE-003"));
});

test("storage diff recognizes reserved gap consumption patterns", () => {
  const current = {
    storageLayout: {
      storage: [
        {
          label: "_owner",
          slot: "0",
          offset: "0",
          type: "t_address"
        },
        {
          label: "__gap",
          slot: "1",
          offset: "0",
          type: "t_array(t_uint256)49_storage"
        },
        {
          label: "supplyCap",
          slot: "50",
          offset: "0",
          type: "t_uint256"
        }
      ],
      types: {
        t_address: {
          encoding: "inplace",
          label: "address",
          numberOfBytes: "20"
        },
        "t_array(t_uint256)49_storage": {
          encoding: "inplace",
          label: "uint256[49]",
          numberOfBytes: "1568"
        },
        t_uint256: {
          encoding: "inplace",
          label: "uint256",
          numberOfBytes: "32"
        }
      }
    }
  };
  const proposed = {
    storageLayout: {
      storage: [
        {
          label: "_owner",
          slot: "0",
          offset: "0",
          type: "t_address"
        },
        {
          label: "pendingOwner",
          slot: "1",
          offset: "0",
          type: "t_address"
        },
        {
          label: "__gap",
          slot: "2",
          offset: "0",
          type: "t_array(t_uint256)48_storage"
        },
        {
          label: "supplyCap",
          slot: "50",
          offset: "0",
          type: "t_uint256"
        }
      ],
      types: {
        t_address: {
          encoding: "inplace",
          label: "address",
          numberOfBytes: "20"
        },
        "t_array(t_uint256)48_storage": {
          encoding: "inplace",
          label: "uint256[48]",
          numberOfBytes: "1536"
        },
        t_uint256: {
          encoding: "inplace",
          label: "uint256",
          numberOfBytes: "32"
        }
      }
    }
  };

  const findings = analyzeStorageLayout(current, proposed);

  assert.ok(!findings.some((finding) => finding.id === "STORAGE-001"));
  assert.ok(findings.some((finding) => finding.id === "STORAGE-004"));
});
