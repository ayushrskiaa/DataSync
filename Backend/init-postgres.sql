-- PostgreSQL version of init.sql
-- Initialize database schema for Render deployment

-- Changelog table to track all changes from MySQL side
CREATE TABLE IF NOT EXISTS _sync_changelog (
    id BIGSERIAL PRIMARY KEY,
    table_name VARCHAR(255) NOT NULL,
    operation VARCHAR(10) CHECK (operation IN ('INSERT', 'UPDATE', 'DELETE')) NOT NULL,
    row_id VARCHAR(255) NOT NULL,
    old_data JSONB,
    new_data JSONB,
    timestamp TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    synced BOOLEAN DEFAULT FALSE,
    sync_timestamp TIMESTAMP(6) NULL
);

CREATE INDEX IF NOT EXISTS idx_synced ON _sync_changelog(synced, timestamp);
CREATE INDEX IF NOT EXISTS idx_table_operation ON _sync_changelog(table_name, operation, timestamp);

-- Sync state table to track sync configuration and status
CREATE TABLE IF NOT EXISTS _sync_state (
    id SERIAL PRIMARY KEY,
    sheet_id VARCHAR(255) NOT NULL UNIQUE,
    sheet_name VARCHAR(255),
    table_name VARCHAR(255) NOT NULL,
    last_sync_timestamp TIMESTAMP(6) NULL,
    last_sheet_sync VARCHAR(50),
    status VARCHAR(10) CHECK (status IN ('active', 'paused', 'error')) DEFAULT 'active',
    error_message TEXT,
    conflict_resolution VARCHAR(20) CHECK (conflict_resolution IN ('last_write_wins', 'manual', 'sheet_priority', 'db_priority')) DEFAULT 'last_write_wins',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_status ON _sync_state(status);
CREATE INDEX IF NOT EXISTS idx_table ON _sync_state(table_name);

-- Conflict log table for tracking and resolving conflicts
CREATE TABLE IF NOT EXISTS _sync_conflicts (
    id BIGSERIAL PRIMARY KEY,
    sync_state_id INTEGER NOT NULL,
    row_identifier VARCHAR(255) NOT NULL,
    conflict_type VARCHAR(20) CHECK (conflict_type IN ('concurrent_update', 'delete_update', 'schema_mismatch')) NOT NULL,
    sheet_data JSONB,
    db_data JSONB,
    sheet_timestamp TIMESTAMP(6),
    db_timestamp TIMESTAMP(6),
    resolution VARCHAR(10) CHECK (resolution IN ('pending', 'sheet_wins', 'db_wins', 'merged', 'manual')) DEFAULT 'pending',
    resolved_data JSONB,
    resolved_at TIMESTAMP(6) NULL,
    resolved_by VARCHAR(255),
    created_at TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (sync_state_id) REFERENCES _sync_state(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_resolution ON _sync_conflicts(resolution, created_at);
CREATE INDEX IF NOT EXISTS idx_sync_state ON _sync_conflicts(sync_state_id, conflict_type);

-- Example user table for testing
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    age INTEGER,
    department VARCHAR(100),
    salary DECIMAL(10, 2),
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert sample data
INSERT INTO users (name, email, age, department, salary, active) VALUES
('John Doe', 'john@example.com', 30, 'Engineering', 85000.00, TRUE),
('Jane Smith', 'jane@example.com', 28, 'Marketing', 75000.00, TRUE),
('Bob Johnson', 'bob@example.com', 35, 'Sales', 90000.00, TRUE)
ON CONFLICT (email) DO NOTHING;

-- Create trigger function for tracking changes
CREATE OR REPLACE FUNCTION track_user_changes()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'INSERT') THEN
        INSERT INTO _sync_changelog (table_name, operation, row_id, new_data, timestamp)
        VALUES (
            TG_TABLE_NAME,
            'INSERT',
            NEW.id::TEXT,
            to_jsonb(NEW),
            CURRENT_TIMESTAMP
        );
        RETURN NEW;
    ELSIF (TG_OP = 'UPDATE') THEN
        INSERT INTO _sync_changelog (table_name, operation, row_id, old_data, new_data, timestamp)
        VALUES (
            TG_TABLE_NAME,
            'UPDATE',
            NEW.id::TEXT,
            to_jsonb(OLD),
            to_jsonb(NEW),
            CURRENT_TIMESTAMP
        );
        RETURN NEW;
    ELSIF (TG_OP = 'DELETE') THEN
        INSERT INTO _sync_changelog (table_name, operation, row_id, old_data, timestamp)
        VALUES (
            TG_TABLE_NAME,
            'DELETE',
            OLD.id::TEXT,
            to_jsonb(OLD),
            CURRENT_TIMESTAMP
        );
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for users table
DROP TRIGGER IF EXISTS users_after_insert ON users;
DROP TRIGGER IF EXISTS users_after_update ON users;
DROP TRIGGER IF EXISTS users_after_delete ON users;

CREATE TRIGGER users_after_insert
    AFTER INSERT ON users
    FOR EACH ROW
    EXECUTE FUNCTION track_user_changes();

CREATE TRIGGER users_after_update
    AFTER UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION track_user_changes();

CREATE TRIGGER users_after_delete
    AFTER DELETE ON users
    FOR EACH ROW
    EXECUTE FUNCTION track_user_changes();
