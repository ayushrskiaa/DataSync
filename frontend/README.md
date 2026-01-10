# Google Sheets ↔ MySQL Sync - Frontend

React-based testing and monitoring dashboard for real-time visualization of bidirectional sync between Google Sheets and MySQL.

## Features

- ✅ Real-time sync status monitoring
- ✅ Live table data comparison (Sheets vs MySQL)
- ✅ Sync configuration management
- ✅ Conflict detection and resolution UI
- ✅ WebSocket-based live updates
- ✅ Google OAuth integration
- ✅ Interactive sync controls
- ✅ Error visualization

## Prerequisites

- Node.js 18+ and npm
- Backend server running (see Backend/README.md)

## Setup

### 1. Install Dependencies

```bash
cd frontend
npm install
```

### 2. Configure Environment

Create `.env` file in the `frontend` folder:

```env
REACT_APP_API_URL=http://localhost:3001
REACT_APP_WS_URL=ws://localhost:3001
```

### 3. Run Development Server

```bash
npm start
```

The app will open at `http://localhost:3000`

## Project Structure

```
frontend/
├── public/
│   └── index.html          # HTML template
├── src/
│   ├── components/
│   │   ├── Navbar.js       # Top navigation
│   │   ├── Dashboard.js    # Main dashboard view
│   │   ├── ConfigureSync.js # Sync setup form
│   │   └── SyncDetail.js   # Detailed sync view
│   ├── App.js              # Main app component
│   ├── index.js            # React entry point
│   └── index.css           # Global styles
├── package.json
└── README.md
```

## Usage

### 1. Authentication

Click **"Login with Google"** in the navbar to authenticate with Google OAuth. This grants access to your Google Sheets.

### 2. Configure Sync

1. Navigate to **"Configure New Sync"**
2. Enter your Google Sheets details:
   - **Spreadsheet ID**: Found in the sheet URL
     ```
     https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit
     ```
   - **Sheet Name**: Tab name (e.g., "Sheet1")
3. Select or create MySQL table:
   - Choose existing table from dropdown
   - Or enter new table name (will be auto-created from sheet structure)
4. Choose sync mode:
   - **Bidirectional**: Changes sync both ways
   - **Sheets → MySQL**: One-way from Sheets to database
   - **MySQL → Sheets**: One-way from database to Sheets
5. Click **"Start Sync"**

### 3. Monitor Syncs

The **Dashboard** shows all active sync configurations:

- **Status indicator**: 
  - 🟢 Active - Syncing normally
  - 🟡 Paused - Temporarily stopped
  - 🔴 Error - Needs attention
- **Last sync time**: When last change was processed
- **Record count**: Total rows synced
- **Conflict count**: Unresolved conflicts
- **Actions**: Start, Stop, Delete

### 4. View Sync Details

Click on any sync card to see detailed view:

- **Side-by-side comparison**: Google Sheets data vs MySQL data
- **Real-time updates**: Changes appear instantly
- **Change log**: History of all sync operations
- **Conflict resolution**: Manually resolve conflicts

### 5. Resolve Conflicts

When conflicts are detected:

1. Navigate to **Sync Detail** page
2. View conflicting records highlighted in red
3. Choose resolution strategy:
   - **Use Sheets Version**: Overwrite MySQL with Sheets data
   - **Use MySQL Version**: Overwrite Sheets with MySQL data
   - **Merge**: Combine both (newest value per field)
4. Click **"Resolve"**

## Components

### Navbar

Top navigation bar with:
- App branding
- Authentication status
- Login/Logout button
- Navigation links

### Dashboard

Main view showing:
- Grid of all sync configurations
- Quick status overview
- Action buttons (Start/Stop/Delete)
- Create new sync button

### ConfigureSync

Sync setup form with:
- Google Sheets connection
- MySQL table selection
- Sync mode configuration
- Schema mapping preview
- Validation and error handling

### SyncDetail

Detailed sync monitoring:
- Live data comparison tables
- WebSocket connection status
- Sync statistics (latency, throughput)
- Conflict list with resolution UI
- Change log timeline

## Real-Time Updates

The app uses WebSocket (Socket.io) for live updates:

```javascript
// Auto-connects on component mount
const socket = io('http://localhost:3001');

// Subscribe to sync events
socket.emit('subscribe:sync', { configId: '123' });

// Listen for updates
socket.on('sync:progress', (data) => {
  console.log(`Progress: ${data.progress}%`);
});
```

