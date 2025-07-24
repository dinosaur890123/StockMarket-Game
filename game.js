// Wait for the DOM and Firebase services to be ready
document.addEventListener('DOMContentLoaded', () => {
    // Access Firebase services from the window object
    const { auth, db, functions, onAuthStateChanged, doc, onSnapshot, collection, signInAnonymously, httpsCallable } = window.firebaseServices;

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

    /**
     * Renders the list of stocks in the Market Watch panel.
     * @param {Array} companies - An array of company objects from Firestore.
     */
    function renderMarket(companies) {
        marketList.innerHTML = ''; // Clear existing list
        companies.forEach(company => {
            marketData[company.id] = company; // Update local cache
            const stockItem = document.createElement('div');
            stockItem.className = 'stock-item';
            if (company.id === selectedStockId) {
                stockItem.classList.add('selected');
            }
            stockItem.dataset.id = company.id;

            const priceChange = company.currentPrice - (company.priceHistory?.[0] || company.currentPrice);
            const priceClass = priceChange >= 0 ? 'price-up' : 'price-down';

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

    /**
     * Renders the player's portfolio (cash, net worth, shares).
     * @param {Object} playerData - The player's document data from Firestore.
     */
    function renderPortfolio(playerData) {
        if (!playerData) return;

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

    /**
     * Renders the news feed.
     * @param {Array} newsItems - An array of news objects from Firestore.
     */
    function renderNews(newsItems) {
        newsListEl.innerHTML = '';
        newsItems.forEach(item => {
            const li = document.createElement('li');
            li.textContent = `[${item.targetCompany}] ${item.title}`;
            newsListEl.prepend(li); // Add new news to the top
        });
    }

    // --- GAME LOGIC ---

    /**
     * Handles selecting a stock to view its details.
     * @param {string} companyId - The ID of the stock to select.
     */
    function selectStock(companyId) {
        selectedStockId = companyId;
        selectedStockTitleEl.textContent = marketData[companyId]?.id || "SELECT A STOCK";
        renderMarket(Object.values(marketData));
    }

    /**
     * Calls the backend 'processTrade' function.
     * @param {string} action - 'buy' or 'sell'.
     */
    function processTrade(action) {
        if (isTrading) {
            console.log("Trade already in progress.");
            return;
        }
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

        // Get a reference to the callable function
        const tradeFunction = httpsCallable(functions, 'processTrade');

        // Call the function with the required data
        tradeFunction({ companyId: selectedStockId, quantity: quantity, action: action })
            .then((result) => {
                // The function was successful
                console.log(result.data.message);
                // Optional: Show a success message to the user
                // For now, we'll just log it. A better UI would be a temporary notification.
            })
            .catch((error) => {
                // The function failed
                console.error("Trade failed:", error);
                alert(`Error: ${error.message}`); // Show the error from the server
            })
            .finally(() => {
                // Re-enable buttons regardless of success or failure
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
                onSnapshot(doc(db, 'players', currentUserId), (playerDoc) => {
                    renderPortfolio(playerDoc.data());
                });
            }
        });

        onSnapshot(doc(db, 'players', currentUserId), (doc) => {
            renderPortfolio(doc.data());
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
});
