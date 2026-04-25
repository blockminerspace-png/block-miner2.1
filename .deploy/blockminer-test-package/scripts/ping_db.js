import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

async function ping() {
    const client = new pg.Client({
        connectionString: process.env.DATABASE_URL
    });

    try {
        await client.connect();
        console.log('Successfully connected to the database!');
        const res = await client.query('SELECT NOW()');
        console.log('Database time:', res.rows[0]);
        await client.end();
    } catch (err) {
        console.error('Failed to connect to the database:', err.message);
        console.error('Connection details:', {
            url: process.env.DATABASE_URL
        });
    }
}

ping();
