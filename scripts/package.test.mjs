import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, access, writeFile, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const installer = path.join(root, "scripts/install-codex.sh");
const roles = ["planner", "worker", "reviewer"];

 test("Codex install and update touch only package-owned agent files", async () => {
  const targetRoot = await mkdtemp(path.join(os.tmpdir(), "ldo-ai-install-"));
  const target = path.join(targetRoot, "agents");
  await mkdir(target, { recursive: true });
  await writeFile(path.join(target, "custom.toml"), "keep custom agent\n");
  await writeFile(path.join(target, "AGENTS.md"), "keep user instructions\n");
  const collision = path.join(target, "ldo-ai-reviewer.toml");
  await writeFile(collision, "user-owned file\n");
  try {
    const run = (args) => spawnSync("sh", [installer, ...args, target], {
      encoding: "utf8", env: { ...process.env, PATH: "/usr/bin:/bin" },
    });
    const rejected = run([]);
    assert.notEqual(rejected.status, 0);
    assert.equal(await readFile(collision, "utf8"), "user-owned file\n");
    await assert.rejects(access(path.join(target, "ldo-ai-planner.toml")));
    await rm(collision);
    const first = run([]);
    assert.equal(first.status, 0, first.stderr);
    for (const role of roles) await access(path.join(target, `ldo-ai-${role}.toml`));
    assert.equal(await readFile(path.join(target, "custom.toml"), "utf8"), "keep custom agent\n");
    assert.equal(await readFile(path.join(target, "AGENTS.md"), "utf8"), "keep user instructions\n");
    const update = run([]);
    assert.equal(update.status, 0, update.stderr);
    const editedAgent = path.join(target, "ldo-ai-worker.toml");
    await writeFile(editedAgent, "user-edited agent\n");
    const refusedRemove = run(["--uninstall"]);
    assert.notEqual(refusedRemove.status, 0);
    assert.equal(await readFile(editedAgent, "utf8"), "user-edited agent\n");
    await access(path.join(target, "ldo-ai-planner.toml"));
    await rm(editedAgent);
    const repair = run([]);
    assert.equal(repair.status, 0, repair.stderr);
    const remove = run(["--uninstall"]);
    assert.equal(remove.status, 0, remove.stderr);
    for (const role of roles) await assert.rejects(access(path.join(target, `ldo-ai-${role}.toml`)));
    assert.equal(await readFile(path.join(target, "custom.toml"), "utf8"), "keep custom agent\n");
    assert.equal(await readFile(path.join(target, "AGENTS.md"), "utf8"), "keep user instructions\n");
  } finally {
    await rm(targetRoot, { recursive: true, force: true });
  }
});
