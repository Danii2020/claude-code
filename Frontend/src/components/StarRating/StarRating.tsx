'use client';

/**
 * StarRating Component
 * Componente de calificación con estrellas (readonly o interactivo)
 */

import { useState } from 'react';
import styles from './StarRating.module.scss';

interface StarRatingProps {
  rating: number; // 0-5, puede ser decimal
  totalRatings?: number; // Número total de ratings
  showCount?: boolean; // Mostrar contador de ratings
  size?: 'small' | 'medium' | 'large'; // Tamaño visual
  readonly?: boolean; // Modo solo lectura
  onRate?: (rating: number) => void; // Callback al calificar (activa modo interactivo)
  className?: string; // Clase CSS adicional
}

/**
 * Sub-componente: Icono de estrella con diferentes estados de relleno
 */
interface StarIconProps {
  fillState: 'empty' | 'half' | 'full';
}

const StarIcon = ({ fillState }: StarIconProps) => {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <defs>
        {/* Gradient para media estrella */}
        <linearGradient id="halfStarGradient">
          <stop offset="50%" stopColor="currentColor" />
          <stop offset="50%" stopColor="transparent" />
        </linearGradient>
      </defs>
      <path
        d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"
        fill={
          fillState === 'full'
            ? 'currentColor'
            : fillState === 'half'
            ? 'url(#halfStarGradient)'
            : 'none'
        }
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};

/**
 * Componente principal: StarRating
 */
export const StarRating = ({
  rating,
  totalRatings = 0,
  showCount = false,
  size = 'medium',
  readonly = false,
  onRate,
  className = '',
}: StarRatingProps) => {
  const [hoverRating, setHoverRating] = useState(0);
  const isInteractive = !readonly && !!onRate;

  /**
   * Determina el estado de relleno de cada estrella
   */
  const getStarFillState = (starIndex: number): 'empty' | 'half' | 'full' => {
    const displayRating = isInteractive && hoverRating > 0 ? hoverRating : rating;
    const currentRating = Math.max(0, Math.min(5, displayRating)); // Clamp 0-5

    if (currentRating >= starIndex) return 'full';
    if (currentRating >= starIndex - 0.5) return 'half';
    return 'empty';
  };

  // Formatear el rating para mostrar (1 decimal)
  const formattedRating = rating.toFixed(1);

  const handleStarClick = (star: number) => {
    if (isInteractive) {
      onRate(star);
    }
  };

  return (
    <div
      className={`${styles.starRating} ${styles[size]} ${isInteractive ? styles.interactive : ''} ${className}`}
      role={isInteractive ? 'group' : 'img'}
      aria-label={isInteractive
        ? `Rate this course`
        : `Rating: ${formattedRating} out of 5 stars${
            showCount && totalRatings > 0 ? `, ${totalRatings} ratings` : ''
          }`
      }
    >
      <div className={styles.stars}>
        {[1, 2, 3, 4, 5].map((star) => (
          isInteractive ? (
            <button
              key={star}
              type="button"
              className={`${styles.star} ${styles[getStarFillState(star)]} ${styles.interactiveStar}`}
              onMouseEnter={() => setHoverRating(star)}
              onMouseLeave={() => setHoverRating(0)}
              onClick={() => handleStarClick(star)}
              aria-label={`Rate ${star} star${star !== 1 ? 's' : ''}`}
            >
              <StarIcon fillState={getStarFillState(star)} />
            </button>
          ) : (
            <span
              key={star}
              className={`${styles.star} ${styles[getStarFillState(star)]}`}
              aria-hidden="true"
            >
              <StarIcon fillState={getStarFillState(star)} />
            </span>
          )
        ))}
      </div>

      {/* Contador de ratings (opcional) */}
      {showCount && totalRatings > 0 && (
        <span className={styles.count} aria-label={`${totalRatings} ratings`}>
          ({totalRatings})
        </span>
      )}
    </div>
  );
};
