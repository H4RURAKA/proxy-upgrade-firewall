import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { inspectProxy } from "./onchain-inspector.js";
import { loadCompilerContract } from "./load-compiler-contract.js";
import { buildBuildInfo, compileStandardJson } from "./compile-solidity.js";
import { shortAddress } from "../utils/address.js";

const SOURCIFY_BASE_URL = "https://repo.sourcify.dev/contracts";

function sourcifyMatchCandidates() {
  return ["full_match", "partial_match"];
}

async function fetchJson(url, fetchImpl) {
  const response = await fetchImpl(url, {
    headers: {
      accept: "application/json",
      "user-agent": "proxy-upgrade-firewall/0.1"
    }
  });

  if (!response.ok) {
    throw new Error(`Request failed (${response.status}) for ${url}`);
  }

  return response.json();
}

async function fetchText(url, fetchImpl) {
  const response = await fetchImpl(url, {
    headers: {
      accept: "text/plain",
      "user-agent": "proxy-upgrade-firewall/0.1"
    }
  });

  if (!response.ok) {
    throw new Error(`Request failed (${response.status}) for ${url}`);
  }

  return response.text();
}

function buildSourcifyInput(metadata, sources) {
  const { compilationTarget, ...restSettings } = metadata.settings ?? {};

  return {
    language: metadata.language ?? "Solidity",
    sources: Object.fromEntries(
      Object.entries(sources).map(([sourceName, content]) => [sourceName, { content }])
    ),
    settings: {
      ...restSettings,
      outputSelection: {
        "*": {
          "": ["ast"],
          "*": [
            "abi",
            "metadata",
            "storageLayout",
            "evm.bytecode.object",
            "evm.bytecode.opcodes",
            "evm.deployedBytecode.object",
            "evm.deployedBytecode.opcodes"
          ]
        }
      }
    }
  };
}

function resolveCompilationTarget(metadata) {
  const target = Object.entries(metadata.settings?.compilationTarget ?? {})[0];
  if (!target) {
    throw new Error("Verified metadata does not include a compilationTarget.");
  }

  return {
    sourceName: target[0],
    contractName: target[1],
    selector: `${target[0]}:${target[1]}`
  };
}

export async function fetchVerifiedSourceBundle({
  chainId,
  implementationAddress,
  fetchImpl = globalThis.fetch
}) {
  const normalizedAddress = implementationAddress.toLowerCase();
  let lastError = null;

  for (const matchType of sourcifyMatchCandidates()) {
    const metadataUrl = `${SOURCIFY_BASE_URL}/${matchType}/${chainId}/${normalizedAddress}/metadata.json`;
    try {
      const metadata = await fetchJson(metadataUrl, fetchImpl);
      const sourceNames = Object.keys(metadata.sources ?? {});
      const entries = await Promise.all(
        sourceNames.map(async (sourceName) => {
          const encoded = sourceName
            .split("/")
            .map((segment) => encodeURIComponent(segment))
            .join("/");
          const sourceUrl =
            `${SOURCIFY_BASE_URL}/${matchType}/${chainId}/${normalizedAddress}/sources/${encoded}`;
          return [sourceName, await fetchText(sourceUrl, fetchImpl)];
        })
      );

      return {
        matchType,
        metadata,
        sources: Object.fromEntries(entries),
        target: resolveCompilationTarget(metadata)
      };
    } catch (error) {
      lastError = error;
    }
  }

  throw new Error(
    `Could not find a verified Sourcify bundle for implementation ${implementationAddress} on chain ${chainId}. ${lastError?.message ?? ""}`.trim()
  );
}

export async function materializeVerifiedBuildInfo({
  chainId,
  implementationAddress,
  fetchImpl = globalThis.fetch
}) {
  const bundle = await fetchVerifiedSourceBundle({
    chainId,
    implementationAddress,
    fetchImpl
  });
  const input = buildSourcifyInput(bundle.metadata, bundle.sources);
  const output = compileStandardJson({
    input,
    solcVersion: bundle.metadata.compiler?.version
  });

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "proxy-upgrade-firewall-live-"));
  const buildInfoPath = path.join(tempDir, "current.build-info.json");
  const buildInfo = buildBuildInfo({
    input,
    output,
    solcVersion: bundle.metadata.compiler?.version,
    id: `live-${chainId}-${implementationAddress.toLowerCase()}`
  });

  await fs.writeFile(buildInfoPath, `${JSON.stringify(buildInfo, null, 2)}\n`, "utf8");

  return {
    buildInfoPath,
    contractSelector: bundle.target.selector,
    sourceName: bundle.target.sourceName,
    contractName: bundle.target.contractName,
    matchType: bundle.matchType,
    compilerVersion: bundle.metadata.compiler?.version ?? null,
    sourceCount: Object.keys(bundle.sources).length,
    cleanup: async () => {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  };
}

