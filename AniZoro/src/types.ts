export interface TrackedAnime {
  mal_id: number;
  title: string;
  image_url: string;
  episodes_count: number | null;
  status: 'watching' | 'completed' | 'on_hold' | 'dropped' | 'plan_to_watch';
  watched_episodes: number[]; // list of completed episode numbers, e.g., [1, 2, 3]
  last_watched_at: string; // ISO string
  my_rating: number; // 0 to 10
  my_notes: string;
}

export interface RecentWatch {
  mal_id: number;
  anime_title: string;
  image_url: string;
  episode_number: number;
  episode_title: string;
  watched_at: string; // ISO string
}

export interface UserProfile {
  username: string;
  avatarColor: string;
  favoriteGenre: string;
  joinedAt: string;
  searchHistory?: string[];
  avatar?: string;
}

export interface JikanAnime {
  mal_id: number;
  /** Latest episode number that has aired (set for the "latest releases" list). */
  latest_episode?: number;
  /** Unix seconds when that episode aired. */
  aired_at?: number;
  title: string;
  title_english: string | null;
  title_japanese: string | null;
  images: {
    jpg: {
      image_url: string;
      small_image_url?: string;
      large_image_url: string;
    };
  };
  trailer: {
    youtube_id: string | null;
    url: string | null;
    embed_url: string | null;
  } | null;
  episodes: number | null;
  status: string;
  synopsis: string | null;
  score: number | null;
  genres: Array<{
    mal_id: number;
    name: string;
  }>;
  studios: Array<{
    mal_id: number;
    name: string;
  }>;
  type?: string;
  members?: number;
  popularity?: number;
  rating?: string;
  year?: number;
  duration?: string;
  aired?: {
    from: string | null;
    to: string | null;
    string?: string | null;
  } | null;
  banner_image?: string | null;
  anilist_id?: number;
  /** false when AniList has no MyAnimeList ID and mal_id holds the AniList ID instead */
  mal_id_is_real?: boolean;
}

export interface JikanEpisode {
  mal_id: number;
  title: string;
  title_japanese: string | null;
  title_romanji: string | null;
  aired: string | null;
  filler: boolean;
  recap: boolean;
  forum_url: string | null;
}

export interface JikanCharacter {
  character: {
    mal_id: number;
    url: string;
    images: {
      jpg: {
        image_url: string;
      };
    };
    name: string;
  };
  role: string;
  voice_actors: Array<{
    person: {
      mal_id: number;
      url: string;
      images: {
        jpg: {
          image_url: string;
        };
      };
      name: string;
    };
    language: string;
  }>;
}

export interface FranchisePart {
  id: string;
  title: string;
  seasonNumber: number;
  partNumber?: number;
  mal_id: number;
  anilist_id?: number;
  image_url?: string;
  episodesCount: number;
  episodesOffset?: number; // For continuous numbering
  badgeText?: string;
}

