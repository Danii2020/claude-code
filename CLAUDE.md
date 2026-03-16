# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Platziflix is a multi-platform online course platform (Netflix-style) with a Backend API, a web Frontend, and native mobile apps for Android and iOS.

## Commands

Any command you run should be inside the API Docker container, before running it, make sure the container       
  is running and review the @Makefile with the existing commands and use them.  
### Backend

**All backend commands must run from `Backend/` and execute inside Docker containers. Always verify the container is running before executing commands.**

```bash
cd Backend
make start             # Start Docker Compose (API + PostgreSQL)
make stop              # Stop containers
make build             # Rebuild Docker images
make logs              # Tail container logs
make clean             # Remove containers, volumes, and images

make migrate           # Apply Alembic migrations
make create-migration  # Interactively create a new Alembic migration
make seed              # Populate sample data
make seed-fresh        # Clear all data and reseed
```

To run backend tests (inside the API container):
```bash
docker-compose exec api bash -c "cd /app && uv run pytest"
docker-compose exec api bash -c "cd /app && uv run pytest app/tests/test_rating_endpoints.py"
docker-compose exec api bash -c "cd /app && uv run pytest app/tests/test_course_rating_service.py::TestClassName::test_method_name"
```

### Frontend

```bash
cd Frontend
yarn dev       # Dev server with Turbopack on port 3000
yarn build     # Production build
yarn lint      # ESLint
yarn test      # Run all tests (Vitest)
yarn test src/components/StarRating  # Run tests for a specific file/directory
```

## Architecture

### System Data Flow

```
Browser / Android / iOS
        │
        │ HTTP REST (JSON)
        ▼
FastAPI (port 8000) → CourseService → SQLAlchemy → PostgreSQL
        │
        └── All clients use the API as the single source of truth
```

### Backend (FastAPI + SQLAlchemy)

All route handlers live in `app/main.py` and depend on `CourseService` (injected via `get_course_service()`). Business logic lives entirely in `app/services/course_service.py` — routes are thin wrappers.

**Soft deletes are used everywhere.** All models inherit `BaseModel` (`app/models/base.py`) which includes `deleted_at`. The rating uniqueness constraint is `UNIQUE(course_id, user_id, deleted_at)` specifically to allow a user to re-rate after deleting.

Key entities:
- `Course` — has `average_rating`/`total_ratings` as computed Python properties from active `CourseRating` rows
- `CourseRating` — rating 1–5 with CHECK constraint enforced at DB level
- `Lesson` and `Class` — both exist as separate tables with identical structure (not consolidated)
- `course_teachers` — association table for the Course ↔ Teacher many-to-many

DB connection string: `postgresql://platziflix_user:platziflix_password@db:5432/platziflix_db`

### Frontend (Next.js 15)

The app uses **Server Components exclusively for data fetching** — there is no client-side state manager (no Redux, no Zustand). Every page fetches with `cache: "no-store"` directly from `http://localhost:8000`.

Route structure mirrors the API:
- `/` → `app/page.tsx` — course catalog grid
- `/course/[slug]` → `app/course/[slug]/page.tsx` — course detail (slug-based, SEO-friendly)
- `/classes/[class_id]` → `app/classes/[class_id]/page.tsx` — video player

Each dynamic route has companion `error.tsx`, `loading.tsx`, and `not-found.tsx` files.

SCSS design tokens are defined in `src/styles/vars.scss` and **auto-imported** into every component stylesheet via `next.config.ts` `prependData`. Access colors with the `color('primary')` SCSS function — do not hardcode hex values.

The `src/services/ratingsApi.ts` client is the only place that handles ratings CRUD from the client side and includes a 10-second fetch timeout wrapper.

### Mobile (Android + iOS)

Both apps share the same three-layer Clean Architecture:

```
Presentation  →  ViewModel (state/events)  →  View (Compose / SwiftUI)
Domain        →  Repository interface      →  Domain models
Data          →  RemoteCourseRepository    →  DTOs + Mappers
```

Mappers (e.g., `CourseMapper`) are the only place where DTOs are converted to domain models. ViewModels hold all UI state; Views are stateless.

- **Android**: Uses `StateFlow<CourseListUiState>` + sealed `CourseListUiEvent`. Base URL is `http://10.0.2.2:8000/` (emulator localhost).
- **iOS**: Uses `@Published` properties + `@MainActor` + `async/await`. Base URL is `http://localhost:8000`. No third-party dependencies — pure URLSession + Codable.

Both apps currently only implement the course list screen. Course detail navigation is a TODO.

## Key Conventions

### Python / FastAPI
- Use `def` for sync, `async def` for I/O-bound operations
- Type-hint all function signatures; use Pydantic models for all input/output (not raw dicts)
- Error handling: guard clauses first, early returns for error paths, happy path last
- Use `HTTPException` for expected errors; no bare `except` blocks
- Naming: `snake_case` for files/variables/functions, `PascalCase` for classes

### TypeScript / Next.js
- Strict TypeScript — no `any`
- Path alias `@/*` maps to `src/*`
- CSS Modules for all component styles; global tokens via `vars.scss`
- Type guards in `src/types/rating.ts` must be used when validating API responses

### Mobile
- DTOs reflect the raw API shape (including `deleted_at`, `created_at`, etc.)
- Domain models contain only what the UI needs — keep them lean
- Kotlin: `PascalCase` for classes, `camelCase` for functions/properties
- Swift: `PascalCase` for types, `camelCase` for functions/properties
