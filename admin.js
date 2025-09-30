import { initializeApp } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js";
import { getFirestore, doc, setDoc, onSnapshot, collection, deleteDoc, getDoc, updateDoc, getDocs, addDoc, serverTimestamp, increment, writeBatch, query, orderBy, limit } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";

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
const toggleMarketBtn = document.getElementById('toggleMarketBtn');
const marketStatus = document.getElementById('marketStatus');
const tickIntervalInput = document.getElementById('tickInterval');
const setTickIntervalBtn = document.getElementById('setTickIntervalBtn');
const listingProbabilityInput = document.getElementById('listingProbability');
const headlineTempInput = document.getElementById('headlineTemp');
const headlineMaxTokensInput = document.getElementById('headlineMaxTokens');
const analysisTempInput = document.getElementById('analysisTemp');
const companyTempInput = document.getElementById('companyTemp');
const companyMaxTokensInput = document.getElementById('companyMaxTokens');
const saveAiSettingsBtn = document.getElementById('saveAiSettingsBtn');
const generateAiNewsBtn = document.getElementById('generateAiNewsBtn');
const generateCompanyBtn = document.getElementById('generateCompanyBtn');
const manualNewsForm = document.getElementById('manualNewsForm');
const newsTickerSelect = document.getElementById('newsTicker');
const playerList = document.getElementById('playerList');
const adminNewsFeed = document.getElementById('adminNewsFeed');
const clearNewsBtn = document.getElementById('clearNewsBtn');

let isEditing = false;
let currentCompanies = {};
let marketState = null;

