server.js
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// In-memory cache
const cache = new Map();
const CACHE_TTL = 60000; // 1 minute

// API Key storage
const apiKeys = new Map();

// Rate limiting
const createRateLimit = (tier) => {
  const limits = {
    free: { windowMs: 60 * 60 * 1000, max: 100 },
    pro: { windowMs: 60 * 60 * 1000, max: 10000 },
    enterprise: { windowMs: 60 * 60 * 1000, max: 100000 }
  };

  return rateLimit({
    windowMs: limits[tier].windowMs,
    max: limits[tier].max,
    message: { error: 'Rate limit exceeded. Upgrade your plan.' }
  });
};

// API Key middleware
const validateApiKey = (req, res, next) => {
  const apiKey = req.headers['x-api-key'];

  if (!apiKey) {
    return res.status(401).json({ 
      error: 'API key required',
      message: 'Get your free API key at https://your-domain.com'
    });
  }

  let tier = 'free';
  if (apiKey.startsWith('pro_')) tier = 'pro';
  if (apiKey.startsWith('ent_')) tier = 'enterprise';

  req.tier = tier;
  req.apiKey = apiKey;
  next();
};

// Get crypto prices from CoinGecko
async function getCryptoPrices(ids = 'bitcoin,ethereum') {
  const cacheKey = `prices_${ids}`;
  const cached = cache.get(cacheKey);

  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  try {
    const response = await axios.get(
      `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true&include_market_cap=true&include_24hr_vol=true`,
      { timeout: 10000 }
    );
  
    cache.set(cacheKey, {
      data: response.data,
      timestamp: Date.now()
    });
  
    return response.data;
  } catch (error) {
    console.error('Error fetching prices:', error.message);
    throw error;
  }
}

// Routes
app.get('/', (req, res) => {
  res.json({
    name: 'Crypto Price API',
    version: '1.0.0',
    description: 'Real-time cryptocurrency price data API',
    endpoints: {
      '/prices': 'Get BTC and ETH prices',
      '/prices/:id': 'Get specific crypto price',
      '/health': 'Health check'
    },
    pricing: {
      free: { price: '$0/month', requests: '100/hour' },
      pro: { price: '$9/month', requests: '10,000/hour' },
      enterprise: { price: '$49/month', requests: 'Unlimited' }
    },
    payment: {
      crypto: '0xdef68D7130806C789fDD31B9DaC99364f54C8a9C (USDC on Base)'
    }
  });
});

app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

app.get('/prices', validateApiKey, createRateLimit('free'), async (req, res) => {
  try {
    const prices = await getCryptoPrices('bitcoin,ethereum');
    res.json({
      success: true,
      tier: req.tier,
      data: prices,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch prices', message: error.message });
  }
});

app.get('/prices/:id', validateApiKey, createRateLimit('free'), async (req, res) => {
  try {
    const { id } = req.params;
    const prices = await getCryptoPrices(id.toLowerCase());
  
    if (!prices[id.toLowerCase()]) {
      return res.status(404).json({ 
        error: 'Cryptocurrency not found',
        message: `No data for '${id}'. Try 'bitcoin', 'ethereum', 'cardano', etc.`
      });
    }
  
    res.json({
      success: true,
      tier: req.tier,
      data: prices,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch price', message: error.message });
  }
});

app.post('/generate-key', (req, res) => {
  const { tier = 'free' } = req.body;
  const prefix = tier === 'pro' ? 'pro_' : tier === 'enterprise' ? 'ent_' : 'free_';
  const key = prefix + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);

  apiKeys.set(key, { tier, createdAt: new Date() });

  res.json({
    apiKey: key,
    tier,
    message: 'This is a test key. For production, please upgrade.'
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Crypto Price API running on port ${PORT}`);
  console.log(`💰 Payment address: 0xdef68D7130806C789fDD31B9DaC99364f54C8a9C (USDC on Base)`);
});
