import { createRpcClient } from "./rpc-client.js";
import {
  addressFromWord,
  decodeAddressArray,
  hexToBigInt,
  isZeroAddress,
  isZeroCode,
  normalizeAddress,
  shortAddress
} from "../utils/address.js";

const EIP1967_IMPLEMENTATION_SLOT = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
const EIP1967_ADMIN_SLOT = "0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103";
const EIP1967_BEACON_SLOT = "0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50";

const SELECTORS = {
  owner: "0x8da5cb5b",
  getThreshold: "0xe75235b8",
  getOwners: "0xa0e67e2b"
};

async function safeCall(rpc, address, data) {
  try {
    return await rpc.call(address, data);
  } catch {
    return null;
  }
}

async function readAddress(rpc, address, selector) {
  const result = await safeCall(rpc, address, selector);
  if (!result || result === "0x") {
    return null;
  }

  const value = addressFromWord(result);
  return isZeroAddress(value) ? null : value;
}

async function readUint(rpc, address, selector) {
  const result = await safeCall(rpc, address, selector);
  if (!result || result === "0x") {
    return null;
  }

  return hexToBigInt(result);
}

async function readAddressArray(rpc, address, selector) {
  const result = await safeCall(rpc, address, selector);
  if (!result || result === "0x") {
    return null;
  }

  try {
    return decodeAddressArray(result);
  } catch {
    return null;
  }
}

function inferProxyKind({ implementation, admin, beacon, ownerOnProxy }) {
  if (beacon) {
    return "beacon";
  }

  if (implementation && admin) {
    return "admin-controlled-erc1967";
  }

  if (implementation) {
    return "uups-or-ownable-erc1967";
  }

  if (ownerOnProxy) {
    return "non-eip1967-or-implementation-controlled";
  }

  return "unknown";
}

async function inspectControlAddress(rpc, address, seen = new Set(), depth = 0) {
  const normalized = normalizeAddress(address);
  if (seen.has(normalized)) {
    return [
      {
        address: normalized,
        type: "Cycle",
        label: `Cycle(${shortAddress(normalized)})`
      }
    ];
  }

  if (depth > 4) {
    return [
      {
        address: normalized,
        type: "DepthLimit",
        label: `DepthLimit(${shortAddress(normalized)})`
      }
    ];
  }

  seen.add(normalized);
  const code = await rpc.getCode(normalized);

  if (isZeroCode(code)) {
    return [
      {
        address: normalized,
        type: "EOA",
        label: `EOA(${shortAddress(normalized)})`
      }
    ];
  }

  const threshold = await readUint(rpc, normalized, SELECTORS.getThreshold);
  if (threshold && threshold > 0n) {
    const owners = await readAddressArray(rpc, normalized, SELECTORS.getOwners);
    return [
      {
        address: normalized,
        type: "SafeLike",
        label: `SafeLike(threshold=${threshold.toString()})`,
        threshold: Number(threshold),
        owners
      }
    ];
  }

  const owner = await readAddress(rpc, normalized, SELECTORS.owner);
  if (owner) {
    return [
      {
        address: normalized,
        type: "OwnableContract",
        label: `OwnableContract(${shortAddress(normalized)})`,
        owner
      },
      ...(await inspectControlAddress(rpc, owner, seen, depth + 1))
    ];
  }

  return [
    {
      address: normalized,
      type: "Contract",
      label: `Contract(${shortAddress(normalized)})`
    }
  ];
}

function buildNotes({ admin, ownerOnProxy, kind, controlPath }) {
  const notes = [];

  if (admin) {
    notes.push("The proxy has a non-zero EIP-1967 admin slot, so upgrades are likely routed through an admin-controlled flow.");
  } else if (ownerOnProxy) {
    notes.push("The proxy admin slot is empty, but the proxy answered owner(). This usually means the upgrade path is implementation-defined, UUPS-style, or a non-EIP-1967 proxy pattern.");
  } else {
    notes.push("The proxy admin slot is empty and owner() was not detected on the proxy. The upgrade path likely requires source-aware semantic analysis.");
  }

  if (kind === "beacon") {
    notes.push("Beacon proxies need a second inspection step on the beacon contract to understand the active implementation.");
  }

  if (controlPath.some((entry) => entry.type === "SafeLike")) {
    notes.push("A Safe-like contract was found in the control path. Threshold was inferred from on-chain state.");
  }

  if (controlPath.some((entry) => entry.type === "OwnableContract")) {
    notes.push("An ownable control contract was found. The current version resolves owner() recursively but does not yet decode role-based governance.");
  }

  return notes;
}

export async function inspectProxy({ proxyAddress, rpcUrl, fetchImpl = globalThis.fetch }) {
  const normalizedProxy = normalizeAddress(proxyAddress);
  const rpc = createRpcClient(rpcUrl, fetchImpl);

  const [chainIdHex, implementationWord, adminWord, beaconWord, proxyCode] = await Promise.all([
    rpc.getChainId(),
    rpc.getStorageAt(normalizedProxy, EIP1967_IMPLEMENTATION_SLOT),
    rpc.getStorageAt(normalizedProxy, EIP1967_ADMIN_SLOT),
    rpc.getStorageAt(normalizedProxy, EIP1967_BEACON_SLOT),
    rpc.getCode(normalizedProxy)
  ]);

  if (isZeroCode(proxyCode)) {
    throw new Error(`No contract code found at proxy address ${normalizedProxy}`);
  }

  const implementation = addressFromWord(implementationWord);
  const admin = addressFromWord(adminWord);
  const beacon = addressFromWord(beaconWord);
  const ownerOnProxy = !admin ? await readAddress(rpc, normalizedProxy, SELECTORS.owner) : null;
  const kind = inferProxyKind({ implementation, admin, beacon, ownerOnProxy });

  const controlPath = [
    {
      address: normalizedProxy,
      type: "Proxy",
      label: `Proxy(${kind})`
    }
  ];

  if (admin) {
    controlPath.push({
      address: admin,
      type: "AdminSlot",
      label: `AdminSlot(${shortAddress(admin)})`
    });
    controlPath.push(...(await inspectControlAddress(rpc, admin)));
  } else if (ownerOnProxy) {
    controlPath.push({
      address: normalizedProxy,
      type: "ProxyOwner",
      label: "ProxyOwner(owner())",
      owner: ownerOnProxy
    });
    controlPath.push(...(await inspectControlAddress(rpc, ownerOnProxy)));
  }

  return {
    generatedAt: new Date().toISOString(),
    mode: "inspect",
    chainId: Number(hexToBigInt(chainIdHex)),
    subject: {
      proxyAddress: normalizedProxy,
      kind,
      implementation,
      admin,
      beacon
    },
    controlPath,
    notes: buildNotes({
      admin,
      ownerOnProxy,
      kind,
      controlPath
    })
  };
}
