import sqlite3 from 'sqlite3';

interface TableInfo {
  name: string;
  size: number;
  payload: number;
  count: number;
}

export async function getTables(db: sqlite3.Database): Promise<TableInfo[]> {
  return new Promise((resolve, reject) => {
    db.all(
      `select name, sum(pgsize) as size, sum(payload) as payload, sum(ncell) as count from dbstat where name not like "ix_%" and name not like "sqlite_%"  group by name
      union all
      select "*Indexes*" as name, sum(pgsize) as size, sum(payload) as payload, sum(ncell) as count from dbstat where name like "ix_%"
      union all
      select "*SQLite*" as name, sum(pgsize) as size, sum(payload) as payload, sum(ncell) as count from dbstat where name like "sqlite_%"`,
      (err, rows: any[]) => {
        if (err) reject(err);
        else resolve((rows || []).map(r => ({
          name: r.name,
          size: Math.round(r.size),
          payload: r.payload,
          count: r.count,
        })));
      }
    );
  });
}
