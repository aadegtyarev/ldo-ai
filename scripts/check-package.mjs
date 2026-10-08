import { access, readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { checkPackageVersions } from "./check-package-versions.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const requiredRoles = ["planner", "worker", "reviewer"];
const requiredSkills = ["ldo-ai-workflow", "ldo-ai-decomposition", "ldo-ai-security", "ldo-ai-validation", "ldo-ai-git-delivery"];
const fail = (message) => { throw new Error(message); };
const checkSize = (label, text, maxBytes, maxLines) => {
  const bytes = Buffer.byteLength(text);
  const lines = text.split("\n").length;
  if (bytes > maxBytes || lines > maxLines) fail(`${label} exceeds prompt ceiling: ${bytes}/${maxBytes} bytes, ${lines}/${maxLines} lines`);
};
const exists = async (file) => access(path.join(root, file)).then(() => true, () => false);
const read = (file) => readFile(path.join(root, file), "utf8");

const pkg = JSON.parse(await read("package.json"));
const plugin = JSON.parse(await read(".claude-plugin/plugin.json"));
const marketplace = JSON.parse(await read(".claude-plugin/marketplace.json"));
if (pkg.name !== "ldo-ai" || plugin.name !== "ldo" || marketplace.name !== "ldo-ai") fail("Package metadata must retain ldo-ai identity");
checkPackageVersions(pkg, plugin, marketplace);
for (const [directory, extension] of [["agents", ".md"], ["codex/agents", ".toml"]]) {
  const actual = (await readdir(path.join(root, directory))).sort();
  const expected = requiredRoles.map((role) => `${role}${extension}`).sort();
  if (actual.join() !== expected.join()) fail(`Unexpected role files in ${directory}: ${actual.join(", ")}`);
}
const routing = {
  planner: ["ldo-ai-workflow"],
  worker: requiredSkills,
  reviewer: ["ldo-ai-validation", "ldo-ai-security", "ldo-ai-decomposition"],
};
for (const role of requiredRoles) {
  const markdown = await read(`agents/${role}.md`);
  const toml = await read(`codex/agents/${role}.toml`);
  if (!markdown.startsWith(`---\nname: ${role}\n`) || !markdown.includes("description:")) fail(`Invalid Claude agent: ${role}`);
  if (!toml.includes(`# managed by ldo-ai\nname = "ldo-ai-${role}"`) || !toml.includes("developer_instructions = \"\"\"")) fail(`Invalid Codex agent: ${role}`);
  for (const skill of routing[role]) {
    if (!markdown.includes(skill) || !toml.includes(skill)) fail(`${role} does not route to ${skill} on both hosts`);
  }
  checkSize(`Claude ${role}`, markdown, 2400, 100);
  checkSize(`Codex ${role}`, toml, 2400, 100);
}
const skillDirs = (await readdir(path.join(root, "skills"))).sort();
if (skillDirs.join() !== [...requiredSkills].sort().join()) fail(`Unexpected native skill set: ${skillDirs.join(", ")}`);
for (const skill of requiredSkills) {
  const files = await readdir(path.join(root, "skills", skill));
  const content = await read(`skills/${skill}/SKILL.md`);
  if (files.join() !== "SKILL.md" || !content.startsWith(`---\nname: ${skill}\n`) || !content.includes("description:") || !content.includes("<!-- managed by ldo-ai -->")) fail(`Invalid or unowned native skill: ${skill}`);
  checkSize(skill, content, 6000, 100);
}
checkSize("always-loaded instructions", await read("AGENTS.md") + await read("CLAUDE.md"), 2400, 100);
for (const obsolete of ["workflows/ldo.js", "core/pipeline.mjs", "adapters", "schemas", "scripts/ldo-run.mjs"]) {
  if (await exists(obsolete)) fail(`Legacy custom runtime remains: ${obsolete}`);
}
const readme = await read("README.md");
for (const text of ["incompatible reset", "Claude Code", "Codex", "install-codex.sh", "native skills", "No legacy LDO workflow or configuration compatibility"]) {
  if (!readme.toLowerCase().includes(text.toLowerCase())) fail(`README is missing required explanation: ${text}`);
}
console.log("Package structure and native-agent metadata are valid; no legacy runtime paths remain.");
