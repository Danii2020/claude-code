# Ratings Implementation Plan - Platziflix

## Executive Summary

The course ratings system (1-5 stars) requires completing work across four components. The backend is fully implemented (model, service, API, schemas, tests) but lacks seed data. The frontend has partial support (read-only StarRating, ratingsApi client, types) but lacks interactive rating and course detail integration. Both mobile apps have zero rating support.

This plan provides file-by-file, change-by-change instructions ordered by execution priority.

---

## Phase 1: Backend - Seed Data for CourseRating

**Priority**: Highest (all other components depend on real data to verify behavior)
**Estimated effort**: Small

### Task 1.1: Add CourseRating seed data

**File**: `/Users/danielerazo/Projects/claude-code/Backend/app/db/seed.py`

**Changes**:

1. Add `CourseRating` import at line 4:
```python
from app.models import Teacher, Course, Lesson, course_teachers
from app.models.course_rating import CourseRating  # ADD THIS
```

2. After the lessons commit block (after line 145 `db.commit()`), add rating seed data:
```python
# Create sample ratings
ratings_data = [
    # Course 1 (React) - average ~4.2
    {"course": course1, "user_id": 1, "rating": 5},
    {"course": course1, "user_id": 2, "rating": 4},
    {"course": course1, "user_id": 3, "rating": 4},
    {"course": course1, "user_id": 4, "rating": 5},
    {"course": course1, "user_id": 5, "rating": 3},
    # Course 2 (Python) - average ~3.8
    {"course": course2, "user_id": 1, "rating": 4},
    {"course": course2, "user_id": 2, "rating": 3},
    {"course": course2, "user_id": 3, "rating": 5},
    {"course": course2, "user_id": 6, "rating": 3},
    # Course 3 (JavaScript) - average ~4.5
    {"course": course3, "user_id": 1, "rating": 5},
    {"course": course3, "user_id": 2, "rating": 4},
    {"course": course3, "user_id": 4, "rating": 5},
    {"course": course3, "user_id": 5, "rating": 4},
]

for rating_data in ratings_data:
    rating = CourseRating(
        course_id=rating_data["course"].id,
        user_id=rating_data["user_id"],
        rating=rating_data["rating"],
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(rating)

db.commit()
```

3. Update the success print block to include ratings count:
```python
print(f"   - Created {len(ratings_data)} ratings")
```

4. In `clear_all_data()`, add `CourseRating` deletion **before** `Lesson` deletion (line 166) since ratings have a FK to courses:
```python
from app.models.course_rating import CourseRating  # Add import
# In clear_all_data:
db.query(CourseRating).delete()  # Add before Lesson delete
db.query(Lesson).delete()
```

**Verification**: Run `make seed-fresh` then `GET /courses` -- each course should have non-zero `average_rating` and `total_ratings`.

---

## Phase 2: Frontend - Interactive Ratings & Course Detail

**Priority**: High
**Estimated effort**: Medium

### Task 2.1: Add `rating_distribution` to the `RatingStats` type

**File**: `/Users/danielerazo/Projects/claude-code/Frontend/src/types/rating.ts`

**Change**: The backend returns `rating_distribution` in stats responses but the frontend type does not include it. Add it:

```typescript
export interface RatingStats {
  average_rating: number;
  total_ratings: number;
  rating_distribution?: Record<number, number>; // ADD: counts per star (1-5)
}
```

### Task 2.2: Add rating fields to `CourseDetail` type

**File**: `/Users/danielerazo/Projects/claude-code/Frontend/src/types/index.ts`

**Change**: The `CourseDetail` type extends `Course` which already has optional `average_rating` and `total_ratings`. The backend also returns `rating_distribution` on the detail endpoint. Add it:

```typescript
export interface CourseDetail extends Course {
  description: string;
  classes: Class[];
  rating_distribution?: Record<number, number>; // ADD
}
```

### Task 2.3: Make StarRating support interactive mode (onClick per star)

**File**: `/Users/danielerazo/Projects/claude-code/Frontend/src/components/StarRating/StarRating.tsx`

**Changes**: Add an `onRate` callback prop. When `readonly` is false and `onRate` is provided, each star becomes clickable and shows hover state.

```typescript
interface StarRatingProps {
  rating: number;
  totalRatings?: number;
  showCount?: boolean;
  size?: 'small' | 'medium' | 'large';
  readonly?: boolean;
  className?: string;
  onRate?: (rating: number) => void; // ADD: callback when user clicks a star
}
```

