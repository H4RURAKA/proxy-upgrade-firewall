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

function unique(items = []) {
  return [...new Set(items.filter(Boolean))];
}

function createGuardInfo(label = "unknown", overrides = {}) {
  return {
    label: label ?? "unknown",
    model: "unknown",
    confidence: "low",
    usesTxOrigin: false,
    viaAuthority: false,
    customHelpers: [],
    ...overrides
  };
}

function extractCustomGuardHelpers(label) {
  const tokens = String(label ?? "").match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? [];
  return unique(
    tokens.filter((token) => {
      const text = lower(token);
      if (
        [
          "onlyowner",
          "onlyrole",
          "onlyproxyadmin",
          "pendingowner",
          "onlyguardian",
          "_checkowner",
          "_checkrole"
        ].includes(text)
      ) {
        return false;
      }

      return (
        text.startsWith("_assert") ||
        text.startsWith("_check") ||
        (text.startsWith("only") && !text.startsWith("onlyowner") && !text.startsWith("onlyrole")) ||
        text.includes("fundadmin") ||
        text.includes("permission")
      );
    })
  );
}

function buildGuardInfoFromText(label) {
  const raw = String(label ?? "unknown");
  const text = lower(raw);

  if (!text || text === "unknown") {
    return createGuardInfo(raw || "unknown");
  }

  if (text === "none") {
    return createGuardInfo("none", {
      model: "none",
      confidence: "high"
    });
  }

  const usesTxOrigin = text.includes("tx.origin");
  const viaAuthority =
    text.includes("authority.") ||
    text.includes("cancall") ||
    text.includes("doesuserhaverole") ||
    text.includes("permission");
  const customHelpers = extractCustomGuardHelpers(raw);

  if (
    text.includes("timelock") ||
    text.includes("governance") ||
    text.includes("governor") ||
    text.includes("safe") ||
    text.includes("multisig")
  ) {
    return createGuardInfo(raw, {
      model: "governance",
      confidence: "high",
      usesTxOrigin,
      viaAuthority,
      customHelpers
    });
  }

  if (text.includes("proxyadmin") || text.includes("changeadmin")) {
    return createGuardInfo(raw, {
      model: "proxy-admin",
      confidence: "high",
      usesTxOrigin,
      viaAuthority,
      customHelpers
    });
  }

  if (text.includes("pendingowner")) {
    return createGuardInfo(raw, {
      model: "pending-owner",
      confidence: "high",
      usesTxOrigin,
      viaAuthority,
      customHelpers
    });
  }

  if (text.includes("onlyguardian") || text.includes("_assertguardian") || text.includes("_checkguardian")) {
    return createGuardInfo(raw, {
      model: "guardian",
      confidence: customHelpers.length > 0 ? "medium" : "high",
      usesTxOrigin,
      viaAuthority,
      customHelpers
    });
  }

  if (
    text.includes("onlyrole") ||
    text.includes("hasrole") ||
    text.includes("doesuserhaverole") ||
    text.includes("getroleadmin") ||
    text.includes("default_admin_role") ||
    text.includes("fundadmin") ||
    text.includes("permission") ||
    text.includes("cancall")
  ) {
    return createGuardInfo(raw, {
      model: "role",
      confidence: customHelpers.length > 0 || viaAuthority || usesTxOrigin ? "medium" : "high",
      usesTxOrigin,
      viaAuthority,
      customHelpers
    });
  }

  if (text.includes("onlyowner") || text.includes("_assertowner") || text.includes("_checkowner")) {
    return createGuardInfo(raw, {
      model: "owner",
      confidence: customHelpers.length > 0 ? "medium" : "high",
      usesTxOrigin,
      viaAuthority,
      customHelpers
    });
  }

  return createGuardInfo(raw, {
    model: customHelpers.length > 0 ? "custom" : "unknown",
    confidence: customHelpers.length > 0 ? "medium" : "low",
    usesTxOrigin,
    viaAuthority,
    customHelpers
  });
}

function createBodyGuardHints() {
  return {
    models: new Set(),
    usesTxOrigin: false,
    viaAuthority: false,
    customHelpers: new Set()
  };
}

function mergeBodyGuardHints(target, source) {
  for (const model of source.models) {
    target.models.add(model);
  }

  for (const helper of source.customHelpers) {
    target.customHelpers.add(helper);
  }

  target.usesTxOrigin = target.usesTxOrigin || source.usesTxOrigin;
  target.viaAuthority = target.viaAuthority || source.viaAuthority;
  return target;
}

