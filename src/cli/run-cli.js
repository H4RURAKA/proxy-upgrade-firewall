import { parseArgs } from "./parse-args.js";
import { runCheckCommand } from "../commands/check.js";

const HELP_TEXT = `Proxy Upgrade Firewall

Usage:
  node src/index.js check --fixture <dir> [--format markdown|json] [--output <file>] [--strict]

Commands:
  check    Analyze a current/proposed upgrade fixture.
  help     Show this message.
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

  throw new Error(`Unknown command: ${command}`);
}
