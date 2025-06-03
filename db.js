const Database = require('better-sqlite3');
const path = require('path');

// Initialize database
const db = new Database(path.join(__dirname, 'auth.db'), { verbose: console.log });

// Create tables if they don't exist
const initDb = () => {
    // Users table
    db.exec(`
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            email TEXT UNIQUE NOT NULL,
            display_name TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            last_login DATETIME
        );
    `);

    // Credentials table for storing WebAuthn credentials
    db.exec(`
        CREATE TABLE IF NOT EXISTS credentials (
            credential_id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            public_key BLOB NOT NULL,
            counter BIGINT DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            last_used DATETIME,
            FOREIGN KEY (user_id) REFERENCES users(id)
        );
    `);

    // Challenges table for storing temporary challenges
    db.exec(`
        CREATE TABLE IF NOT EXISTS challenges (
            challenge_id TEXT PRIMARY KEY,
            user_id TEXT,
            challenge BLOB NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            expires_at DATETIME NOT NULL,
            type TEXT NOT NULL, -- 'registration' or 'authentication'
            FOREIGN KEY (user_id) REFERENCES users(id)
        );
    `);
};

// Initialize database
initDb();

// Prepared statements for common operations
const statements = {
    // User operations
    createUser: db.prepare('INSERT INTO users (id, email, display_name) VALUES (?, ?, ?)'),
    getUserByEmail: db.prepare('SELECT * FROM users WHERE email = ?'),
    getUserById: db.prepare('SELECT * FROM users WHERE id = ?'),
    updateUserLastLogin: db.prepare('UPDATE users SET last_login = datetime(\'now\') WHERE id = ?'),

    // Credential operations
    addCredential: db.prepare('INSERT INTO credentials (credential_id, user_id, public_key) VALUES (?, ?, ?)'),
    getCredentialById: db.prepare('SELECT * FROM credentials WHERE credential_id = ?'),
    getCredentialsByUser: db.prepare('SELECT * FROM credentials WHERE user_id = ?'),
    updateCredentialCounter: db.prepare('UPDATE credentials SET counter = ?, last_used = datetime(\'now\') WHERE credential_id = ?'),

    // Challenge operations
    createChallenge: db.prepare('INSERT INTO challenges (challenge_id, user_id, challenge, expires_at, type) VALUES (?, ?, ?, datetime(\'now\', \'+5 minutes\'), ?)'),
    getChallenge: db.prepare('SELECT * FROM challenges WHERE challenge_id = ? AND expires_at > datetime(\'now\')'),
    deleteChallenge: db.prepare('DELETE FROM challenges WHERE challenge_id = ?'),
    cleanupChallenges: db.prepare('DELETE FROM challenges WHERE expires_at <= datetime(\'now\')')
};

// Export database interface
module.exports = {
    // User operations
    createUser: (id, email, displayName) => statements.createUser.run(id, email, displayName),
    getUserByEmail: (email) => statements.getUserByEmail.get(email),
    getUserById: (id) => statements.getUserById.get(id),
    updateUserLastLogin: (id) => statements.updateUserLastLogin.run(id),

    // Credential operations
    addCredential: (credentialId, userId, publicKey) => statements.addCredential.run(credentialId, userId, publicKey),
    getCredentialById: (credentialId) => statements.getCredentialById.get(credentialId),
    getCredentialsByUser: (userId) => statements.getCredentialsByUser.all(userId),
    updateCredentialCounter: (credentialId, counter) => statements.updateCredentialCounter.run(counter, credentialId),

    // Challenge operations
    createChallenge: (challengeId, userId, challenge, type) => statements.createChallenge.run(challengeId, userId, challenge, type),
    getChallenge: (challengeId) => statements.getChallenge.get(challengeId),
    deleteChallenge: (challengeId) => statements.deleteChallenge.run(challengeId),
    cleanupChallenges: () => statements.cleanupChallenges.run(),

    // Raw database access (for transactions etc.)
    db
}; 