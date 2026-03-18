// backend/routes/analyse.js
import express from 'express';
import auth from '../middleware/auth.js';

const router = express.Router();

router.post('/expiry', auth, async (req, res) => {
  try {
    const { image, mimeType = 'image/jpeg' } = req.body;

    if (!image) {
      return res.status(400).json({ message: 'No image provided' });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      console.error('ANTHROPIC_API_KEY is missing from .env');
      return res.status(500).json({ message: 'ANTHROPIC_API_KEY not configured on server' });
    }

    console.log('📸 Sending image to Claude for expiry analysis...');

    // Use native fetch (Node 18+) — no node-fetch needed
    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001', // fast + vision capable
        max_tokens: 300,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mimeType,
                data: image,
              },
            },
            {
              type: 'text',
              text: `Look at this food product label. Find the expiry date, best before date, or use by date.

Respond with ONLY this JSON (no markdown, no explanation):
{"found": true, "date": "YYYY-MM-DD", "display": "text you saw", "confidence": "high"}

Or if no date visible:
{"found": false}

Rules:
- "JUL 2026" or "07/2026" → last day of that month → "2026-07-31"
- "12/2025" → "2025-12-31"
- "31/07/2026" → "2026-07-31"
- Look for: Use By, Best Before, Exp, BB, Expiry, Use Before, Best By`,
            },
          ],
        }],
      }),
    });

    const responseText = await anthropicRes.text();
    console.log('Claude HTTP status:', anthropicRes.status);

    if (!anthropicRes.ok) {
      console.error('Claude API error response:', responseText);
      let errMsg = `Claude API error ${anthropicRes.status}`;
      try {
        const errJson = JSON.parse(responseText);
        errMsg = errJson?.error?.message || errMsg;
      } catch {}
      return res.status(502).json({ message: errMsg });
    }

    let data;
    try {
      data = JSON.parse(responseText);
    } catch {
      console.error('Could not parse Claude response as JSON:', responseText);
      return res.status(200).json({ found: false });
    }

    const raw = data.content?.find(b => b.type === 'text')?.text?.trim() || '';
    console.log('Claude raw reply:', raw);

    // Strip any accidental markdown
    const clean = raw.replace(/```json\s*/gi, '').replace(/```/g, '').trim();

    let result;
    try {
      result = JSON.parse(clean);
    } catch {
      console.error('Could not parse Claude reply as JSON:', clean);
      // Try to extract a date from the text as last resort
      const dateMatch = clean.match(/\d{4}-\d{2}-\d{2}/);
      if (dateMatch) {
        result = { found: true, date: dateMatch[0], display: dateMatch[0], confidence: 'low' };
      } else {
        result = { found: false };
      }
    }

    console.log('✅ Analysis result:', result);
    return res.json(result);

  } catch (err) {
    console.error('❌ Analyse route exception:', err.message, err.stack);
    return res.status(500).json({ message: `Server error: ${err.message}` });
  }
});

export default router;