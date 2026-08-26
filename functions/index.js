const functions = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();

exports.createTaskViewerUser = functions.https.onCall(async (data, context) => {

  const { email, password, role } = data;

  if (!email || !password || !role) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Missing email/password/role"
    );
  }

  // 🔐 Require logged-in user
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "You must be logged in"
    );
  }

  try {
    // ✅ CREATE AUTH USER
    await admin.auth().createUser({
      email,
      password
    });

    // ✅ SAVE TO DATABASE
    await admin.database().ref(`config/taskviewUsers/${role}`).push({
      email,
      active: true,
      createdAt: Date.now()
    });

    return { success: true };

  } catch (err) {
    throw new functions.https.HttpsError(
      "internal",
      err.message
    );
  }
});
