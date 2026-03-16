# Frontend Implementation Plan - Interactive Ratings & Course Detail

## Overview

This plan covers all frontend work needed to complete the ratings feature. It is derived from Phase 2 of the architect's `RATINGS_IMPLEMENTATION_PLAN.md`, refined with findings from inspecting the actual codebase.

**Prerequisite**: Phase 1 (backend seed data) should be complete so that `GET /courses` and `GET /courses/{slug}` return non-zero `average_rating`, `total_ratings`, and `rating_distribution` values.

---

## Current State Assessment

### What already exists

| File | Status | Notes |
|------|--------|-------|
| `Frontend/src/types/rating.ts` | Partial | Has `CourseRating`, `RatingRequest`, `RatingStats`, `RatingState`, type guards, `ApiError`. Missing `rating_distribution` on `RatingStats`. |
| `Frontend/src/types/index.ts` | Partial | `Course` has optional `average_rating` and `total_ratings`. `CourseDetail` extends `Course` but lacks `rating_distribution`. Also lacks `title` and `teacher` fields that `CourseDetail.tsx` references (see Bug 1). |
| `Frontend/src/services/ratingsApi.ts` | Complete | Full CRUD: `getRatingStats`, `getCourseRatings`, `getUserRating`, `createRating`, `updateRating`, `deleteRating`. No changes needed. |
| `Frontend/src/components/StarRating/StarRating.tsx` | Partial | Read-only display works. No interactive mode (no `onRate` callback, no hover state, no `'use client'` directive). |
| `Frontend/src/components/StarRating/StarRating.module.scss` | Partial | Has size variants and fill states. Missing `.interactive` cursor/hover styles. |
| `Frontend/src/components/StarRating/__tests__/StarRating.test.tsx` | Partial | 16 tests covering readonly rendering, sizes, accessibility. Missing interactive mode tests. |
| `Frontend/src/components/CourseDetail/CourseDetail.tsx` | Exists | Renders course info and class list. No rating section. References `course.title` and `course.teacher` which do not exist on the TypeScript type (see Bug 1). |
| `Frontend/src/components/CourseDetail/CourseDetail.module.scss` | Exists | Full styling for header, classes list. No rating section styles. |
| `Frontend/src/components/CourseRating/` | Does not exist | Entire directory and files need to be created. |

### Bugs / Gaps discovered during inspection

**Bug 1: Type mismatch in CourseDetail component**
- File: `/Users/danielerazo/Projects/claude-code/Frontend/src/components/CourseDetail/CourseDetail.tsx`
- Lines 28, 31, 32 reference `course.title` and `course.teacher`
- The `CourseDetail` interface (in `types/index.ts`) inherits `name` from `Course`, not `title`
- The backend returns `name` (not `title`) and does not return a `teacher` field (it returns `teacher_id` as an array of IDs)
- This means the course detail page is likely broken at runtime, or the backend was modified to also include `title`/`teacher` aliases
- **Decision**: This plan does NOT fix this pre-existing bug, but notes it. The rating work should not depend on it.

**Bug 2: Half-star SVG gradient ID collision**
- File: `/Users/danielerazo/Projects/claude-code/Frontend/src/components/StarRating/StarRating.tsx`
- Line 34: `<linearGradient id="halfStarGradient">` uses a static ID
- When multiple `StarRating` components render on the same page (catalog grid + detail), all half-star gradients reference the same ID, which is technically fine for identical gradients but fragile
- **Decision**: Not blocking for this plan. Note as a future improvement.

**Gap 1: Backend class response shape vs frontend type**
- Backend `get_course_by_slug` returns classes with `name` field (line 100 of `course_service.py`)
- Frontend `Class` interface expects `title` field (line 16 of `types/index.ts`)
- Same pre-existing mismatch as Bug 1. Not addressed in this plan.

**Gap 2: `RatingStats` backend response includes `rating_distribution`**
- Backend `RatingStatsResponse` schema (`Backend/app/schemas/rating.py`, line 70) includes `rating_distribution: Dict[int, int]`
- Frontend `RatingStats` type does not include it
- Must be added for the distribution bar chart feature

---

## Implementation Phases

### Phase A: Type System Updates

**Must be completed first. All subsequent phases depend on correct types.**

#### Task A.1: Add `rating_distribution` to `RatingStats`

