export const siteConfig = {
  name: "Black Relay Registry",
  domain: "registry.blackrelay.network",
  apiBase: import.meta.env.PUBLIC_REGISTRY_API_BASE ?? "https://api.blackrelay.network",
  description:
    "A source-aware public explorer for Black Relay Registry data, provenance, events and operations state.",
  endpoints: {
    home: "https://blackrelay.network",
    api: "https://api.blackrelay.network",
    docs: "https://docs.blackrelay.network",
    status: "https://status.blackrelay.network",
    github: "https://github.com/blackrelay",
  },
} as const;

export const navItems = [
  { label: "SEARCH", href: "#search" },
  { label: "COLLECTIONS", href: "#collections" },
  { label: "OPS", href: "#ops" },
  { label: "API DOCS", href: siteConfig.endpoints.docs },
] as const;

export const explorerRoutes = [
  { label: "All Entities", path: "/v1/search", kind: "entity", countKey: "entities" },
  { label: "Characters", path: "/v1/current/characters", kind: "entity", countKey: "current_characters" },
  { label: "Tribes", path: "/v1/current/tribes", kind: "entity", countKey: "current_tribes" },
  { label: "Systems", path: "/v1/current/systems", kind: "entity", countKey: "current_systems" },
  { label: "Assemblies", path: "/v1/current/assemblies", kind: "entity", countKey: "current_assemblies" },
  { label: "Gates", path: "/v1/current/gates", kind: "entity", countKey: "current_gates" },
  { label: "Items", path: "/v1/current/items", kind: "entity", countKey: "current_items" },
  { label: "Materials", path: "/v1/current/materials", kind: "entity", countKey: "current_materials" },
  { label: "Enemies", path: "/v1/current/enemies", kind: "entity", countKey: "current_enemies" },
  { label: "Recipes", path: "/v1/current/recipes", kind: "entity", countKey: "current_recipes" },
  { label: "Blueprints", path: "/v1/current/blueprints", kind: "entity", countKey: "current_blueprints" },
  { label: "Events", path: "/v1/events", kind: "event", countKey: "events" },
  { label: "Killmails", path: "/v1/killmails", kind: "killmail", countKey: "killmails" },
  { label: "Sources", path: "/v1/sources", kind: "source", countKey: "sources" },
] as const;

export const collectionCards = [
  ["Characters", "/v1/current/characters", "Public character records, activity and tribe evidence."],
  ["Tribes", "/v1/current/tribes", "Public tribe identity and profile evidence where available."],
  ["Systems", "/v1/current/systems", "Static-client system records and route context."],
  ["Assemblies", "/v1/current/assemblies", "Smart Assembly and infrastructure records."],
  ["Gates", "/v1/current/gates", "Public gate records and route evidence."],
  ["Killmails", "/v1/killmails", "Semantic combat records with raw evidence where available."],
  ["Events", "/v1/events", "On-chain event rows indexed from Registry exports."],
  ["Sources", "/v1/sources", "Sources, snapshots and evidence links."],
] as const;
