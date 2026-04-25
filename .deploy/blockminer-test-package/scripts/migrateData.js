import sqlite3 from 'sqlite3';
import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import pkg from '@prisma/client';
const { PrismaClient } = pkg;
import { promisify } from 'util';
import dotenv from 'dotenv';

dotenv.config();

const connectionString = process.env.DATABASE_URL;
const pool = new pg.Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const dbPath = 'c:\\Users\\joaop\\Desktop\\Block Miner\\admin-export-db-20260305-194835.db';

async function migrate() {
    console.log('--- Starting Migration ---');

    try {
        console.log('Checking Prisma connection...');
        await prisma.$connect();
        console.log('Prisma connected successfully!');
    } catch (e) {
        console.error('Prisma connection FAILED:');
        console.error(e.name);
        console.error(e.message);
        console.error(e.stack);
        process.exit(1);
    }

    const db = new sqlite3.Database(dbPath);
    const all = promisify(db.all.bind(db));

    try {
        console.log('Migrating users...');
        const sqliteUsers = await all('SELECT * FROM users');
        const sqliteUserPower = await all('SELECT * FROM users_temp_power');
        const sqliteWallets = await all('SELECT * FROM users_wallets');

        const powerMap = new Map(sqliteUserPower.map(p => [p.user_id, p]));
        const walletMap = new Map(sqliteWallets.map(w => [w.user_id, w.wallet_address]));

        // 0. Migrate Miners Catalog
        console.log('Migrating miners catalog...');
        const sqliteMinersCatalog = await all('SELECT * FROM miners');
        for (const sm of sqliteMinersCatalog) {
            await prisma.miner.upsert({
                where: { id: sm.id },
                update: {},
                create: {
                    id: sm.id,
                    name: sm.name,
                    slug: sm.slug,
                    baseHashRate: sm.base_hash_rate,
                    price: sm.price,
                    slotSize: sm.slot_size,
                    imageUrl: sm.image_url,
                    isActive: sm.is_active === 1,
                    showInShop: sm.show_in_shop === 1,
                    createdAt: new Date(sm.created_at * 1000)
                }
            });
        }

        // 0.1 Migrate Games Catalog
        console.log('Migrating games catalog...');
        await prisma.game.upsert({
            where: { id: 1 },
            update: {},
            create: {
                id: 1,
                name: 'Default Game',
                slug: 'default-game',
                isActive: true
            }
        });

        for (const sUser of sqliteUsers) {
            const power = powerMap.get(sUser.id) || {};
            const walletAddress = walletMap.get(sUser.id) || null;

            const existingUser = await prisma.user.findUnique({ where: { email: sUser.email } });

            if (existingUser) {
                console.log(`Skipping existing user: ${sUser.email}`);
                continue;
            }

            await prisma.user.create({
                data: {
                    name: sUser.name,
                    username: sUser.username,
                    email: sUser.email,
                    passwordHash: sUser.password_hash,
                    createdAt: new Date(sUser.created_at),
                    lastLoginAt: sUser.last_login_at ? new Date(sUser.last_login_at) : null,
                    ip: sUser.ip,
                    userAgent: sUser.user_agent,
                    isBanned: sUser.is_banned === 1,
                    refCode: sUser.ref_code,
                    referredBy: sUser.referred_by,
                    walletAddress: walletAddress,
                    polBalance: sUser.pol_balance,
                    btcBalance: sUser.btc_balance,
                    ethBalance: sUser.eth_balance,
                    usdtBalance: sUser.usdt_balance,
                    usdcBalance: sUser.usdc_balance,
                    zerBalance: sUser.zer_balance,
                    oldId: sUser.id,
                    oldLifetimeMined: power.lifetime_mined || 0,
                    totalWithdrawn: power.total_withdrawn || 0,
                    rigsCount: power.rigs || 0,
                    baseHashRate: power.base_hash_rate || 0
                }
            });
            console.log(`Migrated user: ${sUser.email}`);
        }

        // 2. Migrate User Miners
        console.log('Migrating user miners...');
        const sqliteUserMiners = await all('SELECT * FROM user_miners');
        for (const sum of sqliteUserMiners) {
            const user = await prisma.user.findFirst({ where: { oldId: sum.user_id } });
            if (!user) continue;

            await prisma.userMiner.create({
                data: {
                    userId: user.id,
                    minerId: sum.miner_id,
                    slotIndex: sum.slot_index,
                    level: sum.level,
                    hashRate: sum.hash_rate,
                    slotSize: sum.slot_size,
                    imageUrl: sum.image_url,
                    isActive: sum.is_active === 1,
                    purchasedAt: new Date(sum.purchased_at)
                }
            });
        }

        // 3. Migrate User Inventory
        console.log('Migrating user inventory...');
        const sqliteInventory = await all('SELECT * FROM user_inventory');
        for (const si of sqliteInventory) {
            const user = await prisma.user.findFirst({ where: { oldId: si.user_id } });
            if (!user) continue;

            await prisma.userInventory.create({
                data: {
                    userId: user.id,
                    minerId: si.miner_id,
                    minerName: si.miner_name,
                    level: si.level,
                    hashRate: si.hash_rate,
                    slotSize: si.slot_size,
                    imageUrl: si.image_url,
                    acquiredAt: new Date(si.acquired_at)
                }
            });
        }

        // 4. Migrate Daily Checkins
        console.log('Migrating checkins...');
        const sqliteCheckins = await all('SELECT * FROM daily_checkins');
        for (const sc of sqliteCheckins) {
            const user = await prisma.user.findFirst({ where: { oldId: sc.user_id } });
            if (!user) continue;

            await prisma.dailyCheckin.create({
                data: {
                    userId: user.id,
                    checkinDate: sc.checkin_date,
                    createdAt: new Date(sc.created_at),
                    confirmedAt: sc.confirmed_at ? new Date(sc.confirmed_at) : null,
                    txHash: sc.tx_hash,
                    status: sc.status,
                    amount: sc.amount,
                    chainId: sc.chain_id
                }
            });
        }

        // 5. Migrate Transactions
        console.log('Migrating transactions...');
        const sqliteTransactions = await all('SELECT * FROM transactions');
        for (const st of sqliteTransactions) {
            const user = await prisma.user.findFirst({ where: { oldId: st.user_id } });
            if (!user) continue;

            await prisma.transaction.create({
                data: {
                    userId: user.id,
                    type: st.type,
                    amount: st.amount,
                    address: st.address,
                    txHash: st.tx_hash,
                    status: st.status,
                    createdAt: new Date(st.created_at)
                }
            });
        }

        // 6. Migrate UserPowerGame (only active ones)
        console.log('Migrating active game powers...');
        const now = Math.floor(Date.now() / 1000);
        const sqliteGamePowers = await all('SELECT * FROM users_powers_games WHERE expires_at > ?', [now]);
        for (const sgp of sqliteGamePowers) {
            const user = await prisma.user.findFirst({ where: { oldId: sgp.user_id } });
            if (!user) continue;

            await prisma.userPowerGame.create({
                data: {
                    userId: user.id,
                    gameId: sgp.game_id || 1,
                    hashRate: sgp.hash_rate,
                    playedAt: new Date(sgp.played_at * 1000),
                    expiresAt: new Date(sgp.expires_at * 1000),
                    checkinId: sgp.checkin_id
                }
            });
        }

        console.log('--- Migration Completed ---');
    } catch (err) {
        console.error('Migration error:', err.message);
        console.error(err.stack);
    } finally {
        db.close();
        await prisma.$disconnect();
    }
}

migrate();
