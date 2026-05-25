import { escapeHtml, formatSizeBytes, fetchTablesData } from './common.js';
import { Table } from './common.js';

let tableSortKey: 'name' | 'size' = 'size';
let tableSortAscending = false;
let cachedTables: Table[] = [];
let dbFileSizeBytes = 0;
let tablesLoaded = false;

export async function loadTables(): Promise<void> {
  const container = document.getElementById('tables-content');
  if (!container) return;

  // Use cache if already loaded
  if (tablesLoaded) {
    renderTables();
    return;
  }

  container.innerHTML = '<div class="loading">Loading tables...</div>';

  try {
    const response = await fetchTablesData();
    cachedTables = Array.isArray(response.tables) ? response.tables : [];
    dbFileSizeBytes = Number(response.dbFileSizeBytes || 0);
    tablesLoaded = true;
    renderTables();
  } catch (error) {
    container.innerHTML = `<div class="error">Error: ${escapeHtml((error as Error).message)}</div>`;
  }
}

function renderTables(): void {
  const container = document.getElementById('tables-content');
  if (!container) return;

  const sortedTables = cachedTables.slice().sort((a, b) => {
    if (tableSortKey === 'name') {
      return tableSortAscending ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name);
    }
    return tableSortAscending ? a.size - b.size : b.size - a.size;
  });

  if (sortedTables.length === 0) {
    container.innerHTML = '<div class="error">No tables found.</div>';
    return;
  }

  const indexRow = sortedTables.find((row) => row.name === '*Indexes*');
  const sqliteRow = sortedTables.find((row) => row.name === '*SQLite*');
  const visibleRows = sortedTables.filter((row) => row.name !== '*Indexes*' && row.name !== '*SQLite*');
  const totalSize = sortedTables.reduce((sum, row) => sum + (row.size || 0), 0);
  const totalDataSize = totalSize - (indexRow?.size || 0) - (sqliteRow?.size || 0);

  const tableHtml = `<div class="table-summary">
      SQLite file: ${formatSizeBytes(dbFileSizeBytes)} ·
      Data tables: <strong>${formatSizeBytes(totalDataSize)}</strong> ·
      Indexes: ${formatSizeBytes(indexRow?.size || 0)} ·
      SQLite metadata: ${formatSizeBytes(sqliteRow?.size || 0)}
    </div>
    <table>
      <thead>
        <tr>
          <th class="sortable" data-sort="name">Table${tableSortKey === 'name' ? (tableSortAscending ? ' ▲' : ' ▼') : ''}</th>
          <th class="sortable" data-sort="size" title="Physical size of the table (with data and empty space)">Size${tableSortKey === 'size' ? (tableSortAscending ? ' ▲' : ' ▼') : ''}</th>
          <th title="Size of actual data (used space only)">Payload</th>
          <th title="Number of rows in the table">Count</th>
        </tr>
      </thead>
      <tbody>
        ${visibleRows.map((row) => `<tr>
          <td>${escapeHtml(row.name)}</td>
          <td class="numeric"><span class="size-badge">${formatSizeBytes(row.size)}</span></td>
          <td class="numeric"><span class="payload-badge">${formatSizeBytes(row.payload)}</span></td>
          <td class="numeric"><span class="count-badge">${row.count}</span></td>
        </tr>`).join('')}
      </tbody>
    </table>`;

  container.innerHTML = tableHtml;
  container.querySelectorAll('th.sortable').forEach((header) => {
    header.addEventListener('click', () => {
      const sortKey = header.getAttribute('data-sort');
      if (sortKey === 'name' || sortKey === 'size') {
        updateTableSort(sortKey as 'name' | 'size');
      }
    });
  });
}

function updateTableSort(key: 'name' | 'size'): void {
  if (tableSortKey === key) {
    tableSortAscending = !tableSortAscending;
  } else {
    tableSortKey = key;
    tableSortAscending = true;
  }
  renderTables();
}

export { updateTableSort };