function applyLiveProxyContext(
  contract,
  inspection,
  { sourceLabel, implementationAddress, replaceInputPath = false, buildSystem = null }
) {
  const proxyAddress = inspection.subject.proxyAddress;
  const controllerPath = inspection.controlPath.map((entry) => entry.label);
  const existingPath = contract.inputSummary?.path ?? "";

  contract.inputSummary = {
    ...contract.inputSummary,
    mode: sourceLabel,
    path: replaceInputPath
      ? `${proxyAddress} -> ${implementationAddress} (${sourceLabel})`
      : `${existingPath} (live proxy: ${proxyAddress})`,
    buildSystem: buildSystem ?? contract.inputSummary?.buildSystem ?? "unknown"
  };
  contract.proxy = {
    name: `Proxy@${shortAddress(proxyAddress)}`,
    address: proxyAddress,
    kind: inspection.subject.kind
  };
  contract.governance = {
    ...(contract.governance ?? {}),
    controllerPath,
    adminAddress: inspection.subject.admin ?? null,
    beaconAddress: inspection.subject.beacon ?? null
  };
  contract.implementation = {
    ...contract.implementation,
    address: implementationAddress
  };
  contract.liveNotes = inspection.notes ?? [];

  return contract;
}

export async function loadLiveProxyComparisonPair(options, dependencies = {}) {
  const inspectProxyFn = dependencies.inspectProxy ?? inspectProxy;
  const resolveVerifiedBuildInfo = dependencies.resolveVerifiedBuildInfo ?? materializeVerifiedBuildInfo;
  const loadCompilerContractFn = dependencies.loadCompilerContract ?? loadCompilerContract;
  const proposedSpec = dependencies.proposedSpec ?? null;

  if (!options.proxy || !options.rpcUrl) {
    throw new Error("Live proxy comparison requires both --proxy and --rpc-url.");
  }

  const inspection = await inspectProxyFn({
    proxyAddress: options.proxy,
    rpcUrl: options.rpcUrl,
    fetchImpl: dependencies.fetchImpl ?? globalThis.fetch
  });

  if (!inspection.subject.implementation) {
    throw new Error(
      `Could not derive a live implementation address from proxy ${inspection.subject.proxyAddress}. This mode currently requires a readable EIP-1967 implementation slot.`
    );
  }

  const resolved = await resolveVerifiedBuildInfo({
    chainId: inspection.chainId,
    implementationAddress: inspection.subject.implementation,
    fetchImpl: dependencies.fetchImpl ?? globalThis.fetch
  });

  try {
    const current = await loadCompilerContractFn({
      mode: "build-info",
      path: resolved.buildInfoPath,
      contract: options.currentContract ?? resolved.contractSelector
    });

    const proposed = await loadCompilerContractFn(
      proposedSpec ?? {
        mode: options.proposedBuildInfo ? "build-info" : "artifact",
        path: options.proposedBuildInfo ?? options.proposedArtifact,
        contract: options.proposedContract ?? options.contract ?? null
      }
    );

    applyLiveProxyContext(current, inspection, {
      sourceLabel: `live-proxy:${resolved.matchType}`,
      implementationAddress: inspection.subject.implementation,
      replaceInputPath: true,
      buildSystem: "sourcify"
    });
    applyLiveProxyContext(proposed, inspection, {
      sourceLabel: proposed.inputSummary?.mode ?? "proposed",
      implementationAddress: inspection.subject.implementation
    });
    delete proposed.implementation.address;

    return {
      current,
      proposed,
      inputMode: "live-proxy-vs-local-artifact",
      inputs: [
        {
          label: "Current",
          ...current.inputSummary
        },
        {
          label: "Proposed",
          ...proposed.inputSummary
        }
      ]
    };
  } finally {
    await resolved.cleanup?.();
  }
}
