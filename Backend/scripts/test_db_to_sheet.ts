
import { Client } from 'pg';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env') });

const dbConfig = {
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: parseInt(process.env.DB_PORT || '5432'),
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined
};

async function testSync() {
  const client = new Client(dbConfig);

  try {
    console.log('Connecting to database...');
    await client.connect();
    console.log('Connected.');

    // 1. Get the first active sync config
    const res = await client.query('SELECT * FROM _sync_config WHERE is_active = true LIMIT 1');
    if (res.rows.length === 0) {
      console.log('No active sync configurations found. Please start the app and configure a sync first.');
      return;
    }

    const syncConfig = res.rows[0];
    console.log(`Found active sync for table: ${syncConfig.table_name} (Sheet ID: ${syncConfig.sheet_id})`);

    // 2. Get table schema to know what columns to insert
    const tableRes = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = $1
    `, [syncConfig.table_name]);

    const columns = tableRes.rows.filter(c => 
      c.column_name !== 'id' && 
      c.column_name !== 'created_at' && 
      c.column_name !== 'updated_at'
    );

    if (columns.length === 0) {
      console.log('No suitable columns found to insert test data.');
      return;
    }

    // 3. Construct a test row
    const testData: Record<string, any> = {};
    const timestamp = new Date().toISOString();
    
    for (const col of columns) {
      testData[col.column_name] = `Test_${timestamp}`;
    }

    // 4. Insert the row
    const colNames = Object.keys(testData).map(k => `"${k}"`).join(', ');
    const placeHolders = Object.keys(testData).map((_, i) => `$${i + 1}`).join(', ');
    const values = Object.values(testData);

    console.log(`Inserting test row into ${syncConfig.table_name}...`);
    const insertRes = await client.query(
      `INSERT INTO "${syncConfig.table_name}" (${colNames}) VALUES (${placeHolders}) RETURNING id`,
      values
    );

    console.log(`✅ Successfully inserted row with ID: ${insertRes.rows[0].id}`);
    console.log('👉 Check your Google Sheet in a few seconds to see this new row!');

  } catch (error) {
    console.error('Test failed:', error);
  } finally {
    await client.end();
  }
}

testSync();
