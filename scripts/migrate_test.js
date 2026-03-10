import sqlite3 from 'sqlite3';
import { PrismaClient } from '@prisma/client';
import { promisify } from 'util';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();

const prisma = new PrismaClient({
    datasources: {
        db: {
            url: "postgresql://blockminer:blockminer_password@127.0.0.1:5432/blockminer_db?schema=public"
        }
    }
});

async function migrate() {
    console.log('--- DB CONNECTION TEST ---');
    console.log('URL:', process.env.DATABASE_URL);

    try {
        await prisma.$connect();
        console.log('Prisma connected!');

        const userCount = await prisma.user.count();
        console.log('Current User Count:', userCount);

        const dbPath = 'c:\\Users\\joaop\\Desktop\\Block Miner\\admin-export-db-20260305-194835.db';
        const db = new sqlite3.Database(dbPath);
        const all = promisify(db.all.bind(db));

        console.log('Reading SQLite users...');
        const sqliteUsers = await all('SELECT * FROM users');
        console.log('SQLite Users found:', sqliteUsers.length);

        // Finalize migration logic here after confirming this works

        db.close();
    } catch (e) {
        console.error('FATAL ERROR:');
        console.error(e);
        fs.writeFileSync('c:\\Users\\joaop\\Desktop\\Block Miner\\scripts\\migration_debug_final.txt', JSON.stringify({
            name: e.name,
            message: e.message,
            stack: e.stack,
            code: e.code,
            clientVersion: e.clientVersion
        }, null, 2));
    } finally {
        await prisma.$disconnect();
    }
}

migrate();
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
