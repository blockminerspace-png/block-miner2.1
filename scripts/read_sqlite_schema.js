import sqlite3 from 'sqlite3';
import { promisify } from 'util';
import fs from 'fs';

async function main() {
    const dbPath = 'c:\\Users\\joaop\\Desktop\\Block Miner\\admin-export-db-20260305-194835.db';

    const db = new sqlite3.Database(dbPath);
    const all = promisify(db.all.bind(db));
    const get = promisify(db.get.bind(db));

    let output = '';

    try {
        output += '--- TABLES ---\n';
        const tables = await all("SELECT name FROM sqlite_master WHERE type='table'");
        for (const table of tables) {
            output += `Table: ${table.name}\n`;
            const schema = await all(`PRAGMA table_info(${table.name})`);
            output += JSON.stringify(schema, null, 2) + '\n';

            // Preview data
            const row = await get(`SELECT COUNT(*) as count FROM ${table.name}`);
            output += `Count: ${row.count}\n`;
            if (row.count > 0) {
                const preview = await all(`SELECT * FROM ${table.name} LIMIT 3`);
                output += 'Preview:' + JSON.stringify(preview, null, 2) + '\n';
            }
            output += '----------------\n';
        }

        db.close();
        fs.writeFileSync('c:\\Users\\joaop\\Desktop\\Block Miner\\scripts\\schema_dump_utf8.txt', output);
        console.log('Dump completed to scripts/schema_dump_utf8.txt');
    } catch (err) {
        console.error('Error reading database:', err);
    }
}

main();
