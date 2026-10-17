const mongoose = require('mongoose');
require('dotenv').config();

mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/capabble')
  .then(() => console.log('✅ Connected to MongoDB'))
  .catch(err => console.error('❌ MongoDB connection error:', err));

const Form66 = require('./src/models/Form66');

async function clearForm66Data() {
  try {
    console.log('\n🗑️  Clearing Form 66 Data...\n');
    
    const count = await Form66.countDocuments();
    console.log(`Found ${count} Form 66 records`);
    
    if (count === 0) {
      console.log('No records to delete');
      return;
    }
    
    const result = await Form66.deleteMany({});
    console.log(`✅ Deleted ${result.deletedCount} records`);
    
    console.log('\n✨ Form 66 data cleared successfully!');
    console.log('You can now re-upload the PDF with the fixed parser.');
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.connection.close();
    console.log('\n✅ Database connection closed');
  }
}

clearForm66Data();
