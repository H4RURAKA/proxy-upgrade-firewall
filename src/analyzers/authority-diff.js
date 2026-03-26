import { authorityDeltaId, buildAuthorityContext } from "../core/build-authority-context.js";

function guardStrength(guard = "") {
  const text = String(guard ?? "").toLowerCase();

  if (text === "none") {
    return 0;
  }

  let score = 1;

  if (text.includes("timelock") || text.includes("governance")) {
    score = Math.max(score, 5);
  }

  if (text.includes("safe") || text.includes("multisig")) {
    score = Math.max(score, 4);
  }

  if (
    text.includes("onlyrole") ||
    text.includes("getroleadmin") ||
    text.includes("default_admin_role") ||
    text.includes("proxyadmin")
  ) {
    score = Math.max(score, 3);
  }

  if (text.includes("onlyowner") || text.includes("pendingowner")) {
    score = Math.max(score, 2);
  }

  return score;
}

function normalizedGuardModel(item) {
  const model = item?.guardModel ?? item?.model ?? null;

  if (model === "pending-owner") {
    return "owner";
  }

  if (model === "proxy-admin") {
    return "governance";
  }

  return model;
}

function guardStrengthFor(item) {
  const model = normalizedGuardModel(item);

  if (model === "none") {
    return 0;
  }

  if (model === "unknown") {
    return 1;
  }

  if (model === "governance") {
    return 5;
  }

  if (model === "role") {
    return 3;
  }

  if (model === "guardian") {
    return 2;
  }

  if (model === "owner") {
    return 2;
  }

  if (model === "custom") {
    return 2;
  }

  return guardStrength(item?.guard ?? item ?? "");
}

function hasMeaningfulGuard(item) {
  const model = normalizedGuardModel(item);
  return Boolean(model && model !== "none" && model !== "unknown");
}

function usesCustomGuardInference(item) {
  return (
    (item?.guardConfidence != null && item.guardConfidence !== "high") ||
    (item?.guardHelpers?.length ?? 0) > 0 ||
    item?.guardViaAuthority === true
  );
}

function migrationSeverityForGuardChange(currentItem, proposedItem) {
  const currentModel = normalizedGuardModel(currentItem);
  const proposedModel = normalizedGuardModel(proposedItem);

  if (
    (currentModel === "role" || currentModel === "governance") &&
    (proposedModel === "owner" || proposedModel === "guardian" || proposedModel === "custom")
  ) {
    return "high";
  }

  return "medium";
}

function joinPath(controllerPath = []) {
  return controllerPath.join(" -> ");
}

function downgradeSeverity(currentModel, proposedModel) {
  if (
    (currentModel === "role-based" || currentModel === "governance" || currentModel === "mixed") &&
    (proposedModel === "ownable" || proposedModel === "unguarded")
  ) {
    return "high";
  }

  return "medium";
}

