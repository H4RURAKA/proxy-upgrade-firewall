import path from "node:path";
import { loadFixturePair } from "./load-fixture.js";
import { loadCompilerContract } from "./load-compiler-contract.js";

function resolveCompilerSpec(options, side) {
  const buildInfoOption = side === "current" ? options.currentBuildInfo : options.proposedBuildInfo;
  const artifactOption = side === "current" ? options.currentArtifact : options.proposedArtifact;
  const contractOption = side === "current" ? options.currentContract : options.proposedContract;
  const selector = contractOption ?? options.contract ?? null;

  if (buildInfoOption) {
    return {
      mode: "build-info",
      path: buildInfoOption,
      contract: selector
    };
  }

  if (artifactOption) {
    return {
      mode: "artifact",
      path: artifactOption,
      contract: selector
    };
  }

  return null;
}

export async function loadComparisonPair(options) {
  if (options.fixture) {
    const fixtureDir = path.resolve(options.fixture);
    const pair = await loadFixturePair(fixtureDir);
    return {
      ...pair,
      inputMode: "fixture",
      inputs: [
        {
          label: "Fixture",
          mode: "fixture",
          contract: "fixture-pair",
          path: fixtureDir
        }
      ]
    };
  }

  const currentSpec = resolveCompilerSpec(options, "current");
  const proposedSpec = resolveCompilerSpec(options, "proposed");

  if (!currentSpec || !proposedSpec) {
    throw new Error(
      "Provide either --fixture <dir> or both current/proposed compiler-backed inputs (--current-build-info/--proposed-build-info or --current-artifact/--proposed-artifact)."
    );
  }

  const current = await loadCompilerContract(currentSpec);
  const proposed = await loadCompilerContract(proposedSpec);

  return {
    current,
    proposed,
    inputMode: "compiler-artifacts",
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
}

