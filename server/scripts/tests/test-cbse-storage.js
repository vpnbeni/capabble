const mongoose = require('mongoose')
const fs = require('fs')
const path = require('path')
require('dotenv').config()

const CBSEDatesheet = require('./src/models/CBSEDatesheet')
const CBSEDatesheetParser = require('./src/utils/cbseDatesheetParser')

const testCBSEStorage = async () => {
  try {
    console.log('🧪 Testing CBSE Datesheet Storage System...\n')
    
    // Connect to database
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/examination_management_system')
    console.log('✅ Connected to database')
    
    // 1. Parse CBSE PDF
    console.log('\n📄 Step 1: Parsing CBSE PDF...')
    const pdfPath = path.join(__dirname, '../client/src/public/CBSE Full Datesheet.pdf')
    const pdfBuffer = fs.readFileSync(pdfPath)
    const parser = new CBSEDatesheetParser()
    const result = await parser.parsePDF(pdfBuffer)
    
    if (!result.success) {
      throw new Error('CBSE parsing failed: ' + result.error)
    }
    
    console.log(`✅ Parsed ${result.data.count} entries`)
    
    // 2. Add day names (simulate what the controller does)
    console.log('\n📅 Step 2: Adding day names...')
    const entriesWithDays = result.data.entries.slice(0, 5).map(entry => ({
      ...entry,
      dayName: 'Monday' // Simulated - in real app this comes from calendar
    }))
    
    // 3. Save to database
    console.log('\n💾 Step 3: Saving to database...')
    
    // Clear existing data
    await CBSEDatesheet.deleteMany({})
    
    const dates = result.data.entries.map(e => new Date(e.examDate))
    const minDate = new Date(Math.min(...dates))
    const maxDate = new Date(Math.max(...dates))
    const academicYear = `${minDate.getFullYear()}-${maxDate.getFullYear()}`
    
    const cbseDatesheet = new CBSEDatesheet({
      title: 'CBSE Full Datesheet',
      academicYear,
      totalEntries: result.data.entries.length,
      dateRange: {
        startDate: minDate,
        endDate: maxDate
      },
      statistics: parser.getStatistics(result.data.entries),
      entries: result.data.entries, // Use all entries
      isActive: true
    })
    
    await cbseDatesheet.save()
    console.log('✅ Saved to database with ID:', cbseDatesheet._id)
    
    // 4. Test retrieval
    console.log('\n📖 Step 4: Testing retrieval...')
    const retrieved = await CBSEDatesheet.getActive()
    
    if (!retrieved) {
      throw new Error('Failed to retrieve saved datesheet')
    }
    
    console.log('✅ Retrieved datesheet:')
    console.log(`   Title: ${retrieved.title}`)
    console.log(`   Academic Year: ${retrieved.academicYear}`)
    console.log(`   Total Entries: ${retrieved.totalEntries}`)
    console.log(`   Date Range: ${retrieved.dateRange.startDate.toISOString().slice(0,10)} to ${retrieved.dateRange.endDate.toISOString().slice(0,10)}`)
    console.log(`   Statistics: ${JSON.stringify(retrieved.statistics)}`)
    
    // 5. Test pagination simulation
    console.log('\n📄 Step 5: Testing pagination...')
    const page1 = retrieved.entries.slice(0, 10)
    const page2 = retrieved.entries.slice(10, 20)
    
    console.log(`✅ Page 1: ${page1.length} entries`)
    console.log(`✅ Page 2: ${page2.length} entries`)
    
    // Show sample entries
    console.log('\n📋 Sample entries from database:')
    page1.slice(0, 5).forEach((entry, index) => {
      console.log(`${index + 1}. ${entry.examDate.toISOString().slice(0,10)} | ${entry.subject.code} | ${entry.subject.name} | ${entry.subject.class} | ${entry.subject.duration}h`)
    })
    
    console.log('\n🎉 CBSE Storage System Test Completed Successfully!')
    console.log('✅ The Full Datesheet tab should now show dates properly')
    
  } catch (error) {
    console.error('❌ Test failed:', error.message)
  } finally {
    await mongoose.connection.close()
    console.log('🔌 Database connection closed')
  }
}

testCBSEStorage()