- **File**: `/Users/danielerazo/Projects/claude-code/Frontend/src/types/rating.ts`
- **Line**: 23-26 (the `RatingStats` interface)
- **Change**: Add an optional `rating_distribution` property of type `Record<number, number>` to the interface
- **Rationale**: The backend `GET /courses/{id}/ratings/stats` endpoint returns this field (keys 1-5, values are counts). The new `CourseRatingSection` component needs it for the distribution bar chart.
- **Also update**: The `isRatingStats` type guard (lines 67-79) should optionally validate the new field if present (it should be an object with numeric keys and numeric values, or undefined)

#### Task A.2: Add `rating_distribution` to `CourseDetail`

- **File**: `/Users/danielerazo/Projects/claude-code/Frontend/src/types/index.ts`
- **Line**: 24-27 (the `CourseDetail` interface)
- **Change**: Add an optional `rating_distribution` property of type `Record<number, number>`
- **Rationale**: The backend `GET /courses/{slug}` response already includes `rating_distribution` (line 109 of `course_service.py`). The `CourseDetailComponent` passes this to the new `CourseRatingSection`.

---

### Phase B: StarRating Interactive Mode

**Depends on**: Phase A (no type dependency, but logically ordered)

#### Task B.1: Convert StarRating to Client Component and add interactivity

- **File**: `/Users/danielerazo/Projects/claude-code/Frontend/src/components/StarRating/StarRating.tsx`
- **Changes needed**:
  1. Add `'use client';` directive at line 1 (before the JSDoc comment). Required because `useState` and event handlers are client-only features.
  2. Add `import { useState } from 'react';`
  3. Extend the `StarRatingProps` interface (lines 8-15) with a new optional `onRate` callback: `onRate?: (rating: number) => void`
  4. Inside the component body (after line 67), add a `hoverRating` state via `useState<number>(0)`
  5. Modify the `getStarFillState` function to use `hoverRating` when not readonly and hover is active: the display rating should be `hoverRating || rating` when `!readonly`
  6. On each star `<span>` (lines 92-98):
     - Add `onClick` handler: when `!readonly && onRate`, call `onRate(star)`
     - Add `onMouseEnter` handler: when `!readonly`, set `hoverRating` to `star`
     - Add `onMouseLeave` handler: when `!readonly`, set `hoverRating` to `0`
     - Add the `.interactive` CSS class when `!readonly`
  7. Update the container `role` attribute: when not readonly and onRate is provided, change from `role="img"` to `role="group"` (a group of interactive stars is not an image)
  8. Update `aria-label` to include instructions when interactive (e.g., "Rate this course")

- **Impact on existing behavior**: When `readonly=true` (the default), behavior is unchanged. The `readonly` prop already exists but is currently unused beyond being accepted. All existing call sites pass `readonly={true}` or rely on the default.

#### Task B.2: Add interactive star styles

- **File**: `/Users/danielerazo/Projects/claude-code/Frontend/src/components/StarRating/StarRating.module.scss`
- **Location**: Inside the `.star` rule (lines 16-38)
- **Changes**: Add an `.interactive` modifier class with:
  - `cursor: pointer`
  - A hover transform (e.g., `scale(1.2)`) with a transition
  - Optionally a focus-visible outline for keyboard accessibility

#### Task B.3: Update StarRating tests for interactive mode

- **File**: `/Users/danielerazo/Projects/claude-code/Frontend/src/components/StarRating/__tests__/StarRating.test.tsx`
- **Add imports**: `vi` from vitest, `fireEvent` or `userEvent` from testing-library
- **New test cases to add** (after the existing "Readonly Mode" describe block, line 186):
  1. **"calls onRate callback when a star is clicked in interactive mode"**: Render with `readonly={false}` and an `onRate` spy. Click the 4th star. Assert `onRate` was called with `4`.
  2. **"does not call onRate when readonly is true"**: Render with `readonly={true}` and an `onRate` spy. Click a star. Assert `onRate` was NOT called.
  3. **"does not call onRate when onRate is not provided"**: Render with `readonly={false}` but no `onRate`. Click a star. Assert no error is thrown.
  4. **"shows hover state on mouse enter"**: Render interactive. Mouse enter the 3rd star. Assert the visual state updates (check aria-label or class changes).
  5. **"resets hover state on mouse leave"**: Render interactive. Mouse enter then leave. Assert original rating display is restored.
  6. **"updates aria role for interactive mode"**: When `readonly={false}` and `onRate` provided, the container should not have `role="img"`.

