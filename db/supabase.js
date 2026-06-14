/**
 * Supabase Database Module
 * 
 * Replaces the SQLite database.js module.
 * Uses @supabase/supabase-js for cloud data persistence.
 */
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || (!supabaseAnonKey && !supabaseServiceKey)) {
    console.error('\x1b[31m%s\x1b[0m', 'CRITICAL ERROR: Supabase credentials missing in .env');
    console.error('Please ensure SUPABASE_URL and SUPABASE_ANON_KEY (or SERVICE_ROLE_KEY) are set.');
}

// In a Node.js server environment, use the service role key if available 
// to perform administrative actions (bypassing RLS).
const supabase = createClient(supabaseUrl, supabaseServiceKey || supabaseAnonKey);

/**
 * Helper: Run a SELECT query and return all results.
 * @param {string} table - Table name
 * @param {Object} match - Filter object (optional)
 * @param {string} select - Columns to select (default: '*')
 * @returns {Promise<Array<Object>>}
 */
async function queryAll(table, match = {}, select = '*') {
    const { data, error } = await supabase
        .from(table)
        .select(select)
        .match(match);
    
    if (error) {
        console.error(`Supabase Error (queryAll ${table}):`, error.message);
        throw error;
    }
    return data || [];
}

/**
 * Helper: Run a SELECT query and return the first result.
 * @param {string} table - Table name
 * @param {Object} match - Filter object
 * @param {string} select - Columns to select
 * @returns {Promise<Object|null>}
 */
async function queryOne(table, match = {}, select = '*') {
    const { data, error } = await supabase
        .from(table)
        .select(select)
        .match(match)
        .limit(1)
        .maybeSingle();
    
    if (error) {
        console.error(`Supabase Error (queryOne ${table}):`, error.message);
        throw error;
    }
    return data;
}

/**
 * Helper: Run INSERT/UPDATE/DELETE.
 * @param {string} method - 'insert' | 'update' | 'delete'
 * @param {string} table - Table name
 * @param {Object|Array} payload - Data to insert/update
 * @param {Object} match - Filter for update/delete
 * @returns {Promise<Object>} The resulting data or { changes }
 */
async function runStmt(method, table, payload = {}, match = {}) {
    let query = supabase.from(table);

    if (method === 'insert') {
        query = query.insert(payload).select();
    } else if (method === 'update') {
        query = query.update(payload).match(match).select();
    } else if (method === 'delete') {
        query = query.delete().match(match).select();
    }

    const { data, error } = await query;

    if (error) {
        console.error(`Supabase Error (${method} ${table}):`, error.message);
        throw error;
    }

    return { 
        data: data, 
        lastInsertRowid: (data && data.length > 0) ? data[0].id : null,
        changes: (data && data.length > 0) ? data.length : 0
    };
}

/**
 * Helper for raw SQL (Use sparingly, Supabase client methods preferred)
 * Note: Supabase doesn't support arbitrary SQL via JS client for security.
 * This is a placeholder or can be implemented via Supabase RPC if needed.
 */
async function rpc(name, params = {}) {
    const { data, error } = await supabase.rpc(name, params);
    if (error) throw error;
    return data;
}

module.exports = { supabase, queryAll, queryOne, runStmt, rpc };