Implementation changes inside the component:
- Add `hoverRating` state: `const [hoverRating, setHoverRating] = useState(0);`
- The display rating becomes `hoverRating || rating` when not readonly.
- Each star `<span>` gets `onClick`, `onMouseEnter`, `onMouseLeave` handlers when not readonly.
- Add `cursor: pointer` styling for interactive stars.
- The component must become a Client Component: add `'use client';` at the top of the file.

Detailed star rendering change:
```tsx
<span
  key={star}
  className={`${styles.star} ${styles[getStarFillState(star)]} ${!readonly ? styles.interactive : ''}`}
  aria-hidden="true"
  onClick={!readonly && onRate ? () => onRate(star) : undefined}
  onMouseEnter={!readonly ? () => setHoverRating(star) : undefined}
  onMouseLeave={!readonly ? () => setHoverRating(0) : undefined}
>
```

### Task 2.4: Add interactive star styles

**File**: `/Users/danielerazo/Projects/claude-code/Frontend/src/components/StarRating/StarRating.module.scss`

**Add** inside `.star`:
```scss
&.interactive {
  cursor: pointer;

  &:hover {
    transform: scale(1.2);
  }
}
```

### Task 2.5: Create the `CourseRatingSection` client component

**New file**: `/Users/danielerazo/Projects/claude-code/Frontend/src/components/CourseRating/CourseRating.tsx`

This is a Client Component (`'use client'`) that handles the interactive rating submission flow on the course detail page. It:

1. Displays the `StarRating` in read-only mode showing `average_rating` and `total_ratings`.
2. Shows a rating distribution bar chart (5 horizontal bars showing % per star).
3. Provides an interactive `StarRating` for the user to submit their own rating.
4. Uses a hardcoded `user_id` (e.g., `1`) since there is no auth system yet. Display a note: "Rating as Guest User".
5. Calls `ratingsApi.createRating()` on submission, then refreshes stats via `ratingsApi.getRatingStats()`.
6. Manages local state: `userRating`, `ratingState` (from `RatingState` type), `stats`.

Key structure:
```tsx
'use client';

import { useState, useEffect } from 'react';
import { StarRating } from '@/components/StarRating/StarRating';
import { ratingsApi } from '@/services/ratingsApi';
import type { RatingStats, RatingState } from '@/types/rating';
import styles from './CourseRating.module.scss';

interface CourseRatingSectionProps {
  courseId: number;
  initialAverageRating: number;
  initialTotalRatings: number;
  initialDistribution?: Record<number, number>;
}

export const CourseRatingSection = ({ ... }: CourseRatingSectionProps) => {
  const GUEST_USER_ID = 1;
  const [stats, setStats] = useState<RatingStats>({ ... });
  const [userRating, setUserRating] = useState<number | null>(null);
  const [ratingState, setRatingState] = useState<RatingState>('idle');

  // On mount, check if guest user already has a rating
  useEffect(() => {
    ratingsApi.getUserRating(courseId, GUEST_USER_ID).then(existing => {
      if (existing) setUserRating(existing.rating);
    }).catch(() => {});
  }, [courseId]);

  const handleRate = async (rating: number) => {
    setRatingState('loading');
    try {
      await ratingsApi.createRating(courseId, { user_id: GUEST_USER_ID, rating });
      setUserRating(rating);
      // Refresh stats
      const newStats = await ratingsApi.getRatingStats(courseId);
      setStats(newStats);
      setRatingState('success');
    } catch {
      setRatingState('error');
    }
  };

  return (
    <div className={styles.ratingSection}>
      <h3>Course Rating</h3>
      <div className={styles.ratingOverview}>
        <div className={styles.averageDisplay}>
          <span className={styles.averageNumber}>{stats.average_rating.toFixed(1)}</span>
          <StarRating rating={stats.average_rating} size="large" readonly />
          <span className={styles.totalCount}>{stats.total_ratings} ratings</span>
        </div>
        {/* Distribution bars */}
        <div className={styles.distribution}>
          {[5, 4, 3, 2, 1].map(star => (
            <div key={star} className={styles.distributionRow}>
              <span>{star}</span>
              <div className={styles.bar}>
                <div
                  className={styles.barFill}
                  style={{ width: `${stats.total_ratings > 0
                    ? ((stats.rating_distribution?.[star] ?? 0) / stats.total_ratings) * 100
                    : 0}%` }}
                />
              </div>
              <span>{stats.rating_distribution?.[star] ?? 0}</span>
            </div>
          ))}
        </div>
      </div>
      {/* User rating input */}
      <div className={styles.userRating}>
        <p>Rate this course:</p>
        <StarRating
          rating={userRating ?? 0}
          size="large"
          readonly={false}
          onRate={handleRate}
        />
        {ratingState === 'success' && <p>Thank you for your rating!</p>}
        {ratingState === 'error' && <p>Error submitting rating. Try again.</p>}
      </div>
    </div>
  );
};
```

