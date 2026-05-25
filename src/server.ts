import express, { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import sqlite3 from 'sqlite3';
import { getTables } from './api/tables';
import { getEntitiesSummary, getEntitiesTotals, getEntityAttributes, getEntityHistoryLink, getEntityDetailsLink } from './api/entities';
import {
  locateEntityRegistry,
  loadEntityRegistryEntries,
  summarizeRegistryByPlatform,
  summarizeRegistryByDomain,
  getEntitiesForIntegration,
  getEntitiesForDomain,
  intersectEntityIds,
} from './api/registry';

const app = express();
const port = parseInt(process.env.PORT || "3000");

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Database connection (default to /data/home-assistant_v2.db, can be overridden with DB_PATH env variable)
const dbPath = process.env.DB_PATH || [
  '/config/home-assistant_v2.db',
  path.join(process.cwd(), 'data', 'home-assistant_v2.db'),
  path.join(process.cwd(), 'data', 'sample.db'),
  path.join(process.cwd(), 'home-assistant_v2.db'),
  path.join(process.cwd(), 'sample.db'),
].find((p) => fs.existsSync(p)) || '/data/home-assistant_v2.db';

function loadRegistryEntries() {
  const registryPath = locateEntityRegistry();
  return registryPath ? loadEntityRegistryEntries(registryPath) : [];
}

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Database connection error:', err);
  } else {
    console.log(`Connected to database at ${dbPath}`);
  }
});
db.run('PRAGMA query_only = ON;');

const homeAssistantUrl = (process.env.HOME_ASSISTANT_URL || '').replace(/\/$/, '');

function formatHomeAssistantLink(path: string): string {
  if (!path) return path;
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }
  if (homeAssistantUrl) {
    return `${homeAssistantUrl}${path}`;
  }
  return path;
}

// API Routes
app.get('/api/tables', async (req: Request, res: Response) => {
  try {
    const tables = await getTables(db);
    let dbFileSizeBytes = 0;
    try {
      if (fs.existsSync(dbPath)) {
        dbFileSizeBytes = fs.statSync(dbPath).size;
      }
    } catch (statError) {
      console.warn('Unable to read DB file size:', statError);
    }
    res.json({ tables, dbFileSizeBytes });
  } catch (error) {
    console.error('Error fetching tables:', error);
    res.status(500).json({ error: 'Failed to fetch tables' });
  }
});

app.get('/api/entities/summary', async (req: Request, res: Response) => {
  try {
    const rawLimit = parseInt(req.query.limit as string, 10);
    const limit = Number.isNaN(rawLimit) ? 50 : rawLimit;
    const offset = Math.max(parseInt(req.query.offset as string, 10) || 0, 0);
    const filter = (req.query.filter as string) || '';
    const sortBy = (req.query.sort_by as string) || 'statesCount';
    const order = (req.query.order as string) || 'desc';
    const integration = (req.query.integration as string || '').trim();
    const domain = (req.query.domain as string || '').trim();

    let allowedEntityIds: string[] | undefined;
    if (integration || domain) {
      const entries = loadRegistryEntries();
      if (!entries.length) {
        return res.json([]);
      }
      if (integration) {
        allowedEntityIds = getEntitiesForIntegration(entries, integration);
      }
      if (domain) {
        const domainEntities = getEntitiesForDomain(entries, domain);
        allowedEntityIds = allowedEntityIds ? intersectEntityIds(allowedEntityIds, domainEntities) : domainEntities;
      }
      if (!allowedEntityIds?.length) {
        return res.json([]);
      }
    }

    const entities = await getEntitiesSummary(db, limit, {
      filter,
      sortBy,
      order,
      offset,
      allowedEntityIds,
    });
    res.json(entities);
  } catch (error) {
    console.error('Error fetching entities summary:', error);
    res.status(500).json({ error: 'Failed to fetch entities' });
  }
});

app.get('/api/entities/totals', async (req: Request, res: Response) => {
  try {
    const filter = (req.query.filter as string) || '';
    const integration = (req.query.integration as string || '').trim();
    const domain = (req.query.domain as string || '').trim();

    let allowedEntityIds: string[] | undefined;
    if (integration || domain) {
      const entries = loadRegistryEntries();
      if (!entries.length) {
        return res.json({ totalCount: 0, totalEstimatedSizeBytes: 0 });
      }
      if (integration) {
        allowedEntityIds = getEntitiesForIntegration(entries, integration);
      }
      if (domain) {
        const domainEntities = getEntitiesForDomain(entries, domain);
        allowedEntityIds = allowedEntityIds ? intersectEntityIds(allowedEntityIds, domainEntities) : domainEntities;
      }
      if (!allowedEntityIds?.length) {
        return res.json({ totalCount: 0, totalEstimatedSizeBytes: 0 });
      }
    }

    const totals = await getEntitiesTotals(db, { filter, allowedEntityIds });
    res.json({ totalCount: totals.entityCount, totalEstimatedSizeBytes: totals.estimatedSizeBytes });
  } catch (error) {
    console.error('Error fetching entity totals:', error);
    res.status(500).json({ error: 'Failed to fetch entity totals' });
  }
});

