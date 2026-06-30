export const siteConfig = {
  name: "Black Relay Registry",
  domain: "registry.blackrelay.network",
  apiBase: import.meta.env.PUBLIC_REGISTRY_API_BASE ?? "https://api.blackrelay.network",
  description:
    "Search public EVE Frontier records from Black Relay Registry exports, with source, confidence and freshness context.",
  endpoints: {
    home: "https://blackrelay.network",
    api: "https://api.blackrelay.network",
    docs: "https://docs.blackrelay.network",
    status: "https://status.blackrelay.network",
    github: "https://github.com/blackrelay",
  },
} as const;

export const navItems = [
  { label: "HOME", href: siteConfig.endpoints.home },
  { label: "SEARCH", href: "#search" },
  { label: "FRESHNESS", href: "#ops" },
  { label: "DOCS", href: siteConfig.endpoints.docs },
] as const;

export const explorerRoutes = [
  { label: "All Entities", path: "/v1/search", kind: "entity", countKey: "entities" },
  { label: "Characters", path: "/v1/current/characters", kind: "entity", countKey: "current_characters" },
  { label: "Tribes", path: "/v1/current/tribes", kind: "entity", countKey: "current_tribes" },
  { label: "Systems", path: "/v1/current/systems", kind: "entity", countKey: "current_systems" },
  { label: "Regions", path: "/v1/current/regions", kind: "entity", countKey: "current_regions" },
  { label: "Constellations", path: "/v1/current/constellations", kind: "entity", countKey: "current_constellations" },
  { label: "Assemblies", path: "/v1/current/assemblies", kind: "entity", countKey: "current_assemblies" },
  { label: "Gates", path: "/v1/current/gates", kind: "entity", countKey: "current_gates" },
  { label: "Items", path: "/v1/current/items", kind: "entity", countKey: "current_items" },
  { label: "Materials", path: "/v1/current/materials", kind: "entity", countKey: "current_materials" },
  { label: "Enemies", path: "/v1/current/enemies", kind: "entity", countKey: "current_enemies" },
  { label: "Events", path: "/v1/events", kind: "event", countKey: "events" },
  { label: "Killmails", path: "/v1/killmails", kind: "killmail", countKey: "killmails" },
  { label: "Sources", path: "/v1/sources", kind: "source", countKey: "sources" },
] as const;
