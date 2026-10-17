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

    // First, let's see what's in the database
    const allSubjects = await Subject.find({});
    console.log(`\n📊 Found ${allSubjects.length} subjects in database`);

    if (allSubjects.length > 0) {
      console.log('\nSubjects to be deleted:');
      allSubjects.forEach((subject, index) => {
        console.log(`${index + 1}. ${subject.name} (Code: ${subject.code}, Class: ${subject.class || 'N/A'})`);
      });

      console.log('\n⚠️  Deleting all subjects...');
      
      // Delete all subjects
      const result = await Subject.deleteMany({});
      console.log(`✅ Deleted ${result.deletedCount} subjects`);

      // Verify deletion
      const remaining = await Subject.countDocuments();
      if (remaining === 0) {
        console.log('✅ All subjects successfully deleted!');
      } else {
        console.log(`⚠️  ${remaining} subjects still remain`);
      }
    } else {
      console.log('ℹ️  No subjects found in database. They may have already been deleted.');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
  } finally {
    await mongoose.connection.close();
    console.log('\n🔌 Database connection closed');
    process.exit(0);
  }
};

// Run the deletion
console.log('🗑️  Subject Deletion Script');
console.log('==========================\n');
deleteAllSubjects();
