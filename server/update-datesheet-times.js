/**
 * Script to update all existing CBSE Datesheet entries with new exam times
 * 
 * Updates:
 * - Start time: 10:30 (was 09:00)
 * - End time: Calculated based on subject duration
 *   - 2-hour exam → 12:30
 *   - 3-hour exam → 13:30
 * 
 * Usage: node update-datesheet-times.js
 */

require('dotenv').config();
const mongoose = require('mongoose');

// Connect to MongoDB
const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/capabble';

/**
 * Calculate end time based on start time and duration
 * @param {string} startTime - Start time in HH:MM format
 * @param {number} durationHours - Duration in hours
 * @returns {string} End time in HH:MM format
 */
function calculateEndTime(startTime, durationHours) {
    const [hours, minutes] = startTime.split(':').map(Number);
    const startMinutes = hours * 60 + minutes;
    const endMinutes = startMinutes + (durationHours * 60);

    const endHours = Math.floor(endMinutes / 60) % 24;
    const endMins = endMinutes % 60;

    return `${endHours.toString().padStart(2, '0')}:${endMins.toString().padStart(2, '0')}`;
}

async function updateDatesheetTimes() {
    try {
        console.log('🔌 Connecting to MongoDB...');
        await mongoose.connect(MONGO_URI);
        console.log('✅ Connected to MongoDB');

        // Load the CBSEDatesheet model
        const CBSEDatesheet = require('./src/models/CBSEDatesheet');

        // Find all active datesheets
        const datesheets = await CBSEDatesheet.find({ isActive: true });
        console.log(`📊 Found ${datesheets.length} active datesheet(s)`);

        let totalEntriesUpdated = 0;

        for (const datesheet of datesheets) {
            console.log(`\n📅 Processing datesheet: ${datesheet.title} (${datesheet.academicYear})`);
            console.log(`   Total entries: ${datesheet.entries.length}`);

            let entriesUpdated = 0;

            for (const entry of datesheet.entries) {
                const duration = entry.subject?.duration || 3; // Default to 3 hours if not set
                const newStartTime = '10:30';
                const newEndTime = calculateEndTime(newStartTime, duration);

                const oldStartTime = entry.timeSlot?.start || '09:00';
                const oldEndTime = entry.timeSlot?.end || '12:00';

                // Update the entry
                entry.timeSlot = {
                    start: newStartTime,
                    end: newEndTime
                };

                console.log(`   📝 ${entry.subject.code} ${entry.subject.name}: ${oldStartTime}-${oldEndTime} → ${newStartTime}-${newEndTime} (${duration}h)`);
                entriesUpdated++;
            }

            // Save the datesheet
            await datesheet.save();
            console.log(`   ✅ Updated ${entriesUpdated} entries`);
            totalEntriesUpdated += entriesUpdated;
        }

        console.log(`\n🎉 Done! Updated ${totalEntriesUpdated} total entries across ${datesheets.length} datesheet(s)`);

    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    } finally {
        await mongoose.disconnect();
        console.log('🔌 Disconnected from MongoDB');
    }
}

// Run the script
updateDatesheetTimes();
