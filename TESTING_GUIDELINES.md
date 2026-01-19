# Testing Guidelines for DataSync Application

This document outlines the procedures for testing the DataSync application, covering database connections, synchronization logic, and shell interactions.

## 1. Database Connection & Exploration

**Tools Required:**
*   Terminal (PowerShell or Bash)
*   `db_shell.ts` script

**Steps:**

1.  **Locate Credentials:**
    *   Find your production database connection string from the Render Dashboard.
    *   Format: `postgresql://user:password@host/dbname`

2.  **Launch the Interactive Shell:**
    Run the following command in your terminal. Replace `YOUR_CONNECTION_STRING` with the actual URL.
    
    ```powershell
    # Windows PowerShell
    $env:DATABASE_URL="YOUR_CONNECTION_STRING"; npx ts-node Backend/scripts/db_shell.ts
    ```

3.  **Basic Commands:**
    *   **List Tables:** Type `tables` at the `SQL>` prompt to see all synchronized tables.
    *   **Inspect Sync Config:** Run `SELECT * FROM _sync_config;` to view active synchronizations settings.
    *   **Inspect Table Data:** Run `SELECT * FROM "Your_Table_Name" LIMIT 5;` (Keep quotes if table name causes issues).

## 2. Testing Database to Google Sheets Sync (MySQLToSheets)

**Objective:** Verify that changes made directly in the database are reflected in the Google Sheet.

**Steps:**

1.  **Insert Test Data:**
    Inside the `db_shell`, execute an INSERT command. Ensure the table is currently being synchronized.
    
    ```sql
    INSERT INTO "Your_Table_Name" (id, name, number) VALUES (9999, 'Test User', '12345');
    ```
    *Note: Ensure the `id` is unique.*

2.  **Verification:**
    *   Open the connected Google Sheet.
    *   Wait approximately 2-5 seconds (depending on `SYNC_INTERVAL_MS`).
    *   **Pass Condition:** The new row appears in the Google Sheet automatically.
    *   **Fail Condition:** The row does not appear after 30 seconds. Check logs for "MySQLToSheets" errors.

## 3. Testing Google Sheets to Database Sync (SheetsToMySQL)

**Objective:** Verify that changes made in the Google Sheet are reflected in the database.

**Steps:**

1.  **Modify Sheet Data:**
    *   Open the connected Google Sheet.
    *   Add a new row or edit an existing cell (e.g., change a name).

2.  **Verification:**
    *   Go back to your `db_shell`.
    *   Query the table to check the value:
        ```sql
        SELECT * FROM "Your_Table_Name" WHERE id = 'THE_ID_YOU_CHANGED';
        ```
    *   **Pass Condition:** The database shows the updated value.
    *   **Fail Condition:** The old value persists.

## 4. Testing Conflict Resolution (Bidirectional)

**Objective:** Ensure the "Last Write Wins" logic functions correctly.

**Steps:**

1.  **Simulate Conflict:**
    *   Update a cell in Google Sheets (e.g., set Status to 'Active').
    *   *Immediately* (within a second) update the same record in the Database to a different value (e.g., set Status to 'Inactive').
    
2.  **Verification:**
    *   Wait for the sync interval to pass.
    *   Check both the Sheet and the Database.
    *   **Pass Condition:** Both systems should converge to the value of the *latest* change (based on timestamp).

## 5. Troubleshooting Common Issues

*   **"Missing argument" in Terminal:**
    *   Ensure you are **inside** the `SQL>` prompt before typing SQL commands.
    *   Ensure you launched the shell with the correct `npx ts-node Backend/scripts/db_shell.ts` path.

*   **Duplicate Key Error:**
    *   This means the `id` you are trying to insert already exists. Change the `id` to a unique number.

*   **Sync Loops (Toggling):**
    *   If you see values constantly switching back and forth, check the logs. This usually means data normalization (e.g., "1" vs 1) or timestamp exclusion is not working. (This should be fixed in the latest deployment).
