const { onSchedule } = require("firebase-functions/v2/scheduler");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { GoogleAuth } = require("google-auth-library");
const { logger } = require("firebase-functions");
const fetch = require("node-fetch");

// Initialize Firebase Admin SDK
initializeApp();
const db = getFirestore();

// --- Main Scheduled Function ---
// This function will run automatically every 15 minutes.
exports.generateNews = onSchedule("every 15 minutes", async (event) => {
    logger.log("AI News Generation starting...");

    try {
        // 1. Get the list of companies from Firestore
        const companies = await getCompanies();
        if (companies.length === 0) {
            logger.warn("No companies found in Firestore. Aborting news generation.");
            return;
        }

        // 2. Generate a news headline using the Gemini API
        const headline = await generateHeadline(companies);
        logger.log("Generated Headline:", headline);

        // 3. Analyze the headline for market impact
        const analysis = await analyzeHeadline(headline, companies);
        logger.log("Headline Analysis:", analysis);

        // 4. Save the news and its impact to Firestore
        await saveNews(headline, analysis);
        logger.log("Successfully saved news to Firestore.");

    } catch (error) {
        logger.error("Error in AI News Generation:", error);
    }
});

// --- Helper Functions ---

/**
 * Fetches the list of companies from the database.
 * @returns {Promise<Array>} A list of company objects.
 */
async function getCompanies() {
    const stocksRef = db.collection("artifacts/stock-market-game-v1/public/market/stocks");
    const snapshot = await stocksRef.get();
    if (snapshot.empty) {
        return [];
    }
    return snapshot.docs.map(doc => ({ ticker: doc.id, ...doc.data() }));
}

/**
 * Generates an access token for authenticating with the Gemini API.
 * @returns {Promise<string>} The access token.
 */
async function getAccessToken() {
    const auth = new GoogleAuth({
        scopes: "https://www.googleapis.com/auth/cloud-platform",
    });
    const client = await auth.getClient();
    const accessToken = await client.getAccessToken();
    return accessToken.token;
}

/**
 * Calls the Gemini API to generate a news headline.
 * @param {Array} companies - The list of companies in the game.
 * @returns {Promise<string>} The generated headline.
 */
async function generateHeadline(companies) {
    const companyList = companies.map(c => `${c.ticker} (${c.sector})`).join(', ');
    const prompt = `You are a financial news generator for a stock market game. The available companies are: ${companyList}. Generate a single, realistic, and concise news headline about one of these companies or a general sector. Do not use quotation marks.`;

    const accessToken = await getAccessToken();
    const apiUrl = `https://us-central1-aiplatform.googleapis.com/v1/projects/stock-market-game-f0922/locations/us-central1/publishers/google/models/gemini-1.0-pro:generateContent`;

    const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: { "temperature": 0.9, "topK": 1, "topP": 1, "maxOutputTokens": 2048 }
        }),
    });

    const result = await response.json();
    return result.candidates[0].content.parts[0].text.trim();
}

/**
 * Calls the Gemini API to analyze the headline for market impact.
 * @param {string} headline - The news headline to analyze.
 * @param {Array} companies - The list of companies.
 * @returns {Promise<Object>} A JSON object with the analysis.
 */
async function analyzeHeadline(headline, companies) {
    const companyList = companies.map(c => c.ticker);
    const prompt = `Analyze the following headline: "${headline}". Respond with only a valid JSON object. The object must contain: "ticker" (the most relevant ticker from this list: ${companyList.join(', ')}), "sentiment" (a score from -1.0 for very negative to 1.0 for very positive), and "impact_percent" (a number representing the likely percentage price change, e.g., -15.5 or 8.0).`;

    const accessToken = await getAccessToken();
    const apiUrl = `https://us-central1-aiplatform.googleapis.com/v1/projects/stock-market-game-f0922/locations/us-central1/publishers/google/models/gemini-1.0-pro:generateContent`;
    
    const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: { "responseMimeType": "application/json" }
        }),
    });

    const result = await response.json();
    return JSON.parse(result.candidates[0].content.parts[0].text);
}

/**
 * Saves the generated news to the 'news' collection in Firestore.
 * @param {string} headline - The news headline.
 * @param {Object} analysis - The analysis object from the AI.
 */
async function saveNews(headline, analysis) {
    const newsRef = db.collection("artifacts/stock-market-game-v1/public/market/news");
    await newsRef.add({
        headline: headline,
        ticker: analysis.ticker,
        sentiment: analysis.sentiment,
        impact_percent: analysis.impact_percent,
        timestamp: new Date(),
        is_active: true // This flag will be used by the game client
    });
}