function buildGuardInfoFromBodyHints(hints) {
  const customHelpers = [...hints.customHelpers];
  const helperSuffix = customHelpers.length > 0 ? `(custom:${customHelpers[0]})` : "(body)";
  const txOriginSuffix = hints.usesTxOrigin ? " via tx.origin" : "";

  if (hints.models.has("governance")) {
    return createGuardInfo(`governance${txOriginSuffix}`, {
      model: "governance",
      confidence: "medium",
      usesTxOrigin: hints.usesTxOrigin,
      viaAuthority: hints.viaAuthority,
      customHelpers
    });
  }

  if (hints.models.has("proxy-admin")) {
    return createGuardInfo(`onlyProxyAdmin${txOriginSuffix}`, {
      model: "proxy-admin",
      confidence: "medium",
      usesTxOrigin: hints.usesTxOrigin,
      viaAuthority: hints.viaAuthority,
      customHelpers
    });
  }

  if (hints.models.has("role")) {
    return createGuardInfo(`onlyRole${helperSuffix}${txOriginSuffix}`, {
      model: "role",
      confidence: customHelpers.length > 0 || hints.viaAuthority || hints.usesTxOrigin ? "medium" : "high",
      usesTxOrigin: hints.usesTxOrigin,
      viaAuthority: hints.viaAuthority,
      customHelpers
    });
  }

  if (hints.models.has("guardian")) {
    return createGuardInfo(`onlyGuardian${helperSuffix}${txOriginSuffix}`, {
      model: "guardian",
      confidence: customHelpers.length > 0 || hints.usesTxOrigin ? "medium" : "high",
      usesTxOrigin: hints.usesTxOrigin,
      viaAuthority: hints.viaAuthority,
      customHelpers
    });
  }

  if (hints.models.has("pending-owner")) {
    return createGuardInfo(`pendingOwner${txOriginSuffix}`, {
      model: "pending-owner",
      confidence: "high",
      usesTxOrigin: hints.usesTxOrigin,
      viaAuthority: hints.viaAuthority,
      customHelpers
    });
  }

  if (hints.models.has("owner")) {
    return createGuardInfo(`onlyOwner${helperSuffix}${txOriginSuffix}`, {
      model: "owner",
      confidence: customHelpers.length > 0 || hints.usesTxOrigin ? "medium" : "high",
      usesTxOrigin: hints.usesTxOrigin,
      viaAuthority: hints.viaAuthority,
      customHelpers
    });
  }

  return null;
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

  if (
    text.includes("delegatecall") ||
    text.includes("forward") ||
    text.includes("execute") ||
    text.includes("multicall")
  ) {
    return "execution";
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

function isLikelySelfAuthorizedFlow(name) {
  const text = lower(name);
  return (
    text.endsWith("bysig") ||
    text.includes("withauthorization") ||
    text.includes("authorization") ||
    text.includes("permit")
  );
}

function isPotentiallyPrivilegedName(name) {
  const text = lower(name);
  if (
    isLikelySelfAuthorizedFlow(name) &&
    !text.includes("owner") &&
    !text.includes("admin") &&
    !text.includes("role") &&
    !text.includes("upgrade") &&
    !text.includes("pause") &&
    !text.includes("sweep") &&
    !text.includes("rescue")
  ) {
    return false;
  }

  return (
    text.includes("upgrade") ||
    text.includes("admin") ||
    text.includes("owner") ||
    text.includes("role") ||
    text.includes("pause") ||
    text.includes("sweep") ||
    text.includes("rescue") ||
    text.includes("forward") ||
    text.includes("execute") ||
    text.includes("multicall") ||
    text.includes("delegate") ||
    text.includes("oracle") ||
    text.includes("guardian") ||
    text.includes("rebalance") ||
    text.startsWith("set")
  );
}

function contractGuardSignals(contract) {
  const controlLabels = (contract.storageLayout ?? []).map((entry) => lower(entry.label));
  const functionNames = (contract.abi ?? [])
    .filter((item) => item.type === "function")
    .map((item) => item.name);

  return {
    hasOwner:
      controlLabels.some((label) => label.includes("owner")) ||
      functionNames.some((name) =>
        ["owner", "transferOwnership", "acceptOwnership", "renounceOwnership"].includes(name)
      ),
    hasRole:
      controlLabels.some((label) => label.includes("role")) ||
      functionNames.some((name) => ["grantRole", "revokeRole", "setRoleAdmin", "hasRole"].includes(name))
  };
}

function inferKnownGuardInfo(signature, upgradeHook, contract) {
  const name = signature.split("(")[0];
  const signals = contract ? contractGuardSignals(contract) : { hasOwner: false, hasRole: false };

  if (name === "upgradeTo" || name === "upgradeToAndCall") {
    return upgradeHook
      ? createGuardInfo(upgradeHook.guard, {
          model: upgradeHook.guardModel ?? buildGuardInfoFromText(upgradeHook.guard).model,
          confidence: upgradeHook.guardConfidence ?? "medium",
          usesTxOrigin: upgradeHook.guardUsesTxOrigin ?? false,
          viaAuthority: upgradeHook.guardViaAuthority ?? false,
          customHelpers: unique(upgradeHook.guardHelpers ?? [])
        })
      : createGuardInfo("unknown");
  }

  if (name === "transferOwnership" || name === "renounceOwnership") {
    return createGuardInfo("onlyOwner", {
      model: "owner",
      confidence: "high"
    });
  }

  if (name === "acceptOwnership") {
    return createGuardInfo("pendingOwner", {
      model: "pending-owner",
      confidence: "high"
    });
  }

  if (name === "grantRole" || name === "revokeRole") {
    return createGuardInfo("onlyRole(getRoleAdmin)", {
      model: "role",
      confidence: "high"
    });
  }

  if (name === "setRoleAdmin") {
    return createGuardInfo("onlyRole(DEFAULT_ADMIN_ROLE)", {
      model: "role",
      confidence: "high"
    });
  }

  if (name === "changeAdmin") {
    return createGuardInfo("onlyProxyAdmin", {
      model: "proxy-admin",
      confidence: "high"
    });
  }

  if ((name === "pause" || name === "unpause" || name === "freeze" || name === "unfreeze") && signals.hasRole) {
    return createGuardInfo("onlyRole(heuristic)", {
      model: "role",
      confidence: "medium"
    });
  }

  if ((name === "pause" || name === "unpause" || name === "freeze" || name === "unfreeze") && signals.hasOwner) {
    return createGuardInfo("onlyOwner(heuristic)", {
      model: "owner",
      confidence: "medium"
    });
  }

  return createGuardInfo("unknown");
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

  const functionNodes = (contract.nodes ?? []).filter(
    (node) => node.nodeType === "FunctionDefinition" && node.kind === "function" && node.name
  );
  const functionNodeMap = new Map(functionNodes.map((node) => [node.name, node]));

  function expressionText(node) {
    return lower(expressionToLabel(node));
  }

  function applyDirectGuardHint(targetLabel, hints) {
    const target = lower(targetLabel);

    if (!target || target === "unknown") {
      return;
    }

    if (target.includes("tx.origin")) {
      hints.usesTxOrigin = true;
    }

    if (
      target.includes("_checkowner") ||
      target.includes("_assertowner") ||
      target.includes(" onlyowner") ||
      target === "onlyowner"
    ) {
      hints.models.add("owner");
    }

    if (target.includes("pendingowner")) {
      hints.models.add("pending-owner");
    }

    if (target.includes("_checkguardian") || target.includes("_assertguardian") || target.includes("onlyguardian")) {
      hints.models.add("guardian");
    }

    if (
      target.includes("_checkrole") ||
      target.includes("hasrole") ||
      target.includes("onlyrole") ||
      target.includes("getroleadmin") ||
      target.includes("default_admin_role")
    ) {
      hints.models.add("role");
    }

    if (
      target.includes("_assertfundadmin") ||
      target.includes("_assertpermission") ||
      target.includes("_checkpermissions") ||
      target.includes("_assertcancall") ||
      target.includes("_checkcancall") ||
      target.includes("doesuserhaverole") ||
      target.includes("cancall") ||
      target.includes("permission")
    ) {
      hints.models.add("role");
      hints.viaAuthority = true;
    }

    if (target.includes("timelock") || target.includes("governance") || target.includes("governor")) {
      hints.models.add("governance");
    }

    if (target.includes("proxyadmin")) {
      hints.models.add("proxy-admin");
    }

    for (const helper of extractCustomGuardHelpers(targetLabel)) {
      hints.customHelpers.add(helper);
    }
  }

  function inspectCondition(conditionText, hints) {
    const condition = lower(conditionText);
    const checksCaller =
      condition.includes("msg.sender") ||
      condition.includes("_msgsender") ||
      condition.includes("tx.origin");

    if (condition.includes("tx.origin")) {
      hints.usesTxOrigin = true;
    }

    if (checksCaller && (condition.includes("owner") || condition.includes("_owner"))) {
      hints.models.add("owner");
    }

    if (checksCaller && condition.includes("pendingowner")) {
      hints.models.add("pending-owner");
    }

    if (checksCaller && condition.includes("guardian")) {
      hints.models.add("guardian");
    }

    if (
      condition.includes("hasrole") ||
      condition.includes("_checkrole") ||
      condition.includes("getroleadmin") ||
      condition.includes("default_admin_role") ||
      condition.includes("doesuserhaverole") ||
      condition.includes("cancall") ||
      condition.includes("permission")
    ) {
      hints.models.add("role");
      hints.viaAuthority = true;
    }

    if (condition.includes("timelock") || condition.includes("governance") || condition.includes("governor")) {
      hints.models.add("governance");
    }
  }

  function collectBodyGuardHints(node, hints = createBodyGuardHints(), visited = new Set()) {
    if (!node || typeof node !== "object") {
      return hints;
    }

    if (Array.isArray(node)) {
      for (const item of node) {
        collectBodyGuardHints(item, hints);
      }
      return hints;
    }

    if (node.nodeType === "MemberAccess" && expressionText(node) === "tx.origin") {
      hints.usesTxOrigin = true;
    }

    if (node.nodeType === "FunctionCall") {
      const targetLabel = expressionToLabel(node.expression);
      const target = lower(targetLabel);

      applyDirectGuardHint(targetLabel, hints);

      if (target === "require" || target === "assert") {
        inspectCondition(expressionText(node.arguments?.[0]), hints);
      }

      if (node.expression?.nodeType === "Identifier") {
        const helperName = node.expression.name;
        const helperNode = functionNodeMap.get(helperName);

        if (helperNode?.body && !visited.has(helperName)) {
          visited.add(helperName);
          collectBodyGuardHints(helperNode.body, hints, visited);
          visited.delete(helperName);
        }
      }
    }

    for (const value of Object.values(node)) {
      collectBodyGuardHints(value, hints, visited);
    }

    return hints;
  }

  function guardInfoFromBody(body) {
    const hints = collectBodyGuardHints(body);
    return buildGuardInfoFromBodyHints(hints);
  }

  return functionNodes.map((node) => {
    const modifiers = (node.modifiers ?? []).map(modifierToLabel);
    const modifierGuardInfo = modifiers.length > 0 ? buildGuardInfoFromText(modifiers.join(" + ")) : null;
    const bodyGuardInfo = guardInfoFromBody(node.body);

    return {
      name: node.name,
      signature: signatureFromAstFunction(node),
      visibility: node.visibility,
      stateMutability: node.stateMutability,
      modifiers,
      hasBody: Boolean(node.body),
      bodyGuard: bodyGuardInfo?.label ?? null,
      bodyGuardInfo,
      modifierGuardInfo
    };
  });
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

  const guardModels = privilegedFunctions.map((item) => item.guardModel);
  const hasRole =
    guardModels.includes("role") ||
    haystack.includes("onlyrole") ||
    haystack.includes("getroleadmin") ||
    haystack.includes("default_admin_role") ||
    adminSurface.some((item) => item.includes("grantRole(") || item.includes("revokeRole(") || item.includes("setRoleAdmin(")) ||
    controlVariables.some((item) => item.category === "role");
  const hasOwner =
    guardModels.includes("owner") ||
    guardModels.includes("pending-owner") ||
    haystack.includes("onlyowner") ||
    haystack.includes("pendingowner") ||
    adminSurface.some(
      (item) =>
        item.includes("transferOwnership(") ||
        item.includes("acceptOwnership(") ||
        item.includes("renounceOwnership(") ||
        item.includes("changeAdmin(")
    );
  const hasGovernance =
    guardModels.includes("governance") ||
    guardModels.includes("proxy-admin") ||
    haystack.includes("timelock") ||
    haystack.includes("governance") ||
    haystack.includes("safe") ||
    haystack.includes("multisig");
  const hasNone = privilegedFunctions.some((item) => item.guardModel === "none" || item.guard === "none");

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
    const guardInfo = buildGuardInfoFromText(item.guard ?? "unknown");
    map.set(item.signature, {
      signature: item.signature,
      name: item.signature.split("(")[0],
      kind: item.kind ?? classifyFunctionKind(item.signature.split("(")[0], item.signature),
      guard: item.guard ?? "unknown",
      guardSource: "explicit",
      guardModel: guardInfo.model,
      guardConfidence: guardInfo.confidence,
      guardUsesTxOrigin: guardInfo.usesTxOrigin,
      guardViaAuthority: guardInfo.viaAuthority,
      guardHelpers: guardInfo.customHelpers
    });
  }

  for (const item of astFunctions) {
    const guardInfo =
      item.modifierGuardInfo ??
      item.bodyGuardInfo ??
      createGuardInfo("none", {
        model: "none",
        confidence: "high"
      });
    const guard = guardInfo.label;
    if (item.name === "_authorizeUpgrade") {
      upgradeHook = {
        signature: item.signature,
        guard,
        modifiers: item.modifiers,
        visibility: item.visibility,
        source: "ast",
        guardModel: guardInfo.model,
        guardConfidence: guardInfo.confidence,
        guardUsesTxOrigin: guardInfo.usesTxOrigin,
        guardViaAuthority: guardInfo.viaAuthority,
        guardHelpers: guardInfo.customHelpers
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
        guardSource: item.modifiers.length > 0 ? "modifiers" : item.bodyGuard ? "body" : "ast",
        guardModel: guardInfo.model,
        guardConfidence: guardInfo.confidence,
        guardUsesTxOrigin: guardInfo.usesTxOrigin,
        guardViaAuthority: guardInfo.viaAuthority,
        guardHelpers: guardInfo.customHelpers
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

    const inferredGuard = inferKnownGuardInfo(signature, upgradeHook, contract);

    map.set(signature, {
      signature,
      name: abiItem.name,
      kind: classifyFunctionKind(abiItem.name, signature),
      guard: inferredGuard.label,
      guardModel: inferredGuard.model,
      guardConfidence: inferredGuard.confidence,
      guardUsesTxOrigin: inferredGuard.usesTxOrigin,
      guardViaAuthority: inferredGuard.viaAuthority,
      guardHelpers: inferredGuard.customHelpers,
      guardSource:
        abiItem.name === "upgradeTo" || abiItem.name === "upgradeToAndCall"
          ? upgradeHook
            ? "_authorizeUpgrade"
            : "heuristic"
          : "heuristic"
    });
  }

  if (!upgradeHook && contract.governance?.upgradeAuthorizer) {
    const explicitGuard = buildGuardInfoFromText(contract.governance.upgradeAuthorizer);
    upgradeHook = {
      signature: "_authorizeUpgrade(address)",
      guard: contract.governance.upgradeAuthorizer,
      modifiers: [contract.governance.upgradeAuthorizer],
      visibility: "internal",
      source: "explicit",
      guardModel: explicitGuard.model,
      guardConfidence: explicitGuard.confidence,
      guardUsesTxOrigin: explicitGuard.usesTxOrigin,
      guardViaAuthority: explicitGuard.viaAuthority,
      guardHelpers: explicitGuard.customHelpers
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
      entry.guardModel = upgradeHook.guardModel;
      entry.guardConfidence = upgradeHook.guardConfidence;
      entry.guardUsesTxOrigin = upgradeHook.guardUsesTxOrigin;
      entry.guardViaAuthority = upgradeHook.guardViaAuthority;
      entry.guardHelpers = upgradeHook.guardHelpers;
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
  const explicitUpgradeAuthorizerInfo =
    contract.governance?.upgradeAuthorizer != null
      ? buildGuardInfoFromText(contract.governance.upgradeAuthorizer)
      : null;

  return {
    governance: {
      ...(contract.governance ?? {}),
      upgradeAuthorizer,
      upgradeAuthorizerModel:
        explicitUpgradeAuthorizerInfo?.model ?? upgradeHook?.guardModel ?? null,
      upgradeAuthorizerConfidence:
        explicitUpgradeAuthorizerInfo?.confidence ?? upgradeHook?.guardConfidence ?? null,
      upgradeAuthorizerUsesTxOrigin:
        explicitUpgradeAuthorizerInfo?.usesTxOrigin ?? upgradeHook?.guardUsesTxOrigin ?? false,
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
