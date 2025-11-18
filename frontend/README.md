# Frontend Application

React application with Vite, TypeScript, TailwindCSS, and shadcn/ui.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create `.env` file:
```env
VITE_API_BASE_URL=http://localhost:8080/api
VITE_GOOGLE_CLIENT_ID=your-google-client-id
```

3. Run development server:
```bash
npm run dev
```

## Build

```bash
npm run build
```

## Project Structure

- **pages/**: Route components (Login, SignUp, Inbox)
- **components/**: Reusable UI components
- **services/**: API service layer
- **store/**: Redux store and slices
- **routes/**: Route definitions and protected routes
- **lib/**: Utilities (API client, etc.)
- **types/**: TypeScript type definitions
- **config/**: App configuration
