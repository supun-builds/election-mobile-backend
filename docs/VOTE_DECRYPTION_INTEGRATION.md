# Vote Decryption Integration Guide (Member 3)

## 1. Overview
This service integrates Member 3's Results Dashboard & Vote Counting module with Member 2's Python/Django ballot encryption module.

Ballots in MongoDB Atlas are protected using **Envelope Encryption**:
- **Asymmetric Key:** RSA-3072-OAEP with SHA-256 (MGF1 SHA-256).
- **Symmetric Key:** Ephemeral AES-256-GCM (fresh 32-byte key per ballot).
- **Nonce:** 12-byte random IV.
- **Authentication Tag:** 16-byte GCM tag appended to ciphertext (standard Python `AESGCM.encrypt` format).
- **Format:** JSON envelope stored in MongoDB Atlas `vote.preferences`.

---

## 2. Directory Structure & Key Management

```
election-api/
├── keys/
│   └── results_private_key.pem   <-- Password-protected PKCS#8 RSA-3072 Private Key
├── services/
│   └── decryptor.js              <-- Core decryption & preference validation service
├── routes/
│   └── votes.js                  <-- Aggregation & result endpoints
├── test_ballot_decryption.js     <-- Integration test script
├── .env                          <-- Environment variables (Passphrase & DB URI)
└── .gitignore                    <-- Ignores keys/ and *.pem
```

> **Security Rule:** `results_private_key.pem` is strictly confidential to Member 3. Only the corresponding **Public Key** (`results_public_key.pem`) is provided to Member 2.

---

## 3. Environment Variables

Configure `election-api/.env`:

```env
PORT=3000
VOTE_MONGO_URI=mongodb+srv://<username>:<password>@cluster0.ftlxeqs.mongodb.net/election?appName=Cluster0

# RSA-3072 + AES-256-GCM Settings
RESULTS_PRIVATE_KEY_PATH=./keys/results_private_key.pem
RESULTS_KEY_PASSPHRASE=your_secret_passphrase_here
EXPECTED_KEY_ID=results-key-v1
EXPECTED_ELECTION_ID=PRES-2026

# Legacy Fernet Key (for backwards compatibility with Version 0 test ballots)
VOTE_ENCRYPTION_KEY=Avq7dnH43UU0YcC1PkbG7mQNmer_n9Jya5NSLOpFVQQ=
```

---

## 4. Encrypted Ballot Envelope Schema

Stored in MongoDB Atlas `vote` collection inside the `preferences` field:

```json
{
  "_id": "6acdf93c83a86efa7a078b9c",
  "preferences": "{\"algorithm\":\"AES-256-GCM+RSA-3072-OAEP-SHA256\",\"ballot_id\":\"a2fd1d91-89cf-4bad-bc62-41900f849a41\",\"ciphertext\":\"...\",\"election_id\":\"PRES-2026\",\"encrypted_key\":\"...\",\"encryption_version\":1,\"key_id\":\"results-key-v1\",\"nonce\":\"...\"}",
  "polling_station": "Galle / Galle (H)",
  "station_code": "07-H"
}
```

---

## 5. Decryption Workflow (`services/decryptor.js`)

1. **Envelope Inspection:** Verifies `encryption_version === 1`, `algorithm === 'AES-256-GCM+RSA-3072-OAEP-SHA256'`, and `key_id`.
2. **RSA Key Decryption:** 
   - Uses `crypto.privateDecrypt()` with `RSA_PKCS1_OAEP_PADDING` and `oaepHash: 'sha256'`.
   - Recovers the 32-byte AES key.
3. **AES-GCM Decryption:**
   - Extracts the last 16 bytes of Base64-decoded ciphertext as the auth tag.
   - Uses `crypto.createDecipheriv('aes-256-gcm', aesKey, nonce)`.
   - Validates AAD (`election_id:ballot_id`) and authentication tag.
4. **Preference Validation:**
   - Rank `"1"` is mandatory.
   - Rank `"2"` and `"3"` are optional.
   - Duplicate candidate IDs on the same ballot trigger immediate rejection.

---

## 6. How to Run the Verification Test

Once you enter your passphrase in `.env`:

```bash
cd election-api
node test_ballot_decryption.js
```
