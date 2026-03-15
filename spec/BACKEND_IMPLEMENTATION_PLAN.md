# Backend Implementation Plan - CourseRating Seed Data & Gaps

## Scope

This plan covers all backend work needed to complete the ratings feature. The architect's analysis identified Phase 1 as "Backend - Seed Data for CourseRating." After auditing the codebase, I confirm the core backend (model, service, endpoints, schemas, migrations, tests) is fully implemented. The remaining work is:

1. Add CourseRating seed data to `seed.py`
2. Fix `clear_all_data()` to handle CourseRating rows (FK constraint issue)
3. Fix a broken test contract in `test_main.py` that does not account for rating fields
4. Add a seed data integration test

---

## Current State Audit

### Fully Implemented (no changes needed)

| File | Status |
|------|--------|
| `/Users/danielerazo/Projects/claude-code/Backend/app/models/course_rating.py` | Complete. Model with CHECK constraint, FK to courses, relationship, `to_dict()` |
| `/Users/danielerazo/Projects/claude-code/Backend/app/models/course.py` | Complete. Has `ratings` relationship, `average_rating` and `total_ratings` computed properties |
| `/Users/danielerazo/Projects/claude-code/Backend/app/models/__init__.py` | Complete. Exports `CourseRating` at line 9 |
| `/Users/danielerazo/Projects/claude-code/Backend/app/models/base.py` | Complete. `BaseModel` with `id`, `created_at`, `updated_at`, `deleted_at` |
| `/Users/danielerazo/Projects/claude-code/Backend/app/schemas/rating.py` | Complete. `RatingRequest`, `RatingResponse`, `RatingStatsResponse`, `ErrorResponse` |
| `/Users/danielerazo/Projects/claude-code/Backend/app/services/course_service.py` | Complete. All 7 methods implemented: `get_all_courses`, `get_course_by_slug`, `get_course_ratings`, `add_course_rating`, `update_course_rating`, `delete_course_rating`, `get_user_course_rating`, `get_course_rating_stats` |
| `/Users/danielerazo/Projects/claude-code/Backend/app/main.py` | Complete. 6 rating endpoints: POST, GET list, GET stats, GET user rating, PUT, DELETE |
| `/Users/danielerazo/Projects/claude-code/Backend/app/alembic/versions/0e3a8766f785_add_course_ratings_table.py` | Complete. Migration creates `course_ratings` table with constraints and indexes |
| `/Users/danielerazo/Projects/claude-code/Backend/app/tests/test_rating_endpoints.py` | Complete. 14 tests covering all rating endpoints |
| `/Users/danielerazo/Projects/claude-code/Backend/app/tests/test_course_rating_service.py` | Complete. 13 tests covering all service methods |
| `/Users/danielerazo/Projects/claude-code/Backend/app/tests/test_rating_db_constraints.py` | Complete. 4 constraint tests (1 skipped due to PostgreSQL NULL uniqueness behavior) |

### Needs Changes

| File | Issue |
|------|-------|
| `/Users/danielerazo/Projects/claude-code/Backend/app/db/seed.py` | No CourseRating data seeded. `clear_all_data()` does not delete CourseRating rows, which will cause FK violation when deleting courses. |
| `/Users/danielerazo/Projects/claude-code/Backend/app/test_main.py` | Lines 232-237 and 247-249: Contract compliance tests assert course list response has exactly `{"id", "name", "description", "thumbnail", "slug"}` but `get_all_courses()` now returns `average_rating` and `total_ratings` too (lines 48-49 of `course_service.py`). These tests will fail when mock data includes rating fields. Similarly, line 248 asserts course detail has exactly `{"id", "name", "description", "thumbnail", "slug", "teacher_id", "classes"}` but `get_course_by_slug()` now returns `average_rating`, `total_ratings`, and `rating_distribution` (lines 107-109 of `course_service.py`). |

---

## Implementation Tasks

### Task 1: Update `clear_all_data()` in seed.py ✅ COMPLETED

**File**: `/Users/danielerazo/Projects/claude-code/Backend/app/db/seed.py`

**Why**: The `clear_all_data()` function (lines 160-179) deletes Lessons, then course_teachers, then Courses, then Teachers. It does not delete `CourseRating` rows. Since `course_ratings.course_id` has a FK constraint to `courses.id`, deleting courses will fail with an `IntegrityError` if any ratings exist. This must be fixed BEFORE adding seed ratings, otherwise `make seed-fresh` will break.

**What to change**:
- Add `CourseRating` to the import on line 9 (currently imports `Teacher, Course, Lesson, course_teachers`)
- Add `db.query(CourseRating).delete()` as the FIRST delete statement inside `clear_all_data()`, before the Lesson delete on line 166. CourseRating has FK to courses, so it must be deleted before courses. It has no other FK dependencies, so it can go first.

**Dependency**: None. This is the first task.

**Verification**: Run `make seed-fresh` with no ratings in the DB -- it should succeed without errors. This confirms the delete order is correct even when the ratings table is empty.

---

### Task 2: Add CourseRating seed data to `create_sample_data()` ✅ COMPLETED

**File**: `/Users/danielerazo/Projects/claude-code/Backend/app/db/seed.py`

**Why**: The seed script creates 3 courses, 3 teachers, and 6 lessons but zero ratings. All frontends and mobile apps need ratings data to verify their UI.

