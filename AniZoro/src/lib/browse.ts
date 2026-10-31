export type BrowseCategory = 'movies' | 'series' | 'new' | 'popular' | 'top';

export const BROWSE_LABELS: Record<BrowseCategory, { title: string; blurb: string }> = {
  movies: { title: 'Movies', blurb: 'Anime films, most popular first' },
  series: { title: 'Series', blurb: 'TV anime, most popular first' },
  new: { title: 'New Releases', blurb: 'Everything airing this season' },
  popular: { title: 'Popular', blurb: 'All-time most popular anime' },
  top: { title: 'Top Rated', blurb: 'Highest rated popular anime' },
};

export const BROWSE_GENRES = [
  'Action',
  'Adventure',
  'Comedy',
  'Drama',
  'Fantasy',
  'Horror',
  'Mystery',
  'Psychological',
  'Romance',
  'Sci-Fi',
  'Slice of Life',
  'Sports',
  'Supernatural',
  'Thriller',
];
