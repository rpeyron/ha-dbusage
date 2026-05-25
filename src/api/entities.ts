import sqlite3 from 'sqlite3';

interface EntitySummary {
  entity: string;
  statesCount: number;
  attributesCount: number;
  eventsCount: number;
  statisticsCount: number;
  statsShortCount: number;
  estimatedSizeBytes: number;
}

export interface EntitySummaryOptions {
  filter?: string;
  sortBy?: string;
  order?: string;
  offset?: number;
  allowedEntityIds?: string[];
}

export interface EntityTotals {
  entityCount: number;
  estimatedSizeBytes: number;
}

function runQuery<T>(db: sqlite3.Database, query: string, params: any[] = []): Promise<T[]> {
  return new Promise((resolve, reject) => {
    db.all(query, params, (err, rows: any[]) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
}

function runGet<T>(db: sqlite3.Database, query: string, params: any[] = []): Promise<T> {
  return new Promise((resolve, reject) => {
    db.get(query, params, (err, row: any) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function getSortBy(sortBy?: string) {
  switch (sortBy) {
    case 'entity':
    case 'statesCount':
    case 'attributesCount':
    case 'eventsCount':
    case 'statisticsCount':
    case 'statsShortCount':
    case 'estimatedSizeBytes':
      return sortBy;
    default:
      return 'estimatedSizeBytes';
  }
}

function getOrder(order?: string) {
  return order === 'asc' ? 'ASC' : 'DESC';
}

async function getAverageRowSize(db: sqlite3.Database, tableName: string): Promise<number> {
  try {
    const rows = await runQuery<any>(db, `PRAGMA table_info('${tableName}')`);
    if (!rows.length) {
      return 0;
    }
  } catch {
    return 0;
  }

  return new Promise((resolve, reject) => {
    db.get(
      `SELECT SUM(payload) AS totalSize, SUM(ncell) AS totalCells
       FROM dbstat
       WHERE name = ?`,
      [tableName],
      (err, row: any) => {
        if (err) {
          reject(err);
          return;
        }
        const totalSize = Number(row?.totalSize || 0);
        const totalCells = Number(row?.totalCells || 0);
        resolve(totalCells > 0 ? totalSize / totalCells : 0);
      }
    );
  });
}

async function getRowSizes(db: sqlite3.Database) {
  const stateRowSize = await getAverageRowSize(db, 'states');
  const attributeRowSize = await getAverageRowSize(db, 'state_attributes');
  const statisticsRowSize = await getAverageRowSize(db, 'statistics');
  const statisticsShortTermRowSize = await getAverageRowSize(db, 'statistics_short_term');

  return {
    stateRowSize,
    attributeRowSize,
    statisticsRowSize,
    statisticsShortTermRowSize,
  };
}

function buildEntityStatsCte() {
  return `
    WITH state_rows AS (
      SELECT sm.entity_id AS entity,
             COUNT(DISTINCT s.state_id) AS statesCount
      FROM states s
      JOIN states_meta sm ON s.metadata_id = sm.metadata_id
      WHERE LOWER(sm.entity_id) LIKE ?
      GROUP BY sm.entity_id
    ),
    attribute_rows AS (
      SELECT entity,
             COUNT(*) AS attributesCount,
             COALESCE(SUM(LENGTH(shared_attrs)), 0) AS attributesSizeBytes
      FROM (
        SELECT DISTINCT sm.entity_id AS entity,
                        sa.attributes_id,
                        sa.shared_attrs
        FROM states s
        JOIN states_meta sm ON s.metadata_id = sm.metadata_id
        JOIN state_attributes sa ON sa.attributes_id = s.attributes_id
        WHERE LOWER(sm.entity_id) LIKE ?
      )
      GROUP BY entity
    ),
    statistic_rows AS (
      SELECT smt.statistic_id AS entity,
             COUNT(DISTINCT stm.id) AS statisticsCount
      FROM statistics stm
      JOIN statistics_meta smt ON stm.metadata_id = smt.id
      WHERE LOWER(smt.statistic_id) LIKE ?
      GROUP BY smt.statistic_id
    ),
    short_statistic_rows AS (
      SELECT smt.statistic_id AS entity,
             COUNT(DISTINCT sstm.id) AS statsShortCount
      FROM statistics_short_term sstm
      JOIN statistics_meta smt ON sstm.metadata_id = smt.id
      WHERE LOWER(smt.statistic_id) LIKE ?
      GROUP BY smt.statistic_id
    ),
    entities AS (
      SELECT entity, statesCount, 0 AS attributesCount, 0 AS attributesSizeBytes, 0 AS eventsCount, 0 AS statisticsCount, 0 AS statsShortCount
      FROM state_rows
      UNION ALL
      SELECT entity, 0 AS statesCount, attributesCount, attributesSizeBytes, 0 AS eventsCount, 0 AS statisticsCount, 0 AS statsShortCount
      FROM attribute_rows
      UNION ALL
      SELECT entity, 0 AS statesCount, 0 AS attributesCount, 0 AS attributesSizeBytes, 0 AS eventsCount, statisticsCount, 0 AS statsShortCount
      FROM statistic_rows
      UNION ALL
      SELECT entity, 0 AS statesCount, 0 AS attributesCount, 0 AS attributesSizeBytes, 0 AS eventsCount, 0 AS statisticsCount, statsShortCount
      FROM short_statistic_rows
    )
  `;
}

function buildAllowedEntitiesClause(allowedEntityIds: string[] | undefined): string {
  if (!allowedEntityIds || allowedEntityIds.length === 0) {
    return '';
  }
  const placeholders = allowedEntityIds.map(() => '?').join(', ');
  return `AND LOWER(entity) IN (${placeholders})`;
}

function buildAllowedEntitiesParams(allowedEntityIds: string[] | undefined): string[] {
  if (!allowedEntityIds || allowedEntityIds.length === 0) {
    return [];
  }
  return allowedEntityIds.map((id) => id.toLowerCase());
}

export async function getEntitiesSummary(
  db: sqlite3.Database,
  limit: number,
  options: EntitySummaryOptions = {}
): Promise<EntitySummary[]> {
  const sortBy = getSortBy(options.sortBy);
  const order = getOrder(options.order);
  const offset = Math.max(options.offset || 0, 0);
  const filterValue = options.filter?.trim().toLowerCase() || '';
  const filterPattern = `%${filterValue}%`;

  const rowSizes = await getRowSizes(db);
  const baseQuery = buildEntityStatsCte();
  const allowedEntitiesClause = buildAllowedEntitiesClause(options.allowedEntityIds);
  const allowedEntitiesParams = buildAllowedEntitiesParams(options.allowedEntityIds);

  let query = `${baseQuery}
    SELECT
      entity,
      SUM(statesCount) AS statesCount,
      SUM(attributesCount) AS attributesCount,
      SUM(attributesSizeBytes) AS attributesSizeBytes,
      SUM(eventsCount) AS eventsCount,
      SUM(statisticsCount) AS statisticsCount,
      SUM(statsShortCount) AS statsShortCount,
      ROUND(
        COALESCE(SUM(statesCount), 0) * ?
        + COALESCE(SUM(attributesCount), 0) * ?
        + COALESCE(SUM(attributesSizeBytes), 0)
        + COALESCE(SUM(statisticsCount), 0) * ?
        + COALESCE(SUM(statsShortCount), 0) * ?
      ) AS estimatedSizeBytes
    FROM entities
    WHERE LOWER(entity) LIKE ?
    ${allowedEntitiesClause}
    GROUP BY entity
    ORDER BY ${sortBy} ${order}
  `;

  const params: any[] = [
    filterPattern,
    filterPattern,
    filterPattern,
    filterPattern,
    rowSizes.stateRowSize,
    rowSizes.attributeRowSize,
    rowSizes.statisticsRowSize,
    rowSizes.statisticsShortTermRowSize,
    filterPattern,
    ...allowedEntitiesParams,
  ];

  if (limit > 0) {
    query += ' LIMIT ? OFFSET ?';
    params.push(limit, offset);
  }

  const rows = await runQuery<any>(db, query, params);
  return rows.map((row) => ({
    entity: row.entity,
    statesCount: Number(row.statesCount || 0),
    attributesCount: Number(row.attributesCount || 0),
    eventsCount: Number(row.eventsCount || 0),
    statisticsCount: Number(row.statisticsCount || 0),
    statsShortCount: Number(row.statsShortCount || 0),
    attributesSizeBytes: Number(row.attributesSizeBytes || 0),
    estimatedSizeBytes: Number(row.estimatedSizeBytes || 0),
  }));
}

export async function getEntitiesTotals(
  db: sqlite3.Database,
  options: EntitySummaryOptions = {}
): Promise<EntityTotals> {
  const filterValue = options.filter?.trim().toLowerCase() || '';
  const filterPattern = `%${filterValue}%`;

  const rowSizes = await getRowSizes(db);
  const baseQuery = buildEntityStatsCte();
  const allowedEntitiesClause = buildAllowedEntitiesClause(options.allowedEntityIds);
  const allowedEntitiesParams = buildAllowedEntitiesParams(options.allowedEntityIds);
  const query = `${baseQuery}
    SELECT
      COUNT(DISTINCT entity) AS entityCount,
      ROUND(
        COALESCE(SUM(statesCount), 0) * ?
        + COALESCE(SUM(attributesCount), 0) * ?
        + COALESCE(SUM(attributesSizeBytes), 0)
        + COALESCE(SUM(statisticsCount), 0) * ?
        + COALESCE(SUM(statsShortCount), 0) * ?
      ) AS estimatedSizeBytes
    FROM entities
    WHERE LOWER(entity) LIKE ?
    ${allowedEntitiesClause}
  `;

  const params: any[] = [
    filterPattern,
    filterPattern,
    filterPattern,
    filterPattern,
    rowSizes.stateRowSize,
    rowSizes.attributeRowSize,
    rowSizes.statisticsRowSize,
    rowSizes.statisticsShortTermRowSize,
    filterPattern,
    ...allowedEntitiesParams,
  ];

  const row = await runGet<any>(db, query, params);
  return {
    entityCount: Number(row?.entityCount || 0),
    estimatedSizeBytes: Number(row?.estimatedSizeBytes || 0),
  };
}

export async function getEntityAttributes(db: sqlite3.Database, entity: string, limit: number): Promise<any[]> {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT DISTINCT sa.attributes_id, sa.shared_attrs AS sharedAttrs
       FROM states s
       JOIN states_meta sm ON s.metadata_id = sm.metadata_id
       JOIN state_attributes sa ON sa.attributes_id = s.attributes_id
       WHERE sm.entity_id = ?
       ORDER BY s.last_updated_ts DESC
       LIMIT ?`,
      [entity, limit],
      (err, rows: any[]) => {
        if (err) reject(err);
        else resolve(rows || []);
      }
    );
  });
}

export function getEntityHistoryLink(entity: string): { path: string } {
  return { path: `/history?entity_id=${encodeURIComponent(entity)}` };
}

export function getEntityDetailsLink(entity: string): { path: string } {
  return { path: `/developer-tools/state?entity_id=${encodeURIComponent(entity)}` };
}
