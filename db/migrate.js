/**
 * Data Migration Script: SQLite -> Supabase
 * 
 * Instructions:
 * 1. Ensure .env has SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (for bypass RLS)
 * 2. Run: node db/migrate.js
 */

const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const DB_PATH = path.join(__dirname, 'visionconnect.db');
const supabaseUrl = process.env.SUPABASE_URL;
// Use SERVICE ROLE KEY to bypass RLS during migration
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function migrate() {
    console.log('🚀 Starting Migration...');

    if (!fs.existsSync(DB_PATH)) {
        console.error('Error: visionconnect.db not found at', DB_PATH);
        return;
    }

    const SQL = await initSqlJs();
    const fileBuffer = fs.readFileSync(DB_PATH);
    const db = new SQL.Database(fileBuffer);

    // Helper to get rows from SQLite
    function getRows(sql) {
        const result = db.exec(sql);
        if (result.length === 0) return [];
        const { columns, values } = result[0];
        return values.map(row => {
            const obj = {};
            columns.forEach((col, i) => { obj[col] = row[i]; });
            return obj;
        });
    }

    const tables = ['users', 'profiles', 'jobs', 'applications', 'resumes'];

    for (const table of tables) {
        console.log(`\n📦 Migrating table: ${table}...`);
        const rows = getRows(`SELECT * FROM ${table}`);
        
        if (rows.length === 0) {
            console.log(`   - No data found in ${table}.`);
            continue;
        }

        // Remove SQLite specific auto-increment IDs to let Supabase generate them?
        // Actually, we should keep them to preserve relationships!
        // Supabase allows inserting into identity columns if we configure it or just override.
        
        // Split rows into batches of 100 for stability
        const batchSize = 100;
        for (let i = 0; i < rows.length; i += batchSize) {
            const batch = rows.slice(i, i + batchSize);
            const { error } = await supabase.from(table).insert(batch);
            
            if (error) {
                console.error(`   - ❌ Error in batch ${i}-${i+batch.length}:`, error.message);
            } else {
                console.log(`   - ✅ Successfully migrated ${i + batch.length}/${rows.length} rows.`);
            }
        }
    }

    console.log('\n✨ Migration Complete!');
}

migrate().catch(err => {
    console.error('Migration failed:', err);
});
