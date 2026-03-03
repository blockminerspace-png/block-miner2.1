const path = require('path');
const fs = require('fs');

// Load environment variables
require('dotenv').config();

// Ensure DB_PATH is set for the config module
if (!process.env.DB_PATH) {
    process.env.DB_PATH = path.resolve(__dirname, '../data/blockminer.db');
}

async function testVulnerabilities() {
    console.log('--- Starting Verification Script ---');
    console.log('Current directory:', process.cwd());
    console.log('Script location:', __filename);

    const sqlitePath = path.resolve(__dirname, '../src/db/sqlite.js');
    console.log('Resolved sqlite path:', sqlitePath);

    if (!fs.existsSync(sqlitePath)) {
        console.error('ERROR: sqlite.js not found at', sqlitePath);
        process.exit(1);
    }

    console.log('Attempting to require database module...');
    let db;
    try {
        db = require(sqlitePath);
        console.log('Database module required successfully');
    } catch (err) {
        console.error('FAIL: Could not require database module:', err.message);
        console.error(err.stack);
        process.exit(1);
    }

    const { run, get, initializeDatabase } = db;

    console.log('--- Testing Database Unique Constraint for PTP Views ---');
    try {
        await initializeDatabase();
        console.log('Database initialized');

        // Use a high ad_id to avoid conflicts
        const TEST_AD_ID = 999999;
        const TEST_HASH = "test_fraud_hash_" + Date.now();

        await run('DELETE FROM ptp_views WHERE ad_id = ?', [TEST_AD_ID]);
        await run('INSERT INTO ptp_views (ad_id, viewer_hash) VALUES (?, ?)', [TEST_AD_ID, TEST_HASH]);
        console.log('First insert successful');

        try {
            await run('INSERT INTO ptp_views (ad_id, viewer_hash) VALUES (?, ?)', [TEST_AD_ID, TEST_HASH]);
            console.log('FAIL: Second insert should have failed due to unique constraint');
            process.exit(1);
        } catch (e) {
            if (e.message.includes('UNIQUE constraint failed')) {
                console.log('SUCCESS: Second insert failed as expected with UNIQUE constraint');
            } else {
                console.log('Unexpected error message:', e.message);
                process.exit(1);
            }
        }
    } catch (err) {
        console.error('Database test error:', err);
        process.exit(1);
    }

    console.log('--- All database tests passed ---');
    process.exit(0);
}

testVulnerabilities().catch(err => {
    console.error('Unhandled rejections:', err);
    process.exit(1);
});
