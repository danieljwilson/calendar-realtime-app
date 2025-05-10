require('dotenv').config();
const express = require('express');
const { google } = require('googleapis');
const path = require('path');
const { Redis } = require('@upstash/redis');
const crypto = require('crypto');
const cookieParser = require('cookie-parser');

const app = express();
const PORT = process.env.PORT || 3000;

// Upstash Redis client
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

app.use(express.json());
app.use(cookieParser());
app.use(express.static('public'));

// Helper: Generate a secure session ID
function generateSessionId() {
  return crypto.randomBytes(32).toString('hex');
}

// Middleware: Load session from Upstash
app.use(async (req, res, next) => {
  let sessionId = req.cookies.sessionId;
  if (!sessionId) {
    sessionId = generateSessionId();
    res.cookie('sessionId', sessionId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });
    req.session = {};
  } else {
    req.session = (await redis.get(`sess:${sessionId}`)) || {};
  }
  req.sessionId = sessionId;
  next();
});

// Middleware: Save session to Upstash after response
app.use((req, res, next) => {
  res.on('finish', async () => {
    if (req.sessionId && req.session) {
      await redis.set(`sess:${req.sessionId}`, req.session, { ex: 7 * 24 * 60 * 60 }); // 7 days
    }
  });
  next();
});

// Google OAuth2 setup
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.REDIRECT_URI || `http://localhost:${PORT}/auth/redirect`
);

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
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent',
    state: req.sessionId
  });
  res.redirect(authUrl);
});

// OAuth callback
app.get('/auth/redirect', async (req, res) => {
  const { code, state } = req.query;
  if (!code || state !== req.sessionId) {
    return res.status(400).send('Invalid authentication request');
  }
  try {
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);
    req.session.tokens = tokens;
    req.session.authenticated = true;
    // Get available calendars
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    const calendarList = await calendar.calendarList.list();
    const selectedCalendars = calendarList.data.items.map(cal => ({
      id: cal.id,
      summary: cal.summary,
      backgroundColor: cal.backgroundColor
    }));
    req.session.selectedCalendars = selectedCalendars;
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
    oauth2Client.setCredentials(req.session.tokens);
    const selectedCalendars = req.session.selectedCalendars || [];
    if (selectedCalendars.length === 0) {
      return res.status(400).json({ error: 'No calendars selected' });
    }
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    const now = new Date();
    let currentEvent = null;
    let calendarColor = null;
    for (const cal of selectedCalendars) {
      const events = await calendar.events.list({
        calendarId: cal.id,
        timeMin: new Date(now.getTime() - 1000 * 60 * 60).toISOString(),
        timeMax: new Date(now.getTime() + 1000 * 60 * 60).toISOString(),
        singleEvents: true,
        orderBy: 'startTime'
      });
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
    if (error.code === 401 && req.session.tokens.refresh_token) {
      try {
        const { tokens } = await oauth2Client.refreshToken(req.session.tokens.refresh_token);
        req.session.tokens = tokens;
        return res.status(401).json({ error: 'Token refreshed, please try again' });
      } catch (refreshError) {
        console.error('Token refresh failed:', refreshError);
        return res.status(401).json({ error: 'Authentication expired' });
      }
    }
    res.status(500).json({ error: 'Failed to fetch calendar data' });
  }
});

if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

module.exports = app; // For Vercel 