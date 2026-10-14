import test from "node:test";
import assert from "node:assert/strict";
import { cp, mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const roles = ["planner", "worker", "reviewer"];
const skills = ["ldo-ai-workflow", "ldo-ai-decomposition", "ldo-ai-security", "ldo-ai-validation", "ldo-ai-git-delivery"];

test("native Claude marketplace installs, updates, and removes isolated plugin state", async (t) => {
  const cli = process.env.CLAUDE_CLI || "claude";
  const temp = await mkdtemp(path.join(os.tmpdir(), "ldo-ai-claude-plugin-"));
  try {
    const home = path.join(temp, "home");
    const config = path.join(home, ".claude");
    const checkout = path.join(temp, "checkout");
    await mkdir(config, { recursive: true });
    const env = { ...process.env, HOME: home, CLAUDE_CONFIG_DIR: config };
    const version = spawnSync(cli, ["--version"], { encoding: "utf8", env });
    if (version.error?.code === "ENOENT") return t.skip("Claude CLI is not installed");
    assert.equal(version.status, 0, `Claude CLI unavailable: ${version.stderr}`);
    await cp(path.join(root, ".claude-plugin"), path.join(checkout, ".claude-plugin"), { recursive: true });
    await cp(path.join(root, "agents"), path.join(checkout, "agents"), { recursive: true });
    await cp(path.join(root, "skills"), path.join(checkout, "skills"), { recursive: true });
    await writeFile(path.join(temp, "sentinel"), "preserve\n");
    const run = (args) => {
      const result = spawnSync(cli, args, { encoding: "utf8", env });
      assert.equal(result.status, 0, `${args.join(" ")} failed: ${result.stderr}`);
      return `${result.stdout}\n${result.stderr}`;
    };
    const manifestFile = path.join(checkout, ".claude-plugin/marketplace.json");
    const manifest = JSON.parse(await readFile(manifestFile, "utf8"));
    const pluginManifest = path.join(checkout, ".claude-plugin/plugin.json");
    const plugin = JSON.parse(await readFile(pluginManifest, "utf8"));
    const originalVersion = plugin.version;
    const bumpedVersion = originalVersion.replace(/\d+$/, (patch) => String(Number(patch) + 1));
    assert.notEqual(bumpedVersion, originalVersion, "Plugin version must have a numeric patch component");
    assert.equal(manifest.version, originalVersion);
    assert.equal(manifest.metadata.version, originalVersion);
    assert.equal(manifest.plugins[0].version, originalVersion);
    manifest.plugins[0].source = "./";
    await writeFile(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);
    run(["plugin", "marketplace", "add", checkout]);
    assert.match(run(["plugin", "marketplace", "list"]), /ldo-ai/);
    run(["plugin", "install", "ldo@ldo-ai"]);
    assert.match(run(["plugin", "list"]), /ldo/);
    const pluginPath = path.join(config, "plugins/cache/ldo-ai/ldo", originalVersion);
    assert.deepEqual((await readdir(path.join(pluginPath, "agents"))).sort(), roles.map((role) => `${role}.md`).sort());
    assert.deepEqual((await readdir(path.join(pluginPath, "skills"))).sort(), [...skills].sort());
    plugin.version = bumpedVersion;
    await writeFile(pluginManifest, `${JSON.stringify(plugin, null, 2)}\n`);
    manifest.version = bumpedVersion;
    manifest.metadata.version = bumpedVersion;
    manifest.plugins[0].version = bumpedVersion;
    await writeFile(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);
    run(["plugin", "marketplace", "update", "ldo-ai"]);
    run(["plugin", "update", "ldo@ldo-ai"]);
    assert.ok(run(["plugin", "list"]).includes(bumpedVersion), `Updated plugin version ${bumpedVersion} missing from inventory`);
    run(["plugin", "uninstall", "ldo@ldo-ai"]);
    assert.doesNotMatch(run(["plugin", "list"]), /ldo@ldo-ai/);
    run(["plugin", "marketplace", "remove", "ldo-ai"]);
    assert.doesNotMatch(run(["plugin", "marketplace", "list"]), /ldo-ai/);
    assert.equal(await readFile(path.join(temp, "sentinel"), "utf8"), "preserve\n");
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});
