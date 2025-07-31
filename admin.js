// Firebase Imports
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js";
import { getFirestore, doc, setDoc, onSnapshot, collection, deleteDoc, getDoc, updateDoc, getDocs, addDoc, serverTimestamp, increment } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";

// config for Firebase
const firebaseConfig = {
    apiKey: "AIzaSyDx1XsUhmqchGCHEiB0dcF8cV6JDCp39D0",
    authDomain: "stock-market-game-f0922.firebaseapp.com",
    projectId: "stock-market-game-f0922",
    storageBucket: "stock-market-game-f0922.appspot.com",
    messagingSenderId: "860554882495",
    appId: "1:860554882495:web:c20583fed1530008b5850a",
    measurementId: "G-3V60XQ69VD"
};
// firebase stuff i had to copy
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();
const appId = 'stock-market-game-v1';

// Admin uid for access

const ADMIN_UID = "XbwQTnFRrTaZ73IVHKjNXz4IaVz1";
const authContainer = document.getElementById('authContainer');
const adminContent = document.getElementById('adminContent');
const unauthorizedMessage = document.getElementById('unauthorizedMessage');
const loginPrompt = document.getElementById('loginPrompt');
const companyList = document.getElementById('companyList');
const companyForm = document.getElementById('companyForm');
const formTitle = document.getElementById('formTitle');
const tickerInput = document.getElementById('ticker');
const adminMessageBox = document.getElementById('adminMessageBox');
const adminMessageText = document.getElementById('adminMessageText');
// Market Controls
const toggleMarketBtn = document.getElementById('toggleMarketBtn');
const marketStatus = document.getElementById('marketStatus');
const tickIntervalInput = document.getElementById('tickInterval');
const setTickIntervalBtn = document.getElementById('setTickIntervalBtn');
// Manual News
const manualNewsForm = document.getElementById('manualNewsForm');
const newsTickerSelect = document.getElementById('newsTicker');
// Player Management
const playerList = document.getElementById('playerList');
let isEditing = false;
let currentCompanies = {};
let marketState = null;

// Authentication
onAuthStateChanged(auth, user => {
    if (loginPrompt) loginPrompt.classList.add('hidden');
    if (user) {
        if (user.uid === ADMIN_UID) {
            adminContent.classList.remove('hidden');
            unauthorizedMessage.classList.add('hidden');
            authContainer.innerHTML = `<div class="flex items-center space-x-4"><p class="text-sm text-yellow-300">Admin: ${user.displayName}</p><button id="signOutButton" class="bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded-md">Sign Out</button></div>`;
            document.getElementById('signOutButton').addEventListener('click', () => signOut(auth));
            // Load admin-only data
            loadPlayerData();
        } else {
            adminContent.classList.add('hidden');
            unauthorizedMessage.classList.remove('hidden');
            authContainer.innerHTML = `<div class="flex items-center space-x-4"><p class="text-sm text-red-500">Not an admin: ${user.displayName}</p><button id="signOutButton" class="bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded-md">Sign Out</button></div>`;
            document.getElementById('signOutButton').addEventListener('click', () => signOut(auth));
        }
    } else {
        adminContent.classList.add('hidden');
        unauthorizedMessage.classList.add('hidden');
        loginPrompt.classList.remove('hidden');
        authContainer.innerHTML = `<button id="signInButton" class="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-md">Sign In as Admin</button>`;
        const signInBtn = document.getElementById('signInButton');
        if (signInBtn) signInBtn.addEventListener('click', () => signInWithPopup(auth, provider));
    }
});

const showAdminMessage = (text, isError = false) => {
    adminMessageText.textContent = text;
    adminMessageBox.classList.remove('hidden');
    adminMessageBox.classList.toggle('bg-red-500', isError);
    adminMessageBox.classList.toggle('bg-green-500', !isError);
    setTimeout(() => adminMessageBox.classList.add('hidden'), 3000);
};

// admin market control
const marketDocRef = doc(db, `artifacts/${appId}/public/market`);
onSnapshot(marketDocRef, (docSnap) => {
    if (docSnap.exists()) {
        marketState = docSnap.data();
        tickIntervalInput.value = marketState.tick_interval_seconds;
        if (marketState.is_running) {
            marketStatus.textContent = 'Running';
            marketStatus.className = 'font-semibold text-green-500';
            toggleMarketBtn.textContent = 'Pause Market';
            toggleMarketBtn.className = 'bg-orange-600 hover:bg-orange-700 text-white font-bold py-2 px-4 rounded-md';
        } else {
            marketStatus.textContent = 'Currently Paused';
            marketStatus.className = 'font-semibold text-red-500';
            toggleMarketBtn.textContent = 'Resume Market';
            toggleMarketBtn.className = 'bg-teal-600 hover:bg-teal-700 text-white font-bold py-2 px-4 rounded-md';
        }
    }
});
toggleMarketBtn.addEventListener('click', () => {
    if (marketState) updateDoc(marketDocRef, { is_running: !marketState.is_running });
});
setTickIntervalBtn.addEventListener('click', () => {
    const newInterval = parseInt(tickIntervalInput.value);
    if (!isNaN(newInterval) && newInterval > 0) {
        updateDoc(marketDocRef, { tick_interval_seconds: newInterval });
        showAdminMessage(`Interval set to ${newInterval} seconds.`);
    } else {
        showAdminMessage('This interval is not valid.', true);
    }
});

