import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, access, writeFile, rm, symlink, readlink } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const installer = path.join(root, "scripts/install-codex.sh");
const roles = ["planner", "worker", "reviewer"];
const skills = ["ldo-ai-workflow", "ldo-ai-decomposition", "ldo-ai-security", "ldo-ai-validation", "ldo-ai-git-delivery"];

test("CODEX_HOME receives agents and skills in its native directories", async () => {
  const home = await mkdtemp(path.join(os.tmpdir(), "ldo-ai-codex-home-"));
  const codexHome = path.join(home, "codex-home");
  const run = (args = []) => spawnSync("sh", [installer, ...args], {
    encoding: "utf8", env: { ...process.env, HOME: home, CODEX_HOME: codexHome, PATH: "/usr/bin:/bin" },
  });
  try {
    const installed = run();
    assert.equal(installed.status, 0, installed.stderr);
    for (const role of roles) await access(path.join(codexHome, "agents", `ldo-ai-${role}.toml`));
    for (const skill of skills) await access(path.join(codexHome, "skills", skill, "SKILL.md"));
    const removed = run(["--uninstall"]);
    assert.equal(removed.status, 0, removed.stderr);
    await assert.rejects(access(path.join(codexHome, "agents", "ldo-ai-planner.toml")));
    await assert.rejects(access(path.join(codexHome, "skills", skills[0], "SKILL.md")));
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test("Codex skill collisions are fully preflighted before install or uninstall", async () => {
  const collisions = ["directory-live", "directory-dangling", "file-live", "file-dangling", "unowned-file", "entry-file"];
  for (const mode of ["install", "--uninstall"]) for (const collision of collisions) {
    const home = await mkdtemp(path.join(os.tmpdir(), "ldo-ai-skills-"));
    const agents = path.join(home, "agents");
    const skillRoot = path.join(home, "skills");
    const name = skills.at(-1);
    const directory = path.join(skillRoot, name);
    const skillFile = path.join(directory, "SKILL.md");
    await mkdir(agents, { recursive: true });
    await mkdir(skillRoot, { recursive: true });
    try {
      if (mode === "--uninstall") {
        for (const role of roles) await writeFile(path.join(agents, `ldo-ai-${role}.toml`), "# managed by ldo-ai\nowned\n");
        for (const skill of skills.slice(0, -1)) {
          await mkdir(path.join(skillRoot, skill), { recursive: true });
          await writeFile(path.join(skillRoot, skill, "SKILL.md"), "<!-- managed by ldo-ai -->\nowned\n");
        }
      }
      const linkTarget = path.join(home, collision.endsWith("dangling") ? "missing" : "live");
      if (collision.endsWith("live")) await writeFile(linkTarget, "preserve target\n");
      if (collision.startsWith("directory-")) await symlink(linkTarget, directory);
      else if (collision === "entry-file") await writeFile(directory, "not a directory\n");
      else {
        await mkdir(directory, { recursive: true });
        if (collision.startsWith("file-")) await symlink(linkTarget, skillFile);
        else await writeFile(skillFile, "user skill\n");
      }
      const result = spawnSync("sh", [installer, ...(mode === "install" ? [] : [mode]), agents], {
        encoding: "utf8", env: { ...process.env, PATH: "/usr/bin:/bin" },
      });
      assert.notEqual(result.status, 0, `${mode} accepted ${collision}`);
      if (collision.endsWith("live") || collision.endsWith("dangling")) {
        assert.equal(await readlink(collision.startsWith("directory-") ? directory : skillFile), linkTarget);
      }
      if (mode === "install") await assert.rejects(access(path.join(agents, "ldo-ai-planner.toml")));
      else {
        assert.equal(await readFile(path.join(agents, "ldo-ai-planner.toml"), "utf8"), "# managed by ldo-ai\nowned\n");
        assert.equal(await readFile(path.join(skillRoot, skills[0], "SKILL.md"), "utf8"), "<!-- managed by ldo-ai -->\nowned\n");
      }
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  }
});
