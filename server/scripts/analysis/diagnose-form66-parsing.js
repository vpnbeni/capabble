const mongoose = require('mongoose');
require('dotenv').config();

mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/capabble')
  .then(() => console.log('✅ Connected to MongoDB'))
  .catch(err => console.error('❌ MongoDB connection error:', err));

const Form66 = require('./src/models/Form66');

async function diagnoseForm66() {
  try {
    console.log('\n📊 Form 66 Database Diagnostics\n');
    console.log('='.repeat(80));
    
    // Get total count
    const totalCount = await Form66.countDocuments({ isActive: true });
    console.log(`\n📈 Total Records: ${totalCount}`);
    
    // Get unique dates
    const dates = await Form66.distinct('examDate', { isActive: true });
    console.log(`\n📅 Unique Exam Dates: ${dates.length}`);
    console.log('Dates:', dates.sort((a, b) => {
      const dateA = a.split('.').reverse().join('');
      const dateB = b.split('.').reverse().join('');
      return dateA.localeCompare(dateB);
    }));
    
    // Get breakdown by date
    console.log('\n📊 Breakdown by Date:');
    console.log('─'.repeat(80));
    
    for (const date of dates.sort((a, b) => {
      const dateA = a.split('.').reverse().join('');
      const dateB = b.split('.').reverse().join('');
      return dateA.localeCompare(dateB);
    })) {
      const dateRecords = await Form66.find({ examDate: date, isActive: true });
      const subjects = await Form66.aggregate([
        { $match: { examDate: date, isActive: true } },
        { 
          $group: { 
            _id: { code: '$subjectCode', name: '$subject' },
            count: { $sum: 1 }
          } 
        },
        { $sort: { '_id.code': 1 } }
      ]);
      
      console.log(`\n${date}:`);
      console.log(`  Total Candidates: ${dateRecords.length}`);
      console.log(`  Subjects: ${subjects.length}`);
      
      subjects.forEach(subject => {
        console.log(`    - ${subject._id.code}: ${subject._id.name} (${subject.count} candidates)`);
      });
    }
    
    // Check for missing dates
    console.log('\n\n🔍 Checking for potential issues:');
    console.log('─'.repeat(80));
    
    if (dates.length < 22) {
      console.log(`⚠️  Expected 22 exam dates, but found only ${dates.length}`);
      console.log('   This suggests some dates were not parsed from the PDF');
    }
    
    // Check Feb 15 specifically
    const feb15Count = await Form66.countDocuments({ 
      examDate: '15.02.2025', 
      isActive: true 
    });
    console.log(`\n📌 Feb 15, 2025 Check:`);
    console.log(`   Found: ${feb15Count} candidates`);
    if (feb15Count < 315) {
      console.log(`   ⚠️  Expected: 315 candidates`);
      console.log(`   Missing: ${315 - feb15Count} candidates`);
    }
    
    // Get sample records
    console.log('\n\n📋 Sample Records (first 5):');
    console.log('─'.repeat(80));
    const samples = await Form66.find({ isActive: true }).limit(5).sort({ examDate: 1, rollNo: 1 });
    samples.forEach((record, index) => {
      console.log(`${index + 1}. Roll: ${record.rollNo} | Date: ${record.examDate} | Subject: ${record.subjectCode} - ${record.subject}`);
    });
    
    console.log('\n' + '='.repeat(80));
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.connection.close();
    console.log('\n✅ Database connection closed');
  }
}

diagnoseForm66();
