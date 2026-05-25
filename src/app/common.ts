export const API_BASE = '.';

export interface Table {
  name: string;
  size: number;
  payload: number;
  count: number;
}

export interface TablesResponse {
  tables: Table[];
  dbFileSizeBytes: number;
}

let cachedTablesResponse: TablesResponse | null = null;
let pendingTablesResponse: Promise<TablesResponse> | null = null;

export async function fetchTablesData(): Promise<TablesResponse> {
  if (cachedTablesResponse) {
    return cachedTablesResponse;
  }
  if (pendingTablesResponse) {
    return pendingTablesResponse;
  }

  pendingTablesResponse = fetchJson<TablesResponse>('/api/tables').then((response) => {
    cachedTablesResponse = response;
    pendingTablesResponse = null;
    return response;
  }).catch((error) => {
    pendingTablesResponse = null;
    throw error;
  });

  return pendingTablesResponse;
}

export interface Entity {
  entity: string;
  statesCount: number;
  attributesCount: number;
  attributesSizeBytes: number;
  statisticsCount: number;
  statsShortCount: number;
  estimatedSizeBytes: number;
}

export interface Attribute {
  sharedAttrs: string;
}

export interface LinkResponse {
  path: string;
}

export interface EntitiesTotalsResponse {
  totalCount: number;
  totalEstimatedSizeBytes: number;
}

export interface IntegrationSummary {
  integration: string;
  entityCount: number;
  estimatedSizeBytes: number;
}

export interface DomainSummary {
  domain: string;
  entityCount: number;
  estimatedSizeBytes: number;
}

export async function fetchJson<T = any>(url: string): Promise<T> {
  const response = await fetch(API_BASE + url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export function escapeHtml(text: string): string {
  const dom = (globalThis as any).document;
  if (!dom) {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  const div = dom.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

export function escapeAttr(text: string): string {
  return text.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export function formatSizeBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)}&nbsp;kB`;
  return `${(bytes / 1024 / 1024).toFixed(2)}&nbsp;MB`;
}

export function normalizeHomeAssistantLink(path: string): string {
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }

  const globalAny = globalThis as any;
  const location = globalAny.location;
  return location?.origin ? `${location.origin}${path}` : path;
}

export function closeModal(): void {
  document.querySelectorAll('.modal.active').forEach((modal) => {
    modal.classList.remove('active');
  });
}

export function closeYamlModal(): void {
  const modal = document.getElementById('yaml-modal');
  if (modal) {
    modal.classList.remove('active');
  }
}
