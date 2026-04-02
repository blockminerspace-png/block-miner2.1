require('dotenv').config();
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'blockminer.db');
console.log(`Opening DB at: ${dbPath}\n`);

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening DB:', err.message);
    process.exit(1);
  }

  // Wrapper for async queries
  function get(sql, params = []) {
    return new Promise((resolve, reject) => {
      db.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row || null);
      });
    });
  }

  function all(sql, params = []) {
    return new Promise((resolve, reject) => {
      db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
  }

  async function main() {
    try {
      console.log('Checking SQLite tables...\n');

      const tables = await all("SELECT name, type FROM sqlite_master WHERE type IN ('table','view') ORDER BY name");
      if (!tables || tables.length === 0) {
        console.log('No tables found in DB.');
        db.close();
        process.exit(0);
      }

      console.log(`Found ${tables.length} tables/views:`);
      for (const t of tables) {
        console.log(` - ${t.name}`);
      }

      const row = await get("SELECT name FROM sqlite_master WHERE type='table' AND name='auto_mining_rewards'");
      if (row && row.name === 'auto_mining_rewards') {
        console.log('\n✓ Table `auto_mining_rewards` EXISTS.');
        const rewards = await all('SELECT id, name, slug, is_active FROM auto_mining_rewards ORDER BY id DESC LIMIT 20');
        console.log(`\nSample rows (${rewards.length}):`);
        if (rewards.length > 0) {
          console.table(rewards);
        } else {
          console.log('(no rows)');
        }
      } else {
        console.log('\n✗ Table `auto_mining_rewards` NOT found.');
      }
    } catch (err) {
      console.error('Error while checking DB:', err && (err.stack || err.message || err));
      process.exit(2);
    } finally {
      db.close();
    }
  }

  main();
});
