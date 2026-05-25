import { API_BASE, fetchJson, escapeHtml, escapeAttr, formatSizeBytes, normalizeHomeAssistantLink, fetchTablesData } from './common.js';
import { Entity, EntitiesTotalsResponse, TablesResponse } from './common.js';

export type EntitySortKey = 'entity' | 'statesCount' | 'attributesCount' | 'attributesSizeBytes' | 'statisticsCount' | 'statsShortCount' | 'estimatedSizeBytes';
export type EntitySortOrder = 'asc' | 'desc';

export interface EntityFetchArgs {
  limit: number;
  offset: number;
  filter: string;
  sortBy: EntitySortKey;
  order: EntitySortOrder;
  integration: string;
  domain: string;
}

const selectedEntities = new Set<string>();

// Global caches independent of filters
let cachedGlobalTotals: EntitiesTotalsResponse | null = null;
let cachedDataSize: number | null = null;

interface FilteredEntitiesCache {
  entities: Entity[];
  totals: {
    totalCount: number;
    totalEstimatedSizeBytes: number;
  };
}
const cachedFilteredEntities = new Map<string, FilteredEntitiesCache>();
const cachedTotalsByFilter = new Map<string, { totalCount: number; totalEstimatedSizeBytes: number }>();
const pendingEntityLoads = new Map<string, Promise<Entity[]>>();
const pendingTotalsLoads = new Map<string, Promise<{ totalCount: number; totalEstimatedSizeBytes: number }>>();
let pendingGlobalTotals: Promise<EntitiesTotalsResponse> | null = null;

function getFilteredEntitiesCacheKey(args: EntityFetchArgs): string {
  return `${args.limit}|${args.offset}|${args.filter.toLowerCase()}|${args.sortBy}|${args.order}|${args.integration}|${args.domain}`;
}

function getTotalsCacheKey(args: EntityFetchArgs): string {
  return `${args.filter.trim().toLowerCase()}|${args.integration}|${args.domain}`;
}

async function fetchEntitiesListCached(args: EntityFetchArgs): Promise<Entity[]> {
  const cacheKey = getFilteredEntitiesCacheKey(args);
  const cachedResult = cachedFilteredEntities.get(cacheKey);
  if (cachedResult) {
    return cachedResult.entities;
  }

  const pending = pendingEntityLoads.get(cacheKey);
  if (pending) {
    return pending;
  }

  const promise = fetchEntitiesList(args).then((entities) => {
    pendingEntityLoads.delete(cacheKey);
    return entities;
  }).catch((error) => {
    pendingEntityLoads.delete(cacheKey);
    throw error;
  });

  pendingEntityLoads.set(cacheKey, promise);
  return promise;
}

async function fetchTotalsCached(args: EntityFetchArgs): Promise<{ totalCount: number; totalEstimatedSizeBytes: number }> {
  const normalizedFilter = args.filter.trim();
  const totalsKey = getTotalsCacheKey(args);
  const cachedTotals = cachedTotalsByFilter.get(totalsKey);
  if (cachedTotals) {
    return cachedTotals;
  }

  const isGlobalQuery = normalizedFilter === '' && !args.integration && !args.domain;
  if (isGlobalQuery && cachedGlobalTotals) {
    const totals = { totalCount: cachedGlobalTotals.totalCount, totalEstimatedSizeBytes: cachedGlobalTotals.totalEstimatedSizeBytes };
    cachedTotalsByFilter.set(totalsKey, totals);
    return totals;
  }

  const pending = pendingTotalsLoads.get(totalsKey);
  if (pending) {
    return pending;
  }

  const fetchPromise = async () => {
    if (isGlobalQuery && pendingGlobalTotals) {
      const globalTotals = await pendingGlobalTotals;
      const totals = { totalCount: globalTotals.totalCount, totalEstimatedSizeBytes: globalTotals.totalEstimatedSizeBytes };
      cachedTotalsByFilter.set(totalsKey, totals);
      return totals;
    }

    const totalsPromise = fetchJson<EntitiesTotalsResponse>(
      `/api/entities/totals?filter=${encodeURIComponent(normalizedFilter)}` +
        (args.integration ? `&integration=${encodeURIComponent(args.integration)}` : '') +
        (args.domain ? `&domain=${encodeURIComponent(args.domain)}` : ''),
    );

    if (isGlobalQuery) {
      pendingGlobalTotals = totalsPromise;
    }

    const totals = await totalsPromise;
    pendingTotalsLoads.delete(totalsKey);
    cachedTotalsByFilter.set(totalsKey, totals);
    if (isGlobalQuery) {
      cachedGlobalTotals = totals;
      pendingGlobalTotals = null;
    }
    return totals;
  };

  const totalsPromise = fetchPromise().catch((error) => {
    pendingTotalsLoads.delete(totalsKey);
    if (isGlobalQuery) {
      pendingGlobalTotals = null;
    }
    throw error;
  });

  pendingTotalsLoads.set(totalsKey, totalsPromise);
  return totalsPromise;
}

