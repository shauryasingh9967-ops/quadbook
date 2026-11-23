/**
 * QuadBook demo-data seeder.
 *   npm run db:seed            -> seeds only if the database is empty
 *   npm run db:seed -- --force -> wipes business tables and re-seeds
 * Deterministic (seeded PRNG) so every run produces the same realistic data set.
 * Booking dates are generated relative to "today" so the demo always has past, current and future bookings.
 */
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { RowDataPacket } from 'mysql2/promise';
import { env } from '../config/env';
import { closePool, getPool } from './mysql';
import { ActivityLog } from '../models/ActivityLog';
import { BookingAudit } from '../models/BookingAudit';

// ------------------------------------------------------------------ helpers
let seedState = 20260101;
const rnd = () => { seedState |= 0; seedState = (seedState + 0x6d2b79f5) | 0; let t = Math.imul(seedState ^ (seedState >>> 15), 1 | seedState); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const pick = <T>(a: T[]): T => a[Math.floor(rnd() * a.length)];
const int = (lo: number, hi: number) => lo + Math.floor(rnd() * (hi - lo + 1));
const chance = (p: number) => rnd() < p;
const pad = (n: number) => String(n).padStart(2, '0');
const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
const fmtDate = (d: Date) => fmt(d).slice(0, 10);
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const atMin = (day: Date, minutes: number) => { const x = new Date(day); x.setHours(0, 0, 0, 0); x.setMinutes(minutes); return x; };
const NOW = new Date();
const TODAY = new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate());

// --------------------------------------------------------------- static data
const DEPARTMENTS = [
  ['CSE', 'Computer Science & Engineering'], ['ECE', 'Electronics & Communication Engineering'], ['ME', 'Mechanical Engineering'],
  ['CE', 'Civil Engineering'], ['MGT', 'School of Management'], ['APSC', 'Applied Sciences'], ['BIO', 'Biotechnology'], ['LIB', 'Library & Learning Services'],
];
const BUILDINGS = [
  ['ENG', 'Engineering Block', 4, 'Computer, electronics and mechanical laboratories with lecture rooms'],
  ['SCI', 'Science Complex', 3, 'Physics, chemistry and biotechnology laboratories'],
  ['LIB', 'Central Library & Learning Commons', 3, 'Group study rooms, innovation studio and reading halls'],
  ['MGT', 'Management Centre', 2, 'Case-study rooms and seminar hall'],
  ['AUD', 'Convocation Centre', 2, 'Main auditorium for convocations and large events'],
  ['STR', 'Central Equipment Stores', 1, 'Issue counter for portable equipment kits'],
];
const CATEGORIES = [
  ['Computer Lab', 'lab', 'monitor', 'Workstation labs for programming, data and AI coursework'],
  ['Electronics Lab', 'lab', 'cpu', 'Bench-equipped labs for circuits, VLSI and embedded systems'],
  ['Science Lab', 'lab', 'flask-conical', 'Wet and instrument laboratories'],
  ['Lecture Classroom', 'classroom', 'presentation', 'Tiered lecture rooms with projection'],
  ['Discussion Room', 'classroom', 'users', 'Small group study rooms'],
  ['Seminar Hall', 'hall', 'mic', 'Seminar halls and event spaces'],
  ['Auditorium', 'hall', 'landmark', 'Large-capacity auditoriums'],
  ['Equipment Kit', 'equipment', 'camera', 'Portable equipment issued from the central stores'],
] as const;

