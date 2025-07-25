// Import v2 modules
const { onUserCreated } = require("firebase-functions/v2/auth");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

// Initialize Admin SDK
initializeApp();
const db = getFirestore();

/**
 * Creates a new player document in Firestore when a new user is created.
 * This is the v2 syntax for an authentication trigger.
 */
exports.createPlayerOnSignUp = onUserCreated((event) => {
  // The user data is in event.data
  const user = event.data;
  const userId = user.uid;
  const playerRef = db.collection("players").doc(userId);

  console.log(`v2: Creating new player document for user: ${userId}`);

  // Set the starting data for the new player
  return playerRef.set({
    cash: 20000, // Start with 20,000
    shares: {},   // Start with no shares
  });
});

/**
 * A callable function to process a trade (buy or sell).
 * This is the v2 syntax for a callable function.
 */
exports.processTrade = onCall(async (request) => {
  // In v2, auth data is in request.auth
  if (!request.auth) {
    // Throwing an HttpsError so the client gets a specific error code.
    throw new HttpsError(
      "unauthenticated",
      "You must be logged in to make a trade."
    );
  }

  const userId = request.auth.uid;
  // In v2, the data sent from the client is in request.data
  const { companyId, quantity, action } = request.data;
  const quantityNum = parseInt(quantity);

  if (!companyId || isNaN(quantityNum) || quantityNum <= 0) {
    throw new HttpsError(
      "invalid-argument",
      "Invalid trade data provided."
    );
  }

  try {
    const playerRef = db.collection("players").doc(userId);
    const stockRef = db.collection("market").doc(companyId);

    // Use a transaction to ensure atomic reads and writes
    return db.runTransaction(async (transaction) => {
      const playerDoc = await transaction.get(playerRef);
      const stockDoc = await transaction.get(stockRef);

      if (!playerDoc.exists || !stockDoc.exists) {
        throw new Error("Player or stock data could not be found.");
      }

      const playerData = playerDoc.data();
      const stockData = stockDoc.data();
      const tradeValue = stockData.currentPrice * quantityNum;

      if (action === "buy") {
        if (playerData.cash < tradeValue) {
          throw new Error("Insufficient funds.");
        }
        const newCash = playerData.cash - tradeValue;
        const currentShares = playerData.shares[companyId] || 0;
        const newShares = currentShares + quantityNum;
        transaction.update(playerRef, {
          cash: newCash,
          [`shares.${companyId}`]: newShares,
        });
        return { message: "Purchase successful!" };

      } else if (action === "sell") {
        const currentShares = playerData.shares[companyId] || 0;
        if (currentShares < quantityNum) {
          throw new Error("Insufficient shares to sell.");
        }
        const newCash = playerData.cash + tradeValue;
        const newShares = currentShares - quantityNum;
        transaction.update(playerRef, {
          cash: newCash,
          [`shares.${companyId}`]: newShares,
        });
        return { message: "Sale successful!" };
        
      } else {
        throw new Error("Invalid action specified.");
      }
    });
  } catch (error) {
    console.error("Trade failed:", error);
    // Throw a new HttpsError to send a clean error to the client.
    throw new HttpsError("internal", error.message);
  }
});
