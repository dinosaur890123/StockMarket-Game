// Firebase Imports
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js";
import { getFirestore, doc, setDoc, onSnapshot, collection, writeBatch, query, getDocs } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-analytics.js";

// --- Firebase Configuration ---
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
const analytics = getAnalytics(app);
const provider = new GoogleAuthProvider();
const appId = 'stock-market-game-v1';

// --- DOM Element References ---
const mainHeader = document.getElementById('mainHeader');
const authContainer = document.getElementById('authContainer');
const mainSignInButton = document.getElementById('mainSignInButton');
const loginPage = document.getElementById('loginPage');
const dashboardPage = document.getElementById('dashboardPage');
const tradePage = document.getElementById('tradePage');
const marketContainer = document.getElementById('marketContainer');
const messageBox = document.getElementById('messageBox');
const messageText = document.getElementById('messageText');
const closeMessageButton = document.getElementById('closeMessageButton');
// Header Portfolio
const headerCash = document.getElementById('headerCash');
const headerStocks = document.getElementById('headerStocks');
const headerNetWorth = document.getElementById('headerNetWorth');
// Trade Page Elements
const tradeStockName = document.getElementById('tradeStockName');
const tradeStockTicker = document.getElementById('tradeStockTicker');
const tradeCurrentPrice = document.getElementById('tradeCurrentPrice');
const tradeSharesOwned = document.getElementById('tradeSharesOwned');
const backToDashboardBtn = document.getElementById('backToDashboardBtn');
const buyBtn = document.getElementById('buyBtn');
const sellBtn = document.getElementById('sellBtn');
const buyQtyInput = document.getElementById('buyQty');
const sellQtyInput = document.getElementById('sellQty');
const stockChartCanvas = document.getElementById('stockChart');

// --- Game State & Chart ---
let currentUserId = null;
let userPortfolio = null;
let stockData = {};
let stockUnsubscribe = null;
let portfolioUnsubscribe = null;
let activeChart = null;
let currentlyViewedStock = null;

// --- Navigation Logic ---
const showPage = (pageToShow) => {
    loginPage.classList.add('hidden');
    dashboardPage.classList.add('hidden');
    tradePage.classList.add('hidden');
    pageToShow.classList.remove('hidden');
};

const navigateToTradePage = (ticker) => {
    currentlyViewedStock = ticker;
    const stock = stockData[ticker];
    if (!stock) return;

    // Populate trade page
    tradeStockName.textContent = stock.name;
    tradeStockTicker.textContent = `${stock.ticker} - ${stock.sector}`;
    updateTradePageDetails(stock);
    showPage(tradePage);
};

backToDashboardBtn.addEventListener('click', () => {
    showPage(dashboardPage);
    currentlyViewedStock = null;
    if(activeChart) {
        activeChart.destroy();
    }
});

// --- UI & Helper Functions ---
const showMessage = (text, isError = false) => {
    messageText.textContent = text;
    messageBox.classList.remove('hidden');
    messageBox.classList.toggle('bg-red-800', isError);
    messageBox.classList.toggle('bg-green-800', !isError);
    setTimeout(() => messageBox.classList.add('hidden'), 4000);
};

closeMessageButton.addEventListener('click', () => messageBox.classList.add('hidden'));

// --- Authentication ---
onAuthStateChanged(auth, user => {
    if (stockUnsubscribe) stockUnsubscribe();
    if (portfolioUnsubscribe) portfolioUnsubscribe();

    if (user) {
        currentUserId = user.uid;
        mainHeader.classList.remove('hidden');
        authContainer.innerHTML = `<button id="signOutButton" class="bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded-md">Sign Out</button>`;
        document.getElementById('signOutButton').addEventListener('click', () => signOut(auth));
        showPage(dashboardPage);
        loadGameData(user.uid);
    } else {
        currentUserId = null;
        mainHeader.classList.add('hidden');
        // FIX: The auth container in the header should be empty when logged out.
        // The main sign-in button on the login page is the only one needed.
        authContainer.innerHTML = '';
        showPage(loginPage);
    }
});

