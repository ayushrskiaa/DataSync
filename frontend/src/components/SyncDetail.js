import React, { useState, useEffect } from 'react';
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
  Tab
} from '@mui/material';
import SyncIcon from '@mui/icons-material/Sync';
import RefreshIcon from '@mui/icons-material/Refresh';
import { io } from 'socket.io-client';
import axios from 'axios';

const SyncDetail = () => {
  const { sheetId } = useParams();
  const [syncState, setSyncState] = useState(null);
  const [tableData, setTableData] = useState([]);
  const [conflicts, setConflicts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [liveUpdates, setLiveUpdates] = useState([]);
  const [socket, setSocket] = useState(null);
  const [tabValue, setTabValue] = useState(0);

  useEffect(() => {
    loadSyncDetails();
    setupWebSocket();

    return () => {
      if (socket) {
        socket.disconnect();
      }
    };
  }, [sheetId]);

  const setupWebSocket = () => {
    const newSocket = io('http://localhost:3001');
    
    newSocket.on('connect', () => {
      console.log('WebSocket connected');
      newSocket.emit('join_sync', sheetId);
    });

    newSocket.on('data_changed', (data) => {
      console.log('Data changed:', data);
      setLiveUpdates(prev => [{
        ...data,
        id: Date.now()
      }, ...prev.slice(0, 9)]); // Keep last 10 updates
      loadTableData();
    });

    newSocket.on('sync_error', (data) => {
      setError(`Sync error: ${data.error}`);
    });

    newSocket.on('conflict_detected', (data) => {
      console.log('Conflict detected:', data);
      loadConflicts();
    });

    setSocket(newSocket);
  };

  const loadSyncDetails = async () => {
    try {
      const response = await axios.get(`/api/sync/status/${sheetId}`);
      setSyncState(response.data.data);
      await loadTableData(response.data.data.tableName);
      await loadConflicts();
    } catch (err) {
      setError('Failed to load sync details');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const loadTableData = async (tableName) => {
    try {
      const table = tableName || syncState?.tableName;
      if (!table) return;

      const response = await axios.get(`/api/tables/${table}/data?limit=50`);
      setTableData(response.data.data);
    } catch (err) {
      console.error('Failed to load table data', err);
    }
  };

  const loadConflicts = async () => {
    try {
      const response = await axios.get(`/api/sync/conflicts/${sheetId}`);
      setConflicts(response.data.data);
    } catch (err) {
      console.error('Failed to load conflicts', err);
    }
  };

  const handleTriggerSync = async () => {
    try {
      await axios.post(`/api/sync/trigger/${sheetId}`);
      setLiveUpdates(prev => [{
        source: 'manual',
        changeCount: 0,
        timestamp: new Date(),
        id: Date.now()
      }, ...prev]);
    } catch (err) {
      setError('Failed to trigger sync');
      console.error(err);
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
                <TableContainer component={Paper} sx={{ maxHeight: 500 }}>
                  <Table stickyHeader size="small">
                    <TableHead>
                      <TableRow>
                        {tableData.length > 0 && Object.keys(tableData[0]).map((key) => (
                          <TableCell key={key}><strong>{key}</strong></TableCell>
                        ))}
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {tableData.map((row, idx) => (
                        <TableRow key={idx}>
                          {Object.values(row).map((value, i) => (
                            <TableCell key={i}>
                              {value === null ? <em>null</em> : String(value)}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
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
    </Container>
  );
};

export default SyncDetail;