export async function fetchEntitiesData(args: EntityFetchArgs): Promise<{ entities: Entity[]; totals: EntitiesTotalsResponse; totalDataSize: number }> {
  const limitQuery = args.limit > 0 ? args.limit + 1 : 0;
  const offset = args.offset;
  const query = `?limit=${limitQuery}&offset=${offset}&filter=${encodeURIComponent(args.filter)}&sort_by=${encodeURIComponent(args.sortBy)}&order=${encodeURIComponent(args.order)}` +
    (args.integration ? `&integration=${encodeURIComponent(args.integration)}` : '') +
    (args.domain ? `&domain=${encodeURIComponent(args.domain)}` : '');
  const totalsQuery = `?filter=${encodeURIComponent(args.filter)}` +
    (args.integration ? `&integration=${encodeURIComponent(args.integration)}` : '') +
    (args.domain ? `&domain=${encodeURIComponent(args.domain)}` : '');

  const [entities, tablesResponse, totals] = await Promise.all([
    fetchJson<Entity[]>(`/api/entities/summary${query}`),
    fetchTablesData(),
    fetchJson<EntitiesTotalsResponse>(`/api/entities/totals${totalsQuery}`),
  ]);

  const totalSize = tablesResponse.tables.reduce((sum, row) => sum + (row.size || 0), 0);
  const indexSize = tablesResponse.tables.find((t) => t.name === '*Indexes*')?.size || 0;
  const sqliteSize = tablesResponse.tables.find((t) => t.name === '*SQLite*')?.size || 0;
  const totalDataSize = totalSize - indexSize - sqliteSize;

  return {
    entities,
    totals,
    totalDataSize,
  };
}

export async function fetchEntitiesList(args: EntityFetchArgs): Promise<Entity[]> {
  const limitQuery = args.limit > 0 ? args.limit + 1 : 0;
  const offset = args.offset;
  const query = `?limit=${limitQuery}&offset=${offset}&filter=${encodeURIComponent(args.filter)}&sort_by=${encodeURIComponent(args.sortBy)}&order=${encodeURIComponent(args.order)}` +
    (args.integration ? `&integration=${encodeURIComponent(args.integration)}` : '') +
    (args.domain ? `&domain=${encodeURIComponent(args.domain)}` : '');

  return fetchJson<Entity[]>(`/api/entities/summary${query}`);
}

export function clearSelectedEntities(): void {
  selectedEntities.clear();
}

export function getSelectedEntities(): string[] {
  return Array.from(selectedEntities).sort();
}

export function updateEntitySelectionSummary(): void {
  const summary = document.getElementById('selection-count');
  const generateButton = document.getElementById('generate-yaml-btn') as HTMLButtonElement | null;
  if (!summary || !generateButton) return;

  if (selectedEntities.size === 0) {
    summary.textContent = 'No entities selected.';
    generateButton.disabled = true;
  } else {
    summary.textContent = `${selectedEntities.size} entit${selectedEntities.size === 1 ? 'y' : 'ies'} selected.`;
    generateButton.disabled = false;
  }
}

export function handleEntitiesContentChange(event: Event): void {
  const target = event.target as HTMLInputElement;
  if (!target) return;

  if (target.matches('#header-checkbox')) {
    const checked = target.checked;
    document.querySelectorAll<HTMLInputElement>('.entity-checkbox').forEach((checkbox) => {
      checkbox.checked = checked;
      const entity = checkbox.dataset.entity || '';
      if (checked) {
        selectedEntities.add(entity);
      } else {
        selectedEntities.delete(entity);
      }
    });
    updateEntitySelectionSummary();
    return;
  }

  if (!target.matches('.entity-checkbox')) {
    return;
  }

  const entity = target.dataset.entity || '';
  if (target.checked) {
    selectedEntities.add(entity);
  } else {
    selectedEntities.delete(entity);
  }
  updateEntitySelectionSummary();
}

