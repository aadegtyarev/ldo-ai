export function checkPackageVersions(pkg, plugin, marketplace, codexPlugin) {
  const versions = [
    plugin.version,
    marketplace.metadata.version,
    marketplace.version,
    marketplace.plugins[0].version,
    codexPlugin.version,
  ];
  if (versions.some((version) => version !== pkg.version)) {
    throw new Error("Package versions are inconsistent");
  }
}
