require('dotenv').config();
const dns = require('node:dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);
const mongoose = require('mongoose');
const { decryptBallot } = require('./services/decryptor');

async function testDecryption() {
  console.log('========================================================');
  console.log(' Member 3: Ballot Decryption & Integration Test');
  console.log('========================================================\n');

  console.log('[1/3] Connecting to MongoDB Atlas...');
  await mongoose.connect(process.env.VOTE_MONGO_URI);
  console.log('Connected successfully to database.\n');

  console.log('[2/3] Fetching sample Version 1 ballot (from user screenshot)...');
  const targetId = '6acdf93c83a86efa7a078b9c';
  let sampleDoc = await mongoose.connection.db.collection('vote').findOne({
    _id: new mongoose.Types.ObjectId(targetId)
  });

  if (!sampleDoc) {
    console.log(`Ballot with _id ${targetId} not found by ObjectId. Searching by string _id or finding any v1 envelope...`);
    sampleDoc = await mongoose.connection.db.collection('vote').findOne({ _id: targetId });
  }

  if (!sampleDoc) {
    // Find any ballot that has an envelope structure
    sampleDoc = await mongoose.connection.db.collection('vote').findOne({
      preferences: { $regex: 'AES-256-GCM' }
    });
  }

  if (!sampleDoc) {
    console.error('No Version 1 encrypted ballot found in database.');
    await mongoose.disconnect();
    return;
  }

  console.log(`Found ballot _id: ${sampleDoc._id}`);
  console.log(`Polling Station: ${sampleDoc.polling_station} (${sampleDoc.station_code})\n`);

  console.log('[3/3] Attempting decryption using RSA-3072 + AES-256-GCM...');
  try {
    const preferences = decryptBallot(sampleDoc.preferences);
    console.log('\n SUCCESS: Ballot decrypted successfully!');
    console.log(' Decrypted Voter Preferences:');
    console.log(JSON.stringify(preferences, null, 2));

    console.log('\nPreference Breakdown:');
    console.log(`  1st Preference (Mandatory): Candidate ${preferences['1']}`);
    if (preferences['2']) console.log(`  2nd Preference (Optional):  Candidate ${preferences['2']}`);
    if (preferences['3']) console.log(`  3rd Preference (Optional):  Candidate ${preferences['3']}`);
  } catch (err) {
    console.error('\n Decryption Failed!');
    console.error(`Error: ${err.message}`);
    if (err.message.includes('passphrase') || err.message.includes('RESULTS_KEY_PASSPHRASE')) {
      console.log('\n[TIP] Make sure RESULTS_KEY_PASSPHRASE is filled in election-api/.env.');
    }
  }

  await mongoose.disconnect();
}

testDecryption().catch(e => {
  console.error('Fatal Test Error:', e);
  process.exit(1);
});
