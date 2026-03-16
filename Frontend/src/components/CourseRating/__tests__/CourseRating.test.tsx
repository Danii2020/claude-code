import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { CourseRatingSection } from '../CourseRating';
import { ratingsApi } from '@/services/ratingsApi';

vi.mock('@/services/ratingsApi', () => ({
  ratingsApi: {
    getUserRating: vi.fn(),
    getRatingStats: vi.fn(),
    createRating: vi.fn(),
    updateRating: vi.fn(),
  },
}));

const mockDistribution = { 1: 2, 2: 3, 3: 5, 4: 8, 5: 12 };

const defaultProps = {
  courseId: 1,
  initialAverageRating: 4.2,
  initialTotalRatings: 30,
  initialDistribution: mockDistribution,
};

describe('CourseRatingSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(ratingsApi.getUserRating).mockResolvedValue(null);
    vi.mocked(ratingsApi.getRatingStats).mockResolvedValue({
      average_rating: 4.3,
      total_ratings: 31,
      rating_distribution: mockDistribution,
    });
    vi.mocked(ratingsApi.createRating).mockResolvedValue({
      id: 1,
      course_id: 1,
      user_id: 1,
      rating: 4,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    });
    vi.mocked(ratingsApi.updateRating).mockResolvedValue({
      id: 1,
      course_id: 1,
      user_id: 1,
      rating: 5,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    });
  });

  it('renders the section title', () => {
    render(<CourseRatingSection {...defaultProps} />);
    expect(screen.getByText('Calificaciones')).toBeInTheDocument();
  });

  it('displays the average rating', () => {
    render(<CourseRatingSection {...defaultProps} />);
    expect(screen.getByText('4.2')).toBeInTheDocument();
  });

  it('renders distribution bars for all 5 star levels', () => {
    render(<CourseRatingSection {...defaultProps} />);
    const bars = screen.getAllByRole('progressbar');
    expect(bars).toHaveLength(5);
  });

  it('displays correct counts in distribution', () => {
    render(<CourseRatingSection {...defaultProps} />);
    expect(screen.getByText('12')).toBeInTheDocument(); // 5 stars
    expect(screen.getByText('8')).toBeInTheDocument();  // 4 stars
  });

  it('fetches existing user rating on mount', async () => {
    render(<CourseRatingSection {...defaultProps} />);
    await waitFor(() => {
      expect(ratingsApi.getUserRating).toHaveBeenCalledWith(1, 1);
    });
  });

  it('shows "Tu calificacion:" when user has already rated', async () => {
    vi.mocked(ratingsApi.getUserRating).mockResolvedValue({
      id: 1, course_id: 1, user_id: 1, rating: 4,
      created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
    });
    render(<CourseRatingSection {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText('Tu calificacion:')).toBeInTheDocument();
    });
  });

  it('creates a new rating when user has not rated before', async () => {
    render(<CourseRatingSection {...defaultProps} />);
    await waitFor(() => expect(ratingsApi.getUserRating).toHaveBeenCalled());

    const star4 = screen.getByRole('button', { name: 'Rate 4 stars' });
    fireEvent.click(star4);

    await waitFor(() => {
      expect(ratingsApi.createRating).toHaveBeenCalledWith(1, {
        user_id: 1,
        rating: 4,
      });
    });
  });

  it('updates rating when user has already rated', async () => {
    vi.mocked(ratingsApi.getUserRating).mockResolvedValue({
      id: 1, course_id: 1, user_id: 1, rating: 3,
      created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
    });
    render(<CourseRatingSection {...defaultProps} />);
    await waitFor(() => expect(ratingsApi.getUserRating).toHaveBeenCalled());

    const star5 = screen.getByRole('button', { name: 'Rate 5 stars' });
    fireEvent.click(star5);

    await waitFor(() => {
      expect(ratingsApi.updateRating).toHaveBeenCalledWith(1, 1, {
        user_id: 1,
        rating: 5,
      });
    });
  });

  it('shows success message after successful rating', async () => {
    render(<CourseRatingSection {...defaultProps} />);
    await waitFor(() => expect(ratingsApi.getUserRating).toHaveBeenCalled());

    const star4 = screen.getByRole('button', { name: 'Rate 4 stars' });
    fireEvent.click(star4);

    await waitFor(() => {
      expect(screen.getByText('Calificacion guardada')).toBeInTheDocument();
    });
  });

  it('shows error message when rating fails', async () => {
    vi.mocked(ratingsApi.createRating).mockRejectedValue(new Error('Network error'));
    render(<CourseRatingSection {...defaultProps} />);
    await waitFor(() => expect(ratingsApi.getUserRating).toHaveBeenCalled());

    const star4 = screen.getByRole('button', { name: 'Rate 4 stars' });
    fireEvent.click(star4);

    await waitFor(() => {
      expect(screen.getByText('Error al calificar. Intenta de nuevo.')).toBeInTheDocument();
    });
  });
});
