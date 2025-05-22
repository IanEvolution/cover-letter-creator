# Cover Letter Backend

This is a simple Node.js backend for the Cover Letter Creator Chrome extension. It provides an endpoint for generating cover letters using AI (or a placeholder for local testing).

## Usage

1. Install dependencies:
   ```sh
   npm install
   ```
2. Start the server:
   ```sh
   npm start
   ```
3. The backend will run on `http://localhost:3000` by default.

## Endpoint
- `POST /generate-cover-letter` — Accepts `{ prompt: string }` and returns a generated cover letter (or echo for testing).

## Note
Replace the placeholder logic in `index.js` with your actual AI integration as needed.
