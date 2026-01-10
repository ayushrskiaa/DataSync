import React from 'react';
import { AppBar, Toolbar, Typography, Button, Box } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import SyncIcon from '@mui/icons-material/Sync';

const Navbar = () => {
  return (
    <AppBar position="static">
      <Toolbar>
        <SyncIcon sx={{ mr: 2 }} />
        <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
          Superjoin - Sheets MySQL Sync
        </Typography>
        <Box>
          <Button color="inherit" component={RouterLink} to="/">
            Dashboard
          </Button>
          <Button color="inherit" component={RouterLink} to="/configure">
            Configure Sync
          </Button>
        </Box>
      </Toolbar>
    </AppBar>
  );
};

export default Navbar;
