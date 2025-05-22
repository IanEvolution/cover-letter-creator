// Simple Node.js backend for AI cover letter generation
// (This is a placeholder. Replace with your actual backend code if needed.)

const express = require('express');
const cors = require('cors');
const app = express();
app.use(cors());
app.use(express.json());

app.post('/generate-cover-letter', async (req, res) => {
  // This should call your AI model or API
  // For now, just echo the prompt for testing
  const { prompt } = req.body;
  res.json({ choices: [{ message: { content: `Echo: ${prompt}` } }] });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Cover letter backend running on port ${PORT}`);
});
