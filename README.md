# Google Calendar Real-Time Visualizer

A web application that shows your currently running Google Calendar event on a full-screen page with a visual progress indicator.

## Features

- OAuth2 authentication with Google Calendar API
- **Serverless-friendly session management with Upstash Redis**
- Persistent login across browser sessions
- Displays the currently active calendar event with its name and time
- Visual progress bar that fills in real-time as the event progresses
- Background color matches the calendar's color
- Automatically updates when an event ends

## Setup

### Prerequisites

- Node.js (v16 or later)
- npm
- [Upstash Redis](https://upstash.com/) account (for session storage)
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

# Upstash Redis (get these from your Upstash dashboard)
UPSTASH_REDIS_REST_URL=your_upstash_redis_rest_url
UPSTASH_REDIS_REST_TOKEN=your_upstash_redis_rest_token
```

For production, set:
- `NODE_ENV=production`
- `REDIRECT_URI=https://your-domain.com/auth/redirect`
- `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` from your Upstash dashboard

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
3. Start the application:
   ```bash
   npm start
   ```
4. Open `http://localhost:3000` in your browser
5. Click "Connect Google Calendar" to authenticate

## Deployment

### Vercel + Upstash Redis

1. Fork this repository
2. Create a Redis database on [Upstash](https://upstash.com/)
3. Connect your fork to Vercel
4. Add environment variables in the Vercel project settings:
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`
   - `REDIRECT_URI` (your-vercel-domain.vercel.app/auth/redirect)
   - `UPSTASH_REDIS_REST_URL` (from Upstash)
   - `UPSTASH_REDIS_REST_TOKEN` (from Upstash)
   - `NODE_ENV=production`
5. Deploy

## Security Considerations

- Session data is stored in Upstash Redis with secure, HTTP-only cookies
- OAuth tokens are never exposed to the client
- HTTPS is enforced in production
- Session cookies are secure and SameSite=Lax
- Environment variables are used for all secrets
- Regular security audits with `npm audit`

## License

MIT 