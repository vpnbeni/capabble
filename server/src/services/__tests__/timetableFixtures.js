/**
 * A 10-class school timetable setup (classes 1st–10th, one section, 7 periods a
 * day, 42 periods a week per class, one subject per teacher) used to test the
 * generator. Mirrors the demo school configuration.
 */
const CLASSES = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th', '10th'];

const PLAN = {
  junior: {
    English: 8,
    Hindi: 7,
    Mathematics: 8,
    'Environmental Studies': 6,
    Computer: 3,
    'Physical Education': 4,
    Art: 3,
    Music: 2,
    Library: 1
  },
  middle: {
    English: 6,
    Hindi: 5,
    Mathematics: 7,
    Science: 7,
    'Social Science': 6,
    Sanskrit: 3,
    Computer: 3,
    'Physical Education': 2,
    Art: 2,
    Library: 1
  },
  senior: {
    English: 7,
    Hindi: 6,
    Mathematics: 8,
    Science: 8,
    'Social Science': 7,
    Computer: 2,
    'Physical Education': 3,
    Library: 1
  }
};
const bandOf = (index) => {
  if (index < 5) return 'junior';
  return index < 8 ? 'middle' : 'senior';
};
const range = (from, to) => CLASSES.slice(from - 1, to);

const TEACHING = [
  ['Seema Kadian', 'English', range(1, 3)], ['Meenu Ahlawat', 'English', range(4, 5)],
  ['Rajesh Kumar', 'English', range(6, 10)],
  ['Sonia Chhikara', 'Hindi', range(1, 5)], ['Kavita Rathee', 'Hindi', range(6, 10)],
  ['Vikas Sangwan', 'Mathematics', range(1, 3)], ['Rekha Jakhar', 'Mathematics', range(4, 5)],
  ['Sandeep Malik', 'Mathematics', range(6, 8)], ['Amit Gahlot', 'Mathematics', range(9, 10)],
  ['Neelam Rathi', 'Environmental Studies', range(1, 5)],
  ['Pooja Gulia', 'Science', range(6, 8)], ['Ritu Kharb', 'Science', range(9, 10)],
  ['Naveen Dalal', 'Social Science', range(6, 10)], ['Pradeep Sharma', 'Sanskrit', range(6, 8)],
  ['Anju Dhankhar', 'Computer', range(1, 10)], ['Ravinder Hooda', 'Physical Education', range(1, 10)],
  ['Sushma Deswal', 'Art', range(1, 8)], ['Deepak Rana', 'Music', range(1, 5)], ['Kamla Rana', 'Library', range(1, 10)]
];
const INCHARGE = {
  '1st': 'Seema Kadian',
  '2nd': 'Vikas Sangwan',
  '3rd': 'Sonia Chhikara',
  '4th': 'Meenu Ahlawat',
  '5th': 'Rekha Jakhar',
  '6th': 'Kavita Rathee',
  '7th': 'Naveen Dalal',
  '8th': 'Pooja Gulia',
  '9th': 'Amit Gahlot',
  '10th': 'Rajesh Kumar'
};

const buildSchoolState = () => {
  const classes = CLASSES.map((name, i) => ({
    id: `c-${name}`,
    className: name,
    section: 'Rose',
    subjects: Object.keys(PLAN[bandOf(i)]),
    incharge: INCHARGE[name]
  }));
  const subjects = [...new Set(Object.values(PLAN).flatMap((plan) => Object.keys(plan)))]
    .map((name) => ({ id: name, name }));
  const periodAllocation = Object.fromEntries(CLASSES.map((name, i) => [`c-${name}`, { ...PLAN[bandOf(i)] }]));
  const teacherSubjectAllocations = TEACHING.map(([teacherName, subject, list]) => ({
    teacherName,
    assignments: list.map((name) => ({ classId: `c-${name}`, subjects: [subject] }))
  }));
  const rows = [
    { type: 'break', label: 'Assembly' },
    ...['1st', '2nd', '3rd'].map((label) => ({ type: 'period', label })),
    { type: 'break', label: 'Lunch' },
    ...['4th', '5th', '6th', '7th'].map((label) => ({ type: 'period', label }))
  ];
  return {
    classes,
    subjects,
    periodAllocation,
    teacherSubjectAllocations,
    bellTimings: { rows },
    parallelSubjectPairs: [],
    commonPeriods: []
  };
};

module.exports = { buildSchoolState };
