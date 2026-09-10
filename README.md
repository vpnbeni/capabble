# BECMS - Bharat Examination Core Management System

A comprehensive full-stack MERN application designed for managing CBSE examination processes at examination centers. BECMS handles the complete examination lifecycle from importing CBSE datesheets to managing answer sheet dispatch.

## Quick Start

### Prerequisites
- Node.js (v16 or higher)
- npm (v8 or higher)
- MongoDB (local or Atlas)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/your-username/BECMS.git
   cd BECMS
   ```

2. **Install dependencies**
   ```bash
   npm run install-all
   ```

3. **Environment Setup**
   ```bash
   cp .env.example .env
   cp server/.env.example server/.env
   ```
   Update the `.env` files with your configuration (see Environment Variables section).

4. **Seed sample data**
   ```bash
   npm run seed
   ```

5. **Start development servers**
   ```bash
   npm run dev
   ```

The application will be available at:
- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:5000

### Default Login Credentials

After seeding:
- **Admin**: admin@becms.com / admin123
- **Data Entry Operator**: operator@becms.com / operator123

## Multi-Tenant Setup (Greenfield)

BECMS now supports subdomain-based multi-tenancy with:
- One **central platform database** for tenant metadata and platform admins.
- One **isolated database per tenant** for all school/exam data.

### Domain model
- Tenant app: `https://<tenant>.becms.vpnbeni.com`
- Tenant API: `https://<tenant>.api.vpnbeni.com`
- Platform admin app: `https://becms.vpnbeni.com`
- Platform API: `https://api.vpnbeni.com/api/admin/*`

### Required environment variables (server)

Add these in `server/.env`:

```env
MONGODB_URI=...
CENTRAL_DB_NAME=becms_central
TENANT_DB_PREFIX=becms_tenant_
ROOT_APP_DOMAIN=becms.vpnbeni.com
ROOT_API_DOMAIN=api.vpnbeni.com

JWT_SECRET=...
JWT_EXPIRE=7d
JWT_REFRESH_SECRET=...
JWT_REFRESH_EXPIRE=30d

PLATFORM_JWT_SECRET=...
PLATFORM_JWT_EXPIRE=1d
PLATFORM_ADMIN_EMAIL=admin.capabble
PLATFORM_ADMIN_PASSWORD=admin.capabble
```

### Bootstrap flow

1. Start server dependencies and set env values.
2. Create platform admin:
   ```bash
   cd server
   npm run bootstrap:platform
   ```
3. Start apps:
   ```bash
   npm run dev:all
   ```
4. Open admin frontend (`/admin` app) and create the first tenant from UI.

### Local development tenant fallback

For localhost, tenant resolution supports:
- Header: `x-tenant-slug`
- Query param: `?tenant=<slug>`

The frontend automatically attaches `x-tenant-slug` in local mode.

## Architecture

### Tech Stack

**Frontend**
- React 18 with TypeScript
- Vite (build tool)
- Redux Toolkit with Redux Persist (state management)
- TanStack React Query v5 (server state)
- React Router v6 (routing)
- Tailwind CSS with dark mode
- Headless UI components
- React Hook Form + Yup (form validation)
- React PDF (PDF viewing)
- Recharts (data visualization)

**Backend**
- Node.js with Express.js
- MongoDB with Mongoose ODM
- JWT authentication with refresh tokens
- Puppeteer (PDF generation)
- pdf-parse (PDF parsing)
- Tesseract.js (OCR for Form 66)
- XLSX (Excel processing)
- Cloudinary (file storage)
- Nodemailer (email)

**Security**
- Helmet (security headers)
- Rate limiting
- CORS configuration
- Mongo sanitization
- XSS protection
- HPP (HTTP parameter pollution prevention)

### Project Structure
```
BECMS/
├── client/                 # React frontend application
│   ├── src/
│   │   ├── pages/          # 17 route pages
│   │   ├── components/     # Reusable UI components
│   │   ├── services/       # API service layer (11 services)
│   │   ├── redux/          # Redux slices (7 slices)
│   │   ├── routes/         # Protected route wrappers
│   │   ├── hooks/          # Custom React hooks
│   │   ├── types/          # TypeScript definitions
│   │   └── utils/          # Utility functions
│   └── ...
├── server/                 # Express.js backend API
│   ├── src/
│   │   ├── models/         # 13 Mongoose schemas
│   │   ├── routes/         # 16 route files
│   │   ├── controllers/    # Business logic (14 controllers)
│   │   ├── middleware/     # Auth, error handling
│   │   ├── utils/          # Parsers, PDF generators (15 utils)
│   │   ├── templates/      # Handlebars PDF templates
│   │   ├── validations/    # Joi validation schemas
│   │   └── seeders/        # Database seeders
│   └── ...
├── docs/                   # Documentation
└── package.json            # Root package with concurrently scripts
```

## Features

### Authentication & Authorization
- JWT-based authentication with refresh tokens
- Role-based access control (Admin, Data Entry Operator)
- Protected routes on frontend and backend
- Automatic token refresh

