// Firebase Imports (ensure you have an internet connection)
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js";
import { getFirestore, doc, setDoc, onSnapshot, collection, writeBatch, query, getDocs } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-analytics.js";

// --- Your web app's Firebase configuration ---
const firebaseConfig = {
    apiKey: "AIzaSyDx1XsUhmqchGCHEiB0dcF8cV6JDCp39D0",
    authDomain: "stock-market-game-f0922.firebaseapp.com",
    projectId: "stock-market-game-f0922",
    storageBucket: "stock-market-game-f0922.appspot.com",
    messagingSenderId: "860554882495",
    appId: "1:860554882495:web:c20583fed1530008b5850a",
    measurementId: "G-3V60XQ69VD"
};

// --- App Initialization ---
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const analytics = getAnalytics(app); // Initialize Analytics
const provider = new GoogleAuthProvider();

// Unique App ID for Firestore paths to keep data organized
const appId = 'stock-market-game-v1';

// --- DOM Element References ---
const authContainer = document.getElementById('authContainer');
const signInButton = document.getElementById('signInButton');
const signOutButton = document.getElementById('signOutButton');
const userInfo = document.getElementById('userInfo');
const gameContent = document.getElementById('gameContent');
const portfolioCash = document.getElementById('portfolioCash');
const portfolioValue = document.getElementById('portfolioValue');
const netWorth = document.getElementById('netWorth');
const marketContainer = document.getElementById('marketContainer');
const marketLoading = document.getElementById('marketLoading');
const newsTicker = document.getElementById('newsTicker');
const messageBox = document.getElementById('messageBox');
const messageText = document.getElementById('messageText');
const closeMessageButton = document.getElementById('closeMessageButton');

// --- Game State Variables ---
let currentUserId = null;
let userPortfolio = null;
let stockData = {};
let stockUnsubscribe = null; // To stop listening for stock updates on sign-out
let portfolioUnsubscribe = null; // To stop listening for portfolio updates on sign-out

// --- Synthetic News Events ---
const newsEvents = [
    { text: "Innovate Corp (INNV) announces breakthrough in AI research, boosting investor confidence.", target: 'INNV', multiplier: 1.15, sectorTarget: null },
    { text: "Healthwell Inc. (HLTH) faces regulatory scrutiny over new drug trials.", target: 'HLTH', multiplier: 0.88, sectorTarget: null },
    { text: "Global oil surplus causes prices to drop, affecting the entire Energy sector.", target: null, multiplier: 0.92, sectorTarget: 'Energy' },
    { text: "Positive economic report shows strong consumer spending.", target: null, multiplier: 1.08, sectorTarget: 'Consumer' },
    { text: "Finix Capital (FINX) reports record quarterly profits.", target: 'FINX', multiplier: 1.12, sectorTarget: null },
    { text: "Tech sector bubble? Analysts warn of overvaluation.", target: null, multiplier: 0.95, sectorTarget: 'Tech' },
    { text: "A new clean energy bill passes, boosting Synergy Power (ENRG) prospects.", target: 'ENRG', multiplier: 1.20, sectorTarget: null },
];

// --- UI Helper Functions ---
const showMessage = (text, isError = false) => {
    messageText.textContent = text;
    messageBox.classList.remove('hidden');
    messageBox.classList.toggle('bg-red-500', isError);
    messageBox.classList.toggle('bg-green-500', !isError);
    // Hide the message after 5 seconds
    setTimeout(() => messageBox.classList.add('hidden'), 5000);
};

closeMessageButton.addEventListener('click', () => messageBox.classList.add('hidden'));

const updateUIForAuthState = (user) => {
    if (user) {
        signInButton.classList.add('hidden');
        signOutButton.classList.remove('hidden');
        userInfo.innerHTML = `
            <p class="text-sm font-medium">${user.displayName}</p>
            <p class="text-xs text-gray-400">${user.email}</p>
        `;
        gameContent.classList.remove('hidden');
    } else {
        signInButton.classList.remove('hidden');
        signOutButton.classList.add('hidden');
        userInfo.innerHTML = '';
        gameContent.classList.add('hidden');
        marketLoading.textContent = 'Please sign in to view the market.';
    }
};