const handleSignIn = async () => {
    try {
        await signInWithPopup(auth, provider);
    } catch (error) {
        console.error("Sign in error:", error);
        showMessage("Sign in failed. Please try again.", true);
    }
};
// This listener for the main button on the welcome screen is now the primary sign-in trigger.
mainSignInButton.addEventListener('click', handleSignIn);


// --- Charting ---
const drawStockChart = (stock) => {
    if (activeChart) {
        activeChart.destroy();
    }
    const labels = stock.history.map((_, index) => index + 1);
    const data = {
        labels: labels,
        datasets: [{
            label: `${stock.ticker} Price History`,
            backgroundColor: 'rgba(59, 130, 246, 0.2)',
            borderColor: 'rgba(59, 130, 246, 1)',
            data: stock.history,
            fill: true,
            tension: 0.4,
        }]
    };
    const config = {
        type: 'line',
        data: data,
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: false,
                    ticks: { color: '#9ca3af' },
                    grid: { color: 'rgba(255, 255, 255, 0.1)' }
                },
                x: {
                    ticks: { color: '#9ca3af' },
                    grid: { color: 'rgba(255, 255, 255, 0.1)' }
                }
            },
            plugins: {
                legend: { display: false }
            }
        }
    };
    activeChart = new Chart(stockChartCanvas, config);
};


// --- Core Game Logic ---
const initializeMarketInFirestore = async () => {
    const initialCompanies = [
        { ticker: 'INNV', name: 'Innovate Corp', sector: 'Tech', basePrice: 150.00, volatility: 1.5 },
        { ticker: 'HLTH', name: 'Healthwell Inc.', sector: 'Healthcare', basePrice: 220.00, volatility: 0.8 },
        { ticker: 'ENRG', name: 'Synergy Power', sector: 'Energy', basePrice: 85.50, volatility: 1.3 },
        { ticker: 'CONS', name: 'Staple Goods Co.', sector: 'Consumer', basePrice: 120.75, volatility: 0.7 },
        { ticker: 'FINX', name: 'Finix Capital', sector: 'Finance', basePrice: 310.25, volatility: 1.0 },
    ];
    const stocksCollectionRef = collection(db, `artifacts/${appId}/public/data/stocks`);
    const q = query(stocksCollectionRef);
    const querySnapshot = await getDocs(q);
    if (querySnapshot.empty) {
        const batch = writeBatch(db);
        initialCompanies.forEach(c => {
            const stockRef = doc(db, `artifacts/${appId}/public/data/stocks`, c.ticker);
            batch.set(stockRef, { ...c, history: c.history || [c.basePrice] });
        });
        await batch.commit();
    }
};

const loadGameData = async (userId) => {
    await initializeMarketInFirestore();
    subscribeToStockUpdates();
    loadOrCreatePortfolio(userId);
};

const subscribeToStockUpdates = () => {
    const stocksCollectionRef = collection(db, `artifacts/${appId}/public/data/stocks`);
    stockUnsubscribe = onSnapshot(stocksCollectionRef, (snapshot) => {
        snapshot.docs.forEach(doc => {
            stockData[doc.id] = { id: doc.id, ...doc.data() };
        });
        renderMarket();
        updatePortfolioValue();
        if (currentlyViewedStock && stockData[currentlyViewedStock]) {
            updateTradePageDetails(stockData[currentlyViewedStock]);
        }
    });
};

const loadOrCreatePortfolio = (userId) => {
    const portfolioRef = doc(db, `artifacts/${appId}/users/${userId}/portfolio`, 'main');
    portfolioUnsubscribe = onSnapshot(portfolioRef, (docSnap) => {
        if (docSnap.exists()) {
            userPortfolio = docSnap.data();
        } else {
            const newPortfolio = { cash: 20000, stocks: {} };
            setDoc(portfolioRef, newPortfolio);
            userPortfolio = newPortfolio;
        }
        updatePortfolioValue();
    });
};

