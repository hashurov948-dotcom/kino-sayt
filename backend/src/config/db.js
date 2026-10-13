const { Pool } = require('pg');
require('dotenv').config();

const connectionString = process.env.DATABASE_URL || 'postgresql://postgres.urhqjgjyelxzfcprbdhw:AshirovHusan@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres';

const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false }
});

pool.on('error', (err) => {
  console.error('PostgreSQL xatosi:', err.message);
});

module.exports = pool;