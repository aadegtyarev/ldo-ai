import { access, readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const requiredRoles = ["planner", "worker", "reviewer"];
const fail = (message) => { throw new Error(message); };
const exists = async (file) => access(path.join(root, file)).then(() => true, () => false);
const read = (file) => readFile(path.join(root, file), "utf8");

const pkg = JSON.parse(await read("package.json"));
const plugin = JSON.parse(await read(".claude-plugin/plugin.json"));
const marketplace = JSON.parse(await read(".claude-plugin/marketplace.json"));
if (pkg.name !== "ldo-ai" || plugin.name !== "ldo" || marketplace.name !== "ldo-ai") fail("Package metadata must retain ldo-ai identity");
if (pkg.version !== plugin.version || pkg.version !== marketplace.version || pkg.version !== marketplace.metadata.version) fail("Package versions are inconsistent");
for (const [directory, extension] of [["agents", ".md"], ["codex/agents", ".toml"]]) {
  const actual = (await readdir(path.join(root, directory))).sort();
  const expected = requiredRoles.map((role) => `${role}${extension}`).sort();
  if (actual.join() !== expected.join()) fail(`Unexpected role files in ${directory}: ${actual.join(", ")}`);
}
for (const role of requiredRoles) {
  const markdown = await read(`agents/${role}.md`);
  const toml = await read(`codex/agents/${role}.toml`);
  if (!markdown.startsWith(`---\nname: ${role}\n`) || !markdown.includes("description:")) fail(`Invalid Claude agent: ${role}`);
  if (!toml.includes(`# managed by ldo-ai\nname = "ldo-ai-${role}"`) || !toml.includes("developer_instructions = \"\"\"")) fail(`Invalid Codex agent: ${role}`);
}
for (const obsolete of ["workflows/ldo.js", "core/pipeline.mjs", "adapters", "schemas", "skills", "scripts/ldo-run.mjs"]) {
  if (await exists(obsolete)) fail(`Legacy custom runtime remains: ${obsolete}`);
}
const readme = await read("README.md");
for (const text of ["incompatible reset", "Claude Code", "Codex", "install-codex.sh", "No legacy LDO workflow or configuration compatibility"]) {
  if (!readme.toLowerCase().includes(text.toLowerCase())) fail(`README is missing required explanation: ${text}`);
}
console.log("Package structure and native-agent metadata are valid; no legacy runtime paths remain.");
