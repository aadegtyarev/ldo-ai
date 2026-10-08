import test from "node:test";
import assert from "node:assert/strict";
import { access, cp, mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const roles = ["planner", "worker", "reviewer"];
const skills = ["ldo-ai-workflow", "ldo-ai-decomposition", "ldo-ai-security", "ldo-ai-validation", "ldo-ai-git-delivery"];

test("native Codex marketplace installs and removes only its plugin state", async (t) => {
  const cli = process.env.CODEX_CLI || "codex";
  const version = spawnSync(cli, ["--version"], { encoding: "utf8" });
  if (version.status !== 0) return t.skip("Codex CLI is not installed");
  const home = await mkdtemp(path.join(os.tmpdir(), "ldo-ai-codex-plugin-"));
  const checkout = path.join(home, "checkout");
  await mkdir(checkout);
  await cp(path.join(root, ".agents"), path.join(checkout, ".agents"), { recursive: true });
  await cp(path.join(root, ".codex-plugin"), path.join(checkout, ".codex-plugin"), { recursive: true });
  const unrelated = path.join(home, "unrelated-state");
  await writeFile(path.join(home, "config.toml"), 'sentinel = "preserve"\n');
  await writeFile(unrelated, "keep user state\n");
  const run = (args) => {
    const result = spawnSync(cli, args, { encoding: "utf8", env: { ...process.env, CODEX_HOME: home } });
    assert.equal(result.status, 0, `${args.join(" ")} failed: ${result.stderr}`);
    return result.stdout ? JSON.parse(result.stdout) : {};
  };
  try {
    const added = run(["plugin", "marketplace", "add", checkout, "--json"]);
    assert.equal(added.marketplaceName, "ldo-ai");
    const marketplaces = run(["plugin", "marketplace", "list", "--json"]).marketplaces;
    assert.equal(marketplaces.find((item) => item.name === "ldo-ai").root, checkout);
    const available = run(["plugin", "list", "--available", "--json"]).available;
    assert.equal(available[0].pluginId, "ldo-ai@ldo-ai");
    assert.equal(available[0].source.path, path.join(checkout, ".codex-plugin"));
    const installed = run(["plugin", "add", "ldo-ai@ldo-ai", "--json"]);
    const pluginRoot = installed.installedPath;
    const inventory = run(["plugin", "list", "--json"]).installed;
    assert.equal(inventory[0].pluginId, "ldo-ai@ldo-ai");
    assert.equal((await readdir(path.join(pluginRoot, "agents"))).sort().join(), roles.map((role) => `${role}.toml`).sort().join());
    assert.equal((await readdir(path.join(pluginRoot, "skills"))).sort().join(), [...skills].sort().join());
    for (const role of roles) {
      const file = `agents/${role}.toml`;
      assert.equal(await readFile(path.join(pluginRoot, file), "utf8"), await readFile(path.join(checkout, ".codex-plugin", file), "utf8"));
    }
    for (const skill of skills) {
      const file = `skills/${skill}/SKILL.md`;
      assert.equal(await readFile(path.join(pluginRoot, file), "utf8"), await readFile(path.join(checkout, ".codex-plugin", file), "utf8"));
    }
    const manifest = path.join(checkout, ".codex-plugin/plugin.json");
    await writeFile(manifest, (await readFile(manifest, "utf8")).replace('"version": "3.1.0"', '"version": "3.1.1"'));
    assert.equal(run(["plugin", "add", "ldo-ai@ldo-ai", "--json"]).version, "3.1.1");
    assert.equal(run(["plugin", "list", "--json"]).installed[0].version, "3.1.1");
    assert.match(await readFile(path.join(home, "config.toml"), "utf8"), /sentinel = "preserve"/);
    assert.equal(await readFile(unrelated, "utf8"), "keep user state\n");
    run(["plugin", "remove", "ldo-ai@ldo-ai", "--json"]);
    assert.equal(run(["plugin", "list", "--json"]).installed.length, 0);
    run(["plugin", "marketplace", "remove", "ldo-ai", "--json"]);
    assert.equal(run(["plugin", "marketplace", "list", "--json"]).marketplaces.length, 0);
    assert.equal(await readFile(unrelated, "utf8"), "keep user state\n");
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});
