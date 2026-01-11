# PostgreSQL Migration Guide

Your app currently uses MySQL, but Render's free tier uses PostgreSQL. The good news: **mysql2 package is compatible with PostgreSQL** with minimal changes!

## Option 1: Use PostgreSQL (Recommended for Render)

### Step 1: Install PostgreSQL Driver

```bash
cd Backend
npm install pg
```

### Step 2: Update Database Connection

No changes needed! Your `DatabaseManager.ts` uses mysql2's connection pool which is compatible.

### Step 3: SQL Syntax Differences

Most queries work the same, but here are the key differences:

| Feature | MySQL | PostgreSQL |
|---------|-------|------------|
| Auto Increment | `AUTO_INCREMENT` | `SERIAL` or `BIGSERIAL` |
| JSON Type | `JSON` | `JSONB` (better performance) |
| ENUM | `ENUM('a','b')` | `VARCHAR CHECK` or native ENUM |
| String Concat | `CONCAT()` | `\|\|` or `CONCAT()` |
| Case Sensitivity | Case-insensitive | Case-sensitive |
| Boolean | `TRUE/FALSE` (stored as tinyint) | `TRUE/FALSE` (native boolean) |
| Timestamp | `TIMESTAMP DEFAULT CURRENT_TIMESTAMP` | `TIMESTAMP DEFAULT CURRENT_TIMESTAMP` (same!) |

### Step 4: Update Trigger Creation

PostgreSQL triggers use functions. I've already created `init-postgres.sql` with the correct PostgreSQL syntax!

### Step 5: Test Locally (Optional)

If you want to test with PostgreSQL locally:

```bash
# Install PostgreSQL from https://www.postgresql.org/download/windows/

# Or use Docker
docker run -d \
  --name postgres-local \
  -e POSTGRES_USER=superjoin_user \
  -e POSTGRES_PASSWORD=superjoin_pass \
  -e POSTGRES_DB=superjoin_db \
  -p 5432:5432 \
  postgres:15

# Update .env
DB_HOST=localhost
DB_PORT=5432
```

## Option 2: Keep MySQL (Use External Service)

If you prefer to stick with MySQL:

### Use PlanetScale (Free MySQL)

1. Go to https://planetscale.com
2. Create free database
3. Get connection string
4. Use in Render backend environment variables

**Pros:**
- No code changes needed
- Better for production MySQL features

**Cons:**
- Additional service to manage
- Connection might be slower (external)

## What I Recommend

**Use PostgreSQL on Render** because:
- ✅ All-in-one on Render (simpler)
- ✅ Free tier included
- ✅ Faster internal connections
- ✅ Minimal code changes needed
- ✅ I've already created the PostgreSQL init script!

## Files Already Updated

✅ `Backend/init-postgres.sql` - PostgreSQL schema
✅ `render.yaml` - Auto-deployment config
✅ `RENDER_DEPLOYMENT.md` - Step-by-step guide

## Next Steps

1. **Push changes to GitHub:**
   ```bash
   git add .
   git commit -m "Add Render deployment with PostgreSQL support"
   git push origin main
   ```

2. **Follow RENDER_DEPLOYMENT.md** to deploy

Need help with anything? I'm here!