// code, name, category, building, room, floor, capacity, dept, requiresApproval, description
type R = [string, string, string, string, string, number, number, string | null, number, string];
const RESOURCES: R[] = [
  ['CSE-LAB-01', 'AI & Machine Learning Lab', 'Computer Lab', 'ENG', 'E-201', 2, 40, 'CSE', 1, 'GPU workstations with Python, PyTorch and TensorFlow pre-installed for model training sessions.'],
  ['CSE-LAB-02', 'Data Structures & Algorithms Lab', 'Computer Lab', 'ENG', 'E-202', 2, 60, 'CSE', 1, 'Sixty-seat programming lab used for contests, practicals and coding workshops.'],
  ['CSE-LAB-03', 'Database Systems Lab', 'Computer Lab', 'ENG', 'E-203', 2, 60, 'CSE', 1, 'MySQL, MongoDB and PostgreSQL servers available on every workstation.'],
  ['CSE-LAB-04', 'Cyber Security Lab', 'Computer Lab', 'ENG', 'E-204', 2, 30, 'CSE', 1, 'Isolated network segment for penetration-testing and forensics practicals.'],
  ['CSE-LAB-05', 'Cloud & DevOps Lab', 'Computer Lab', 'ENG', 'E-301', 3, 40, 'CSE', 1, 'Containers, CI/CD tooling and cloud sandboxes for DevOps coursework.'],
  ['ECE-LAB-01', 'Digital Electronics Lab', 'Electronics Lab', 'ENG', 'E-101', 1, 30, 'ECE', 1, 'Trainer kits, logic analysers and function generators on 15 benches.'],
  ['ECE-LAB-02', 'VLSI Design Lab', 'Electronics Lab', 'ENG', 'E-102', 1, 24, 'ECE', 1, 'EDA workstations running Cadence and Xilinx toolchains.'],
  ['ECE-LAB-03', 'Embedded Systems & IoT Lab', 'Electronics Lab', 'ENG', 'E-103', 1, 30, 'ECE', 1, 'ARM boards, Raspberry Pi and sensor kits for embedded projects.'],
  ['ECE-LAB-04', 'Communication Systems Lab', 'Electronics Lab', 'ENG', 'E-104', 1, 24, 'ECE', 1, 'Spectrum analysers and SDR kits for communication experiments.'],
  ['ME-LAB-01', 'CAD/CAM Lab', 'Computer Lab', 'ENG', 'E-110', 1, 36, 'ME', 1, 'SolidWorks and ANSYS workstations with a CNC simulation bay.'],
  ['SCI-LAB-01', 'Physics Laboratory', 'Science Lab', 'SCI', 'S-101', 1, 30, 'APSC', 1, 'Optics, modern physics and mechanics experiments.'],
  ['SCI-LAB-02', 'Chemistry Laboratory', 'Science Lab', 'SCI', 'S-102', 1, 30, 'APSC', 1, 'Fume-hood equipped laboratory for organic and inorganic practicals.'],
  ['SCI-LAB-03', 'Biotechnology Research Lab', 'Science Lab', 'SCI', 'S-201', 2, 20, 'BIO', 1, 'PCR, gel electrophoresis and cell-culture facilities.'],
  ['SCI-LAB-04', 'Microbiology Lab', 'Science Lab', 'SCI', 'S-202', 2, 20, 'BIO', 1, 'Incubators, autoclave and laminar-flow cabinets.'],
  ['CR-ENG-301', 'Lecture Room E-301', 'Lecture Classroom', 'ENG', 'E-301A', 3, 70, 'CSE', 0, 'Tiered lecture room with dual projectors and lecture capture.'],
  ['CR-ENG-302', 'Lecture Room E-302', 'Lecture Classroom', 'ENG', 'E-302', 3, 70, 'CSE', 0, 'Tiered lecture room with smart board.'],
  ['CR-ENG-303', 'Lecture Room E-303', 'Lecture Classroom', 'ENG', 'E-303', 3, 60, 'ECE', 0, 'Flat-floor classroom suited to tutorials and examinations.'],
  ['CR-SCI-103', 'Lecture Room S-103', 'Lecture Classroom', 'SCI', 'S-103', 1, 80, 'APSC', 0, 'Large lecture room with demonstration bench.'],
  ['CR-SCI-104', 'Lecture Room S-104', 'Lecture Classroom', 'SCI', 'S-104', 1, 60, 'APSC', 0, 'Standard lecture room with projector.'],
  ['CR-MGT-101', 'Case Study Room M-101', 'Lecture Classroom', 'MGT', 'M-101', 1, 50, 'MGT', 0, 'Horseshoe seating built for case-method teaching.'],
  ['CR-MGT-102', 'Case Study Room M-102', 'Lecture Classroom', 'MGT', 'M-102', 1, 50, 'MGT', 0, 'Horseshoe seating with dual displays.'],
  ['DR-LIB-01', 'Group Study Room 1', 'Discussion Room', 'LIB', 'L-G1', 0, 8, 'LIB', 0, 'Glass-walled room with whiteboard and display. Instant confirmation.'],
  ['DR-LIB-02', 'Group Study Room 2', 'Discussion Room', 'LIB', 'L-G2', 0, 8, 'LIB', 0, 'Quiet room for project discussions. Instant confirmation.'],
  ['DR-LIB-03', 'Group Study Room 3', 'Discussion Room', 'LIB', 'L-G3', 0, 10, 'LIB', 0, 'Ten-seat room with wall display. Instant confirmation.'],
  ['DR-LIB-04', 'Group Study Room 4', 'Discussion Room', 'LIB', 'L-G4', 0, 6, 'LIB', 0, 'Compact room for pair programming and viva practice. Instant confirmation.'],
  ['HALL-MGT-A', 'Seminar Hall A', 'Seminar Hall', 'MGT', 'M-S1', 1, 150, 'MGT', 1, 'Air-conditioned seminar hall with stage, PA system and recording.'],
  ['HALL-ENG-B', 'Seminar Hall B', 'Seminar Hall', 'ENG', 'E-S1', 0, 120, 'CSE', 1, 'Seminar hall used for guest lectures and workshops.'],
  ['HALL-LIB-IS', 'Innovation Studio', 'Seminar Hall', 'LIB', 'L-IS', 2, 40, 'LIB', 1, 'Flexible makerspace with movable furniture and demo area.'],
  ['AUD-MAIN', 'Convocation Auditorium', 'Auditorium', 'AUD', 'A-100', 0, 800, null, 1, 'Main auditorium with stage lighting, live-stream rig and green rooms.'],
  ['EQ-PRJ-01', 'Portable Projector Kit 1', 'Equipment Kit', 'STR', 'STR-01', 0, 1, null, 1, 'Full-HD projector with screen, HDMI/VGA leads and extension.'],
  ['EQ-PRJ-02', 'Portable Projector Kit 2', 'Equipment Kit', 'STR', 'STR-01', 0, 1, null, 1, 'Full-HD projector with screen, HDMI/VGA leads and extension.'],
  ['EQ-CAM-01', 'DSLR Camera & Tripod Kit', 'Equipment Kit', 'STR', 'STR-02', 0, 1, null, 1, 'Camera body, two lenses, tripod and lighting for event coverage.'],
  ['EQ-VR-01', 'VR Headset Set (6 units)', 'Equipment Kit', 'STR', 'STR-02', 0, 6, null, 1, 'Six standalone VR headsets with controllers for immersive-learning projects.'],
  ['EQ-IOT-01', 'Raspberry Pi & Arduino Project Bundle', 'Equipment Kit', 'STR', 'STR-03', 0, 10, null, 1, 'Ten Raspberry Pi 4 boards, Arduino Uno kits and sensor packs.'],
  ['EQ-OSC-01', 'Digital Oscilloscope Set', 'Equipment Kit', 'STR', 'STR-03', 0, 4, 'ECE', 1, 'Four 100 MHz oscilloscopes with probes for off-lab experiments.'],
  ['EQ-3DP-01', '3D Printer Station', 'Equipment Kit', 'STR', 'STR-04', 0, 2, 'ME', 1, 'Dual-nozzle FDM printer with filament starter pack.'],
];

