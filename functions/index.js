const { onSchedule } = require("firebase-functions/v2/scheduler");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { getAuth } = require("firebase-admin/auth");
const { GoogleAuth } = require("google-auth-library");
const { logger } = require("firebase-functions");
const fetch = require("node-fetch");

initializeApp();
const db = getFirestore();
const auth = getAuth();

const { onDocumentCreated } = require('firebase-functions/v2/firestore');

// NOTE: API key embedded in code per project owner's request.
// This is insecure for public repos; consider using environment variables or Secret Manager.
const EMBEDDED_GEMINI_API_KEY = 'AIzaSyDuimVRJmZPt-jKEtkvqBNFM7B6S5nmSSU';

exports.gameUpdateTicker = onSchedule("every 5 minutes", async (event) => {
    logger.log("Game Update Ticker starting...");

    try {
        await deactivateActiveNews();
        const marketDoc = await db.doc('artifacts/stock-market-game-v1/public/market').get();
        const marketData = marketDoc.exists ? marketDoc.data() : {};
        const aiSettings = marketData.ai_settings || {};

        const stocks = await getStocks();
        if (stocks.length > 0) {
            await updateLeaderboard(stocks);
        } else {
            logger.warn("No stocks found, skipping leaderboard update.");
        }

        const minute = new Date(event.scheduleTime).getMinutes();
        if (minute % 15 === 0) {
            logger.log("Generating AI news...");
            const companies = stocks.map(s => ({ ticker: s.id, ...s.data }));
            if (companies.length > 0) {
                const headline = await generateHeadline(companies, aiSettings);
                const analysis = await analyzeHeadline(headline, companies, aiSettings);
                // write to pending news for admin approval
                await db.collection('artifacts/stock-market-game-v1/pending/news').add({
                    headline: headline,
                    ticker: analysis.ticker,
                    sentiment: analysis.sentiment,
                    impact_percent: analysis.impact_percent,
                    timestamp: new Date(),
                    is_active: false,
                    source: 'ai'
                });
                logger.log('AI-generated news written to pending/news for approval.');
            } else {
                logger.warn("No companies found, skipping AI news generation.");
            }
        }
        
        if (minute < 5) {
            logger.log("Running hourly task: clearing old news.");
            await clearOldNews();
        }

        // Occasionally list a new company: 10% chance on each scheduled run
        try {
            const chance = (aiSettings.listing_probability ?? 0.10);
            if (Math.random() < chance) {
                logger.log('Decided to attempt AI company listing generation.');
                const existingTickers = stocks.map(s => s.id);
                const newCompany = await generateCompanyListing(existingTickers, aiSettings);
                const ticker = newCompany.ticker;
                if (existingTickers.includes(ticker)) {
                    logger.warn(`AI generated ticker ${ticker} already exists. Skipping.`);
                } else {
                    // write to pending companies for admin approval
                    await db.collection('artifacts/stock-market-game-v1/pending/companies').add({
                        ticker: ticker,
                        name: newCompany.name,
                        sector: newCompany.sector,
                        price: newCompany.price,
                        volatility: newCompany.volatility,
                        dividend: newCompany.dividend,
                        created_at: new Date()
                    });
                    logger.log(`New company generated and written to pending/companies: ${ticker} - ${newCompany.name}`);
                }
            }
        } catch (err) {
            logger.error('Failed to generate or save new company listing:', err);
        }

    } catch (error) {
        logger.error("Error in Game Update Ticker:", error);
    }
});

