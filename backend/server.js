import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';

import authRoutes    from './routes/auth.js';
import productRoutes from './routes/products.js';
import progressRoutes from './routes/progress.js';
import recipeRoutes  from './routes/recipes.js';
import analyseRoutes from './routes/analyse.js';

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json({ limit: '15mb' })); // must be large enough for base64 images

if (!process.env.MONGODB_URI) {
  console.error('MONGODB_URI is not defined in .env');
  process.exit(1);
}

app.use('/api/auth',     authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/progress', progressRoutes);
app.use('/api/recipes',  recipeRoutes);
app.use('/api/analyse',  analyseRoutes);

app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    aiAnalysis: process.env.ANTHROPIC_API_KEY ? 'configured ✅' : 'MISSING ANTHROPIC_API_KEY ❌',
  });
});

const PORT = process.env.PORT || 5000;

mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => {
  console.log('✅ MongoDB connected');
  app.listen(PORT, () => {
    console.log(`🚀 Server on port ${PORT}`);
  });
})
.catch(err => {
  console.error('❌ MongoDB error:', err.message);
  process.exit(1);
});

export default app;