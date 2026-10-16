const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const checkAllSubjects = async () => {
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/capabble';
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB\n');

    const Subject = require('./src/models/Subject');

    // Check all subjects including inactive
    const allSubjects = await Subject.find({});
    const activeSubjects = await Subject.find({ isActive: true });
    const inactiveSubjects = await Subject.find({ isActive: false });

    console.log('📊 Subject Statistics:');
    console.log(`   Total subjects: ${allSubjects.length}`);
    console.log(`   Active subjects: ${activeSubjects.length}`);
    console.log(`   Inactive subjects: ${inactiveSubjects.length}\n`);

    if (allSubjects.length > 0) {
      console.log('All subjects in database:');
      allSubjects.forEach((subject, index) => {
        const status = subject.isActive ? '✅ Active' : '❌ Inactive';
        console.log(`${index + 1}. ${subject.name} (${subject.code}) - ${subject.class || 'N/A'} - ${status}`);
      });
    } else {
      console.log('✅ Database is clean - no subjects found');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await mongoose.connection.close();
    console.log('\n🔌 Database connection closed');
    process.exit(0);
  }
};

checkAllSubjects();