**What to change**:
- The `CourseRating` import added in Task 1 is already available.
- After the lessons commit block (line 145 `db.commit()`), add a new block that:
  1. Defines a list of rating dictionaries covering all 3 courses with varied user_ids (1 through 6) and rating values (1 through 5). Target distributions:
     - course1 (React): 5 ratings, mix of 3/4/5 for an average around 4.2
     - course2 (Python): 4 ratings, mix of 3/4/5 for an average around 3.8
     - course3 (JavaScript): 4 ratings, mostly 4/5 for an average around 4.5
  2. Iterates the list, creating `CourseRating` instances using `course_id=rating_data["course"].id` (the course objects are already flushed and have IDs after line 72's commit)
  3. Sets `created_at` and `updated_at` to `datetime.utcnow()` on each rating (matching the pattern used for other models in this file)
  4. Commits after all ratings are added
- Update the success print block (lines 147-150) to include a line reporting the number of ratings created

**Dependency**: Task 1 must be complete (import is shared).

**Verification**: Run `make seed-fresh`, then `curl http://localhost:8000/courses` and confirm each course has non-zero `average_rating` and `total_ratings` values. Also run `curl http://localhost:8000/courses/1/ratings/stats` (replace 1 with actual course ID) and confirm `rating_distribution` shows the expected counts.

---

### Task 3: Fix contract compliance tests in test_main.py ✅ COMPLETED

**File**: `/Users/danielerazo/Projects/claude-code/Backend/app/test_main.py`

**Why**: The `TestContractCompliance` class has two tests that assert exact field sets for API responses, but these field sets are outdated:

1. `test_courses_list_contract_fields_only` (line 225-237): Asserts response fields are exactly `{"id", "name", "description", "thumbnail", "slug"}`. But `CourseService.get_all_courses()` (lines 42-50 of course_service.py) now includes `average_rating` and `total_ratings` in its response dict. The mock data at line 9-24 (`MOCK_COURSES_LIST`) also lacks these fields.

2. `test_course_detail_contract_fields_only` (line 239-255): Asserts course detail fields are exactly `{"id", "name", "description", "thumbnail", "slug", "teacher_id", "classes"}`. But `CourseService.get_course_by_slug()` (lines 107-109 of course_service.py) now includes `average_rating`, `total_ratings`, and `rating_distribution`.

**What to change**:
- Update `MOCK_COURSES_LIST` (lines 9-24) to include `"average_rating"` and `"total_ratings"` fields in each course dict
- Update `MOCK_COURSE_DETAIL` (lines 26-47) to include `"average_rating"`, `"total_ratings"`, and `"rating_distribution"` fields
- Update the expected field set on line 232 to: `{"id", "name", "description", "thumbnail", "slug", "average_rating", "total_ratings"}`
- Update the expected field set on line 248 to: `{"id", "name", "description", "thumbnail", "slug", "teacher_id", "classes", "average_rating", "total_ratings", "rating_distribution"}`

**Dependency**: None. Can run in parallel with Tasks 1-2.

**Verification**: Run `docker-compose exec api bash -c "cd /app && uv run pytest app/test_main.py -v"` and confirm all tests pass, including the two updated contract compliance tests.

---

### Task 4: Run full test suite and verify ✅ COMPLETED

**Why**: Ensure no regressions from the changes in Tasks 1-3.

**What to run**:
1. `docker-compose exec api bash -c "cd /app && uv run pytest"` -- all tests should pass
2. `make seed-fresh` -- should complete without errors
3. `curl http://localhost:8000/courses` -- each course should have `average_rating > 0` and `total_ratings > 0`
4. `curl http://localhost:8000/courses/curso-de-react` -- should include `rating_distribution` with non-zero values
5. `curl http://localhost:8000/courses/<course_id>/ratings` (replace with actual ID) -- should return the seeded rating objects
6. `curl http://localhost:8000/courses/<course_id>/ratings/stats` -- should match the expected averages

**Dependency**: Tasks 1, 2, and 3 must all be complete.

---

## Execution Order Summary

```
Task 1: Fix clear_all_data() in seed.py (add CourseRating import + delete)
   |
   v
Task 2: Add CourseRating seed data to create_sample_data()
   |
   +--- Task 3: Fix contract tests in test_main.py (parallel with 1-2)
   |
   v
Task 4: Full verification (depends on 1, 2, 3)
```

---

## Files Changed (Summary)

| File | Type of Change |
|------|---------------|
| `/Users/danielerazo/Projects/claude-code/Backend/app/db/seed.py` | Add import, add rating seed data block, add CourseRating delete in `clear_all_data()`, update print statement |
| `/Users/danielerazo/Projects/claude-code/Backend/app/test_main.py` | Update mock data and expected field sets to include rating fields |

**Total files modified**: 2
**New files**: 0
**Migrations needed**: 0 (table already exists via `0e3a8766f785`)

---

## Gaps Found Beyond Architect's Plan

1. **test_main.py contract tests are broken**: The architect's plan did not mention that `test_main.py` lines 232 and 248 assert exact field sets that are now outdated after the rating fields were added to `get_all_courses()` and `get_course_by_slug()`. These tests will fail on the current codebase even without the seed changes. This is a pre-existing bug that should be fixed as part of this phase.

2. **Class model inconsistency**: The `Class` model exists at `/Users/danielerazo/Projects/claude-code/Backend/app/models/class_.py` with `back_populates="classes"`, but the `Course` model only defines a `lessons` relationship (not `classes`). The seed data only creates `Lesson` objects, not `Class` objects. This is not related to ratings but is worth noting as a pre-existing discrepancy. No action needed for this plan.

3. **No seed test**: There is no automated test that verifies the seed script runs without errors. This is acceptable for now since Task 4 covers manual verification, but a future improvement would be to add a pytest fixture that runs `create_sample_data()` against a test database and asserts the expected counts.
