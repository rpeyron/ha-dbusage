#!/usr/bin/env node

/**
 * Home Assistant Recorder Database Sample Generator
 * Creates a sample SQLite database with realistic Home Assistant schema
 * for local development and testing
 */

const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'data', 'sample.db');
const REGISTRY_PATH = path.join(__dirname, 'data', 'core.entity_registry');

function initializeDatabase() {
  return new Promise((resolve, reject) => {
    // Ensure data directory exists
    const dataDir = path.dirname(DB_PATH);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    // Remove existing sample database if possible
    if (fs.existsSync(DB_PATH)) {
      try {
        fs.unlinkSync(DB_PATH);
      } catch (err) {
        if (err && err.code === 'EBUSY') {
          console.warn(`⚠️  Could not remove existing sample database (${DB_PATH}) because it is locked. Will continue using the existing file.`);
        } else {
          reject(err);
          return;
        }
      }
    }

    const db = new sqlite3.Database(DB_PATH, (err) => {
      if (err) {
        reject(err);
        return;
      }

      console.log('📦 Creating Home Assistant recorder schema...');
      
      // Enable query running in series
      db.serialize(() => {
        // Create states_meta table
        db.run(`
          CREATE TABLE IF NOT EXISTS states_meta (
            metadata_id INTEGER PRIMARY KEY,
            entity_id TEXT NOT NULL UNIQUE,
            entity_hash BLOB NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          )
        `);

        // Create state_attributes table
        db.run(`
          CREATE TABLE IF NOT EXISTS state_attributes (
            attributes_id INTEGER PRIMARY KEY,
            shared_attrs TEXT NOT NULL
          )
        `);

        // Create states table
        db.run(`
          CREATE TABLE IF NOT EXISTS states (
            state_id INTEGER PRIMARY KEY,
            entity_id TEXT NOT NULL,
            state TEXT NOT NULL,
            attributes_id INTEGER,
            event_id INTEGER,
            last_changed_ts REAL,
            last_updated_ts REAL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            metadata_id INTEGER,
            FOREIGN KEY (attributes_id) REFERENCES state_attributes (attributes_id),
            FOREIGN KEY (metadata_id) REFERENCES states_meta (metadata_id)
          )
        `);

        // Create events table
        db.run(`
          CREATE TABLE IF NOT EXISTS events (
            event_id INTEGER PRIMARY KEY,
            event_type TEXT NOT NULL,
            event_data TEXT,
            origin TEXT,
            time_fired TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          )
        `);

        // Create recording_runs table
        db.run(`
          CREATE TABLE IF NOT EXISTS recording_runs (
            run_id INTEGER PRIMARY KEY,
            start TIMESTAMP,
            end TIMESTAMP,
            closed_incorrect BOOLEAN DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          )
        `);

        // Create statistics_meta table
        db.run(`
          CREATE TABLE IF NOT EXISTS statistics_meta (
            id INTEGER PRIMARY KEY,
            statistic_id TEXT NOT NULL UNIQUE,
            source TEXT,
            unit_of_measurement TEXT,
            type TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          )
        `);

        // Create statistics table
        db.run(`
          CREATE TABLE IF NOT EXISTS statistics (
            id INTEGER PRIMARY KEY,
            metadata_id INTEGER NOT NULL,
            statistic_id TEXT NOT NULL,
            source TEXT,
            unit_of_measurement TEXT,
            type TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (metadata_id) REFERENCES statistics_meta (id)
          )
        `);

        // Create statistics_short_term table
        db.run(`
          CREATE TABLE IF NOT EXISTS statistics_short_term (
            id INTEGER PRIMARY KEY,
            metadata_id INTEGER NOT NULL,
            statistic_id TEXT NOT NULL,
            start TIMESTAMP NOT NULL,
            mean REAL,
            min REAL,
            max REAL,
            last_reset TIMESTAMP,
            state REAL,
            sum REAL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (metadata_id) REFERENCES statistics_meta (id)
          )
        `);

        // Enable PRAGMA for dbstat support
        db.run('PRAGMA journal_mode=WAL');
        db.run('PRAGMA synchronous=NORMAL');
        
        // After schema is created, insert sample data
        db.serialize(() => {
          insertSampleData(db, resolve, reject);
        });
      });
    });
  });
}

