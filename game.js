import { initializeApp } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js";
import { getFirestore, doc, onSnapshot, collection } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-functions.js";

// Your web app's Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyDx1XsUhmqchGCHEiB0dcF8cV6JDCp39D0",
    authDomain: "stock-market-game-f0922.firebaseapp.com",
    projectId: "stock-market-game-f0922",
    storageBucket: "stock-market-game-f0922.appspot.com",
    messagingSenderId: "860554882495",
    appId: "1:860554882495:web:c20583fed1530008b5850a",
    measurementId: "G-3V60XQ69VD"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const functions = getFunctions(app);

// --- GAME LOGIC STARTS HERE ---

// --- STATE MANAGEMENT ---
let currentUserId = null;
let selectedStockId = null;
let marketData = {}; // To store all company data locally for quick access
let isTrading = false; // To prevent multiple trades at once

// --- DOM ELEMENTS ---
const marketList = document.getElementById('market-list');
const playerCashEl = document.getElementById('player-cash');
const playerNetWorthEl = document.getElementById('player-net-worth');
const sharesListEl = document.getElementById('shares-list');
const newsListEl = document.getElementById('news-list');
const selectedStockTitleEl = document.getElementById('selected-stock-title');
const userIdEl = document.getElementById('user-id');
const buyButton = document.getElementById('buy-button');
const sellButton = document.getElementById('sell-button');
const quantityInput = document.getElementById('quantity-input');

// --- RENDER FUNCTIONS ---
function renderMarket(companies) {
    if (!marketList) return;
    marketList.innerHTML = '';
    companies.forEach(company => {
        marketData[company.id] = company;
        const stockItem = document.createElement('div');
        stockItem.className = 'stock-item';
        if (company.id === selectedStockId) {
            stockItem.classList.add('selected');
        }
        stockItem.dataset.id = company.id;
        // Use a placeholder for dailyChange if it doesn't exist
        const priceClass = (company.dailyChange || 0) >= 0 ? 'price-up' : 'price-down';
        stockItem.innerHTML = `
            <span>${company.id}</span>
            <span class="stock-price ${priceClass}">
                $${company.currentPrice.toFixed(2)}
            </span>
        `;
        stockItem.addEventListener('click', () => selectStock(company.id));
        marketList.appendChild(stockItem);
    });
}

function renderPortfolio(playerData) {
    if (!playerData || !playerCashEl) return;
    playerCashEl.textContent = `$${playerData.cash.toFixed(2)}`;
    sharesListEl.innerHTML = '';
    let totalSharesValue = 0;
    if (playerData.shares) {
        for (const [companyId, quantity] of Object.entries(playerData.shares)) {
            if (quantity > 0) {
                const shareItem = document.createElement('p');
                const companyPrice = marketData[companyId]?.currentPrice || 0;
                const value = quantity * companyPrice;
                totalSharesValue += value;
                shareItem.innerHTML = `${quantity} x ${companyId} <span>@ $${value.toFixed(2)}</span>`;
                sharesListEl.appendChild(shareItem);
            }
        }
    }
    const netWorth = playerData.cash + totalSharesValue;
    playerNetWorthEl.textContent = `$${netWorth.toFixed(2)}`;
}

function renderNews(newsItems) {
    if (!newsListEl) return;
    newsListEl.innerHTML = '';
    newsItems.forEach(item => {
        const li = document.createElement('li');
        li.textContent = `[${item.targetCompany}] ${item.title}`;
        newsListEl.prepend(li);
    });
}

// --- GAME LOGIC ---
function selectStock(companyId) {
    selectedStockId = companyId;
    selectedStockTitleEl.textContent = marketData[companyId]?.id || "SELECT A STOCK";
    renderMarket(Object.values(marketData));
}

function processTrade(action) {
    if (isTrading) return;
    if (!selectedStockId || !currentUserId) {
        alert("Please select a stock first.");
        return;
    }
    const quantity = parseInt(quantityInput.value);
    if (isNaN(quantity) || quantity <= 0) {
        alert("Please enter a valid quantity.");
        return;
    }
    isTrading = true;
    buyButton.disabled = true;
    sellButton.disabled = true;
    buyButton.textContent = '...';
    sellButton.textContent = '...';
    const tradeFunction = httpsCallable(functions, 'processTrade');
    tradeFunction({ companyId: selectedStockId, quantity: quantity, action: action })
        .then(result => {
            console.log(result.data.message);
        })
        .catch(error => {
            console.error("Trade failed:", error);
            alert(`Error: ${error.message}`);
        })
        .finally(() => {
            isTrading = false;
            buyButton.disabled = false;
            sellButton.disabled = false;
            buyButton.textContent = 'BUY';
            sellButton.textContent = 'SELL';
            quantityInput.value = '';
        });
}

// --- FIREBASE LISTENERS ---
function setupListeners() {
    if (!currentUserId) return;
    onSnapshot(collection(db, 'market'), (snapshot) => {
        const companies = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderMarket(companies);
        if (currentUserId) {
            // This nested listener ensures portfolio is re-rendered when market prices change
            onSnapshot(doc(db, 'players', currentUserId), (playerDoc) => {
                if(playerDoc.exists()) {
                    renderPortfolio(playerDoc.data());
                }
            });
        }
    });
    // This listener handles direct changes to the player's data (like cash after a trade)
    onSnapshot(doc(db, 'players', currentUserId), (doc) => {
        if(doc.exists()){
            renderPortfolio(doc.data());
        }
    });
    onSnapshot(collection(db, 'news'), (snapshot) => {
        const newsItems = snapshot.docs.map(doc => doc.data());
        renderNews(newsItems);
    });
}

// --- INITIALIZATION ---
onAuthStateChanged(auth, user => {
    if (user) {
        currentUserId = user.uid;
        userIdEl.textContent = currentUserId;
        console.log("User authenticated with ID:", currentUserId);
        setupListeners();
    } else {
        console.log("No user found. Signing in anonymously...");
        signInAnonymously(auth).catch(error => {
            console.error("Anonymous sign-in failed:", error);
        });
    }
});

buyButton.addEventListener('click', () => processTrade('buy'));
sellButton.addEventListener('click', () => processTrade('sell'));