### Event Types

- `sync:started` - Sync initiated
- `sync:progress` - Progress update (%, records processed)
- `sync:completed` - Sync finished successfully
- `sync:error` - Error occurred
- `conflict:detected` - New conflict needs resolution
- `data:changed` - Table data updated

## Styling

The app uses:
- **CSS3** for styling
- **Flexbox/Grid** for layouts
- **CSS Variables** for theming
- **Responsive design** for mobile support

Color scheme:
- Primary: `#4285f4` (Google Blue)
- Success: `#34a853` (Green)
- Warning: `#fbbc04` (Yellow)
- Error: `#ea4335` (Red)
- Background: `#f8f9fa` (Light Gray)

## Development

### Available Scripts

```bash
# Start development server
npm start

# Build for production
npm run build

# Run tests
npm test

# Eject from Create React App (irreversible)
npm run eject
```

### Code Structure

Each component follows this pattern:

```javascript
import React, { useState, useEffect } from 'react';

const MyComponent = () => {
  const [state, setState] = useState(null);

  useEffect(() => {
    // Fetch data, setup WebSocket, etc.
    return () => {
      // Cleanup
    };
  }, []);

  return (
    <div className="my-component">
      {/* JSX */}
    </div>
  );
};

export default MyComponent;
```

### API Integration

All API calls use fetch:

```javascript
const API_URL = process.env.REACT_APP_API_URL;

// GET request
const response = await fetch(`${API_URL}/api/sync/configurations`, {
  credentials: 'include' // Include cookies for auth
});
const data = await response.json();

// POST request
const response = await fetch(`${API_URL}/api/sync/configure`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  credentials: 'include',
  body: JSON.stringify(config)
});
```

## Production Build

### Build

```bash
npm run build
```

Creates optimized production build in `build/` folder.

### Deploy

#### Static Hosting (Vercel, Netlify)

```bash
# Vercel
vercel --prod

# Netlify
netlify deploy --prod
```

#### Docker

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build
RUN npm install -g serve
CMD ["serve", "-s", "build", "-l", "3000"]
```

```bash
docker build -t sheets-mysql-sync-frontend .
docker run -p 3000:3000 sheets-mysql-sync-frontend
```

#### Nginx

```nginx
server {
  listen 80;
  server_name yourdomain.com;

  root /var/www/frontend/build;
  index index.html;

  location / {
    try_files $uri $uri/ /index.html;
  }

  location /api {
    proxy_pass http://localhost:3001;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_cache_bypass $http_upgrade;
  }
}
```

## Browser Support

- Chrome/Edge 90+
- Firefox 88+
- Safari 14+
- Mobile browsers (iOS Safari, Chrome Android)

## Performance Optimization

- **Code splitting**: Lazy load routes
- **Memoization**: Use React.memo for expensive components
- **Virtual scrolling**: For large tables (react-window)
- **Debouncing**: Search inputs, filters
- **Caching**: API responses, WebSocket data

## Troubleshooting

### "Cannot connect to backend"

Check:
1. Backend server is running: `http://localhost:3001`
2. CORS is configured correctly in backend
3. `.env` has correct `REACT_APP_API_URL`

### "WebSocket connection failed"

Check:
1. Backend WebSocket server is running
2. No firewall blocking WS connections
3. `.env` has correct `REACT_APP_WS_URL`

### "Google OAuth not working"

Check:
1. Redirect URI matches Google Console: `http://localhost:3001/api/auth/callback`
2. Frontend and backend on same domain (for cookies)
3. Cookies enabled in browser

### "Sync not updating in real-time"

Check:
1. WebSocket connection established (check browser console)
2. Subscribed to correct config: `socket.emit('subscribe:sync', { configId })`
3. Backend is emitting events (check backend logs)

## Testing

### Manual Testing Flow

1. **Setup**: Login, configure sync
2. **Test Sheets → MySQL**: 
   - Edit cell in Google Sheets
   - Verify change appears in frontend table
   - Check MySQL database directly
3. **Test MySQL → Sheets**:
   - Update row via SQL or API
   - Verify change appears in frontend
   - Check Google Sheets
4. **Test Conflicts**:
   - Edit same cell in both sources simultaneously
   - Verify conflict appears in UI
   - Resolve and verify resolution

### Automated Tests

```bash
npm test
```

## Contributing

1. Create feature branch
2. Make changes
3. Test thoroughly
4. Submit pull request

## License

MIT