export function analyzeAuthorityDiff(current, proposed) {
  const findings = [];
  const currentContext = buildAuthorityContext(current);
  const proposedContext = buildAuthorityContext(proposed);
  const currentGovernance = currentContext.governance;
  const proposedGovernance = proposedContext.governance;
  const currentFunctions = new Map(currentContext.privilegedFunctions.map((item) => [item.signature, item]));
  const proposedFunctions = new Map(proposedContext.privilegedFunctions.map((item) => [item.signature, item]));

  if ((proposedGovernance.upgradeDelaySeconds ?? 0) < (currentGovernance.upgradeDelaySeconds ?? 0)) {
    findings.push({
      id: "AUTH-001",
      category: "authority",
      severity: "high",
      title: "The governance delay protecting upgrades was reduced",
      body: "Shorter or removed delay windows make malicious or mistaken upgrades harder to stop before execution.",
      evidence: [
        `Current delay: ${currentGovernance.upgradeDelaySeconds ?? 0} seconds`,
        `Proposed delay: ${proposedGovernance.upgradeDelaySeconds ?? 0} seconds`
      ],
      recommendation: "Keep the current delay or justify the reduction with a dedicated emergency process and stronger compensating controls.",
      tags: ["authority", "governance", "upgrade"]
    });
  }

  if (joinPath(currentGovernance.controllerPath) !== joinPath(proposedGovernance.controllerPath)) {
    findings.push({
      id: "AUTH-002",
      category: "authority",
      severity: "high",
      title: "The upgrade control path changed",
      body: "The chain of entities allowed to authorize upgrades is different in the proposed version. That can be a meaningful governance downgrade even when the Solidity diff looks small.",
      evidence: [
        `Current path: ${joinPath(currentGovernance.controllerPath)}`,
        `Proposed path: ${joinPath(proposedGovernance.controllerPath)}`
      ],
      recommendation: "Review the full authority graph, including Safe owners, timelock executors, ProxyAdmin ownership, and implementation guards.",
      tags: ["authority", "governance", "upgrade"]
    });
  }

  if (
    guardStrengthFor({
      guard: proposedGovernance.upgradeAuthorizer,
      guardModel: proposedGovernance.upgradeAuthorizerModel
    }) <
    guardStrengthFor({
      guard: currentGovernance.upgradeAuthorizer,
      guardModel: currentGovernance.upgradeAuthorizerModel
    })
  ) {
    findings.push({
      id: "AUTH-003",
      category: "authority",
      severity: "high",
      title: "The implementation upgrade authorizer became weaker",
      body: "A weaker `_authorizeUpgrade` path increases the chance that an unintended signer can change the implementation.",
      evidence: [
        `Current authorizer: ${currentGovernance.upgradeAuthorizer} (${currentGovernance.upgradeAuthorizerSource ?? "unknown-source"})`,
        `Proposed authorizer: ${proposedGovernance.upgradeAuthorizer} (${proposedGovernance.upgradeAuthorizerSource ?? "unknown-source"})`
      ],
      recommendation: "Preserve or strengthen the existing authorizer and keep upgrade rights behind role-based or governance-controlled paths.",
      tags: ["authority", "upgrade"]
    });
  }

  if (proposedGovernance.upgradeAuthorizerUsesTxOrigin && !currentGovernance.upgradeAuthorizerUsesTxOrigin) {
    findings.push({
      id: "AUTH-TXORIGIN-upgrade-authorizer",
      category: "authority",
      severity: "high",
      title: "The upgrade authorizer now depends on `tx.origin`",
      body: "Authorization based on `tx.origin` is harder to reason about than `msg.sender` and can create unsafe assumptions around wrappers, relayers, and call chains.",
      evidence: [
        `Current authorizer: ${currentGovernance.upgradeAuthorizer} (${currentGovernance.upgradeAuthorizerSource ?? "unknown-source"})`,
        `Proposed authorizer: ${proposedGovernance.upgradeAuthorizer} (${proposedGovernance.upgradeAuthorizerSource ?? "unknown-source"})`
      ],
      recommendation: "Prefer guards keyed off `msg.sender` or explicit role checks on the immediate caller, then add tests for wrapper and relayer call paths.",
      tags: ["authority", "upgrade", "tx-origin"]
    });
  }

  if (currentContext.upgradeHook && !proposedContext.upgradeHook && proposedContext.hasUpgradeEntryPoint) {
    findings.push({
      id: "AUTH-006",
      category: "authority",
      severity: "high",
      title: "Upgrade entrypoints remain but `_authorizeUpgrade` could not be derived anymore",
      body: "When UUPS-style upgrade entrypoints exist, losing the authorizer hook is a meaningful control-plane regression because the effective guard becomes harder to reason about and easier to misconfigure.",
      evidence: [
        `Current hook guard: ${currentContext.upgradeHook.guard}`,
        "Proposed hook: not found",
        `Proposed upgrade entrypoints: ${proposedContext.privilegedFunctions
          .filter((item) => item.kind === "upgrade")
          .map((item) => item.signature)
          .join(", ")}`
      ],
      recommendation: "Keep `_authorizeUpgrade` explicit in the implementation and make sure every upgrade entrypoint routes through it.",
      tags: ["authority", "upgrade"]
    });
  }

  if (
    currentContext.accessModel !== "unknown" &&
    proposedContext.accessModel !== "unknown" &&
    currentContext.accessModel !== proposedContext.accessModel
  ) {
    findings.push({
      id: "AUTH-007",
      category: "authority",
      severity: downgradeSeverity(currentContext.accessModel, proposedContext.accessModel),
      title: "The authority model changed between implementations",
      body: "Shifting from role-based or governance-managed permissions to a simpler owner-managed model changes who can act during emergencies and upgrades. That deserves explicit reviewer attention even if individual modifier diffs look small.",
      evidence: [
        `Current authority model: ${currentContext.accessModel}`,
        `Proposed authority model: ${proposedContext.accessModel}`
      ],
      recommendation: "Document the intended control model and verify that every privileged path still matches governance expectations.",
      tags: ["authority", "governance"]
    });
  }

  const currentAdminSurface = new Set(currentContext.adminSurface);
  const proposedAdminSurface = new Set(proposedContext.adminSurface);
  const addedAdminSurface = [...proposedAdminSurface].filter((item) => !currentAdminSurface.has(item));
  const removedAdminSurface = [...currentAdminSurface].filter((item) => !proposedAdminSurface.has(item));
  if (addedAdminSurface.length > 0 || removedAdminSurface.length > 0) {
    findings.push({
      id: "AUTH-008",
      category: "authority",
      severity: "medium",
      title: "The authority management surface changed",
      body: "Role management, ownership transfer, and upgrade admin entrypoints define how control moves across operators. Changes here are semantically important even when they are not directly exploitable on their own.",
      evidence: [
        ...addedAdminSurface.map((item) => `Added authority function: ${item}`),
        ...removedAdminSurface.map((item) => `Removed authority function: ${item}`)
      ],
      recommendation: "Review how operator changes, role delegation, and ownership transfers are supposed to work after the upgrade.",
      tags: ["authority", "admin-surface"]
    });
  }

  const currentControlVariables = new Set(currentContext.controlVariables.map((item) => `${item.label}:${item.category}`));
  const proposedControlVariables = new Set(proposedContext.controlVariables.map((item) => `${item.label}:${item.category}`));
  const addedControlVariables = [...proposedControlVariables].filter((item) => !currentControlVariables.has(item));
  const removedControlVariables = [...currentControlVariables].filter((item) => !proposedControlVariables.has(item));
  if (addedControlVariables.length > 0 || removedControlVariables.length > 0) {
    findings.push({
      id: "AUTH-009",
      category: "authority",
      severity: "medium",
      title: "Control-plane storage variables changed",
      body: "Adding or removing owner, admin, guardian, or role-related state changes who can steer the protocol and how those powers are represented in storage.",
      evidence: [
        ...addedControlVariables.map((item) => `Added control variable: ${item}`),
        ...removedControlVariables.map((item) => `Removed control variable: ${item}`)
      ],
      recommendation: "Confirm that new control variables are intentional and safely initialized during the upgrade.",
      tags: ["authority", "storage"]
    });
  }

  if (proposedContext.hasUpgradeEntryPoint && !proposedGovernance.upgradeAuthorizer) {
    findings.push({
      id: "AUTH-010",
      category: "authority",
      severity: "high",
      title: "Upgrade entrypoints exist but no effective authorizer was derived",
      body: "If upgrade functions are externally reachable and the implementation provides no clear authorizer, reviewers cannot confidently tell who controls upgrades.",
      evidence: proposedContext.privilegedFunctions
        .filter((item) => item.kind === "upgrade")
        .map((item) => `Upgrade function: ${item.signature} | guard=${item.guard}`),
      recommendation: "Expose the authorizer clearly through `_authorizeUpgrade` or another well-documented guard path.",
      tags: ["authority", "upgrade"]
    });
  }

  for (const [signature, proposedFunction] of proposedFunctions.entries()) {
    const currentFunction = currentFunctions.get(signature);

    if (!currentFunction) {
      const isClearlyUnguarded =
        normalizedGuardModel(proposedFunction) === "none" || proposedFunction.guard === "none";
      const isUnknownHighRisk =
        normalizedGuardModel(proposedFunction) === "unknown" &&
        ["funds", "upgrade", "admin", "execution"].includes(proposedFunction.kind);

      if (isClearlyUnguarded || isUnknownHighRisk) {
        findings.push({
          id: authorityDeltaId("AUTH-004", signature),
          category: "authority",
          severity: "critical",
          title: "A new privileged function was introduced without meaningful access control",
          body: "New privileged entrypoints that move funds or reconfigure the system need strong guards. An unguarded path can become an instant exploit.",
          evidence: [
            `Function: ${signature}`,
            `Kind: ${proposedFunction.kind}`,
            `Guard: ${proposedFunction.guard}`,
            `Guard source: ${proposedFunction.guardSource ?? "unknown"}`
          ],
          recommendation: "Protect the new entrypoint with governance or role-based access control, then add regression tests for unauthorized callers.",
          tags: ["authority", proposedFunction.kind]
        });
      }

      if (
        !isClearlyUnguarded &&
        normalizedGuardModel(proposedFunction) !== "unknown" &&
        usesCustomGuardInference(proposedFunction)
      ) {
        findings.push({
          id: authorityDeltaId("AUTH-CUSTOM-GUARD", signature),
          category: "authority",
          severity: "medium",
          title: "A new privileged function uses a custom guard that should be reviewed manually",
          body: "This entrypoint is not unguarded, but its protection relies on a custom helper or authority path that was classified heuristically. Reviewers should confirm that the guard matches the intended control model.",
          evidence: [
            `Function: ${signature}`,
            `Kind: ${proposedFunction.kind}`,
            `Guard: ${proposedFunction.guard}`,
            `Guard source: ${proposedFunction.guardSource ?? "unknown"}`,
            `Guard model: ${normalizedGuardModel(proposedFunction) ?? "unknown"}`,
            `Guard confidence: ${proposedFunction.guardConfidence ?? "unknown"}`,
            `Custom helpers: ${(proposedFunction.guardHelpers ?? []).join(", ") || "none"}`
          ],
          recommendation: "Inspect the custom guard helper and add regression tests showing that unauthorized callers cannot reach the new privileged path.",
          tags: ["authority", proposedFunction.kind, "custom-guard"]
        });
      }

      if (proposedFunction.guardUsesTxOrigin && hasMeaningfulGuard(proposedFunction)) {
        findings.push({
          id: authorityDeltaId("AUTH-TXORIGIN", signature),
          category: "authority",
          severity: "high",
          title: "A privileged function now relies on `tx.origin` for authorization",
          body: "Using `tx.origin` in an authorization path makes security depend on the call chain rather than the immediate caller. That is risky for wrappers, relayers, and future integrations.",
          evidence: [
            `Function: ${signature}`,
            `Kind: ${proposedFunction.kind}`,
            `Guard: ${proposedFunction.guard}`,
            `Guard source: ${proposedFunction.guardSource ?? "unknown"}`
          ],
          recommendation: "Move the authorization check to `msg.sender` or a direct role lookup on the caller, then add tests for proxied and wrapped call paths.",
          tags: ["authority", proposedFunction.kind, "tx-origin"]
        });
      }

      continue;
    }

    if (
      hasMeaningfulGuard(currentFunction) &&
      hasMeaningfulGuard(proposedFunction) &&
      normalizedGuardModel(currentFunction) !== normalizedGuardModel(proposedFunction)
    ) {
      findings.push({
        id: authorityDeltaId("AUTH-MIGRATION", signature),
        category: "authority",
        severity: migrationSeverityForGuardChange(currentFunction, proposedFunction),
        title: "A privileged function changed authority model",
        body: "This path is still guarded, but the type of authority protecting it changed. That is a semantic control-plane migration and should be reviewed explicitly.",
        evidence: [
          `Function: ${signature}`,
          `Current guard: ${currentFunction.guard}`,
          `Current guard model: ${normalizedGuardModel(currentFunction) ?? "unknown"}`,
          `Proposed guard: ${proposedFunction.guard}`,
          `Proposed guard model: ${normalizedGuardModel(proposedFunction) ?? "unknown"}`
        ],
        recommendation: "Document why this function moved between owner, role, guardian, or governance control and verify that the new authority path matches the intended operating model.",
        tags: ["authority", currentFunction.kind, "migration"]
      });
    }

    if (proposedFunction.guardUsesTxOrigin && !currentFunction.guardUsesTxOrigin && hasMeaningfulGuard(proposedFunction)) {
      findings.push({
        id: authorityDeltaId("AUTH-TXORIGIN", signature),
        category: "authority",
        severity: "high",
        title: "A privileged function now relies on `tx.origin` for authorization",
        body: "Using `tx.origin` in an authorization path makes security depend on the call chain rather than the immediate caller. That is risky for wrappers, relayers, and future integrations.",
        evidence: [
          `Function: ${signature}`,
          `Current guard: ${currentFunction.guard}`,
          `Proposed guard: ${proposedFunction.guard}`,
          `Proposed guard source: ${proposedFunction.guardSource ?? "unknown"}`
        ],
        recommendation: "Move the authorization check to `msg.sender` or a direct role lookup on the caller, then add tests for proxied and wrapped call paths.",
        tags: ["authority", currentFunction.kind, "tx-origin"]
      });
    }

    if (guardStrengthFor(proposedFunction) < guardStrengthFor(currentFunction)) {
      findings.push({
        id: authorityDeltaId("AUTH-005", signature),
        category: "authority",
        severity: "high",
        title: "An existing privileged function now has weaker access control",
        body: "Guard regressions on existing privileged entrypoints can silently expand who is allowed to mutate critical state.",
        evidence: [
          `Function: ${signature}`,
          `Current guard: ${currentFunction.guard}`,
          `Proposed guard: ${proposedFunction.guard}`,
          `Current guard source: ${currentFunction.guardSource ?? "unknown"}`,
          `Proposed guard source: ${proposedFunction.guardSource ?? "unknown"}`
        ],
        recommendation: "Retain the previous guard strength or provide a governance rationale and extra controls around the change.",
        tags: ["authority", currentFunction.kind]
      });
    }
  }

  return findings;
}
