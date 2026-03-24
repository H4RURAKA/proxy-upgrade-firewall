import fs from "node:fs/promises";
import path from "node:path";
import { fileExists, readJson } from "../utils/file-system.js";

function functionSignatureFromAbiItem(abiItem) {
  const inputs = (abiItem.inputs ?? []).map((input) => input.type).join(",");
  return `${abiItem.name}(${inputs})`;
}

function parseMetadata(metadata) {
  if (!metadata) {
    return {};
  }

  if (typeof metadata === "string") {
    try {
      return JSON.parse(metadata);
    } catch {
      return {};
    }
  }

  if (typeof metadata === "object") {
    return metadata;
  }

  return {};
}

function detectBuildSystem({ sourceRef, format }) {
  if (typeof format === "string" && format.startsWith("hh-")) {
    return "hardhat";
  }

  if (sourceRef.includes(`${path.sep}out${path.sep}`)) {
    return "foundry";
  }

  if (sourceRef.includes(`${path.sep}artifacts${path.sep}`)) {
    return "hardhat";
  }

  if (sourceRef.includes(`${path.sep}build-info${path.sep}`)) {
    return "build-info";
  }

  return "unknown";
}

function extractBytecodeObject(bytecode) {
  if (!bytecode) {
    return null;
  }

  if (typeof bytecode === "string") {
    return bytecode;
  }

  if (typeof bytecode.object === "string") {
    return bytecode.object;
  }

  return null;
}

function extractOpcodes(bytecode) {
  if (!bytecode) {
    return null;
  }

  if (typeof bytecode.opcodes === "string") {
    return bytecode.opcodes;
  }

  return null;
}

function byteLength(hex) {
  if (!hex || hex === "0x") {
    return 0;
  }

  return Math.max(0, (hex.startsWith("0x") ? hex.length - 2 : hex.length) / 2);
}

function normalizeStorageLayout(storageLayout) {
  const storage = storageLayout?.storage ?? [];
  const types = storageLayout?.types ?? {};

  return storage.map((entry) => ({
    label: entry.label,
    slot: String(entry.slot),
    offset: String(entry.offset ?? 0),
    type: entry.type,
    typeLabel: types[entry.type]?.label ?? entry.type,
    contract: entry.contract ?? null
  }));
}

function deriveSecuritySignals(contractOutput) {
  const opcodes =
    extractOpcodes(contractOutput.evm?.deployedBytecode) ??
    extractOpcodes(contractOutput.deployedBytecode) ??
    extractOpcodes(contractOutput.evm?.bytecode) ??
    null;

  if (!opcodes) {
    return {
      delegatecall: null,
      selfdestruct: null,
      disableInitializersInConstructor: null
    };
  }

  return {
    delegatecall: opcodes.includes("DELEGATECALL"),
    selfdestruct: opcodes.includes("SELFDESTRUCT"),
    disableInitializersInConstructor: null
  };
}

function normalizeContract({
  contractOutput,
  contractName,
  sourceName,
  sourceRef,
  sourceMode,
  buildSystem,
  solcVersion,
  format
}) {
  const metadata = parseMetadata(contractOutput.metadata ?? contractOutput.rawMetadata);
  const buildSettings = metadata.settings ?? {};
  const optimizer = buildSettings.optimizer ?? {};
  const bytecode = extractBytecodeObject(contractOutput.evm?.bytecode ?? contractOutput.bytecode);
  const deployedBytecode = extractBytecodeObject(
    contractOutput.evm?.deployedBytecode ?? contractOutput.deployedBytecode
  );

  return {
    sourceMode,
    inputSummary: {
      mode: sourceMode,
      contract: `${sourceName}:${contractName}`,
      path: sourceRef,
      buildSystem
    },
    proxy: {
      name: contractName,
      kind: "compiler-artifact"
    },
    implementation: {
      name: contractName,
      sourceName,
      solc: solcVersion ?? metadata.compiler?.version ?? null,
      buildSystem,
      artifactFormat: format ?? null,
      compiler: {
        version: solcVersion ?? metadata.compiler?.version ?? null
      },
      metadata: {
        optimizerEnabled: optimizer.enabled ?? null,
        optimizerRuns: optimizer.runs ?? null,
        viaIR: buildSettings.viaIR ?? null,
        evmVersion: buildSettings.evmVersion ?? null,
        bytecodeHash: buildSettings.metadata?.bytecodeHash ?? null
      },
      bytecode: {
        creationSize: byteLength(bytecode),
        deployedSize: byteLength(deployedBytecode)
      }
    },
    storageLayout: normalizeStorageLayout(contractOutput.storageLayout),
    abi: contractOutput.abi ?? [],
    abiSurface: (contractOutput.abi ?? [])
      .filter((item) => item.type === "function")
      .map((item) => functionSignatureFromAbiItem(item)),
    privilegedFunctions: [],
    securitySignals: deriveSecuritySignals(contractOutput)
  };
}

function matchSelector(selector, sourceName, contractName) {
  if (!selector) {
    return true;
  }

  return (
    selector === contractName ||
    selector === sourceName ||
    selector === `${sourceName}:${contractName}`
  );
}

