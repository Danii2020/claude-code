'use client';

import { useState, useEffect, useCallback } from 'react';
import { StarRating } from '@/components/StarRating/StarRating';
import { ratingsApi } from '@/services/ratingsApi';
import type { RatingState } from '@/types/rating';
import styles from './CourseRating.module.scss';

const GUEST_USER_ID = 1;

interface CourseRatingStats {
  average_rating: number;
  total_ratings: number;
  rating_distribution: Record<number, number>;
}

interface CourseRatingSectionProps {
  courseId: number;
  initialAverageRating: number;
  initialTotalRatings: number;
  initialDistribution: Record<number, number>;
}

export const CourseRatingSection = ({
  courseId,
  initialAverageRating,
  initialTotalRatings,
  initialDistribution,
}: CourseRatingSectionProps) => {
  const [stats, setStats] = useState<CourseRatingStats>({
    average_rating: initialAverageRating,
    total_ratings: initialTotalRatings,
    rating_distribution: initialDistribution,
  });
  const [userRating, setUserRating] = useState<number | null>(null);
  const [ratingState, setRatingState] = useState<RatingState>('idle');

  useEffect(() => {
    ratingsApi.getUserRating(courseId, GUEST_USER_ID).then((existing) => {
      if (existing) {
        setUserRating(existing.rating);
      }
    }).catch(() => {
      // Silently ignore - user just hasn't rated yet
    });
  }, [courseId]);

  const refreshStats = useCallback(async () => {
    try {
      const freshStats = await ratingsApi.getRatingStats(courseId);
      setStats({
        average_rating: freshStats.average_rating,
        total_ratings: freshStats.total_ratings,
        rating_distribution: freshStats.rating_distribution ?? stats.rating_distribution,
      });
    } catch {
      // Keep current stats on refresh failure
    }
  }, [courseId, stats.rating_distribution]);

  const handleRate = async (rating: number) => {
    setRatingState('loading');
    try {
      if (userRating) {
        await ratingsApi.updateRating(courseId, GUEST_USER_ID, {
          user_id: GUEST_USER_ID,
          rating,
        });
      } else {
        await ratingsApi.createRating(courseId, {
          user_id: GUEST_USER_ID,
          rating,
        });
      }
      setUserRating(rating);
      setRatingState('success');
      await refreshStats();
    } catch {
      setRatingState('error');
    }
  };

  const maxCount = Math.max(...Object.values(stats.rating_distribution), 1);

  return (
    <div className={styles.ratingSection}>
      <h2 className={styles.sectionTitle}>Calificaciones</h2>

      <div className={styles.ratingContent}>
        {/* Rating Overview */}
        <div className={styles.ratingOverview}>
          <span className={styles.averageRating}>
            {stats.average_rating.toFixed(1)}
          </span>
          <StarRating
            rating={stats.average_rating}
            totalRatings={stats.total_ratings}
            showCount
            size="large"
            readonly
          />
        </div>

        {/* Distribution Chart */}
        <div className={styles.distribution}>
          {[5, 4, 3, 2, 1].map((star) => {
            const count = stats.rating_distribution[star] ?? 0;
            const percentage = maxCount > 0 ? (count / maxCount) * 100 : 0;
            return (
              <div key={star} className={styles.distributionRow}>
                <span className={styles.starLabel}>{star}</span>
                <div className={styles.barContainer}>
                  <div
                    className={styles.bar}
                    style={{ width: `${percentage}%` }}
                    role="progressbar"
                    aria-valuenow={count}
                    aria-label={`${star} stars: ${count} ratings`}
                  />
                </div>
                <span className={styles.barCount}>{count}</span>
              </div>
            );
          })}
        </div>

        {/* User Rating Input */}
        <div className={styles.userRating}>
          <p className={styles.userRatingLabel}>
            {userRating ? 'Tu calificacion:' : 'Califica este curso:'}
          </p>
          <StarRating
            rating={userRating ?? 0}
            size="large"
            onRate={handleRate}
          />
          {ratingState === 'loading' && (
            <p className={styles.statusMessage}>Enviando...</p>
          )}
          {ratingState === 'success' && (
            <p className={styles.statusMessage} data-status="success">Calificacion guardada</p>
          )}
          {ratingState === 'error' && (
            <p className={styles.statusMessage} data-status="error">Error al calificar. Intenta de nuevo.</p>
          )}
        </div>
      </div>
    </div>
  );
};