function insertSampleData(db, resolve, reject) {
  console.log('📝 Inserting sample data...');

  // Sample entities with realistic Home Assistant entity IDs
  const entities = [
    { id: 'sensor.living_room_temperature', name: 'Living Room Temperature' },
    { id: 'sensor.bedroom_temperature', name: 'Bedroom Temperature' },
    { id: 'sensor.kitchen_humidity', name: 'Kitchen Humidity' },
    { id: 'switch.bedroom_light', name: 'Bedroom Light' },
    { id: 'switch.living_room_light', name: 'Living Room Light' },
    { id: 'light.kitchen_light', name: 'Kitchen Light' },
    { id: 'binary_sensor.front_door', name: 'Front Door' },
    { id: 'binary_sensor.back_door', name: 'Back Door' },
    { id: 'climate.living_room', name: 'Living Room Climate' },
    { id: 'sensor.power_usage', name: 'Power Usage' },
    { id: 'sensor.water_usage', name: 'Water Usage' },
    { id: 'device_tracker.phone_1', name: 'Phone 1' },
    { id: 'device_tracker.phone_2', name: 'Phone 2' },
    { id: 'sensor.outdoor_temperature', name: 'Outdoor Temperature' },
    { id: 'sensor.air_quality', name: 'Air Quality' }
  ];

  let completed = 0;
  const total = entities.length;

  entities.forEach((entity, idx) => {
    // Insert into states_meta
    db.run(
      'INSERT INTO states_meta (entity_id, entity_hash) VALUES (?, ?)',
      [entity.id, Buffer.from(entity.id).toString('hex')],
      function(err) {
        if (err) {
          reject(err);
          return;
        }

        const metadataId = this.lastID;

        // Insert attributes
        const attrs = JSON.stringify({
          unit_of_measurement: entity.id.includes('temperature') ? '°C' : 
                              entity.id.includes('humidity') ? '%' : null,
          friendly_name: entity.name,
          icon: 'mdi:' + (entity.id.includes('light') ? 'lightbulb' :
                         entity.id.includes('temperature') ? 'thermometer' :
                         entity.id.includes('humidity') ? 'water-percent' :
                         entity.id.includes('door') ? 'door' :
                         entity.id.includes('climate') ? 'thermostat' :
                         entity.id.includes('power') ? 'power-plug' :
                         entity.id.includes('phone') ? 'phone' : 'help')
        });

        db.run(
          'INSERT INTO state_attributes (shared_attrs) VALUES (?)',
          [attrs],
          function(err) {
            if (err) {
              reject(err);
              return;
            }

            const attributesId = this.lastID;

            // Insert multiple state entries for each entity
            const states = [
              Math.random() > 0.5 ? 'on' : 'off',
              Math.random() > 0.5 ? 'on' : 'off',
              (20 + Math.random() * 15).toFixed(2),
              (20 + Math.random() * 15).toFixed(2),
              (40 + Math.random() * 40).toFixed(2)
            ];

            let statesInserted = 0;
            states.forEach((state) => {
              const now = Date.now() / 1000;
              db.run(
                `INSERT INTO states 
                 (entity_id, state, attributes_id, last_changed_ts, last_updated_ts, metadata_id) 
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [entity.id, state, attributesId, now - Math.random() * 86400, now - Math.random() * 3600, metadataId],
                (err) => {
                  if (err) {
                    reject(err);
                    return;
                  }
                  statesInserted++;
                  if (statesInserted === states.length) {
                    completed++;
                    console.log(`  ✓ ${completed}/${total} entities`);
                    if (completed === total) {
                      finalizeSampleDb(db, entities, resolve, reject);
                    }
                  }
                }
              );
            });
          }
        );

      }
    );
  });
}

function finalizeSampleDb(db, entities, resolve, reject) {
  console.log('📊 Finalizing database...');

  // Insert a recording run
  db.run(
    'INSERT INTO recording_runs (start, closed_incorrect) VALUES (datetime("now", "-30 days"), 0)',
    (err) => {
      if (err) {
        reject(err);
        return;
      }

      insertStatisticsData(db, (err) => {
        if (err) {
          reject(err);
          return;
        }

        // Create an index for faster queries (simulates dbstat)
        db.run('PRAGMA database_list', (err) => {
          if (err) {
            reject(err);
            return;
          }

          // Generate entity registry file
          try {
            generateEntityRegistry(entities);
          } catch (err) {
            console.warn('⚠️  Warning: Could not generate entity registry:', err.message);
          }

          console.log('✅ Sample database created at:', DB_PATH);
          db.close((err) => {
            if (err) {
              reject(err);
            } else {
              console.log('✅ Database connection closed');
              resolve();
            }
          });
        });
      });
    }
  );
}

function insertStatisticsData(db, callback) {
  console.log('📈 Inserting statistical sample data...');

  const statisticsRows = [
    { id: 'sensor.living_room_temperature', source: 'sensor.living_room_temperature', unit: '°C', type: 'temperature', base: 21.2 },
    { id: 'sensor.bedroom_temperature', source: 'sensor.bedroom_temperature', unit: '°C', type: 'temperature', base: 19.8 },
    { id: 'sensor.kitchen_humidity', source: 'sensor.kitchen_humidity', unit: '%', type: 'humidity', base: 45.0 },
    { id: 'sensor.power_usage', source: 'sensor.power_usage', unit: 'W', type: 'power', base: 120.0 },
    { id: 'sensor.water_usage', source: 'sensor.water_usage', unit: 'L', type: 'water', base: 12.0 },
    { id: 'sensor.air_quality', source: 'sensor.air_quality', unit: 'AQI', type: 'aqi', base: 25.0 }
  ];

  let insertedStats = 0;

  statisticsRows.forEach((row) => {
    db.run(
      'INSERT INTO statistics_meta (statistic_id, source, unit_of_measurement, type) VALUES (?, ?, ?, ?)',
      [row.id, row.source, row.unit, row.type],
      function(err) {
        if (err) {
          callback(err);
          return;
        }

        const metadataId = this.lastID;
        db.run(
          'INSERT INTO statistics (metadata_id, statistic_id, source, unit_of_measurement, type) VALUES (?, ?, ?, ?, ?)',
          [metadataId, row.id, row.source, row.unit, row.type],
          function(err) {
            if (err) {
              callback(err);
              return;
            }

            const shortTermEntries = [];
            const now = Date.now();
            for (let i = 6; i > 0; i--) {
              const startDate = new Date(now - i * 3600 * 1000).toISOString();
              const mean = row.base + (Math.random() - 0.5) * (row.type === 'humidity' ? 10 : 4);
              const min = mean - (Math.random() * 2 + 0.5);
              const max = mean + (Math.random() * 2 + 0.5);
              const state = mean + (Math.random() - 0.5);
              const sum = row.type === 'power' || row.type === 'water' ? mean * 60 : null;
              shortTermEntries.push({
                id: row.id,
                start: startDate,
                mean,
                min,
                max,
                last_reset: startDate,
                state,
                sum
              });
            }

            let insertedShortTerms = 0;
            shortTermEntries.forEach((entry) => {
              db.run(
                `INSERT INTO statistics_short_term (
                   metadata_id,
                   statistic_id,
                   start,
                   mean,
                   min,
                   max,
                   last_reset,
                   state,
                   sum
                 ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [metadataId, entry.id, entry.start, entry.mean, entry.min, entry.max, entry.last_reset, entry.state, entry.sum],
                (err) => {
                  if (err) {
                    callback(err);
                    return;
                  }
                  insertedShortTerms++;
                  if (insertedShortTerms === shortTermEntries.length) {
                    insertedStats++;
                    if (insertedStats === statisticsRows.length) {
                      callback(null);
                    }
                  }
                }
              );
            });
          }
        );
      }
    );
  });
}

function generateEntityRegistry(entities) {
  console.log('📋 Generating entity registry file...');

  const registry = {
    version: 1,
    minor_version: 1,
    key: 'core.entity_registry',
    data: {
      entities: entities.map((entity) => {
        const [platform, ...nameParts] = entity.id.split('.');
        const uniqueId = entity.id;
        
        return {
          entity_id: entity.id,
          config_entry_id: null,
          device_id: null,
          area_id: null,
          labels: [],
          name_by_user: null,
          icon: null,
          enabled_by_user: true,
          entity_category: null,
          has_entity_name: false,
          hidden_by_user: false,
          icon_name_by_user: null,
          original_icon: null,
          original_name: entity.name,
          platform: platform,
          translation_key: null,
          unique_id: uniqueId,
          previous_unique_id: null
        };
      })
    }
  };

  // Ensure data directory exists
  const dataDir = path.dirname(REGISTRY_PATH);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  fs.writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2));
  console.log('✅ Entity registry created at:', REGISTRY_PATH);

  return registry;
}


// Run the initialization
initializeDatabase()
  .then(() => {
    console.log('\n✅ Sample database ready for testing!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Error creating sample database:', error);
    process.exit(1);
  });
