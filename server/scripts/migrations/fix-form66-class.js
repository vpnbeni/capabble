const mongoose = require('mongoose');
require('dotenv').config();

mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/capabble')
  .then(() => console.log('✅ Connected to MongoDB'))
  .catch(err => console.error('❌ MongoDB connection error:', err));

const Form66 = require('./src/models/Form66');

function detectClass(subjectCode) {
  // CBSE Class Detection:
  // Class X subjects: 3-digit codes (100+) like 184 (English), 041 (Math)
  // Class XII subjects: 2-digit codes (1-99) like 048 (Physical Education), 064 (Home Science)
  const code = parseInt(subjectCode);
  if (code >= 100) {
    return 'X';
  }
  return 'XII';
}

async function fixForm66Classes() {
  try {
    console.log('\n🔧 Fixing Form 66 Class Detection...\n');
    console.log('='.repeat(80));
    
    const records = await Form66.find({ isActive: true });
    console.log(`\nFound ${records.length} records to check`);
    
    let updatedCount = 0;
    let correctCount = 0;
    
    const updates = [];
    
    for (const record of records) {
      const correctClass = detectClass(record.subjectCode);
      
      if (record.class !== correctClass) {
        updates.push({
          _id: record._id,
          oldClass: record.class,
          newClass: correctClass,
          subjectCode: record.subjectCode,
          subject: record.subject
        });
        updatedCount++;
      } else {
        correctCount++;
      }
    }
    
    console.log(`\n📊 Analysis:`);
    console.log(`   ✅ Already correct: ${correctCount}`);
    console.log(`   🔄 Need update: ${updatedCount}`);
    
    if (updates.length > 0) {
      console.log(`\n📝 Updates to be made:`);
      console.log('─'.repeat(80));
      
      // Group by subject for cleaner display
      const bySubject = {};
      updates.forEach(u => {
        const key = `${u.subjectCode} - ${u.subject}`;
        if (!bySubject[key]) {
          bySubject[key] = { ...u, count: 0 };
        }
        bySubject[key].count++;
      });
      
      Object.values(bySubject).forEach(item => {
        console.log(`   ${item.subjectCode} - ${item.subject}`);
        console.log(`      ${item.oldClass} → ${item.newClass} (${item.count} records)`);
      });
      
      console.log('\n🔄 Applying updates...');
      
      // Bulk update
      const bulkOps = updates.map(u => ({
        updateOne: {
          filter: { _id: u._id },
          update: { $set: { class: u.newClass } }
        }
      }));
      
      const result = await Form66.bulkWrite(bulkOps);
      console.log(`✅ Updated ${result.modifiedCount} records`);
    } else {
      console.log('\n✨ All records already have correct class assignments!');
    }
    
    // Show final breakdown
    console.log('\n📊 Final Class Distribution:');
    console.log('─'.repeat(80));
    
    const classX = await Form66.countDocuments({ class: 'X', isActive: true });
    const classXII = await Form66.countDocuments({ class: 'XII', isActive: true });
    
    console.log(`   Class X:   ${classX} records`);
    console.log(`   Class XII: ${classXII} records`);
    
    console.log('\n' + '='.repeat(80));
    console.log('✅ Class detection fix completed!');
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.connection.close();
    console.log('\n✅ Database connection closed');
  }
}

fixForm66Classes();