const executeTransaction = async (ticker, quantity, type) => {
    if (!userPortfolio || !stockData[ticker] || !quantity || quantity <= 0) {
        showMessage("Invalid transaction details.", true);
        return;
    }
    const price = stockData[ticker].price;
    const cost = price * quantity;
    const newPortfolio = JSON.parse(JSON.stringify(userPortfolio));
    if (type === 'BUY') {
        if (newPortfolio.cash < cost) return showMessage("Not enough cash.", true);
        newPortfolio.cash -= cost;
        newPortfolio.stocks[ticker] = (newPortfolio.stocks[ticker] || 0) + quantity;
    } else {
        if (!newPortfolio.stocks[ticker] || newPortfolio.stocks[ticker] < quantity) return showMessage("Not enough shares to sell.", true);
        newPortfolio.cash += cost;
        newPortfolio.stocks[ticker] -= quantity;
        if (newPortfolio.stocks[ticker] === 0) delete newPortfolio.stocks[ticker];
    }
    const stock = stockData[ticker];
    const volatility = stock.volatility || 1.0;
    const priceImpactFactor = 0.005;
    const adjustedImpact = priceImpactFactor * volatility;
    const priceChangePercentage = type === 'BUY' ? (1 + adjustedImpact * (quantity / 100)) : (1 - adjustedImpact * (quantity / 100));
    const newPrice = Math.max(0.01, price * priceChangePercentage);
    const batch = writeBatch(db);
    const portfolioRef = doc(db, `artifacts/${appId}/users/${currentUserId}/portfolio`, 'main');
    batch.set(portfolioRef, newPortfolio);
    const stockRef = doc(db, `artifacts/${appId}/public/data/stocks`, ticker);
    const newHistory = [...stock.history.slice(-49), newPrice]; // Keep last 50 data points
    batch.update(stockRef, { price: newPrice, history: newHistory });
    await batch.commit();
    showMessage(`${type} order for ${quantity} ${ticker} shares executed!`, false);
    buyQtyInput.value = '';
    sellQtyInput.value = '';
};

buyBtn.addEventListener('click', () => executeTransaction(currentlyViewedStock, parseInt(buyQtyInput.value), 'BUY'));
sellBtn.addEventListener('click', () => executeTransaction(currentlyViewedStock, parseInt(sellQtyInput.value), 'SELL'));

// --- Rendering ---
const renderMarket = () => {
    marketContainer.innerHTML = '';
    const sortedTickers = Object.keys(stockData).sort();
    sortedTickers.forEach(ticker => {
        const stock = stockData[ticker];
        const card = document.createElement('div');
        card.className = 'bg-gray-800 p-4 rounded-lg shadow-lg cursor-pointer transition transform hover:-translate-y-1 hover:shadow-blue-500/20';
        card.innerHTML = `
            <div class="flex justify-between items-baseline">
                <h3 class="text-lg font-bold text-white">${stock.name}</h3>
                <span class="text-xs font-mono bg-gray-700 px-2 py-1 rounded">${ticker}</span>
            </div>
            <p class="text-sm text-gray-400 mb-2">${stock.sector}</p>
            <p class="text-2xl font-light text-white">$${stock.price.toFixed(2)}</p>
        `;
        card.addEventListener('click', () => navigateToTradePage(ticker));
        marketContainer.appendChild(card);
    });
};

const updatePortfolioValue = () => {
    if (!userPortfolio || Object.keys(stockData).length === 0) return;
    let stockValue = 0;
    for (const ticker in userPortfolio.stocks) {
        if (stockData[ticker]) {
            stockValue += userPortfolio.stocks[ticker] * stockData[ticker].price;
        }
    }
    const netWorth = userPortfolio.cash + stockValue;
    headerCash.textContent = `$${userPortfolio.cash.toFixed(2)}`;
    headerStocks.textContent = `$${stockValue.toFixed(2)}`;
    headerNetWorth.textContent = `$${netWorth.toFixed(2)}`;
    if (currentlyViewedStock) {
        updateTradePageDetails(stockData[currentlyViewedStock]);
    }
};

const updateTradePageDetails = (stock) => {
    if (!stock || !userPortfolio) return;
    tradeCurrentPrice.textContent = `$${stock.price.toFixed(2)}`;
    const sharesOwned = userPortfolio.stocks[stock.id] || 0;
    tradeSharesOwned.textContent = `${sharesOwned} Shares`;
    drawStockChart(stock);
};