// resourceCode -> [name, qty, bookableAddon]
const EQUIP: Record<string, Array<[string, number, number]>> = {
  'CSE-LAB-01': [['GPU Workstation (RTX 4080)', 20, 0], ['NVIDIA Jetson Nano Kit', 6, 1]],
  'CSE-LAB-02': [['Desktop Workstation i5', 60, 0], ['Interactive Display 75"', 1, 0]],
  'CSE-LAB-03': [['Desktop Workstation i5', 60, 0], ['Database Server Rack', 2, 0]],
  'CSE-LAB-04': [['Network Switch (managed)', 6, 0], ['Forensics Imaging Kit', 4, 1]],
  'CSE-LAB-05': [['Desktop Workstation i7', 40, 0], ['Raspberry Pi Cluster', 2, 1]],
  'ECE-LAB-01': [['Digital Trainer Kit', 15, 1], ['Logic Analyser', 8, 1]],
  'ECE-LAB-02': [['EDA Workstation', 24, 0], ['FPGA Development Board', 12, 1]],
  'ECE-LAB-03': [['STM32 Development Board', 20, 1], ['Sensor Kit (assorted)', 15, 1]],
  'ECE-LAB-04': [['Spectrum Analyser', 4, 1], ['Software Defined Radio Kit', 8, 1]],
  'ME-LAB-01': [['CAD Workstation', 36, 0], ['Desktop CNC Trainer', 2, 0]],
  'SCI-LAB-01': [['Optical Bench Set', 10, 1], ['Spectrometer', 3, 1]],
  'SCI-LAB-02': [['Fume Hood', 6, 0], ['Analytical Balance', 5, 1]],
  'SCI-LAB-03': [['Thermal Cycler (PCR)', 3, 1], ['Gel Electrophoresis Unit', 6, 1]],
  'SCI-LAB-04': [['Laminar Flow Cabinet', 2, 0], ['Autoclave', 1, 0]],
  'CR-ENG-301': [['Ceiling Projector', 2, 0], ['Wireless Microphone', 2, 1]],
  'CR-SCI-103': [['Ceiling Projector', 1, 0], ['Document Camera', 1, 1]],
  'CR-MGT-101': [['Dual Display Wall', 2, 0], ['Wireless Microphone', 2, 1]],
  'HALL-MGT-A': [['Line-array PA System', 1, 0], ['Wireless Microphone', 6, 1], ['Lapel Microphone', 4, 1], ['Presentation Clicker', 3, 1]],
  'HALL-ENG-B': [['Ceiling Projector', 2, 0], ['Wireless Microphone', 4, 1]],
  'HALL-LIB-IS': [['Movable Whiteboard', 6, 1], ['Portable Speaker', 2, 1]],
  'AUD-MAIN': [['Stage Lighting Rig', 1, 0], ['Wireless Microphone', 10, 1], ['Live-stream Camera', 3, 1]],
  'DR-LIB-01': [['Wall Display 55"', 1, 0]], 'DR-LIB-03': [['Wall Display 65"', 1, 0]],
  'EQ-PRJ-01': [['Projector Screen (tripod)', 1, 0]], 'EQ-CAM-01': [['Prime Lens 50mm', 1, 0], ['LED Light Panel', 2, 0]],
  'EQ-OSC-01': [['Oscilloscope Probe Set', 8, 0]], 'EQ-3DP-01': [['PLA Filament Spool', 6, 0]],
};

// resourceCode -> [courseCode, courseName, dow(0=Mon), startMin, endMin]
const SCHEDULES: Array<[string, string, string, number, number, number]> = [
  ['CSE-LAB-01', 'CS451', 'Machine Learning Lab', 0, 600, 720], ['CSE-LAB-01', 'CS455', 'Deep Learning Lab', 2, 840, 960],
  ['CSE-LAB-02', 'CS201', 'Data Structures Lab', 1, 540, 660], ['CSE-LAB-02', 'CS203', 'Algorithms Lab', 3, 780, 900],
  ['CSE-LAB-03', 'CS301', 'DBMS Lab', 0, 540, 660], ['CSE-LAB-03', 'CS301', 'DBMS Lab (Section B)', 2, 600, 720], ['CSE-LAB-03', 'CS305', 'Data Mining Lab', 4, 840, 960],
  ['CSE-LAB-04', 'CS420', 'Ethical Hacking Lab', 1, 840, 960], ['CSE-LAB-05', 'CS440', 'Cloud Computing Lab', 3, 600, 720],
  ['ECE-LAB-01', 'EC201', 'Digital Logic Lab', 0, 540, 660], ['ECE-LAB-01', 'EC201', 'Digital Logic Lab (B)', 3, 540, 660],
  ['ECE-LAB-02', 'EC410', 'VLSI Design Lab', 1, 600, 780], ['ECE-LAB-03', 'EC330', 'Embedded Systems Lab', 2, 540, 690], ['ECE-LAB-04', 'EC340', 'Communication Lab', 4, 540, 660],
  ['ME-LAB-01', 'ME310', 'CAD Practice', 1, 540, 660], ['ME-LAB-01', 'ME312', 'CAM Practice', 3, 840, 960],
  ['SCI-LAB-01', 'PH101', 'Physics Practical', 0, 840, 960], ['SCI-LAB-01', 'PH101', 'Physics Practical (B)', 3, 540, 660],
  ['SCI-LAB-02', 'CH101', 'Chemistry Practical', 1, 540, 690], ['SCI-LAB-02', 'CH101', 'Chemistry Practical (B)', 4, 840, 990],
  ['SCI-LAB-03', 'BT401', 'Molecular Biology Lab', 2, 840, 1020], ['SCI-LAB-04', 'BT320', 'Microbiology Practical', 0, 540, 690],
  ['CR-ENG-301', 'CS101', 'Programming Fundamentals', 0, 540, 600], ['CR-ENG-301', 'CS101', 'Programming Fundamentals', 2, 540, 600], ['CR-ENG-301', 'CS303', 'Operating Systems', 1, 600, 660],
  ['CR-ENG-302', 'CS305', 'Computer Networks', 0, 660, 720], ['CR-ENG-302', 'CS305', 'Computer Networks', 3, 660, 720], ['CR-ENG-302', 'CS302', 'Theory of Computation', 4, 540, 600],
  ['CR-ENG-303', 'EC203', 'Signals & Systems', 1, 540, 600], ['CR-ENG-303', 'EC203', 'Signals & Systems', 3, 540, 600],
  ['CR-SCI-103', 'MA101', 'Engineering Mathematics I', 0, 540, 600], ['CR-SCI-103', 'MA101', 'Engineering Mathematics I', 2, 540, 600], ['CR-SCI-103', 'MA101', 'Engineering Mathematics I', 4, 540, 600],
  ['CR-SCI-104', 'PH102', 'Engineering Physics', 1, 660, 720], ['CR-SCI-104', 'CH102', 'Engineering Chemistry', 3, 660, 720],
  ['CR-MGT-101', 'MB501', 'Marketing Management', 0, 600, 690], ['CR-MGT-101', 'MB503', 'Corporate Finance', 2, 600, 690],
  ['CR-MGT-102', 'MB502', 'Organisational Behaviour', 1, 600, 690], ['CR-MGT-102', 'MB505', 'Operations Management', 3, 600, 690],
  ['HALL-MGT-A', 'MB599', 'Guest Lecture Series', 4, 900, 990],
];