### Task 2.6: Create styles for `CourseRatingSection`

**New file**: `/Users/danielerazo/Projects/claude-code/Frontend/src/components/CourseRating/CourseRating.module.scss`

Key styles:
- `.ratingSection` - container with padding and border
- `.ratingOverview` - flex layout with average on left, distribution on right
- `.averageDisplay` - large number + stars + count stacked vertically
- `.averageNumber` - large font (3rem), bold
- `.distribution` - vertical bars (each row: star label, bar track, count)
- `.distributionRow` - flex row with gap
- `.bar` - gray track background, fixed height
- `.barFill` - colored fill (primary color via `color('primary')`)
- `.userRating` - bordered section at the bottom

Use `color()` SCSS function from `vars.scss` (auto-imported via `next.config.ts`).

### Task 2.7: Integrate `CourseRatingSection` into the course detail page

**File**: `/Users/danielerazo/Projects/claude-code/Frontend/src/components/CourseDetail/CourseDetail.tsx`

**Changes**:

1. Import `CourseRatingSection`:
```typescript
import { CourseRatingSection } from "@/components/CourseRating/CourseRating";
```

2. Add rating section after the `.stats` div (around line 38), before the `classesSection`:
```tsx
{/* Rating Section */}
<CourseRatingSection
  courseId={course.id}
  initialAverageRating={course.average_rating ?? 0}
  initialTotalRatings={course.total_ratings ?? 0}
  initialDistribution={course.rating_distribution}
/>
```

### Task 2.8: Add styles for rating section in course detail

**File**: `/Users/danielerazo/Projects/claude-code/Frontend/src/components/CourseDetail/CourseDetail.module.scss`

**Add** after `.stats` block (line 109):
```scss
.ratingSection {
  margin-top: 2rem;
  padding: 2rem;
  background: color('off-white');
  border-radius: 12px;
  border: 2px solid color('light-gray');
}
```

### Task 2.9: Update StarRating tests for interactive mode

**File**: `/Users/danielerazo/Projects/claude-code/Frontend/src/components/StarRating/__tests__/StarRating.test.tsx`

**Add** test cases:
- "calls onRate when a star is clicked in interactive mode"
- "does not call onRate when readonly is true"
- "shows hover state on mouse enter"

**Verification**: Run `yarn test` and `yarn build` from the Frontend directory.

---

## Phase 3: Android - Display Ratings in Course Cards

**Priority**: Medium (can run in parallel with Phase 4)
**Estimated effort**: Medium

### Task 3.1: Add rating fields to `CourseDTO`

**File**: `/Users/danielerazo/Projects/claude-code/Mobile/PlatziFlixAndroid/app/src/main/java/com/espaciotiago/platziflixandroid/data/entities/CourseDTO.kt`

**Add** two new fields after `teacherIds`:
```kotlin
@SerializedName("average_rating")
val averageRating: Double? = null,

@SerializedName("total_ratings")
val totalRatings: Int? = null
```

These are nullable with defaults because the DTO must handle both list and detail responses, and older API versions.

### Task 3.2: Add rating fields to `Course` domain model

**File**: `/Users/danielerazo/Projects/claude-code/Mobile/PlatziFlixAndroid/app/src/main/java/com/espaciotiago/platziflixandroid/domain/models/Course.kt`

**Add** two new fields:
```kotlin
data class Course(
    val id: Int,
    val name: String,
    val description: String,
    val thumbnail: String,
    val slug: String,
    val averageRating: Double = 0.0,  // ADD
    val totalRatings: Int = 0          // ADD
)
```

Default values ensure backward compatibility with existing usages.

### Task 3.3: Update `CourseMapper` to map rating fields

**File**: `/Users/danielerazo/Projects/claude-code/Mobile/PlatziFlixAndroid/app/src/main/java/com/espaciotiago/platziflixandroid/data/mappers/CourseMapper.kt`

