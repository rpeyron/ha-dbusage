import { fetchJson, escapeHtml, escapeAttr, formatSizeBytes, closeModal, closeYamlModal } from './common.js';
import { loadEntities, handleEntitiesContentChange, handleEntitiesContentClick, loadEntityFilters, getSelectedEntities } from './entities.js';
import { loadIntegrations } from './integrations.js';
import { loadDomains, handleDomainsContentChange, getSelectedDomains } from './domains.js';
import { loadTables } from './tables.js';

type TableSortKey = 'name' | 'size';
type EntitySortKey = 'entity' | 'statesCount' | 'attributesCount' | 'attributesSizeBytes' | 'statisticsCount' | 'statsShortCount' | 'estimatedSizeBytes';
type EntitySortOrder = 'asc' | 'desc';
type Tab = 'tables' | 'entities' | 'integrations' | 'domains' | 'cleanup';
const KNOWN_TABS: Tab[] = ['tables', 'entities', 'integrations', 'domains', 'cleanup'];
const ENTITY_LIMIT_OPTIONS = [10, 20, 50, 100, 500, 0] as const;

let currentTab: Tab = 'cleanup';
let currentLimit = 50;
let entityFilter = '';
let selectedIntegration = '';
let selectedDomain = '';
let entityPage = 0;
let entitySortBy: EntitySortKey = 'estimatedSizeBytes';
let entitySortOrder: EntitySortOrder = 'desc';
let entityFilterDebounceTimer: number | undefined;

function parseHash(): { tab: Tab; filter: string; integration: string; domain: string; limit?: number; page: number; sortBy: EntitySortKey; order: EntitySortOrder } {
  const hash = window.location.hash.slice(1);
  if (!hash) {
    return { tab: 'cleanup', filter: '', integration: '', domain: '', page: 0, sortBy: 'estimatedSizeBytes', order: 'desc' };
  }

  const [tabPart, query = ''] = hash.split('?');
  const params = new URLSearchParams(query);
  const tab = KNOWN_TABS.includes(tabPart as Tab) ? (tabPart as Tab) : 'tables';
  const filter = params.get('filter') || '';
  const integration = params.get('integration') || '';
  const domain = params.get('domain') || '';
  const limitValue = Number(params.get('limit'));
  const limit = ENTITY_LIMIT_OPTIONS.includes(limitValue as any) ? limitValue : 50;
  const pageValue = Number(params.get('page'));
  const page = Number.isFinite(pageValue) && pageValue >= 0 ? pageValue : 0;
  const sortBy = (params.get('sortBy') || 'estimatedSizeBytes') as EntitySortKey;
  const order = params.get('order') === 'asc' ? 'asc' : 'desc';

  return { tab, filter, integration, domain, limit, page, sortBy, order };
}

function updateHash(): void {
  const params = new URLSearchParams();
  if (entityFilter) params.set('filter', entityFilter);
  if (selectedIntegration) params.set('integration', selectedIntegration);
  if (selectedDomain) params.set('domain', selectedDomain);
  if (ENTITY_LIMIT_OPTIONS.some((value) => value === currentLimit)) params.set('limit', String(currentLimit));
  if (entityPage > 0) params.set('page', String(entityPage));
  if (entitySortBy !== 'estimatedSizeBytes') params.set('sortBy', entitySortBy);
  if (entitySortOrder !== 'desc') params.set('order', entitySortOrder);

  const query = params.toString();
  window.location.hash = query ? `${currentTab}?${query}` : currentTab;
}

function setActiveTab(tab: Tab): void {
  currentTab = tab;
  document.querySelectorAll('.tab-btn').forEach((button) => {
    const element = button as HTMLElement;
    element.classList.toggle('active', element.getAttribute('data-tab') === tab);
  });

  document.querySelectorAll('.content').forEach((section) => {
    const element = section as HTMLElement;
    element.classList.toggle('active', element.id === tab);
  });
}

