function guardStrength(guard = "") {
  if (guard.includes("Timelock")) {
    return 5;
  }

  if (guard.includes("Safe")) {
    return 4;
  }

  if (guard.startsWith("onlyRole(")) {
    return 3;
  }

  if (guard === "onlyOwner") {
    return 2;
  }

  if (guard === "none") {
    return 0;
  }

  return 1;
}

function joinPath(controllerPath = []) {
  return controllerPath.join(" -> ");
}

export function analyzeAuthorityDiff(current, proposed) {
  const findings = [];
  const currentGovernance = current.governance ?? {};
  const proposedGovernance = proposed.governance ?? {};
  const currentFunctions = new Map((current.privilegedFunctions ?? []).map((item) => [item.signature, item]));
  const proposedFunctions = new Map((proposed.privilegedFunctions ?? []).map((item) => [item.signature, item]));
  let weakenedGuardCount = 0;

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

  if (guardStrength(proposedGovernance.upgradeAuthorizer) < guardStrength(currentGovernance.upgradeAuthorizer)) {
    findings.push({
      id: "AUTH-003",
      category: "authority",
      severity: "high",
      title: "The implementation upgrade authorizer became weaker",
      body: "A weaker `_authorizeUpgrade` path increases the chance that an unintended signer can change the implementation.",
      evidence: [
        `Current authorizer: ${currentGovernance.upgradeAuthorizer}`,
        `Proposed authorizer: ${proposedGovernance.upgradeAuthorizer}`
      ],
      recommendation: "Preserve or strengthen the existing authorizer and keep upgrade rights behind role-based or governance-controlled paths.",
      tags: ["authority", "upgrade"]
    });
  }

  for (const [signature, proposedFunction] of proposedFunctions.entries()) {
    const currentFunction = currentFunctions.get(signature);

    if (!currentFunction) {
      if (guardStrength(proposedFunction.guard) <= 1) {
        findings.push({
          id: "AUTH-004",
          category: "authority",
          severity: "critical",
          title: "A new privileged function was introduced without meaningful access control",
          body: "New privileged entrypoints that move funds or reconfigure the system need strong guards. An unguarded path can become an instant exploit.",
          evidence: [
            `Function: ${signature}`,
            `Kind: ${proposedFunction.kind}`,
            `Guard: ${proposedFunction.guard}`
          ],
          recommendation: "Protect the new entrypoint with governance or role-based access control, then add regression tests for unauthorized callers.",
          tags: ["authority", proposedFunction.kind]
        });
      }

      continue;
    }

    if (guardStrength(proposedFunction.guard) < guardStrength(currentFunction.guard)) {
      weakenedGuardCount += 1;
      findings.push({
        id: `AUTH-005-${weakenedGuardCount}`,
        category: "authority",
        severity: "high",
        title: "An existing privileged function now has weaker access control",
        body: "Guard regressions on existing privileged entrypoints can silently expand who is allowed to mutate critical state.",
        evidence: [
          `Function: ${signature}`,
          `Current guard: ${currentFunction.guard}`,
          `Proposed guard: ${proposedFunction.guard}`
        ],
        recommendation: "Retain the previous guard strength or provide a governance rationale and extra controls around the change.",
        tags: ["authority", currentFunction.kind]
      });
    }
  }

  return findings;
}
