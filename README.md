# React Authentication + Email Dashboard G06 Week03

**Public URLs:**
- **Frontend (Vercel):** https://mail-app-drab.vercel.app/
- **Backend (Render):** https://awad-mail-app-vm4s.onrender.com
- **Monorepo:** https://github.com/hykura1501/AWAD-Mail-App

---

A full-stack application implementing secure authentication (Email/Password + Google Sign-In) with a 3-column email dashboard mockup.

## Features

- ✅ Email/Password authentication with form validation
- ✅ Google OAuth Sign-In integration
- ✅ JWT-based authentication with access and refresh tokens
- ✅ Automatic token refresh on expiry
- ✅ Protected routes with authentication middleware
- ✅ 3-column responsive email dashboard
- ✅ Mock email API with realistic sample data
- ✅ Clean Architecture backend (Go + Gin)
- ✅ Modern frontend (React + Vite + TailwindCSS + shadcn/ui)
- ✅ State management with Redux Toolkit
- ✅ Data fetching with React Query

## Tech Stack

### Backend
- **Language**: Go 1.21+
- **Framework**: Gin
- **Architecture**: Clean Architecture (modular structure)
- **Authentication**: JWT (access + refresh tokens)
- **OAuth**: Google OAuth2

### Frontend
- **Framework**: React 19 + TypeScript
- **Build Tool**: Vite
- **Styling**: TailwindCSS 4
- **UI Components**: shadcn/ui
- **State Management**: Redux Toolkit
- **Data Fetching**: React Query (TanStack Query)
- **Routing**: React Router v6
- **Form Handling**: React Hook Form + Zod
- **OAuth**: @react-oauth/google

## Project Structure

```
GA03/
├── backend/
│   ├── cmd/
│   │   └── api/
│   │       ├── handler.go    # HTTP server bootstrap (Gin + DI)
│   │       └── router.go     # Route wiring
│   ├── internal/
│   │   ├── auth/
│   │   │   ├── delivery/     # Auth HTTP handlers & middleware
│   │   │   ├── domain/       # Auth domain entities
│   │   │   ├── dto/          # Auth DTOs/request models
│   │   │   ├── repository/   # Auth repository interfaces + impl
│   │   │   └── usecase/      # Auth business logic
│   │   ├── email/            # Same layering for email module
│   │   │   ├── delivery/
│   │   │   ├── domain/
│   │   │   ├── dto/
│   │   │   ├── repository/
│   │   │   └── usecase/
│   ├── pkg/
│   │   └── config/           # Public configuration loader
│   └── main.go               # Entry point (wires cmd/api handler)
├── frontend/
│   └── src/
│       ├── components/       # Reusable UI components
│       ├── config/           # App configuration
│       ├── lib/              # Utilities (API client, etc.)
│       ├── pages/            # Page components
│       ├── routes/           # Route definitions
│       ├── services/         # API service layer
│       ├── store/            # Redux store
│       └── types/            # TypeScript types
└── README.md
```

## Setup Instructions

### Prerequisites

- Go 1.21 or higher
- Node.js 18+ and npm
- Google OAuth credentials (for Google Sign-In)

### Backend Setup

1. Navigate to the backend directory:
```bash
cd backend
```

2. Install dependencies:
```bash
go mod download
```

3. Create a `.env` file (copy from `.env.example` if available):
```env
PORT=8080
JWT_SECRET=your-secret-key-change-in-production
JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY=168h
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_REDIRECT_URI=http://localhost:8080/api/auth/google/callback
```

4. Run the backend server:
```bash
go run main.go
```

The backend will start on `http://localhost:8080`

### Frontend Setup

1. Navigate to the frontend directory:
```bash
cd frontend
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file:
```env
VITE_API_BASE_URL=http://localhost:8080/api
VITE_GOOGLE_CLIENT_ID=your-google-client-id
```

4. Start the development server:
```bash
npm run dev
```

The frontend will start on `http://localhost:5173`

### Google OAuth Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the **Google+ API** (or **Google People API** if Google+ is deprecated)
4. Create OAuth 2.0 credentials:
   - Application type: **Web application**
   - **Authorized JavaScript origins**:
     - `http://localhost:5173` (for local development)
     - `https://g04-react-email-client.vercel.app` (for Vercel deployment)
     - `https://g04-react-email-client.onrender.com` (for Render deployment)
   - **Authorized redirect URIs**:
     - `http://localhost:8080/api/auth/google/callback` (for local backend)
     - `[YOUR_BACKEND_PUBLIC_URL]/api/auth/google/callback` (for deployed backend, if applicable)
5. Copy the **Client ID** and **Client Secret** to your `.env` files in both backend and frontend as shown above.

### IMAP Test Accounts