function setEntityControlsFromState(): void {
  const filterInput = document.getElementById('entity-filter') as HTMLInputElement | null;
  const integrationSelect = document.getElementById('integration-filter') as HTMLSelectElement | null;
  const domainSelect = document.getElementById('domain-filter') as HTMLSelectElement | null;
  const limitSelect = document.getElementById('limit') as HTMLSelectElement | null;

  if (filterInput) filterInput.value = entityFilter;
  if (integrationSelect) integrationSelect.value = selectedIntegration;
  if (domainSelect) domainSelect.value = selectedDomain;
  if (limitSelect) limitSelect.value = String(currentLimit);
}

function attachGlobalHandlers(): void {
  document.querySelectorAll('.tab-btn').forEach((button) => {
    button.addEventListener('click', () => {
      const tab = (button.getAttribute('data-tab') || 'tables') as Tab;
      if (tab === currentTab) return;
      currentTab = tab;
      entityPage = 0;
      updateHash();
      activateCurrentTab();
    });
  });

  const filterInput = document.getElementById('entity-filter') as HTMLInputElement | null;
  const integrationSelect = document.getElementById('integration-filter') as HTMLSelectElement | null;
  const domainSelect = document.getElementById('domain-filter') as HTMLSelectElement | null;
  const limitSelect = document.getElementById('limit') as HTMLSelectElement | null;
  const generateYamlButton = document.getElementById('generate-yaml-btn') as HTMLButtonElement | null;
  const copyYamlButton = document.getElementById('copy-yaml-btn') as HTMLButtonElement | null;
  const closeYamlButton = document.getElementById('close-yaml-modal-btn') as HTMLButtonElement | null;

  if (filterInput) {
    filterInput.addEventListener('input', () => {
      entityFilter = filterInput.value.trim();
      entityPage = 0;
      scheduleEntityReload();
    });
  }

  if (integrationSelect) {
    integrationSelect.addEventListener('change', () => {
      selectedIntegration = integrationSelect.value;
      entityPage = 0;
      scheduleEntityReload();
    });
  }

  if (domainSelect) {
    domainSelect.addEventListener('change', () => {
      selectedDomain = domainSelect.value;
      entityPage = 0;
      scheduleEntityReload();
    });
  }

  if (limitSelect) {
    limitSelect.addEventListener('change', () => {
      currentLimit = Number(limitSelect.value);
      entityPage = 0;
      updateHash();
      loadEntitiesState();
    });
  }

  if (generateYamlButton) {
    generateYamlButton.addEventListener('click', generateYamlFromSelection);
  }

  const generateDomainYamlButton = document.getElementById('generate-domain-yaml-btn') as HTMLButtonElement | null;
  if (generateDomainYamlButton) {
    generateDomainYamlButton.addEventListener('click', generateYamlFromSelection);
  }

  if (copyYamlButton) {
    copyYamlButton.addEventListener('click', copyYamlToClipboard);
  }

  if (closeYamlButton) {
    closeYamlButton.addEventListener('click', closeYamlModal);
  }

  document.querySelectorAll('.modal .modal-close').forEach((button) => {
    button.addEventListener('click', closeModal);
  });

  document.getElementById('entities-content')?.addEventListener('change', handleEntitiesContentChange);
  document.getElementById('entities-content')?.addEventListener('click', handleEntitiesContentClick);
  document.getElementById('domains-content')?.addEventListener('change', handleDomainsContentChange);
  document.getElementById('entity-pagination')?.addEventListener('click', (event) => {
    const target = event.target as HTMLElement;
    const button = target.closest('button[data-action]') as HTMLButtonElement | null;
    if (!button) return;
    const page = Number(button.dataset.page);
    if (!Number.isFinite(page) || page < 0 || page === entityPage) return;
    entityPage = page;
    updateHash();
    loadEntitiesState();
  });

  window.addEventListener('hashchange', () => {
    const hashState = parseHash();
    currentTab = hashState.tab;
    entityFilter = hashState.filter;
    selectedIntegration = hashState.integration;
    selectedDomain = hashState.domain;
    currentLimit = hashState.limit || 50;
    entityPage = hashState.page;
    entitySortBy = hashState.sortBy;
    entitySortOrder = hashState.order;
    setActiveTab(currentTab);
    setEntityControlsFromState();
    activateCurrentTab();
  });
}