const FIRST_M = ['Aarav', 'Vihaan', 'Arjun', 'Reyansh', 'Ishaan', 'Kabir', 'Rohan', 'Aditya', 'Karan', 'Siddharth', 'Dev', 'Yash', 'Pranav', 'Harsh', 'Nikhil', 'Manav', 'Tanmay', 'Utkarsh', 'Rahul', 'Ayush', 'Shaurya', 'Naman', 'Parth', 'Kunal'];
const FIRST_F = ['Ananya', 'Diya', 'Saanvi', 'Aadhya', 'Myra', 'Kiara', 'Riya', 'Sneha', 'Pooja', 'Ishita', 'Kavya', 'Meera', 'Nisha', 'Tanvi', 'Aditi', 'Simran', 'Shreya', 'Divya', 'Neha', 'Prisha', 'Aarohi', 'Mahima', 'Trisha', 'Zoya'];
const LAST = ['Sharma', 'Verma', 'Gupta', 'Singh', 'Kumar', 'Patel', 'Reddy', 'Nair', 'Iyer', 'Mehta', 'Joshi', 'Chopra', 'Malhotra', 'Bose', 'Das', 'Rao', 'Kapoor', 'Agarwal', 'Bhatt', 'Desai', 'Menon', 'Pillai', 'Saxena', 'Tiwari', 'Yadav', 'Khanna', 'Sethi', 'Banerjee', 'Chauhan', 'Thakur'];

const PURPOSE: Record<string, string[]> = {
  lab: ['Capstone project experiments', 'Lab practical make-up session', 'Hackathon preparation', 'Research data collection', 'Model training run for final-year project', 'Workshop on practical tooling', 'Project demonstration rehearsal', 'Peer-learning lab session'],
  classroom: ['Extra lecture for syllabus completion', 'Doubt-clearing session before mid-semester exam', 'Tutorial class', 'Departmental meeting', 'Student club orientation', 'Mock interview rounds', 'Group presentation practice'],
  hall: ['Guest lecture by industry speaker', 'Technical symposium event', 'Alumni interaction session', 'Faculty development programme', 'Student council meeting', 'Department seminar series', 'Placement preparation talk'],
  equipment: ['Event coverage for club activity', 'Project demonstration off-campus', 'Course project data capture', 'Workshop demonstration', 'Prototype testing'],
};
const REMARKS_OK = ['Approved. Please vacate on time.', 'Approved for the stated purpose.', 'Looks fine. Carry your ID card.', 'Approved by lab in-charge.'];
const REMARKS_NO = ['Resource reserved for departmental exams.', 'Insufficient justification, please resubmit with details.', 'Overlaps with a faculty-priority event.', 'Attendee count too high for safe lab use.'];