> **Note:** This project does **not** use real IMAP accounts. The backend provides a mock email API with realistic sample data. No IMAP setup is required.

### Simulating Token Expiry (for Demo)

To demonstrate token refresh and expiry handling:
- **Option 1:** In your backend `.env`, set `JWT_ACCESS_EXPIRY` to a short value (e.g., `30s` or `1m`). Restart the backend. Login, then wait for the access token to expire and observe the automatic refresh.
- **Option 2:** Use browser dev tools to manually remove or edit the access token in memory (if accessible) to simulate expiry.
- **Option 3:** Temporarily modify the backend code to force token expiry for testing purposes.

## Token Storage Strategy

### Access Token
- **Storage**: In-memory (JavaScript variable)
- **Rationale**: 
  - Access tokens are short-lived (15 minutes)
  - Storing in-memory reduces XSS attack surface
  - Automatically cleared when the page is closed/refreshed
  - More secure than localStorage for sensitive tokens
  - Prevents token theft via XSS attacks since JavaScript cannot access in-memory variables from other scripts

### Refresh Token
- **Storage**: localStorage
- **Rationale**:
  - Refresh tokens are long-lived (7 days)
  - Needed to persist across page refreshes to maintain user session
  - Allows "remember me" functionality without requiring re-authentication
  - While localStorage is vulnerable to XSS, the refresh token is only used server-side for token refresh
  - The refresh token is validated server-side before generating new access tokens
  - On logout, refresh token is cleared from both localStorage and server storage
  - If refresh fails (expired/invalid), tokens are cleared and user is redirected to login

### Security Considerations
- Access tokens are never stored in localStorage, reducing XSS risk
- Refresh tokens are validated server-side before use
- Automatic token refresh handles expiry gracefully with concurrency protection
- Failed refresh attempts trigger logout (clear tokens) and redirect to login
- CORS is configured to allow frontend-backend communication
- Tokens are cleared on logout from both client and server

## API Endpoints

### Authentication
- `POST /api/auth/login` - Email/password login
- `POST /api/auth/register` - User registration
- `POST /api/auth/google` - Google OAuth sign-in
- `POST /api/auth/refresh` - Refresh access token
- `POST /api/auth/logout` - Logout (invalidate refresh token)

### Email (Protected)
- `GET /api/emails/mailboxes` - Get all mailboxes
- `GET /api/emails/mailboxes/:id` - Get mailbox by ID
- `GET /api/emails/mailboxes/:id/emails` - Get emails in mailbox
- `GET /api/emails/:id` - Get email details
- `PATCH /api/emails/:id/read` - Mark email as read
- `PATCH /api/emails/:id/star` - Toggle email star

## Usage

1. **Sign Up / Sign In**:
   - Navigate to `/login` or `/signup`
   - Enter credentials or use Google Sign-In
   - Upon successful authentication, you'll be redirected to `/inbox`

2. **Email Dashboard**:
   - **Column 1 (Left)**: Mailbox list (Inbox, Starred, Sent, Drafts, etc.)
   - **Column 2 (Center)**: Email list for selected mailbox
   - **Column 3 (Right)**: Email detail view
   - Click on any email to view details
   - Use star button to mark emails as starred
   - Responsive design: on mobile, shows list or detail view with back button

3. **Logout**:
   - Click the logout button in the header
   - Both access and refresh tokens are cleared

## Deployment

### Backend Deployment

The backend can be deployed to any Go-compatible hosting service:

1. **Build the binary**:
```bash
cd backend
go build -o server main.go
```

2. **Set environment variables** on your hosting platform

3. **Run the server**:
```bash
./server
```

### Frontend Deployment

#### Netlify

1. Build the frontend:
```bash
cd frontend
npm run build
```

2. Deploy to Netlify:
   - Connect your Git repository
   - Set build command: `npm run build`
   - Set publish directory: `dist`
   - Add environment variables:
     - `VITE_API_BASE_URL`: Your backend API URL
     - `VITE_GOOGLE_CLIENT_ID`: Your Google Client ID

#### Vercel

1. Install Vercel CLI:
```bash
npm i -g vercel
```

2. Deploy:
```bash
cd frontend
vercel
```

3. Set environment variables in Vercel dashboard

#### Firebase Hosting

1. Install Firebase CLI:
```bash
npm i -g firebase-tools
```

2. Initialize and deploy:
```bash
cd frontend
npm run build
firebase init hosting
firebase deploy
```

### Public URL

After deployment, update the README with your public URL:

**Frontend**: https://your-app.netlify.app (or your deployment URL)
**Backend**: https://your-api.herokuapp.com (or your backend URL)

## Development

### Running Tests

