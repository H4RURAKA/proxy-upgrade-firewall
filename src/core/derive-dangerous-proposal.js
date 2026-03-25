import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { buildBuildInfo, compileStandardJson } from "./compile-solidity.js";
import { buildSourcifyInput } from "./load-live-proxy-pair.js";

const EMERGENCY_ADMIN_STORAGE = "\n    address public __firewallEmergencyAdmin;\n";
const EMERGENCY_FUNCTIONS = `

    function __firewallSetEmergencyAdmin(address newAdmin) external {
        __firewallEmergencyAdmin = newAdmin;
    }

    function __firewallEmergencySweep(address target, bytes calldata data)
        external
        returns (bytes memory result)
    {
        (bool ok, bytes memory response) = target.call(data);
        require(ok, "__firewallEmergencySweep failed");
        return response;
    }

    function __firewallExecuteDelegatecall(address target, bytes calldata data)
        external
        returns (bytes memory result)
    {
        (bool ok, bytes memory response) = target.delegatecall(data);
        require(ok, "__firewallExecuteDelegatecall failed");
        return response;
    }
`;

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function stripDisableInitializers(source) {
  let removed = false;
  const next = source.replace(/^[ \t]*_disableInitializers\(\);\s*\n?/gm, () => {
    removed = true;
    return "";
  });

  return {
    source: next,
    removed
  };
}

function findMatchingBrace(source, openBraceIndex) {
  let depth = 0;
  let state = "code";

  for (let index = openBraceIndex; index < source.length; index += 1) {
    const current = source[index];
    const next = source[index + 1];

    if (state === "line-comment") {
      if (current === "\n") {
        state = "code";
      }
      continue;
    }

    if (state === "block-comment") {
      if (current === "*" && next === "/") {
        state = "code";
        index += 1;
      }
      continue;
    }

    if (state === "single-quote") {
      if (current === "\\") {
        index += 1;
        continue;
      }

      if (current === "'") {
        state = "code";
      }
      continue;
    }

    if (state === "double-quote") {
      if (current === "\\") {
        index += 1;
        continue;
      }

      if (current === "\"") {
        state = "code";
      }
      continue;
    }

    if (current === "/" && next === "/") {
      state = "line-comment";
      index += 1;
      continue;
    }

    if (current === "/" && next === "*") {
      state = "block-comment";
      index += 1;
      continue;
    }

    if (current === "'") {
      state = "single-quote";
      continue;
    }

    if (current === "\"") {
      state = "double-quote";
      continue;
    }

    if (current === "{") {
      depth += 1;
      continue;
    }

    if (current === "}") {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }

  throw new Error(`Could not find a matching closing brace for contract body starting at ${openBraceIndex}.`);
}

function findContractRange(source, contractName) {
  const matcher = new RegExp(
    `\\b(?:abstract\\s+)?contract\\s+${escapeRegExp(contractName)}\\b[^{};]*\\{`,
    "m"
  );
  const match = matcher.exec(source);
  if (!match) {
    throw new Error(`Could not find contract ${contractName} in the verified source bundle.`);
  }

  const openBraceIndex = match.index + match[0].lastIndexOf("{");
  const closeBraceIndex = findMatchingBrace(source, openBraceIndex);

  return {
    openBraceIndex,
    closeBraceIndex
  };
}

export function deriveDangerousProposalBundle(bundle, options = {}) {
  const removeInitializerLock = options.removeInitializerLock ?? true;
  const targetSourceName = bundle.target?.sourceName;
  const targetContractName = bundle.target?.contractName;
  const targetSource = bundle.sources?.[targetSourceName];

  if (!targetSourceName || !targetContractName || !targetSource) {
    throw new Error("The verified source bundle is missing the compilation target source.");
  }

  const stripped = removeInitializerLock ? stripDisableInitializers(targetSource) : { source: targetSource, removed: false };
  const { openBraceIndex, closeBraceIndex } = findContractRange(stripped.source, targetContractName);

  let mutatedSource =
    stripped.source.slice(0, openBraceIndex + 1) +
    EMERGENCY_ADMIN_STORAGE +
    stripped.source.slice(openBraceIndex + 1);
  const adjustedCloseBraceIndex = closeBraceIndex + EMERGENCY_ADMIN_STORAGE.length;
  mutatedSource =
    mutatedSource.slice(0, adjustedCloseBraceIndex) +
    EMERGENCY_FUNCTIONS +
    mutatedSource.slice(adjustedCloseBraceIndex);

  const mutations = [
    "inserted_top_level_emergency_admin_storage",
    "added_unguarded_admin_setter",
    "added_unguarded_sweep_entrypoint",
    "added_unguarded_delegatecall_entrypoint"
  ];

  if (stripped.removed) {
    mutations.push("removed_disable_initializers_lock");
  }

  const derivedSources = {
    ...bundle.sources,
    [targetSourceName]: mutatedSource
  };

  return {
    ...bundle,
    sources: derivedSources,
    mutations,
    input: buildSourcifyInput(bundle.metadata, derivedSources)
  };
}

export async function materializeDerivedDangerousProposalBuildInfo({
  bundle,
  outputPath,
  id = `dangerous-${bundle.target.selector}`
}) {
  const derived = deriveDangerousProposalBundle(bundle);
  const output = compileStandardJson({
    input: derived.input,
    solcVersion: bundle.metadata.compiler?.version
  });
  const buildInfo = buildBuildInfo({
    input: derived.input,
    output,
    solcVersion: bundle.metadata.compiler?.version,
    id
  });

  let buildInfoPath = outputPath ? path.resolve(outputPath) : null;
  let cleanup = async () => {};

  if (!buildInfoPath) {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "proxy-upgrade-firewall-dangerous-"));
    buildInfoPath = path.join(tempDir, "proposed.build-info.json");
    cleanup = async () => {
      await fs.rm(tempDir, { recursive: true, force: true });
    };
  } else {
    await fs.mkdir(path.dirname(buildInfoPath), { recursive: true });
  }

  await fs.writeFile(buildInfoPath, `${JSON.stringify(buildInfo, null, 2)}\n`, "utf8");

  return {
    buildInfoPath,
    contractSelector: bundle.target.selector,
    sourceName: bundle.target.sourceName,
    contractName: bundle.target.contractName,
    compilerVersion: bundle.metadata.compiler?.version ?? null,
    mutations: derived.mutations,
    cleanup
  };
}
