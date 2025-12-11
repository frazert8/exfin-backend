require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const cookieParser = require('cookie-parser');

const app = express();
// ALLOW REQUESTS FROM YOUR FRONTEND (ADJUST PORT IF NEEDED)
app.use(cors({ origin: 'http://localhost:5173', credentials: true })); 
app.use(cookieParser());

// LOAD KEYS FROM .ENV FILE
const CLIENT_ID = process.env.QB_CLIENT_ID;
const CLIENT_SECRET = process.env.QB_CLIENT_SECRET;
const REDIRECT_URI = process.env.QB_REDIRECT_URI;

// 1. START OAUTH: REDIRECT USER TO INTUIT
app.get('/auth/quickbooks', (req, res) => {
    const scope = 'com.intuit.quickbooks.accounting';
    const state = 'security_token'; // In prod, use a random string
    
    // Build the Intuit Authorization URL
    const authUri = `https://appcenter.intuit.com/connect/oauth2?client_id=${CLIENT_ID}&response_type=code&scope=${scope}&redirect_uri=${REDIRECT_URI}&state=${state}`;
    
    res.redirect(authUri);
});

// 2. CALLBACK: EXCHANGE CODE FOR TOKEN
app.get('/callback', async (req, res) => {
    const { code, realmId } = req.query;

    if (!code) return res.status(400).send('No code returned');

    try {
        // Exchange the Auth Code for an Access Token
        // This is the secure server-to-server step browsers can't do
        const authResponse = await axios({
            method: 'post',
            url: 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': 'Basic ' + Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64')
            },
            data: `grant_type=authorization_code&code=${code}&redirect_uri=${REDIRECT_URI}`
        });

        const { access_token, refresh_token } = authResponse.data;

        // Save tokens as HTTP-only cookies (Secure storage)
        res.cookie('access_token', access_token, { httpOnly: true });
        res.cookie('realmId', realmId, { httpOnly: true });

        // Send user back to your frontend dashboard
        res.redirect('http://localhost:5173/?status=connected');

    } catch (error) {
        console.error('OAuth Error:', error.response ? error.response.data : error.message);
        res.status(500).send('Authentication Failed');
    }
});

// 3. DATA API: FETCH P&L
app.get('/api/financial-data', async (req, res) => {
    const accessToken = req.cookies.access_token;
    const realmId = req.cookies.realmId;

    if (!accessToken) return res.status(401).json({ error: 'Not Authenticated' });

    try {
        // REAL CALL TO QUICKBOOKS API
        const qbUrl = `https://sandbox-quickbooks.api.intuit.com/v3/company/${realmId}/reports/ProfitAndLoss?minorversion=65`;
        
        const response = await axios.get(qbUrl, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Accept': 'application/json'
            }
        });

        // Send the raw data back to frontend (You'll parse it there)
        res.json(response.data);

    } catch (error) {
        console.error('API Error:', error.message);
        res.status(500).json({ error: 'Failed to fetch data' });
    }
});

const PORT = 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));