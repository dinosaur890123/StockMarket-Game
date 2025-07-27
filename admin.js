// Firebase Imports
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js";
import { getFirestore, doc, setDoc, onSnapshot, collection, deleteDoc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";

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
const submitButton = document.getElementById('submitButton');
const clearButton = document.getElementById('clearButton');
const adminMessageBox = document.getElementById('adminMessageBox');
const adminMessageText = document.getElementById('adminMessageText');
// Market Controls
const toggleMarketBtn = document.getElementById('toggleMarketBtn');
const marketStatus = document.getElementById('marketStatus');
const tickIntervalInput = document.getElementById('tickInterval');
const setTickIntervalBtn = document.getElementById('setTickIntervalBtn');

// --- State ---
let isEditing = false;
let currentCompanies = {};
let marketState = null;

// --- Authentication ---
onAuthStateChanged(auth, user => {
    if (loginPrompt) loginPrompt.classList.add('hidden');
    if (user) {
        if (user.uid === ADMIN_UID) {
            adminContent.classList.remove('hidden');
            unauthorizedMessage.classList.add('hidden');
            authContainer.innerHTML = `<div class="flex items-center space-x-4"><p class="text-sm text-yellow-300">Admin: ${user.displayName}</p><button id="signOutButton" class="bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded-md">Sign Out</button></div>`;
            document.getElementById('signOutButton').addEventListener('click', () => signOut(auth));
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

// --- UI Helpers ---
const showAdminMessage = (text, isError = false) => {
    adminMessageText.textContent = text;
    adminMessageBox.classList.remove('hidden');
    adminMessageBox.classList.toggle('bg-red-500', isError);
    adminMessageBox.classList.toggle('bg-green-500', !isError);
    setTimeout(() => adminMessageBox.classList.add('hidden'), 3000);
};

// --- Market State Control (Corrected Path) ---
const marketDocRef = doc(db, `artifacts/${appId}/public/market`);

onSnapshot(marketDocRef, (docSnap) => {
    if (docSnap.exists()) {
        marketState = docSnap.data();
        updateMarketControlsUI();
    } else {
        console.log("Market document not found. It will be created when a player logs in.");
    }
});

function updateMarketControlsUI() {
    if (!marketState) return;

    if (marketState.is_running) {
        marketStatus.textContent = 'Running';
        marketStatus.className = 'font-semibold text-green-500';
        toggleMarketBtn.textContent = 'Pause Market';
        toggleMarketBtn.classList.remove('bg-teal-600', 'hover:bg-teal-700');
        toggleMarketBtn.classList.add('bg-orange-600', 'hover:bg-orange-700');
    } else {
        marketStatus.textContent = 'Paused';
        marketStatus.className = 'font-semibold text-red-500';
        toggleMarketBtn.textContent = 'Resume Market';
        toggleMarketBtn.classList.remove('bg-orange-600', 'hover:bg-orange-700');
        toggleMarketBtn.classList.add('bg-teal-600', 'hover:bg-teal-700');
    }
    tickIntervalInput.value = marketState.tick_interval_seconds;
}

toggleMarketBtn.addEventListener('click', () => {
    if (marketState) {
        updateDoc(marketDocRef, { is_running: !marketState.is_running });
    }
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


// --- Firestore Company Management (Corrected Path) ---
const stocksCollectionRef = collection(db, `artifacts/${appId}/public/market/stocks`);

const renderCompanyList = (companies) => {
    companyList.innerHTML = '';
    if (Object.keys(companies).length === 0) {
        companyList.innerHTML = '<p class="text-gray-400">No companies found.</p>';
        return;
    }
    Object.keys(companies).sort().forEach(ticker => {
        const company = companies[ticker];
        const div = document.createElement('div');
        div.className = 'bg-gray-700 p-4 rounded-lg flex justify-between items-center';
        div.innerHTML = `<div><p class="font-bold text-lg text-white">${company.name} (${ticker})</p><p class="text-sm text-gray-400">Sector: ${company.sector} | Price: $${company.price.toFixed(2)} | Vol: ${company.volatility}</p></div><div class="space-x-2"><button data-ticker="${ticker}" class="edit-btn bg-yellow-500 p-2 rounded">Edit</button><button data-ticker="${ticker}" class="delete-btn bg-red-600 p-2 rounded">Delete</button></div>`;
        companyList.appendChild(div);
    });
};


onSnapshot(stocksCollectionRef, (snapshot) => {
    let companies = {};
    snapshot.docs.forEach(doc => { companies[doc.id] = doc.data(); });
    currentCompanies = companies;
    renderCompanyList(companies);
}, (error) => {
    console.error("Firestore read error:", error);
    showAdminMessage("Could not load company data. Check Firestore rules.", true);
});

// --- Form Handling (Corrected Path) ---
companyForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const ticker = companyForm.ticker.value.toUpperCase();
    const name = companyForm.name.value;
    const sector = companyForm.sector.value;
    const price = parseFloat(companyForm.price.value);
    const volatility = parseFloat(companyForm.volatility.value);
    if (!ticker || !name || !sector || isNaN(price) || isNaN(volatility)) return showAdminMessage("Please fill out all fields.", true);
    
    const stockRef = doc(db, `artifacts/${appId}/public/market/stocks`, ticker);
    
    try {
        let companyData;
        if (isEditing) {
            const existingData = currentCompanies[ticker];
            companyData = { ...existingData, name, sector, price, volatility };
        } else {
            companyData = { name, sector, price, volatility, history: [price] };
        }
        
        await setDoc(stockRef, companyData, { merge: true });
        showAdminMessage(`Company ${ticker} saved!`, false);
        clearForm();
    } catch (error) {
        console.error("Error saving company:", error);
        showAdminMessage("Failed to save company. Check Firestore rules.", true);
    }
});

companyList.addEventListener('click', async (e) => {
    const ticker = e.target.dataset.ticker;
    if (!ticker) return;
    
    // Corrected Path for delete/edit
    const stockRef = doc(db, `artifacts/${appId}/public/market/stocks`, ticker);

    if (e.target.classList.contains('delete-btn')) {
        if (confirm(`Are you sure you want to delete ${ticker}? This action cannot be undone.`)) {
            try {
                await deleteDoc(stockRef);
                showAdminMessage(`${ticker} deleted successfully.`);
            } catch (error) {
                console.error("Error deleting company:", error);
                showAdminMessage(`Failed to delete ${ticker}.`, true);
            }
        }
    }
    
    if (e.target.classList.contains('edit-btn')) {
        const company = currentCompanies[ticker];
        if (company) {
            formTitle.textContent = `Editing ${ticker}`;
            tickerInput.value = ticker;
            tickerInput.disabled = true;
            companyForm.name.value = company.name;
            companyForm.sector.value = company.sector;
            companyForm.price.value = company.price;
            companyForm.volatility.value = company.volatility;
            submitButton.textContent = 'Update Company';
            isEditing = true;
            window.scrollTo(0, 0);
        }
    }
});

const clearForm = () => {
    companyForm.reset();
    formTitle.textContent = 'Add New Company';
    tickerInput.disabled = false;
    submitButton.textContent = 'Add Company';
    isEditing = false;
};
clearButton.addEventListener('click', clearForm);
