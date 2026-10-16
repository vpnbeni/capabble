const mongoose = require('mongoose')
const Candidate = require('./src/models/Candidate')
const Subject = require('./src/models/Subject')

async function checkAndLinkCandidateSubjects() {
  try {
    console.log('🔍 Checking and linking candidate subjects...\n')
    
    // Connect to MongoDB
    await mongoose.connect('mongodb://localhost:27017/capabble')
    console.log('✅ Connected to MongoDB\n')
    
    // Get all candidates
    const candidates = await Candidate.find({ isActive: true })
    console.log(`📊 Found ${candidates.length} active candidates\n`)
    
    // Get all subjects for reference
    const subjects = await Subject.find({ isActive: true })
    console.log(`📚 Found ${subjects.length} active subjects\n`)
    
    // Create a map of subject code -> subject document
    const subjectMap = new Map()
    subjects.forEach(subject => {
      const key = `${subject.code}-${subject.class}`
      subjectMap.set(key, subject)
    })
    
    console.log('🔗 Checking candidate subject links...\n')
    
    let candidatesWithIssues = 0
    let candidatesFixed = 0
    let candidatesAlreadyLinked = 0
    
    for (const candidate of candidates) {
      let hasIssues = false
      let needsUpdate = false
      const linkedSubjects = []
      
      // Check if subjects array is populated
      if (!candidate.subjects || candidate.subjects.length === 0) {
        // Try to link from subjectCodes
        if (candidate.subjectCodes && candidate.subjectCodes.length > 0) {
          console.log(`⚠️  Candidate ${candidate.rollNumber} (${candidate.name}) has subjectCodes but no linked subjects`)
          hasIssues = true
          
          // Try to link subjects based on subjectCodes
          for (const subjectCode of candidate.subjectCodes) {
            const key = `${subjectCode.code}-${candidate.class}`
            const subject = subjectMap.get(key)
            
            if (subject) {
              linkedSubjects.push(subject._id)
              console.log(`   ✅ Linked ${subjectCode.code} -> ${subject.name} (${subject.class})`)
            } else {
              console.log(`   ❌ Could not find subject for code ${subjectCode.code} and class ${candidate.class}`)
            }
          }
          
          if (linkedSubjects.length > 0) {
            candidate.subjects = linkedSubjects
            needsUpdate = true
          }
        } else {
          console.log(`⚠️  Candidate ${candidate.rollNumber} has no subjects or subjectCodes`)
          hasIssues = true
        }
      } else {
        // Verify existing subject links
        const populatedCandidate = await Candidate.findById(candidate._id).populate('subjects')
        
        let allLinksValid = true
        for (const subject of populatedCandidate.subjects) {
          if (!subject || !subject.code) {
            console.log(`❌ Candidate ${candidate.rollNumber} has invalid subject reference`)
            allLinksValid = false
            hasIssues = true
          }
        }
        
        if (allLinksValid && populatedCandidate.subjects.length > 0) {
          candidatesAlreadyLinked++
        }
      }
      
      if (hasIssues) {
        candidatesWithIssues++
      }
      
      if (needsUpdate) {
        await candidate.save()
        candidatesFixed++
        console.log(`   💾 Updated candidate ${candidate.rollNumber}\n`)
      }
    }
    
    console.log('\n📊 Summary:')
    console.log('='.repeat(50))
    console.log(`Total candidates: ${candidates.length}`)
    console.log(`Candidates already linked: ${candidatesAlreadyLinked}`)
    console.log(`Candidates with issues: ${candidatesWithIssues}`)
    console.log(`Candidates fixed: ${candidatesFixed}`)
    
    // Show sample of properly linked candidates
    console.log('\n📋 Sample of properly linked candidates:')
    const sampleCandidates = await Candidate.find({ isActive: true })
      .populate('subjects', 'code name class')
      .limit(5)
    
    sampleCandidates.forEach((candidate, index) => {
      console.log(`\n${index + 1}. ${candidate.rollNumber} - ${candidate.name} (${candidate.class})`)
      if (candidate.subjects && candidate.subjects.length > 0) {
        candidate.subjects.forEach(subject => {
          console.log(`   - ${subject.code}: ${subject.name} (${subject.class})`)
        })
      } else {
        console.log('   - No subjects linked')
      }
    })
    
    console.log('\n✅ Check and link completed!')
    
  } catch (error) {
    console.error('❌ Error:', error.message)
    console.error(error.stack)
  } finally {
    await mongoose.disconnect()
    console.log('\n✅ Disconnected from MongoDB')
  }
}

checkAndLinkCandidateSubjects()