import fs from 'fs';
import path from 'path';

export interface EntityRegistryEntry {
  entity_id: string;
  platform?: string;
  [key: string]: any;
}

export interface RegistrySummaryItem {
  id: string;
  entityIds: string[];
  entityCount: number;
}

const ENTITY_REGISTRY_CANDIDATE_PATHS = [
  '/data/.storage/core.entity_registry',
  '/data/core.entity_registry',
  '/data/entity_registry.json',
  '/config/.storage/core.entity_registry',
  path.join(process.cwd(), 'data', '.storage', 'core.entity_registry'),
  path.join(process.cwd(), 'data', 'core.entity_registry'),
  path.join(process.cwd(), 'data', 'entity_registry.json'),
  path.join(process.cwd(), '.storage', 'core.entity_registry'),
  path.join(process.cwd(), 'core.entity_registry'),
  path.join(process.cwd(), 'entity_registry.json')
];

export function locateEntityRegistry(): string | null {
  return ENTITY_REGISTRY_CANDIDATE_PATHS.find((p) => fs.existsSync(p)) || null;
}

export function loadEntityRegistryEntries(registryPath: string): EntityRegistryEntry[] {
  try {
    const content = fs.readFileSync(registryPath, 'utf8');
    const registry = JSON.parse(content);
    const entries = Array.isArray(registry?.data?.entities)
      ? registry.data.entities
      : Array.isArray(registry?.entities)
        ? registry.entities
        : [];
    return entries.filter((entry: any) => entry && typeof entry.entity_id === 'string');
  } catch (error) {
    console.warn('Unable to load entity registry:', error);
    return [];
  }
}

function normalizePlatform(platform: unknown): string {
  return typeof platform === 'string' && platform.trim() ? platform : 'unknown';
}

export function summarizeRegistryByPlatform(entries: EntityRegistryEntry[]): RegistrySummaryItem[] {
  const map = new Map<string, string[]>();
  for (const entry of entries) {
    const platform = normalizePlatform(entry.platform);
    const list = map.get(platform) || [];
    list.push(entry.entity_id);
    map.set(platform, list);
  }
  return Array.from(map.entries())
    .map(([id, entityIds]) => ({ id, entityIds, entityCount: entityIds.length }))
    .sort((a, b) => b.entityCount - a.entityCount || a.id.localeCompare(b.id));
}

export function summarizeRegistryByDomain(entries: EntityRegistryEntry[]): RegistrySummaryItem[] {
  const map = new Map<string, string[]>();
  for (const entry of entries) {
    const parts = entry.entity_id.split('.');
    const domain = parts.length > 1 && parts[0].trim() ? parts[0] : 'unknown';
    const list = map.get(domain) || [];
    list.push(entry.entity_id);
    map.set(domain, list);
  }
  return Array.from(map.entries())
    .map(([id, entityIds]) => ({ id, entityIds, entityCount: entityIds.length }))
    .sort((a, b) => b.entityCount - a.entityCount || a.id.localeCompare(b.id));
}

export function getEntitiesForIntegration(entries: EntityRegistryEntry[], integration: string): string[] {
  if (!integration || typeof integration !== 'string') return [];
  const lowerIntegration = integration.toLowerCase().trim();
  const ids = new Set<string>();
  for (const entry of entries) {
    if (typeof entry.platform === 'string' && entry.platform.toLowerCase().trim() === lowerIntegration) {
      ids.add(entry.entity_id);
    }
  }
  return Array.from(ids);
}

export function getEntitiesForDomain(entries: EntityRegistryEntry[], domain: string): string[] {
  if (!domain || typeof domain !== 'string') return [];
  const normalizedDomain = domain.toLowerCase().trim();
  const ids = new Set<string>();
  for (const entry of entries) {
    const parts = entry.entity_id.split('.');
    if (parts.length > 1 && parts[0].toLowerCase() === normalizedDomain) {
      ids.add(entry.entity_id);
    }
  }
  return Array.from(ids);
}

export function intersectEntityIds(first: string[], second: string[]): string[] {
  if (!first.length) return second.slice();
  if (!second.length) return first.slice();
  const set = new Set(second);
  return first.filter((id) => set.has(id));
}