---

### Phase C: CourseRatingSection Component (New)

**Depends on**: Phase A (types), Phase B (interactive StarRating)

#### Task C.1: Create CourseRatingSection component

- **New file**: `/Users/danielerazo/Projects/claude-code/Frontend/src/components/CourseRating/CourseRating.tsx`
- **This is a Client Component** (`'use client'` directive)
- **Props interface** `CourseRatingSectionProps`:
  - `courseId: number` - needed for API calls
  - `initialAverageRating: number` - from server-rendered data
  - `initialTotalRatings: number` - from server-rendered data
  - `initialDistribution?: Record<number, number>` - from server-rendered data
- **Internal state**:
  - `stats: RatingStats` - initialized from props, updated after rating submission
  - `userRating: number | null` - the guest user's current rating
  - `ratingState: RatingState` - UI state machine: idle, loading, success, error
- **Behavior**:
  1. On mount (`useEffect`), call `ratingsApi.getUserRating(courseId, GUEST_USER_ID)` to check if the guest user already rated. If so, populate `userRating`. Silently catch errors.
  2. `handleRate(rating)` function:
     - Set state to `loading`
     - If `userRating` is null, call `ratingsApi.createRating(courseId, { user_id: GUEST_USER_ID, rating })`
     - If `userRating` is not null, call `ratingsApi.updateRating(courseId, GUEST_USER_ID, { user_id: GUEST_USER_ID, rating })`
     - On success: set `userRating`, refresh stats via `ratingsApi.getRatingStats(courseId)`, set state to `success`
     - On error: set state to `error`
  3. Use `GUEST_USER_ID = 1` constant (no auth system yet)
- **Rendered structure** (three sections):
  1. **Rating overview**: Large average number (e.g., "4.2"), read-only `StarRating` with `size="large"`, total ratings count text
  2. **Distribution bar chart**: Five horizontal rows (5 stars down to 1 star). Each row: star number label, a horizontal bar track with a colored fill proportional to `(count / total) * 100%`, and a count number
  3. **User rating input**: Text "Rate this course" (with "Rating as Guest User" note), interactive `StarRating` with `readonly={false}` and `onRate={handleRate}`, feedback messages for success/error states, disabled state during loading
- **Imports needed**: `useState`, `useEffect` from react; `StarRating` from StarRating component; `ratingsApi` from services; `RatingStats`, `RatingState` from types/rating; CSS module

#### Task C.2: Create CourseRatingSection styles

- **New file**: `/Users/danielerazo/Projects/claude-code/Frontend/src/components/CourseRating/CourseRating.module.scss`
- **Note**: `vars.scss` is auto-imported via `next.config.ts` `prependData`, so `color()` function is available without explicit import
- **Classes to define**:
  - `.ratingSection` - container: padding, background `color('off-white')`, border-radius, border with `color('light-gray')`, margin-top for spacing from course info
  - `.ratingOverview` - flex layout: average display on left, distribution on right. Responsive: stack vertically on mobile (`@media max-width: 768px`)
  - `.averageDisplay` - flex column, centered items: large number, star component, count text
  - `.averageNumber` - large font (2.5-3rem), bold, `color('text-primary')`
  - `.totalCount` - smaller text, `color('text-secondary')`
  - `.distribution` - flex column, gap between rows
  - `.distributionRow` - flex row: star label (fixed width), bar track (flex 1), count (fixed width), aligned center
  - `.bar` - gray background track (`color('light-gray')`), fixed height (8-10px), border-radius, overflow hidden
  - `.barFill` - fill with `color('primary')`, height 100%, border-radius, transition on width for animation
  - `.userRating` - margin-top, padding-top, border-top with `color('light-gray')` as separator
  - `.guestNote` - small italic text, `color('text-secondary')`
  - `.successMessage` - green-tinted text for success feedback
  - `.errorMessage` - red-tinted text for error feedback

#### Task C.3: Create CourseRatingSection tests