// --- Authentication Logic ---
signInButton.addEventListener('click', async () => {
    try {
        await signInWithPopup(auth, provider);
    } catch (error) {
        console.error("Sign in error", error);
        showMessage(`Sign in failed: ${error.message}`, true);
    }
});

signOutButton.addEventListener('click', async () => {
    await signOut(auth);
});

onAuthStateChanged(auth, user => {
    // Clean up old data listeners to prevent memory leaks
    if (stockUnsubscribe) stockUnsubscribe();
    if (portfolioUnsubscribe) portfolioUnsubscribe();

    if (user) {
        currentUserId = user.uid;
        updateUIForAuthState(user);
        loadGameData(currentUserId);
    } else {
        currentUserId = null;
        updateUIForAuthState(null);
        marketContainer.innerHTML = ''; // Clear the market view
    }
});

// --- Firestore and Game Logic ---

// This function runs once to populate Firestore with the initial companies.
// It will not overwrite existing data.
const initializeMarketInFirestore = async () => {
    console.log("Checking if market needs initialization in Firestore...");
    const initialCompanies = [
        { ticker: 'INNV', name: 'Innovate Corp', sector: 'Tech', basePrice: 150.00 },
        { ticker: 'HLTH', name: 'Healthwell Inc.', sector: 'Healthcare', basePrice: 220.00 },
        { ticker: 'ENRG', name: 'Synergy Power', sector: 'Energy', basePrice: 85.50 },
        { ticker: 'CONS', name: 'Staple Goods Co.', sector: 'Consumer', basePrice: 120.75 },
        { ticker: 'FINX', name: 'Finix Capital', sector: 'Finance', basePrice: 310.25 },
    ];

    const stocksCollectionRef = collection(db, `artifacts/${appId}/public/data/stocks`);
    const q = query(stocksCollectionRef);
    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) {
        console.log("Market is empty. Initializing stocks in Firestore...");
        const batch = writeBatch(db);
        initialCompanies.forEach(company => {
            const stockRef = doc(db, `artifacts/${appId}/public/data/stocks`, company.ticker);
            batch.set(stockRef, {
                name: company.name,
                sector: company.sector,
                price: company.basePrice,
                history: [company.basePrice] // Store price history for potential charting
            });
        });
        await batch.commit();
        console.log("Market initialized successfully in Firestore.");
    } else {
        console.log("Market already exists in Firestore.");
    }
};

// Main function to load all game data for a logged-in user
const loadGameData = async (userId) => {
    marketLoading.textContent = 'Loading market data...';
    await initializeMarketInFirestore(); // Ensure companies exist before loading them
    subscribeToStockUpdates();
    loadOrCreatePortfolio(userId);
};

// Subscribes to real-time updates for all stocks from Firestore
const subscribeToStockUpdates = () => {
    const stocksCollectionRef = collection(db, `artifacts/${appId}/public/data/stocks`);
    stockUnsubscribe = onSnapshot(stocksCollectionRef, (snapshot) => {
        let newStockData = {};
        snapshot.docs.forEach(doc => {
            newStockData[doc.id] = { id: doc.id, ...doc.data() };
        });
        const oldStockData = { ...stockData };
        stockData = newStockData;
        renderMarket(oldStockData);
        updatePortfolioValue();
    }, (error) => {
        console.error("Error listening to stock updates:", error);
        showMessage("Could not connect to the market.", true);
    });
};

