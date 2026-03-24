import { parseArgs } from "./parse-args.js";
import { runCheckCommand } from "../commands/check.js";
import { runInspectCommand } from "../commands/inspect.js";

const HELP_TEXT = `Proxy Upgrade Firewall

Usage:
  node src/index.js check --fixture <dir> [--format markdown|json] [--output <file>] [--strict]
  node src/index.js check --current-build-info <file-or-dir> --proposed-build-info <file-or-dir> --contract <source:contract>
  node src/index.js check --current-artifact <file> --proposed-artifact <file>
  node src/index.js inspect --proxy <address> --rpc-url <url> [--format markdown|json] [--output <file>]

Commands:
  check     Analyze a current/proposed upgrade fixture.
  inspect   Read live proxy state from JSON-RPC.
  help      Show this message.
`;

export async function runCli(argv) {
  const { command, options } = parseArgs(argv);

  if (options.help || command === "help") {
    process.stdout.write(`${HELP_TEXT}\n`);
    return;
  }

  if (command === "check") {
    await runCheckCommand(options);
    return;
  }

  if (command === "inspect") {
    await runInspectCommand(options);
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}