// News managment
manualNewsForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const headline = manualNewsForm.newsHeadline.value;
    const ticker = manualNewsForm.newsTicker.value;
    const impact = parseFloat(manualNewsForm.newsImpact.value);
    if (!headline || !ticker || isNaN(impact)) {
        return showAdminMessage("Please fill all news fields to broadcast a news event.", true);
    }
    const newsRef = collection(db, `artifacts/${appId}/public/market/news`);
    await addDoc(newsRef, {
        headline,
        ticker,
        impact_percent: impact,
        sentiment: Math.sign(impact),
        timestamp: serverTimestamp(),
        is_active: true,
        source: 'manual'
    });

    showAdminMessage("Manual news event broadcasted!");
    manualNewsForm.reset();
});

// Player management
async function loadPlayerData() {
    const usersRef = collection(db, `artifacts/${appId}/users`);
    try {
        const userSnapshots = await getDocs(usersRef);
        const players = [];
        for (const userDoc of userSnapshots.docs) {
            const userData = userDoc.data(); // This contains displayName, photoURL, etc.
            const portfolioRef = doc(db, `artifacts/${appId}/users/${userDoc.id}/portfolio/main`);
            const portfolioSnap = await getDoc(portfolioRef);
            if (portfolioSnap.exists()) {
                players.push({ 
                    id: userDoc.id, 
                    portfolio: portfolioSnap.data(),
                    displayName: userData.displayName,
                    photoURL: userData.photoURL
                });
            }
        }
        renderPlayerList(players);
    } catch (error) {
        console.error("Error loading player data:", error);
        playerList.innerHTML = `<p class="text-red-400">Could not load player data. Check Firestore rules.</p>`;
    }
}

function renderPlayerList(players) {
    playerList.innerHTML = '';
    if (players.length === 0) {
        playerList.innerHTML = '<p class="text-gray-400">No players found.</p>';
        return;
    }

    players.forEach(player => {
        const portfolio = player.portfolio;
        let stockValue = 0;
        if (portfolio.stocks) {
            stockValue = Object.keys(portfolio.stocks).reduce((acc, ticker) => {
                return acc + (portfolio.stocks[ticker] * (currentCompanies[ticker]?.price || 0));
            }, 0);
        }
        const netWorth = portfolio.cash + stockValue;

        const playerCard = document.createElement('div');
        playerCard.className = 'bg-gray-700 p-4 rounded-lg';
        playerCard.innerHTML = `
            <div class="flex items-center mb-2">
                <img src="${player.photoURL || 'https://placehold.co/40x40/7f8c8d/ecf0f1?text=?'}" class="w-10 h-10 rounded-full mr-4">
                <div>
                    <p class="font-bold text-white">${player.displayName || 'Anonymous'}</p>
                    <p class="text-xs font-mono text-gray-400" title="${player.id}">${player.id}</p>
                </div>
            </div>
            <div class="flex justify-between items-center mt-2">
                <div>
                    <p class="text-lg font-bold text-white">Net Worth: $${netWorth.toFixed(2)}</p>
                    <p class="text-sm text-green-400">Cash: $${portfolio.cash.toFixed(2)}</p>
                </div>
                <div class="flex space-x-2">
                    <button data-id="${player.id}" class="add-cash-btn bg-green-600 hover:bg-green-700 p-2 rounded text-xs">Award Cash</button>
                    <button data-id="${player.id}" class="reset-btn bg-red-600 hover:bg-red-700 p-2 rounded text-xs">Reset</button>
                </div>
            </div>
        `;
        playerList.appendChild(playerCard);
    });
}

