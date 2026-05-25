import { fetchJson, formatSizeBytes, escapeHtml, escapeAttr, fetchTablesData } from './common.js';
import { DomainSummary } from './common.js';

const selectedDomains = new Set<string>();
let domainsCache: { available: boolean; domains: DomainSummary[] } | null = null;
let domainsTotalDataSize: number | null = null;
let domainsLoadingPromise: Promise<void> | null = null;

export async function fetchDomainsSummary(): Promise<{ available: boolean; domains: DomainSummary[]; totalDataSizeBytes?: number }> {
  return fetchJson('/api/domains/summary');
}

export function buildDomainsHtml(summary: { available: boolean; domains: DomainSummary[] }, totalDataSize: number): string {
  if (!summary.available) {
    return '<div class="error">Entity registry not found. Domain summary unavailable.</div>';
  }

  if (!Array.isArray(summary.domains) || summary.domains.length === 0) {
    return '<div class="error">No domains found in entity registry.</div>';
  }

  const totalDomainEstimatedSize = summary.domains.reduce((sum, domain) => sum + (domain.estimatedSizeBytes || 0), 0);

  return `<div class="table-summary">
      SQLite Data: <strong>${formatSizeBytes(totalDataSize)}</strong> ·
      Total estimated domains: <strong>${formatSizeBytes(totalDomainEstimatedSize)}</strong>
    </div><table><thead>
      <tr><th><input id="domain-header-checkbox" type="checkbox" /></th><th>Domain</th><th>Entities</th><th title="Estimated size = attributes size + average state row size × state count + estimated statistics row size">Estimated size</th></tr></thead>
      <tbody>${summary.domains.map((domain) => {
        const percent = totalDataSize > 0 ? (domain.estimatedSizeBytes / totalDataSize) * 100 : 0;
        return `<tr>
          <td><input class="domain-checkbox" type="checkbox" data-domain="${escapeAttr(domain.domain)}" /></td>
          <td><a href="#entities?domain=${encodeURIComponent(domain.domain)}">${escapeHtml(domain.domain)}</a></td>
          <td class="numeric"><a href="#entities?domain=${encodeURIComponent(domain.domain)}">${domain.entityCount}</a></td>
          <td class="numeric">${formatSizeBytes(domain.estimatedSizeBytes)} (${percent.toFixed(1)}%)</td>
        </tr>`;
      }).join('')}</tbody></table>`;
}


export function handleDomainsContentChange(event: Event): void {
  const target = event.target as HTMLInputElement;
  if (!target) return;

  if (target.matches('#domain-header-checkbox')) {
    const checked = target.checked;
    document.querySelectorAll<HTMLInputElement>('.domain-checkbox').forEach((checkbox) => {
      checkbox.checked = checked;
      const domain = checkbox.dataset.domain || '';
      if (checked) {
        selectedDomains.add(domain);
      } else {
        selectedDomains.delete(domain);
      }
    });
    updateDomainSelectionSummary();
    return;
  }

  if (!target.matches('.domain-checkbox')) {
    return;
  }

  const domain = target.dataset.domain || '';
  if (target.checked) {
    selectedDomains.add(domain);
  } else {
    selectedDomains.delete(domain);
  }
  updateDomainSelectionSummary();
}

export function getSelectedDomains(): string[] {
  return Array.from(selectedDomains).sort();
}

function updateDomainSelectionSummary(): void {
  const summary = document.getElementById('domain-selection-count');
  const generateButton = document.getElementById('generate-domain-yaml-btn') as HTMLButtonElement | null;
  if (!summary || !generateButton) return;

  if (selectedDomains.size === 0) {
    summary.textContent = 'No domains selected.';
    generateButton.disabled = true;
  } else {
    summary.textContent = `${selectedDomains.size} domain${selectedDomains.size === 1 ? '' : 's'} selected.`;
    generateButton.disabled = false;
  }
}

export async function loadDomains(): Promise<void> {
  const container = document.getElementById('domains-content');
  if (!container) return;

  if (domainsCache && domainsTotalDataSize !== null) {
    selectedDomains.clear();
    updateDomainSelectionSummary();
    container.innerHTML = buildDomainsHtml(domainsCache, domainsTotalDataSize);
    return;
  }

  if (domainsLoadingPromise) {
    return domainsLoadingPromise;
  }

  domainsLoadingPromise = (async () => {
    container.innerHTML = '<div class="loading">Loading domains...</div>';

    try {
      const summary = await fetchDomainsSummary();

      if (!summary.available) {
        container.innerHTML = '<div class="error">Entity registry not found. Domain summary unavailable.</div>';
        return;
      }

      const tablesResponse = await fetchTablesData();

      const totalSize = tablesResponse.tables.reduce((sum, row) => sum + (row.size || 0), 0);
      const indexSize = tablesResponse.tables.find((row) => row.name === '*Indexes*')?.size || 0;
      const sqliteSize = tablesResponse.tables.find((row) => row.name === '*SQLite*')?.size || 0;
      const totalDataSize = totalSize - indexSize - sqliteSize;

      domainsCache = summary;
      domainsTotalDataSize = totalDataSize;

      selectedDomains.clear();
      updateDomainSelectionSummary();
      container.innerHTML = buildDomainsHtml(summary, totalDataSize);
    } catch (error) {
      domainsCache = null;
      domainsTotalDataSize = null;
      container.innerHTML = `<div class="error">Error: ${escapeHtml((error as Error).message)}</div>`;
      throw error;
    } finally {
      domainsLoadingPromise = null;
    }
  })();

  return domainsLoadingPromise;
}

