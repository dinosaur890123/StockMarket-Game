import { initializeApp } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js";
import { getFirestore, doc, setDoc, onSnapshot, collection, writeBatch, query, getDocs, addDoc, serverTimestamp, where, updateDoc, getDoc, runTransaction, orderBy, limit, deleteDoc } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";

const TRANSACTION_FEE = 5.00;

const firebaseConfig = {
    apiKey: "AIzaSyDx1XsUhmqchGCHEiB0dcF8cV6JDCp39D0",
    authDomain: "stock-market-game-f0922.firebaseapp.com",
    projectId: "stock-market-game-f0922",
    storageBucket: "stock-market-game-f0922.appspot.com",
    messagingSenderId: "860554882495",
    appId: "1:860554882495:web:c20583fed1530008b5850a",
    measurementId: "G-3V60XQ69VD"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();
const appId = 'stock-market-game-v1';

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
const helpPage = document.getElementById('helpPage');
const newsFeedContainer = document.getElementById('newsFeedContainer');
const messageBox = document.getElementById('messageBox');
const messageText = document.getElementById('messageText');
const navLinks = {
    dashboard: document.getElementById('navDashboard'),
    trade: document.getElementById('navTrade'),
    orders: document.getElementById('navOrders'),
    leaderboard: document.getElementById('navLeaderboard'),
    help: document.getElementById('navHelp'),
};
const headerCash = document.getElementById('headerCash');
const headerStocks = document.getElementById('headerStocks');
const headerNetWorth = document.getElementById('headerNetWorth');

let currentUserId = null;
let userPortfolio = null;
let stockData = {};
let pendingOrders = [];
let activeNews = [];
let stockUnsubscribe = null;
let portfolioUnsubscribe = null;
let ordersUnsubscribe = null;
let newsUnsubscribe = null;
let notificationsUnsubscribe = null;
let marketDataUnsubscribe = null;
let activeChart = null;
let marketState = null;
let marketUpdateInterval = null;

const showMessage = (text, isError = false) => {
    messageText.textContent = text;
    messageBox.classList.remove('hidden');
    messageBox.classList.toggle('bg-red-500', isError);
    messageBox.classList.toggle('bg-green-500', !isError);
    setTimeout(() => messageBox.classList.add('hidden'), 4000);
};

const showPage = (pageId) => {
    [dashboardPage, tradePage, ordersPage, stockDetailPage, leaderboardPage, helpPage].forEach(p => p.classList.add('hidden'));
    const pageElement = document.getElementById(pageId);
    if (pageElement) pageElement.classList.remove('hidden');

    Object.values(navLinks).forEach(link => link.classList.remove('active'));
    const activeLink = document.getElementById(`nav${pageId.replace('Page', '')}`);
    if(activeLink) activeLink.classList.add('active');
    
    if (pageId === 'dashboardPage') pageTitle.textContent = 'Dashboard';
    if (pageId === 'tradePage') pageTitle.textContent = 'Trade';
    if (pageId === 'ordersPage') pageTitle.textContent = 'My Orders';
    if (pageId === 'leaderboardPage') pageTitle.textContent = 'Leaderboard';
    if (pageId === 'helpPage') pageTitle.textContent = 'Help';
};

Object.keys(navLinks).forEach(key => {
    navLinks[key].addEventListener('click', (e) => {
        e.preventDefault();
        showPage(`${key}Page`);
    });
});

onAuthStateChanged(auth, user => {
    [stockUnsubscribe, portfolioUnsubscribe, ordersUnsubscribe, marketDataUnsubscribe, newsUnsubscribe, notificationsUnsubscribe].forEach(unsub => { if (unsub) unsub(); });
    if (marketUpdateInterval) clearInterval(marketUpdateInterval);

    if (user) {
        currentUserId = user.uid;
        sidebar.classList.remove('hidden');
        mainContent.classList.remove('hidden');
        loginPage.classList.add('hidden');
        appContainer.style.marginLeft = '16rem';
        authContainer.innerHTML = `<div class="flex flex-col items-center space-y-4"><img src="${user.photoURL}" class="w-16 h-16 rounded-full"><p>${user.displayName}</p><button id="signOutButton" class="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-md mt-4">Sign Out</button></div>`;
        document.getElementById('signOutButton').addEventListener('click', () => signOut(auth));
        showPage('dashboardPage');
        loadGameData(user);
    } else {
        currentUserId = null;
        sidebar.classList.add('hidden');
        mainContent.classList.add('hidden');
        loginPage.classList.remove('hidden');
        appContainer.style.marginLeft = '0';
        authContainer.innerHTML = '';
    }
});

mainSignInButton.addEventListener('click', () => {
    mainSignInButton.disabled = true;
    mainSignInButton.textContent = 'Signing In...';
    signInWithPopup(auth, provider).catch(error => {
        mainSignInButton.disabled = false;
        mainSignInButton.textContent = 'Sign In';
        console.error("Sign-in cancelled or failed:", error.message);
    });
});

const loadGameData = async (user) => {
    await initializeMarketInFirestore();
    subscribeToStocks();
    subscribeToPortfolio(user);
    subscribeToOrders(user.uid);
    subscribeToMarketData();
    subscribeToNews();
    subscribeToNotifications(user.uid);
};

const subscribeToMarketData = () => {
    const marketDocRef = doc(db, `artifacts/${appId}/public/market`);
    marketDataUnsubscribe = onSnapshot(marketDocRef, (docSnap) => {
        if (docSnap.exists()) {
            const marketData = docSnap.data();
            marketState = marketData;
            setupMarketUpdateLoop();
            renderLeaderboard(marketData.leaderboard || []);
        } else {
            renderLeaderboard([]);
        }
    });
};

const subscribeToNotifications = (userId) => {
    const notificationsRef = collection(db, `artifacts/${appId}/users/${userId}/notifications`);
    notificationsUnsubscribe = onSnapshot(notificationsRef, (snapshot) => {
        snapshot.docChanges().forEach(async (change) => {
            if (change.type === "added") {
                const notification = change.doc.data();
                showMessage(notification.message);
                await deleteDoc(change.doc.ref);
            }
        });
    });
};

const renderLeaderboard = (players) => {
    leaderboardPage.innerHTML = `<div class="bg-gray-800 p-6 rounded-lg shadow-lg"><h2 class="text-2xl font-bold text-white mb-4">Top Players by Net Worth</h2><div id="leaderboardList" class="space-y-3"></div></div>`;
    const listEl = leaderboardPage.querySelector('#leaderboardList');
    if (!players || players.length === 0) {
        listEl.innerHTML = '<p class="text-gray-400">Leaderboard is being calculated...</p>';
        return;
    }
    players.forEach((player, index) => {
        const rank = index + 1;
        const playerCard = document.createElement('div');
        playerCard.className = 'flex items-center justify-between bg-gray-700 p-4 rounded-lg';
        let rankColor = 'text-gray-400';
        if (rank === 1) rankColor = 'text-yellow-400';
        if (rank === 2) rankColor = 'text-gray-300';
        if (rank === 3) rankColor = 'text-yellow-600';
        playerCard.innerHTML = `<div class="flex items-center"><span class="text-2xl font-bold w-10 ${rankColor}">${rank}</span><img src="${player.photoURL || 'https://placehold.co/40x40/7f8c8d/ecf0f1?text=?'}" class="w-10 h-10 rounded-full mr-4"><div><p class="font-bold text-white">${player.displayName || 'Anonymous Player'}</p><p class="text-sm text-gray-400">Net Worth: $${player.netWorth.toFixed(2)}</p></div></div><div class="text-right"><p class="text-sm text-green-400">Cash: $${player.cash.toFixed(2)}</p><p class="text-sm text-blue-400">Stocks: $${player.stockValue.toFixed(2)}</p></div>`;
        listEl.appendChild(playerCard);
    });
};

const initializeMarketInFirestore = async () => {
    const marketDocRef = doc(db, `artifacts/${appId}/public/market`);
    const stocksCollectionRef = collection(db, `artifacts/${appId}/public/market/stocks`);
    const marketStateSnap = await getDoc(marketDocRef);
    if (!marketStateSnap.exists()) {
        await setDoc(marketDocRef, { is_running: true, tick_interval_seconds: 15, last_update: serverTimestamp() });
    }
    const q = query(stocksCollectionRef);
    const querySnapshot = await getDocs(q);
    if (querySnapshot.empty) {
        const initialCompanies = [
            { ticker: 'INNV', name: 'Innovate Corp', sector: 'Tech', price: 150.00, volatility: 1.5, dividend: 0.50 },
            { ticker: 'HLTH', name: 'Healthwell Inc.', sector: 'Healthcare', price: 220.00, volatility: 0.8, dividend: 0.75 },
            { ticker: 'ENRG', name: 'Synergy Power', sector: 'Energy', price: 85.50, volatility: 1.3, dividend: 0 },
        ];
        const batch = writeBatch(db);
        initialCompanies.forEach(c => {
            const stockRef = doc(stocksCollectionRef, c.ticker);
            batch.set(stockRef, { ...c, history: [c.price] });
        });
        await batch.commit();
    }
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
        if (e.code === 'failed-precondition') {
            console.log("Market update race lost. Another client is updating.");
        } else {
            console.error("Unexpected error in market update transaction:", e);
        }
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
        newsFeedContainer.innerHTML = '<p class="text-gray-400">No recent news.</p>';
        return;
    }
    activeNews.forEach(news => {
        const div = document.createElement('div');
        const sentimentColor = news.sentiment > 0 ? 'border-green-500' : 'border-red-500';
        div.className = `border-l-4 p-2 ${sentimentColor}`;
        div.innerHTML = `<p class="text-sm text-gray-300">${news.headline}</p><p class="text-xs text-gray-500">${new Date(news.timestamp.seconds * 1000).toLocaleTimeString()}</p>`;
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

const subscribeToPortfolio = (user) => {
    const portfolioRef = doc(db, `artifacts/${appId}/users/${user.uid}/portfolio`, 'main');
    portfolioUnsubscribe = onSnapshot(portfolioRef, async (docSnap) => {
        if (!docSnap.exists()) {
            const userRef = doc(db, `artifacts/${appId}/users`, user.uid);
            const batch = writeBatch(db);
            batch.set(userRef, {
                displayName: user.displayName,
                photoURL: user.photoURL,
                joinedAt: serverTimestamp()
            });
            batch.set(portfolioRef, { cash: 20000, stocks: {} });
            await batch.commit();
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
    if (order.type === 'limit-buy' && (newPortfolio.cash - TRANSACTION_FEE) < cost) return updateDoc(orderRef, { status: 'failed', reason: 'Insufficient funds' });
    if ((order.type === 'limit-sell' || order.type === 'stop-loss') && (newPortfolio.stocks[order.ticker] || 0) < order.quantity) return updateDoc(orderRef, { status: 'failed', reason: 'Insufficient shares' });
    if (order.type === 'limit-buy') {
        newPortfolio.cash -= (cost + TRANSACTION_FEE);
        newPortfolio.stocks[order.ticker] = (newPortfolio.stocks[order.ticker] || 0) + order.quantity;
    } else {
        newPortfolio.cash += (cost - TRANSACTION_FEE);
        newPortfolio.stocks[order.ticker] -= order.quantity;
        if(newPortfolio.stocks[order.ticker] === 0) delete newPortfolio.stocks[order.ticker];
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
    const sortedStocks = Object.values(stockData).filter(s => s && s.name).sort((a, b) => a.name.localeCompare(b.name));
    container.innerHTML = '';
    sortedStocks.forEach(stock => {
        const card = document.createElement('div');
        card.className = 'bg-gray-800 p-4 rounded-lg shadow-lg cursor-pointer transition transform hover:-translate-y-1 hover:shadow-blue-500/20';
        card.innerHTML = `<div class="flex justify-between items-baseline"><h3 class="text-lg font-bold text-white">${stock.name}</h3><span class="text-xs font-mono bg-gray-700 px-2 py-1 rounded">${stock.ticker || stock.id}</span></div><p class="text-sm text-gray-400 mb-2">${stock.sector}</p><p class="text-2xl font-light text-white">$${stock.price.toFixed(2)}</p>`;
        card.addEventListener('click', () => renderStockDetailPage(stock.ticker || stock.id));
        container.appendChild(card);
    });
};

const renderDashboardPage = () => {
    const marketContainer = dashboardPage.querySelector('#dashboardMarketContainer') || document.createElement('div');
    if (!dashboardPage.querySelector('#dashboardMarketContainer')) {
        const title = document.createElement('h3');
        title.className = 'text-xl font-bold text-white mb-4 mt-8';
        title.textContent = 'Market Overview';
        dashboardPage.appendChild(title);
        marketContainer.id = 'dashboardMarketContainer';
        marketContainer.className = "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5";
        dashboardPage.appendChild(marketContainer);
    }
    marketContainer.innerHTML = '';
    const sortedStocks = Object.values(stockData).filter(s => s && s.name).sort((a, b) => a.name.localeCompare(b.name));
    if (sortedStocks.length === 0) {
        marketContainer.innerHTML = `<p class="text-gray-400">Market data is loading...</p>`;
        return;
    }
    sortedStocks.forEach(stock => {
        const card = document.createElement('div');
        card.className = 'bg-gray-800 p-4 rounded-lg shadow-lg cursor-pointer transition transform hover:-translate-y-1 hover:shadow-blue-500/20';
        card.innerHTML = `<div class="flex justify-between items-baseline"><h3 class="text-lg font-bold text-white">${stock.name}</h3><span class="text-xs font-mono bg-gray-700 px-2 py-1 rounded">${stock.ticker || stock.id}</span></div><p class="text-sm text-gray-400 mb-2">${stock.sector}</p><p class="text-2xl font-light text-white">$${stock.price.toFixed(2)}</p>`;
        card.addEventListener('click', () => renderStockDetailPage(stock.ticker || stock.id));
        marketContainer.appendChild(card);
    });
};

const renderOrdersPage = () => {
    ordersPage.innerHTML = `<div class="bg-gray-800 p-6 rounded-lg shadow-lg"><h2 class="text-2xl font-bold text-white mb-4">Pending Orders</h2><div id="pendingOrdersList" class="space-y-3"></div></div>`;
    const pendingList = ordersPage.querySelector('#pendingOrdersList');
    if (pendingOrders.length === 0) {
        pendingList.innerHTML = `<p class="text-gray-400">You have no pending orders.</p>`;
    } else {
        pendingList.innerHTML = '';
        pendingOrders.forEach(order => {
            const div = document.createElement('div');
            div.className = 'bg-gray-700 p-4 rounded-lg flex justify-between items-center';
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
    pageTitle.textContent = `${stock.name} (${ticker})`;
    stockDetailPage.innerHTML = `<div class="bg-gray-800 p-6 rounded-lg shadow-xl"><div class="grid grid-cols-1 lg:grid-cols-3 gap-6"><div class="lg:col-span-2 bg-gray-900 p-4 rounded-lg h-96"><canvas id="stockChart"></canvas></div><div class="bg-gray-900 p-6 rounded-lg"><h3 class="text-xl font-bold mb-4 text-white">Place an Order</h3><form id="tradeForm" class="space-y-4"><div><h4 class="font-semibold mb-2">Market Order</h4><input type="number" id="marketQty" placeholder="Quantity" class="w-full bg-gray-700 p-2 rounded"><div class="flex space-x-2 mt-2"><button type="button" id="marketBuyBtn" class="flex-1 bg-green-600 p-2 rounded">Buy</button><button type="button" id="marketSellBtn" class="flex-1 bg-red-600 p-2 rounded">Sell</button></div></div><div><h4 class="font-semibold mb-2">Limit Order</h4><input type="number" id="limitQty" placeholder="Quantity" class="w-full bg-gray-700 p-2 rounded mb-2"><input type="number" id="limitPrice" placeholder="Price" class="w-full bg-gray-700 p-2 rounded"><div class="flex space-x-2 mt-2"><button type="button" id="limitBuyBtn" class="flex-1 bg-green-600 p-2 rounded">Limit Buy</button><button type="button" id="limitSellBtn" class="flex-1 bg-red-600 p-2 rounded">Limit Sell</button></div></div><div><h4 class="font-semibold mb-2">Stop Loss</h4><input type="number" id="stopQty" placeholder="Quantity" class="w-full bg-gray-700 p-2 rounded mb-2"><input type="number" id="stopPrice" placeholder="Trigger Price" class="w-full bg-gray-700 p-2 rounded"><button type="button" id="stopSellBtn" class="w-full mt-2 bg-orange-600 p-2 rounded">Set Stop Loss</button></div></form></div></div></div>`;
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
        if (newPortfolio.cash < (cost + TRANSACTION_FEE)) {
            showMessage("Insufficient funds for this transaction.", true);
            return;
        }
        newPortfolio.cash -= (cost + TRANSACTION_FEE);
        newPortfolio.stocks[ticker] = (newPortfolio.stocks[ticker] || 0) + quantity;
    } else {
        if ((newPortfolio.stocks[ticker] || 0) < quantity) {
            showMessage("You don't own enough shares to sell.", true);
            return;
        }
        newPortfolio.cash += (cost - TRANSACTION_FEE);
        newPortfolio.stocks[ticker] -= quantity;
        if(newPortfolio.stocks[ticker] === 0) delete newPortfolio.stocks[ticker];
    }
    await setDoc(doc(db, `artifacts/${appId}/users/${currentUserId}/portfolio`, 'main'), newPortfolio);
    showMessage(`Transaction successful! Fee: $${TRANSACTION_FEE.toFixed(2)}`);
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
    if (!qty || !price || qty <= 0 || price <= 0) return showMessage("Invalid quantity or price for special order.", true);
    const order = { userId: currentUserId, ticker, type, quantity: qty, limitPrice: price, status: 'pending', createdAt: serverTimestamp() };
    await addDoc(collection(db, `artifacts/${appId}/users/${currentUserId}/orders`), order);
    showMessage(`Pending order for ${ticker} has been placed.`);
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
                borderColor: '#3b82f6',
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
                x: { ticks: { color: '#9ca3af' }, grid: { color: 'rgba(255,255,255,0.1)' } },
                y: { ticks: { color: '#9ca3af' }, grid: { color: 'rgba(255,255,255,0.1)' } }
            }
        }
    });
};