**Change** `fromDTO`:
```kotlin
fun fromDTO(courseDTO: CourseDTO): Course {
    return Course(
        id = courseDTO.id,
        name = courseDTO.name,
        description = courseDTO.description,
        thumbnail = courseDTO.thumbnail,
        slug = courseDTO.slug,
        averageRating = courseDTO.averageRating ?: 0.0,  // ADD
        totalRatings = courseDTO.totalRatings ?: 0         // ADD
    )
}
```

### Task 3.4: Update `MockCourseRepository` with rating data

**File**: `/Users/danielerazo/Projects/claude-code/Mobile/PlatziFlixAndroid/app/src/main/java/com/espaciotiago/platziflixandroid/data/repositories/MockCourseRepository.kt`

**Add** rating fields to each mock `Course`:
```kotlin
Course(
    id = 1,
    name = "Curso de Kotlin",
    description = "...",
    thumbnail = "...",
    slug = "curso-de-kotlin",
    averageRating = 4.5,    // ADD
    totalRatings = 128       // ADD
),
// Repeat for all 5 mock courses with varied ratings
```

### Task 3.5: Create `StarRatingBar` composable

**New file**: `/Users/danielerazo/Projects/claude-code/Mobile/PlatziFlixAndroid/app/src/main/java/com/espaciotiago/platziflixandroid/presentation/courses/components/StarRatingBar.kt`

A read-only composable that displays filled/half/empty stars and an optional count.

```kotlin
package com.espaciotiago.platziflixandroid.presentation.courses.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.StarHalf
import androidx.compose.material.icons.outlined.StarOutline
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

@Composable
fun StarRatingBar(
    rating: Double,
    totalRatings: Int = 0,
    showCount: Boolean = true,
    starSize: Dp = 16.dp,
    starColor: Color = Color(0xFFFFC107),
    modifier: Modifier = Modifier
) {
    Row(
        modifier = modifier,
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(2.dp)
    ) {
        for (i in 1..5) {
            val icon = when {
                rating >= i -> Icons.Filled.Star
                rating >= i - 0.5 -> Icons.Filled.StarHalf
                else -> Icons.Outlined.StarOutline
            }
            Icon(
                imageVector = icon,
                contentDescription = null,
                tint = if (rating >= i - 0.5) starColor else Color.Gray,
                modifier = Modifier.size(starSize)
            )
        }
        if (showCount && totalRatings > 0) {
            Text(
                text = "(${totalRatings})",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(start = 4.dp) // needs import
            )
        }
    }
}
```

Include `@Preview` annotations matching the existing pattern in `CourseCard.kt`.

### Task 3.6: Add `StarRatingBar` to `CourseCard`

**File**: `/Users/danielerazo/Projects/claude-code/Mobile/PlatziFlixAndroid/app/src/main/java/com/espaciotiago/platziflixandroid/presentation/courses/components/CourseCard.kt`

**Changes**:

1. Import `StarRatingBar`.
2. After the description `Text` composable (line 125), add:
```kotlin
// Course rating
if (course.averageRating > 0) {
    StarRatingBar(
        rating = course.averageRating,
        totalRatings = course.totalRatings,
        showCount = true,
        starSize = 14.dp
    )
}
```

3. Update the preview `Course` to include rating fields:
```kotlin
Course(
    id = 1,
    name = "Curso de Kotlin",
    description = "Aprende Kotlin...",
    thumbnail = "https://via.placeholder.com/300x200",
    slug = "curso-de-kotlin",
    averageRating = 4.3,
    totalRatings = 42
)
```

**Verification**: Build the Android project. The course list should display star ratings below each course description.

---

## Phase 4: iOS - Display Ratings in Course Cards

**Priority**: Medium (can run in parallel with Phase 3)
**Estimated effort**: Medium

### Task 4.1: Add rating fields to `CourseDTO`

**File**: `/Users/danielerazo/Projects/claude-code/Mobile/PlatziFlixiOS/PlatziFlixiOS/Data/Entities/CourseDTO.swift`