- **New file**: `/Users/danielerazo/Projects/claude-code/Frontend/src/components/CourseRating/__tests__/CourseRating.test.tsx`
- **Setup**: Mock `ratingsApi` service using `vi.mock('@/services/ratingsApi')`
- **Test cases**:
  1. **"renders average rating and total count"**: Pass initial props. Assert the average number and count text are displayed.
  2. **"renders distribution bars"**: Pass props with distribution data. Assert all 5 rows render with correct counts.
  3. **"renders interactive star rating for user input"**: Assert the "Rate this course" section is present.
  4. **"fetches existing user rating on mount"**: Mock `getUserRating` to return a rating. Assert `userRating` state is populated.
  5. **"handles getUserRating failure silently"**: Mock `getUserRating` to throw. Assert component still renders without error.
  6. **"submits new rating via createRating"**: Mock `createRating` and `getRatingStats`. Simulate clicking a star. Assert `createRating` was called with correct params.
  7. **"updates existing rating via updateRating"**: Set up component with pre-existing userRating. Click a different star. Assert `updateRating` was called.
  8. **"shows success message after rating"**: Submit a rating. Assert success message appears.
  9. **"shows error message on API failure"**: Mock `createRating` to throw. Submit rating. Assert error message appears.
  10. **"refreshes stats after successful rating"**: Assert `getRatingStats` is called after successful submission and the displayed average updates.

---

### Phase D: Integration into Course Detail Page

**Depends on**: Phase C (CourseRatingSection must exist)

#### Task D.1: Import and render CourseRatingSection in CourseDetail

- **File**: `/Users/danielerazo/Projects/claude-code/Frontend/src/components/CourseDetail/CourseDetail.tsx`
- **Changes**:
  1. Add import for `CourseRatingSection` from `@/components/CourseRating/CourseRating`
  2. After the `.stats` div (line 37, after the closing `</div>` of the stats section) and before the `.classesSection` div (line 41), insert the `CourseRatingSection` component
  3. Pass props: `courseId={course.id}`, `initialAverageRating={course.average_rating ?? 0}`, `initialTotalRatings={course.total_ratings ?? 0}`, `initialDistribution={course.rating_distribution}`
- **Note**: `CourseDetailComponent` is a Server Component (no `'use client'` directive). Rendering a Client Component (`CourseRatingSection`) inside a Server Component is valid in Next.js -- the client component becomes a "client boundary" automatically.

#### Task D.2: Add rating section container styles in CourseDetail

- **File**: `/Users/danielerazo/Projects/claude-code/Frontend/src/components/CourseDetail/CourseDetail.module.scss`
- **Location**: After the `.stats` block (line 109), before `.classesSection` (line 122)
- **Note**: The `CourseRatingSection` component has its own CSS module for internal styles. This task only adds a wrapper/spacing class in the parent if needed for layout consistency (e.g., margin between stats and classes sections). If the `CourseRatingSection`'s own `.ratingSection` class handles all spacing, this task may be skipped.
- **Evaluate**: Whether a `.ratingWrapper` class is needed in `CourseDetail.module.scss` for consistent margin/padding with the rest of the course detail layout.

---

## Execution Order & Dependencies

```
Phase A (Types)
  A.1: RatingStats type ------> Phase C (uses rating_distribution)
  A.2: CourseDetail type -----> Phase D (passes distribution to component)

Phase B (StarRating Interactive)
  B.1: Component logic -------> Phase C (CourseRatingSection uses onRate)
  B.2: Styles ----------------> Phase B.1 (styles referenced by component)
  B.3: Tests -----------------> Phase B.1 (tests validate new behavior)

Phase C (CourseRatingSection)
  C.1: Component -------------> Phase D (imported into CourseDetail)
  C.2: Styles ----------------> Phase C.1 (imported by component)
  C.3: Tests -----------------> Phase C.1 (tests validate component)

Phase D (Integration)
  D.1: CourseDetail integration
  D.2: CourseDetail styles (if needed)
```

**Recommended execution order**:
1. A.1, A.2 (types, no dependencies)
2. B.1, B.2 (StarRating interactivity)
3. B.3 (StarRating tests, validates B.1)
4. C.1, C.2 (CourseRatingSection component + styles)
5. C.3 (CourseRatingSection tests, validates C.1)
6. D.1, D.2 (integration into course detail)

---

## Verification Steps

After each phase, run the following:

### After Phase A (Types)
```bash
cd Frontend && yarn build
```
Confirm no TypeScript errors. Type changes alone should not break existing code since all new fields are optional.

### After Phase B (StarRating)
```bash
cd Frontend && yarn test src/components/StarRating
```
All existing 16 tests must still pass. New interactive tests must also pass.