### Candidate Management
- Manual candidate entry
- **PDF Import**: Parse CBSE candidate list PDFs to extract roll numbers, names, parent details, and subjects
- Auto-detect class (10th/12th) from subject codes
- Auto-link candidates to subject records
- Search, filter, and pagination
- Statistics by class

### CBSE Datesheet Import
- Parse official CBSE datesheet PDFs
- Extract exam dates, subject codes, names, duration, and answer sheet types
- Auto-calculate day names and time slots
- Maintain statistics (total entries, class-wise counts)

### Subject Management
- Configure subjects with codes, names, and duration
- Answer sheet type configuration (32 pages, 20 pages, 40 graph sheets)
- Teacher assignments
- Exam pattern configuration (sections, questions, marks)
- Auto-sync with CBSE datesheet entries on update

### Exam Functionaries (Teachers)
- Manage exam supervisors and invigilators
- Subject assignments
- Contact and emergency details
- Experience and qualification tracking

### Room Management
- Configure examination rooms with capacity
- Default: 24 candidates per room
- Floor and room name tracking
- Active/inactive status

### Seating Plan Generation
Advanced algorithm for exam seating:
- **Candidate Fetching**: Prioritizes Form 66 records, falls back to candidate records
- **Answer Sheet Allocation**: Sequential serial assignment, skips discarded serials
- **Room Rotation**: Class-based rotation (10th and 12th rotate separately)
- **Continuous Allocation**: Multiple exams on same day share rooms efficiently
- **Layout**: 24 seats per room (8 rows x 3 columns)

**PDF Exports (4 formats):**
- Main Gate Copy: All rooms with roll numbers
- Invigilator Slip: Individual room details
- Room Door Slip: Door signage
- CBSE Copy: Official format with serial numbers and QP codes

### Form 66 Management
Form 66 is the CBSE attendance sheet showing exam appearances:
- Parse Form 66 text files
- Extract centre info, exam dates, subjects, roll number ranges
- Auto-detect class from subject codes
- PDF reordering and TXT-to-PDF conversion
- Cloudinary upload for original and processed files

### Answer Sheet Inventory
- Track answer sheets by type, pages, color, and class
- Serial number management (preserves leading zeros)
- Mark sheets as used or discarded
- Discard individual serials or ranges
- Link to centre datesheet entries
- Usage statistics (total, used, discarded, balance)

### Answer Sheet Dispatch
- Auto-generated dispatch numbers
- Track dispatch lifecycle: pending → dispatched → in transit → delivered → returned
- Transportation details (road/rail/air/courier)
- Security measures (seal/lock numbers, personnel, photographs)
- Insurance tracking
- Document attachments
- Tracking history with timestamps and locations

### Dashboard
- Real-time statistics
- Today's exams with candidate counts
- Quick action buttons
- Recent activity tracking
- Examination progress monitoring

### Centre Guidelines
- Display and manage examination guidelines
- Store guideline documents

### UI/UX Features
- Dark mode toggle
- Responsive design (desktop, tablet, mobile)
- Loading states and skeleton loaders
- Toast notifications
- Modal dialogs
- Sortable, filterable, paginated data tables
- PDF viewer
- Drag-and-drop file upload
- Charts and data visualization

## Development Commands

```bash
# Start both frontend and backend concurrently
npm run dev

# Start only backend (port 5000)
npm run server

# Start only frontend (port 5173)
npm run client

# Install all dependencies (root, server, client)
npm run install-all

# Build for production
npm run build

# Seed database
npm run seed
```

### Client-specific (from /client)
```bash
npm run type-check    # TypeScript checking
npm run lint          # ESLint
```

### Server-specific (from /server)
```bash
npm run test          # Jest tests with watch mode
npm run lint:fix      # ESLint with auto-fix
npm run seed:subjects # Seed subjects only
```

## API Endpoints

All routes prefixed with `/api`:

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /auth/login | User login |
| POST | /auth/refresh | Refresh JWT token |
| POST | /auth/logout | User logout |

### Candidates
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /candidates | List all candidates (paginated) |
| GET | /candidates/:id | Get single candidate |
| POST | /candidates | Create candidate |
| PUT | /candidates/:id | Update candidate |
| DELETE | /candidates/:id | Delete candidate |
| POST | /candidates/import | Import from PDF |
| GET | /candidates/stats | Get statistics |

### Subjects
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /subjects | List all subjects |
| GET | /subjects/:id | Get single subject |
| POST | /subjects | Create subject |
| PUT | /subjects/:id | Update subject |
| DELETE | /subjects/:id | Delete subject |

### Teachers (Exam Functionaries)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /teachers | List all teachers |
| GET | /teachers/:id | Get single teacher |
| POST | /teachers | Create teacher |
| PUT | /teachers/:id | Update teacher |
| DELETE | /teachers/:id | Delete teacher |

