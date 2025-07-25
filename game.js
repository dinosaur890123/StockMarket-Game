import { initializeApp } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js";
import { getAuth, onAuthStateChanged, GoogleAuthProvider, signInWithPopup } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js";
import { getFirestore, doc, onSnapshot, collection, getDoc } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";
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

// **FIX:** Wrap all code in a DOMContentLoaded listener to ensure HTML is ready.
document.addEventListener('DOMContentLoaded', () => {
    // --- STATE MANAGEMENT ---
    let currentUserId = null;
    let selectedStockId = null;
    let marketData = {}; 
    let isTrading = false; 

    // --- DOM ELEMENTS ---
    const loginContainer = document.getElementById('login-container');
    const loginButton = document.getElementById('login-button');
    const appContainer = document.getElementById('app-container');

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
            const priceClass = (company.dailyChange || 0) >= 0 ? 'price-up' : 'price-down';
            const displayName = company.ticker || company.id;
            stockItem.innerHTML = `
                <span>${displayName}</span>
                <span class="stock-price ${priceClass}">
                    $${company.currentPrice.toFixed(2)}
                </span>
            `;
            stockItem.addEventListener('click', () => selectStock(company.id));
            marketList.appendChild(stockItem);
        });
    }

    function renderPortfolio(playerData) {
        if (!playerData || !playerCashEl) {
            if(playerCashEl) playerCashEl.textContent = '$0.00';
            if(playerNetWorthEl) playerNetWorthEl.textContent = '$0.00';
            return;
        }
        playerCashEl.textContent = `$${playerData.cash.toFixed(2)}`;
        sharesListEl.innerHTML = '';
        let totalSharesValue = 0;
        if (playerData.shares) {
            for (const [companyId, quantity] of Object.entries(playerData.shares)) {
                if (quantity > 0 && marketData[companyId]) {
                    const shareItem = document.createElement('p');
                    const company = marketData[companyId];
                    const value = quantity * company.currentPrice;
                    totalSharesValue += value;
                    const displayName = company.ticker || company.id;
                    shareItem.innerHTML = `${quantity} x ${displayName} <span>@ $${value.toFixed(2)}</span>`;
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
        selectedStockTitleEl.textContent = companyId || "SELECT A STOCK";
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
        let latestMarket = null;
        let latestPlayer = null;

        // Helper to render portfolio only when both are available
        function tryRenderPortfolio() {
            if (latestMarket && latestPlayer) {
                renderMarket(latestMarket);
                renderPortfolio(latestPlayer);
            }
        }

        // Market listener
        onSnapshot(collection(db, 'market'), (snapshot) => {
            latestMarket = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            tryRenderPortfolio();
        });

        // Player listener
        const playerDocRef = doc(db, 'players', currentUserId);
        onSnapshot(playerDocRef, (docSnap) => {
            if (docSnap.exists()) {
                latestPlayer = docSnap.data();
                tryRenderPortfolio();
            }
        });

        // News listener
        onSnapshot(collection(db, 'news'), (snapshot) => {
            const newsItems = snapshot.docs.map(doc => doc.data());
            renderNews(newsItems);
        });
    }

    // --- AUTHENTICATION ---
    function signInWithGoogle() {
        const provider = new GoogleAuthProvider();
        signInWithPopup(auth, provider)
            .then((result) => {
                console.log("Signed in with Google!", result.user);
            })
            .catch((error) => {
                console.error("Google sign-in error", error);
            });
    }

    onAuthStateChanged(auth, user => {
        if (user) {
            currentUserId = user.uid;
            if(userIdEl) userIdEl.textContent = user.email;
            console.log("User authenticated:", user.email);
            
            if(loginContainer) loginContainer.style.display = 'none';
            if(appContainer) appContainer.style.display = 'grid';

            setupListeners();
        } else {
            console.log("No user signed in.");
            if(loginContainer) loginContainer.style.display = 'block';
            if(appContainer) appContainer.style.display = 'none';
        }
    });

    if(loginButton) {
        loginButton.addEventListener('click', signInWithGoogle);
    }
});
