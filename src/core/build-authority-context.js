function functionSignatureFromAbiItem(abiItem) {
  const inputs = (abiItem.inputs ?? []).map((input) => input.type).join(",");
  return `${abiItem.name}(${inputs})`;
}

function lower(text) {
  return String(text ?? "").toLowerCase();
}

function expressionToLabel(node) {
  if (!node || typeof node !== "object") {
    return "unknown";
  }

  if (node.nodeType === "Identifier" || node.nodeType === "IdentifierPath") {
    return node.name;
  }

  if (node.nodeType === "Literal") {
    return node.value ?? node.hexValue ?? "literal";
  }

  if (node.nodeType === "MemberAccess") {
    return `${expressionToLabel(node.expression)}.${node.memberName}`;
  }

  if (node.nodeType === "FunctionCall") {
    const target = expressionToLabel(node.expression);
    const args = (node.arguments ?? []).map(expressionToLabel).join(",");
    return `${target}(${args})`;
  }

  return node.name ?? node.memberName ?? node.nodeType ?? "unknown";
}

function modifierToLabel(modifier) {
  const name = expressionToLabel(modifier.modifierName);
  const args = (modifier.arguments ?? []).map(expressionToLabel);
  return args.length > 0 ? `${name}(${args.join(",")})` : name;
}

function parameterType(parameter) {
  return (
    parameter.typeDescriptions?.typeString ??
    parameter.typeName?.typeDescriptions?.typeString ??
    parameter.typeName?.name ??
    parameter.typeName?.pathNode?.name ??
    "unknown"
  );
}

function signatureFromAstFunction(node) {
  const inputs = (node.parameters?.parameters ?? []).map(parameterType).join(",");
  return `${node.name}(${inputs})`;
}

function sanitizeIdSegment(value) {
  return String(value).replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase();
}

function classifyControlVariable(label) {
  const name = lower(label);

  if (name.includes("upgrader")) {
    return "upgrade";
  }

  if (name.includes("role")) {
    return "role";
  }

  if (name.includes("guardian") || name.includes("pauser")) {
    return "guardian";
  }

  if (name.includes("timelock") || name.includes("govern") || name.includes("executor") || name.includes("proposer")) {
    return "governance";
  }

  if (name.includes("owner") || name.includes("pendingowner")) {
    return "owner";
  }

  if (name.includes("admin")) {
    return "admin";
  }

  return null;
}

function classifyFunctionKind(name, signature) {
  const text = `${name} ${signature}`.toLowerCase();

  if (name === "_authorizeUpgrade") {
    return "upgrade";
  }

  if (text.includes("upgradeto") || text.includes("authorizeupgrade") || text.includes("changeadmin")) {
    return "upgrade";
  }

  if (
    text.includes("grantrole") ||
    text.includes("revokerole") ||
    text.includes("setroleadmin") ||
    text.includes("transferownership") ||
    text.includes("acceptownership") ||
    text.includes("renounceownership")
  ) {
    return "admin";
  }

  if (text.includes("pause") || text.includes("unpause") || text.includes("freeze")) {
    return "safety";
  }

  if (text.includes("sweep") || text.includes("rescue") || text.includes("withdraw") || text.includes("recover")) {
    return "funds";
  }

  if (
    text.includes("setoracle") ||
    text.includes("setconfig") ||
    text.includes("setfee") ||
    text.includes("settreasury") ||
    text.includes("rebalance") ||
    /^set[A-Z]/.test(name)
  ) {
    return "config";
  }

  return "misc";
}

function isPotentiallyPrivilegedName(name) {
  const text = lower(name);
  return (
    text.includes("upgrade") ||
    text.includes("admin") ||
    text.includes("owner") ||
    text.includes("role") ||
    text.includes("pause") ||
    text.includes("sweep") ||
    text.includes("rescue") ||
    text.includes("oracle") ||
    text.includes("guardian") ||
    text.includes("rebalance") ||
    text.startsWith("set")
  );
}

