// Firebase Imports
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js";
import { getFirestore, doc, setDoc, onSnapshot, collection, deleteDoc } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";

// --- Your web app's Firebase configuration ---
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

// --- !! IMPORTANT SECURITY CONFIGURATION !! ---
const ADMIN_UID = "OxisixExmlY7X5rwbIGa8Zl5Ypn2";

// --- DOM Element References ---
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

// --- State ---
let isEditing = false;

// --- Authentication Logic ---
onAuthStateChanged(auth, user => {
    if (loginPrompt) loginPrompt.classList.add('hidden');

    if (user) {
        console.log("Auth state changed: User is signed in.", user.uid);
        // User is signed in. Check if they are the admin.
        if (user.uid === ADMIN_UID) {
            console.log("User is ADMIN. Granting access.");
            // User IS the admin. Show the admin panel.
            adminContent.classList.remove('hidden');
            unauthorizedMessage.classList.add('hidden');
            authContainer.innerHTML = `
                <div class="flex items-center space-x-4">
                    <p class="text-sm font-medium text-yellow-300">Admin: ${user.displayName}</p>
                    <button id="signOutButton" class="bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded-md">Sign Out</button>
                </div>
            `;
            document.getElementById('signOutButton').addEventListener('click', () => signOut(auth));
        } else {
            console.warn("User is NOT an admin. Denying access.");
            // User is NOT the admin. Show access denied message.
            adminContent.classList.add('hidden');
            unauthorizedMessage.classList.remove('hidden');
            authContainer.innerHTML = `
                 <div class="flex items-center space-x-4">
                    <p class="text-sm text-red-500">Not an admin: ${user.displayName}</p>
                    <button id="signOutButton" class="bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded-md">Sign Out</button>
                </div>
            `;
            document.getElementById('signOutButton').addEventListener('click', () => signOut(auth));
        }
    } else {
        console.log("Auth state changed: User is signed out.");
        // User is signed out. Hide everything and show the sign-in button.
        adminContent.classList.add('hidden');
        unauthorizedMessage.classList.add('hidden');
        authContainer.innerHTML = `<button id="signInButton" class="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-md">Sign In as Admin</button>`;
        const signInButton = document.getElementById('signInButton');
        if (signInButton) {
            signInButton.addEventListener('click', () => signInWithPopup(auth, provider));
        }
    }
});


// --- Helper Functions ---
const showAdminMessage = (text, isError = false) => {
    adminMessageText.textContent = text;
    adminMessageBox.classList.remove('hidden');
    adminMessageBox.classList.toggle('bg-red-500', isError);
    adminMessageBox.classList.toggle('bg-green-500', !isError);
    setTimeout(() => adminMessageBox.classList.add('hidden'), 3000);
};

// --- Firestore Logic ---
const renderCompanyList = (companies) => {
    companyList.innerHTML = '';
    if (Object.keys(companies).length === 0) {
        companyList.innerHTML = '<p class="text-gray-400">No companies found in the database.</p>';
        return;
    }
    const sortedTickers = Object.keys(companies).sort();
    sortedTickers.forEach(ticker => {
        const company = companies[ticker];
        const companyDiv = document.createElement('div');
        companyDiv.className = 'bg-gray-700 p-4 rounded-lg flex justify-between items-center';
        companyDiv.innerHTML = `
            <div>
                <p class="font-bold text-lg text-white">${company.name} (${ticker})</p>
                <p class="text-sm text-gray-400">Sector: ${company.sector} | Price: $${company.price.toFixed(2)}</p>
            </div>
            <div class="space-x-2">
                <button data-ticker="${ticker}" class="edit-btn bg-yellow-500 hover:bg-yellow-600 text-white font-bold py-1 px-3 rounded">Edit</button>
                <button data-ticker="${ticker}" class="delete-btn bg-red-600 hover:bg-red-700 text-white font-bold py-1 px-3 rounded">Delete</button>
            </div>
        `;
        companyList.appendChild(companyDiv);
    });
};

const appId = 'stock-market-game-v1';
const stocksCollectionRef = collection(db, `artifacts/${appId}/public/data/stocks`);
onSnapshot(stocksCollectionRef, (snapshot) => {
    let companies = {};
    snapshot.docs.forEach(doc => {
        companies[doc.id] = doc.data();
    });
    renderCompanyList(companies);
}, (error) => {
    console.error("Firestore read error:", error);
    showAdminMessage("Could not load company data. Check Firestore rules.", true);
});

// --- Form Handling & Event Listeners ---
companyForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const ticker = companyForm.ticker.value.toUpperCase();
    const name = companyForm.name.value;
    const sector = companyForm.sector.value;
    const price = parseFloat(companyForm.price.value);
    const volatility = parseFloat(companyForm.volatility.value || 1.0);

    if (!ticker || !name || !sector || isNaN(price)) {
        showAdminMessage("Please fill out all fields correctly.", true);
        return;
    }

    const companyData = { name, sector, price, volatility, history: [price] };
    const stockRef = doc(db, `artifacts/${appId}/public/data/stocks`, ticker);
    try {
        await setDoc(stockRef, companyData);
        showAdminMessage(`Company ${ticker} has been ${isEditing ? 'updated' : 'added'}!`, false);
        clearForm();
    } catch (error) {
        console.error("Firestore write error:", error);
        showAdminMessage("Failed to save company. Check Firestore rules.", true);
    }
});

companyList.addEventListener('click', async (e) => {
    const target = e.target;
    const ticker = target.dataset.ticker;
    if (!ticker) return;

    if (target.classList.contains('delete-btn')) {
        if (confirm(`Are you sure you want to delete ${ticker}?`)) {
            const stockRef = doc(db, `artifacts/${appId}/public/data/stocks`, ticker);
            try {
                await deleteDoc(stockRef);
                showAdminMessage(`Company ${ticker} deleted.`, false);
            } catch (error) {
                console.error("Firestore delete error:", error);
                showAdminMessage(`Failed to delete ${ticker}. Check Firestore rules.`, true);
            }
        }
    }

    if (target.classList.contains('edit-btn')) {
        const stockRef = doc(db, `artifacts/${appId}/public/data/stocks`, ticker);
        onSnapshot(stockRef, (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                formTitle.textContent = `Editing ${ticker}`;
                companyForm.ticker.value = ticker;
                companyForm.ticker.disabled = true;
                companyForm.name.value = data.name;
                companyForm.sector.value = data.sector;
                companyForm.price.value = data.price;
                companyForm.volatility.value = data.volatility || 1.0;
                submitButton.textContent = 'Update Company';
                submitButton.classList.replace('bg-blue-600', 'bg-green-600');
                submitButton.classList.replace('hover:bg-blue-700', 'hover:bg-green-700');
                isEditing = true;
                window.scrollTo(0, 0);
            }
        });
    }
});

const clearForm = () => {
    companyForm.reset();
    formTitle.textContent = 'Add New Company';
    tickerInput.disabled = false;
    submitButton.textContent = 'Add Company';
    submitButton.classList.replace('bg-green-600', 'bg-blue-600');
    submitButton.classList.replace('hover:bg-green-700', 'hover:bg-blue-700');
    isEditing = false;
};

clearButton.addEventListener('click', clearForm);
