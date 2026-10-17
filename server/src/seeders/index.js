const mongoose = require('mongoose');
const colors = require('colors');
const bcrypt = require('bcryptjs');

// Load environment variables
require('dotenv').config();

// Import models
const User = require('../models/User');
const Teacher = require('../models/Teacher');
const Student = require('../models/Student');
const Subject = require('../models/Subject');
const Room = require('../models/Room');

// Import constants
const { USER_ROLES, STUDENT_CLASSES, STUDENT_SECTIONS, ROOM_FACILITIES } = require('../utils/constants');

// Connect to database
const connectDB = require('../config/database');

// Sample data
const userData = [
  {
    email: 'admin@example.com',
    password: 'admin123',
    role: USER_ROLES.ADMIN,
    kind: 'staff',
    roles: ['administrator'],
    isActive: true
  },
  {
    email: 'operator@example.com',
    password: 'operator123',
    role: USER_ROLES.DATA_ENTRY_OPERATOR,
    kind: 'staff',
    roles: ['office_staff'],
    isActive: true
  },
  {
    email: 'operator2@example.com',
    password: 'operator123',
    role: USER_ROLES.DATA_ENTRY_OPERATOR,
    kind: 'staff',
    roles: ['office_staff'],
    isActive: true
  }
];

const subjectData = [
  // Class 10 subjects
  {
    name: 'Mathematics',
    code: 'MATH10',
    class: STUDENT_CLASSES.CLASS_10,
    duration: 3,
    isActive: true
  },
  {
    name: 'Science',
    code: 'SCI10',
    class: STUDENT_CLASSES.CLASS_10,
    duration: 3,
    isActive: true
  },
  {
    name: 'English',
    code: 'ENG10',
    class: STUDENT_CLASSES.CLASS_10,
    duration: 3,
    isActive: true
  },
  {
    name: 'Hindi',
    code: 'HIN10',
    class: STUDENT_CLASSES.CLASS_10,
    duration: 3,
    isActive: true
  },
  {
    name: 'Social Science',
    code: 'SST10',
    class: STUDENT_CLASSES.CLASS_10,
    duration: 3,
    isActive: true
  },
  // Class 12 subjects
  {
    name: 'Physics',
    code: 'PHY12',
    class: STUDENT_CLASSES.CLASS_12,
    duration: 3,
    isActive: true
  },
  {
    name: 'Chemistry',
    code: 'CHE12',
    class: STUDENT_CLASSES.CLASS_12,
    duration: 3,
    isActive: true
  },
  {
    name: 'Mathematics',
    code: 'MATH12',
    class: STUDENT_CLASSES.CLASS_12,
    duration: 3,
    isActive: true
  },
  {
    name: 'English',
    code: 'ENG12',
    class: STUDENT_CLASSES.CLASS_12,
    duration: 3,
    isActive: true
  },
  {
    name: 'Computer Science',
    code: 'CS12',
    class: STUDENT_CLASSES.CLASS_12,
    duration: 3,
    isActive: true
  }
];

const roomData = [
  {
    roomNumber: 'A101',
    name: 'Science Lab 1',
    building: 'Academic Block A',
    floor: 1,
    capacity: 40,
    examCapacity: 30,
    type: 'laboratory',
    facilities: ['projector', 'whiteboard', 'ac'],
    isActive: true,
    isAvailableForExam: true
  },
  {
    roomNumber: 'A102',
    name: 'Mathematics Classroom',
    building: 'Academic Block A',
    floor: 1,
    capacity: 50,
    examCapacity: 35,
    type: 'classroom',
    facilities: ['whiteboard', 'projector'],
    isActive: true,
    isAvailableForExam: true
  },
  {
    roomNumber: 'A201',
    name: 'Physics Lab',
    building: 'Academic Block A',
    floor: 2,
    capacity: 35,
    examCapacity: 25,
    type: 'laboratory',
    facilities: ['projector', 'whiteboard', 'ac'],
    isActive: true,
    isAvailableForExam: true
  },
  {
    roomNumber: 'B101',
    name: 'Main Hall',
    building: 'Academic Block B',
    floor: 1,
    capacity: 200,
    examCapacity: 150,
    type: 'hall',
    facilities: ['projector', 'whiteboard', 'ac', 'microphone'],
    isActive: true,
    isAvailableForExam: true
  },
  {
    roomNumber: 'B201',
    name: 'Computer Lab',
    building: 'Academic Block B',
    floor: 2,
    capacity: 45,
    examCapacity: 30,
    type: 'computer_lab',
    facilities: ['projector', 'whiteboard', 'ac'],
    isActive: true,
    isAvailableForExam: true
  }
];

