import sqlite3 from 'sqlite3';
import { promisify } from 'util';

const dbPath = 'c:\\Users\\joaop\\Desktop\\Block Miner\\admin-export-db-20260305-194835.db';
const db = new sqlite3.Database(dbPath);
const all = promisify(db.all.bind(db));

async function check() {
    try {
        console.log('--- Users Power Games ---');
        const gInfo = await all("PRAGMA table_info(users_powers_games)");
        console.log(gInfo);
        const activeGames = await all("SELECT count(*) as c FROM users_powers_games WHERE expires_at > strftime('%s', 'now') * 1000");
        console.log('Active game records:', activeGames[0].c);

        console.log('--- YouTube Watch Power ---');
        const yInfo = await all("PRAGMA table_info(youtube_watch_user_powers)");
        console.log(yInfo);
        const activeYt = await all("SELECT count(*) as c FROM youtube_watch_user_powers WHERE expires_at > strftime('%s', 'now') * 1000");
        console.log('Active YouTube records:', activeYt[0].c);

    } catch (e) {
        console.error(e);
    } finally {
        db.close();
    }
}

check();
