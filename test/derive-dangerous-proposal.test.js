import test from "node:test";
import assert from "node:assert/strict";
import { deriveDangerousProposalBundle } from "../src/core/derive-dangerous-proposal.js";

test("deriveDangerousProposalBundle injects dangerous storage and entrypoints", () => {
  const bundle = {
    metadata: {
      language: "Solidity",
      compiler: {
        version: "0.8.25+commit.b61c2a91"
      },
      settings: {
        compilationTarget: {
          "contracts/GuardedVault.sol": "GuardedVault"
        }
      }
    },
    sources: {
      "contracts/GuardedVault.sol": `pragma solidity ^0.8.25;

contract GuardedVault {
    uint256 public value;

    constructor() {
        _disableInitializers();
    }

    function _disableInitializers() internal {}

    function setValue(uint256 nextValue) external {
        value = nextValue;
    }
}
`
    },
    target: {
      sourceName: "contracts/GuardedVault.sol",
      contractName: "GuardedVault",
      selector: "contracts/GuardedVault.sol:GuardedVault"
    }
  };

  const derived = deriveDangerousProposalBundle(bundle);
  const source = derived.sources["contracts/GuardedVault.sol"];

  assert.match(source, /address public __firewallEmergencyAdmin;/);
  assert.match(source, /function __firewallSetEmergencyAdmin\(address newAdmin\) external/);
  assert.match(source, /function __firewallEmergencySweep\(address target, bytes calldata data\)/);
  assert.match(source, /function __firewallExecuteDelegatecall\(address target, bytes calldata data\)/);
  assert.doesNotMatch(source, /_disableInitializers\(\);/);
  assert.deepEqual(derived.mutations, [
    "inserted_top_level_emergency_admin_storage",
    "added_unguarded_admin_setter",
    "added_unguarded_sweep_entrypoint",
    "added_unguarded_delegatecall_entrypoint",
    "removed_disable_initializers_lock"
  ]);
});
