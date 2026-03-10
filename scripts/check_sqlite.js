import sqlite3 from 'sqlite3';
import { promisify } from 'util';

const db = new sqlite3.Database('c:/Users/joaop/Desktop/Block Miner/admin-export-db-20260305-194835.db');
const all = promisify(db.all.bind(db));

async function check() {
    const tables = await all("SELECT name FROM sqlite_master WHERE type='table'");
    console.log('Tables:', tables.map(t => t.name));

    if (tables.some(t => t.name === 'miners')) {
        const miners = await all("SELECT * FROM miners");
        console.log('Miners found:', miners.length);
        console.log('Sample miner:', miners[0]);
    } else {
        console.log('No miners table found!');
    }
    db.close();
}

check();
