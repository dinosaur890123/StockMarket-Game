// Firebase Imports
import { initializeApp } from "[https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js](https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js)";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "[https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js](https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js)";
import { getFirestore, doc, setDoc, onSnapshot, collection, writeBatch, query, getDocs, addDoc, serverTimestamp, where, updateDoc } from "[https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js](https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js)";

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
// Pages
const loginPage = document.getElementById('loginPage');
const dashboardPage = document.getElementById('dashboardPage');
const tradePage = document.getElementById('tradePage');
const ordersPage = document.getElementById('ordersPage');
const stockDetailPage = document.getElementById('stockDetailPage');
// Nav Links
const navLinks = {
    dashboard: document.getElementById('navDashboard'),
    trade: document.getElementById('navTrade'),
    orders: document.getElementById('navOrders'),
};
// Header Portfolio
const headerCash = document.getElementById('headerCash');
const headerStocks = document.getElementById('headerStocks');
const headerNetWorth = document.getElementById('headerNetWorth');

// --- Game State & Chart ---
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
    // Hide all pages
    dashboardPage.classList.add('hidden');
    tradePage.classList.add('hidden');
    ordersPage.classList.add('hidden');
    stockDetailPage.classList.add('hidden');

    const pageElement = document.getElementById(pageId);
    if (pageElement) {
        pageElement.classList.remove('hidden');
    } else {
        console.error(`Navigation Error: Page with ID "${pageId}" not found.`);
        dashboardPage.classList.remove('hidden'); // Fallback to dashboard
    }

    // Update nav link styles
    Object.values(navLinks).forEach(link => link.classList.remove('active'));
    if (pageId.startsWith('dashboard')) navLinks.dashboard.classList.add('active');
    if (pageId.startsWith('trade')) navLinks.trade.classList.add('active');
    if (pageId.startsWith('orders')) navLinks.orders.classList.add('active');
    if (pageId.startsWith('stockDetail')) navLinks.trade.classList.add('active');

    // Update page title
    if (pageId === 'dashboardPage') pageTitle.textContent = 'Dashboard';
    if (pageId === 'tradePage') pageTitle.textContent = 'Trade';
    if (pageId === 'ordersPage') pageTitle.textContent = 'My Orders';
};

navLinks.dashboard.addEventListener('click', () => showPage('dashboardPage'));
navLinks.trade.addEventListener('click', () => showPage('tradePage'));
navLinks.orders.addEventListener('click', () => showPage('ordersPage'));

