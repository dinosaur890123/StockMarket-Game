const { onSchedule } = require("firebase-functions/v2/scheduler");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { getAuth } = require("firebase-admin/auth");
const { GoogleAuth } = require("google-auth-library");
const { logger } = require("firebase-functions");
const fetch = require("node-fetch");

// Initialize Firebase Admin SDK
initializeApp();
const db = getFirestore();
const auth = getAuth();

// Update function
exports.gameUpdateTicker = onSchedule("every 5 minutes", async (event) => {
    logger.log("Game Update Ticker starting...");

    try {
        logger.log("Updating leaderboard...");
        const stocks = await getStocks();
        if (stocks.length > 0) {
            await updateLeaderboard(stocks);
            logger.log("Leaderboard updated successfully.");
        } else {
            logger.warn("No stocks found, skipping leaderboard update.");
        }
        const minute = new Date(event.scheduleTime).getMinutes();
        if (minute % 15 === 0) {
            logger.log("Generating AI news...");
            const companies = stocks.map(s => ({ ticker: s.id, ...s.data }));
            if (companies.length > 0) {
                const headline = await generateHeadline(companies);
                logger.log("Generated Headline:", headline);
                const analysis = await analyzeHeadline(headline, companies);
                logger.log("Headline Analysis:", analysis);
                await saveNews(headline, analysis);
                logger.log("Successfully saved news to Firestore.");
            } else {
                logger.warn("No companies found, skipping AI news generation.");
            }
        }

    } catch (error) {
        logger.error("Error in Game Update Ticker:", error);
    }
});

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
    const topPlayers = players.slice(0, 20); // Get top 20

    const marketDocRef = db.doc("artifacts/stock-market-game-v1/public/market");
    await marketDocRef.set({ leaderboard: topPlayers, leaderboardLastUpdated: new Date() }, { merge: true });
}

async function getStocks() {
    const stocksRef = db.collection("artifacts/stock-market-game-v1/public/market/stocks");
    const snapshot = await stocksRef.get();
    return snapshot.docs.map(doc => ({ id: doc.id, data: doc.data() }));
}


async function getAccessToken() {
    const auth = new GoogleAuth({ scopes: "https://www.googleapis.com/auth/cloud-platform" });
    const client = await auth.getClient();
    return (await client.getAccessToken()).token;
}

async function generateHeadline(companies) {
    const companyList = companies.map(c => `${c.ticker} (${c.sector})`).join(', ');
    const prompt = `You are a financial news generator for a stock market game. The available companies are: ${companyList}. Generate a single, realistic, and concise news headline about one of these companies or a general sector. Do not use quotation marks.`;
    const accessToken = await getAccessToken();
    const apiUrl = `https://us-central1-aiplatform.googleapis.com/v1/projects/stock-market-game-f0922/locations/us-central1/publishers/google/models/gemini-1.0-pro:generateContent`;
    const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: { "temperature": 0.9, "topK": 1, "topP": 1, "maxOutputTokens": 2048 }
        }),
    });
    const result = await response.json();
    return result.candidates[0].content.parts[0].text.trim();
}

async function analyzeHeadline(headline, companies) {
    const companyList = companies.map(c => c.ticker);
    const prompt = `Analyze the following headline: "${headline}". Respond with only a valid JSON object. The object must contain: "ticker" (the most relevant ticker from this list: ${companyList.join(', ')}), "sentiment" (a score from -1.0 for very negative to 1.0 for very positive), and "impact_percent" (a number representing the likely percentage price change, e.g., -15.5 or 8.0).`;
    const accessToken = await getAccessToken();
    const apiUrl = `https://us-central1-aiplatform.googleapis.com/v1/projects/stock-market-game-f0922/locations/us-central1/publishers/google/models/gemini-1.0-pro:generateContent`;
    const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: { "responseMimeType": "application/json" }
        }),
    });
    const result = await response.json();
    return JSON.parse(result.candidates[0].content.parts[0].text);
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
