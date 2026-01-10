import React, { useState, useEffect } from 'react';
import {
  Container,
  Card,
  CardContent,
  Typography,
  TextField,
  Button,
  Box,
  Alert,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  CircularProgress
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

const ConfigureSync = () => {
  const [tables, setTables] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    sheetId: '',
    sheetName: 'Sheet1',
    tableName: '',
    conflictResolution: 'last_write_wins'
  });

  useEffect(() => {
    loadTables();
  }, []);

  const loadTables = async () => {
    try {
      const response = await axios.get('/api/tables');
      setTables(response.data.data);
    } catch (err) {
      setError('Failed to load tables');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const response = await axios.post('/api/sync/configure', formData);
      setSuccess(true);
      setTimeout(() => {
        navigate('/');
      }, 2000);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to configure sync');
      console.error(err);
    } finally {
      setSubmitting(false);
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
    <Container sx={{ mt: 4 }} maxWidth="md">
      <Card>
        <CardContent>
          <Typography variant="h5" component="h1" gutterBottom>
            Configure New Sync
          </Typography>

          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Set up a bidirectional sync between a Google Sheet and a MySQL table.
          </Typography>

          {error && (
            <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
              {error}
            </Alert>
          )}

          {success && (
            <Alert severity="success" sx={{ mb: 2 }}>
              Sync configured successfully! Redirecting to dashboard...
            </Alert>
          )}

          <Box component="form" onSubmit={handleSubmit}>
            <TextField
              fullWidth
              label="Google Sheet ID"
              name="sheetId"
              value={formData.sheetId}
              onChange={handleChange}
              required
              sx={{ mb: 2 }}
              helperText="Find this in the Google Sheet URL: docs.google.com/spreadsheets/d/[SHEET_ID]/edit"
            />

            <TextField
              fullWidth
              label="Sheet Name"
              name="sheetName"
              value={formData.sheetName}
              onChange={handleChange}
              required
              sx={{ mb: 2 }}
              helperText="The name of the tab/sheet (default: Sheet1)"
            />

            <FormControl fullWidth sx={{ mb: 2 }} required>
              <InputLabel>MySQL Table</InputLabel>
              <Select
                name="tableName"
                value={formData.tableName}
                onChange={handleChange}
                label="MySQL Table"
              >
                {tables.map((table) => (
                  <MenuItem key={table} value={table}>
                    {table}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl fullWidth sx={{ mb: 3 }}>
              <InputLabel>Conflict Resolution Strategy</InputLabel>
              <Select
                name="conflictResolution"
                value={formData.conflictResolution}
                onChange={handleChange}
                label="Conflict Resolution Strategy"
              >
                <MenuItem value="last_write_wins">Last Write Wins (Default)</MenuItem>
                <MenuItem value="sheet_priority">Google Sheets Priority</MenuItem>
                <MenuItem value="db_priority">MySQL Priority</MenuItem>
                <MenuItem value="manual">Manual Resolution</MenuItem>
              </Select>
            </FormControl>

            <Alert severity="info" sx={{ mb: 2 }}>
              <Typography variant="body2" sx={{ fontWeight: 'bold', mb: 1 }}>
                Important Notes:
              </Typography>
              <ul style={{ marginTop: 0, paddingLeft: 20 }}>
                <li>Make sure you have configured Google Sheets API credentials</li>
                <li>The Google Sheet must be accessible with your credentials</li>
                <li>Initial sync will copy all MySQL data to Google Sheets</li>
                <li>Changes in either system will sync automatically (2s interval)</li>
              </ul>
            </Alert>

            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Button
                variant="outlined"
                onClick={() => navigate('/')}
                disabled={submitting}
              >
                Cancel
              </Button>

              <Button
                type="submit"
                variant="contained"
                disabled={submitting}
              >
                {submitting ? <CircularProgress size={24} /> : 'Configure Sync'}
              </Button>
            </Box>
          </Box>
        </CardContent>
      </Card>

      <Card sx={{ mt: 3 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Quick Start Guide
          </Typography>
          
          <Typography variant="body2" paragraph>
            <strong>1. Get Google Sheet ID:</strong>
          </Typography>
          <Typography variant="body2" paragraph sx={{ pl: 2, fontFamily: 'monospace', fontSize: '0.85rem' }}>
            https://docs.google.com/spreadsheets/d/<strong>[COPY_THIS_PART]</strong>/edit
          </Typography>

          <Typography variant="body2" paragraph>
            <strong>2. Setup Google API:</strong>
          </Typography>
          <ul style={{ fontSize: '0.875rem' }}>
            <li>Go to Google Cloud Console</li>
            <li>Enable Google Sheets API</li>
            <li>Create OAuth 2.0 credentials</li>
            <li>Add redirect URI: http://localhost:3001/auth/google/callback</li>
            <li>Visit /auth/google to authenticate</li>
          </ul>

          <Typography variant="body2" paragraph>
            <strong>3. Select Table:</strong> Choose any existing MySQL table from the dropdown
          </Typography>

          <Typography variant="body2">
            <strong>4. Choose Conflict Strategy:</strong> Select how to handle concurrent updates
          </Typography>
        </CardContent>
      </Card>
    </Container>
  );
};

export default ConfigureSync;
