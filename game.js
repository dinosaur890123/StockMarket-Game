document.addEventListener('DOMContentLoaded', () => {
    const { auth, db, onAuthStateChanged, doc, onSnapshot, collection, signInAnonymously } = window.firebaseServices;
    let currentUserId = null;
    let selectedStockId = null;
    let marketData = {};

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
                    ₵${company.currentPrice.toFixed(2)}
                </span>
            `;
            stockItem.addEventListener('click', () => selectStock(company.id));
            marketList.appendChild(stockItem);
        });
    }
    function renderPortfolio(playerData) {
        if (!playerData) return;

        playerCashEl.textContent = `₵${playerData.cash.toFixed(2)}`;
        sharesListEl.innerHTML = '';
        let totalSharesValue = 0;

        if (playerData.shares) {
            for (const [companyId, quantity] of Object.entries(playerData.shares)) {
                if (quantity > 0) {
                    const shareItem = document.createElement('p');
                    const companyPrice = marketData[companyId]?.currentPrice || 0;
                    const value = quantity * companyPrice;
                    totalSharesValue += value;
                    shareItem.innerHTML = `${quantity} x ${companyId} <span>@ ₵${value.toFixed(2)}</span>`;
                    sharesListEl.appendChild(shareItem);
                }
            }
        }
        
        const netWorth = playerData.cash + totalSharesValue;
        playerNetWorthEl.textContent = `₵${netWorth.toFixed(2)}`;
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
        // Re-render market to show selection highlight
        renderMarket(Object.values(marketData));
        // TODO: In the future, render the chart for this stock
    }

    /**
     * Placeholder function for buying shares.
     */
    function buyShares() {
        if (!selectedStockId || !currentUserId) {
            alert("Please select a stock first.");
            return;
        }
        const quantity = parseInt(quantityInput.value);
        if (isNaN(quantity) || quantity <= 0) {
            alert("Please enter a valid quantity.");
            return;
        }

        // TODO: This is where you would call a Firebase Function
        console.log(`Attempting to BUY ${quantity} of ${selectedStockId}`);
        alert("Trade functionality is not yet implemented. This will call a Firebase Function.");
    }

    /**
     * Placeholder function for selling shares.
     */
    function sellShares() {
        if (!selectedStockId || !currentUserId) {
            alert("Please select a stock first.");
            return;
        }
        const quantity = parseInt(quantityInput.value);
        if (isNaN(quantity) || quantity <= 0) {
            alert("Please enter a valid quantity.");
            return;
        }
        
        // TODO: This is where you would call a Firebase Function
        console.log(`Attempting to SELL ${quantity} of ${selectedStockId}`);
        alert("Trade functionality is not yet implemented. This will call a Firebase Function.");
    }


    // --- FIREBASE LISTENERS ---

    /**
     * Sets up all the real-time listeners to Firestore.
     */
    function setupListeners() {
        if (!currentUserId) return;

        // Listen for changes in the market data
        onSnapshot(collection(db, 'market'), (snapshot) => {
            const companies = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            renderMarket(companies);
            // Re-render portfolio if a stock price changes
            onSnapshot(doc(db, 'players', currentUserId), (playerDoc) => {
                renderPortfolio(playerDoc.data());
            });
        });

        // Listen for changes to the player's own data
        onSnapshot(doc(db, 'players', currentUserId), (doc) => {
            renderPortfolio(doc.data());
        });

        // Listen for new news items
        onSnapshot(collection(db, 'news'), (snapshot) => {
            const newsItems = snapshot.docs.map(doc => doc.data());
            renderNews(newsItems);
        });
    }

    // --- INITIALIZATION ---

    // Listen for authentication state changes
    onAuthStateChanged(auth, user => {
        if (user) {
            // User is signed in.
            currentUserId = user.uid;
            userIdEl.textContent = currentUserId;
            console.log("User authenticated with ID:", currentUserId);
            setupListeners();
        } else {
            // User is signed out. Sign them in anonymously.
            console.log("No user found. Signing in anonymously...");
            signInAnonymously(auth).catch(error => {
                console.error("Anonymous sign-in failed:", error);
            });
        }
    });

    // Add event listeners for trade buttons
    buyButton.addEventListener('click', buyShares);
    sellButton.addEventListener('click', sellShares);
});
