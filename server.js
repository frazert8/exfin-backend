const express = require('express');
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// Base URLs - Use Env vars for production, fallback to localhost for dev
// "Not the local host": Set SERVER_URL to your deployed domain (e.g., https://api.myapp.com)
const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3000';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

// 1. Admin setup: Needed to write tokens to the users' tables securely
const supabase = createClient(
  process.env.https://cuaskddjuqvxwqjjgcuw.supabase.co,
  process.env.eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN1YXNrZGRqdXF2eHdxampnY3V3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NTUzMjEwOCwiZXhwIjoyMDgxMTA4MTA4fQ.3qGIHy4OMrQIC1v_aci4Ju6f1-exRO0szBhsT07FMv0
);

// Configuration for GitHub OAuth
const OAUTH_CONFIG = {
  clientId: process.env.GITHUB_CLIENT_ID,
  clientSecret: process.env.GITHUB_CLIENT_SECRET,
  redirectUri: `${SERVER_URL}/callback`, // Dynamic callback URL
  authUrl: 'https://github.com/login/oauth/authorize',
  tokenUrl: 'https://github.com/login/oauth/access_token',
  scopes: 'user:email repo' // Example scopes: read email, read private repos
};

// 2. Trigger the flow: The React app sends the user here
app.get('/auth/connect', (req, res) => {
  const userId = req.query.userId;
  
  if (!userId) return res.status(400).send('User ID required');

  // We pass userId in the "state" parameter to track the user across the redirect
  const state = JSON.stringify({ userId });
  
  // Construct the GitHub authorization URL
  const authUri = `${OAUTH_CONFIG.authUrl}?client_id=${OAUTH_CONFIG.clientId}&scope=${OAUTH_CONFIG.scopes}&redirect_uri=${OAUTH_CONFIG.redirectUri}&state=${state}`;

  res.redirect(authUri);
});

// 3. The Callback: GitHub redirects user back here with a "code"
app.get('/callback', async (req, res) => {
  const { code, state } = req.query;

  if (!code || !state) return res.status(400).send('Invalid callback');

  try {
    const { userId } = JSON.parse(state);

    // A. Exchange the generic "code" for a real "Access Token"
    // GitHub specifically requires the 'Accept: application/json' header to return JSON
    const tokenResponse = await axios.post(
      OAUTH_CONFIG.tokenUrl,
      {
        client_id: OAUTH_CONFIG.clientId,
        client_secret: OAUTH_CONFIG.clientSecret,
        code: code,
        redirect_uri: OAUTH_CONFIG.redirectUri
      },
      {
        headers: {
          'Accept': 'application/json' 
        }
      }
    );

    const { access_token, refresh_token, expires_in } = tokenResponse.data;

    if (!access_token) {
        throw new Error('Failed to retrieve access token from GitHub');
    }

    // B. Save these tokens to Supabase
    // Note: GitHub tokens often don't expire unless revoked, so expires_in might be undefined
    const { error } = await supabase
      .from('integrations')
      .upsert({
        user_id: userId,
        provider: 'github', // Changed provider name
        access_token: access_token,
        refresh_token: refresh_token || null, 
        // Handle expiration if provided, otherwise set a far future date or null
        token_expires_at: expires_in ? new Date(Date.now() + expires_in * 1000).toISOString() : null,
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id, provider' });

    if (error) throw error;

    // C. Success! Redirect user back to your Live React App
    res.redirect(`${FRONTEND_URL}/dashboard?status=success`);

  } catch (error) {
    console.error('OAuth Error:', error.response?.data || error.message);
    res.redirect(`${FRONTEND_URL}/dashboard?status=error`);
  }
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
  console.log(`- Local Callback: http://localhost:${port}/callback`);
  console.log(`- Configured Callback: ${OAUTH_CONFIG.redirectUri}`);
});