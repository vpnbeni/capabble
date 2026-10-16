const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const checkSubjects = async () => {
  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/capabble';
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB');

    // Get the Subject model
    const Subject = require('./src/models/Subject');

    // Get all subjects
    const subjects = await Subject.find({});
    console.log(`\n📊 Total subjects: ${subjects.length}\n`);

    if (subjects.length > 0) {
      console.log('Subjects found:');
      subjects.forEach((subject, index) => {
        console.log(`${index + 1}. ${subject.name} (Code: ${subject.code}, Class: ${subject.class})`);
      });
    } else {
      console.log('No subjects found in database');
    }

    // Check collection names
    const collections = await mongoose.connection.db.listCollections().toArray();
    console.log('\n📁 Collections in database:');
    collections.forEach(col => {
      console.log(`  - ${col.name}`);
    });

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await mongoose.connection.close();
    console.log('\n🔌 Database connection closed');
    process.exit(0);
  }
};

checkSubjects();
