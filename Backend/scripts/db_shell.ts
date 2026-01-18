
import { Client } from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import readline from 'readline';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env') });

const connectionString = process.env.DATABASE_URL;

const dbConfig: any = connectionString 
  ? { 
      connectionString,
      ssl: { rejectUnauthorized: false } // Render requires SSL
    }
  : {
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      port: parseInt(process.env.DB_PORT || '5432'),
      ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined
    };

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

async function interactiveShell() {
  const client = new Client(dbConfig);

  try {
    console.log('Connecting to database...');
    await client.connect();
    console.log('Connected! Type "exit" to quit.');
    console.log('Type "tables" to list tables.');

    const askQuery = () => {
      rl.question('\nSQL> ', async (query) => {
        if (query.trim().toLowerCase() === 'exit') {
          await client.end();
          rl.close();
          return;
        }

        if (query.trim().toLowerCase() === 'tables') {
          query = `SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name;`;
        }

        try {
          const start = Date.now();
          const res = await client.query(query);
          const duration = Date.now() - start;
          
          console.log(`\nResult (${res.rowCount} rows, ${duration}ms):`);
          if (res.rows.length > 0) {
            console.table(res.rows);
          } else {
            console.log('(No rows returned)');
          }
        } catch (err: any) {
          console.error('Error:', err.message);
        }

        askQuery();
      });
    };

    askQuery();

  } catch (error) {
    console.error('Connection failed:', error);
    await client.end();
    rl.close();
  }
}

interactiveShell();
