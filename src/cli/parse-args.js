export function parseArgs(argv) {
  const [command = "help", ...rest] = argv;
  const options = {
    format: "markdown",
    strict: false,
    help: false,
    silent: false
  };

  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];

    if (arg === "--fixture") {
      options.fixture = rest[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--current-build-info") {
      options.currentBuildInfo = rest[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--proposed-build-info") {
      options.proposedBuildInfo = rest[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--current-artifact") {
      options.currentArtifact = rest[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--proposed-artifact") {
      options.proposedArtifact = rest[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--contract") {
      options.contract = rest[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--current-contract") {
      options.currentContract = rest[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--proposed-contract") {
      options.proposedContract = rest[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--output") {
      options.output = rest[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--proxy") {
      options.proxy = rest[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--rpc-url") {
      options.rpcUrl = rest[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--format") {
      options.format = rest[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--strict") {
      options.strict = true;
      continue;
    }

    if (arg === "--silent") {
      options.silent = true;
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return { command, options };
}
