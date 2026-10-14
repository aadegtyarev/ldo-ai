import test from "node:test";
import assert from "node:assert/strict";
import { checkMarketplaceMetadata } from "./check-marketplace-metadata.mjs";

const claude = {
  name: "ldo-ai",
  plugins: [{ name: "ldo", source: { source: "github", repo: "aadegtyarev/ldo-ai" } }],
};
const codex = {
  $schema: "https://agent-plugins.openai.com/marketplace.schema.json",
  name: "ldo-ai",
  plugins: [{ name: "ldo-ai", source: { source: "local", path: "./.codex-plugin" } }],
};

test("marketplace metadata preserves native identities, sources, and schema", () => {
  assert.doesNotThrow(() => checkMarketplaceMetadata(claude, codex));
});

test("marketplace metadata rejects Claude identity and source drift", () => {
  assert.throws(() => checkMarketplaceMetadata({ ...claude, name: "other" }, codex), /Claude marketplace identity/);
  assert.throws(() => checkMarketplaceMetadata({ ...claude, plugins: [{ ...claude.plugins[0], source: { source: "github", repo: "someone/else" } }] }, codex), /Claude marketplace source/);
  assert.throws(() => checkMarketplaceMetadata({ ...claude, plugins: [...claude.plugins, claude.plugins[0]] }, codex), /Claude marketplace identity/);
});

test("marketplace metadata rejects Codex schema, identity, and source drift", () => {
  assert.throws(() => checkMarketplaceMetadata(claude, { ...codex, $schema: "wrong" }), /Codex marketplace schema or identity/);
  assert.throws(() => checkMarketplaceMetadata(claude, { ...codex, name: "other" }), /Codex marketplace schema or identity/);
  assert.throws(() => checkMarketplaceMetadata(claude, { ...codex, plugins: [{ ...codex.plugins[0], source: { source: "local", path: "./elsewhere" } }] }), /Codex marketplace source/);
  assert.throws(() => checkMarketplaceMetadata(claude, { ...codex, plugins: [...codex.plugins, codex.plugins[0]] }), /Codex marketplace schema or identity/);
});
