const fs = require("node:fs");
const solc = require("solc");

const input = fs.readFileSync(0, "utf8");
const requestedVersion = process.env.SOLC_VERSION;

if (!requestedVersion) {
  console.error("Missing SOLC_VERSION environment variable.");
  process.exit(1);
}

const remoteVersion = requestedVersion.startsWith("v")
  ? requestedVersion
  : `v${requestedVersion}`;

solc.loadRemoteVersion(remoteVersion, (error, compiler) => {
  if (error) {
    console.error(error.message || String(error));
    process.exit(1);
    return;
  }

  try {
    const output = compiler.compile(input);
    process.stdout.write(output);
  } catch (compileError) {
    console.error(compileError?.stack || compileError?.message || String(compileError));
    process.exit(1);
  }
});
