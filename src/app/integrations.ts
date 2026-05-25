import { fetchJson, formatSizeBytes, escapeHtml, fetchTablesData } from './common.js';
import { IntegrationSummary } from './common.js';

let integrationsCache: { available: boolean; integrations: IntegrationSummary[] } | null = null;
let integrationsTotalDataSize: number | null = null;
let integrationsLoadingPromise: Promise<void> | null = null;


export async function fetchIntegrationsSummary(): Promise<{ available: boolean; integrations: IntegrationSummary[]; totalDataSizeBytes?: number }> {
  return fetchJson('/api/integrations/summary');
}

export function buildIntegrationsHtml(summary: { available: boolean; integrations: IntegrationSummary[] }, totalDataSize: number): string {
  if (!summary.available) {
    return '<div class="error">Entity registry not found. Integration summary unavailable.</div>';
  }

  if (!Array.isArray(summary.integrations) || summary.integrations.length === 0) {
    return '<div class="error">No integrations found in entity registry.</div>';
  }

  const totalIntegrationsEstimatedSize = summary.integrations.reduce((sum, integration) => sum + (integration.estimatedSizeBytes || 0), 0);

  return `<div class="table-summary">
      SQLite Data: <strong>${formatSizeBytes(totalDataSize)}</strong> ·
      Total estimated integrations: <strong>${formatSizeBytes(totalIntegrationsEstimatedSize)}</strong>
    </div><table><thead>
      <tr><th>Integration</th><th>Entities</th><th title="Estimated size = attributes size + average state row size × state count + estimated statistics row size">Estimated size</th></tr></thead>
      <tbody>${summary.integrations.map((integration) => {
        const percent = totalDataSize > 0 ? (integration.estimatedSizeBytes / totalDataSize) * 100 : 0;
        return `<tr>
          <td>${escapeHtml(integration.integration)}</td>
          <td class="numeric"><a href="#entities?integration=${encodeURIComponent(integration.integration)}">${integration.entityCount}</a></td>
          <td class="numeric">${formatSizeBytes(integration.estimatedSizeBytes)} (${percent.toFixed(1)}%)</td>
        </tr>`;
      }).join('')}</tbody></table>`;
}


export async function loadIntegrations(): Promise<void> {
  const container = document.getElementById('integrations-content');
  if (!container) return;

  if (integrationsCache && integrationsTotalDataSize !== null) {
    container.innerHTML = buildIntegrationsHtml(integrationsCache, integrationsTotalDataSize);
    return;
  }

  if (integrationsLoadingPromise) {
    return integrationsLoadingPromise;
  }

  integrationsLoadingPromise = (async () => {
    container.innerHTML = '<div class="loading">Loading integrations...</div>';

    try {
      const summary = await fetchIntegrationsSummary();

      if (!summary.available) {
        container.innerHTML = '<div class="error">Entity registry not found. Integration summary unavailable.</div>';
        return;
      }

      const tablesResponse = await fetchTablesData();

      const totalSize = tablesResponse.tables.reduce((sum, row) => sum + (row.size || 0), 0);
      const indexSize = tablesResponse.tables.find((row) => row.name === '*Indexes*')?.size || 0;
      const sqliteSize = tablesResponse.tables.find((row) => row.name === '*SQLite*')?.size || 0;
      const totalDataSize = totalSize - indexSize - sqliteSize;

      integrationsCache = summary;
      integrationsTotalDataSize = totalDataSize;

      container.innerHTML = buildIntegrationsHtml(summary, totalDataSize);
    } catch (error) {
      integrationsCache = null;
      integrationsTotalDataSize = null;
      container.innerHTML = `<div class="error">Error: ${escapeHtml((error as Error).message)}</div>`;
      throw error;
    } finally {
      integrationsLoadingPromise = null;
    }
  })();

  return integrationsLoadingPromise;
}
