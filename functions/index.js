const functions = require("firebase-functions");
const admin = require("firebase-admin");
admin.initializeApp();

const db = admin.firestore();

/**
 * Creates a new player document in Firestore when a new user signs up.
 * This function sets the starting cash for every new player.
 */
exports.createPlayerOnSignUp = functions.auth.user().onCreate((user) => {
  const userId = user.uid;
  const playerRef = db.collection("players").doc(userId);

  console.log(`Creating new player document for user: ${userId}`);

  // Set the starting data for the new player
  return playerRef.set({
    cash: 20000, // <-- Here is the new starting cash amount
    shares: {},   // Start with no shares
  });
});


/**
 * A callable function to process a trade (buy or sell).
 * Ensures all logic is handled securely on the server.
 */
exports.processTrade = functions.https.onCall(async (data, context) => {
  // Ensure the user is authenticated.
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "You must be logged in to make a trade."
    );
  }

  const userId = context.auth.uid;
  const { companyId, quantity, action } = data; // action is 'buy' or 'sell'
  const quantityNum = parseInt(quantity);

  if (!companyId || isNaN(quantityNum) || quantityNum <= 0) {
    throw new functions.https.HttpsError(
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
        // Check if player has enough cash
        if (playerData.cash < tradeValue) {
          throw new Error("Insufficient funds.");
        }
        
        // Update player's cash and shares
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
        // Check if player has enough shares
        if (currentShares < quantityNum) {
          throw new Error("Insufficient shares to sell.");
        }

        // Update player's cash and shares
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
    // Throw a user-friendly error message back to the client
    throw new functions.https.HttpsError("internal", error.message);
  }
});