// Loads a user's portfolio or creates a new one if it's their first time
const loadOrCreatePortfolio = (userId) => {
    const portfolioRef = doc(db, `artifacts/${appId}/users/${userId}/portfolio`, 'main');
    
    portfolioUnsubscribe = onSnapshot(portfolioRef, (docSnap) => {
        if (docSnap.exists()) {
            userPortfolio = docSnap.data();
        } else {
            console.log("No portfolio found, creating a new one.");
            const newPortfolio = {
                cash: 20000, // Starting cash is $20,000
                stocks: {} // Starts with no stocks
            };
            setDoc(portfolioRef, newPortfolio); // This will trigger the onSnapshot again
            userPortfolio = newPortfolio;
        }
        renderPortfolio();
        updatePortfolioValue();
    }, (error) => {
        console.error("Error loading portfolio:", error);
        showMessage("Could not load your portfolio.", true);
    });
};

// --- Game Actions (Buy/Sell) ---
const executeTransaction = async (ticker, quantity, type) => {
    if (!userPortfolio || !stockData[ticker]) {
        showMessage("Game data not loaded yet. Please wait.", true);
        return;
    }

    const price = stockData[ticker].price;
    const cost = price * quantity;
    const newPortfolio = JSON.parse(JSON.stringify(userPortfolio)); // Create a safe copy

    if (type === 'BUY') {
        if (newPortfolio.cash < cost) {
            showMessage("Not enough cash for this purchase.", true);
            return;
        }
        newPortfolio.cash -= cost;
        newPortfolio.stocks[ticker] = (newPortfolio.stocks[ticker] || 0) + quantity;
    } else { // SELL
        if (!newPortfolio.stocks[ticker] || newPortfolio.stocks[ticker] < quantity) {
            showMessage("You don't own enough shares to sell.", true);
            return;
        }
        newPortfolio.cash += cost;
        newPortfolio.stocks[ticker] -= quantity;
        if (newPortfolio.stocks[ticker] === 0) {
            delete newPortfolio.stocks[ticker];
        }
    }
    
    // Simulate market impact: Large trades affect the stock price
    const priceImpactFactor = 0.005; // 0.5% price change per 100 shares traded
    const priceChangePercentage = type === 'BUY' ? (1 + priceImpactFactor * (quantity / 100)) : (1 - priceImpactFactor * (quantity / 100));
    const newPrice = Math.max(0.01, price * priceChangePercentage); // Price cannot fall below $0.01

    try {
        const batch = writeBatch(db);
        const portfolioRef = doc(db, `artifacts/${appId}/users/${currentUserId}/portfolio`, 'main');
        batch.set(portfolioRef, newPortfolio);

        const stockRef = doc(db, `artifacts/${appId}/public/data/stocks`, ticker);
        const newHistory = [...stockData[ticker].history.slice(-29), newPrice]; // Keep last 30 prices
        batch.update(stockRef, { price: newPrice, history: newHistory });

        await batch.commit();
        showMessage(`${type} order for ${quantity} ${ticker} shares executed!`, false);
    } catch (error) {
        console.error("Transaction failed: ", error);
        showMessage(`Transaction failed: ${error.message}`, true);
    }
};