// Generate teacher data
const generateTeacherData = (subjects) => {
  const departments = ['Mathematics', 'Science', 'English', 'Hindi', 'Social Science', 'Physics', 'Chemistry', 'Computer Science'];
  const designations = ['Assistant Professor', 'Associate Professor', 'Professor', 'Senior Lecturer', 'Lecturer'];
  
  const teachers = [];
  
  for (let i = 1; i <= 50; i++) {
    const department = departments[Math.floor(Math.random() * departments.length)];
    const designation = designations[Math.floor(Math.random() * designations.length)];
    
    // Assign subjects based on department
    const teacherSubjects = subjects.filter(subject => {
      if (department === 'Mathematics') return subject.name === 'Mathematics';
      if (department === 'Science') return ['Science', 'Physics', 'Chemistry'].includes(subject.name);
      if (department === 'English') return subject.name === 'English';
      if (department === 'Hindi') return subject.name === 'Hindi';
      if (department === 'Social Science') return subject.name === 'Social Science';
      if (department === 'Physics') return subject.name === 'Physics';
      if (department === 'Chemistry') return subject.name === 'Chemistry';
      if (department === 'Computer Science') return subject.name === 'Computer Science';
      return false;
    }).map(s => s._id);
    
    teachers.push({
      name: `Teacher ${i}`,
      email: `teacher${i}@school.edu`,
      phone: `9${String(Math.floor(Math.random() * 900000000) + 100000000)}`,
      employeeId: `EMP${i}`,
      department,
      designation,
      subjects: teacherSubjects.slice(0, Math.floor(Math.random() * 3) + 1),
      experience: Math.floor(Math.random() * 25) + 1,
      qualification: 'M.Sc., B.Ed.',
      dateOfJoining: new Date(2020 + Math.floor(Math.random() * 4), Math.floor(Math.random() * 12), Math.floor(Math.random() * 28) + 1),
      dateOfBirth: new Date(1970 + Math.floor(Math.random() * 25), Math.floor(Math.random() * 12), Math.floor(Math.random() * 28) + 1),
      address: {
        street: `${i} Teacher Street`,
        city: 'Delhi',
        state: 'Delhi',
        pincode: '110001'
      },
      isActive: true
    });
  }
  
  return teachers;
};