// ------------------------------------------------------------------- main
async function main() {
  const force = process.argv.includes('--force');
  const pool = getPool();
  const conn = await pool.getConnection();
  const q = async <T = RowDataPacket>(sql: string, params: unknown[] = []) => (await conn.query(sql, params))[0] as T[];
  const insert = async (table: string, cols: string[], rows: unknown[][]) => {
    for (let i = 0; i < rows.length; i += 500) await conn.query(`INSERT INTO ${table} (${cols.join(',')}) VALUES ?`, [rows.slice(i, i + 500)]);
  };

  const [{ c }] = await q<{ c: number }>('SELECT COUNT(*) AS c FROM users');
  if (Number(c) > 0 && !force) {
    console.log('Database already contains data. Re-run with "npm run db:seed -- --force" to wipe and re-seed.');
    conn.release(); await closePool(); return;
  }

  console.log('Seeding MySQL ...');
  await conn.query('SET FOREIGN_KEY_CHECKS = 0');
  for (const t of ['booking_equipment', 'booking_approvals', 'booking_status_history', 'notifications', 'bookings', 'maintenance_requests', 'academic_schedules',
    'equipment', 'resources', 'resource_categories', 'rooms', 'buildings', 'password_reset_tokens', 'revoked_tokens', 'users', 'departments']) {
    await conn.query(`TRUNCATE TABLE ${t}`);
  }
  await conn.query('SET FOREIGN_KEY_CHECKS = 1');
  await conn.query('SET @sc_seeding = 1');

  // ---- reference tables
  await insert('departments', ['code', 'name', 'contact_email'], DEPARTMENTS.map(([c2, n]) => [c2, n, `${c2.toLowerCase()}@smartcampus.edu`]));
  await insert('buildings', ['code', 'name', 'total_floors', 'description'], BUILDINGS as unknown as unknown[][]);
  await insert('resource_categories', ['name', 'kind', 'icon', 'description'], CATEGORIES as unknown as unknown[][]);
  const idMap = async (table: string, key: string) => Object.fromEntries((await q<RowDataPacket>(`SELECT id, ${key} AS k FROM ${table}`)).map((r) => [r.k, r.id as number]));
  const dept = await idMap('departments', 'code'); const bld = await idMap('buildings', 'code'); const cat = await idMap('resource_categories', 'name');
  const kindOf = Object.fromEntries(CATEGORIES.map((c2) => [c2[0], c2[1]]));

  // ---- users
  const pw = { admin: await bcrypt.hash('Admin@12345', 10), faculty: await bcrypt.hash('Faculty@12345', 10), student: await bcrypt.hash('Student@12345', 10) };
  const usedEmails = new Set<string>();
  const makeEmail = (f: string, l: string) => {
    let e = `${f}.${l}`.toLowerCase(); let n = 1; let out = `${e}@smartcampus.edu`;
    while (usedEmails.has(out)) out = `${e}${++n}@smartcampus.edu`;
    usedEmails.add(out); return out;
  };
  const userRows: unknown[][] = [];
  const mkUser = (role: 'admin' | 'faculty' | 'student', first: string, last: string, memberId: string, deptCode: string | null, createdDays: number, title = '') => {
    userRows.push([{ admin: 1, faculty: 2, student: 3 }[role], deptCode ? dept[deptCode] : null, makeEmail(first, last), pw[role], `${title}${first} ${last}`, memberId,
      `+91 9${int(100000000, 999999999)}`, 'active', fmt(addDays(NOW, -int(0, 20))), fmt(addDays(NOW, -createdDays))]);
  };
  mkUser('admin', 'Neha', 'Kapoor', 'ADM-001', 'LIB', 400); mkUser('admin', 'Rohit', 'Verma', 'ADM-002', 'CSE', 380); mkUser('admin', 'Anjali', 'Deshmukh', 'ADM-003', 'MGT', 350);
  const deptCodes = DEPARTMENTS.map((d) => d[0]).filter((d) => d !== 'LIB');
  const facultyNames: Array<[string, string]> = [['Meera', 'Nair']];
  while (facultyNames.length < 18) { const f = pick([...FIRST_M, ...FIRST_F]); const l = pick(LAST); if (!facultyNames.some((x) => x[0] === f && x[1] === l)) facultyNames.push([f, l]); }
  facultyNames.forEach(([f, l], i) => mkUser('faculty', f, l, `FAC-${1001 + i}`, i === 0 ? 'CSE' : deptCodes[i % deptCodes.length], 300 - i * 5, 'Dr. '));
  const studentNames: Array<[string, string]> = [['Aarav', 'Sharma']];
  while (studentNames.length < 110) { const f = pick([...FIRST_M, ...FIRST_F]); const l = pick(LAST); if (!studentNames.some((x) => x[0] === f && x[1] === l)) studentNames.push([f, l]); }
  studentNames.forEach(([f, l], i) => { const dc = i === 0 ? 'CSE' : deptCodes[i % deptCodes.length]; mkUser('student', f, l, `SC${24 + (i % 3)}${dc}${String(i + 1).padStart(3, '0')}`, dc, 200 - (i % 150)); });
  await insert('users', ['role_id', 'department_id', 'email', 'password_hash', 'full_name', 'member_id', 'phone', 'status', 'last_login_at', 'created_at'], userRows);
  // a couple of suspended students for the admin user-management screen
  await q("UPDATE users SET status = 'suspended' WHERE role_id = 3 AND id IN (SELECT id FROM (SELECT id FROM users WHERE role_id = 3 ORDER BY id DESC LIMIT 2) t)");
  const users = await q<RowDataPacket>('SELECT u.id, u.full_name, u.email, u.status, u.department_id, r.name AS role FROM users u JOIN roles r ON r.id = u.role_id ORDER BY u.id');
  const admins = users.filter((u) => u.role === 'admin'); const faculty = users.filter((u) => u.role === 'faculty');
  const students = users.filter((u) => u.role === 'student' && u.status === 'active');

  // ---- rooms + resources + equipment
  const roomKey = (b: string, r: string) => `${b}|${r}`;
  const roomSeen = new Map<string, number>(); const roomRows: unknown[][] = [];
  for (const r of RESOURCES) { const k = roomKey(r[3], r[4]); roomSeen.set(k, Math.max(roomSeen.get(k) ?? 0, r[6])); }
  const roomFloor = new Map(RESOURCES.map((r) => [roomKey(r[3], r[4]), r[5]]));
  for (const [k, capacity] of roomSeen) { const [b, rn] = k.split('|'); roomRows.push([bld[b], rn, roomFloor.get(k), capacity]); }
  await insert('rooms', ['building_id', 'room_number', 'floor_no', 'capacity'], roomRows);
  const rooms = Object.fromEntries((await q<RowDataPacket>('SELECT id, building_id, room_number FROM rooms')).map((r) => [`${r.building_id}|${r.room_number}`, r.id as number]));
  await insert('resources', ['code', 'name', 'category_id', 'room_id', 'department_id', 'capacity', 'description', 'requires_approval', 'created_at'],
    RESOURCES.map((r) => [r[0], r[1], cat[r[2]], rooms[`${bld[r[3]]}|${r[4]}`], r[7] ? dept[r[7]] : null, r[6], r[9], r[8], fmt(addDays(NOW, -420))]));
  const res = await q<RowDataPacket>('SELECT id, code, capacity, requires_approval FROM resources');
  const resByCode = Object.fromEntries(res.map((r) => [r.code, r]));
  const meta = Object.fromEntries(RESOURCES.map((r) => [r[0], { kind: kindOf[r[2]], category: r[2] }]));

  const eqRows: unknown[][] = []; let tag = 1000;
  for (const [code, items] of Object.entries(EQUIP)) for (const [name, qty, addon] of items) eqRows.push([resByCode[code].id, name, `SC-EQ-${++tag}`, qty, 'operational', addon, fmt(addDays(NOW, -300))]);
  await insert('equipment', ['resource_id', 'name', 'asset_tag', 'quantity_total', 'status', 'bookable_addon', 'created_at'], eqRows);
  await q("UPDATE equipment SET status = 'under_repair' WHERE name IN ('Spectrum Analyser', 'Thermal Cycler (PCR)') ");
  const addons = await q<RowDataPacket>("SELECT id, resource_id, quantity_total FROM equipment WHERE bookable_addon = 1 AND status = 'operational'");

  // ---- timetable
  const semFrom = fmtDate(addDays(TODAY, -110)); const semTo = fmtDate(addDays(TODAY, 45));
  await insert('academic_schedules', ['resource_id', 'faculty_id', 'course_code', 'course_name', 'semester', 'day_of_week', 'start_time', 'end_time', 'valid_from', 'valid_to'],
    SCHEDULES.map(([code, cc, cn, dow, s, e]) => [resByCode[code].id, pick(faculty).id, cc, cn, 'Autumn 2026', dow, `${pad(Math.floor(s / 60))}:${pad(s % 60)}:00`, `${pad(Math.floor(e / 60))}:${pad(e % 60)}:00`, semFrom, semTo]));

  // ---- maintenance (created first so generated bookings avoid the windows)
  type M = [string, string, string, 'low' | 'medium' | 'high' | 'critical', string, number, number | null, boolean];
  const MAINT: M[] = [
    ['CSE-LAB-04', 'Air-conditioning compressor failure', 'Lab temperature exceeds safe limits for server equipment; vendor engaged.', 'high', 'in_progress', -1, 3, false],
    ['EQ-VR-01', 'Headset lens and controller replacement', 'Three headsets report tracking drift and cracked lenses.', 'medium', 'in_progress', -2, 5, false],
    ['SCI-LAB-02', 'Fume hood annual certification', 'Statutory airflow certification of all six fume hoods.', 'medium', 'open', 9, 10, false],
    ['ECE-LAB-02', 'EDA licence server upgrade', 'Licence server migration; workstations offline during cut-over.', 'low', 'open', 14, 15, false],
    ['HALL-MGT-A', 'Projector lamp not powering on', 'Left projector shuts down after a few minutes.', 'medium', 'reported', 0, null, true],
    ['DR-LIB-02', 'Whiteboard surface damaged', 'Ghosting marks that cannot be erased.', 'low', 'reported', 0, null, true],
    ['CSE-LAB-02', 'Workstation power strips replaced', 'Replacement of 12 faulty power strips.', 'medium', 'resolved', -40, -38, false],
    ['SCI-LAB-01', 'Spectrometer calibration', 'Annual calibration by manufacturer.', 'low', 'resolved', -60, -59, false],
    ['CR-ENG-301', 'Ceiling projector realignment', 'Image keystone corrected.', 'low', 'closed', -75, -74, false],
    ['ECE-LAB-01', 'Bench trainer kit repair', 'Five trainer kits repaired.', 'medium', 'resolved', -90, -86, false],
    ['AUD-MAIN', 'Stage lighting rig inspection', 'Quarterly safety inspection.', 'medium', 'closed', -100, -99, false],
    ['EQ-3DP-01', 'Extruder nozzle clog cleaning', 'Cleaned and recalibrated.', 'low', 'resolved', -30, -29, false],
    ['CSE-LAB-05', 'Network cabling upgrade', 'Cat6A upgrade of rear benches.', 'medium', 'resolved', -120, -117, false],
    ['SCI-LAB-04', 'Autoclave seal replacement', 'Door gasket replaced and pressure tested.', 'high', 'closed', -50, -48, false],
  ];
  const staff = admins;
  const blocked: Record<number, Array<[number, number]>> = {};
  const maintRows = MAINT.map(([code, title, desc, pr, st, s, e, reported]) => {
    const rid = resByCode[code].id as number;
    const start = atMin(addDays(TODAY, s), s >= 0 && st !== 'reported' ? 480 : 480);
    const end = e === null ? null : atMin(addDays(TODAY, e), 1200);
    (blocked[rid] ??= []).push([start.getTime(), (end ?? addDays(start, 2)).getTime()]);
    return [rid, reported ? pick(users.filter((u) => u.role !== 'admin')).id : pick(staff).id, st === 'reported' ? null : pick(staff).id, title, desc, pr, st,
      fmt(start), end ? fmt(end) : null, ['resolved', 'closed'].includes(st) && end ? fmt(end) : null];
  });
  await insert('maintenance_requests', ['resource_id', 'reported_by', 'assigned_to', 'title', 'description', 'priority', 'status', 'starts_at', 'expected_end', 'resolved_at'], maintRows);

  // ---- bookings
  console.log('Generating bookings ...');
  const busy: Record<number, Array<[number, number]>> = {};
  for (const [k, v] of Object.entries(blocked)) busy[Number(k)] = [...v];
  const sched = SCHEDULES.map(([code, , , dow, s, e]) => ({ rid: resByCode[code].id as number, dow, s, e }));
  const hasClass = (rid: number, day: Date, s: number, e: number) => {
    const dow = (day.getDay() + 6) % 7;
    return sched.some((x) => x.rid === rid && x.dow === dow && x.s < e && x.e > s);
  };
  const weights = RESOURCES.map((r) => ({ code: r[0], w: r[0].startsWith('DR-') ? 9 : r[0].startsWith('CSE-LAB') ? 10 : r[0].startsWith('HALL') ? 3 : r[0].startsWith('EQ-') ? 2 : r[0].startsWith('AUD') ? 1 : 3 }));
  const bag = weights.flatMap((w) => Array(w.w).fill(w.code) as string[]);

  type B = { rid: number; code: string; uid: number; role: string; start: Date; end: Date; purpose: string; attendees: number; status: string; created: Date; requires: number; cancelReason: string | null };
  const bookings: B[] = [];
  let attempts = 0;
  while (bookings.length < 1700 && attempts++ < 80000) {
    const code = pick(bag); const r = resByCode[code]; const kind = meta[code].kind;
    const rd = rnd(); const dayOffset = rd < 0.62 ? -int(1, 60) : rd < 0.76 ? -int(61, 150) : int(0, 24);
    const day = addDays(TODAY, dayOffset);
    if (day.getDay() === 0) continue;
    const user = (kind === 'classroom' || kind === 'hall') ? (chance(0.75) ? pick(faculty) : pick(students)) : (chance(0.8) ? pick(students) : pick(faculty));
    const isFac = user.role === 'faculty';
    const durOpts = isFac ? [60, 90, 120, 180, 240] : [60, 90, 120, 180];
    const dur = pick(durOpts); const startMin = pick([480, 510, 540, 570, 600, 630, 660, 690, 720, 780, 810, 840, 870, 900, 930, 960, 990, 1020]);
    const endMin = startMin + dur;
    if (endMin > 1200) continue;
    const start = atMin(day, startMin); const end = atMin(day, endMin);
    const rid = r.id as number;
    if (hasClass(rid, day, startMin, endMin)) continue;
    if ((busy[rid] ?? []).some(([a, b]) => a < end.getTime() && b > start.getTime())) continue;
    (busy[rid] ??= []).push([start.getTime(), end.getTime()]);

    const requires = Number(r.requires_approval);
    const past = end < NOW;
    const roll = rnd(); let status: string; let cancelReason: string | null = null;
    if (past) status = roll < 0.78 ? 'completed' : roll < 0.9 ? 'cancelled' : (requires ? 'rejected' : 'completed');
    else status = roll < 0.4 ? 'approved' : roll < 0.76 ? (requires ? 'pending' : 'approved') : roll < 0.88 ? 'cancelled' : (requires ? 'rejected' : 'approved');
    if (status === 'cancelled') cancelReason = pick(['Plans changed', 'Clashing exam schedule', 'Event postponed', 'Team could not assemble', 'Booked by mistake']);
    if (start <= NOW && !past && status === 'pending') status = 'approved'; // ongoing bookings are never still pending
    const created = new Date(start.getTime() - int(1, 10) * 86400_000 - int(0, 8) * 3600_000);
    if (created > NOW) created.setTime(NOW.getTime() - int(1, 48) * 3600_000);
    const cap = Number(r.capacity);
    const attendees = kind === 'equipment' ? 1 : isFac ? Math.max(5, Math.floor(cap * (0.3 + rnd() * 0.6))) : int(2, Math.min(cap, kind === 'lab' ? 6 : 8));
    bookings.push({ rid, code, uid: user.id, role: user.role, start, end, purpose: pick(PURPOSE[kind]), attendees: Math.min(attendees, cap), status, created, requires, cancelReason });
  }
  bookings.sort((a, b) => a.created.getTime() - b.created.getTime());
  const bookingRows = bookings.map((b, i) => [`BK-${fmt(b.created).slice(2, 4)}${fmt(b.created).slice(5, 7)}-${String(100000 + i * 7).slice(1)}`, b.rid, b.uid, fmt(b.start), fmt(b.end), b.purpose, b.attendees, b.status,
    b.cancelReason, b.status === 'cancelled' ? fmt(new Date(Math.min(NOW.getTime(), b.start.getTime() - 3600_000 * int(1, 48)))) : null, fmt(b.created)]);
  await insert('bookings', ['booking_code', 'resource_id', 'user_id', 'start_time', 'end_time', 'purpose', 'attendees', 'status', 'cancel_reason', 'cancelled_at', 'created_at'], bookingRows);
  const dbBookings = await q<RowDataPacket>('SELECT id, booking_code FROM bookings ORDER BY created_at, id');
  const byIdx = bookings.map((b, i) => ({ ...b, id: dbBookings.find((d) => d.booking_code === bookingRows[i][0])!.id as number }));

  // ---- approvals, history, equipment add-ons, notifications
  const apRows: unknown[][] = []; const histRows: unknown[][] = []; const beRows: unknown[][] = []; const notifRows: unknown[][] = [];
  const bname = Object.fromEntries(RESOURCES.map((r) => [r[0], r[1]]));
  const when = (b: B) => `${b.start.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}, ${b.start.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })} - ${b.end.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`;
  const recent = (d: Date) => NOW.getTime() - d.getTime() < 20 * 86400_000;
  for (const b of byIdx) {
    const adm = pick(admins).id as number;
    const decidedAt = new Date(Math.min(NOW.getTime() - 60_000, b.created.getTime() + int(1, 20) * 3600_000));
    const wasDecided = ['approved', 'completed', 'rejected'].includes(b.status) || (b.status === 'cancelled' && chance(0.5));
    histRows.push([b.id, null, b.requires ? 'pending' : 'approved', b.uid, fmt(b.created)]);
    notifRows.push([b.uid, b.requires ? 'booking_created' : 'booking_approved', b.requires ? 'Booking request received' : 'Booking confirmed',
      b.requires ? `Your request for ${bname[b.code]} on ${when(b)} is awaiting administrator approval.` : `${bname[b.code]} is confirmed for ${when(b)}.`, b.id, recent(b.created) ? (chance(0.5) ? 0 : 1) : 1, fmt(b.created)]);
    if (!b.requires) {
      apRows.push([b.id, null, 'auto_approved', 'Approved automatically by policy', fmt(b.created)]);
    } else if (wasDecided) {
      const rejected = b.status === 'rejected';
      apRows.push([b.id, adm, rejected ? 'rejected' : 'approved', rejected ? pick(REMARKS_NO) : pick(REMARKS_OK), fmt(decidedAt)]);
      histRows.push([b.id, 'pending', rejected ? 'rejected' : 'approved', adm, fmt(decidedAt)]);
      notifRows.push([b.uid, rejected ? 'booking_rejected' : 'booking_approved', rejected ? 'Booking rejected' : 'Booking approved',
        `${bname[b.code]} on ${when(b)} was ${rejected ? 'rejected' : 'approved'}.`, b.id, recent(decidedAt) ? (chance(0.5) ? 0 : 1) : 1, fmt(decidedAt)]);
    }
    if (b.status === 'completed') histRows.push([b.id, 'approved', 'completed', null, fmt(new Date(b.end.getTime() + 60_000))]);
    if (b.status === 'cancelled') {
      const when2 = new Date(Math.min(NOW.getTime(), b.start.getTime() - 3600_000 * int(1, 48)));
      histRows.push([b.id, wasDecided || !b.requires ? 'approved' : 'pending', 'cancelled', b.uid, fmt(when2)]);
      notifRows.push([b.uid, 'booking_cancelled', 'Booking cancelled', `${bname[b.code]} on ${when(b)} was cancelled. Reason: ${b.cancelReason}`, b.id, recent(when2) ? (chance(0.5) ? 0 : 1) : 1, fmt(when2)]);
    }
    if (b.status !== 'cancelled' && b.status !== 'rejected' && chance(0.35)) {
      const opts = addons.filter((a) => a.resource_id === b.rid);
      if (opts.length) { const e = pick(opts); beRows.push([b.id, e.id, Math.min(int(1, 3), Number(e.quantity_total))]); }
    }
  }
  // admin notifications for currently pending requests
  for (const b of byIdx.filter((x) => x.status === 'pending')) {
    for (const a of admins) notifRows.push([a.id, 'booking_created', 'New booking awaiting approval', `${users.find((u) => u.id === b.uid)!.full_name} requested ${bname[b.code]} on ${when(b)}.`, b.id, chance(0.6) ? 0 : 1, fmt(b.created)]);
  }
  for (const m of maintRows.filter((m) => m[6] === 'reported')) for (const a of admins) notifRows.push([a.id, 'maintenance_update', 'New maintenance report', `${m[3]} (priority ${m[5]}).`, null, 0, fmt(addDays(NOW, -0))]);
  await insert('booking_approvals', ['booking_id', 'admin_id', 'decision', 'remarks', 'decided_at'], apRows);
  await insert('booking_status_history', ['booking_id', 'old_status', 'new_status', 'changed_by', 'changed_at'], histRows);
  if (beRows.length) await insert('booking_equipment', ['booking_id', 'equipment_id', 'quantity'], beRows);
  await insert('notifications', ['user_id', 'type', 'title', 'message', 'booking_id', 'is_read', 'created_at'], notifRows);
  await conn.query('SET @sc_seeding = 0');

  // ---- counts
  const tables = ['roles', 'departments', 'buildings', 'rooms', 'resource_categories', 'resources', 'equipment', 'academic_schedules', 'users', 'bookings', 'booking_approvals',
    'booking_status_history', 'booking_equipment', 'maintenance_requests', 'notifications', 'system_settings'];
  let total = 0; const summary: string[] = [];
  for (const t of tables) { const [{ n }] = await q<{ n: number }>(`SELECT COUNT(*) AS n FROM ${t}`); total += Number(n); summary.push(`${t}=${n}`); }
  console.log(`MySQL seeded: ${total} rows\n  ${summary.join(', ')}`);

  // ---- MongoDB history (optional)
  try {
    await mongoose.connect(env.MONGO_URI, { serverSelectionTimeoutMS: 2500 });
    await Promise.all([ActivityLog.deleteMany({ 'metadata.seeded': true }), BookingAudit.deleteMany({ note: /^\[seed\]/ })]);
    const acts: Record<string, unknown>[] = [];
    for (let i = 0; i < 260; i++) {
      const u = pick(users); const when2 = new Date(NOW.getTime() - int(0, 40 * 24 * 60) * 60_000);
      acts.push({ userId: u.id, userEmail: u.email, userName: u.full_name, role: u.role, action: 'auth.login', category: 'auth', description: 'Signed in', success: true, ip: `10.20.${int(1, 20)}.${int(2, 250)}`, metadata: { seeded: true }, createdAt: when2 });
    }
    for (let i = 0; i < 12; i++) acts.push({ userEmail: pick(users).email, action: 'auth.login_failed', category: 'auth', description: 'Incorrect email or password', success: false, ip: `10.20.${int(1, 20)}.${int(2, 250)}`, metadata: { seeded: true }, createdAt: new Date(NOW.getTime() - int(0, 14 * 24 * 60) * 60_000) });
    for (const b of byIdx) {
      const u = users.find((x) => x.id === b.uid)!;
      acts.push({ userId: u.id, userEmail: u.email, userName: u.full_name, role: u.role, action: 'booking.create', category: 'booking', entityType: 'booking', entityId: String(b.id), description: `Booked ${bname[b.code]}`, success: true, metadata: { seeded: true }, createdAt: b.created });
    }
    await ActivityLog.insertMany(acts);
    const audits: Record<string, unknown>[] = [];
    for (const b of byIdx) {
      const u = users.find((x) => x.id === b.uid)!;
      const code = dbBookings.find((d) => d.id === b.id)!.booking_code;
      const snap = { status: b.status, startTime: fmt(b.start).replace(' ', 'T'), endTime: fmt(b.end).replace(' ', 'T'), purpose: b.purpose, attendees: b.attendees };
      audits.push({ bookingId: b.id, bookingCode: code, event: 'created', actorId: u.id, actorName: u.full_name, actorRole: u.role, resourceId: b.rid, resourceName: bname[b.code], snapshot: snap, note: '[seed] historical event', createdAt: b.created });
      if (['approved', 'completed', 'rejected'].includes(b.status) && b.requires) audits.push({ bookingId: b.id, bookingCode: code, event: b.status === 'rejected' ? 'rejected' : 'approved', actorName: 'Administrator', actorRole: 'admin', resourceId: b.rid, resourceName: bname[b.code], snapshot: snap, note: '[seed] historical event', createdAt: new Date(b.created.getTime() + 4 * 3600_000) });
      if (b.status === 'cancelled') audits.push({ bookingId: b.id, bookingCode: code, event: 'cancelled', actorId: u.id, actorName: u.full_name, actorRole: u.role, resourceId: b.rid, resourceName: bname[b.code], snapshot: snap, note: `[seed] ${b.cancelReason}`, createdAt: new Date(Math.min(NOW.getTime(), b.start.getTime() - 7200_000)) });
    }
    await BookingAudit.insertMany(audits);
    console.log(`MongoDB seeded: ${acts.length} activity logs, ${audits.length} booking audit events (notification history syncs when the API starts).`);
    await mongoose.disconnect();
  } catch (e) {
    console.warn(`MongoDB not reachable (${(e as Error).message.split('\n')[0]}). MySQL data is complete; start MongoDB and re-run the seed with --force to add audit history.`);
  }
  conn.release(); await closePool();
}

main().catch((e) => { console.error(e); process.exit(1); });
