import React, { useState, useEffect } from 'react';
import {
  Container,
  Grid,
  Card,
  CardContent,
  Typography,
  Button,
  Box,
  Chip,
  IconButton,
  Alert,
  CircularProgress
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import PauseIcon from '@mui/icons-material/Pause';
import DeleteIcon from '@mui/icons-material/Delete';
import VisibilityIcon from '@mui/icons-material/Visibility';
import { apiClient } from '../api/client';

const Dashboard = () => {
  const [syncs, setSyncs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    loadSyncs();
    const interval = setInterval(loadSyncs, 5000); // Refresh every 5 seconds
    return () => clearInterval(interval);
  }, []);

  const loadSyncs = async () => {
    try {
      const response = await apiClient.get('/api/sync/list');
      setSyncs(response.data.data);
      setError(null);
    } catch (err) {
      setError('Failed to load syncs');
    } finally {
      setLoading(false);
    }
  };

  const handlePause = async (sheetId) => {
    try {
      await apiClient.post(`/api/sync/pause/${sheetId}`);
      loadSyncs();
    } catch (err) {
      setError('Failed to pause sync');
    }
  };

  const handleResume = async (sheetId) => {
    try {
      await apiClient.post(`/api/sync/resume/${sheetId}`);
      loadSyncs();
    } catch (err) {
      setError('Failed to resume sync');
    }
  };

  const handleDelete = async (sheetId) => {
    if (window.confirm('Are you sure you want to delete this sync configuration?')) {
      try {
        await apiClient.delete(`/api/sync/${sheetId}`);
        loadSyncs();
      } catch (err) {
        setError('Failed to delete sync');
      }
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'active':
        return 'success';
      case 'paused':
        return 'warning';
      case 'error':
        return 'error';
      default:
        return 'default';
    }
  };

  if (loading) {
    return (
      <Container sx={{ mt: 4, display: 'flex', justifyContent: 'center' }}>
        <CircularProgress />
      </Container>
    );
  }

  return (
    <Container sx={{ mt: 4 }}>
      <Box sx={{ mb: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h4" component="h1">
          Sync Dashboard
        </Typography>
        <Button
          variant="contained"
          onClick={() => navigate('/configure')}
        >
          Configure New Sync
        </Button>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {syncs.length === 0 ? (
        <Alert severity="info">
          No sync configurations found. Click "Configure New Sync" to get started.
        </Alert>
      ) : (
        <Grid container spacing={3}>
          {syncs.map((sync) => (
            <Grid item xs={12} md={6} lg={4} key={sync.sheetId}>
              <Card>
                <CardContent>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
                    <Typography variant="h6" component="h2" noWrap>
                      {sync.sheetName}
                    </Typography>
                    <Chip
                      label={sync.status}
                      color={getStatusColor(sync.status)}
                      size="small"
                    />
                  </Box>

                  <Typography color="text.secondary" gutterBottom>
                    Table: <strong>{sync.tableName}</strong>
                  </Typography>

                  <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                    Sheet ID: {sync.sheetId.substring(0, 20)}...
                  </Typography>

                  <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                    Conflict Resolution: <strong>{sync.conflictResolution}</strong>
                  </Typography>

                  {sync.lastSyncTimestamp && (
                    <Typography variant="caption" color="text.secondary">
                      Last Sync: {new Date(sync.lastSyncTimestamp).toLocaleString()}
                    </Typography>
                  )}

                  {sync.errorMessage && (
                    <Alert severity="error" sx={{ mt: 2 }}>
                      {sync.errorMessage}
                    </Alert>
                  )}

                  <Box sx={{ mt: 2, display: 'flex', justifyContent: 'space-between' }}>
                    <Box>
                      {sync.status === 'active' ? (
                        <IconButton
                          color="warning"
                          onClick={() => handlePause(sync.sheetId)}
                          title="Pause"
                        >
                          <PauseIcon />
                        </IconButton>
                      ) : (
                        <IconButton
                          color="success"
                          onClick={() => handleResume(sync.sheetId)}
                          title="Resume"
                        >
                          <PlayArrowIcon />
                        </IconButton>
                      )}

                      <IconButton
                        color="primary"
                        onClick={() => navigate(`/sync/${sync.sheetId}`)}
                        title="View Details"
                      >
                        <VisibilityIcon />
                      </IconButton>
                    </Box>

                    <IconButton
                      color="error"
                      onClick={() => handleDelete(sync.sheetId)}
                      title="Delete"
                    >
                      <DeleteIcon />
                    </IconButton>
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}
    </Container>
  );
};

export default Dashboard;