// Generate student data
const generateStudentData = (subjects) => {
  const students = [];
  
  // Generate Class 10 students
  const class10Subjects = subjects.filter(s => s.class === STUDENT_CLASSES.CLASS_10).map(s => s._id);
  for (let section of STUDENT_SECTIONS.slice(0, 4)) { // A, B, C, D
    for (let i = 1; i <= 30; i++) {
      const rollNumber = `10${section}${String(i).padStart(3, '0')}`;
      students.push({
        rollNumber,
        name: `Student ${rollNumber}`,
        email: `${rollNumber.toLowerCase()}@student.edu`,
        phone: `8${String(Math.floor(Math.random() * 900000000) + 100000000)}`,
        class: STUDENT_CLASSES.CLASS_10,
        section,
        subjects: class10Subjects,
        fatherName: `Father of ${rollNumber}`,
        motherName: `Mother of ${rollNumber}`,
        guardianPhone: `9${String(Math.floor(Math.random() * 900000000) + 100000000)}`,
        address: {
          street: `${i} Student Street, Section ${section}`,
          city: 'Delhi',
          state: 'Delhi',
          pincode: '110001'
        },
        dateOfBirth: new Date(2008, Math.floor(Math.random() * 12), Math.floor(Math.random() * 28) + 1),
        admissionDate: new Date(2023, 3, 1),
        category: ['General', 'OBC', 'SC', 'ST'][Math.floor(Math.random() * 4)],
        isActive: true
      });
    }
  }
  
  // Generate Class 12 students
  const class12Subjects = subjects.filter(s => s.class === STUDENT_CLASSES.CLASS_12).map(s => s._id);
  for (let section of STUDENT_SECTIONS.slice(0, 3)) { // A, B, C
    for (let i = 1; i <= 35; i++) {
      const rollNumber = `12${section}${String(i).padStart(3, '0')}`;
      students.push({
        rollNumber,
        name: `Student ${rollNumber}`,
        email: `${rollNumber.toLowerCase()}@student.edu`,
        phone: `7${String(Math.floor(Math.random() * 900000000) + 100000000)}`,
        class: STUDENT_CLASSES.CLASS_12,
        section,
        subjects: class12Subjects.slice(0, 5), // First 5 subjects for each student
        fatherName: `Father of ${rollNumber}`,
        motherName: `Mother of ${rollNumber}`,
        guardianPhone: `9${String(Math.floor(Math.random() * 900000000) + 100000000)}`,
        address: {
          street: `${i} Student Street, Section ${section}`,
          city: 'Delhi',
          state: 'Delhi',
          pincode: '110001'
        },
        dateOfBirth: new Date(2006, Math.floor(Math.random() * 12), Math.floor(Math.random() * 28) + 1),
        admissionDate: new Date(2021, 3, 1),
        category: ['General', 'OBC', 'SC', 'ST'][Math.floor(Math.random() * 4)],
        isActive: true
      });
    }
  }
  
  return students;
};

// Delete existing data
const deleteData = async () => {
  try {
    await User.deleteMany();
    await Teacher.deleteMany();
    await Student.deleteMany();
    await Subject.deleteMany();
    await Room.deleteMany();
    
    console.log('Data destroyed...'.red.inverse);
  } catch (error) {
    console.error('Error deleting data:', error);
    process.exit(1);
  }
};

// Import data
const importData = async () => {
  try {
    console.log('Starting data import...'.yellow);
    
    // Create users
    console.log('Creating users...'.cyan);
    const users = await User.create(userData);
    console.log(`Created ${users.length} users`.green);
    
    // Create subjects
    console.log('Creating subjects...'.cyan);
    const subjects = await Subject.create(subjectData);
    console.log(`Created ${subjects.length} subjects`.green);
    
    // Create rooms
    console.log('Creating rooms...'.cyan);
    const rooms = await Room.create(roomData);
    console.log(`Created ${rooms.length} rooms`.green);
    
    // Create teachers
    console.log('Creating teachers...'.cyan);
    const teacherDataWithSubjects = generateTeacherData(subjects);
    const teachers = await Teacher.create(teacherDataWithSubjects);
    console.log(`Created ${teachers.length} teachers`.green);
    
    // Create students
    console.log('Creating students...'.cyan);
    const studentDataWithSubjects = generateStudentData(subjects);
    const students = await Student.create(studentDataWithSubjects);
    console.log(`Created ${students.length} students`.green);
    
    console.log('Data imported successfully!'.green.inverse);
    console.log('\nSample Login Credentials:'.yellow.bold);
    console.log('Admin: admin@example.com / admin123'.cyan);
    console.log('Operator: operator@example.com / operator123'.cyan);
    
  } catch (error) {
    console.error('Error importing data:', error);
    process.exit(1);
  }
};

// Main execution
const runSeeder = async () => {
  try {
    // Connect to database
    await connectDB();
    
    // Get command line arguments
    const args = process.argv;
    
    if (args[2] === '-d') {
      await deleteData();
    } else {
      await deleteData();
      await importData();
    }
    
    process.exit(0);
  } catch (error) {
    console.error('Seeder error:', error);
    process.exit(1);
  }
};

// Run if called directly
if (require.main === module) {
  runSeeder();
}

module.exports = { deleteData, importData, runSeeder };