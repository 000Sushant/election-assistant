const admin = require('firebase-admin');
const { getFirestore } = require('firebase-admin/firestore');
const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

dotenv.config();

console.log('🔄 Starting Firebase Connection Test...');

let serviceAccount;
try {
  const serviceAccountPath = path.isAbsolute(process.env.GOOGLE_APPLICATION_CREDENTIALS || './service-account.json')
    ? (process.env.GOOGLE_APPLICATION_CREDENTIALS || './service-account.json')
    : path.join(__dirname, process.env.GOOGLE_APPLICATION_CREDENTIALS || './service-account.json');

  serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
  console.log('✅ Service Account loaded successfully.');
} catch (err) {
  console.error('❌ Failed to load credentials:', err.message);
  process.exit(1);
}

try {
  const appAdmin = admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: serviceAccount.project_id
  });
  const db = getFirestore(appAdmi);
  console.log(`✅ Initialized Firebase Project: ${serviceAccount.project_id}`);

  async function testDB() {
    try {
      console.log('\n--- 🧪 Testing Schema & Connection ---');

      // Print collections
      console.log('📖 Fetching collections in database "votika"...');
      const collections = await db.listCollections();

      if (collections.length === 0) {
        console.log('⚠️ No collections found in this database.');
      } else {
        console.log('✅ Collections found:');
        collections.forEach(collection => {
          console.log(`  - ${collection.id}`);
        });
      }

      console.log('\n🎉 ALL TESTS PASSED! Your Firebase connection is working correctly.');
    } catch (e) {
      console.error('\n❌ Firebase Operation Failed:');
      if (e.code === 5) {
        console.error('💡 Database not found. You might need to enable Firestore in the Firebase Console and ensure it is in Native Mode.');
      } else if (e.code === 7) {
        console.error('💡 Permission Denied. Your service account might not have the correct permissions (e.g., Datastore User or Owner).');
      }
      console.error('Full Error:', e);
      process.exit(1);
    }
  }

  testDB();

} catch (err) {
  console.error('❌ Firebase Initialization Failed:', err);
}
