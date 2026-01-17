import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import {
  Container,
  Grid,
  Card,
  CardContent,
  Typography,
  Button,
  Box,
  Alert,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  CircularProgress,
  Tabs,
  Tab,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  IconButton
} from '@mui/material';
import SyncIcon from '@mui/icons-material/Sync';
import RefreshIcon from '@mui/icons-material/Refresh';
import { io } from 'socket.io-client';
import { apiClient, deleteTableRow } from '../api/client';
import DeleteIcon from '@mui/icons-material/Delete';
import { WS_BASE_URL } from '../config';

const EXCLUDED_COLUMNS = ['created_at', 'updated_at'];

const SyncDetail = () => {
  const { sheetId } = useParams();
  const [syncState, setSyncState] = useState(null);
  const [tableData, setTableData] = useState([]);
  const [conflicts, setConflicts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [liveUpdates, setLiveUpdates] = useState([]);
  const [tabValue, setTabValue] = useState(0);
  const [tableSchema, setTableSchema] = useState(null);
  const [addRowDialogOpen, setAddRowDialogOpen] = useState(false);
  const [newRowData, setNewRowData] = useState({});
  const [addingRow, setAddingRow] = useState(false);
  const [addRowError, setAddRowError] = useState(null);
  const [deleteError, setDeleteError] = useState(null);
  const [deletingRowKey, setDeletingRowKey] = useState(null);

  const isAutoIncrement = (column) => (column.extra || '').toLowerCase().includes('auto_increment');

  const columnsToDisplay = useMemo(() => {
    if (tableSchema) {
      return tableSchema.columns
        .map((col) => col.name)
        .filter((name) => !EXCLUDED_COLUMNS.includes(name));
    }

    if (tableData.length > 0) {
      return Object.keys(tableData[0]).filter((key) => !EXCLUDED_COLUMNS.includes(key));
    }

    return [];
  }, [tableSchema, tableData]);

  const editableColumns = useMemo(() => {
    if (!tableSchema) return [];

    return tableSchema.columns.filter((col) => {
      if (EXCLUDED_COLUMNS.includes(col.name)) return false;
      if (isAutoIncrement(col)) return false;
      return true;
    });
  }, [tableSchema]);

  const primaryKeyColumns = useMemo(() => {
    if (!tableSchema || !Array.isArray(tableSchema.primaryKey)) {
      return [];
    }
    return tableSchema.primaryKey;
  }, [tableSchema]);

  const loadTableData = useCallback(async (tableName) => {
    try {
      const table = tableName || syncState?.tableName;
      if (!table) return;

      const response = await apiClient.get(`/api/tables/${table}/data?limit=50`);
      setTableData(response.data.data);
    } catch (err) {
    }
  }, [syncState?.tableName]);

  const loadTableSchema = useCallback(async (tableName) => {
    try {
      const table = tableName || syncState?.tableName;
      if (!table) return;

      const response = await apiClient.get(`/api/tables/${table}/schema`);
      setTableSchema(response.data.data);
    } catch (err) {
    }
  }, [syncState?.tableName]);

  const loadConflicts = useCallback(async () => {
    try {
      const response = await apiClient.get(`/api/sync/conflicts/${sheetId}`);
      setConflicts(response.data.data);
    } catch (err) {
    }
  }, [sheetId]);

  const loadSyncDetails = useCallback(async () => {
    try {
      const response = await apiClient.get(`/api/sync/status/${sheetId}`);
      setSyncState(response.data.data);
      await loadTableSchema(response.data.data.tableName);
      await loadTableData(response.data.data.tableName);
      await loadConflicts();
    } catch (err) {
      setError('Failed to load sync details');
    } finally {
      setLoading(false);
    }
  }, [sheetId, loadTableData, loadTableSchema, loadConflicts]);

  const setupWebSocket = useCallback(() => {
    const newSocket = io(WS_BASE_URL);
    
    newSocket.on('connect', () => {
      newSocket.emit('join_sync', sheetId);
    });

    newSocket.on('data_changed', (data) => {
      setLiveUpdates(prev => [{
        ...data,
        id: Date.now()
      }, ...prev.slice(0, 9)]);
      loadTableData();
    });

    newSocket.on('sync_error', (data) => {
      setError(`Sync error: ${data.error}`);
    });

    newSocket.on('conflict_detected', (data) => {
      loadConflicts();
    });

    return newSocket;
  }, [sheetId, loadTableData, loadConflicts]);

  useEffect(() => {
    loadSyncDetails();
    const activeSocket = setupWebSocket();

    return () => {
      if (activeSocket) {
        activeSocket.disconnect();
      }
    };
  }, [loadSyncDetails, setupWebSocket]);

  const handleTriggerSync = async () => {
    try {
      await apiClient.post(`/api/sync/trigger/${sheetId}`);
      setLiveUpdates(prev => [{
        source: 'manual',
        changeCount: 0,
        timestamp: new Date(),
        id: Date.now()
      }, ...prev]);
    } catch (err) {
      setError('Failed to trigger sync');
    }
  };

  const handleOpenAddRowDialog = () => {
    if (!editableColumns.length) return;
    const initialValues = editableColumns.reduce((acc, column) => {
      acc[column.name] = '';
      return acc;
    }, {});
    setNewRowData(initialValues);
    setAddRowError(null);
    setAddRowDialogOpen(true);
  };

  const handleCloseAddRowDialog = () => {
    setAddRowDialogOpen(false);
    setNewRowData({});
    setAddRowError(null);
  };

  const handleNewRowFieldChange = (field) => (event) => {
    const value = event.target.value;
    setNewRowData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const parseValueForColumn = (column, rawValue) => {
    if (rawValue === '' || rawValue === null || rawValue === undefined) {
      return undefined;
    }

    const lowerType = (column.type || '').toLowerCase();
    const numericTokens = ['int', 'decimal', 'float', 'double', 'tinyint', 'smallint', 'mediumint', 'bigint'];

    if (numericTokens.some(token => lowerType.includes(token))) {
      const numericValue = Number(rawValue);
      if (Number.isNaN(numericValue)) {
        throw new Error(`Value for ${column.name} must be a valid number`);
      }
      return numericValue;
    }

    return rawValue;
  };

  const handleSubmitNewRow = async () => {
    if (!syncState?.tableName) return;
    setAddingRow(true);
    setAddRowError(null);

    try {
      const payload = {};

      editableColumns.forEach(column => {
        const rawValue = newRowData[column.name];
        if (rawValue === '' || rawValue === null || rawValue === undefined) {
          return;
        }

        const parsedValue = parseValueForColumn(column, rawValue);
        if (parsedValue !== undefined) {
          payload[column.name] = parsedValue;
        }
      });

      if (Object.keys(payload).length === 0) {
        setAddRowError('Please provide at least one value before saving.');
        setAddingRow(false);
        return;
      }

      await apiClient.post(`/api/tables/${syncState.tableName}/rows`, payload);
      setAddRowDialogOpen(false);
      setNewRowData({});
      await loadTableData(syncState.tableName);
    } catch (err) {
      setAddRowError(err.response?.data?.error || 'Failed to add row');
    } finally {
      setAddingRow(false);
    }
  };

  const buildPrimaryKeyPayload = (row) => {
    if (!primaryKeyColumns.length) {
      return null;
    }

    const payload = {};
    for (const column of primaryKeyColumns) {
      const value = row[column];
      if (value === null || value === undefined || value === '') {
        return null;
      }
      payload[column] = value;
    }
    return payload;
  };

  const handleDeleteRow = async (row) => {
    if (!syncState?.tableName) return;
    const primaryKeyPayload = buildPrimaryKeyPayload(row);

    if (!primaryKeyPayload) {
      setDeleteError('Unable to determine primary key for the selected row.');
      return;
    }

    const rowIdentifier = Object.values(primaryKeyPayload).join('-');
    const confirmed = window.confirm('Delete this row from the table?');
    if (!confirmed) {
      return;
    }

    setDeleteError(null);
    setDeletingRowKey(rowIdentifier);

    try {
      await deleteTableRow(syncState.tableName, primaryKeyPayload);
      await loadTableData(syncState.tableName);
    } catch (err) {
      setDeleteError(err.response?.data?.error || 'Failed to delete row');
    } finally {
      setDeletingRowKey(null);
    }
  };

  if (loading) {
    return (
      <Container sx={{ mt: 4, display: 'flex', justifyContent: 'center' }}>
        <CircularProgress />
      </Container>
    );
  }

  if (!syncState) {
    return (
      <Container sx={{ mt: 4 }}>
        <Alert severity="error">Sync configuration not found</Alert>
      </Container>
    );
  }

  return (
    <Container sx={{ mt: 4 }} maxWidth="xl">
      {/* Header */}
      <Box sx={{ mb: 4 }}>
        <Typography variant="h4" gutterBottom>
          {syncState.sheetName} ↔ {syncState.tableName}
        </Typography>
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
          <Chip label={syncState.status} color={syncState.status === 'active' ? 'success' : 'warning'} />
          <Typography variant="body2" color="text.secondary">
            Sheet ID: {sheetId}
          </Typography>
        </Box>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Actions */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Box sx={{ display: 'flex', gap: 2 }}>
            <Button
              variant="contained"
              startIcon={<SyncIcon />}
              onClick={handleTriggerSync}
            >
              Trigger Manual Sync
            </Button>
            <Button
              variant="outlined"
              startIcon={<RefreshIcon />}
              onClick={loadSyncDetails}
            >
              Refresh Data
            </Button>
            <Button
              variant="outlined"
              color="secondary"
              onClick={handleOpenAddRowDialog}
              disabled={!tableSchema || editableColumns.length === 0}
            >
              Add Row
            </Button>
          </Box>
        </CardContent>
      </Card>

      <Grid container spacing={3}>
        {/* Live Updates */}
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Live Updates
              </Typography>
              {liveUpdates.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  No recent updates
                </Typography>
              ) : (
                <Box sx={{ maxHeight: 400, overflow: 'auto' }}>
                  {liveUpdates.map((update) => (
                    <Box key={update.id} sx={{ mb: 2, p: 1, border: '1px solid #e0e0e0', borderRadius: 1 }}>
                      <Typography variant="body2">
                        <strong>Source:</strong> {update.source}
                      </Typography>
                      <Typography variant="body2">
                        <strong>Changes:</strong> {update.changeCount}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {new Date(update.timestamp).toLocaleString()}
                      </Typography>
                    </Box>
                  ))}
                </Box>
              )}
            </CardContent>
          </Card>

          {/* Sync Statistics */}
          <Card sx={{ mt: 2 }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Sync Statistics
              </Typography>
              <Box>
                <Typography variant="body2">
                  <strong>Status:</strong> {syncState.status}
                </Typography>
                <Typography variant="body2">
                  <strong>Conflict Strategy:</strong> {syncState.conflictResolution}
                </Typography>
                {syncState.lastSyncTimestamp && (
                  <Typography variant="body2">
                    <strong>Last Sync:</strong> {new Date(syncState.lastSyncTimestamp).toLocaleString()}
                  </Typography>
                )}
                <Typography variant="body2" sx={{ mt: 1 }}>
                  <strong>Active Conflicts:</strong> {conflicts.filter(c => c.resolution === 'pending').length}
                </Typography>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Data View */}
        <Grid item xs={12} md={8}>
          <Card>
            <CardContent>
              <Tabs value={tabValue} onChange={(e, v) => setTabValue(v)} sx={{ mb: 2 }}>
                <Tab label={`Table Data (${tableData.length} rows)`} />
                <Tab label={`Conflicts (${conflicts.length})`} />
              </Tabs>

              {tabValue === 0 && (
                <Box>
                  {deleteError && (
                    <Alert severity="error" sx={{ mb: 2 }} onClose={() => setDeleteError(null)}>
                      {deleteError}
                    </Alert>
                  )}
                  <TableContainer component={Paper} sx={{ maxHeight: 500 }}>
                    <Table stickyHeader size="small">
                      <TableHead>
                        <TableRow>
                          {columnsToDisplay.map((key) => (
                            <TableCell key={key}><strong>{key}</strong></TableCell>
                          ))}
                          {primaryKeyColumns.length > 0 && (
                            <TableCell align="center"><strong>Actions</strong></TableCell>
                          )}
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {tableData.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={(columnsToDisplay.length || 1) + (primaryKeyColumns.length ? 1 : 0)}>
                              <Typography variant="body2" color="text.secondary">
                                No data available
                              </Typography>
                            </TableCell>
                          </TableRow>
                        ) : (
                          tableData.map((row, idx) => {
                            const rowKey = primaryKeyColumns
                              .map((col) => row[col])
                              .filter((val) => val !== undefined && val !== null)
                              .join('-') || idx;

                            return (
                              <TableRow key={rowKey}>
                                {columnsToDisplay.map((key) => (
                                  <TableCell key={key}>
                                    {row[key] === null || row[key] === undefined ? <em>null</em> : String(row[key])}
                                  </TableCell>
                                ))}
                                {primaryKeyColumns.length > 0 && (
                                  <TableCell align="center">
                                    <IconButton
                                      color="error"
                                      size="small"
                                      onClick={() => handleDeleteRow(row)}
                                      disabled={deletingRowKey === rowKey}
                                    >
                                      <DeleteIcon fontSize="small" />
                                    </IconButton>
                                  </TableCell>
                                )}
                              </TableRow>
                            );
                          })
                        )}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </Box>
              )}

              {tabValue === 1 && (
                <Box>
                  {conflicts.length === 0 ? (
                    <Typography variant="body2" color="text.secondary">
                      No conflicts detected
                    </Typography>
                  ) : (
                    conflicts.map((conflict) => (
                      <Card key={conflict.id} sx={{ mb: 2 }} variant="outlined">
                        <CardContent>
                          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                            <Typography variant="subtitle2">
                              Row: {conflict.row_identifier}
                            </Typography>
                            <Chip
                              label={conflict.resolution}
                              size="small"
                              color={conflict.resolution === 'pending' ? 'warning' : 'success'}
                            />
                          </Box>
                          <Typography variant="body2" color="text.secondary">
                            Type: {conflict.conflict_type}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {new Date(conflict.created_at).toLocaleString()}
                          </Typography>
                        </CardContent>
                      </Card>
                    ))
                  )}
                </Box>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Dialog
        open={addRowDialogOpen}
        onClose={handleCloseAddRowDialog}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>Add Row</DialogTitle>
        <DialogContent dividers>
          {editableColumns.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              No editable columns are available for this table.
            </Typography>
          ) : (
            editableColumns.map((column) => (
              <TextField
                key={column.name}
                label={column.name}
                margin="dense"
                fullWidth
                value={newRowData[column.name] ?? ''}
                onChange={handleNewRowFieldChange(column.name)}
                helperText={`Type: ${column.type}${column.nullable ? '' : ' • Required'}`}
              />
            ))
          )}

          {addRowError && (
            <Alert severity="error" sx={{ mt: 2 }} onClose={() => setAddRowError(null)}>
              {addRowError}
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseAddRowDialog} disabled={addingRow}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmitNewRow}
            variant="contained"
            disabled={addingRow || editableColumns.length === 0}
          >
            {addingRow ? <CircularProgress size={20} /> : 'Save Row'}
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

export default SyncDetail;
