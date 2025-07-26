// Firebase Imports
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js";
import { getFirestore, doc, setDoc, onSnapshot, collection, writeBatch, query, getDocs, addDoc, serverTimestamp, where, updateDoc } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";

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
const provider = new GoogleAuthProvider();
const appId = 'stock-market-game-v1';

// --- DOM Element References ---
const sidebar = document.getElementById('sidebar');
const appContainer = document.getElementById('appContainer');
const authContainer = document.getElementById('authContainer');
const mainSignInButton = document.getElementById('mainSignInButton');
const mainContent = document.getElementById('mainContent');
const pageTitle = document.getElementById('pageTitle');
const loginPage = document.getElementById('loginPage');
const dashboardPage = document.getElementById('dashboardPage');
const tradePage = document.getElementById('tradePage');
const ordersPage = document.getElementById('ordersPage');
const stockDetailPage = document.getElementById('stockDetailPage');
const navLinks = {
    dashboard: document.getElementById('navDashboard'),
    trade: document.getElementById('navTrade'),
    orders: document.getElementById('navOrders'),
};
const headerCash = document.getElementById('headerCash');
const headerStocks = document.getElementById('headerStocks');
const headerNetWorth = document.getElementById('headerNetWorth');

// --- Game State ---
let currentUserId = null;
let userPortfolio = null;
let stockData = {};
let pendingOrders = [];
let stockUnsubscribe = null;
let portfolioUnsubscribe = null;
let ordersUnsubscribe = null;
let activeChart = null;

// --- Navigation ---
const showPage = (pageId) => {
    [dashboardPage, tradePage, ordersPage, stockDetailPage].forEach(p => p.classList.add('hidden'));
    const pageElement = document.getElementById(pageId);
    if (pageElement) pageElement.classList.remove('hidden');

    Object.values(navLinks).forEach(link => link.classList.remove('active'));
    if (pageId.startsWith('dashboard')) navLinks.dashboard.classList.add('active');
    if (pageId.startsWith('trade') || pageId.startsWith('stockDetail')) navLinks.trade.classList.add('active');
    if (pageId.startsWith('orders')) navLinks.orders.classList.add('active');

    if (pageId === 'dashboardPage') pageTitle.textContent = 'Dashboard';
    if (pageId === 'tradePage') pageTitle.textContent = 'Trade';
    if (pageId === 'ordersPage') pageTitle.textContent = 'My Orders';
};

Object.keys(navLinks).forEach(key => {
    navLinks[key].addEventListener('click', (e) => {
        e.preventDefault();
        showPage(`${key}Page`);
    });
});

// --- Authentication ---
onAuthStateChanged(auth, user => {
    [stockUnsubscribe, portfolioUnsubscribe, ordersUnsubscribe].forEach(unsub => { if (unsub) unsub(); });

    if (user) {
        currentUserId = user.uid;
        sidebar.classList.remove('hidden');
        mainContent.classList.remove('hidden');
        loginPage.classList.add('hidden');
        appContainer.style.marginLeft = '16rem';
        authContainer.innerHTML = `<button id="signOutButton" class="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-md">Sign Out</button>`;
        document.getElementById('signOutButton').addEventListener('click', () => signOut(auth));
        showPage('tradePage');
        loadGameData(user.uid);
    } else {
        currentUserId = null;
        sidebar.classList.add('hidden');
        mainContent.classList.add('hidden');
        loginPage.classList.remove('hidden');
        appContainer.style.marginLeft = '0';
    }
});
mainSignInButton.addEventListener('click', () => signInWithPopup(auth, provider));

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
            batch.set({ ...c, history: [c.basePrice] });
        });
        await batch.commit();
    }
};

const loadGameData = async (userId) => {
    await initializeMarketInFirestore();
    subscribeToStocks();
    subscribeToPortfolio(userId);
    subscribeToOrders(userId);
};

const subscribeToStocks = () => {
    const stocksRef = collection(db, `artifacts/${appId}/public/data/stocks`);
    stockUnsubscribe = onSnapshot(stocksRef, snapshot => {
        snapshot.docChanges().forEach(change => {
            const stock = { id: change.doc.id, ...change.doc.data() };
            stockData[stock.id] = stock;
            if (change.type === "modified") checkPendingOrders(stock);
        });
        renderTradePage();
        renderDashboardPage();
        updatePortfolioValue();
    }, console.error);
};

const subscribeToPortfolio = (userId) => {
    const portfolioRef = doc(db, `artifacts/${appId}/users/${userId}/portfolio`, 'main');
    portfolioUnsubscribe = onSnapshot(portfolioRef, docSnap => {
        if (!docSnap.exists()) {
            setDoc(portfolioRef, { cash: 20000, stocks: {} });
        } else {
            userPortfolio = docSnap.data();
            renderDashboardPage();
            updatePortfolioValue();
        }
    });
};

