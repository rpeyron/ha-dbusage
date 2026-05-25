# Home Assistant DB Usage Add-on Requirements

This repository is a Home Assistant Supervisor add-on implemented in Node.js and TypeScript. It inspects the recorder SQLite database and provides a web UI to explore table usage, entity statistics, integration summaries, and database cleanup guidance.

## Current repository state

Required root files:
- `config.json`
- `config.yaml`
- `repository.yaml`
- `Dockerfile`
- `run.sh`
- `package.json`
- `tsconfig.json`
- `tsconfig.frontend.json`
- `src/`
- `public/`
- `tests/`

Optional runtime artifacts:
- `dist/` is produced by the build and does not need to be committed.
- `core.entity_registry` and `core.device_registry` sample files may be present for local validation.

## Dependencies

Runtime dependencies:
- `express`
- `sqlite3`

Dev dependencies:
- `typescript`
- `ts-node`
- `@types/node`
- `@types/express`
- `vite`

## Build and run commands

The repository must support:
- `npm run dev` → build and run the backend in watch mode
- `npm run build` → compile backend and frontend using Vite
- `npm start` → run the compiled backend
- `npm test` → run smoke tests

## Add-on behavior

The add-on must:
- Use `/config/home-assistant_v2.db` as the default recorder database path
- Support `HOME_ASSISTANT_URL` environment variable for Home Assistant URL construction
- Serve UI assets and backend endpoints from the same container
- Expose a valid `webui` entrypoint in the add-on manifest
- Keep all backend URLs relative
- Use SQL parameter binding for user-supplied values
- Implement frontend caching to reduce API calls and improve performance
- Support background preload of non-active tabs at startup

## Functional requirements

### Table Screen
- Display actual SQLite file size, total size, index size, and metadata size
- Show a data-only total computed as `total tables size - indexes - SQLite metadata`

### Entity Screen
- Support filtering by entity name, integration, and domain
- Support sorting by multiple fields
- Support pagination with configurable page size (10, 20, 50, 100, all)
- Show estimated size per entity including states, attributes, and statistics
- Display top-level summary with:
  - Selected entities count and size
  - All entities count and size
  - Total recorder data-only size
- Generate YAML button for recorder exclusion configuration
- Cache filtered entity lists to avoid redundant API calls
- Reuse global totals when filters are empty

### Integration Screen
- Group entities by integration
- Show integration entity counts, estimated size, percent of total data size
- Display total estimated integration size summary
- Allow direct navigation to integration entities

### Domain Screen
- Group entities by domain
- Show domain entity counts, estimated size, percent of total data size
- Display total estimated domain size summary
- Generate YAML button for domain-specific exclusions

### Cleanup Guide Screen
- Provide step-by-step database cleanup instructions
- Explain recorder configuration in `configuration.yaml`
- Guide users through creating backups
- Provide direct links to Home Assistant Developer Tools (Actions, Statistics)
- Explain purge operation (states cleanup only)
- Explain statistics cleanup process
- Provide troubleshooting guidance

## API requirements

Supported endpoints must include at least:
- `GET /api/tables` - Returns table sizes and database file size
- `GET /api/entities/summary` - Returns entity statistics with filtering, sorting, pagination
- `GET /api/entities/totals` - Returns total entity counts and sizes
- `GET /api/integrations/list` - Returns available integrations
- `GET /api/integrations/summary` - Returns integration-grouped entity statistics
- `GET /api/domains/list` - Returns available domains
- `GET /api/domains/summary` - Returns domain-grouped entity statistics
- `GET /api/entities/:entity/attributes` - Returns recent state attributes
- `GET /api/entities/:entity/history-link` - Returns Home Assistant history link
- `GET /api/entities/:entity/details-link` - Returns Home Assistant developer tools link

## Frontend requirements

The frontend must:
- Use vanilla TypeScript with no UI framework
- Be compiled by Vite into optimized assets
- Provide modular organization with separate files for each tab:
  - `src/app/index.ts` - Main routing and initialization
  - `src/app/tables.ts` - Tables tab logic
  - `src/app/entities.ts` - Entities tab logic with caching
  - `src/app/integrations.ts` - Integrations tab logic
  - `src/app/domains.ts` - Domains tab logic
  - `src/app/cleanup.ts` - Cleanup guide
  - `src/app/common.ts` - Shared utilities and caching
- Implement Promise-based request deduplication for concurrent API calls
- Cache entity list data, totals, and integration/domain summaries
- Preload non-active tabs in the background at application startup
- Reuse cached global totals for empty-filter queries
- Provide:
  - Table view for database tables
  - Entity view with filtering, sorting, pagination, and estimated size display
  - Integration summary tab with integration-grouped data
  - Domain summary tab with domain-grouped data
  - Cleanup guide tab with step-by-step instructions
  - Responsive design for desktop and mobile

## Packaging requirements

The add-on must be packaged for Home Assistant Supervisor using:
- `config.json` and optionally `config.yaml`
- `repository.yaml` for custom repository metadata
- `Dockerfile` that builds the TypeScript sources and runs the compiled server
- `run.sh` that starts `node dist/server.js`

## Acceptance criteria

The repository must:
- Build successfully with `npm run build`
- Run successfully with `npm start`
- Serve the frontend UI correctly with all 5 tabs (Tables, Entities, Integrations, Domains, Cleanup)
- Return valid JSON from `/api/*` endpoints
- Pass the smoke tests in `tests/`
- Support URL hash-based navigation for tab persistence
- Support entity filtering, sorting, and pagination
- Cache API responses to reduce unnecessary requests
- Preload non-active tabs at startup to warm caches
- Provide YAML generation for recorder configuration
- Reflect the current file layout and dependency list