export function handleEntitiesContentClick(event: MouseEvent): void {
  const target = event.target as HTMLElement;
  const linkTarget = target.closest('.clickable') as HTMLElement | null;
  if (!linkTarget) return;

  const entity = linkTarget.dataset.entity;
  if (!entity) return;

  if (linkTarget.classList.contains('attributes-link')) {
    const limitAttribute = linkTarget.dataset.limit;
    const limit = limitAttribute ? Number(limitAttribute) : 50;
    showAttributesModal(entity, limit);
    return;
  }

  if (linkTarget.classList.contains('history-link')) {
    openHistoryLink(entity);
    return;
  }

  if (linkTarget.classList.contains('entity-link')) {
    openDetailsLink(entity);
    return;
  }
}

export function buildEntitiesTableHtml(
  entities: Entity[],
  currentLimit: number,
  entitySortBy: string,
  entitySortOrder: string,
  currentLimitValue: number,
): string {
  const displayedEntities = currentLimit > 0 && entities.length > currentLimit ? entities.slice(0, currentLimit) : entities;
  const entityHasMore = currentLimit > 0 && entities.length > currentLimit;

  if (displayedEntities.length === 0) {
    return '<div class="error">No entities found</div>';
  }

  return `<div class="table-responsive"><table><thead><tr>
      <th><input type="checkbox" id="header-checkbox"></th>
      <th class="sortable" data-sort="entity">Entity${entitySortBy === 'entity' ? (entitySortOrder === 'asc' ? '&nbsp;▲' : '&nbsp;▼') : ''}</th>
      <th class="sortable" data-sort="statesCount">States${entitySortBy === 'statesCount' ? (entitySortOrder === 'asc' ? '&nbsp;▲' : '&nbsp;▼') : ''}</th>
      <th class="sortable" data-sort="attributesCount">Attributes${entitySortBy === 'attributesCount' ? (entitySortOrder === 'asc' ? '&nbsp;▲' : '&nbsp;▼') : ''}</th>
      <th class="sortable" data-sort="attributesSizeBytes">Attr Size${entitySortBy === 'attributesSizeBytes' ? (entitySortOrder === 'asc' ? '&nbsp;▲' : '&nbsp;▼') : ''}</th>
      <th class="sortable" data-sort="statisticsCount">Statistics${entitySortBy === 'statisticsCount' ? (entitySortOrder === 'asc' ? '&nbsp;▲' : '&nbsp;▼') : ''}</th>
      <th class="sortable" data-sort="statsShortCount" title="Short-term statistics">Short&nbsp;Stats${entitySortBy === 'statsShortCount' ? (entitySortOrder === 'asc' ? '&nbsp;▲' : '&nbsp;▼') : ''}</th>
      <th class="sortable" data-sort="estimatedSizeBytes" title="Estimated size = attributes size + average row size × count for states and statistics">Est&nbsp;Total${entitySortBy === 'estimatedSizeBytes' ? (entitySortOrder === 'asc' ? '&nbsp;▲' : '&nbsp;▼') : ''}</th>
    </tr></thead>
    <tbody>${displayedEntities.map((e) => `<tr>
      <td><input type="checkbox" class="entity-checkbox" data-entity="${escapeAttr(e.entity)}"></td>
      <td class="entity-name"><span class="clickable entity-link" title="${escapeAttr(e.entity)}" data-entity="${escapeAttr(e.entity)}">${escapeHtml(e.entity)}</span></td>
      <td class="numeric"><span class="clickable history-link" data-entity="${escapeAttr(e.entity)}">${e.statesCount}</span></td>
      <td class="numeric"><span class="clickable attributes-link" data-entity="${escapeAttr(e.entity)}" data-limit="${currentLimitValue}">${e.attributesCount}</span></td>
      <td class="numeric">${formatSizeBytes(e.attributesSizeBytes)}</td>
      <td class="numeric">${e.statisticsCount ?? 0}</td>
      <td class="numeric">${e.statsShortCount ?? 0}</td>
      <td class="numeric"><strong>${formatSizeBytes(e.estimatedSizeBytes)}</strong></td>
    </tr>`).join('')}</tbody></table></div>${entityHasMore ? '<div class="info">More entities available. Use pagination controls.</div>' : ''}`;
}