function loadEntitiesState(): Promise<void> {
  const container = document.getElementById('entities-content');
  if (!container) {
    return Promise.resolve();
  }

  return loadEntities({
    limit: currentLimit,
    offset: currentLimit > 0 ? entityPage * currentLimit : 0,
    filter: entityFilter,
    sortBy: entitySortBy,
    order: entitySortOrder,
    integration: selectedIntegration,
    domain: selectedDomain,
    onSortChange: (sortBy, order) => {
      entitySortBy = sortBy;
      entitySortOrder = order;
      entityPage = 0;
      updateHash();
      loadEntitiesState();
    },
  });
}

function scheduleEntityReload(): void {
  if (entityFilterDebounceTimer !== undefined) {
    window.clearTimeout(entityFilterDebounceTimer);
  }
  entityFilterDebounceTimer = window.setTimeout(() => {
    entityFilterDebounceTimer = undefined;
    updateHash();
    loadEntitiesState();
  }, 250);
}

function activateCurrentTab(): void {
  setActiveTab(currentTab);
  if (currentTab === 'tables') {
    loadTables();
    return;
  }
  if (currentTab === 'entities') {
    setEntityControlsFromState();
    loadEntitiesState();
    return;
  }
  if (currentTab === 'integrations') {
    loadIntegrations();
    return;
  }
  if (currentTab === 'domains') {
    loadDomains();
  }
}

async function preloadHiddenTabs(): Promise<void> {
  const preloadTasks: Promise<void>[] = [];
  for (const tab of KNOWN_TABS) {
    if (tab === currentTab) continue;
    if (tab === 'tables') {
      preloadTasks.push(loadTables().catch((error) => {
        console.warn('Background preload tables failed:', error);
      }));
    } else if (tab === 'entities') {
      preloadTasks.push(loadEntitiesState().catch((error) => {
        console.warn('Background preload entities failed:', error);
      }));
    } else if (tab === 'integrations') {
      preloadTasks.push(loadIntegrations().catch((error) => {
        console.warn('Background preload integrations failed:', error);
      }));
    } else if (tab === 'domains') {
      preloadTasks.push(loadDomains().catch((error) => {
        console.warn('Background preload domains failed:', error);
      }));
    }
  }
  await Promise.all(preloadTasks);
}

function generateYamlFromSelection(): void {
  const yamlModal = document.getElementById('yaml-modal');
  const yamlOutput = document.getElementById('yaml-output');
  if (!yamlModal || !yamlOutput) return;

  if (currentTab === 'domains') {
    const domainList = getSelectedDomains();
    const yamlLines = ['recorder:', '  exclude:', '    domains:', ...domainList.map((domain) => `      - ${domain}`)];
    yamlOutput.textContent = yamlLines.join('\n');
  } else {
    const entityList = getSelectedEntities();
    const yamlLines = ['recorder:', '  exclude:', '    entities:', ...entityList.map((entity) => `      - ${entity}`)];
    yamlOutput.textContent = yamlLines.join('\n');
  }

  yamlModal.classList.add('active');
}

function copyYamlToClipboard(): void {
  const yamlOutput = document.getElementById('yaml-output');
  if (!yamlOutput) return;
  navigator.clipboard.writeText(yamlOutput.textContent || '')
    .then(() => {
      alert('YAML copied to clipboard');
    })
    .catch(() => {
      alert('Unable to copy YAML');
    });
}




async function init(): Promise<void> {
  const hashState = parseHash();
  currentTab = hashState.tab;
  entityFilter = hashState.filter;
  selectedIntegration = hashState.integration;
  selectedDomain = hashState.domain;
  currentLimit = hashState.limit || 50;
  entityPage = hashState.page;
  entitySortBy = hashState.sortBy;
  entitySortOrder = hashState.order;

  attachGlobalHandlers();
  setActiveTab(currentTab);
  setEntityControlsFromState();
  await loadEntityFilters(selectedIntegration, selectedDomain);
  activateCurrentTab();
  preloadHiddenTabs().catch((error) => {
    console.warn('Background tab preloading failed:', error);
  });
}

window.addEventListener('DOMContentLoaded', () => {
  init().catch((error) => {
    console.error('Initialization failed:', error);
  });
});

