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
