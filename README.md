# Google Calendar Real-Time Visualizer

A web application that shows your currently running Google Calendar event on a full-screen page with a visual progress indicator.

## Features

- OAuth2 authentication with Google Calendar API
- Secure session management with Redis
- Persistent login across browser sessions
- Displays the currently active calendar event with its name and time
- Visual progress bar that fills in real-time as the event progresses
- Background color matches the calendar's color
- Automatically updates when an event ends

## Setup

### Prerequisites

- Node.js (v16 or later)
- npm
- Redis server (for session storage)
- Google Cloud Platform account with Calendar API enabled

### Environment Variables

Create a `.env` file with the following variables:

```env
# Google OAuth
GOOGLE_CLIENT_ID=your_client_id
GOOGLE_CLIENT_SECRET=your_client_secret
REDIRECT_URI=http://localhost:3000/auth/redirect

# Server
PORT=3000
NODE_ENV=development

# Session
SESSION_SECRET=your_secure_random_string
REDIS_URL=redis://localhost:6379
```

For production, set:
- `NODE_ENV=production`
- `REDIRECT_URI=https://your-domain.com/auth/redirect`
- `REDIS_URL=your_redis_url` (from your Redis provider)

### Google API Setup

1. Go to the [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project
3. Navigate to "APIs & Services" > "Library" and enable the Google Calendar API
4. Go to "APIs & Services" > "Credentials"
5. Create an OAuth 2.0 Client ID (Web application)
6. Add authorized redirect URIs:
   - For local development: `http://localhost:3000/auth/redirect`
   - For production: `https://your-domain.com/auth/redirect`
7. Note your Client ID and Client Secret

### Local Development

1. Clone this repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start Redis server (if not already running):
   ```bash
   # macOS with Homebrew
   brew services start redis
   
   # Linux
   sudo service redis-server start
   
   # Windows
   # Download and install Redis from https://github.com/microsoftarchive/redis/releases
   ```
4. Start the application:
   ```bash
   npm run dev
   ```
5. Open `http://localhost:3000` in your browser
6. Click "Connect Google Calendar" to authenticate

## Deployment

### Vercel + Upstash Redis

1. Fork this repository
2. Create a Redis database on [Upstash](https://upstash.com/)
3. Connect your fork to Vercel
4. Add environment variables in the Vercel project settings:
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`
   - `REDIRECT_URI` (your-vercel-domain.vercel.app/auth/redirect)
   - `SESSION_SECRET` (generate a secure random string)
   - `REDIS_URL` (from Upstash)
   - `NODE_ENV=production`
5. Deploy

### Heroku + Redis Cloud

1. Fork this repository
2. Create a Redis database on [Redis Cloud](https://redis.com/try-free/)
3. Connect your fork to Heroku
4. Add the Redis Cloud add-on to your Heroku app
5. Add environment variables in the Heroku project settings:
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`
   - `REDIRECT_URI` (your-heroku-domain.herokuapp.com/auth/redirect)
   - `SESSION_SECRET` (generate a secure random string)
   - `NODE_ENV=production`
6. Deploy

### Railway + Redis

1. Fork this repository
2. Create a new project on [Railway](https://railway.app/)
3. Add a Redis service to your project
4. Add environment variables in the Railway project settings:
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`
   - `REDIRECT_URI` (your-railway-domain.railway.app/auth/redirect)
   - `SESSION_SECRET` (generate a secure random string)
   - `NODE_ENV=production`
5. Deploy

## Security Considerations

- Session data is stored in Redis with secure, HTTP-only cookies
- OAuth tokens are never exposed to the client
- HTTPS is enforced in production
- Session cookies are secure and SameSite=Lax
- Environment variables are used for all secrets
- Regular security audits with `npm audit`

## License

MIT 