// Firebase Imports
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js";
import { getFirestore, doc, setDoc, onSnapshot, collection, writeBatch, query, getDocs, addDoc, serverTimestamp, where, updateDoc, getDoc, runTransaction, orderBy, limit } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";

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
const leaderboardPage = document.getElementById('leaderboardPage');
const newsFeedContainer = document.getElementById('newsFeedContainer');
const navLinks = {
    dashboard: document.getElementById('navDashboard'),
    trade: document.getElementById('navTrade'),
    orders: document.getElementById('navOrders'),
    leaderboard: document.getElementById('navLeaderboard'),
};
const headerCash = document.getElementById('headerCash');
const headerStocks = document.getElementById('headerStocks');
const headerNetWorth = document.getElementById('headerNetWorth');

// --- Game State ---
let currentUserId = null;
let userPortfolio = null;
let stockData = {};
let pendingOrders = [];
let activeNews = [];
let stockUnsubscribe = null;
let portfolioUnsubscribe = null;
let ordersUnsubscribe = null;
let newsUnsubscribe = null;
let leaderboardUnsubscribe = null;
let activeChart = null;
let marketState = null;
let marketStateUnsubscribe = null;
let marketUpdateInterval = null;

// --- Navigation ---
const showPage = (pageId) => {
    [dashboardPage, tradePage, ordersPage, stockDetailPage, leaderboardPage].forEach(p => p.classList.add('hidden'));
    const pageElement = document.getElementById(pageId);
    if (pageElement) pageElement.classList.remove('hidden');

    Object.values(navLinks).forEach(link => link.classList.remove('active'));
    const activeLink = document.getElementById(`nav${pageId.replace('Page', '')}`);
    if(activeLink) activeLink.classList.add('active');
    
    if (pageId === 'dashboardPage') pageTitle.textContent = 'Dashboard';
    if (pageId === 'tradePage') pageTitle.textContent = 'Trade';
    if (pageId === 'ordersPage') pageTitle.textContent = 'My Orders';
    if (pageId === 'leaderboardPage') pageTitle.textContent = 'Leaderboard';
};

Object.keys(navLinks).forEach(key => {
    navLinks[key].addEventListener('click', (e) => {
        e.preventDefault();
        showPage(`${key}Page`);
    });
});

// --- Authentication ---
onAuthStateChanged(auth, user => {
    [stockUnsubscribe, portfolioUnsubscribe, ordersUnsubscribe, marketStateUnsubscribe, newsUnsubscribe, leaderboardUnsubscribe].forEach(unsub => { if (unsub) unsub(); });
    if (marketUpdateInterval) clearInterval(marketUpdateInterval);

    if (user) {
        currentUserId = user.uid;
        sidebar.classList.remove('hidden');
        mainContent.classList.remove('hidden');
        loginPage.classList.add('hidden');
        appContainer.style.marginLeft = '256px';
        authContainer.innerHTML = `
            <div class="auth-info">
                <img src="${user.photoURL || 'https://placehold.co/40x40/7f8c8d/ecf0f1?text=?'}" alt="User Photo">
                <p>${user.displayName}</p>
            </div>
            <button id="signOutButton" class="danger">Sign Out</button>`;
        document.getElementById('signOutButton').addEventListener('click', () => signOut(auth));
        showPage('dashboardPage');
        loadGameData(user.uid);
    } else {
        currentUserId = null;
        sidebar.classList.add('hidden');
        mainContent.classList.add('hidden');
        loginPage.classList.remove('hidden');
        appContainer.style.marginLeft = '0';
        authContainer.innerHTML = '';
    }
});
mainSignInButton.addEventListener('click', () => signInWithPopup(auth, provider));

// --- Core Game Logic ---
const loadGameData = async (userId) => {
    await initializeMarketInFirestore();
    subscribeToStocks();
    subscribeToPortfolio(userId);
    subscribeToOrders(userId);
    subscribeToMarketState();
    subscribeToNews();
    subscribeToLeaderboard();
};

