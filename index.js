require('dotenv').config();
const express = require('express');
const { google } = require('googleapis');
const path = require('path');
const session = require('express-session');
const RedisStore = require('connect-redis').default;
const { createClient } = require('redis');

const app = express();
const PORT = process.env.PORT || 3000;

// Redis client setup
const redisClient = createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379'
});
redisClient.connect().catch(console.error);

// Session middleware setup
app.use(session({
  store: new RedisStore({ client: redisClient }),
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production', // Use secure cookies in production
    httpOnly: true,
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    sameSite: 'lax'
  }
}));

// Middleware
app.use(express.json());
app.use(express.static('public'));

// OAuth2 setup
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.REDIRECT_URI || `http://localhost:${PORT}/auth/redirect`
);

// Google Calendar API scopes
const SCOPES = [
  'https://www.googleapis.com/auth/calendar.events.readonly',
  'https://www.googleapis.com/auth/calendar.calendarlist.readonly'
];

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start OAuth flow
app.get('/auth/google', (req, res) => {
  // Create an auth URL
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent', // Always prompt for consent to ensure refresh token
    state: req.sessionID // Use session ID as state
  });
  
  // Redirect user to auth URL
  res.redirect(authUrl);
});

// OAuth callback
app.get('/auth/redirect', async (req, res) => {
  const { code, state } = req.query;
  
  if (!code || state !== req.sessionID) {
    return res.status(400).send('Invalid authentication request');
  }
  
  try {
    // Exchange code for tokens
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);
    
    // Save tokens in session
    req.session.tokens = tokens;
    req.session.authenticated = true;
    
    // Get available calendars
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    const calendarList = await calendar.calendarList.list();
    
    // For this example, automatically select all calendars
    const selectedCalendars = calendarList.data.items.map(cal => ({
      id: cal.id,
      summary: cal.summary,
      backgroundColor: cal.backgroundColor
    }));
    
    // Save selected calendars in session
    req.session.selectedCalendars = selectedCalendars;
    
    // Save session before redirect
    await new Promise((resolve, reject) => {
      req.session.save((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    
    // Redirect to main app
    res.redirect('/');
  } catch (error) {
    console.error('OAuth error:', error);
    res.status(500).send('Authentication failed');
  }
});

// API endpoint for current event
app.get('/current-event', async (req, res) => {
  if (!req.session.authenticated || !req.session.tokens) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  
  try {
    // Set auth credentials from session
    oauth2Client.setCredentials(req.session.tokens);
    
    // Get user's selected calendars
    const selectedCalendars = req.session.selectedCalendars || [];
    if (selectedCalendars.length === 0) {
      return res.status(400).json({ error: 'No calendars selected' });
    }
    
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    const now = new Date();
    
    // Find current events in all selected calendars
    let currentEvent = null;
    let calendarColor = null;
    
    for (const cal of selectedCalendars) {
      const events = await calendar.events.list({
        calendarId: cal.id,
        timeMin: new Date(now.getTime() - 1000 * 60 * 60).toISOString(), // 1 hour ago
        timeMax: new Date(now.getTime() + 1000 * 60 * 60).toISOString(), // 1 hour from now
        singleEvents: true,
        orderBy: 'startTime'
      });
      
      // Find an event that's currently running
      const runningEvent = events.data.items.find(event => {
        const start = new Date(event.start.dateTime || `${event.start.date}T00:00:00`);
        const end = new Date(event.end.dateTime || `${event.end.date}T23:59:59`);
        return start <= now && end >= now;
      });
      
      if (runningEvent) {
        currentEvent = runningEvent;
        calendarColor = cal.backgroundColor;
        break;
      }
    }
    
    if (!currentEvent) {
      return res.json({ currentEvent: null });
    }
    
    // Format response
    res.json({
      currentEvent: {
        summary: currentEvent.summary,
        start: currentEvent.start.dateTime || currentEvent.start.date,
        end: currentEvent.end.dateTime || currentEvent.end.date,
        calendarColor
      }
    });
  } catch (error) {
    console.error('Calendar API error:', error);
    
    // Update session if tokens were refreshed
    if (error.code === 401 && req.session.tokens.refresh_token) {
      try {
        const { tokens } = await oauth2Client.refreshToken(req.session.tokens.refresh_token);
        req.session.tokens = tokens;
        await new Promise((resolve, reject) => {
          req.session.save((err) => {
            if (err) reject(err);
            else resolve();
          });
        });
        return res.status(401).json({ error: 'Token refreshed, please try again' });
      } catch (refreshError) {
        console.error('Token refresh failed:', refreshError);
        return res.status(401).json({ error: 'Authentication expired' });
      }
    }
    
    res.status(500).json({ error: 'Failed to fetch calendar data' });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
}); 