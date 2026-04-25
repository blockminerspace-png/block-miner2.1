import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

async function check() {
    const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
    try {
        await client.connect();
        const res = await client.query('SELECT current_user, current_database()');
        console.log('User/DB:', res.rows[0]);
        const tables = await client.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'");
        console.log('Tables:', tables.rows.map(r => r.table_name));
        await client.end();
    } catch (err) {
        console.error(err);
    }
}
check();
