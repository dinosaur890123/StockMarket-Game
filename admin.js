// Firebase Imports
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js";
import { getFirestore, doc, setDoc, onSnapshot, collection, deleteDoc, getDoc, updateDoc, getDocs, addDoc, serverTimestamp, increment } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";

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

// --- Admin UID ---
const ADMIN_UID = "XbwQTnFRrTaZ73IVHKjNXz4IaVz1";

// --- DOM References ---
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
const toggleMarketBtn = document.getElementById('toggleMarketBtn');
const marketStatus = document.getElementById('marketStatus');
const tickIntervalInput = document.getElementById('tickInterval');
const setTickIntervalBtn = document.getElementById('setTickIntervalBtn');
const manualNewsForm = document.getElementById('manualNewsForm');
const newsTickerSelect = document.getElementById('newsTicker');
const playerList = document.getElementById('playerList');

// --- State ---
let isEditing = false;
let currentCompanies = {};
let marketState = null;

// --- Authentication ---
onAuthStateChanged(auth, user => {
    loginPrompt.classList.add('hidden');
    if (user) {
        if (user.uid === ADMIN_UID) {
            adminContent.classList.remove('hidden');
            unauthorizedMessage.classList.add('hidden');
            authContainer.innerHTML = `
                <div class="auth-info">
                    <p>Admin: ${user.displayName}</p>
                    <button id="signOutButton" class="danger">Sign Out</button>
                </div>`;
            document.getElementById('signOutButton').addEventListener('click', () => signOut(auth));
            loadPlayerData();
        } else {
            adminContent.classList.add('hidden');
            unauthorizedMessage.classList.remove('hidden');
            authContainer.innerHTML = `
                <div class="auth-info">
                    <p>Not an admin: ${user.displayName}</p>
                    <button id="signOutButton" class="danger">Sign Out</button>
                </div>`;
            document.getElementById('signOutButton').addEventListener('click', () => signOut(auth));
        }
    } else {
        adminContent.classList.add('hidden');
        unauthorizedMessage.classList.add('hidden');
        loginPrompt.classList.remove('hidden');
        authContainer.innerHTML = `<button id="signInButton" class="primary">Sign In as Admin</button>`;
        document.getElementById('signInButton').addEventListener('click', () => signInWithPopup(auth, provider));
    }
});

// --- UI Helpers ---
const showAdminMessage = (text, isError = false) => {
    adminMessageText.textContent = text;
    adminMessageBox.className = isError ? 'error' : 'success';
    adminMessageBox.classList.remove('hidden');
    setTimeout(() => adminMessageBox.classList.add('hidden'), 3000);
};

// --- Market State Control ---
const marketDocRef = doc(db, `artifacts/${appId}/public/market`);
onSnapshot(marketDocRef, (docSnap) => {
    if (docSnap.exists()) {
        marketState = docSnap.data();
        tickIntervalInput.value = marketState.tick_interval_seconds;
        if (marketState.is_running) {
            marketStatus.textContent = 'Running';
            marketStatus.style.color = 'var(--green)';
            toggleMarketBtn.textContent = 'Pause Market';
        } else {
            marketStatus.textContent = 'Paused';
            marketStatus.style.color = 'var(--red)';
            toggleMarketBtn.textContent = 'Resume Market';
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
        showAdminMessage('Invalid interval.', true);
    }
});

// --- Manual News Event ---
manualNewsForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const headline = manualNewsForm.newsHeadline.value;
    const ticker = manualNewsForm.newsTicker.value;
    const impact = parseFloat(manualNewsForm.newsImpact.value);
    if (!headline || !ticker || isNaN(impact)) return showAdminMessage("Please fill all news fields.", true);
    const newsRef = collection(db, `artifacts/${appId}/public/market/news`);
    await addDoc(newsRef, {
        headline, ticker, impact_percent: impact, sentiment: Math.sign(impact),
        timestamp: serverTimestamp(), is_active: true, source: 'manual'
    });
    showAdminMessage("Manual news event broadcasted!");
    manualNewsForm.reset();
});