playerList.addEventListener('click', async (e) => {
    const userId = e.target.dataset.id;
    if (!userId) return;

    const portfolioRef = doc(db, `artifacts/${appId}/users/${userId}/portfolio/main`);

    if (e.target.classList.contains('add-cash-btn')) {
        const amountStr = prompt(`Enter amount of cash to award to user ${userId}:`);
        const amount = parseFloat(amountStr);
        if (!isNaN(amount) && amount > 0) {
            await updateDoc(portfolioRef, {
                cash: increment(amount)
            });
            showAdminMessage(`Awarded $${amount} to user.`);
            loadPlayerData(); 
        } else {
            showAdminMessage("Invalid amount.", true);
        }
    }

    if (e.target.classList.contains('reset-btn')) {
        if (confirm(`Are you sure you want to reset user ${userId}'s account? This is irreversible.`)) {
            await setDoc(portfolioRef, {
                cash: 20000,
                stocks: {}
            });
            showAdminMessage(`User ${userId} has been reset.`);
            loadPlayerData();
        }
    }
});


// Company management
const stocksCollectionRef = collection(db, `artifacts/${appId}/public/market/stocks`);
onSnapshot(stocksCollectionRef, (snapshot) => {
    let companies = {};
    newsTickerSelect.innerHTML = '<option value="">Select Target Company</option>';
    snapshot.docs.forEach(doc => {
        companies[doc.id] = doc.data();
        const option = document.createElement('option');
        option.value = doc.id;
        option.textContent = `${doc.data().name} (${doc.id})`;
        newsTickerSelect.appendChild(option);
    });
    currentCompanies = companies;
    renderCompanyList(companies);
    if (auth.currentUser?.uid === ADMIN_UID) loadPlayerData(); // Refresh player net worths when prices change
}, (error) => {
    console.error("Firestore read error:", error);
    showAdminMessage("Could not load company data.", true);
});

function renderCompanyList(companies) {
    const companyListEl = document.getElementById('companyList');
    companyListEl.innerHTML = '';
    if (Object.keys(companies).length === 0) {
        companyListEl.innerHTML = '<p class="text-gray-400">No companies found.</p>';
        return;
    }
    Object.keys(companies).sort().forEach(ticker => {
        const company = companies[ticker];
        const div = document.createElement('div');
        div.className = 'bg-gray-700 p-4 rounded-lg flex justify-between items-center';
        div.innerHTML = `<div><p class="font-bold text-lg text-white">${company.name} (${ticker})</p><p class="text-sm text-gray-400">Sector: ${company.sector} | Price: $${company.price.toFixed(2)} | Vol: ${company.volatility}</p></div><div class="space-x-2"><button data-ticker="${ticker}" class="edit-btn bg-yellow-500 p-2 rounded">Edit</button><button data-ticker="${ticker}" class="delete-btn bg-red-600 p-2 rounded">Delete</button></div>`;
        companyListEl.appendChild(div);
    });
}

companyList.addEventListener('click', async (e) => {
    const ticker = e.target.dataset.ticker;
    if (!ticker) return;
    
    const stockRef = doc(db, `artifacts/${appId}/public/market/stocks`, ticker);

    if (e.target.classList.contains('delete-btn')) {
        if (confirm(`Are you sure you want to delete ${ticker}?`)) {
            await deleteDoc(stockRef);
            showAdminMessage(`${ticker} deleted.`);
        }
    }
    
    if (e.target.classList.contains('edit-btn')) {
        const company = currentCompanies[ticker];
        if (company) {
            formTitle.textContent = `Editing ${ticker}`;
            document.getElementById('ticker').value = ticker;
            document.getElementById('ticker').disabled = true;
            document.getElementById('name').value = company.name;
            document.getElementById('sector').value = company.sector;
            document.getElementById('price').value = company.price;
            document.getElementById('volatility').value = company.volatility;
            document.getElementById('submitButton').textContent = 'Update Company';
            isEditing = true;
            window.scrollTo(0, 0);
        }
    }
});

companyForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const ticker = document.getElementById('ticker').value.toUpperCase();
    const name = document.getElementById('name').value;
    const sector = document.getElementById('sector').value;
    const price = parseFloat(document.getElementById('price').value);
    const volatility = parseFloat(document.getElementById('volatility').value);
    if (!ticker || !name || !sector || isNaN(price) || isNaN(volatility)) return showAdminMessage("Please fill out all fields.", true);
    
    const stockRef = doc(db, `artifacts/${appId}/public/market/stocks`, ticker);
    
    let companyData;
    if (isEditing) {
        const existingData = currentCompanies[ticker];
        companyData = { ...existingData, name, sector, price, volatility };
    } else {
        companyData = { name, sector, price, volatility, history: [price] };
    }
    
    await setDoc(stockRef, companyData, { merge: true });
    showAdminMessage(`Company ${ticker} saved!`);
    clearForm();
});

function clearForm() {
    companyForm.reset();
    document.getElementById('ticker').disabled = false;
    document.getElementById('submitButton').textContent = 'Add Company';
    isEditing = false;
};
document.getElementById('clearButton').addEventListener('click', clearForm);