### CBSE Datesheet
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /centre-datesheet | Get active datesheet |
| GET | /centre-datesheet/:id | Get specific entry |
| POST | /centre-datesheet/import | Import CBSE datesheet PDF |

### Seating Plan
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /seating-plan/build/:entryId | Build seating plan for exam |
| POST | /seating-plan/generate-pdf | Generate PDFs (4 formats) |

### Rooms
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /rooms | List all rooms |
| POST | /rooms | Create room |
| PUT | /rooms/:id | Update room |
| DELETE | /rooms/:id | Delete room |
| POST | /rooms/allocate | Allocate rooms for exam |

### Answer Sheets
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /answersheets | List all answer sheets |
| POST | /answersheets | Create answer sheet record |
| PUT | /answersheets/:id | Update answer sheet |
| DELETE | /answersheets/:id | Delete answer sheet |
| POST | /answersheets/import | Import from Excel/PDF |
| PUT | /answersheets/:id/use | Mark sheets as used |
| PUT | /answersheets/:id/discard | Mark sheets as discarded |
| POST | /answersheets/:id/discard-serial | Discard individual serials |
| GET | /answersheets/stats | Get statistics |

### Form 66
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /form66/upload | Upload Form 66 file |
| GET | /form66 | Get Form 66 records |
| GET | /form66/by-date/:date | Get records by date |

### Dispatch
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /dispatch | List dispatch records |
| POST | /dispatch | Create dispatch record |
| PUT | /dispatch/:id | Update dispatch |
| PUT | /dispatch/:id/status | Update dispatch status |
| GET | /dispatch/stats | Get dispatch statistics |

### Dashboard
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /dashboard/stats | Get dashboard statistics |
| GET | /dashboard/today-exams | Get today's exams |

### Other
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /guidelines | Get centre guidelines |
| POST | /guidelines | Create/update guidelines |
| GET | /export/* | Various PDF/Excel exports |

## Database Schema

The application uses MongoDB with 13 Mongoose models:

| Model | Description |
|-------|-------------|
| User | Authentication credentials and roles |
| Teacher | Exam functionaries with subject assignments |
| Student | Student records with class information |
| Candidate | CBSE exam candidates with subjects |
| Subject | Subject definitions with answer sheet types |
| DateSheet | Centre-specific examination schedules |
| CBSEDatesheet | Imported CBSE datesheet with entries |
| Room | Examination room configuration |
| AnswerSheet | Answer sheet inventory with serial tracking |
| AnswerSheetDispatch | Dispatch records with tracking history |
| Form66 | Form 66 attendance records |
| Calendar | Academic calendar (for future use) |
| FolderMapping | Folder-to-dispatch mappings |

## Environment Variables

See `.env.example` for all required variables:

| Variable | Description |
|----------|-------------|
| MONGODB_URI | MongoDB connection string |
| JWT_SECRET | JWT signing secret |
| JWT_REFRESH_SECRET | Refresh token secret |
| PORT | Server port (default: 5000) |
| CLIENT_URL | Frontend URL for CORS |
| CLOUDINARY_CLOUD_NAME | Cloudinary cloud name |
| CLOUDINARY_API_KEY | Cloudinary API key |
| CLOUDINARY_API_SECRET | Cloudinary API secret |
| SMTP_HOST | Email SMTP host |
| SMTP_PORT | Email SMTP port |
| SMTP_USER | Email username |
| SMTP_PASS | Email password |
| RATE_LIMIT_ENABLED | Enable/disable API rate limiting (`true`/`false`) |
| RATE_LIMIT_WINDOW | Rate limit window (ms) |
| RATE_LIMIT_MAX | Max requests per window |
| MAX_FILE_SIZE | Max upload size (bytes) |

## Deployment

### Production Build

1. Build the frontend:
   ```bash
   npm run build
   ```

2. Set production environment:
   ```bash
   NODE_ENV=production
   ```

3. Start the server:
   ```bash
   npm start
   ```

### Deployment Platforms

Configuration files included for:
- **Vercel**: `vercel.json` (frontend)
- **Render**: `render.yaml`
- **AWS**: `deploy-aws.sh` script

## Key Workflows

### Exam Setup
1. Import CBSE datesheet PDF
2. Create/update subjects with answer sheet types
3. Import candidates from CBSE PDF
4. Configure examination rooms

### Seating Plan Generation
1. Select exam from CBSE datesheet
2. Upload Form 66 (optional, for attendance tracking)
3. Generate seating plan with room rotation
4. Export PDFs for main gate, room folders, door slips, and CBSE copy

### Answer Sheet Management
1. Import answer sheet inventory
2. System allocates serials to exams by type and class
3. Track usage (used/discarded)
4. Mark damaged serials as discarded
5. Create dispatch records for delivery

### Answer Sheet Dispatch
1. Create dispatch with destination details
2. Add security measures
3. Update status through lifecycle
4. Upload delivery documentation
5. Mark as delivered

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- CBSE for examination format standards
- MongoDB for database solutions
- React and Node.js communities