function collectBuildInfoMatches(buildInfo, selector) {
  const matches = [];
  for (const [sourceName, contracts] of Object.entries(buildInfo.output?.contracts ?? {})) {
    for (const [contractName, contractOutput] of Object.entries(contracts)) {
      if (matchSelector(selector, sourceName, contractName)) {
        matches.push({
          sourceName,
          contractName,
          contractOutput
        });
      }
    }
  }
  return matches;
}

async function listJsonFiles(rootDir) {
  const entries = await fs.readdir(rootDir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const absolute = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listJsonFiles(absolute)));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith(".json") && !entry.name.endsWith(".dbg.json")) {
      files.push(absolute);
    }
  }

  return files.sort();
}

async function resolveBuildInfoMatch(buildInfoPathOrDir, selector) {
  const resolved = path.resolve(buildInfoPathOrDir);
  const stats = await fs.stat(resolved);
  const candidates = stats.isDirectory() ? await listJsonFiles(resolved) : [resolved];
  const matches = [];
  const available = [];

  for (const candidate of candidates) {
    const buildInfo = await readJson(candidate);
    const contractMatches = collectBuildInfoMatches(buildInfo, selector);
    const allContracts = collectBuildInfoMatches(buildInfo, null).map(
      (entry) => `${entry.sourceName}:${entry.contractName}`
    );
    available.push(...allContracts);

    for (const match of contractMatches) {
      matches.push({
        ...match,
        buildInfo,
        filePath: candidate
      });
    }
  }

  if (matches.length === 0) {
    throw new Error(
      `Could not find contract${selector ? ` ${selector}` : ""} in build-info input ${resolved}. Available contracts: ${available.join(", ")}`
    );
  }

  if (matches.length > 1) {
    const selectors = matches.map((match) => `${match.sourceName}:${match.contractName}`);
    throw new Error(
      `Contract selector${selector ? ` ${selector}` : ""} is ambiguous in ${resolved}. Matches: ${selectors.join(", ")}`
    );
  }

  return matches[0];
}

async function loadFromBuildInfo(spec) {
  const match = await resolveBuildInfoMatch(spec.path, spec.contract);
  const buildSystem = detectBuildSystem({
    sourceRef: match.filePath,
    format: match.buildInfo._format
  });

  return normalizeContract({
    contractOutput: match.contractOutput,
    contractName: match.contractName,
    sourceName: match.sourceName,
    sourceRef: match.filePath,
    sourceMode: "build-info",
    buildSystem,
    solcVersion: match.buildInfo.solcVersion ?? null,
    format: match.buildInfo._format ?? null
  });
}

async function loadFromArtifact(spec) {
  const artifactPath = path.resolve(spec.path);
  const artifact = await readJson(artifactPath);
  const contractName = artifact.contractName ?? spec.contract ?? "UnknownContract";
  const sourceName = artifact.sourceName ?? spec.contract?.split(":")[0] ?? "unknown";

  if (artifact.storageLayout) {
    return normalizeContract({
      contractOutput: {
        abi: artifact.abi,
        metadata: artifact.metadata ?? artifact.rawMetadata,
        rawMetadata: artifact.rawMetadata,
        storageLayout: artifact.storageLayout,
        evm: {
          bytecode: artifact.bytecode,
          deployedBytecode: artifact.deployedBytecode
        }
      },
      contractName,
      sourceName,
      sourceRef: artifactPath,
      sourceMode: "artifact",
      buildSystem: detectBuildSystem({
        sourceRef: artifactPath,
        format: artifact._format
      }),
      solcVersion: parseMetadata(artifact.metadata ?? artifact.rawMetadata).compiler?.version ?? null,
      format: artifact._format ?? null
    });
  }

  const debugPath = artifactPath.replace(/\.json$/, ".dbg.json");
  if (!(await fileExists(debugPath))) {
    throw new Error(
      `Artifact ${artifactPath} does not include storageLayout and no sibling .dbg.json file was found.`
    );
  }

  const dbg = await readJson(debugPath);
  if (!dbg.buildInfo) {
    throw new Error(`Artifact debug file ${debugPath} does not include a buildInfo reference.`);
  }

  const buildInfoPath = path.resolve(path.dirname(debugPath), dbg.buildInfo);
  const match = await resolveBuildInfoMatch(
    buildInfoPath,
    spec.contract ?? `${sourceName}:${contractName}`
  );

  const normalized = normalizeContract({
    contractOutput: match.contractOutput,
    contractName: match.contractName,
    sourceName: match.sourceName,
    sourceRef: artifactPath,
    sourceMode: "artifact",
    buildSystem: "hardhat",
    solcVersion: match.buildInfo.solcVersion ?? null,
    format: artifact._format ?? dbg._format ?? null
  });

  normalized.inputSummary.path = `${artifactPath} (build-info: ${buildInfoPath})`;
  return normalized;
}

export async function loadCompilerContract(spec) {
  if (spec.mode === "build-info") {
    return loadFromBuildInfo(spec);
  }

  if (spec.mode === "artifact") {
    return loadFromArtifact(spec);
  }

  throw new Error(`Unsupported compiler input mode: ${spec.mode}`);
}