// --- Rendering Functions ---
const renderMarket = (oldData = {}) => {
    marketContainer.innerHTML = ''; // Clear previous state
    const sortedTickers = Object.keys(stockData).sort();

    if (sortedTickers.length === 0) {
        marketLoading.textContent = 'No stocks available in the market.';
        marketContainer.appendChild(marketLoading);
        return;
    }

    for (const ticker of sortedTickers) {
        const stock = stockData[ticker];
        const oldPrice = oldData[ticker]?.price || stock.price;
        const priceChange = stock.price - oldPrice;
        const priceChangePercent = oldPrice > 0 ? (priceChange / oldPrice) * 100 : 0;
        
        const changeColor = priceChange >= 0 ? 'text-green-400' : 'text-red-400';
        const changeSymbol = priceChange >= 0 ? '▲' : '▼';

        const stockCard = document.createElement('div');
        stockCard.className = 'bg-gray-800 p-4 rounded-lg shadow-lg flex flex-col justify-between';
        stockCard.innerHTML = `
            <div>
                <div class="flex justify-between items-baseline">
                    <h3 class="text-xl font-bold text-white">${stock.name} (${ticker})</h3>
                    <span class="text-xs text-gray-400 font-mono">${stock.sector}</span>
                </div>
                <div class="flex justify-between items-center mt-2">
                    <p class="text-3xl font-light text-white">$${stock.price.toFixed(2)}</p>
                    <div class="text-right ${changeColor}">
                        <p class="font-semibold">${changeSymbol} ${Math.abs(priceChange).toFixed(2)}</p>
                        <p class="text-sm">(${priceChangePercent.toFixed(2)}%)</p>
                    </div>
                </div>
            </div>
            <div class="mt-4 flex items-center space-x-2">
                <input type="number" min="1" placeholder="Qty" class="w-1/3 bg-gray-700 border border-gray-600 rounded-md p-2 text-white focus:ring-2 focus:ring-blue-500 focus:outline-none">
                <button data-ticker="${ticker}" data-action="BUY" class="flex-1 bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-md transition duration-200">Buy</button>
                <button data-ticker="${ticker}" data-action="SELL" class="flex-1 bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-md transition duration-200">Sell</button>
            </div>
        `;
        marketContainer.appendChild(stockCard);
    }
};

const renderPortfolio = () => {
    if (!userPortfolio) return;
    portfolioCash.textContent = `$${userPortfolio.cash.toFixed(2)}`;
    updatePortfolioValue();
};

const updatePortfolioValue = () => {
    if (!userPortfolio || Object.keys(stockData).length === 0) return;

    let currentStockValue = 0;
    for (const ticker in userPortfolio.stocks) {
        if (stockData[ticker]) {
            currentStockValue += userPortfolio.stocks[ticker] * stockData[ticker].price;
        }
    }

    portfolioValue.textContent = `$${currentStockValue.toFixed(2)}`;
    netWorth.textContent = `$${(userPortfolio.cash + currentStockValue).toFixed(2)}`;
};

// Event delegation for buy/sell buttons for better performance
marketContainer.addEventListener('click', (e) => {
    if (e.target.tagName === 'BUTTON' && e.target.dataset.action) {
        const action = e.target.dataset.action;
        const ticker = e.target.dataset.ticker;
        const input = e.target.parentElement.querySelector('input[type="number"]');
        const quantity = parseInt(input.value, 10);

        if (!quantity || quantity <= 0) {
            showMessage("Please enter a valid quantity.", true);
            return;
        }
        
        executeTransaction(ticker, quantity, action);
        input.value = '';
    }
});

// --- News Simulation ---
const triggerNewsEvent = async () => {
    if (Object.keys(stockData).length === 0) return; // Don't run if no stocks are loaded

    const event = newsEvents[Math.floor(Math.random() * newsEvents.length)];
    newsTicker.textContent = `LATEST: ${event.text}`;
    
    const batch = writeBatch(db);
    const stocksToUpdate = [];

    if (event.target && stockData[event.target]) {
        stocksToUpdate.push(stockData[event.target]);
    } else if (event.sectorTarget) {
        for (const ticker in stockData) {
            if (stockData[ticker].sector === event.sectorTarget) {
                stocksToUpdate.push(stockData[ticker]);
            }
        }
    }

    if (stocksToUpdate.length > 0) {
        stocksToUpdate.forEach(stock => {
            const stockRef = doc(db, `artifacts/${appId}/public/data/stocks`, stock.id);
            const newPrice = Math.max(0.01, stock.price * event.multiplier);
            const newHistory = [...stock.history.slice(-29), newPrice];
            batch.update(stockRef, { price: newPrice, history: newHistory });
        });

        try {
            await batch.commit();
            console.log(`News event applied to ${stocksToUpdate.length} stock(s).`);
        } catch (error) {
            console.error("Failed to apply news event:", error);
        }
    }
};

// --- Initial Load ---
window.onload = () => {
    // Start the news cycle. It will only affect stocks once they are loaded.
    setInterval(triggerNewsEvent, 30000); // New news every 30 seconds
};