export function buildEntityPaginationHtml(totalCount: number, entityPage: number, currentLimit: number): string {
  if (currentLimit <= 0 || totalCount === 0) {
    return '';
  }

  const start = totalCount === 0 ? 0 : entityPage * currentLimit + 1;
  const end = Math.min(totalCount, (entityPage + 1) * currentLimit);
  const lastPage = Math.max(Math.ceil(totalCount / currentLimit) - 1, 0);
  const firstDisabled = entityPage === 0 ? 'disabled' : '';
  const prevDisabled = entityPage === 0 ? 'disabled' : '';
  const nextDisabled = entityPage >= lastPage ? 'disabled' : '';
  const lastDisabled = entityPage >= lastPage ? 'disabled' : '';

  return `
    <button ${firstDisabled} data-action="page" data-page="0">First</button>
    <button ${prevDisabled} data-action="page" data-page="${Math.max(entityPage - 1, 0)}">Previous</button>
    <span>${start} - ${end} / ${totalCount}</span>
    <button ${nextDisabled} data-action="page" data-page="${Math.min(entityPage + 1, lastPage)}">Next</button>
    <button ${lastDisabled} data-action="page" data-page="${lastPage}">Last</button>
  `;
}

export function bindEntityTableEvents(
  currentSortBy: EntitySortKey,
  currentSortOrder: EntitySortOrder,
  onSortChange: (sortBy: EntitySortKey, order: EntitySortOrder) => void,
): void {
  const container = document.getElementById('entities-content');
  if (!container) return;

  container.querySelectorAll('th.sortable').forEach((header) => {
    header.addEventListener('click', () => {
      const sortKey = header.getAttribute('data-sort');
      if (!sortKey) return;
      if (sortKey === 'entity' || sortKey === 'statesCount' || sortKey === 'attributesCount' || sortKey === 'attributesSizeBytes' || sortKey === 'statisticsCount' || sortKey === 'statsShortCount' || sortKey === 'estimatedSizeBytes') {
        const newOrder = currentSortBy === sortKey && currentSortOrder === 'asc' ? 'desc' : 'asc';
        onSortChange(sortKey as EntitySortKey, newOrder);
      }
    });
  });
}

function renderEntityPagination(totalCount: number, page: number, currentLimit: number): void {
  const pagination = document.getElementById('entity-pagination');
  if (!pagination) return;
  pagination.innerHTML = buildEntityPaginationHtml(totalCount, page, currentLimit);
}

async function showAttributesModal(entity: string, limit: number): Promise<void> {
  const modal = document.getElementById('modal');
  const title = document.querySelector('.modal-title');
  const list = document.querySelector('.attributes-list');
  const link = document.querySelector('.external-link') as HTMLAnchorElement | null;
  if (!modal || !title || !list) return;

  title.textContent = `Recent attributes for ${entity}`;
  list.innerHTML = '<li>Loading attributes...</li>';
  if (link) {
    link.href = normalizeHomeAssistantLink(`/developer-tools/state?entity_id=${encodeURIComponent(entity)}`);
    link.textContent = 'Open in Home Assistant';
  }
  modal.classList.add('active');

  try {
    const attributes = await fetchJson<Array<{ sharedAttrs: string }>>(`/api/entities/${encodeURIComponent(entity)}/attributes?limit=${limit}`);
    if (attributes.length === 0) {
      list.innerHTML = '<li>No attributes found</li>';
      return;
    }
    list.innerHTML = attributes.map((attr) => `<li>${escapeHtml(attr.sharedAttrs)}</li>`).join('');
  } catch (error) {
    list.innerHTML = `<li>Error loading attributes: ${escapeHtml((error as Error).message)}</li>`;
  }
}

async function openHistoryLink(entity: string): Promise<void> {
  try {
    const response = await fetchJson<{ path: string }>(`/api/entities/${encodeURIComponent(entity)}/history-link`);
    window.open(response.path, '_blank');
  } catch (error) {
    alert(`Unable to open history link: ${(error as Error).message}`);
  }
}

async function openDetailsLink(entity: string): Promise<void> {
  try {
    const response = await fetchJson<{ path: string }>(`/api/entities/${encodeURIComponent(entity)}/details-link`);
    window.open(response.path, '_blank');
  } catch (error) {
    alert(`Unable to open details link: ${(error as Error).message}`);
  }
}

