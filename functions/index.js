// Import the necessary modules using the correct paths
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onUserCreated } = require("firebase-functions/v2/identity"); // Corrected import path
const admin = require("firebase-admin");

// Initialize the Firebase Admin SDK
admin.initializeApp();
const db = admin.firestore();

/**
 * Creates a new player document in Firestore when a new user is created.
 * This uses the new v2 'onUserCreated' trigger.
 */
exports.createPlayerOnSignUp = onUserCreated((user) => { // Corrected function name
  const userRecord = user.data; // The user data is in the .data property
  const userId = userRecord.uid;
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
 * This uses the new v2 'onCall' trigger.
 */
exports.processTrade = onCall(async (request) => {
  // Ensure the user is authenticated.
  if (!request.auth) {
    throw new HttpsError(
      "unauthenticated",
      "You must be logged in to make a trade."
    );
  }

  const userId = request.auth.uid;
  const { companyId, quantity, action } = request.data; // Data is in request.data
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
    throw new HttpsError("internal", error.message);
  }
});