const subscribeToOrders = (userId) => {
    const ordersRef = collection(db, `artifacts/${appId}/users/${userId}/orders`);
    const q = query(ordersRef, where("status", "==", "pending"));
    ordersUnsubscribe = onSnapshot(q, snapshot => {
        pendingOrders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderOrdersPage();
    });
};

const checkPendingOrders = (stock) => {
    if (!userPortfolio) return;
    pendingOrders.forEach(order => {
        if (order.ticker !== stock.id) return;
        let shouldExecute = false;
        if (order.type === 'limit-buy' && stock.price <= order.limitPrice) shouldExecute = true;
        if (order.type === 'limit-sell' && stock.price >= order.limitPrice) shouldExecute = true;
        if (order.type === 'stop-loss' && stock.price <= order.limitPrice) shouldExecute = true;
        if (shouldExecute) executeSpecialOrder(order);
    });
};

const executeSpecialOrder = async (order) => {
    const orderRef = doc(db, `artifacts/${appId}/users/${currentUserId}/orders`, order.id);
    const portfolioRef = doc(db, `artifacts/${appId}/users/${currentUserId}/portfolio`, 'main');
    const stock = stockData[order.ticker];
    if (!stock) return;
    const cost = stock.price * order.quantity;
    const newPortfolio = JSON.parse(JSON.stringify(userPortfolio));
    if (order.type === 'limit-buy' && newPortfolio.cash < cost) return updateDoc(orderRef, { status: 'failed', reason: 'Insufficient funds' });
    if ((order.type === 'limit-sell' || order.type === 'stop-loss') && (newPortfolio.stocks[order.ticker] || 0) < order.quantity) return updateDoc(orderRef, { status: 'failed', reason: 'Insufficient shares' });
    if (order.type === 'limit-buy') {
        newPortfolio.cash -= cost;
        newPortfolio.stocks[order.ticker] = (newPortfolio.stocks[order.ticker] || 0) + order.quantity;
    } else {
        newPortfolio.cash += cost;
        newPortfolio.stocks[order.ticker] -= order.quantity;
    }
    const batch = writeBatch(db);
    batch.set(portfolioRef, newPortfolio);
    batch.update(orderRef, { status: 'filled', filledPrice: stock.price });
    await batch.commit();
};

const updatePortfolioValue = () => {
    if (!userPortfolio) return;
    let stockValue = Object.keys(userPortfolio.stocks).reduce((acc, ticker) => {
        return acc + ((userPortfolio.stocks[ticker] || 0) * (stockData[ticker]?.price || 0));
    }, 0);
    headerCash.textContent = `$${userPortfolio.cash.toFixed(2)}`;
    headerStocks.textContent = `$${stockValue.toFixed(2)}`;
    headerNetWorth.textContent = `$${(userPortfolio.cash + stockValue).toFixed(2)}`;
};

const renderTradePage = () => {
    tradePage.innerHTML = `<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5"></div>`;
    const container = tradePage.querySelector('div');
    if (!container) return;
    const sortedStocks = Object.values(stockData).filter(s => s && s.ticker).sort((a, b) => a.ticker.localeCompare(b.ticker));
    sortedStocks.forEach(stock => {
        const card = document.createElement('div');
        card.className = 'bg-gray-800 p-4 rounded-lg shadow-lg cursor-pointer transition transform hover:-translate-y-1 hover:shadow-blue-500/20';
        card.innerHTML = `<div class="flex justify-between items-baseline"><h3 class="text-lg font-bold text-white">${stock.name}</h3><span class="text-xs font-mono bg-gray-700 px-2 py-1 rounded">${stock.ticker}</span></div><p class="text-sm text-gray-400 mb-2">${stock.sector}</p><p class="text-2xl font-light text-white">$${stock.price.toFixed(2)}</p>`;
        card.addEventListener('click', () => renderStockDetailPage(stock.id));
        container.appendChild(card);
    });
};