app.get('/api/entities/:entity/attributes', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const attributes = await getEntityAttributes(db, req.params.entity, limit);
    res.json(attributes);
  } catch (error) {
    console.error('Error fetching attributes:', error);
    res.status(500).json({ error: 'Failed to fetch attributes' });
  }
});

app.get('/api/integrations/list', async (req: Request, res: Response) => {
  try {
    const entries = loadRegistryEntries();
    if (!entries.length) {
      return res.json({ available: false, integrations: [] });
    }

    const integrations = summarizeRegistryByPlatform(entries).map((item) => ({
      integration: item.id,
      entityCount: item.entityCount,
    }));

    res.json({ available: true, integrations });
  } catch (error) {
    console.error('Error fetching integrations list:', error);
    res.status(500).json({ error: 'Failed to fetch integrations' });
  }
});

app.get('/api/domains/list', async (req: Request, res: Response) => {
  try {
    const entries = loadRegistryEntries();
    if (!entries.length) {
      return res.json({ available: false, domains: [] });
    }

    const domains = summarizeRegistryByDomain(entries).map((item) => ({
      domain: item.id,
      entityCount: item.entityCount,
    }));

    res.json({ available: true, domains });
  } catch (error) {
    console.error('Error fetching domains list:', error);
    res.status(500).json({ error: 'Failed to fetch domains' });
  }
});

app.get('/api/entities/:entity/history-link', (req: Request, res: Response) => {
  const link = getEntityHistoryLink(req.params.entity);
  res.json({ path: formatHomeAssistantLink(link.path) });
});

app.get('/api/entities/:entity/details-link', (req: Request, res: Response) => {
  const link = getEntityDetailsLink(req.params.entity);
  res.json({ path: formatHomeAssistantLink(link.path) });
});

app.get('/api/integrations/summary', async (req: Request, res: Response) => {
  try {
    const entries = loadRegistryEntries();
    if (!entries.length) {
      return res.json({ available: false, integrations: [] });
    }

    const platformSummary = summarizeRegistryByPlatform(entries);
    const allEntities = await getEntitiesSummary(db, 0, { filter: '', sortBy: 'estimatedSizeBytes', order: 'desc', offset: 0 });
    const summaryMap = new Map(allEntities.map((entity) => [entity.entity, entity]));

    const integrations = platformSummary.map((platform) => ({
      integration: platform.id,
      entityCount: platform.entityCount,
      estimatedSizeBytes: platform.entityIds.reduce((sum, entityId) => sum + (summaryMap.get(entityId)?.estimatedSizeBytes || 0), 0),
    })).sort((a, b) => b.estimatedSizeBytes - a.estimatedSizeBytes);

    const tables = await getTables(db);
    const totalSize = tables.reduce((sum, row) => sum + (row.size || 0), 0);
    const totalDataSizeBytes = totalSize - (tables.find((t) => t.name === '*Indexes*')?.size || 0) - (tables.find((t) => t.name === '*SQLite*')?.size || 0);

    res.json({ available: true, integrations, totalDataSizeBytes });
  } catch (error) {
    console.error('Error fetching integrations summary:', error);
    res.status(500).json({ error: 'Failed to fetch integrations' });
  }
});

app.get('/api/domains/summary', async (req: Request, res: Response) => {
  try {
    const entries = loadRegistryEntries();
    if (!entries.length) {
      return res.json({ available: false, domains: [] });
    }

    const domainSummary = summarizeRegistryByDomain(entries);
    const allEntities = await getEntitiesSummary(db, 0, { filter: '', sortBy: 'estimatedSizeBytes', order: 'desc', offset: 0 });
    const summaryMap = new Map(allEntities.map((entity) => [entity.entity, entity]));

    const domains = domainSummary.map((domain) => ({
      domain: domain.id,
      entityCount: domain.entityCount,
      estimatedSizeBytes: domain.entityIds.reduce((sum, entityId) => sum + (summaryMap.get(entityId)?.estimatedSizeBytes || 0), 0),
    })).sort((a, b) => b.estimatedSizeBytes - a.estimatedSizeBytes);

    const tables = await getTables(db);
    const totalSize = tables.reduce((sum, row) => sum + (row.size || 0), 0);
    const totalDataSizeBytes = totalSize - (tables.find((t) => t.name === '*Indexes*')?.size || 0) - (tables.find((t) => t.name === '*SQLite*')?.size || 0);

    res.json({ available: true, domains, totalDataSizeBytes });
  } catch (error) {
    console.error('Error fetching domains summary:', error);
    res.status(500).json({ error: 'Failed to fetch domains' });
  }
});

// Fallback to frontend for client-side routing
app.get('*', (req: Request, res: Response) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

app.listen(port, '0.0.0.0', () => {
  console.log(`DB Insights server running on http://0.0.0.0:${port}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  db.close();
  process.exit(0);
});
