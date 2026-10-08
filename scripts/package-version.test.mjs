import test from "node:test";
import assert from "node:assert/strict";
import { checkPackageVersions } from "./check-package-versions.mjs";

test("package check rejects marketplace plugin version drift", () => {
  const pkg = { version: "3.1.0" };
  const plugin = { version: "3.1.0" };
  const marketplace = {
    metadata: { version: "3.1.0" },
    version: "3.1.0",
    plugins: [{ version: "3.0.0" }],
  };
  const codexPlugin = { version: "3.1.0" };
  assert.throws(() => checkPackageVersions(pkg, plugin, marketplace, codexPlugin), /Package versions are inconsistent/);
});

test("package check rejects Codex plugin version drift", () => {
  const pkg = { version: "3.1.0" };
  const plugin = { version: "3.1.0" };
  const marketplace = {
    metadata: { version: "3.1.0" },
    version: "3.1.0",
    plugins: [{ version: "3.1.0" }],
  };
  assert.throws(
    () => checkPackageVersions(pkg, plugin, marketplace, { version: "3.0.0" }),
    /Package versions are inconsistent/,
  );
});
