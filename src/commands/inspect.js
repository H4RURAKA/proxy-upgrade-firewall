import path from "node:path";
import { inspectProxy } from "../core/onchain-inspector.js";
import { renderInspectionMarkdown } from "../report/render-inspection-markdown.js";
import { renderJson } from "../report/render-json.js";
import { writeText } from "../utils/file-system.js";

export async function runInspectCommand(options) {
  if (!options.proxy) {
    throw new Error("Missing required --proxy <address> option.");
  }

  if (!options.rpcUrl) {
    throw new Error("Missing required --rpc-url <url> option.");
  }

  const report = await inspectProxy({
    proxyAddress: options.proxy,
    rpcUrl: options.rpcUrl
  });

  const format = options.format === "json" ? "json" : "markdown";
  const content = format === "json" ? renderJson(report) : renderInspectionMarkdown(report);

  if (options.output) {
    await writeText(path.resolve(options.output), content);
  }

  if (!options.silent) {
    process.stdout.write(content.endsWith("\n") ? content : `${content}\n`);
  }

  return report;
}