// --- Player Management ---
async function loadPlayerData() {
    const usersRef = collection(db, `artifacts/${appId}/users`);
    try {
        const userSnapshots = await getDocs(usersRef);
        const players = [];
        for (const userDoc of userSnapshots.docs) {
            const portfolioRef = doc(db, `artifacts/${appId}/users/${userDoc.id}/portfolio/main`);
            const portfolioSnap = await getDoc(portfolioRef);
            if (portfolioSnap.exists()) {
                players.push({ id: userDoc.id, portfolio: portfolioSnap.data() });
            }
        }
        renderPlayerList(players);
    } catch (error) {
        console.error("Error loading player data:", error);
        playerList.innerHTML = `<p style="color: var(--red);">Could not load player data. Check Firestore rules.</p>`;
    }
}

function renderPlayerList(players) {
    playerList.innerHTML = '';
    if (players.length === 0) {
        playerList.innerHTML = '<p>No players found.</p>';
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
        playerCard.className = 'player-card';
        playerCard.innerHTML = `
            <div>
                <p title="${player.id}" style="font-family: monospace; font-size: 0.8rem;">${player.id.substring(0, 12)}...</p>
                <p style="font-weight: 700;">Net Worth: $${netWorth.toFixed(2)}</p>
                <p style="color: var(--green);">Cash: $${portfolio.cash.toFixed(2)}</p>
            </div>
            <div class="button-group">
                <button data-id="${player.id}" class="add-cash-btn success">Award Cash</button>
                <button data-id="${player.id}" class="reset-btn danger">Reset</button>
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
            await updateDoc(portfolioRef, { cash: increment(amount) });
            showAdminMessage(`Awarded $${amount} to user.`);
            loadPlayerData();
        } else {
            showAdminMessage("Invalid amount.", true);
        }
    }
    if (e.target.classList.contains('reset-btn')) {
        if (confirm(`Are you sure you want to reset user ${userId}'s account?`)) {
            await setDoc(portfolioRef, { cash: 20000, stocks: {} });
            showAdminMessage(`User ${userId} has been reset.`);
            loadPlayerData();
        }
    }
});

// --- Company Management ---
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
    if (auth.currentUser?.uid === ADMIN_UID) loadPlayerData();
}, (error) => {
    console.error("Firestore read error:", error);
    showAdminMessage("Could not load company data.", true);
});

function renderCompanyList(companies) {
    companyList.innerHTML = '';
    if (Object.keys(companies).length === 0) {
        companyList.innerHTML = '<p>No companies found.</p>';
        return;
    }
    Object.keys(companies).sort().forEach(ticker => {
        const company = companies[ticker];
        const div = document.createElement('div');
        div.className = 'company-card';
        div.innerHTML = `
            <div>
                <p style="font-weight: 700;">${company.name} (${ticker})</p>
                <p style="color: var(--text-muted);">Sector: ${company.sector} | Price: $${company.price.toFixed(2)} | Vol: ${company.volatility}</p>
            </div>
            <div class="button-group">
                <button data-ticker="${ticker}" class="edit-btn warning">Edit</button>
                <button data-ticker="${ticker}" class="delete-btn danger">Delete</button>
            </div>
        `;
        companyList.appendChild(div);
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
            tickerInput.value = ticker;
            tickerInput.disabled = true;
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
    const ticker = tickerInput.value.toUpperCase();
    const name = document.getElementById('name').value;
    const sector = document.getElementById('sector').value;
    const price = parseFloat(document.getElementById('price').value);
    const volatility = parseFloat(document.getElementById('volatility').value);
    if (!ticker || !name || !sector || isNaN(price) || isNaN(volatility)) return showAdminMessage("Please fill out all fields.", true);
    const stockRef = doc(db, `artifacts/${appId}/public/market/stocks`, ticker);
    let companyData;
    if (isEditing) {
        companyData = { ...currentCompanies[ticker], name, sector, price, volatility };
    } else {
        companyData = { name, sector, price, volatility, history: [price] };
    }
    await setDoc(stockRef, companyData, { merge: true });
    showAdminMessage(`Company ${ticker} saved!`);
    clearForm();
});

function clearForm() {
    companyForm.reset();
    tickerInput.disabled = false;
    document.getElementById('submitButton').textContent = 'Add Company';
    isEditing = false;
};
document.getElementById('clearButton').addEventListener('click', clearForm);