// Firestore trigger: process admin action requests
exports.processAdminAction = onDocumentCreated('artifacts/stock-market-game-v1/admin_actions/{docId}', async (event) => {
    const data = event.data;
    const id = event.params.docId;
    logger.log(`Processing admin action ${id}:`, data);
    try {
        const marketDoc = await db.doc('artifacts/stock-market-game-v1/public/market').get();
        const aiSettings = marketDoc.exists ? (marketDoc.data().ai_settings || {}) : {};
        const stocks = await getStocks();
        const companies = stocks.map(s => ({ ticker: s.id, ...s.data }));

        if (data.type === 'generate_news') {
            if (companies.length === 0) {
                logger.warn('No companies to generate news for.');
            } else {
                const headline = await generateHeadline(companies, aiSettings);
                const analysis = await analyzeHeadline(headline, companies, aiSettings);
                await db.collection('artifacts/stock-market-game-v1/pending/news').add({
                    headline: headline,
                    ticker: analysis.ticker,
                    sentiment: analysis.sentiment,
                    impact_percent: analysis.impact_percent,
                    timestamp: new Date(),
                    is_active: false,
                    source: 'ai',
                    requested_by: data.requested_by || null
                });
                logger.log('Admin-triggered AI news written to pending/news for approval.');
            }
        } else if (data.type === 'generate_company') {
            const existingTickers = stocks.map(s => s.id);
            const newCompany = await generateCompanyListing(existingTickers, aiSettings);
            const ticker = newCompany.ticker;
            if (existingTickers.includes(ticker)) {
                logger.warn(`AI generated ticker ${ticker} already exists. Skipping.`);
            } else {
                await db.collection('artifacts/stock-market-game-v1/pending/companies').add({
                    ticker: ticker,
                    name: newCompany.name,
                    sector: newCompany.sector,
                    price: newCompany.price,
                    volatility: newCompany.volatility,
                    dividend: newCompany.dividend,
                    created_at: new Date(),
                    requested_by: data.requested_by || null
                });
                logger.log(`Admin-triggered new company written to pending/companies: ${ticker} - ${newCompany.name}`);
            }
        } else {
            logger.warn('Unknown admin action type:', data.type);
        }

        // mark action as processed
        const actionRef = db.doc(`artifacts/stock-market-game-v1/admin_actions/${id}`);
        await actionRef.update({ processed: true, processed_at: new Date() });
    } catch (err) {
        logger.error('Error processing admin action:', err);
        try { await db.doc(`artifacts/stock-market-game-v1/admin_actions/${id}`).update({ error: String(err) }); } catch (e) { logger.error('Failed to write error to action doc', e); }
    }
});

async function clearOldNews() {
    const newsRef = db.collection("artifacts/stock-market-game-v1/public/market/news");
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const oldNewsQuery = newsRef.where("timestamp", "<=", twentyFourHoursAgo);
    const snapshot = await oldNewsQuery.get();

    if (snapshot.empty) {
        logger.log("No old news to clear.");
        return;
    }

    const batch = db.batch();
    snapshot.docs.forEach(doc => {
        batch.delete(doc.ref);
    });
    await batch.commit();
    logger.log(`Cleared ${snapshot.size} old news articles.`);
}

async function deactivateActiveNews() {
    const newsRef = db.collection("artifacts/stock-market-game-v1/public/market/news");
    const activeNewsQuery = newsRef.where("is_active", "==", true);
    const snapshot = await activeNewsQuery.get();

    if (snapshot.empty) {
        return;
    }

    const batch = db.batch();
    snapshot.docs.forEach(doc => {
        batch.update(doc.ref, { is_active: false });
    });
    await batch.commit();
}

async function updateLeaderboard(stocks) {
    const usersRef = db.collection("artifacts/stock-market-game-v1/users");
    const usersSnap = await usersRef.get();
    if (usersSnap.empty) return;

    const players = [];
    for (const userDoc of usersSnap.docs) {
        const portfolioRef = db.doc(`artifacts/stock-market-game-v1/users/${userDoc.id}/portfolio/main`);
        const portfolioSnap = await portfolioRef.get();
        const authUser = await auth.getUser(userDoc.id).catch(() => null);

        if (portfolioSnap.exists() && authUser) {
            const portfolio = portfolioSnap.data();
            const stockValue = Object.keys(portfolio.stocks || {}).reduce((acc, ticker) => {
                const stock = stocks.find(s => s.id === ticker);
                return acc + (portfolio.stocks[ticker] * (stock?.data.price || 0));
            }, 0);
            const netWorth = portfolio.cash + stockValue;
            players.push({
                uid: userDoc.id,
                displayName: authUser.displayName,
                photoURL: authUser.photoURL,
                netWorth,
                cash: portfolio.cash,
                stockValue,
            });
        }
    }

    players.sort((a, b) => b.netWorth - a.netWorth);
    const topPlayers = players.slice(0, 20);

    const marketDocRef = db.doc("artifacts/stock-market-game-v1/public/market");
    await marketDocRef.set({ leaderboard: topPlayers, leaderboardLastUpdated: new Date() }, { merge: true });
}

async function getStocks() {
    const stocksRef = db.collection("artifacts/stock-market-game-v1/public/market/stocks");
    const snapshot = await stocksRef.get();
    return snapshot.docs.map(doc => ({ id: doc.id, data: doc.data() }));
}

function getApiKey() {
    // Prefer embedded key (explicit request). If empty, fall back to environment variable.
    if (typeof EMBEDDED_GEMINI_API_KEY !== 'undefined' && EMBEDDED_GEMINI_API_KEY) return EMBEDDED_GEMINI_API_KEY;
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
        logger.error('GEMINI_API_KEY not set in environment and no embedded key available.');
        throw new Error('GEMINI_API_KEY not configured');
    }
    return key;
}