const subscribeToLeaderboard = () => {
    const leaderboardRef = doc(db, `artifacts/${appId}/public/market/leaderboard`);
    leaderboardUnsubscribe = onSnapshot(leaderboardRef, (docSnap) => {
        if (docSnap.exists()) {
            renderLeaderboard(docSnap.data().players);
        } else {
            renderLeaderboard([]);
        }
    });
};

const renderLeaderboard = (players) => {
    leaderboardPage.innerHTML = `
        <div class="section">
            <h2>Top Players by Net Worth</h2>
            <div id="leaderboardList"></div>
        </div>
    `;
    const listEl = leaderboardPage.querySelector('#leaderboardList');
    if (!players || players.length === 0) {
        listEl.innerHTML = '<p>Leaderboard is being calculated...</p>';
        return;
    }

    players.forEach((player, index) => {
        const rank = index + 1;
        const playerCard = document.createElement('div');
        playerCard.className = 'leaderboard-card';
        
        let rankClass = '';
        if (rank === 1) rankClass = 'gold';
        if (rank === 2) rankClass = 'silver';
        if (rank === 3) rankClass = 'bronze';

        playerCard.innerHTML = `
            <div style="display: flex; align-items: center;">
                <span class="rank ${rankClass}">${rank}</span>
                <img src="${player.photoURL || 'https://placehold.co/40x40/7f8c8d/ecf0f1?text=?'}" alt="Player photo">
                <div>
                    <p style="font-weight: 700;">${player.displayName || 'Anonymous Player'}</p>
                    <p style="color: var(--text-muted);">Net Worth: $${player.netWorth.toFixed(2)}</p>
                </div>
            </div>
            <div style="text-align: right;">
                <p style="color: var(--green);">Cash: $${player.cash.toFixed(2)}</p>
                <p style="color: var(--text-accent);">Stocks: $${player.stockValue.toFixed(2)}</p>
            </div>
        `;
        listEl.appendChild(playerCard);
    });
};

const initializeMarketInFirestore = async () => {
    const marketDocRef = doc(db, `artifacts/${appId}/public/market`);
    const stocksCollectionRef = collection(db, `artifacts/${appId}/public/market/stocks`);
    const marketStateSnap = await getDoc(marketDocRef);
    if (!marketStateSnap.exists()) {
        await setDoc(marketDocRef, {
            is_running: true,
            tick_interval_seconds: 15,
            last_update: serverTimestamp()
        });
    }
    const q = query(stocksCollectionRef);
    const querySnapshot = await getDocs(q);
    if (querySnapshot.empty) {
        const initialCompanies = [
            { ticker: 'INNV', name: 'Innovate Corp', sector: 'Tech', price: 150.00, volatility: 1.5 },
            { ticker: 'HLTH', name: 'Healthwell Inc.', sector: 'Healthcare', price: 220.00, volatility: 0.8 },
            { ticker: 'ENRG', name: 'Synergy Power', sector: 'Energy', price: 85.50, volatility: 1.3 },
        ];
        const batch = writeBatch(db);
        initialCompanies.forEach(c => {
            const stockRef = doc(stocksCollectionRef, c.ticker);
            batch.set(stockRef, { ...c, history: [c.price] });
        });
        await batch.commit();
    }
};

const subscribeToMarketState = () => {
    const marketDocRef = doc(db, `artifacts/${appId}/public/market`);
    marketStateUnsubscribe = onSnapshot(marketDocRef, (docSnap) => {
        if (docSnap.exists()) {
            marketState = docSnap.data();
            setupMarketUpdateLoop();
        }
    });
};

const setupMarketUpdateLoop = () => {
    if (marketUpdateInterval) clearInterval(marketUpdateInterval);
    if (marketState && marketState.is_running) {
        marketUpdateInterval = setInterval(tryToUpdateMarket, 1000);
    }
};

