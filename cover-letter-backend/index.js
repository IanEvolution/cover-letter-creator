// Simple Node.js backend for AI cover letter generation
// (This is a placeholder. Replace with your actual backend code if needed.)

const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { OpenAI } = require('openai');
const app = express();
app.use(cors());
app.use(express.json());

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

app.post('/generate-cover-letter', async (req, res) => {
  const { prompt } = req.body;
  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 800, // adjust as needed
    });

    let generatedContent = completion.choices[0].message.content;

    // Enforce character count limit (~1530 characters) without cutting mid-sentence
    if (generatedContent.length > 1530) {
      const trimmedContent = generatedContent.substring(0, 1530);
      const lastSentenceEnd = trimmedContent.lastIndexOf('.');
      generatedContent = lastSentenceEnd !== -1 ? trimmedContent.substring(0, lastSentenceEnd + 1) : trimmedContent;
    }

    // Ensure titles are more reliable (e.g., capitalize first letter of each word)
    generatedContent = generatedContent.replace(/\b\w+/g, (word) => word.charAt(0).toUpperCase() + word.slice(1));

    res.json({ choices: [{ message: { content: generatedContent } }] });
  } catch (err) {
    res.status(500).json({ error: { message: err.message } });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Cover letter backend running on port ${PORT}`);
});