async function generateHeadline(companies, aiSettings = {}) {
    const companyList = companies.map(c => `${c.ticker} (${c.sector})`).join(', ');
    const prompt = `You are a financial news generator for a stock market game. The currently available companies are: ${companyList}. Generate a single, realistic, and concise news headline about one of these companies or a general sector. Do not use quotation marks.`;
    const apiKey = getApiKey();
    const apiUrl = `https://us-central1-aiplatform.googleapis.com/v1/projects/stock-market-game-f0922/locations/us-central1/publishers/google/models/gemini-1.0-pro:generateContent?key=${apiKey}`;
    const temperature = parseFloat(aiSettings.headline_temperature ?? 0.9);
    const maxTokens = parseInt(aiSettings.headline_max_tokens ?? 256);
    const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: { temperature, topK: 1, topP: 1, maxOutputTokens: maxTokens }
        }),
    });
    const result = await response.json();
    if (!result.candidates || result.candidates.length === 0) {
        throw new Error("AI headline generation failed: No candidates returned.");
    }
    return result.candidates[0].content.parts[0].text.trim();
}

async function analyzeHeadline(headline, companies, aiSettings = {}) {
    const companyList = companies.map(c => c.ticker);
    const prompt = `Analyze the following headline: \"${headline}\". Respond with only a valid JSON object. The object must contain: \"ticker\" (the most relevant ticker from this list: ${companyList.join(', ')}), \"sentiment\" (a score from -1.0 for very negative to 1.0 for very positive), and \"impact_percent\" (a number representing the likely percentage price change, e.g., -15.5 or 8.0).`;
    const apiKey = getApiKey();
    const apiUrl = `https://us-central1-aiplatform.googleapis.com/v1/projects/stock-market-game-f0922/locations/us-central1/publishers/google/models/gemini-1.0-pro:generateContent?key=${apiKey}`;
    const temperature = parseFloat(aiSettings.analysis_temperature ?? 0);
    const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: "application/json", temperature }
        }),
    });
    const result = await response.json();
    if (!result.candidates || result.candidates.length === 0) {
        throw new Error("AI analysis failed: No candidates returned.");
    }
    // The model should return a JSON object in text; parse it safely
    const text = result.candidates[0].content.parts[0].text.trim();
    try {
        return JSON.parse(text);
    } catch (err) {
        logger.error('Failed to parse JSON from AI analysis:', text);
        throw new Error('AI analysis returned invalid JSON');
    }
}

// Occasionally generate a new company listing using the AI model.
async function generateCompanyListing(existingTickers = [], aiSettings = {}) {
    const prompt = `You are an assistant that creates a new fictional public company suitable for a stock market simulator. Respond ONLY with a valid JSON object with keys: "ticker" (3-4 uppercase letters, not in this list: ${existingTickers.join(', ')}), "name" (company full name), "sector" (one word sector), "price" (a starting price as a positive number), "volatility" (a number between 0.5 and 5.0), and "dividend" (a number >= 0, can be 0). Keep values realistic and concise.`;
    const apiKey = getApiKey();
    const apiUrl = `https://us-central1-aiplatform.googleapis.com/v1/projects/stock-market-game-f0922/locations/us-central1/publishers/google/models/gemini-1.0-pro:generateContent?key=${apiKey}`;
    const temperature = parseFloat(aiSettings.company_temperature ?? 0.8);
    const maxTokens = parseInt(aiSettings.company_max_tokens ?? 200);
    const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: 'application/json', temperature, maxOutputTokens: maxTokens }
        }),
    });
    const result = await response.json();
    if (!result.candidates || result.candidates.length === 0) {
        throw new Error('AI company generation failed: No candidates returned.');
    }
    const text = result.candidates[0].content.parts[0].text.trim();
    try {
        const obj = JSON.parse(text);
        // Basic validation
        if (!obj.ticker || !obj.name || !obj.sector || !obj.price) throw new Error('Missing fields');
        obj.ticker = obj.ticker.toUpperCase().replace(/[^A-Z]/g, '').slice(0,4);
        obj.price = Math.max(0.01, parseFloat(obj.price));
        obj.volatility = Math.max(0.1, parseFloat(obj.volatility) || 1.0);
        obj.dividend = Math.max(0, parseFloat(obj.dividend) || 0);
        return obj;
    } catch (err) {
        logger.error('Failed to parse/validate company JSON from AI:', text);
        throw new Error('AI returned invalid company JSON');
    }
}

async function saveNews(headline, analysis) {
    const newsRef = db.collection("artifacts/stock-market-game-v1/public/market/news");
    await newsRef.add({
        headline: headline,
        ticker: analysis.ticker,
        sentiment: analysis.sentiment,
        impact_percent: analysis.impact_percent,
        timestamp: new Date(),
        is_active: true
    });
}