const renderDashboardPage = () => {
    if (!userPortfolio || !stockData) {
        dashboardPage.innerHTML = `<div class="bg-gray-800 p-6 rounded-lg"><p class="text-gray-400">Loading dashboard data...</p></div>`;
        return;
    }

    const holdings = Object.keys(userPortfolio.stocks);
    let holdingsHTML = '';
    let totalHoldingsValue = 0;

    const validHoldings = holdings.filter(ticker => userPortfolio.stocks[ticker] > 0 && stockData[ticker]);

    if (validHoldings.length === 0) {
        holdingsHTML = `
            <div class="text-center py-8">
                <p class="text-gray-400">You do not own any stocks yet.</p>
                <button id="dashboardGoToTrade" class="mt-4 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-md">View Market</button>
            </div>
        `;
    } else {
        validHoldings.forEach(ticker => {
            const stock = stockData[ticker];
            const quantity = userPortfolio.stocks[ticker];
            const currentValue = stock.price * quantity;
            totalHoldingsValue += currentValue;
            holdingsHTML += `
                <div class="bg-gray-700 p-4 rounded-lg flex justify-between items-center cursor-pointer hover:bg-gray-600" data-ticker="${ticker}">
                    <div>
                        <p class="font-bold text-white">${stock.name} (${ticker})</p>
                        <p class="text-sm text-gray-400">${quantity} shares</p>
                    </div>
                    <div class="text-right">
                        <p class="font-semibold text-white">$${currentValue.toFixed(2)}</p>
                    </div>
                </div>
            `;
        });
    }

    dashboardPage.innerHTML = `
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div class="bg-gray-800 p-6 rounded-lg">
                <h3 class="text-xl font-bold text-white mb-4">Portfolio Summary</h3>
                <div class="space-y-3">
                    <div class="flex justify-between"><span class="text-gray-400">Cash Balance</span><span class="font-semibold text-green-400">$${userPortfolio.cash.toFixed(2)}</span></div>
                    <div class="flex justify-between"><span class="text-gray-400">Stock Holdings Value</span><span class="font-semibold text-blue-400">$${totalHoldingsValue.toFixed(2)}</span></div>
                    <div class="border-t border-gray-700 my-2"></div>
                    <div class="flex justify-between"><span class="text-gray-400 font-bold">Net Worth</span><span class="font-bold text-white">$${(userPortfolio.cash + totalHoldingsValue).toFixed(2)}</span></div>
                </div>
            </div>
            <div class="bg-gray-800 p-6 rounded-lg">
                <h3 class="text-xl font-bold text-white">My Holdings</h3>
                <div id="holdingsList" class="space-y-3 mt-4">
                    ${holdingsHTML}
                </div>
            </div>
        </div>
    `;

    const holdingsList = document.getElementById('holdingsList');
    if (holdingsList) {
        holdingsList.addEventListener('click', (e) => {
            const holdingItem = e.target.closest('[data-ticker]');
            if (holdingItem) renderStockDetailPage(holdingItem.dataset.ticker);
        });
    }
    const goToTradeBtn = document.getElementById('dashboardGoToTrade');
    if (goToTradeBtn) {
        goToTradeBtn.addEventListener('click', () => showPage('tradePage'));
    }
};


const renderOrdersPage = () => {
    ordersPage.innerHTML = `<h3 class="text-xl font-bold mb-4">Pending Orders</h3><div id="pendingOrdersList" class="space-y-3 mb-8"></div>`;
    const pendingList = ordersPage.querySelector('#pendingOrdersList');
    if (!pendingList) return;
    if (pendingOrders.length === 0) {
        pendingList.innerHTML = `<p class="text-gray-400">You have no pending orders.</p>`;
    } else {
        pendingOrders.forEach(order => {
            const div = document.createElement('div');
            div.className = 'bg-gray-800 p-4 rounded-lg flex justify-between items-center';
            div.innerHTML = `<div><p class="font-bold text-white">${order.type.replace('-', ' ').toUpperCase()} ${order.ticker}</p><p class="text-sm text-gray-400">${order.quantity} shares @ $${order.limitPrice.toFixed(2)}</p></div><button data-id="${order.id}" class="cancel-order-btn bg-red-600 hover:bg-red-700 text-white font-bold py-1 px-3 rounded">Cancel</button>`;
            pendingList.appendChild(div);
        });
    }
};

ordersPage.addEventListener('click', async e => {
    if (e.target.classList.contains('cancel-order-btn')) {
        const orderId = e.target.dataset.id;
        const orderRef = doc(db, `artifacts/${appId}/users/${currentUserId}/orders`, orderId);
        await updateDoc(orderRef, { status: 'cancelled' });
    }
});

