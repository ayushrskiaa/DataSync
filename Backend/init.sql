-- Initialize database schema

-- Changelog table to track all changes from MySQL side
CREATE TABLE IF NOT EXISTS _sync_changelog (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    table_name VARCHAR(255) NOT NULL,
    operation ENUM('INSERT', 'UPDATE', 'DELETE') NOT NULL,
    row_id VARCHAR(255) NOT NULL,
    old_data JSON,
    new_data JSON,
    timestamp TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP(6),
    synced BOOLEAN DEFAULT FALSE,
    sync_timestamp TIMESTAMP(6) NULL,
    INDEX idx_synced (synced, timestamp),
    INDEX idx_table_operation (table_name, operation, timestamp)
) ENGINE=InnoDB;

-- Sync state table to track sync configuration and status
CREATE TABLE IF NOT EXISTS _sync_state (
    id INT AUTO_INCREMENT PRIMARY KEY,
    sheet_id VARCHAR(255) NOT NULL UNIQUE,
    sheet_name VARCHAR(255),
    table_name VARCHAR(255) NOT NULL,
    last_sync_timestamp TIMESTAMP(6) NULL,
    last_sheet_sync VARCHAR(50),
    status ENUM('active', 'paused', 'error') DEFAULT 'active',
    error_message TEXT,
    conflict_resolution ENUM('last_write_wins', 'manual', 'sheet_priority', 'db_priority') DEFAULT 'last_write_wins',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_status (status),
    INDEX idx_table (table_name)
) ENGINE=InnoDB;

-- Conflict log table for tracking and resolving conflicts
CREATE TABLE IF NOT EXISTS _sync_conflicts (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    sync_state_id INT NOT NULL,
    row_identifier VARCHAR(255) NOT NULL,
    conflict_type ENUM('concurrent_update', 'delete_update', 'schema_mismatch') NOT NULL,
    sheet_data JSON,
    db_data JSON,
    sheet_timestamp TIMESTAMP(6),
    db_timestamp TIMESTAMP(6),
    resolution ENUM('pending', 'sheet_wins', 'db_wins', 'merged', 'manual') DEFAULT 'pending',
    resolved_data JSON,
    resolved_at TIMESTAMP(6) NULL,
    resolved_by VARCHAR(255),
    created_at TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP(6),
    FOREIGN KEY (sync_state_id) REFERENCES _sync_state(id) ON DELETE CASCADE,
    INDEX idx_resolution (resolution, created_at),
    INDEX idx_sync_state (sync_state_id, conflict_type)
) ENGINE=InnoDB;

-- Example user table for testing
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    age INT,
    department VARCHAR(100),
    salary DECIMAL(10, 2),
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- Insert sample data
INSERT INTO users (name, email, age, department, salary, active) VALUES
('John Doe', 'john@example.com', 30, 'Engineering', 85000.00, TRUE),
('Jane Smith', 'jane@example.com', 28, 'Marketing', 75000.00, TRUE),
('Bob Johnson', 'bob@example.com', 35, 'Sales', 90000.00, TRUE);
