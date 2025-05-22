# Cover Letter Creator Backend (Render.com Ready)

This is the Node.js backend for the Cover Letter Creator Chrome extension.

## Deployment Instructions (Render.com)

1. **Root Directory:**
   - Set to `cover-letter-backend` in Render.com service settings.

2. **Build Command:**
   - `npm install`

3. **Start Command:**
   - `npm start`

4. **Node Version:**
   - Set in `package.json` (already set to ">=18 <23").

5. **Environment Variables:**
   - Add `OPENAI_API_KEY` in the Render.com dashboard (do NOT upload your .env file).

6. **Port:**
   - The app listens on `process.env.PORT` (Render sets this automatically).

7. **.gitignore:**
   - `.env` is already ignored for security.

---

## Local Development
- Create a `.env` file in this folder with your OpenAI key:
  ```
  OPENAI_API_KEY=sk-...
  ```
- Run `npm install` and `npm start`.

---

## API Endpoint
- `POST /generate-cover-letter` — Accepts `{ prompt: string }` and returns a generated cover letter.