```bash
# Backend tests (if implemented)
cd backend
go test ./...

# Frontend tests (if implemented)
cd frontend
npm test
```

### Code Structure

- **Backend**: Follows modular Clean Architecture
  - `cmd/api`: transport/bootstrap layer (Gin server + routes)
  - `internal/<module>`: feature modules (auth, email) split into delivery / domain / dto / repository / usecase
  - `pkg/config`: shared configuration loader accessible across layers
  - Repositories are in-memory now but can be swapped for persistent stores without touching delivery/usecases

- **Frontend**: Modular component-based architecture
  - Pages: Top-level route components
  - Components: Reusable UI components
  - Services: API communication layer
  - Store: Global state management
  - Types: TypeScript type definitions

## Third-Party Services

- **Google OAuth**: For Google Sign-In functionality
  - Setup: https://console.cloud.google.com/
  - Documentation: https://developers.google.com/identity/protocols/oauth2

## Screenshots / Walkthrough

### Login Flow
1. User enters email/password or clicks "Sign in with Google"
2. On success, receives access and refresh tokens
3. Redirected to `/inbox` dashboard

### Email Dashboard
- Three-column layout on desktop
- Responsive single-column on mobile
- Real-time email list updates
- Email detail view with full content

### Token Refresh
- Automatic refresh on 401 responses
- Concurrent request handling (only one refresh call)
- Seamless user experience

## Future Enhancements (Stretch Goals)

- [ ] Silent token refresh before expiration
- [ ] HttpOnly cookie storage for refresh tokens
- [ ] Multi-tab logout sync (BroadcastChannel)
- [ ] Offline-capable mailbox caching
- [ ] Role-based access control
- [ ] Real database integration
- [ ] Email composition functionality
- [ ] Search and filter capabilities

## This Week's Requirements (Implemented)

The project has been updated to satisfy this week's assignment requirements. Key implemented items:

- Kanban UI with 4 configurable columns (Inbox, To Do, Done, Snoozed) as implemented in the frontend (KanbanPage / KanbanBoard).
- Cards display real email data fetched from the backend and include sender, subject, and a preview snippet.
- Drag & drop support: cards can be moved between columns and the backend state is updated on drop.
- Snooze feature: moving an email to the `snoozed` column sets a snooze timer (24 hours by default) and hides the card from active columns until wake-up.
- Wake-up logic: snoozed emails are programmatically restored to the Inbox after the snooze period (implemented for both mock/local emails and provider-backed mail via in-memory timers).
- Gemini (LLM) integration: the backend calls an LLM service to generate dynamic email summaries which are displayed in the UI (detail view / card summary).
- IMAP support: basic IMAP provider logic is implemented to allow logging in with IMAP accounts and fetching messages across mailbox types. IMAP message IDs are encoded and resolved so that `GetEmailByID` works for IMAP-style IDs.

Note: IMAP and provider-backed kanban state (for Gmail/IMAP) currently uses in-memory maps for this assignment. For production, persist snooze/kanban state so it survives server restarts.

<!-- Additional implemented features for this week (F1 — F3) -->
## Additional features implemented this week (F1 — F3)

- F1 — Fuzzy Search Engine (Backend):
  - Implemented a server-side fuzzy search that handles typos, diacritics, and partial matches across email subject and sender fields.
  - Results are scored and ranked by relevance and recency so non-exact matches return sensible top results.
  - Developer/demo queries are available in the project notes to illustrate typical non-exact matches.

- F2 — Fuzzy Search UI (Frontend):
  - Added an integrated search bar that calls the backend fuzzy search and displays results as compact cards.
  - Each result card shows sender, subject, a snippet, and a "View/Open" action that opens the email detail view.
  - Loading, empty, and error states are handled gracefully; users can easily navigate back to the Kanban/Inbox views.

- F3 — Filtering & Sorting (Kanban):
  - Exposed at least two sort options (e.g., "newest" / "oldest") and the `unreadOnly` and `withAttachments` filters in the Kanban UI.
  - Sorting and filtering apply in real time to the Kanban columns without a full page reload.
  - Toggle behavior and combinations are implemented and tested to behave as expected.

These items were added in addition to the previously listed weekly requirements; no existing documentation content was removed.

---

## Grading Rubric (Scoring Criteria)

Feature | Scoring Criteria | Max Points
---|---:|---:
I | • The UI displays a board with separate configurable columns (for example: Inbox, To Do, Done).

  • Cards show real email data retrieved from the backend (must include Sender, Subject, and a content snippet).

  • The layout is organized and visually readable (Kanban style). | 25
II | • User can successfully drag a card from one column to another.

  • Dropping a card triggers a backend update to change the email's state.

  • The UI updates the card's position immediately without a full page reload. | 25
