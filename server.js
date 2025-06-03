const express = require('express');
const crypto = require('crypto');
const cors = require('cors'); // For local development
const fs = require('fs');
const path = require('path');
const db = require('./db');

// Helper for Base64URL encoding/decoding
function base64URLEncode(buffer) {
    return Buffer.from(buffer)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');
}

function base64URLDecode(str) {
    if (!str) return Buffer.from('');
    str = str.replace(/-/g, '+').replace(/_/g, '/');
    while (str.length % 4) {
        str += '=';
    }
    return Buffer.from(str, 'base64');
}

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public'))); // Serve static files

// Configure CORS for local development
const corsOptions = {
    origin: 'http://localhost:3000', // Updated to match our demo server
    optionsSuccessStatus: 200
};
app.use(cors(corsOptions));

// Middleware to cleanup expired challenges
app.use((req, res, next) => {
    db.cleanupChallenges();
    next();
});

// --- .well-known endpoint for WebAuthn RP ID verification (if needed by platform) ---
app.get('/.well-known/webauthn', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    // The content of this file can be more complex, for associating multiple origins
    // with an RP ID, but for localhost development, confirming the RP ID is a start.
    res.json({ rp_id: RP_ID }); 
});

// --- BEGIN DATA PERSISTENCE (VERY SIMPLISTIC - IN-MEMORY/FILE-BASED FOR MVP) ---
const DB_PATH = path.join(__dirname, 'mock_db.json');
let challengeStore = {}; // In-memory for challenges, associated with a temporary session/user identifier
let database = {
    users: {}, // Store user specific info if needed
    credentials: [] // Store registered credentials
};

function loadDB() {
    try {
        if (fs.existsSync(DB_PATH)) {
            const data = fs.readFileSync(DB_PATH, 'utf-8');
            database = JSON.parse(data);
            if (!database.users) database.users = {};
            if (!database.credentials) database.credentials = [];
        }
    } catch (err) {
        console.error("Error loading mock DB:", err);
        database = { users: {}, credentials: [] };
    }
}

function saveDB() {
    try {
        fs.writeFileSync(DB_PATH, JSON.stringify(database, null, 2));
    } catch (err) {
        console.error("Error saving mock DB:", err);
    }
}

loadDB(); // Load DB on server start
// --- END DATA PERSISTENCE ---

// Relying Party (RP) and User constants (adjust as needed)
const RP_ID = "localhost";
const RP_NAME = "Cadana MVP";
const EXPECTED_ORIGIN = "http://localhost:3000"; // Changed from https://localhost:8080 to match our demo server

// --- REGISTRATION ENDPOINTS ---
app.post('/auth/register', (req, res) => {
    const { email, displayName } = req.body;
    
    try {
        // Check if user already exists
        const existingUser = db.getUserByEmail(email);
        if (existingUser) {
            return res.status(400).json({ error: "User already exists" });
        }

        // Create new user
        const userId = crypto.randomBytes(16).toString('hex');
        db.createUser(userId, email, displayName);

        res.json({ 
            status: "success", 
            userId,
            message: "User registered successfully. You can now create a passkey." 
        });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ error: "Registration failed" });
    }
});

app.post('/webauthn/registerRequest', (req, res) => {
    const { userId, email } = req.body;
    
    try {
        // Verify user exists
        const user = db.getUserById(userId);
        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }

        // Generate challenge
        const challenge = crypto.randomBytes(32);
        const challengeId = crypto.randomBytes(16).toString('hex');
        
        // Store challenge
        db.createChallenge(challengeId, userId, challenge, 'registration');

        // Get existing credentials for exclusion
        const existingCredentials = db.getCredentialsByUser(userId);
        const excludeCredentials = existingCredentials.map(cred => ({
            type: 'public-key',
            id: cred.credential_id // Already Base64URL encoded
        }));

        const options = {
            challenge: base64URLEncode(challenge),
            rp: {
                name: RP_NAME,
                id: RP_ID,
            },
            user: {
                id: base64URLEncode(Buffer.from(userId)),
                name: user.email,
                displayName: user.display_name,
            },
            pubKeyCredParams: [
                { type: "public-key", alg: -7 },  // ES256
                { type: "public-key", alg: -257 } // RS256
            ],
            authenticatorSelection: {
                residentKey: "preferred",
                userVerification: "preferred"
            },
            timeout: 60000,
            attestation: "none",
            excludeCredentials
        };

        res.json({ 
            options,
            challengeId // Send challenge ID back to client
        });
    } catch (error) {
        console.error('Registration request error:', error);
        res.status(500).json({ error: "Failed to initiate registration" });
    }
});

app.post('/webauthn/registerResponse', (req, res) => {
    const { challengeId, credential, passkeyName } = req.body;
    
    try {
        // Retrieve and verify challenge
        const storedChallenge = db.getChallenge(challengeId);
        if (!storedChallenge || storedChallenge.type !== 'registration') {
            return res.status(400).json({ error: "Invalid or expired challenge" });
        }

        // Parse client data
        const clientDataJSON = JSON.parse(base64URLDecode(credential.response.clientDataJSON).toString());
        
        // Verify challenge
        const expectedChallenge = base64URLEncode(storedChallenge.challenge);
        if (clientDataJSON.challenge !== expectedChallenge) {
            return res.status(400).json({ error: "Challenge verification failed" });
        }

        // Verify origin
        if (clientDataJSON.origin !== EXPECTED_ORIGIN) {
            return res.status(400).json({ error: "Origin verification failed" });
        }

        // Detect device type (this is a simple example - you might want to enhance this)
        const deviceType = credential.response.authenticatorAttachment || 'unknown';

        // Store the credential with name and device type
        db.addCredential(
            credential.id,
            storedChallenge.user_id,
            Buffer.from(credential.response.attestationObject, 'base64url'),
            passkeyName || 'My Passkey',
            deviceType
        );

        // Clean up the challenge
        db.deleteChallenge(challengeId);

        res.json({ 
            status: "success",
            message: "Passkey registered successfully"
        });
    } catch (error) {
        console.error('Registration response error:', error);
        res.status(500).json({ error: "Failed to complete registration" });
    }
});