```bash
cd Frontend && yarn build
```
Confirm the `'use client'` directive does not break the existing catalog page or course detail page (both use `StarRating` in readonly mode).

### After Phase C (CourseRatingSection)
```bash
cd Frontend && yarn test src/components/CourseRating
```
All new tests must pass.

### After Phase D (Integration)
```bash
cd Frontend && yarn build
```
Full production build must succeed.

```bash
cd Frontend && yarn test
```
All tests across the project must pass.

```bash
cd Frontend && yarn lint
```
No lint errors.

### Manual Verification
1. Start the backend: `cd Backend && make start && make seed-fresh`
2. Start the frontend: `cd Frontend && yarn dev`
3. Navigate to `http://localhost:3000` -- course cards should show star ratings (already implemented)
4. Click a course to go to the detail page
5. Verify the rating section appears with:
   - Average rating number and read-only stars
   - Distribution bar chart (5 bars)
   - Interactive star rating input
6. Click a star to submit a rating
7. Verify success message appears and stats update
8. Refresh the page -- the user's rating should persist (loaded via `getUserRating` on mount)
9. Click a different star -- should update (not create duplicate) via `updateRating`

---

## Files Summary

### Modified files (5)
| File | Phase | Change Description |
|------|-------|--------------------|
| `Frontend/src/types/rating.ts` | A.1 | Add `rating_distribution` to `RatingStats` interface and update `isRatingStats` type guard |
| `Frontend/src/types/index.ts` | A.2 | Add `rating_distribution` to `CourseDetail` interface |
| `Frontend/src/components/StarRating/StarRating.tsx` | B.1 | Add `'use client'`, `onRate` prop, hover state, click handlers, interactive class |
| `Frontend/src/components/StarRating/StarRating.module.scss` | B.2 | Add `.interactive` class with cursor and hover transform |
| `Frontend/src/components/StarRating/__tests__/StarRating.test.tsx` | B.3 | Add 6 test cases for interactive mode |
| `Frontend/src/components/CourseDetail/CourseDetail.tsx` | D.1 | Import and render `CourseRatingSection` between stats and classes sections |
| `Frontend/src/components/CourseDetail/CourseDetail.module.scss` | D.2 | Add wrapper styles if needed for layout spacing |

### New files (3)
| File | Phase | Description |
|------|-------|-------------|
| `Frontend/src/components/CourseRating/CourseRating.tsx` | C.1 | Client component: rating overview, distribution chart, interactive user rating |
| `Frontend/src/components/CourseRating/CourseRating.module.scss` | C.2 | Styles for rating section layout, distribution bars, user input area |
| `Frontend/src/components/CourseRating/__tests__/CourseRating.test.tsx` | C.3 | 10 test cases covering rendering, API interactions, state transitions |

### Unchanged files (confirmed no modifications needed)
| File | Reason |
|------|--------|
| `Frontend/src/services/ratingsApi.ts` | Already has full CRUD. `getRatingStats` return type will automatically match updated `RatingStats` interface. |
| `Frontend/src/app/course/[slug]/page.tsx` | Server component fetches data and passes to `CourseDetailComponent`. No changes needed -- `rating_distribution` flows through the existing `CourseDetail` type. |
| `Frontend/src/components/Course/Course.tsx` | Catalog card already displays read-only `StarRating`. Not affected by this work. |
| `Frontend/src/app/page.tsx` | Home page catalog. Not affected. |
| `Frontend/next.config.ts` | SCSS auto-import already configured. |

---

## Known Limitations & Future Work

1. **No authentication**: Uses hardcoded `GUEST_USER_ID = 1`. All users share the same rating. When auth is added, replace with authenticated user ID from session/context.
2. **No optimistic updates**: The UI waits for API response before updating. Could add optimistic UI for better perceived performance.
3. **SVG gradient ID collision**: `halfStarGradient` is a static ID. If two `StarRating` instances both show half-stars, they share the gradient. Works but is fragile. Future fix: use unique IDs per instance.
4. **CourseDetail type vs backend response mismatch**: `course.title` and `course.teacher` used in `CourseDetail.tsx` do not match the backend response (`name`, `teacher_id`). Pre-existing issue, not addressed here.
5. **No delete rating UI**: The `ratingsApi.deleteRating` function exists but no UI allows deleting a rating. Could add a "remove rating" button in the future.
