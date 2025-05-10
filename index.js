require('dotenv').config();
const express = require('express');
const { google } = require('googleapis');
const path = require('path');
const { Redis } = require('@upstash/redis');
const crypto = require('crypto');
const cookieParser = require('cookie-parser');

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize Upstash Redis client - only once per cold start
let redisClient;
try {
  redisClient = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
    automaticDeserialization: true,
  });
} catch (error) {
  console.error('Failed to initialize Upstash Redis client:', error);
  // Continue without crashing - we'll handle errors in the handlers
}

// Setup middleware
app.use(express.json());
app.use(cookieParser());
app.use(express.static('public'));

// Helper: Generate a secure session ID
function generateSessionId() {
  return crypto.randomBytes(32).toString('hex');
}

// Middleware: Load session from Upstash
app.use(async (req, res, next) => {
  try {
    let sessionId = req.cookies.sessionId;
    if (!sessionId) {
      sessionId = generateSessionId();
      res.cookie('sessionId', sessionId, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        path: '/' // Ensure cookie is available for all paths
      });
      req.session = {};
    } else {
      try {
        if (!redisClient) {
          req.session = {};
        } else {
          const data = await redisClient.get(`sess:${sessionId}`);
          req.session = data || {};
        }
      } catch (error) {
        console.error('Failed to get session from Redis:', error);
        req.session = {};
      }
    }
    req.sessionId = sessionId;
    next();
  } catch (error) {
    console.error('Session middleware error:', error);
    req.session = {};
    req.sessionId = generateSessionId();
    next();
  }
});

// Middleware: Save session to Upstash after response
app.use((req, res, next) => {
  const originalEnd = res.end;
  
  res.end = async function(chunk, encoding) {
    try {
      if (req.sessionId && req.session && redisClient) {
        await redisClient.set(`sess:${req.sessionId}`, req.session, { ex: 7 * 24 * 60 * 60 }); // 7 days
      }
    } catch (error) {
      console.error('Failed to save session to Redis:', error);
    }
    
    originalEnd.call(res, chunk, encoding);
  };
  
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
  try {
    // Set a debug cookie to check if cookies are working
    res.cookie('auth_debug', 'true', { 
      maxAge: 3600000,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/'
    });
    
    console.log('Starting OAuth flow with sessionId:', req.sessionId);
    
    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: SCOPES,
      prompt: 'consent',
      state: req.sessionId
    });
    res.redirect(authUrl);
  } catch (error) {
    console.error('OAuth URL generation error:', error);
    res.status(500).send('Authentication failed - could not generate auth URL');
  }
});

// OAuth callback
app.get('/auth/redirect', async (req, res) => {
  const { code, state } = req.query;
  
  console.log('Redirect received:', { 
    stateFromGoogle: state,
    sessionIdFromCookie: req.sessionId,
    cookies: req.cookies
  });
  
  if (!code) {
    return res.status(400).send('Invalid authentication request: No code provided');
  }
  
  // If we don't have a sessionId cookie but Google sent a state, use that state as our sessionId
  if (state && (!req.sessionId || state !== req.sessionId)) {
    console.log('Session mismatch - using state from Google as sessionId');
    req.sessionId = state;
    res.cookie('sessionId', state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });
    req.session = {};
  }
  
  try {
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);
    
    // Store in session
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
    
    // Make sure session is saved before redirect
    if (redisClient) {
      console.log('Saving session to Redis with ID:', req.sessionId);
      await redisClient.set(`sess:${req.sessionId}`, req.session, { ex: 7 * 24 * 60 * 60 });
    } else {
      console.log('Warning: Redis client not available, session will not persist');
    }
    
    // Set the sessionId cookie again to ensure it's properly set after authentication
    res.cookie('sessionId', req.sessionId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });
    
    res.redirect('/');
  } catch (error) {
    console.error('OAuth error:', error);
    res.status(500).send(`Authentication failed: ${error.message}`);
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
      try {
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
      } catch (calError) {
        console.error(`Error fetching calendar ${cal.id}:`, calError);
        // Continue to next calendar
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
        
        // Save updated tokens
        if (redisClient) {
          await redisClient.set(`sess:${req.sessionId}`, req.session, { ex: 7 * 24 * 60 * 60 });
        }
        
        return res.status(401).json({ error: 'Token refreshed, please try again' });
      } catch (refreshError) {
        console.error('Token refresh failed:', refreshError);
        return res.status(401).json({ error: 'Authentication expired' });
      }
    }
    
    res.status(500).json({ error: 'Failed to fetch calendar data' });
  }
});

// Health check endpoint for Vercel
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok', redis: !!redisClient });
});

// For local development
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

// For Vercel
module.exports = app; 