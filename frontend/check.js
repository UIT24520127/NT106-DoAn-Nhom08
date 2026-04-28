const admin = require("firebase-admin");
const serviceAccount = require("d:/NT106-DoAn-Nhom08/backend/ServerUndercover/ServerUndercover/game-undercover-d70dd-firebase-adminsdk-fbsvc-a08a981514.json");

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

async function check() {
  const friendships = await db.collection("friendships").get();
  console.log("Friendships count:", friendships.docs.length);
  for (const doc of friendships.docs) {
    console.log(doc.id, "=>", doc.data());
  }

  const users = await db.collection("users").get();
  console.log("\nUsers count:", users.docs.length);
  const userIds = users.docs.map(d => d.id);
  console.log("User IDs:", userIds);

  process.exit(0);
}

check().catch(console.error);
