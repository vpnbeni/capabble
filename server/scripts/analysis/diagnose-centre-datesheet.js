const mongoose = require('mongoose')
const Candidate = require('./src/models/Candidate')
const Subject = require('./src/models/Subject')
const CBSEDatesheet = require('./src/models/CBSEDatesheet')

async function diagnoseCentreDatesheet() {
  try {
    console.log('🔍 Diagnosing Centre Datesheet Issue...\n')
    
    // Connect to MongoDB
    await mongoose.connect('mongodb://localhost:27017/capabble')
    console.log('✅ Connected to MongoDB\n')
    
    // Check 1: CBSE Datesheet
    console.log('📋 Step 1: Checking CBSE Datesheet...')
    const cbseDatesheet = await CBSEDatesheet.findOne({ isActive: true })
    if (!cbseDatesheet) {
      console.log('❌ No active CBSE datesheet found!')
      console.log('   Solution: Import a CBSE datesheet first\n')
      return
    }
    console.log(`✅ Found CBSE datesheet with ${cbseDatesheet.totalEntries} entries`)
    console.log(`   Sample subject codes: ${cbseDatesheet.entries.slice(0, 5).map(e => e.subject.code).join(', ')}\n`)
    
    // Check 2: Candidates
    console.log('📋 Step 2: Checking Candidates...')
    const totalCandidates = await Candidate.countDocuments({ isActive: true })
    console.log(`✅ Found ${totalCandidates} active candidates\n`)
    
    if (totalCandidates === 0) {
      console.log('❌ No active candidates found!')
      console.log('   Solution: Import or create candidates first\n')
      return
    }
    
    // Check 3: Candidate Subjects
    console.log('📋 Step 3: Checking Candidate Subject Links...')
    const candidates = await Candidate.find({ isActive: true })
      .populate('subjects', 'code name class')
      .limit(10)
    
    let candidatesWithSubjects = 0
    let candidatesWithoutSubjects = 0
    const allSubjectCodes = new Set()
    
    console.log('\n📊 Sample of first 10 candidates:')
    candidates.forEach((candidate, index) => {
      console.log(`\n${index + 1}. ${candidate.rollNumber} - ${candidate.name} (${candidate.class})`)
      
      if (candidate.subjects && candidate.subjects.length > 0) {
        candidatesWithSubjects++
        console.log(`   ✅ Has ${candidate.subjects.length} subjects:`)
        candidate.subjects.forEach(subject => {
          if (subject && subject.code) {
            console.log(`      - ${subject.code}: ${subject.name} (${subject.class})`)
            allSubjectCodes.add(subject.code)
          } else {
            console.log(`      - ❌ Invalid subject reference`)
          }
        })
      } else {
        candidatesWithoutSubjects++
        console.log(`   ❌ No subjects linked`)
        
        // Check if they have subjectCodes
        if (candidate.subjectCodes && candidate.subjectCodes.length > 0) {
          console.log(`   ⚠️  Has subjectCodes but not linked to Subject documents:`)
          candidate.subjectCodes.forEach(sc => {
            console.log(`      - ${sc.code} (${sc.medium})`)
          })
        }
      }
    })
    
    console.log(`\n📊 Summary of first 10 candidates:`)
    console.log(`   With subjects: ${candidatesWithSubjects}`)
    console.log(`   Without subjects: ${candidatesWithoutSubjects}`)
    console.log(`   Unique subject codes found: ${allSubjectCodes.size}`)
    
    // Check 4: Subject Code Matching
    console.log(`\n📋 Step 4: Checking Subject Code Matching...`)
    const cbseSubjectCodes = new Set(cbseDatesheet.entries.map(e => e.subject.code))
    const matchingCodes = Array.from(allSubjectCodes).filter(code => cbseSubjectCodes.has(code))
    
    console.log(`   CBSE datesheet has ${cbseSubjectCodes.size} subject codes`)
    console.log(`   Candidates have ${allSubjectCodes.size} subject codes`)
    console.log(`   Matching codes: ${matchingCodes.length}`)
    
    if (matchingCodes.length > 0) {
      console.log(`   ✅ Matching subject codes: ${matchingCodes.slice(0, 10).join(', ')}`)
    } else {
      console.log(`   ❌ No matching subject codes found!`)
      console.log(`\n   CBSE codes sample: ${Array.from(cbseSubjectCodes).slice(0, 10).join(', ')}`)
      console.log(`   Candidate codes sample: ${Array.from(allSubjectCodes).slice(0, 10).join(', ')}`)
    }
    
    // Check 5: All Candidates (not just first 10)
    console.log(`\n📋 Step 5: Checking ALL ${totalCandidates} candidates...`)
    const allCandidates = await Candidate.find({ isActive: true })
      .populate('subjects', 'code name class')
    
    let totalWithSubjects = 0
    let totalWithoutSubjects = 0
    const allCandidateSubjectCodes = new Set()
    
    allCandidates.forEach(candidate => {
      if (candidate.subjects && candidate.subjects.length > 0) {
        totalWithSubjects++
        candidate.subjects.forEach(subject => {
          if (subject && subject.code) {
            allCandidateSubjectCodes.add(subject.code)
          }
        })
      } else {
        totalWithoutSubjects++
      }
    })
    
    console.log(`   Candidates with subjects: ${totalWithSubjects}`)
    console.log(`   Candidates without subjects: ${totalWithoutSubjects}`)
    console.log(`   Total unique subject codes: ${allCandidateSubjectCodes.size}`)
    
    const allMatchingCodes = Array.from(allCandidateSubjectCodes).filter(code => cbseSubjectCodes.has(code))
    console.log(`   Matching with CBSE: ${allMatchingCodes.length} codes`)
    
    // Final Diagnosis
    console.log(`\n\n🎯 DIAGNOSIS:`)
    console.log('='.repeat(60))
    
    if (totalWithoutSubjects === totalCandidates) {
      console.log('❌ ISSUE: No candidates have subjects linked!')
      console.log('\n📝 SOLUTION:')
      console.log('   1. Candidates have subjectCodes but not linked to Subject documents')
      console.log('   2. Run: node server/check-and-link-candidate-subjects.js')
      console.log('   3. This will link subjectCodes to actual Subject documents')
    } else if (allMatchingCodes.length === 0) {
      console.log('❌ ISSUE: Subject codes don\'t match between candidates and CBSE datesheet!')
      console.log('\n📝 SOLUTION:')
      console.log('   1. Check if subject codes are in the same format')
      console.log('   2. Verify that subjects in database match CBSE subject codes')
      console.log('   3. May need to update subject codes to match CBSE format')
    } else {
      console.log(`✅ System should work! Found ${allMatchingCodes.length} matching subjects`)
      console.log(`\n   Centre datesheet should show ${allMatchingCodes.length} subjects`)
      console.log(`   If still empty, check browser console for API errors`)
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message)
    console.error(error.stack)
  } finally {
    await mongoose.disconnect()
    console.log('\n✅ Disconnected from MongoDB')
  }
}

diagnoseCentreDatesheet()