function inferKnownGuard(signature, upgradeHook) {
  const name = signature.split("(")[0];

  if (name === "upgradeTo" || name === "upgradeToAndCall") {
    return upgradeHook?.guard ?? "unknown";
  }

  if (name === "transferOwnership" || name === "renounceOwnership") {
    return "onlyOwner";
  }

  if (name === "acceptOwnership") {
    return "pendingOwner";
  }

  if (name === "grantRole" || name === "revokeRole") {
    return "onlyRole(getRoleAdmin)";
  }

  if (name === "setRoleAdmin") {
    return "onlyRole(DEFAULT_ADMIN_ROLE)";
  }

  if (name === "changeAdmin") {
    return "onlyProxyAdmin";
  }

  return "unknown";
}

function isMeaningfulStateChanger(item) {
  return item.type === "function" && !["view", "pure"].includes(item.stateMutability);
}

function findContractDefinition(sourceAst, contractName) {
  const nodes = sourceAst?.nodes ?? [];
  return nodes.find((node) => node.nodeType === "ContractDefinition" && node.name === contractName) ?? null;
}

function extractAstFunctions(sourceAst, contractName) {
  const contract = findContractDefinition(sourceAst, contractName);
  if (!contract) {
    return [];
  }

  return (contract.nodes ?? [])
    .filter((node) => node.nodeType === "FunctionDefinition" && node.kind === "function" && node.name)
    .map((node) => ({
      name: node.name,
      signature: signatureFromAstFunction(node),
      visibility: node.visibility,
      stateMutability: node.stateMutability,
      modifiers: (node.modifiers ?? []).map(modifierToLabel),
      hasBody: Boolean(node.body)
    }));
}

function deriveAccessModel(privilegedFunctions, controlVariables, adminSurface, upgradeHook) {
  const haystack = [
    ...privilegedFunctions.map((item) => item.guard),
    ...adminSurface,
    ...controlVariables.map((item) => item.label),
    upgradeHook?.guard ?? ""
  ]
    .join(" ")
    .toLowerCase();

  const hasRole =
    haystack.includes("onlyrole") ||
    haystack.includes("getroleadmin") ||
    haystack.includes("default_admin_role") ||
    adminSurface.some((item) => item.includes("grantRole(") || item.includes("revokeRole(") || item.includes("setRoleAdmin(")) ||
    controlVariables.some((item) => item.category === "role");
  const hasOwner =
    haystack.includes("onlyowner") ||
    haystack.includes("pendingowner") ||
    adminSurface.some(
      (item) =>
        item.includes("transferOwnership(") ||
        item.includes("acceptOwnership(") ||
        item.includes("renounceOwnership(") ||
        item.includes("changeAdmin(")
    );
  const hasGovernance = haystack.includes("timelock") || haystack.includes("governance") || haystack.includes("safe") || haystack.includes("multisig");
  const hasNone = privilegedFunctions.some((item) => item.guard === "none");

  if ((hasRole && hasOwner) || (hasGovernance && (hasRole || hasOwner))) {
    return "mixed";
  }

  if (hasGovernance) {
    return "governance";
  }

  if (hasRole) {
    return "role-based";
  }

  if (hasOwner) {
    return "ownable";
  }

  if (hasNone) {
    return "unguarded";
  }

  return "unknown";
}

