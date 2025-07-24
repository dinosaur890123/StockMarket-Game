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

    