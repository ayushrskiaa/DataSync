import dotenv from 'dotenv';

// Load .env file in development, skip silently in production
dotenv.config({ path: '.env' });