**Changes** to `CourseDTO`:
```swift
struct CourseDTO: Codable {
    let id: Int
    let name: String
    let description: String
    let thumbnail: String
    let slug: String
    let createdAt: String?
    let updatedAt: String?
    let deletedAt: String?
    let teacherId: [Int]?
    let averageRating: Double?    // ADD
    let totalRatings: Int?        // ADD

    enum CodingKeys: String, CodingKey {
        case id, name, description, thumbnail, slug
        case createdAt = "created_at"
        case updatedAt = "updated_at"
        case deletedAt = "deleted_at"
        case teacherId = "teacher_id"
        case averageRating = "average_rating"   // ADD
        case totalRatings = "total_ratings"     // ADD
    }
}
```

**Also update `CourseDetailDTO`** with the same two fields and coding keys.

### Task 4.2: Add rating fields to `Course` domain model

**File**: `/Users/danielerazo/Projects/claude-code/Mobile/PlatziFlixiOS/PlatziFlixiOS/Domain/Models/Course.swift`

**Add** two fields:
```swift
struct Course: Identifiable, Equatable {
    let id: Int
    let name: String
    let description: String
    let thumbnail: String
    let slug: String
    let teacherIds: [Int]
    let createdAt: Date?
    let updatedAt: Date?
    let deletedAt: Date?
    let averageRating: Double    // ADD
    let totalRatings: Int        // ADD
    // ... existing computed properties
}
```

**Update all `mockCourses`** to include rating values:
```swift
Course(
    id: 4,
    name: "Curso de React.js",
    // ... existing fields ...
    averageRating: 4.2,
    totalRatings: 85
),
// Repeat for all 6 mock courses
```

### Task 4.3: Update `CourseMapper` to map rating fields

**File**: `/Users/danielerazo/Projects/claude-code/Mobile/PlatziFlixiOS/PlatziFlixiOS/Data/Mapper/CourseMapper.swift`

**Changes** to `toDomain(_ dto: CourseDTO)`:
```swift
static func toDomain(_ dto: CourseDTO) -> Course {
    return Course(
        id: dto.id,
        name: dto.name,
        description: dto.description,
        thumbnail: dto.thumbnail,
        slug: dto.slug,
        teacherIds: dto.teacherId ?? [],
        createdAt: parseDate(dto.createdAt),
        updatedAt: parseDate(dto.updatedAt),
        deletedAt: parseDate(dto.deletedAt),
        averageRating: dto.averageRating ?? 0.0,  // ADD
        totalRatings: dto.totalRatings ?? 0        // ADD
    )
}
```

**Also update `toDomain(_ dto: CourseDetailDTO)`**:
```swift
static func toDomain(_ dto: CourseDetailDTO) -> Course {
    return Course(
        // ... existing fields ...
        averageRating: dto.averageRating ?? 0.0,  // ADD
        totalRatings: dto.totalRatings ?? 0        // ADD
    )
}
```

### Task 4.4: Create `StarRatingView` SwiftUI component

**New file**: `/Users/danielerazo/Projects/claude-code/Mobile/PlatziFlixiOS/PlatziFlixiOS/Presentation/Views/StarRatingView.swift`

```swift
import SwiftUI

/// Displays a read-only star rating with optional count
struct StarRatingView: View {
    let rating: Double
    let totalRatings: Int
    let showCount: Bool
    let starSize: CGFloat

    init(
        rating: Double,
        totalRatings: Int = 0,
        showCount: Bool = true,
        starSize: CGFloat = 14
    ) {
        self.rating = rating
        self.totalRatings = totalRatings
        self.showCount = showCount
        self.starSize = starSize
    }

    var body: some View {
        HStack(spacing: 2) {
            ForEach(1...5, id: \.self) { index in
                starImage(for: index)
                    .resizable()
                    .frame(width: starSize, height: starSize)
                    .foregroundColor(
                        rating >= Double(index) - 0.5
                            ? Color(hex: "FFC107")
                            : Color.gray
                    )
            }
            if showCount && totalRatings > 0 {
                Text("(\(totalRatings))")
                    .font(.caption2Regular)
                    .foregroundColor(.secondary)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Rating: \(String(format: "%.1f", rating)) de 5 estrellas, \(totalRatings) calificaciones")
    }

    private func starImage(for index: Int) -> Image {
        if rating >= Double(index) {
            return Image(systemName: "star.fill")
        } else if rating >= Double(index) - 0.5 {
            return Image(systemName: "star.leadinghalf.filled")
        } else {
            return Image(systemName: "star")
        }
    }
}

#Preview {
    VStack(spacing: 12) {
        StarRatingView(rating: 4.5, totalRatings: 128)
        StarRatingView(rating: 3.0, totalRatings: 42)
        StarRatingView(rating: 0.0, totalRatings: 0, showCount: false)
    }
    .padding()
}
```