window.renderStockDetailPage = (ticker) => {
    const stock = stockData[ticker];
    if (!stock) return;
    pageTitle.textContent = `${stock.name} (${stock.ticker})`;
    stockDetailPage.innerHTML = `<div class="bg-gray-800 p-6 rounded-lg shadow-xl"><div class="grid grid-cols-1 lg:grid-cols-3 gap-6"><div class="lg:col-span-2 bg-gray-900 p-4 rounded-lg h-96"><canvas id="stockChart"></canvas></div><div class="bg-gray-900 p-6 rounded-lg"><h3 class="text-xl font-bold mb-4 text-white">Place an Order</h3><div class="space-y-4"><div><h4 class="font-semibold mb-2">Market Order</h4><input type="number" id="marketQty" placeholder="Quantity" class="w-full bg-gray-700 p-2 rounded"><div class="flex space-x-2 mt-2"><button id="marketBuyBtn" class="flex-1 bg-green-600 p-2 rounded">Buy</button><button id="marketSellBtn" class="flex-1 bg-red-600 p-2 rounded">Sell</button></div></div><div><h4 class="font-semibold mb-2">Limit Order</h4><input type="number" id="limitQty" placeholder="Quantity" class="w-full bg-gray-700 p-2 rounded mb-2"><input type="number" id="limitPrice" placeholder="Price" class="w-full bg-gray-700 p-2 rounded"><div class="flex space-x-2 mt-2"><button id="limitBuyBtn" class="flex-1 bg-green-600 p-2 rounded">Limit Buy</button><button id="limitSellBtn" class="flex-1 bg-red-600 p-2 rounded">Limit Sell</button></div></div><div><h4 class="font-semibold mb-2">Stop Loss</h4><input type="number" id="stopQty" placeholder="Quantity" class="w-full bg-gray-700 p-2 rounded mb-2"><input type="number" id="stopPrice" placeholder="Trigger Price" class="w-full bg-gray-700 p-2 rounded"><button id="stopSellBtn" class="w-full mt-2 bg-orange-600 p-2 rounded">Set Stop Loss</button></div></div></div></div></div>`;
    drawStockChart(stock);
    attachTradeButtonListeners(ticker);
    showPage('stockDetailPage');
};

const attachTradeButtonListeners = (ticker) => {
    document.getElementById('marketBuyBtn').addEventListener('click', () => {
        const qty = parseInt(document.getElementById('marketQty').value);
        if(qty) executeTransaction(ticker, qty, 'market-buy');
    });
    document.getElementById('marketSellBtn').addEventListener('click', () => {
        const qty = parseInt(document.getElementById('marketQty').value);
        if(qty) executeTransaction(ticker, qty, 'market-sell');
    });
    document.getElementById('limitBuyBtn').addEventListener('click', () => placeSpecialOrder(ticker, 'limit-buy'));
    document.getElementById('limitSellBtn').addEventListener('click', () => placeSpecialOrder(ticker, 'limit-sell'));
    document.getElementById('stopSellBtn').addEventListener('click', () => placeSpecialOrder(ticker, 'stop-loss'));
};

const executeTransaction = async (ticker, quantity, type) => {
    const price = stockData[ticker].price;
    const cost = price * quantity;
    const newPortfolio = JSON.parse(JSON.stringify(userPortfolio));
    if (type === 'market-buy') {
        if (newPortfolio.cash < cost) return;
        newPortfolio.cash -= cost;
        newPortfolio.stocks[ticker] = (newPortfolio.stocks[ticker] || 0) + quantity;
    } else {
        if ((newPortfolio.stocks[ticker] || 0) < quantity) return;
        newPortfolio.cash += cost;
        newPortfolio.stocks[ticker] -= quantity;
    }
    await setDoc(doc(db, `artifacts/${appId}/users/${currentUserId}/portfolio`, 'main'), newPortfolio);
};

const placeSpecialOrder = async (ticker, type) => {
    let qty, price;
    if (type === 'limit-buy' || type === 'limit-sell') {
        qty = parseInt(document.getElementById('limitQty').value);
        price = parseFloat(document.getElementById('limitPrice').value);
    } else {
        qty = parseInt(document.getElementById('stopQty').value);
        price = parseFloat(document.getElementById('stopPrice').value);
    }
    if (!qty || !price || qty <= 0 || price <= 0) return;
    const order = { userId: currentUserId, ticker, type, quantity: qty, limitPrice: price, status: 'pending', createdAt: serverTimestamp() };
    await addDoc(collection(db, `artifacts/${appId}/users/${currentUserId}/orders`), order);
    showPage('ordersPage');
};

const drawStockChart = (stock) => {
    const canvas = document.getElementById('stockChart');
    if (!canvas) return;
    if (activeChart) activeChart.destroy();
    activeChart = new Chart(canvas, {
        type: 'line',
        data: {
            labels: stock.history.map((_, i) => i),
            datasets: [{ data: stock.history, borderColor: '#3b82f6', backgroundColor: 'rgba(59, 130, 246, 0.1)', fill: true, tension: 0.2 }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
    });
};