// --- Authentication ---
onAuthStateChanged(auth, user => {
    // Clean up old listeners
    if (stockUnsubscribe) stockUnsubscribe();
    if (portfolioUnsubscribe) portfolioUnsubscribe();
    if (ordersUnsubscribe) ordersUnsubscribe();

    if (user) {
        currentUserId = user.uid;
        sidebar.classList.remove('hidden');
        mainContent.classList.remove('hidden');
        loginPage.classList.add('hidden');
        appContainer.style.marginLeft = '16rem'; // Adjust content for sidebar
        authContainer.innerHTML = `<button id="signOutButton" class="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-md">Sign Out</button>`;
        document.getElementById('signOutButton').addEventListener('click', () => signOut(auth));
        showPage('dashboardPage');
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
const loadGameData = (userId) => {
    subscribeToStocks();
    subscribeToPortfolio(userId);
    subscribeToOrders(userId);
};

const subscribeToStocks = () => {
    const stocksRef = collection(db, `artifacts/${appId}/public/data/stocks`);
    stockUnsubscribe = onSnapshot(stocksRef, snapshot => {
        console.log("Successfully fetched stock data.");
        snapshot.docChanges().forEach(change => {
            const stock = { id: change.doc.id, ...change.doc.data() };
            stockData[stock.id] = stock;
            if (change.type === "modified") {
                checkPendingOrders(stock);
            }
        });
        renderTradePage();
        renderDashboardPage(); // Render dashboard as well
        updatePortfolioValue();
    }, (error) => {
        // ADDED: Better error handling
        console.error("Firestore Permission Error:", error);
        tradePage.innerHTML = `<p class="text-red-400 text-center">Could not load market data. Please check Firestore security rules.</p>`;
        dashboardPage.innerHTML = `<p class="text-red-400 text-center">Could not load dashboard. Please check Firestore security rules.</p>`;
    });
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

// --- Order Execution Engine ---
const checkPendingOrders = (stock) => {
    if (!userPortfolio) return;
    const price = stock.price;

    pendingOrders.forEach(order => {
        if (order.ticker !== stock.id) return;

        let shouldExecute = false;
        if (order.type === 'limit-buy' && price <= order.limitPrice) shouldExecute = true;
        if (order.type === 'limit-sell' && price >= order.limitPrice) shouldExecute = true;
        if (order.type === 'stop-loss' && price <= order.limitPrice) shouldExecute = true;

        if (shouldExecute) {
            executeSpecialOrder(order);
        }
    });
};

const executeSpecialOrder = async (order) => {
    const orderRef = doc(db, `artifacts/${appId}/users/${currentUserId}/orders`, order.id);
    const portfolioRef = doc(db, `artifacts/${appId}/users/${currentUserId}/portfolio`, 'main');

    const stock = stockData[order.ticker];
    if (!stock) return;

    const cost = stock.price * order.quantity;
    const newPortfolio = JSON.parse(JSON.stringify(userPortfolio));

    if (order.type === 'limit-buy' && newPortfolio.cash < cost) {
        return updateDoc(orderRef, { status: 'failed', reason: 'Insufficient funds' });
    }
    if ((order.type === 'limit-sell' || order.type === 'stop-loss') && (newPortfolio.stocks[order.ticker] || 0) < order.quantity) {
        return updateDoc(orderRef, { status: 'failed', reason: 'Insufficient shares' });
    }

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

// --- Rendering ---
const updatePortfolioValue = () => {
    if (!userPortfolio) return;
    let stockValue = Object.keys(userPortfolio.stocks).reduce((acc, ticker) => {
        const quantity = userPortfolio.stocks[ticker];
        const price = stockData[ticker]?.price || 0;
        return acc + (quantity * price);
    }, 0);
    headerCash.textContent = `$${userPortfolio.cash.toFixed(2)}`;
    headerStocks.textContent = `$${stockValue.toFixed(2)}`;
    headerNetWorth.textContent = `$${(userPortfolio.cash + stockValue).toFixed(2)}`;
};

const renderTradePage = () => {
    tradePage.innerHTML = `<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5"></div>`;
    const container = tradePage.querySelector('div');
    if (!container) return;
    // FIX: Added safety checks before sorting
    const sortedStocks = Object.values(stockData).filter(s => s && s.ticker);
    sortedStocks.sort((a, b) => a.ticker.localeCompare(b.ticker));

    sortedStocks.forEach(stock => {
        const card = document.createElement('div');
        card.className = 'bg-gray-800 p-4 rounded-lg shadow-lg cursor-pointer transition transform hover:-translate-y-1 hover:shadow-blue-500/20';
        card.innerHTML = `
            <div class="flex justify-between items-baseline">
                <h3 class="text-lg font-bold text-white">${stock.name}</h3>
                <span class="text-xs font-mono bg-gray-700 px-2 py-1 rounded">${stock.ticker}</span>
            </div>
            <p class="text-sm text-gray-400 mb-2">${stock.sector}</p>
            <p class="text-2xl font-light text-white">$${stock.price.toFixed(2)}</p>
        `;
        card.addEventListener('click', () => renderStockDetailPage(stock.id));
        container.appendChild(card);
    });
};

const renderDashboardPage = () => {
    // For now, the dashboard can show a welcome message or a summary.
    // This function can be expanded later.
    dashboardPage.innerHTML = `
        <div class="bg-gray-800 p-6 rounded-lg">
            <h3 class="text-xl font-bold text-white">Welcome to your Dashboard</h3>
            <p class="text-gray-400 mt-2">Here you can see a summary of your portfolio and market news.</p>
            <p class="text-gray-400 mt-4">Navigate to the 'Trade' page to view stocks and place orders.</p>
        </div>
    `;
};

const renderOrdersPage = () => {
    ordersPage.innerHTML = `
        <h3 class="text-xl font-bold mb-4">Pending Orders</h3>
        <div id="pendingOrdersList" class="space-y-3 mb-8"></div>
    `;
    const pendingList = ordersPage.querySelector('#pendingOrdersList');
    if (!pendingList) return;
    if (pendingOrders.length === 0) {
        pendingList.innerHTML = `<p class="text-gray-400">You have no pending orders.</p>`;
    } else {
        pendingOrders.forEach(order => {
            const div = document.createElement('div');
            div.className = 'bg-gray-800 p-4 rounded-lg flex justify-between items-center';
            div.innerHTML = `
                <div>
                    <p class="font-bold text-white">${order.type.replace('-', ' ').toUpperCase()} ${order.ticker}</p>
                    <p class="text-sm text-gray-400">${order.quantity} shares @ $${order.limitPrice.toFixed(2)}</p>
                </div>
                <button data-id="${order.id}" class="cancel-order-btn bg-red-600 hover:bg-red-700 text-white font-bold py-1 px-3 rounded">Cancel</button>
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

const renderStockDetailPage = (ticker) => {
    const stock = stockData[ticker];
    if (!stock) return;
    pageTitle.textContent = `${stock.name} (${stock.ticker})`;
    stockDetailPage.innerHTML = `
      <div class="bg-gray-800 p-6 rounded-lg shadow-xl">
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div class="lg:col-span-2 bg-gray-900 p-4 rounded-lg h-96"><canvas id="stockChart"></canvas></div>
          <div class="bg-gray-900 p-6 rounded-lg">
            <h3 class="text-xl font-bold mb-4 text-white">Place an Order</h3>
            <div class="space-y-4">
              <!-- Market Order -->
              <div>
                <h4 class="font-semibold mb-2">Market Order</h4>
                <input type="number" id="marketQty" placeholder="Quantity" class="w-full bg-gray-700 p-2 rounded">
                <div class="flex space-x-2 mt-2">
                  <button id="marketBuyBtn" class="flex-1 bg-green-600 p-2 rounded">Buy</button>
                  <button id="marketSellBtn" class="flex-1 bg-red-600 p-2 rounded">Sell</button>
                </div>
              </div>
              <!-- Limit Order -->
              <div>
                <h4 class="font-semibold mb-2">Limit Order</h4>
                <input type="number" id="limitQty" placeholder="Quantity" class="w-full bg-gray-700 p-2 rounded mb-2">
                <input type="number" id="limitPrice" placeholder="Price" class="w-full bg-gray-700 p-2 rounded">
                <div class="flex space-x-2 mt-2">
                  <button id="limitBuyBtn" class="flex-1 bg-green-600 p-2 rounded">Limit Buy</button>
                  <button id="limitSellBtn" class="flex-1 bg-red-600 p-2 rounded">Limit Sell</button>
                </div>
              </div>
              <!-- Stop Loss Order -->
              <div>
                <h4 class="font-semibold mb-2">Stop Loss</h4>
                <input type="number" id="stopQty" placeholder="Quantity" class="w-full bg-gray-700 p-2 rounded mb-2">
                <input type="number" id="stopPrice" placeholder="Trigger Price" class="w-full bg-gray-700 p-2 rounded">
                <button id="stopSellBtn" class="w-full mt-2 bg-orange-600 p-2 rounded">Set Stop Loss</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
    drawStockChart(stock);
    attachTradeButtonListeners(ticker);
    showPage('stockDetailPage');
};

const attachTradeButtonListeners = (ticker) => {
    // Market Orders
    document.getElementById('marketBuyBtn').addEventListener('click', () => {
        const qty = parseInt(document.getElementById('marketQty').value);
        if(qty) executeTransaction(ticker, qty, 'market-buy');
    });
    document.getElementById('marketSellBtn').addEventListener('click', () => {
        const qty = parseInt(document.getElementById('marketQty').value);
        if(qty) executeTransaction(ticker, qty, 'market-sell');
    });
    // Special Orders
    document.getElementById('limitBuyBtn').addEventListener('click', () => placeSpecialOrder(ticker, 'limit-buy'));
    document.getElementById('limitSellBtn').addEventListener('click', () => placeSpecialOrder(ticker, 'limit-sell'));
    document.getElementById('stopSellBtn').addEventListener('click', () => placeSpecialOrder(ticker, 'stop-loss'));
};

const executeTransaction = async (ticker, quantity, type) => {
    // This function is now only for immediate market orders
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
    } else { // stop-loss
        qty = parseInt(document.getElementById('stopQty').value);
        price = parseFloat(document.getElementById('stopPrice').value);
    }
    if (!qty || !price || qty <= 0 || price <= 0) return;

    const order = {
        userId: currentUserId,
        ticker,
        type,
        quantity: qty,
        limitPrice: price,
        status: 'pending',
        createdAt: serverTimestamp()
    };
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
            datasets: [{
                data: stock.history,
                borderColor: '#3b82f6',
                backgroundColor: 'rgba(59, 130, 246, 0.1)',
                fill: true,
                tension: 0.2
            }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
    });
};
