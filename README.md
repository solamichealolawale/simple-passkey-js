# Cadana Passkey Authentication Demo

This project demonstrates a complete implementation of WebAuthn/Passkey authentication, supporting multiple passkeys per user and cross-device synchronization through platforms like iCloud Keychain.

## Features

- ✨ Passwordless authentication using WebAuthn/Passkeys
- 🔄 Multiple passkeys per user account
- 📱 Cross-device and cross-browser support
- 🔄 iCloud Keychain integration
- 🏷️ Custom naming for passkeys
- 📊 Passkey management dashboard
- 🔒 Secure authentication flow
- 💾 SQLite database storage

## Prerequisites

- Node.js v20.10.0 or later
- SQLite3
- A WebAuthn-capable browser (Chrome, Safari, Firefox, Edge)
- For development: A system with biometric capabilities (Touch ID, Face ID, Windows Hello) or a security key

## Installation

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd mock-server-js
   ```

2. Install dependencies:
   ```bash
   npm install
   # or if using pnpm
   pnpm install
   ```

3. Start the server:
   ```bash
   node server.js
   ```

The server will start on `http://localhost:3000`.

## Project Structure

```
mock-server-js/
├── server.js         # Main Express server and WebAuthn endpoints
├── db.js            # Database configuration and operations
├── public/          # Frontend static files
│   └── index.html   # Single-page application
└── auth.db         # SQLite database (created on first run)
```

## Backend Architecture

### Database Schema

The application uses SQLite with three main tables:

1. **Users Table**
   ```sql
   CREATE TABLE users (
       id TEXT PRIMARY KEY,
       email TEXT UNIQUE NOT NULL,
       display_name TEXT,
       created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
       last_login DATETIME
   );
   ```

2. **Credentials Table**
   ```sql
   CREATE TABLE credentials (
       credential_id TEXT PRIMARY KEY,
       user_id TEXT NOT NULL,
       public_key BLOB NOT NULL,
       counter BIGINT DEFAULT 0,
       name TEXT,
       device_type TEXT,
       created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
       last_used DATETIME,
       FOREIGN KEY (user_id) REFERENCES users(id)
   );
   ```

3. **Challenges Table**
   ```sql
   CREATE TABLE challenges (
       challenge_id TEXT PRIMARY KEY,
       user_id TEXT,
       challenge BLOB NOT NULL,
       created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
       expires_at DATETIME NOT NULL,
       type TEXT NOT NULL,
       FOREIGN KEY (user_id) REFERENCES users(id)
   );
   ```

### API Endpoints

#### Registration Flow
- `POST /auth/register`: Create new user account
- `POST /webauthn/registerRequest`: Initialize passkey registration
- `POST /webauthn/registerResponse`: Complete passkey registration

#### Authentication Flow
- `POST /webauthn/loginRequest`: Initialize passkey authentication
- `POST /webauthn/loginResponse`: Complete passkey authentication

#### Passkey Management
- `GET /auth/passkeys/:userId`: List user's passkeys
- `PUT /auth/passkeys/:credentialId`: Update passkey name
- `DELETE /auth/passkeys/:userId/:credentialId`: Delete passkey

## Frontend Implementation

The frontend is a single-page application built with vanilla JavaScript and modern CSS. It provides:

1. **User Registration**
   - Email and display name input
   - Passkey creation with platform authenticator

2. **User Authentication**
   - Email-based passkey authentication
   - Support for multiple authentication methods

3. **Passkey Management Dashboard**
   - List all registered passkeys
   - Add new passkeys
   - Rename existing passkeys
   - Delete passkeys
   - View passkey details (device type, last used)

### WebAuthn Configuration

The WebAuthn implementation is configured to support cross-platform usage:

```javascript
const options = {
    authenticatorSelection: {
        residentKey: "preferred",
        userVerification: "preferred"
    },
    attestation: "none"
};
```

This configuration allows:
- Passkey syncing through iCloud Keychain
- Cross-device authentication
- Multiple authentication methods (biometric, security keys)

## Security Features

1. **Challenge-Response Authentication**
   - Server generates random challenges for each authentication attempt
   - Challenges expire after 5 minutes
   - Prevents replay attacks

2. **Origin Validation**
   - Strict origin checking for all WebAuthn operations
   - Prevents cross-origin attacks

3. **User Verification**
   - Preferred user verification (biometric/PIN)
   - Counter tracking for credential usage

4. **Database Security**
   - Prepared statements to prevent SQL injection
   - Foreign key constraints
   - Automatic challenge cleanup

## Best Practices

1. **Multiple Passkey Support**
   - Users should register multiple passkeys as backups
   - At least one platform-bound and one cross-platform authenticator recommended

2. **Error Handling**
   - Graceful fallbacks for unsupported browsers
   - Clear error messages for users
   - Comprehensive server-side validation

3. **User Experience**
   - Intuitive passkey management interface
   - Clear success/error feedback
   - Automatic detection of authenticator type

## Troubleshooting

1. **Database Issues**
   ```bash
   # Reset database
   rm auth.db
   node server.js
   ```

2. **Cross-Device Sync Issues**
   - Ensure authenticatorAttachment is not restricted
   - Check iCloud Keychain is enabled on devices
   - Verify RP ID configuration

3. **CORS Issues**
   - Check origin configuration in server.js
   - Verify frontend origin matches backend expectations

## Development Notes

- The server uses port 3000 by default
- CORS is configured for localhost development
- SQLite database is created automatically on first run
- WebAuthn RP ID is set to "localhost"

## Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Create a new Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details. 