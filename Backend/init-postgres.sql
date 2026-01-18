-- PostgreSQL Initialization Script
-- Create tables for DataSync application

-- Sync configuration table
CREATE TABLE IF NOT EXISTS _sync_config (
    id SERIAL PRIMARY KEY,
    sheet_id VARCHAR(255) UNIQUE NOT NULL,
    sheet_name VARCHAR(255) NOT NULL,
    table_name VARCHAR(255) NOT NULL,
    sync_direction VARCHAR(20) DEFAULT 'bidirectional' CHECK (sync_direction IN ('bidirectional', 'sheet_to_db', 'db_to_sheet')),
    conflict_resolution VARCHAR(50) DEFAULT 'last_write_wins' CHECK (conflict_resolution IN ('last_write_wins', 'manual')),
    is_active BOOLEAN DEFAULT TRUE,
    last_sync_timestamp TIMESTAMP,
    last_sheet_sync TIMESTAMP,
    status VARCHAR(50),
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Changelog table to track changes from database side
CREATE TABLE IF NOT EXISTS _sync_changelog (
    id BIGSERIAL PRIMARY KEY,
    table_name VARCHAR(255) NOT NULL,
    operation VARCHAR(10) CHECK (operation IN ('INSERT', 'UPDATE', 'DELETE')) NOT NULL,
    row_id VARCHAR(255) NOT NULL,
    old_data JSONB,
    new_data JSONB,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    synced BOOLEAN DEFAULT FALSE,
    sync_timestamp TIMESTAMP
);

-- Index for faster queries
CREATE INDEX IF NOT EXISTS idx_changelog_table_synced ON _sync_changelog(table_name, synced);
CREATE INDEX IF NOT EXISTS idx_changelog_timestamp ON _sync_changelog(timestamp);

-- Conflicts table to track sync conflicts
CREATE TABLE IF NOT EXISTS _sync_conflicts (
    id BIGSERIAL PRIMARY KEY,
    sheet_id VARCHAR(255) NOT NULL,
    table_name VARCHAR(255) NOT NULL,
    row_id VARCHAR(255) NOT NULL,
    conflict_type VARCHAR(50) NOT NULL,
    sheet_data JSONB,
    db_data JSONB,
    resolved BOOLEAN DEFAULT FALSE,
    resolution_strategy VARCHAR(50),
    resolved_at TIMESTAMP,
    resolved_data JSONB,
    resolved_by VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index for faster conflict queries
CREATE INDEX IF NOT EXISTS idx_conflicts_sheet_resolved ON _sync_conflicts(sheet_id, resolved);
CREATE INDEX IF NOT EXISTS idx_conflicts_created ON _sync_conflicts(created_at);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger for _sync_config
DROP TRIGGER IF EXISTS update_sync_config_updated_at ON _sync_config;
CREATE TRIGGER update_sync_config_updated_at
    BEFORE UPDATE ON _sync_config
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Grant permissions (if needed)
-- GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO your_user;
-- GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO your_user;