const tryToUpdateMarket = async () => {
    if (!marketState || !marketState.is_running || !marketState.last_update) return;
    const now = Math.floor(Date.now() / 1000);
    const lastUpdate = marketState.last_update.seconds;
    const interval = marketState.tick_interval_seconds;
    if ((now - lastUpdate) < interval) return;
    const marketDocRef = doc(db, `artifacts/${appId}/public/market`);
    try {
        await runTransaction(db, async (transaction) => {
            const stateDoc = await transaction.get(marketDocRef);
            if (!stateDoc.exists()) throw "Market document does not exist!";
            const currentState = stateDoc.data();
            const currentNow = Math.floor(Date.now() / 1000);
            const currentLastUpdate = currentState.last_update.seconds;
            if ((currentNow - currentLastUpdate) >= currentState.tick_interval_seconds) {
                transaction.update(marketDocRef, { last_update: serverTimestamp() });
                await updateMarketPrices();
            }
        });
    } catch (e) {
        console.log("Market update race failed:", e);
    }
};

const updateMarketPrices = async () => {
    const stocksCollectionRef = collection(db, `artifacts/${appId}/public/market/stocks`);
    const querySnapshot = await getDocs(stocksCollectionRef);
    if (querySnapshot.empty) return;
    const batch = writeBatch(db);
    querySnapshot.forEach(docSnap => {
        const stock = docSnap.data();
        const stockRef = doc(stocksCollectionRef, docSnap.id);
        let changePercent = 2 * stock.volatility * (Math.random() - 0.5);
        const newsEvent = activeNews.find(n => n.ticker === docSnap.id && n.is_active);
        if (newsEvent) {
            changePercent += newsEvent.impact_percent;
        }
        let newPrice = stock.price * (1 + changePercent / 100);
        newPrice = Math.max(0.01, newPrice);
        const history = stock.history || [];
        history.push(newPrice);
        if (history.length > 100) history.shift();
        batch.update(stockRef, { price: newPrice, history: history });
    });
    await batch.commit();
};

const subscribeToNews = () => {
    const newsRef = collection(db, `artifacts/${appId}/public/market/news`);
    const q = query(newsRef, orderBy("timestamp", "desc"), limit(10));
    newsUnsubscribe = onSnapshot(q, (snapshot) => {
        activeNews = snapshot.docs.map(doc => doc.data());
        renderNewsFeed();
    });
};

const renderNewsFeed = () => {
    if (!newsFeedContainer) return;
    newsFeedContainer.innerHTML = '';
    if (activeNews.length === 0) {
        newsFeedContainer.innerHTML = '<p>No recent news.</p>';
        return;
    }
    activeNews.forEach(news => {
        const div = document.createElement('div');
        const sentimentClass = news.sentiment > 0 ? 'positive' : 'negative';
        div.className = `news-item ${sentimentClass}`;
        div.innerHTML = `<p>${news.headline}</p><p>${new Date(news.timestamp.seconds * 1000).toLocaleTimeString()}</p>`;
        newsFeedContainer.appendChild(div);
    });
};

const subscribeToStocks = () => {
    const stocksRef = collection(db, `artifacts/${appId}/public/market/stocks`);
    stockUnsubscribe = onSnapshot(stocksRef, snapshot => {
        const stockChanges = snapshot.docChanges();
        stockChanges.forEach(change => {
            const stock = { id: change.doc.id, ...change.doc.data() };
            stockData[stock.id] = stock;
            if (change.type === "modified") {
                if (!stockDetailPage.classList.contains('hidden') && pageTitle.textContent.includes(stock.id)) {
                    renderStockDetailPage(stock.id);
                }
                checkPendingOrders(stock);
            }
        });
        if (stockChanges.length > 0) {
            renderTradePage();
            renderDashboardPage();
            updatePortfolioValue();
        }
    }, console.error);
};