export async function loadEntityFilters(selectedIntegration: string, selectedDomain: string): Promise<void> {
  const integrationSelect = document.getElementById('integration-filter') as HTMLSelectElement | null;
  const domainSelect = document.getElementById('domain-filter') as HTMLSelectElement | null;

  if (!integrationSelect || !domainSelect) return;

  try {
    const [integrationResult, domainResult] = await Promise.all([
      fetchJson<{ available: boolean; integrations: Array<{ integration: string; entityCount: number }> }>('/api/integrations/list'),
      fetchJson<{ available: boolean; domains: Array<{ domain: string; entityCount: number }> }>('/api/domains/list'),
    ]);

    integrationSelect.innerHTML = '<option value="">All integrations</option>' +
      (integrationResult.available ? integrationResult.integrations.map((integration) => `\n        <option value="${escapeAttr(integration.integration)}">${escapeHtml(integration.integration)}</option>`).join('') : '');

    domainSelect.innerHTML = '<option value="">All domains</option>' +
      (domainResult.available ? domainResult.domains.map((domain) => `\n        <option value="${escapeAttr(domain.domain)}">${escapeHtml(domain.domain)}</option>`).join('') : '');

    integrationSelect.value = selectedIntegration;
    domainSelect.value = selectedDomain;
  } catch {
    integrationSelect.innerHTML = '<option value="">All integrations</option>';
    domainSelect.innerHTML = '<option value="">All domains</option>';
  }
}

export async function loadEntities(
  args: EntityFetchArgs & {
    currentLimit: number;
    page: number;
    onSortChange: (sortBy: EntitySortKey, order: EntitySortOrder) => void;
  },
): Promise<void> {
  const container = document.getElementById('entities-content');
  const pagination = document.getElementById('entity-pagination');
  if (!container) return;

  const cacheKey = getFilteredEntitiesCacheKey(args);
  const cachedResult = cachedFilteredEntities.get(cacheKey);

  if (pagination) pagination.innerHTML = '';
  container.innerHTML = '<div class="loading">Loading entities...</div>';

  try {
    const entities = cachedResult ? cachedResult.entities : await fetchEntitiesListCached(args);

    clearSelectedEntities();
    const tableHtml = buildEntitiesTableHtml(entities, args.currentLimit, args.sortBy, args.order, args.currentLimit);
    const summaryHtml = '<div id="entities-summary" class="table-summary">Loading...</div>';
    container.innerHTML = `${summaryHtml}${tableHtml}`;
    bindEntityTableEvents(args.sortBy, args.order, args.onSortChange);
    updateEntitySelectionSummary();

    const totals = cachedResult ? cachedResult.totals : await fetchTotalsCached(args);
    if (!cachedResult) {
      cachedFilteredEntities.set(cacheKey, { entities, totals });
    }

    if (!cachedGlobalTotals && args.filter === '' && !args.integration && !args.domain) {
      cachedGlobalTotals = { totalCount: totals.totalCount, totalEstimatedSizeBytes: totals.totalEstimatedSizeBytes };
    }

    renderEntityPagination(totals.totalCount, args.page, args.currentLimit);

    if (!cachedDataSize) {
      const tablesResponse = await fetchTablesData();
      const totalSize = tablesResponse.tables.reduce((sum, row) => sum + (row.size || 0), 0);
      const indexSize = tablesResponse.tables.find((row) => row.name === '*Indexes*')?.size || 0;
      const sqliteSize = tablesResponse.tables.find((row) => row.name === '*SQLite*')?.size || 0;
      cachedDataSize = totalSize - indexSize - sqliteSize;
    }

    if (!cachedTotalsByFilter.has(getTotalsCacheKey(args))) {
      cachedTotalsByFilter.set(getTotalsCacheKey(args), totals);
    }

    if (!cachedGlobalTotals) {
      cachedGlobalTotals = await fetchJson<EntitiesTotalsResponse>(`/api/entities/totals`);
    }

    const summaryEl = document.getElementById('entities-summary');
    if (summaryEl && cachedDataSize !== null) {
      summaryEl.innerHTML = `SQLite Data: <strong>${formatSizeBytes(cachedDataSize)}</strong> · Selected entities: <strong>${totals.totalCount}</strong> (<strong>${formatSizeBytes(totals.totalEstimatedSizeBytes)}</strong>) · All entities: <strong>${cachedGlobalTotals?.totalCount ?? 0}</strong> (<strong>${formatSizeBytes(cachedGlobalTotals?.totalEstimatedSizeBytes ?? 0)}</strong>)`;
    }
  } catch (error) {
    container.innerHTML = `<div class="error">Error: ${escapeHtml((error as Error).message)}</div>`;
  }
}

