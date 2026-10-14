export function checkMarketplaceMetadata(claudeMarketplace, codexMarketplace) {
  const claude = claudeMarketplace.plugins?.[0];
  const codex = codexMarketplace.plugins?.[0];
  if (claudeMarketplace.plugins?.length !== 1 || claudeMarketplace.name !== "ldo-ai" || claude?.name !== "ldo") {
    throw new Error("Invalid Claude marketplace identity");
  }
  if (claude?.source?.source !== "github" || claude.source.repo !== "aadegtyarev/ldo-ai") {
    throw new Error("Invalid Claude marketplace source");
  }
  if (codexMarketplace.plugins?.length !== 1 || codexMarketplace.$schema !== "https://agent-plugins.openai.com/marketplace.schema.json" || codexMarketplace.name !== "ldo-ai" || codex?.name !== "ldo-ai") {
    throw new Error("Invalid Codex marketplace schema or identity");
  }
  if (codex?.source?.source !== "local" || codex.source.path !== "./.codex-plugin") {
    throw new Error("Invalid Codex marketplace source");
  }
}
