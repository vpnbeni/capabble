const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const deleteAllSubjects = async () => {
  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/capabble';
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(mongoUri);

    console.log('✅ Connected to MongoDB');

    // Get the Subject model
    const Subject = require('./src/models/Subject');

    // Count subjects before deletion
    const countBefore = await Subject.countDocuments();
    console.log(`📊 Found ${countBefore} subjects in database`);

    if (countBefore === 0) {
      console.log('ℹ️  No subjects to delete');
      process.exit(0);
    }

    // Ask for confirmation
    console.log('\n⚠️  WARNING: This will delete ALL subjects from the database!');
    console.log('This action cannot be undone.\n');

    // Delete all subjects
    const result = await Subject.deleteMany({});
    console.log(`✅ Deleted ${result.deletedCount} subjects`);

    // Verify deletion
    const countAfter = await Subject.countDocuments();
    console.log(`📊 Subjects remaining: ${countAfter}`);

    if (countAfter === 0) {
      console.log('✅ All subjects successfully deleted!');
    } else {
      console.log('⚠️  Some subjects may not have been deleted');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
  } finally {
    await mongoose.connection.close();
    console.log('🔌 Database connection closed');
    process.exit(0);
  }
};

// Run the deletion
deleteAllSubjects();