const subscribeToPortfolio = (userId) => {
    const portfolioRef = doc(db, `artifacts/${appId}/users/${userId}/portfolio`, 'main');
    portfolioUnsubscribe = onSnapshot(portfolioRef, docSnap => {
        if (!docSnap.exists()) {
            setDoc(portfolioRef, { cash: 20000, stocks: {} });
        } else {
            userPortfolio = docSnap.data();
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
    tradePage.innerHTML = `<div class="card-grid"></div>`;
    const container = tradePage.querySelector('.card-grid');
    const sortedStocks = Object.values(stockData).filter(s => s && s.name).sort((a, b) => a.name.localeCompare(b.name));
    sortedStocks.forEach(stock => {
        const card = document.createElement('div');
        card.className = 'stock-card';
        card.innerHTML = `
            <div class="card-header">
                <h3>${stock.name}</h3>
                <span class="ticker-badge">${stock.ticker || stock.id}</span>
            </div>
            <p class="sector">${stock.sector}</p>
            <p class="price">$${stock.price.toFixed(2)}</p>
        `;
        card.addEventListener('click', () => renderStockDetailPage(stock.ticker || stock.id));
        container.appendChild(card);
    });
};

const renderDashboardPage = () => {
    const marketContainer = dashboardPage.querySelector('#dashboardMarketContainer') || document.createElement('div');
    if (!dashboardPage.querySelector('#dashboardMarketContainer')) {
        const title = document.createElement('h3');
        title.textContent = 'Market Overview';
        dashboardPage.appendChild(title);
        marketContainer.id = 'dashboardMarketContainer';
        marketContainer.className = "card-grid";
        dashboardPage.appendChild(marketContainer);
    }
    
    marketContainer.innerHTML = '';
    const sortedStocks = Object.values(stockData).filter(s => s && s.name).sort((a, b) => a.name.localeCompare(b.name));
    if (sortedStocks.length === 0) {
        marketContainer.innerHTML = `<p>Market data is loading...</p>`;
        return;
    }
    sortedStocks.forEach(stock => {
        const card = document.createElement('div');
        card.className = 'stock-card';
        card.innerHTML = `
            <div class="card-header">
                <h3>${stock.name}</h3>
                <span class="ticker-badge">${stock.ticker || stock.id}</span>
            </div>
            <p class="sector">${stock.sector}</p>
            <p class="price">$${stock.price.toFixed(2)}</p>
        `;
        card.addEventListener('click', () => renderStockDetailPage(stock.ticker || stock.id));
        marketContainer.appendChild(card);
    });
};

const renderOrdersPage = () => {
    ordersPage.innerHTML = `<div class="section"><h2>Pending Orders</h2><div id="pendingOrdersList"></div></div>`;
    const pendingList = ordersPage.querySelector('#pendingOrdersList');
    if (pendingOrders.length === 0) {
        pendingList.innerHTML = `<p>You have no pending orders.</p>`;
    } else {
        pendingList.innerHTML = '';
        pendingOrders.forEach(order => {
            const div = document.createElement('div');
            div.className = 'order-card';
            div.innerHTML = `
                <div>
                    <p style="font-weight: 700;">${order.type.replace('-', ' ').toUpperCase()} ${order.ticker}</p>
                    <p style="color: var(--text-muted);">${order.quantity} shares @ $${order.limitPrice.toFixed(2)}</p>
                </div>
                <button data-id="${order.id}" class="cancel-order-btn danger">Cancel</button>
            `;
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
    pageTitle.textContent = `${stock.name} (${ticker})`;
    stockDetailPage.innerHTML = `
        <div class="section" style="display: grid; grid-template-columns: 2fr 1fr; gap: 24px;">
            <div><canvas id="stockChart"></canvas></div>
            <div class="order-form">
                <h3>Place an Order</h3>
                <form id="tradeForm">
                    <h4>Market Order</h4>
                    <input type="number" id="marketQty" placeholder="Quantity">
                    <div style="display: flex; gap: 8px;">
                        <button type="button" id="marketBuyBtn" class="success" style="flex: 1;">Buy</button>
                        <button type="button" id="marketSellBtn" class="danger" style="flex: 1;">Sell</button>
                    </div>
                    <hr style="border-color: var(--input-bg);">
                    <h4>Limit Order</h4>
                    <input type="number" id="limitQty" placeholder="Quantity">
                    <input type="number" id="limitPrice" placeholder="Price">
                    <div style="display: flex; gap: 8px;">
                        <button type="button" id="limitBuyBtn" class="success" style="flex: 1;">Limit Buy</button>
                        <button type="button" id="limitSellBtn" class="danger" style="flex: 1;">Limit Sell</button>
                    </div>
                    <hr style="border-color: var(--input-bg);">
                    <h4>Stop Loss</h4>
                    <input type="number" id="stopQty" placeholder="Quantity">
                    <input type="number" id="stopPrice" placeholder="Trigger Price">
                    <button type="button" id="stopSellBtn" class="warning" style="width: 100%;">Set Stop Loss</button>
                </form>
            </div>
        </div>`;
    drawStockChart(stock);
    attachTradeButtonListeners(ticker);
    showPage('stockDetailPage');
};

const attachTradeButtonListeners = (ticker) => {
    document.getElementById('marketBuyBtn').addEventListener('click', () => {
        const qty = parseInt(document.getElementById('marketQty').value);
        if(qty > 0) executeTransaction(ticker, qty, 'market-buy');
    });
    document.getElementById('marketSellBtn').addEventListener('click', () => {
        const qty = parseInt(document.getElementById('marketQty').value);
        if(qty > 0) executeTransaction(ticker, qty, 'market-sell');
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
        if (newPortfolio.cash < cost) return alert("Insufficient funds.");
        newPortfolio.cash -= cost;
        newPortfolio.stocks[ticker] = (newPortfolio.stocks[ticker] || 0) + quantity;
    } else {
        if ((newPortfolio.stocks[ticker] || 0) < quantity) return alert("Insufficient shares.");
        newPortfolio.cash += cost;
        newPortfolio.stocks[ticker] -= quantity;
        if(newPortfolio.stocks[ticker] === 0) delete newPortfolio.stocks[ticker];
    }
    await setDoc(doc(db, `artifacts/${appId}/users/${currentUserId}/portfolio`, 'main'), newPortfolio);
};

const placeSpecialOrder = async (ticker, type) => {
    let qty, price;
    if (type.includes('limit')) {
        qty = parseInt(document.getElementById('limitQty').value);
        price = parseFloat(document.getElementById('limitPrice').value);
    } else {
        qty = parseInt(document.getElementById('stopQty').value);
        price = parseFloat(document.getElementById('stopPrice').value);
    }
    if (!qty || !price || qty <= 0 || price <= 0) return alert("Invalid quantity or price for special order.");
    const order = { userId: currentUserId, ticker, type, quantity: qty, limitPrice: price, status: 'pending', createdAt: serverTimestamp() };
    await addDoc(collection(db, `artifacts/${appId}/users/${currentUserId}/orders`), order);
    showPage('ordersPage');
};

const drawStockChart = (stock) => {
    const canvas = document.getElementById('stockChart');
    if (!canvas) return;
    if (activeChart) activeChart.destroy();
    activeChart = new Chart(canvas.getContext('2d'), {
        type: 'line',
        data: {
            labels: stock.history.map((_, i) => i + 1),
            datasets: [{
                label: 'Price History',
                data: stock.history,
                borderColor: 'var(--text-accent)',
                backgroundColor: 'rgba(59, 130, 246, 0.1)',
                fill: true,
                tension: 0.2,
                pointRadius: 0,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                x: { ticks: { color: 'var(--text-muted)' }, grid: { color: 'rgba(255,255,255,0.1)' } },
                y: { ticks: { color: 'var(--text-muted)' }, grid: { color: 'rgba(255,255,255,0.1)' } }
            }
        }
    });
};