onAuthStateChanged(auth, user => {
    if (loginPrompt) loginPrompt.classList.add('hidden');
    if (user) {
        if (user.uid === ADMIN_UID) {
            adminContent.classList.remove('hidden');
            unauthorizedMessage.classList.add('hidden');
            authContainer.innerHTML = `<div class="flex items-center space-x-4"><p class="text-sm text-yellow-300">Admin: ${user.displayName}</p><button id="signOutButton" class="bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded-md">Sign Out</button></div>`;
            document.getElementById('signOutButton').addEventListener('click', () => signOut(auth));
            loadPlayerData();
            subscribeToAdminNewsFeed();
            subscribeToPendingItems();
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

const marketDocRef = doc(db, `artifacts/${appId}/public/market`);
onSnapshot(marketDocRef, (docSnap) => {
    if (docSnap.exists()) {
        marketState = docSnap.data();
        tickIntervalInput.value = marketState.tick_interval_seconds;
        // load AI settings if present
        const ai = marketState.ai_settings || {};
        listingProbabilityInput.value = Math.round((ai.listing_probability || 0.1) * 100);
        headlineTempInput.value = ai.headline_temperature ?? 0.9;
        headlineMaxTokensInput.value = ai.headline_max_tokens ?? 256;
        analysisTempInput.value = ai.analysis_temperature ?? 0;
        companyTempInput.value = ai.company_temperature ?? 0.8;
        companyMaxTokensInput.value = ai.company_max_tokens ?? 200;
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
        showAdminMessage('Invalid interval.', true);
    }
});

saveAiSettingsBtn.addEventListener('click', async () => {
    if (!marketState) return showAdminMessage('Market settings doc not available.', true);
    const aiSettings = {
        listing_probability: Math.max(0, Math.min(100, parseFloat(listingProbabilityInput.value || '10'))) / 100,
        headline_temperature: parseFloat(headlineTempInput.value) || 0.9,
        headline_max_tokens: parseInt(headlineMaxTokensInput.value) || 256,
        analysis_temperature: parseFloat(analysisTempInput.value) || 0,
        company_temperature: parseFloat(companyTempInput.value) || 0.8,
        company_max_tokens: parseInt(companyMaxTokensInput.value) || 200,
    };
    try {
        await updateDoc(marketDocRef, { ai_settings: aiSettings });
        showAdminMessage('AI settings saved.');
    } catch (err) {
        console.error('Failed to save AI settings', err);
        showAdminMessage('Failed to save AI settings.', true);
    }
});

generateAiNewsBtn.addEventListener('click', async () => {
    if (!confirm('Generate AI news now? This will request the server to generate and broadcast a new headline.')) return;
    try {
        const actionsRef = collection(db, `artifacts/${appId}/admin_actions`);
        await addDoc(actionsRef, { type: 'generate_news', requested_by: auth.currentUser?.uid || null, timestamp: serverTimestamp() });
        showAdminMessage('AI news generation requested.');
    } catch (err) {
        console.error('Failed to request AI news generation', err);
        showAdminMessage('Failed to request AI news generation.', true);
    }
});

generateCompanyBtn.addEventListener('click', async () => {
    if (!confirm('Generate new company now? This will request the server to create a new company listing.')) return;
    try {
        const actionsRef = collection(db, `artifacts/${appId}/admin_actions`);
        await addDoc(actionsRef, { type: 'generate_company', requested_by: auth.currentUser?.uid || null, timestamp: serverTimestamp() });
        showAdminMessage('AI company generation requested.');
    } catch (err) {
        console.error('Failed to request AI company generation', err);
        showAdminMessage('Failed to request AI company generation.', true);
    }
});

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

async function loadPlayerData() {
    const usersRef = collection(db, `artifacts/${appId}/users`);
    try {
        const userSnapshots = await getDocs(usersRef);
        const players = [];
        for (const userDoc of userSnapshots.docs) {
            const userData = userDoc.data();
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
            await updateDoc(portfolioRef, { cash: increment(amount) });
            showAdminMessage(`Awarded $${amount} to user.`);
            loadPlayerData();
        } else {
            showAdminMessage("Invalid amount.", true);
        }
    }
    if (e.target.classList.contains('reset-btn')) {
        if (confirm(`Are you sure you want to reset user ${userId}'s account? This is irreversible.`)) {
            await setDoc(portfolioRef, { cash: 20000, stocks: {} });
            showAdminMessage(`User ${userId} has been reset.`);
            loadPlayerData();
        }
    }
});

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
        div.innerHTML = `
            <div>
                <p class="font-bold text-lg text-white">${company.name} (${ticker})</p>
                <p class="text-sm text-gray-400">
                    Sector: ${company.sector} | Price: $${company.price.toFixed(2)} | Vol: ${company.volatility} | Div: $${(company.dividend || 0).toFixed(2)}
                </p>
            </div>
            <div class="space-x-2">
                <button data-ticker="${ticker}" class="edit-btn bg-yellow-500 p-2 rounded">Edit</button>
                <button data-ticker="${ticker}" class="delete-btn bg-red-600 p-2 rounded">Delete</button>
            </div>`;
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
            document.getElementById('dividend').value = company.dividend || 0;
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
    const dividend = parseFloat(document.getElementById('dividend').value) || 0;
    if (!ticker || !name || !sector || isNaN(price) || isNaN(volatility)) return showAdminMessage("Please fill out all fields.", true);
    const stockRef = doc(db, `artifacts/${appId}/public/market/stocks`, ticker);
    let companyData;
    if (isEditing) {
        const existingData = currentCompanies[ticker];
        companyData = { ...existingData, name, sector, price, volatility, dividend };
    } else {
        companyData = { name, sector, price, volatility, dividend, history: [price] };
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

function subscribeToAdminNewsFeed() {
    const newsRef = collection(db, `artifacts/${appId}/public/market/news`);
    const q = query(newsRef, orderBy("timestamp", "desc"), limit(20));
    onSnapshot(q, (snapshot) => {
        adminNewsFeed.innerHTML = '';
        if (snapshot.empty) {
            adminNewsFeed.innerHTML = '<p class="text-gray-400">No news found.</p>';
            return;
        }
        snapshot.docs.forEach(doc => {
            const news = doc.data();
            const div = document.createElement('div');
            const sentimentColor = news.sentiment > 0 ? 'border-green-500' : 'border-red-500';
            div.className = `border-l-4 p-2 ${sentimentColor} bg-gray-700 rounded`;
            div.innerHTML = `<p class="text-sm text-gray-300">${news.headline}</p><p class="text-xs text-gray-500">${new Date(news.timestamp.seconds * 1000).toLocaleString()}</p>`;
            adminNewsFeed.appendChild(div);
        });
    });
}

// Subscribe to pending AI news and pending company listings for preview/approval
function subscribeToPendingItems() {
    const pendingNewsRef = collection(db, `artifacts/${appId}/pending/market/news`);
    onSnapshot(pendingNewsRef, (snapshot) => {
        const container = document.getElementById('pendingNewsFeed');
        container.innerHTML = '';
        if (snapshot.empty) {
            container.innerHTML = '<p class="text-gray-400">No pending AI news.</p>';
            return;
        }
        snapshot.docs.forEach(doc => {
            const item = doc.data();
            const div = document.createElement('div');
            div.className = 'bg-gray-800 p-3 rounded flex justify-between items-start';
            div.innerHTML = `<div><p class="text-sm text-gray-300">${item.headline}</p><p class="text-xs text-gray-500">Target: ${item.ticker || 'N/A'}</p></div><div class="space-x-2"><button data-id="${doc.id}" class="approve-news-btn bg-green-600 p-2 rounded text-xs">Approve</button><button data-id="${doc.id}" class="reject-news-btn bg-red-600 p-2 rounded text-xs">Reject</button></div>`;
            container.appendChild(div);
        });
    });

    const pendingCompaniesRef = collection(db, `artifacts/${appId}/pending/market/companies`);
    const companiesContainer = document.createElement('div');
    companiesContainer.id = 'pendingCompaniesFeed';
    companiesContainer.className = 'space-y-3 max-h-48 overflow-y-auto bg-gray-800 p-3 rounded mt-3';
    document.getElementById('newsManagement').appendChild(companiesContainer);
    onSnapshot(pendingCompaniesRef, (snapshot) => {
        companiesContainer.innerHTML = '<h4 class="text-sm font-semibold text-white">Pending Companies</h4>';
        if (snapshot.empty) {
            companiesContainer.innerHTML += '<p class="text-gray-400">No pending companies.</p>';
            return;
        }
        snapshot.docs.forEach(doc => {
            const c = doc.data();
            const div = document.createElement('div');
            div.className = 'bg-gray-700 p-3 rounded flex justify-between items-start';
            div.innerHTML = `<div><p class="font-bold text-white">${c.name} (${c.ticker})</p><p class="text-sm text-gray-400">Sector: ${c.sector} | Price: $${(c.price||0).toFixed(2)} | Vol: ${c.volatility} | Div: $${(c.dividend||0).toFixed(2)}</p></div><div class="space-x-2"><button data-id="${doc.id}" class="approve-company-btn bg-green-600 p-2 rounded text-xs">Approve</button><button data-id="${doc.id}" class="reject-company-btn bg-red-600 p-2 rounded text-xs">Reject</button></div>`;
            companiesContainer.appendChild(div);
        });
    });
}

// Handle approve/reject clicks (event delegation)
document.addEventListener('click', async (e) => {
    if (e.target.classList.contains('approve-news-btn')) {
        const id = e.target.dataset.id;
        const pendingRef = doc(db, `artifacts/${appId}/pending/market/news`, id);
        const snap = await getDoc(pendingRef);
        if (!snap.exists()) return showAdminMessage('Pending item not found.', true);
        const item = snap.data();
        // publish to news
        await addDoc(collection(db, `artifacts/${appId}/public/market/news`), { ...item, timestamp: serverTimestamp(), is_active: true, source: 'ai' });
        await deleteDoc(pendingRef);
        showAdminMessage('News approved and published.');
    }
    if (e.target.classList.contains('reject-news-btn')) {
        const id = e.target.dataset.id;
        await deleteDoc(doc(db, `artifacts/${appId}/pending/market/news`, id));
        showAdminMessage('News rejected and removed.');
    }
    if (e.target.classList.contains('approve-company-btn')) {
        const id = e.target.dataset.id;
        const pendingRef = doc(db, `artifacts/${appId}/pending/market/companies`, id);
        const snap = await getDoc(pendingRef);
        if (!snap.exists()) return showAdminMessage('Pending company not found.', true);
        const c = snap.data();
        const stockRef = doc(db, `artifacts/${appId}/public/market/stocks`, c.ticker);
        await setDoc(stockRef, { name: c.name, sector: c.sector, price: c.price, volatility: c.volatility, dividend: c.dividend, created_at: serverTimestamp(), last_updated: serverTimestamp(), history: [c.price] });
        await deleteDoc(pendingRef);
        showAdminMessage('Company approved and listed.');
    }
    if (e.target.classList.contains('reject-company-btn')) {
        const id = e.target.dataset.id;
        await deleteDoc(doc(db, `artifacts/${appId}/pending/market/companies`, id));
        showAdminMessage('Company rejected and removed.');
    }
});

clearNewsBtn.addEventListener('click', async () => {
    if (!confirm("Are you sure you want to delete ALL news articles? This cannot be undone.")) {
        return;
    }
    const newsRef = collection(db, `artifacts/${appId}/public/market/news`);
    const snapshot = await getDocs(newsRef);
    if (snapshot.empty) {
        showAdminMessage("There is no news to clear.");
        return;
    }
    const batch = writeBatch(db);
    snapshot.docs.forEach(doc => {
        batch.delete(doc.ref);
    });
    await batch.commit();
    showAdminMessage("All news has been cleared.");
});