### Task 4.5: Add `StarRatingView` to `CourseCardView`

**File**: `/Users/danielerazo/Projects/claude-code/Mobile/PlatziFlixiOS/PlatziFlixiOS/Presentation/Views/CourseCardView.swift`

**Add** after the description `Text` (around line 52), inside the VStack:
```swift
// Course rating
if course.averageRating > 0 {
    StarRatingView(
        rating: course.averageRating,
        totalRatings: course.totalRatings,
        showCount: true,
        starSize: 14
    )
}
```

**Verification**: Build the iOS project (Xcode). Preview should show stars on each course card.

---

## Phase 5: Testing & Verification

### 5.1 Backend
```bash
cd Backend
make seed-fresh
docker-compose exec api bash -c "cd /app && uv run pytest"
```
Verify `GET /courses` returns non-zero `average_rating` for all courses.

### 5.2 Frontend
```bash
cd Frontend
yarn test
yarn build
yarn dev  # Manual verification: navigate to a course detail, submit a rating
```

### 5.3 Android
Build in Android Studio. Run on emulator. Verify course cards show star ratings.

### 5.4 iOS
Build in Xcode. Run on simulator. Verify course cards show star ratings.

---

## Dependency Graph

```
Phase 1 (Backend Seed)
    |
    v
Phase 2 (Frontend Interactive)  -- independent of -->  Phase 3 (Android)
                                                         Phase 4 (iOS)
                                                    [3 and 4 are parallel]
    |                |                |
    v                v                v
              Phase 5 (Testing)
```

---

## User Identification Strategy (Frontend)

Since there is no authentication system, the frontend will use a **hardcoded guest user ID** (`user_id = 1`) for all rating operations. This is documented in the `CourseRatingSection` component with a visible "Rating as Guest" indicator. When authentication is added later, the guest ID is replaced with the authenticated user's ID from a single constant/context.

---

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| No auth: any user can overwrite user_id=1 rating | Low (dev only) | Document as TODO; use localStorage to remember submitted rating |
| Mobile apps crash if API returns unexpected fields | Medium | All new DTO fields are optional/nullable with defaults |
| `CourseDetail` type mismatch with backend response | Medium | Backend already returns `average_rating`, `total_ratings`, `rating_distribution` -- types just need to match |
| StarRating half-star SVG gradient `id` collision | Low | Each SVG should use a unique gradient ID or define the gradient once at page level |

---

## Files Modified (Summary)

### Backend (1 file)
- `Backend/app/db/seed.py` -- add CourseRating seed data and clear logic

### Frontend (7 files, 2 new)
- `Frontend/src/types/rating.ts` -- add `rating_distribution` to `RatingStats`
- `Frontend/src/types/index.ts` -- add `rating_distribution` to `CourseDetail`
- `Frontend/src/components/StarRating/StarRating.tsx` -- add interactive mode
- `Frontend/src/components/StarRating/StarRating.module.scss` -- add interactive styles
- `Frontend/src/components/StarRating/__tests__/StarRating.test.tsx` -- add interactive tests
- **NEW** `Frontend/src/components/CourseRating/CourseRating.tsx` -- rating section component
- **NEW** `Frontend/src/components/CourseRating/CourseRating.module.scss` -- rating section styles
- `Frontend/src/components/CourseDetail/CourseDetail.tsx` -- integrate rating section

### Android (5 files, 1 new)
- `data/entities/CourseDTO.kt` -- add `averageRating`, `totalRatings`
- `domain/models/Course.kt` -- add `averageRating`, `totalRatings`
- `data/mappers/CourseMapper.kt` -- map rating fields
- `data/repositories/MockCourseRepository.kt` -- add mock rating data
- **NEW** `presentation/courses/components/StarRatingBar.kt` -- star rating composable
- `presentation/courses/components/CourseCard.kt` -- display star rating

### iOS (5 files, 1 new)
- `Data/Entities/CourseDTO.swift` -- add `averageRating`, `totalRatings` to both DTOs
- `Domain/Models/Course.swift` -- add `averageRating`, `totalRatings` + update mocks
- `Data/Mapper/CourseMapper.swift` -- map rating fields in both overloads
- **NEW** `Presentation/Views/StarRatingView.swift` -- star rating SwiftUI view
- `Presentation/Views/CourseCardView.swift` -- display star rating