III | • The "Snooze" action correctly hides/removes a card from its active column (e.g., Inbox).

  • The card is successfully moved to the "Snoozed" column/state.

  • Logic is implemented to "wake" (restore) the email to the active view after the configured time has elapsed. | 25
IV | • The backend successfully sends real email text to the processing API (LLM or library).

  • The system returns a dynamically generated summary (no hard-coded or mocked summary text).

  • The summary is clearly displayed on the card or in the detail view. | 25

**Total** || **100**

---

If you'd like, I can also add a short "Quick Testing" subsection that explains how to temporarily shorten the snooze duration for manual testing (e.g., set to a few seconds), plus example curl commands to snooze and verify the wake-up behavior. 

## Docker Support (Advanced)

The application is fully containerized for consistent development and deployment environments.

### Running with Docker Compose

1. **Prerequisites**: Ensure you have Docker and Docker Compose installed on your machine.
2. **Configuration**: 
   - Ensure your `.env` files in `backend/` and `frontend/` are configured correctly.
   - For local Docker execution, you might need to update `VITE_API_BASE_URL` in `frontend/.env` to point to `http://localhost:8080`.

3. **Start the Application**:
   Run the following command in the root directory:
   ```bash
   docker-compose up --build
   ```
   
   This command will:
   - Build the **Backend** container (Go 1.24).
   - Build the **Frontend** container (Multi-stage: Node.js build -> Nginx serve).
   - Expose the Frontend on port `3000` and Backend on port `8080`.

4. **Access the App**:
   - Frontend: [http://localhost:3000](http://localhost:3000)
   - Backend API: [http://localhost:8080](http://localhost:8080)

### Container Architecture
- **Frontend**: Uses a multi-stage Dockerfile. Stage 1 builds the React app using Node.js. Stage 2 serves the static files using Nginx, configured with a custom `nginx.conf` for SPA routing.
- **Backend**: Uses a lightweight Golang image to run the compiled binary.

## CI/CD & Automation

This project utilizes **GitHub Actions** for automated testing and integration checks, ensuring code quality before merging.

### Workflow: `CI/CD Pipeline`

The pipeline is defined in `.github/workflows/ci.yml` and triggers on:
- **Push** to any branch (`**`): runs immediate feedback checks.
- **Pull Request** to `main`: runs checks on the simulated merge result.

### Jobs
1. **Frontend Check**:
   - Sets up Node.js 20 environment.
   - Installs dependencies (`npm ci`).
   - Runs **Linting** (`npm run lint`) to catch code style issues.
   - Runs **Build** (`npm run build`) to ensure the project compiles successfully.

2. **Backend Check**:
   - Sets up Go 1.24 environment.
   - Downloads Go module dependencies.
   - Runs **Build** (`go build`) to verify compilation.
   - Runs **Tests** (`go test ./...`) to execute all unit tests.

### Status Checks
Pull Requests are configured (in GitHub repository settings) to require these checks to pass before merging is allowed, preventing broken code from reaching the main branch.

## Keyboard Navigation (Accessibility)

Enhanced accessibility allows users to navigate the Kanban board using only the keyboard:

- **Arrow Keys** (`↑`, `↓`, `←`, `→`): Navigate selection between emails and columns.
- **Enter**: Open the selected email details.
- **Escape**: Deselect the current email.
- **Focus Indicator**: A visual blue ring highlights the currently selected card.

## License

This project is created for educational purposes.

## Author

Created as part of the AWDA GA03 assignment.

## New Features (Week 4 Addendum)

- **I. Semantic Search (Backend)**
  - Embeddings are generated for emails to enable semantic matching.
  - Search logic uses vector comparison rather than simple SQL LIKE.
  - Results demonstrate conceptual relevance (e.g., querying "cost" surfaces "invoice" emails).

- **II. Auto-Suggestion (Frontend)**
  - The search bar shows a live dropdown while typing.
  - Suggestions stay relevant (contacts, keywords) and update as the query changes.
  - Selecting a suggestion triggers and executes the search flow correctly.

- **III. Kanban Configuration**
  - Users can add, remove, or rename columns directly in the UI.
  - Configuration persists across refreshes.
  - Label mapping is enforced: moving cards updates the correct Gmail label (e.g., moving to "Archive" removes the Inbox label).

- **Deployment, UI/UX, and Demo**
  - Deployed frontend (Vercel/Netlify) and backend (cloud-hosted) environments are live.
  - UI/UX is polished with proper loading states and error handling.
  - Demo video (<5 mins) shows Search, Kanban configuration, and sync behavior.

- **Code Quality**
  - Clean component/service structure, robust error handling, and no hardcoded secrets.

- **Total**
  - End-to-end coverage of search, suggestions, kanban configuration, and deployment/demo requirements.
