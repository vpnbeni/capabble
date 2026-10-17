# Candidates Feature Implementation

## Overview
A complete candidates management system with PDF import functionality has been added to the Capabble application.

## Backend Implementation

### 1. Database Model (`server/src/models/Candidate.js`)
- Candidate schema with fields: name, rollNumber, email, phone, course, semester, batch, department, status
- Import metadata tracking (PDF file info, Cloudinary URL)
- Indexes for performance optimization
- Virtual fields and static methods

### 2. Controller (`server/src/controllers/candidateController.js`)
- `getCandidates` - List all candidates with pagination and filters
- `getCandidate` - Get single candidate details
- `createCandidate` - Add new candidate manually
- `updateCandidate` - Update candidate information
- `deleteCandidate` - Remove candidate
- `importCandidatesFromPDF` - Import candidates from PDF file
- `getCandidateStats` - Get statistics dashboard

### 3. Routes (`server/src/routes/candidateRoutes.js`)
- `GET /api/candidates` - List candidates
- `GET /api/candidates/stats` - Get statistics
- `POST /api/candidates` - Create candidate
- `POST /api/candidates/import` - Import from PDF
- `GET /api/candidates/:id` - Get candidate details
- `PUT /api/candidates/:id` - Update candidate
- `DELETE /api/candidates/:id` - Delete candidate

### 4. Validation (`server/src/validations/candidateValidation.js`)
- Input validation for all candidate fields
- Roll number format validation
- Email and phone validation

### 5. Dependencies Added
- `pdf-parse` - For parsing PDF files and extracting text

## Frontend Implementation

### 1. Pages
- **Candidates.tsx** - Main candidates list page with:
  - Statistics cards (total, active, inactive, graduated)
  - Advanced filtering (search, status, course, department, semester)
  - Drag & drop PDF import
  - Pagination
  - Table view with actions

- **CandidateDetail.tsx** - Detailed candidate view with:
  - Basic information
  - Academic details
  - Enrolled subjects
  - Import information (if imported from PDF)
  - Record metadata

### 2. Components
- **CandidateTable.tsx** - Responsive table with:
  - Candidate information display
  - Status badges
  - Action buttons (view, edit, delete)
  - Pagination controls

- **CandidateFilters.tsx** - Advanced filtering with:
  - Search by name, roll number, email
  - Filter by status, course, department, semester
  - Active filters display with quick remove
  - Clear all filters option

- **ImportModal.tsx** - PDF import modal with:
  - Drag & drop file upload
  - File validation
  - Import instructions
  - Sample format display
  - Progress indicator

### 3. Service (`client/src/services/candidateService.ts`)
- API integration for all candidate operations
- File upload handling for PDF import
- Query parameter building for filters

### 4. Navigation
- Added "Candidates" tab in sidebar (between Students and Subjects)
- Routes configured in App.tsx:
  - `/candidates` - List page
  - `/candidates/:id` - Detail page

## PDF Import Feature

### How It Works
1. User uploads a PDF file via drag & drop or file picker
2. PDF is uploaded to Cloudinary for storage
3. PDF text is extracted using pdf-parse library
4. Text is parsed to extract candidate information:
   - Roll numbers (pattern: alphanumeric 6-15 characters)
   - Names (text following roll number)
   - Email addresses (standard email pattern)
   - Phone numbers (10-15 digits)
   - Course/department keywords

### Expected PDF Format
```
CS2021001 John Doe
john.doe@example.com
+1234567890
Computer Science Engineering

CS2021002 Jane Smith
jane.smith@example.com
+0987654321
Computer Science Engineering
```

### Import Results
- Success count
- Error count with details
- Duplicate detection
- PDF URL stored for reference

## Features

### Filtering & Search
- Full-text search across name, roll number, email
- Filter by status (active, inactive, graduated, suspended)
- Filter by course and department
- Filter by semester
- Active filters display with quick removal

### Statistics Dashboard
- Total candidates count
- Active candidates
- Inactive candidates
- Graduated candidates
- Distribution by course
- Distribution by department

### Data Management
- Create candidates manually
- Import from PDF in bulk
- Update candidate information
- Delete candidates (with confirmation)
- View detailed candidate profiles

## Environment Variables Required

```env
# Cloudinary Configuration (already in .env)
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
```

## Testing the Feature

1. **Start the server** (already running):
   ```bash
   cd server
   npm run dev
   ```

2. **Start the client**:
   ```bash
   cd client
   npm run dev
   ```

3. **Access the feature**:
   - Navigate to http://localhost:5173
   - Login to the application
   - Click on "Candidates" in the sidebar
   - Try importing a PDF or adding candidates manually

## API Endpoints Summary

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/candidates` | List all candidates with filters |
| GET | `/api/candidates/stats` | Get statistics |
| GET | `/api/candidates/:id` | Get single candidate |
| POST | `/api/candidates` | Create new candidate |
| POST | `/api/candidates/import` | Import from PDF |
| PUT | `/api/candidates/:id` | Update candidate |
| DELETE | `/api/candidates/:id` | Delete candidate |

## Notes

- PDF import uses Cloudinary for file storage
- Text extraction works best with text-based PDFs (not scanned images)
- Duplicate roll numbers are automatically detected and rejected
- All operations are protected by authentication middleware
- Admin/staff roles required for create/update/delete operations