// WebAuthn authentication request (login)
app.post('/webauthn/loginRequest', (req, res) => {
    try {
        const { email } = req.body;
        
        // Check if user exists
        const user = db.getUserByEmail(email);
        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }

        // Get user's credentials
        const existingCredentials = db.getCredentialsByUser(user.id);
        if (!existingCredentials || existingCredentials.length === 0) {
            return res.status(400).json({ error: "No passkey found for this user" });
        }

        // Generate challenge
        const challenge = crypto.randomBytes(32);
        const challengeId = crypto.randomBytes(16).toString('hex');
        
        // Store challenge with user ID
        db.createChallenge(challengeId, user.id, challenge, 'authentication');

        const options = {
            challenge: base64URLEncode(challenge),
            rpId: RP_ID,
            timeout: 60000,
            userVerification: "preferred",
            allowCredentials: existingCredentials.map(cred => ({
                type: 'public-key',
                id: cred.credential_id,
                transports: ["internal", "hybrid", "ble", "nfc", "usb"] // Add all possible transports
            }))
        };

        res.json({ 
            options,
            challengeId
        });
    } catch (error) {
        console.error('Login request error:', error);
        res.status(500).json({ error: "Failed to initiate login" });
    }
});

// WebAuthn authentication response (login completion)
app.post('/webauthn/loginResponse', (req, res) => {
    const { challengeId, credential } = req.body;
    
    try {
        // Retrieve and verify challenge
        const storedChallenge = db.getChallenge(challengeId);
        if (!storedChallenge || storedChallenge.type !== 'authentication') {
            return res.status(400).json({ error: "Invalid or expired challenge" });
        }

        // Parse client data
        const clientDataJSON = JSON.parse(base64URLDecode(credential.response.clientDataJSON).toString());
        
        // Verify challenge
        const expectedChallenge = base64URLEncode(storedChallenge.challenge);
        if (clientDataJSON.challenge !== expectedChallenge) {
            return res.status(400).json({ error: "Challenge verification failed" });
        }

        // Verify origin
        if (clientDataJSON.origin !== EXPECTED_ORIGIN) {
            return res.status(400).json({ error: "Origin verification failed" });
        }

        // Get credential from database
        const storedCredential = db.getCredentialById(credential.id);
        if (!storedCredential) {
            return res.status(400).json({ error: "Unknown credential" });
        }

        // Get user information
        const user = db.getUserById(storedCredential.user_id);
        if (!user) {
            return res.status(400).json({ error: "User not found" });
        }

        // Update credential counter and last used timestamp
        db.updateCredentialCounter(credential.id, credential.response.authenticatorData?.counter || 0);
        
        // Update user's last login timestamp
        db.updateUserLastLogin(user.id);

        // Clean up the challenge
        db.deleteChallenge(challengeId);

        res.json({
            status: "success",
            user: {
                id: user.id,
                email: user.email,
                displayName: user.display_name
            }
        });
    } catch (error) {
        console.error('Login response error:', error);
        res.status(500).json({ error: "Login failed" });
    }
});

// Get user's passkeys
app.get('/auth/passkeys/:userId', (req, res) => {
    try {
        const { userId } = req.params;
        
        // Get user's credentials
        const credentials = db.getCredentialsByUser(userId);
        
        // Format the response to exclude sensitive data
        const passkeys = credentials.map(cred => ({
            id: cred.credential_id,
            name: cred.name || 'Unnamed Passkey',
            deviceType: cred.device_type || 'unknown',
            createdAt: cred.created_at,
            lastUsed: cred.last_used
        }));
        
        res.json({ passkeys });
    } catch (error) {
        console.error('Error fetching passkeys:', error);
        res.status(500).json({ error: "Failed to fetch passkeys" });
    }
});

// Update passkey name
app.put('/auth/passkeys/:credentialId', (req, res) => {
    try {
        const { credentialId } = req.params;
        const { name } = req.body;
        
        // Update the credential name
        db.updateCredentialName(credentialId, name);
        
        res.json({ status: "success", message: "Passkey name updated" });
    } catch (error) {
        console.error('Error updating passkey:', error);
        res.status(500).json({ error: "Failed to update passkey" });
    }
});

// Delete passkey
app.delete('/auth/passkeys/:userId/:credentialId', (req, res) => {
    try {
        const { userId, credentialId } = req.params;
        
        // Get user's credentials
        const credentials = db.getCredentialsByUser(userId);
        
        // Don't allow deleting the last passkey
        if (credentials.length <= 1) {
            return res.status(400).json({ 
                error: "Cannot delete the last passkey. Add another passkey first." 
            });
        }
        
        // Delete the credential
        db.deleteCredential(credentialId, userId);
        
        res.json({ status: "success", message: "Passkey deleted" });
    } catch (error) {
        console.error('Error deleting passkey:', error);
        res.status(500).json({ error: "Failed to delete passkey" });
    }
});

const PORT = 3000; // Or any other port not in use
app.listen(PORT, () => {
    console.log(`Mock WebAuthn server listening on port ${PORT}`);
    console.log(`RP ID configured as: ${RP_ID}`);
    console.log(`Expected frontend origin for verification: ${EXPECTED_ORIGIN}`);
    console.log(`Mock DB file path: ${DB_PATH}`);
});

module.exports = app; // Optional: for testing or if you want to require() it elsewhere 