function buildPrivilegedFunctionMap(contract) {
  const map = new Map();
  const explicitPrivileged = contract.privilegedFunctions ?? [];
  const astFunctions = extractAstFunctions(contract.sourceAst, contract.implementation?.name ?? "");
  let upgradeHook = null;

  for (const item of explicitPrivileged) {
    map.set(item.signature, {
      signature: item.signature,
      name: item.signature.split("(")[0],
      kind: item.kind ?? classifyFunctionKind(item.signature.split("(")[0], item.signature),
      guard: item.guard ?? "unknown",
      guardSource: "explicit"
    });
  }

  for (const item of astFunctions) {
    const guard = item.modifiers.length > 0 ? item.modifiers.join(" + ") : "none";
    if (item.name === "_authorizeUpgrade") {
      upgradeHook = {
        signature: item.signature,
        guard,
        modifiers: item.modifiers,
        visibility: item.visibility,
        source: "ast"
      };
      continue;
    }

    if (
      ["public", "external"].includes(item.visibility) &&
      isPotentiallyPrivilegedName(item.name) &&
      item.stateMutability !== "view" &&
      item.stateMutability !== "pure"
    ) {
      map.set(item.signature, {
        signature: item.signature,
        name: item.name,
        kind: classifyFunctionKind(item.name, item.signature),
        guard,
        guardSource: item.modifiers.length > 0 ? "modifiers" : "ast"
      });
    }
  }

  for (const abiItem of contract.abi ?? []) {
    if (!isMeaningfulStateChanger(abiItem)) {
      continue;
    }

    const signature = functionSignatureFromAbiItem(abiItem);
    if (map.has(signature)) {
      continue;
    }

    if (!isPotentiallyPrivilegedName(abiItem.name)) {
      continue;
    }

    map.set(signature, {
      signature,
      name: abiItem.name,
      kind: classifyFunctionKind(abiItem.name, signature),
      guard: inferKnownGuard(signature, upgradeHook),
      guardSource:
        abiItem.name === "upgradeTo" || abiItem.name === "upgradeToAndCall"
          ? upgradeHook
            ? "_authorizeUpgrade"
            : "heuristic"
          : "heuristic"
    });
  }

  if (!upgradeHook && contract.governance?.upgradeAuthorizer) {
    upgradeHook = {
      signature: "_authorizeUpgrade(address)",
      guard: contract.governance.upgradeAuthorizer,
      modifiers: [contract.governance.upgradeAuthorizer],
      visibility: "internal",
      source: "explicit"
    };
  }

  for (const entry of map.values()) {
    if (
      (entry.name === "upgradeTo" || entry.name === "upgradeToAndCall") &&
      (entry.guard === "unknown" || entry.guard === "none") &&
      upgradeHook
    ) {
      entry.guard = upgradeHook.guard;
      entry.guardSource = "_authorizeUpgrade";
    }
  }

  return {
    upgradeHook,
    privilegedFunctions: [...map.values()].sort((left, right) => left.signature.localeCompare(right.signature))
  };
}

function buildAdminSurface(privilegedFunctions, abi) {
  const surface = new Set();
  for (const item of privilegedFunctions) {
    if (item.kind === "admin" || item.kind === "upgrade") {
      surface.add(item.signature);
    }
  }

  for (const abiItem of abi ?? []) {
    if (abiItem.type !== "function") {
      continue;
    }

    const signature = functionSignatureFromAbiItem(abiItem);
    const name = abiItem.name;
    if (
      name === "grantRole" ||
      name === "revokeRole" ||
      name === "setRoleAdmin" ||
      name === "transferOwnership" ||
      name === "acceptOwnership" ||
      name === "renounceOwnership" ||
      name === "changeAdmin"
    ) {
      surface.add(signature);
    }
  }

  return [...surface].sort();
}

function buildControlVariables(storageLayout) {
  return (storageLayout ?? [])
    .map((entry) => ({
      label: entry.label,
      category: classifyControlVariable(entry.label)
    }))
    .filter((entry) => entry.category !== null);
}

export function buildAuthorityContext(contract) {
  const { privilegedFunctions, upgradeHook } = buildPrivilegedFunctionMap(contract);
  const controlVariables = buildControlVariables(contract.storageLayout);
  const adminSurface = buildAdminSurface(privilegedFunctions, contract.abi ?? []);
  const accessModel = deriveAccessModel(privilegedFunctions, controlVariables, adminSurface, upgradeHook);
  const upgradeAuthorizer = contract.governance?.upgradeAuthorizer ?? upgradeHook?.guard ?? null;

  return {
    governance: {
      ...(contract.governance ?? {}),
      upgradeAuthorizer,
      upgradeAuthorizerSource:
        contract.governance?.upgradeAuthorizer != null
          ? "explicit"
          : upgradeHook
            ? "_authorizeUpgrade"
            : null
    },
    privilegedFunctions,
    upgradeHook,
    adminSurface,
    controlVariables,
    accessModel,
    hasUpgradeEntryPoint: privilegedFunctions.some(
      (item) => item.name === "upgradeTo" || item.name === "upgradeToAndCall"
    )
  };
}

export function authorityDeltaId(prefix, value) {
  return `${prefix}-${sanitizeIdSegment(value)}`;
}
