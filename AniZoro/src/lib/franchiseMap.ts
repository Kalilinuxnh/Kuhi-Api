import { JikanAnime, FranchisePart, JikanEpisode } from '../types';
import { jikanService } from './jikan';
import { checkTitleSeasonAndChooseEpisode } from './seasonDetector';

export interface KnownFranchiseConfig {
  franchiseName: string;
  parts: FranchisePart[];
}

export const KNOWN_FRANCHISE_MAP: Record<number, KnownFranchiseConfig> = {};
export const KNOWN_ANILIST_MAP: Record<number, number> = {};
// AniList ids of the parts registered below (one MAL id and one AniList id per season / part)
const PART_ANILIST: Record<number, number> = {};

// Helper to register franchise with all sibling MAL IDs & AniList IDs
function registerFranchise(name: string, parts: FranchisePart[]) {
  const config: KnownFranchiseConfig = { franchiseName: name, parts };
  for (const part of parts) {
    if (part.mal_id) {
      KNOWN_FRANCHISE_MAP[part.mal_id] = config;
      if (part.anilist_id) {
        KNOWN_ANILIST_MAP[part.mal_id] = part.anilist_id;
        PART_ANILIST[part.mal_id] = part.anilist_id;
      }
    }
  }
}

// 1. Attack on Titan (Shingeki no Kyojin)
// Season 1: 25 eps
// Season 2: 12 eps
// Season 3: Part 1 (12 eps) + Part 2 (10 eps) = 22 eps total (VidSrc SBS exclusive for Part 2)
// Season 4: The Final Season Part 1 (16 eps) + Part 2 (12 eps) = 28 eps total
// Separate 1-Hour Specials: The Final Chapters (Special 1 & Special 2 - 1hr+ parts) = 2 eps total
registerFranchise("Attack on Titan", [
  { id: "aot-s1", title: "Season 1", seasonNumber: 1, mal_id: 16498, anilist_id: 16498, episodesCount: 25, episodesOffset: 0, badgeText: "TV • 25 EPS", image_url: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx16498-buvcRTBx4NSm.jpg" },
  { id: "aot-s2", title: "Season 2", seasonNumber: 2, mal_id: 25777, anilist_id: 20958, episodesCount: 12, episodesOffset: 0, badgeText: "TV • 12 EPS", image_url: "https://cdn.myanimelist.net/images/anime/4/84177l.jpg" },
  { id: "aot-s3-p1", title: "Season 3 Part 1", seasonNumber: 3, partNumber: 1, mal_id: 35760, anilist_id: 99147, episodesCount: 12, episodesOffset: 0, badgeText: "TV • 12 EPS", image_url: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx99147-AiPDD8cwlCfi.jpg" },
  { id: "aot-s3-p2", title: "Season 3 Part 2", seasonNumber: 3, partNumber: 2, mal_id: 38524, anilist_id: 104578, episodesCount: 10, episodesOffset: 12, badgeText: "TV • 10 EPS", image_url: "https://cdn.myanimelist.net/images/anime/1517/100633l.jpg" },
  { id: "aot-s4-p1", title: "The Final Season Part 1", seasonNumber: 4, partNumber: 1, mal_id: 40028, anilist_id: 110277, episodesCount: 16, episodesOffset: 0, badgeText: "TV • 16 EPS", image_url: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx110277-sKUNXAsWMNFw.jpg" },
  { id: "aot-s4-p2", title: "The Final Season Part 2", seasonNumber: 4, partNumber: 2, mal_id: 48583, anilist_id: 131681, episodesCount: 12, episodesOffset: 16, badgeText: "TV • 12 EPS", image_url: "https://cdn.myanimelist.net/images/anime/1948/120625l.jpg" },
  { id: "aot-final-chaps", title: "The Final Chapters (1-Hour Specials)", seasonNumber: 5, mal_id: 51535, anilist_id: 146065, episodesCount: 2, episodesOffset: 0, badgeText: "SPECIALS • 2 EPS (1-HR+)", image_url: "https://cdn.myanimelist.net/images/anime/1279/131078l.jpg" },
]);

// 2. Demon Slayer (Kimetsu no Yaiba)
registerFranchise("Demon Slayer: Kimetsu no Yaiba", [
  { id: "kny-s1", title: "Season 1 - Tanjiro Kamado Unwavering Resolve", seasonNumber: 1, mal_id: 38000, anilist_id: 101922, episodesCount: 26, episodesOffset: 0, badgeText: "TV • 26 EPS", image_url: "https://cdn.myanimelist.net/images/anime/1286/99889l.jpg" },
  { id: "kny-s2", title: "Season 2 - Entertainment District Arc", seasonNumber: 2, mal_id: 47778, anilist_id: 129874, episodesCount: 11, episodesOffset: 0, badgeText: "TV • 11 EPS", image_url: "https://cdn.myanimelist.net/images/anime/1908/120036l.jpg" },
  { id: "kny-s3", title: "Season 3 - Swordsmith Village Arc", seasonNumber: 3, mal_id: 51019, anilist_id: 145139, episodesCount: 11, episodesOffset: 0, badgeText: "TV • 11 EPS", image_url: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx129874-g6ZKXB94Hui1.jpg" },
  { id: "kny-s4", title: "Season 4 - Hashira Training Arc", seasonNumber: 4, mal_id: 55701, anilist_id: 166240, episodesCount: 8, episodesOffset: 0, badgeText: "TV • 8 EPS", image_url: "https://cdn.myanimelist.net/images/anime/1565/142711l.jpg" },
  { id: "kny-m0", title: "Demon Slayer: Mugen Train (Movie)", seasonNumber: 0, mal_id: 40456, anilist_id: 112151, episodesCount: 1, episodesOffset: 0, badgeText: "MOVIE • 1 EP", image_url: "https://cdn.myanimelist.net/images/anime/1704/106947l.jpg" },
]);

// 3. Jujutsu Kaisen
registerFranchise("Jujutsu Kaisen", [
  { id: "jjk-s1", title: "Season 1", seasonNumber: 1, mal_id: 40748, anilist_id: 113415, episodesCount: 24, episodesOffset: 0, badgeText: "TV • 24 EPS", image_url: "https://cdn.myanimelist.net/images/anime/1171/109222l.jpg" },
  { id: "jjk-s2", title: "Season 2 - Shibuya Incident", seasonNumber: 2, mal_id: 51009, anilist_id: 145064, episodesCount: 23, episodesOffset: 0, badgeText: "TV • 23 EPS", image_url: "https://cdn.myanimelist.net/images/anime/1792/138022l.jpg" },
  { id: "jjk-m0", title: "Jujutsu Kaisen 0 (Movie)", seasonNumber: 0, mal_id: 48561, anilist_id: 131573, episodesCount: 1, episodesOffset: 0, badgeText: "MOVIE • 1 EP", image_url: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx131573-rpl82vDEDRm6.jpg" },
]);

// 4. Solo Leveling
registerFranchise("Solo Leveling", [
  { id: "sl-s1", title: "Season 1", seasonNumber: 1, mal_id: 52299, anilist_id: 151807, episodesCount: 12, episodesOffset: 0, badgeText: "TV • 12 EPS", image_url: "https://cdn.myanimelist.net/images/anime/1801/142390l.jpg" },
  { id: "sl-s2", title: "Season 2: Arise from the Shadow", seasonNumber: 2, mal_id: 58567, anilist_id: 176496, episodesCount: 13, episodesOffset: 0, badgeText: "TV • 13 EPS", image_url: "https://cdn.myanimelist.net/images/anime/1025/147458l.jpg" },
]);

// 5. Bleach: Thousand-Year Blood War
registerFranchise("Bleach: Thousand-Year Blood War", [
  { id: "bleach-tybw-p1", title: "Part 1 - The Blood Warfare", seasonNumber: 1, partNumber: 1, mal_id: 41467, anilist_id: 114446, episodesCount: 13, episodesOffset: 0, badgeText: "TV • 13 EPS", image_url: "https://cdn.myanimelist.net/images/anime/1908/135431l.jpg" },
  { id: "bleach-tybw-p2", title: "Part 2 - The Separation", seasonNumber: 2, partNumber: 2, mal_id: 53998, anilist_id: 159322, episodesCount: 13, episodesOffset: 0, badgeText: "TV • 13 EPS", image_url: "https://cdn.myanimelist.net/images/anime/1164/138058l.jpg" },
  { id: "bleach-tybw-p3", title: "Part 3 - The Conflict", seasonNumber: 3, partNumber: 3, mal_id: 57334, anilist_id: 171018, episodesCount: 14, episodesOffset: 0, badgeText: "TV • 14 EPS", image_url: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx171018-60q1B6GK2Ghb.jpg" },
]);

// 6. My Hero Academia
registerFranchise("My Hero Academia", [
  { id: "mha-s1", title: "Season 1", seasonNumber: 1, mal_id: 31964, anilist_id: 21459, episodesCount: 13, episodesOffset: 0, badgeText: "TV • 13 EPS", image_url: "https://cdn.myanimelist.net/images/anime/10/78745l.jpg" },
  { id: "mha-s2", title: "Season 2", seasonNumber: 2, mal_id: 33486, anilist_id: 21856, episodesCount: 25, episodesOffset: 0, badgeText: "TV • 25 EPS", image_url: "https://cdn.myanimelist.net/images/anime/12/85221l.jpg" },
  { id: "mha-s3", title: "Season 3", seasonNumber: 3, mal_id: 36456, anilist_id: 100166, episodesCount: 25, episodesOffset: 0, badgeText: "TV • 25 EPS", image_url: "https://cdn.myanimelist.net/images/anime/1319/92084l.jpg" },
  { id: "mha-s4", title: "Season 4", seasonNumber: 4, mal_id: 38408, anilist_id: 104276, episodesCount: 25, episodesOffset: 0, badgeText: "TV • 25 EPS", image_url: "https://cdn.myanimelist.net/images/anime/1412/107914l.jpg" },
  { id: "mha-s5", title: "Season 5", seasonNumber: 5, mal_id: 42249, anilist_id: 117193, episodesCount: 25, episodesOffset: 0, badgeText: "TV • 25 EPS", image_url: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx120120-cWDmnmeEntSe.jpg" },
  { id: "mha-s6", title: "Season 6", seasonNumber: 6, mal_id: 49918, anilist_id: 138714, episodesCount: 25, episodesOffset: 0, badgeText: "TV • 25 EPS", image_url: "https://cdn.myanimelist.net/images/anime/1483/126005l.jpg" },
  { id: "mha-s7", title: "Season 7", seasonNumber: 7, mal_id: 54492, anilist_id: 159831, episodesCount: 21, episodesOffset: 0, badgeText: "TV • 21 EPS", image_url: "https://cdn.myanimelist.net/images/anime/1708/138033l.jpg" },
]);

// 7. Spy x Family
// Season 1 = Part 1 (12 eps) + Part 2 (13 eps) = 25 eps
registerFranchise("Spy x Family", [
  { id: "sxf-s1-p1", title: "Season 1 Part 1", seasonNumber: 1, partNumber: 1, mal_id: 50265, anilist_id: 140960, episodesCount: 12, episodesOffset: 0, badgeText: "TV • 12 EPS", image_url: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx140960-Kb6R5nYQfjmP.jpg" },
  { id: "sxf-s1-p2", title: "Season 1 Part 2", seasonNumber: 1, partNumber: 2, mal_id: 50602, anilist_id: 142838, episodesCount: 13, episodesOffset: 12, badgeText: "TV • 13 EPS", image_url: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx142838-26JrqcFU1ljB.jpg" },
  { id: "sxf-s2", title: "Season 2", seasonNumber: 2, mal_id: 53887, anilist_id: 158927, episodesCount: 12, episodesOffset: 0, badgeText: "TV • 12 EPS", image_url: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/medium/b158927-lfO85WVguYgc.png" },
]);

// 8. Vinland Saga
registerFranchise("Vinland Saga", [
  { id: "vs-s1", title: "Season 1", seasonNumber: 1, mal_id: 37521, anilist_id: 101348, episodesCount: 24, episodesOffset: 0, badgeText: "TV • 24 EPS", image_url: "https://cdn.myanimelist.net/images/anime/1500/103005l.jpg" },
  { id: "vs-s2", title: "Season 2", seasonNumber: 2, mal_id: 49387, anilist_id: 136430, episodesCount: 24, episodesOffset: 0, badgeText: "TV • 24 EPS", image_url: "https://cdn.myanimelist.net/images/anime/1170/124312l.jpg" },
]);

// 9. Dr. Stone
// Season 3 = Part 1 (11 eps) + Part 2 (11 eps) = 22 eps
registerFranchise("Dr. Stone", [
  { id: "drs-s1", title: "Season 1", seasonNumber: 1, mal_id: 38691, anilist_id: 105333, episodesCount: 24, episodesOffset: 0, badgeText: "TV • 24 EPS", image_url: "https://cdn.myanimelist.net/images/anime/1613/102576l.jpg" },
  { id: "drs-s2", title: "Season 2 - Stone Wars", seasonNumber: 2, mal_id: 40852, anilist_id: 113936, episodesCount: 11, episodesOffset: 0, badgeText: "TV • 11 EPS", image_url: "https://cdn.myanimelist.net/images/anime/1711/110614l.jpg" },
  { id: "drs-s3-p1", title: "Season 3 - New World Part 1", seasonNumber: 3, partNumber: 1, mal_id: 48549, anilist_id: 131518, episodesCount: 11, episodesOffset: 0, badgeText: "TV • 11 EPS", image_url: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx131518-RU7RoUmGb2sP.jpg" },
  { id: "drs-s3-p2", title: "Season 3 - New World Part 2", seasonNumber: 3, partNumber: 2, mal_id: 55644, anilist_id: 162670, episodesCount: 11, episodesOffset: 11, badgeText: "TV • 11 EPS", image_url: "https://cdn.myanimelist.net/images/anime/1236/138696l.jpg" },
  { id: "drs-s4", title: "Season 4 - Science Future", seasonNumber: 4, mal_id: 57592, anilist_id: 172019, episodesCount: 12, episodesOffset: 0, badgeText: "TV • 12 EPS", image_url: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx171642-Tj5KCJPILuUN.jpg" },
]);

// 10. Re:Zero
// Season 2 = Part 1 (13 eps) + Part 2 (12 eps) = 25 eps
registerFranchise("Re:Zero", [
  { id: "rez-s1", title: "Season 1", seasonNumber: 1, mal_id: 31240, anilist_id: 21355, episodesCount: 25, episodesOffset: 0, badgeText: "TV • 25 EPS", image_url: "https://cdn.myanimelist.net/images/anime/1522/128039l.jpg" },
  { id: "rez-s2-p1", title: "Season 2 Part 1", seasonNumber: 2, partNumber: 1, mal_id: 39587, anilist_id: 108632, episodesCount: 13, episodesOffset: 0, badgeText: "TV • 13 EPS", image_url: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx108632-lQWnmw7XaNOK.jpg" },
  { id: "rez-s2-p2", title: "Season 2 Part 2", seasonNumber: 2, partNumber: 2, mal_id: 42203, anilist_id: 119661, episodesCount: 12, episodesOffset: 13, badgeText: "TV • 12 EPS", image_url: "https://cdn.myanimelist.net/images/anime/1724/117421l.jpg" },
  { id: "rez-s3", title: "Season 3", seasonNumber: 3, mal_id: 54857, anilist_id: 163134, episodesCount: 16, episodesOffset: 0, badgeText: "TV • 16 EPS", image_url: "https://cdn.myanimelist.net/images/anime/1706/144725l.jpg" },
]);

// 11. Oshi no Ko
registerFranchise("Oshi no Ko", [
  { id: "onk-s1", title: "Season 1", seasonNumber: 1, mal_id: 52034, anilist_id: 150672, episodesCount: 11, episodesOffset: 0, badgeText: "TV • 11 EPS", image_url: "https://cdn.myanimelist.net/images/anime/1812/134736l.jpg" },
  { id: "onk-s2", title: "Season 2", seasonNumber: 2, mal_id: 55791, anilist_id: 166531, episodesCount: 13, episodesOffset: 0, badgeText: "TV • 13 EPS", image_url: "https://cdn.myanimelist.net/images/anime/1006/143302l.jpg" },
]);

// 12. Mob Psycho 100
registerFranchise("Mob Psycho 100", [
  { id: "mp-s1", title: "Season 1", seasonNumber: 1, mal_id: 32182, anilist_id: 21507, episodesCount: 12, episodesOffset: 0, badgeText: "TV • 12 EPS", image_url: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx21507-6YUSbh2m0N1p.jpg" },
  { id: "mp-s2", title: "Season 2", seasonNumber: 2, mal_id: 37510, anilist_id: 101338, episodesCount: 13, episodesOffset: 0, badgeText: "TV • 13 EPS", image_url: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx101338-rokVscjRYzdP.jpg" },
  { id: "mp-s3", title: "Season 3", seasonNumber: 3, mal_id: 50172, anilist_id: 140439, episodesCount: 12, episodesOffset: 0, badgeText: "TV • 12 EPS", image_url: "https://cdn.myanimelist.net/images/anime/1228/125011l.jpg" },
]);

// 13. One Punch Man
registerFranchise("One Punch Man", [
  { id: "opm-s1", title: "Season 1", seasonNumber: 1, mal_id: 30276, anilist_id: 21087, episodesCount: 12, episodesOffset: 0, badgeText: "TV • 12 EPS", image_url: "https://cdn.myanimelist.net/images/anime/12/76049l.jpg" },
  { id: "opm-s2", title: "Season 2", seasonNumber: 2, mal_id: 34134, anilist_id: 97668, episodesCount: 12, episodesOffset: 0, badgeText: "TV • 12 EPS", image_url: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx97668-nC8gQrXVxt7k.png" },
]);

// 14. Mushoku Tensei: Jobless Reincarnation
// Season 1 = Part 1 (11 eps) + Part 2 (12 eps) = 23 eps
// Season 2 = Part 1 (12 eps) + Part 2 (12 eps) = 24 eps
registerFranchise("Mushoku Tensei: Jobless Reincarnation", [
  { id: "mt-s1-p1", title: "Season 1 Part 1", seasonNumber: 1, partNumber: 1, mal_id: 39535, anilist_id: 108465, episodesCount: 11, episodesOffset: 0, badgeText: "TV • 11 EPS", image_url: "https://cdn.myanimelist.net/images/anime/1530/117776l.jpg" },
  { id: "mt-s1-p2", title: "Season 1 Part 2", seasonNumber: 1, partNumber: 2, mal_id: 45576, anilist_id: 127720, episodesCount: 12, episodesOffset: 11, badgeText: "TV • 12 EPS", image_url: "https://cdn.myanimelist.net/images/anime/1028/117777l.jpg" },
  { id: "mt-s2-p1", title: "Season 2 Part 1", seasonNumber: 2, partNumber: 1, mal_id: 51179, anilist_id: 146065, episodesCount: 12, episodesOffset: 0, badgeText: "TV • 12 EPS", image_url: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx146065-IjirxRK26O03.png" },
  { id: "mt-s2-p2", title: "Season 2 Part 2", seasonNumber: 2, partNumber: 2, mal_id: 55888, anilist_id: 166873, episodesCount: 12, episodesOffset: 12, badgeText: "TV • 12 EPS", image_url: "https://cdn.myanimelist.net/images/anime/1876/141251l.jpg" },
]);

// 15. Classroom of the Elite
registerFranchise("Classroom of the Elite", [
  { id: "cote-s1", title: "Season 1", seasonNumber: 1, mal_id: 35507, anilist_id: 98659, episodesCount: 12, episodesOffset: 0, badgeText: "TV • 12 EPS", image_url: "https://cdn.myanimelist.net/images/anime/5/86830l.jpg" },
  { id: "cote-s2", title: "Season 2", seasonNumber: 2, mal_id: 51096, anilist_id: 145545, episodesCount: 13, episodesOffset: 0, badgeText: "TV • 13 EPS", image_url: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx145545-DGl3LVvFlnHi.png" },
  { id: "cote-s3", title: "Season 3", seasonNumber: 3, mal_id: 51097, anilist_id: 145546, episodesCount: 13, episodesOffset: 0, badgeText: "TV • 13 EPS", image_url: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx148584-nnCSTC5QlNbW.jpg" },
]);

// 16. Haikyuu!!
registerFranchise("Haikyuu!!", [
  { id: "hq-s1", title: "Season 1", seasonNumber: 1, mal_id: 20583, anilist_id: 20464, episodesCount: 25, episodesOffset: 0, badgeText: "TV • 25 EPS", image_url: "https://cdn.myanimelist.net/images/anime/7/76014l.jpg" },
  { id: "hq-s2", title: "Season 2", seasonNumber: 2, mal_id: 28891, anilist_id: 20992, episodesCount: 25, episodesOffset: 0, badgeText: "TV • 25 EPS", image_url: "https://cdn.myanimelist.net/images/anime/9/76662l.jpg" },
  { id: "hq-s3", title: "Season 3: Karasuno vs Shiratorizawa", seasonNumber: 3, mal_id: 32935, anilist_id: 21675, episodesCount: 10, episodesOffset: 0, badgeText: "TV • 10 EPS", image_url: "https://cdn.myanimelist.net/images/anime/7/81992l.jpg" },
  { id: "hq-s4", title: "Season 4: To the Top", seasonNumber: 4, mal_id: 38883, anilist_id: 106625, episodesCount: 25, episodesOffset: 0, badgeText: "TV • 25 EPS", image_url: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx106625-UR22wB2NuNVi.png" },
]);

// 17. Sword Art Online
// Season 3 = Alicization (24 eps) + War of Underworld (23 eps) = 47 eps
registerFranchise("Sword Art Online", [
  { id: "sao-s1", title: "Season 1 - Aincrad & Fairy Dance", seasonNumber: 1, mal_id: 11757, anilist_id: 11757, episodesCount: 25, episodesOffset: 0, badgeText: "TV • 25 EPS", image_url: "https://cdn.myanimelist.net/images/anime/11/39717l.jpg" },
  { id: "sao-s2", title: "Season 2 - Phantom Bullet", seasonNumber: 2, mal_id: 21881, anilist_id: 20594, episodesCount: 24, episodesOffset: 0, badgeText: "TV • 24 EPS", image_url: "https://cdn.myanimelist.net/images/anime/1223/121999l.jpg" },
  { id: "sao-s3-p1", title: "Season 3 - Alicization", seasonNumber: 3, partNumber: 1, mal_id: 36474, anilist_id: 100182, episodesCount: 24, episodesOffset: 0, badgeText: "TV • 24 EPS", image_url: "https://cdn.myanimelist.net/images/anime/1993/93837l.jpg" },
  { id: "sao-s3-p2", title: "Season 3 - War of Underworld", seasonNumber: 3, partNumber: 2, mal_id: 39597, anilist_id: 108759, episodesCount: 23, episodesOffset: 24, badgeText: "TV • 23 EPS", image_url: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx108759-jcXbDf9BJTcb.jpg" },
]);

// 18. DanMachi
registerFranchise("DanMachi", [
  { id: "dm-s1", title: "Season 1", seasonNumber: 1, mal_id: 28121, anilist_id: 20920, episodesCount: 13, episodesOffset: 0, badgeText: "TV • 13 EPS", image_url: "https://cdn.myanimelist.net/images/anime/1172/148981l.jpg" },
  { id: "dm-s2", title: "Season 2", seasonNumber: 2, mal_id: 37347, anilist_id: 101167, episodesCount: 12, episodesOffset: 0, badgeText: "TV • 12 EPS", image_url: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx101167-Yasvj97UR9ue.png" },
  { id: "dm-s3", title: "Season 3", seasonNumber: 3, mal_id: 40454, anilist_id: 112124, episodesCount: 12, episodesOffset: 0, badgeText: "TV • 12 EPS", image_url: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx112124-ZmoOntBuiSUU.jpg" },
  { id: "dm-s4", title: "Season 4", seasonNumber: 4, mal_id: 47164, anilist_id: 129196, episodesCount: 22, episodesOffset: 0, badgeText: "TV • 22 EPS", image_url: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx129196-eFVs05hMbVSm.jpg" },
  { id: "dm-s5", title: "Season 5", seasonNumber: 5, mal_id: 56950, anilist_id: 170494, episodesCount: 15, episodesOffset: 0, badgeText: "TV • 15 EPS", image_url: "https://cdn.myanimelist.net/images/anime/1202/145453.jpg" },
]);

// 19. Hunter x Hunter (2011) - 148 Episodes
registerFranchise("Hunter x Hunter (2011)", [
  { id: "hxh-2011", title: "Hunter x Hunter (2011)", seasonNumber: 1, mal_id: 11061, anilist_id: 11061, episodesCount: 148, episodesOffset: 0, badgeText: "TV • 148 EPS", image_url: "https://cdn.myanimelist.net/images/anime/1337/99013l.jpg" },
  { id: "hxh-m1", title: "Phantom Rouge (Movie)", seasonNumber: 0, mal_id: 13271, anilist_id: 13271, episodesCount: 1, episodesOffset: 0, badgeText: "MOVIE • 1 EP", image_url: "https://cdn.myanimelist.net/images/anime/11/44769l.jpg" },
  { id: "hxh-m2", title: "The Last Mission (Movie)", seasonNumber: 0, mal_id: 19951, anilist_id: 19951, episodesCount: 1, episodesOffset: 0, badgeText: "MOVIE • 1 EP", image_url: "https://cdn.myanimelist.net/images/anime/12/55363l.jpg" },
]);

// 20. Hunter x Hunter (1999 Classic) - 62 Episodes + OVAs
registerFranchise("Hunter x Hunter (1999 Classic)", [
  { id: "hxh-1999", title: "Hunter x Hunter (1999 Classic)", seasonNumber: 1, mal_id: 136, anilist_id: 136, episodesCount: 62, episodesOffset: 0, badgeText: "CLASSIC • 62 EPS", image_url: "https://cdn.myanimelist.net/images/anime/1730/141049l.jpg" },
  { id: "hxh-ova1", title: "Hunter x Hunter OVA", seasonNumber: 2, mal_id: 137, anilist_id: 137, episodesCount: 8, episodesOffset: 0, badgeText: "OVA • 8 EPS", image_url: "https://cdn.myanimelist.net/images/anime/7/141050l.jpg" },
  { id: "hxh-ova2", title: "Greed Island", seasonNumber: 3, mal_id: 138, anilist_id: 138, episodesCount: 8, episodesOffset: 0, badgeText: "OVA • 8 EPS", image_url: "https://cdn.myanimelist.net/images/anime/9/141051l.jpg" },
  { id: "hxh-ova3", title: "Greed Island Final", seasonNumber: 4, mal_id: 139, anilist_id: 139, episodesCount: 14, episodesOffset: 0, badgeText: "OVA • 14 EPS", image_url: "https://cdn.myanimelist.net/images/anime/11/141052l.jpg" },
]);

// 21. Black Clover (170 Episodes TV + Movie)
// Season 1: Episodes 1 - 51 (51 eps, offset: 0)
// Season 2: Episodes 52 - 102 (51 eps, offset: 51)
// Season 3: Episodes 103 - 154 (52 eps, offset: 102)
// Season 4: Episodes 155 - 170 (16 eps, offset: 154)
// Movie: Sword of the Wizard King (1 ep)
registerFranchise("Black Clover", [
  { id: "bc-s1", title: "Season 1", seasonNumber: 1, mal_id: 34572, anilist_id: 97940, episodesCount: 51, episodesOffset: 0, badgeText: "TV • 51 EPS", image_url: "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx97940-bQ9t4i4mS9bA.jpg" },
  { id: "bc-s2", title: "Season 2", seasonNumber: 2, mal_id: 34572, anilist_id: 97940, episodesCount: 51, episodesOffset: 51, badgeText: "TV • 51 EPS (EPS 52-102)", image_url: "https://cdn.myanimelist.net/images/anime/2/88339l.jpg" },
  { id: "bc-s3", title: "Season 3", seasonNumber: 3, mal_id: 34572, anilist_id: 97940, episodesCount: 52, episodesOffset: 102, badgeText: "TV • 52 EPS (EPS 103-154)", image_url: "https://cdn.myanimelist.net/images/anime/1164/104992l.jpg" },
  { id: "bc-s4", title: "Season 4", seasonNumber: 4, mal_id: 34572, anilist_id: 97940, episodesCount: 16, episodesOffset: 154, badgeText: "TV • 16 EPS (EPS 155-170)", image_url: "https://cdn.myanimelist.net/images/anime/1429/111812l.jpg" },
  { id: "bc-m1", title: "Black Clover: Sword of the Wizard King (Movie)", seasonNumber: 0, mal_id: 43656, anilist_id: 132473, episodesCount: 1, episodesOffset: 0, badgeText: "MOVIE • 1 EP", image_url: "https://cdn.myanimelist.net/images/anime/1765/135118l.jpg" },
]);

// Additional standard standalone anime mappings
const EXTRA_ANILIST: Record<number, number> = {
  34572: 97940, // Black Clover
  43656: 132473, // Black Clover: Sword of the Wizard King

  5114: 5114, // FMA Brotherhood
  9253: 9253, // Steins;Gate
  11061: 11061, // Hunter x Hunter (2011)
  136: 136, // Hunter x Hunter (1999 Classic)
  137: 137,
  138: 138,
  139: 139,
  13271: 13271, // Phantom Rouge
  19951: 19951, // The Last Mission
  1535: 1535, // Death Note
  20: 20, // Naruto
  1735: 1735, // Naruto Shippuden
  21: 21, // One Piece
  269: 269, // Bleach
  44511: 127230, // Chainsaw Man
  52991: 154587, // Frieren: Beyond Journey's End
  52588: 153288, // Kaiju No. 8
  22319: 20605, // Tokyo Ghoul
  28851: 20954, // A Silent Voice
  32281: 21519, // Your Name.
  199: 199, // Spirited Away
  164: 164, // Princess Mononoke
  431: 431, // Howl's Moving Castle
  40746: 113417, // Overflow
};

for (const [mal, ani] of Object.entries(EXTRA_ANILIST)) {
  KNOWN_ANILIST_MAP[Number(mal)] = ani;
}


/**
 * Returns mapped AniList ID for a given MAL ID if available
 */
export function getKnownAnilistId(malId: number): number | null {
  return KNOWN_ANILIST_MAP[malId] || null;
}

/** AniList id of a registered season / part (exact, hand-checked). Not the loose standalone list below. */
export function getFranchisePartAnilistId(malId: number): number | null {
  return PART_ANILIST[malId] || null;
}

export function getFranchiseConfig(malId: number): KnownFranchiseConfig | null {
  return KNOWN_FRANCHISE_MAP[malId] || null;
}

/**
 * Resolved Episode Stream target parameters
 */
export interface ResolvedFranchiseEpisode {
  targetMalId: number;
  targetAnilistId: number | null;
  partEpisodeNumber: number; // Episode number within the specific part (for MAL/AniList/Koto/Neko)
  seasonEpisodeNumber: number; // Continuous episode number within the merged season (1..N)
  seasonNumber: number;
  totalSeasonEpisodes: number;
  partTitle?: string;
  seasonTitle: string;
  posterImage?: string;
  partNumber?: number;
  totalParts?: number;
  isPart2OrSplitCour?: boolean;
  isExclusiveVidSrcSbs?: boolean; // VidSrc SBS is the exclusive verified provider for Part 2 & Season 3
}

/**
 * Seamlessly resolves any episode in any season (e.g. Season 3 Episode 15 -> Part 2 Episode 3 on MAL 38524, TMDb S3 E15)
 */
export function resolveFranchiseEpisode(
  currentAnime: JikanAnime | number,
  requestedSeason: number = 1,
  requestedEpisode: number = 1
): ResolvedFranchiseEpisode {
  const malId = typeof currentAnime === 'number' ? currentAnime : currentAnime.mal_id;
  const config = getFranchiseConfig(malId);

  if (config) {
    // Find all parts belonging to this seasonNumber
    const seasonParts = config.parts.filter(p => p.seasonNumber === requestedSeason);
    
    if (seasonParts.length > 0) {
      const totalSeasonEpisodes = seasonParts.reduce((sum, p) => sum + (p.episodesCount || 12), 0);
      const safeEpisode = Math.max(1, Math.min(requestedEpisode, totalSeasonEpisodes));

      // Find which part contains safeEpisode
      let runningOffset = 0;
      for (const part of seasonParts) {
        const pCount = part.episodesCount || 12;
        if (safeEpisode <= runningOffset + pCount) {
          const partEp = safeEpisode - runningOffset;
          // Apply episodesOffset for continuous stream sources (e.g. Black Clover Season 2 starting at episode 52)
          const actualStreamEp = (part.episodesOffset ?? 0) + partEp;
          const isPart2 = (part.partNumber && part.partNumber >= 2) || (requestedSeason === 3 && safeEpisode > 12);
          const isExclusiveSbs = isPart2 || (requestedSeason === 3 && part.partNumber === 2);

          return {
            targetMalId: part.mal_id,
            targetAnilistId: part.anilist_id || getKnownAnilistId(part.mal_id),
            partEpisodeNumber: actualStreamEp,
            seasonEpisodeNumber: safeEpisode,
            seasonNumber: requestedSeason,
            totalSeasonEpisodes,
            partTitle: part.title,
            seasonTitle: requestedSeason === 0 ? "Movie / Special" : (part.seasonNumber === 5 ? part.title : `${config.franchiseName} Season ${requestedSeason}`),
            posterImage: part.image_url,
            partNumber: part.partNumber || 1,
            totalParts: seasonParts.length,
            isPart2OrSplitCour: isPart2,
            isExclusiveVidSrcSbs: isExclusiveSbs,
          };
        }
        runningOffset += pCount;
      }

      // Fallback to last part
      const lastPart = seasonParts[seasonParts.length - 1];
      const isPart2 = (lastPart.partNumber && lastPart.partNumber >= 2) || (requestedSeason === 3 && safeEpisode > 12);
      const lastRelEp = Math.max(1, safeEpisode - (runningOffset - (lastPart.episodesCount || 12)));
      const lastStreamEp = (lastPart.episodesOffset ?? 0) + lastRelEp;
      return {
        targetMalId: lastPart.mal_id,
        targetAnilistId: lastPart.anilist_id || getKnownAnilistId(lastPart.mal_id),
        partEpisodeNumber: lastStreamEp,
        seasonEpisodeNumber: safeEpisode,
        seasonNumber: requestedSeason,
        totalSeasonEpisodes,
        partTitle: lastPart.title,
        seasonTitle: `${config.franchiseName} Season ${requestedSeason}`,
        posterImage: lastPart.image_url,
        partNumber: lastPart.partNumber || seasonParts.length,
        totalParts: seasonParts.length,
        isPart2OrSplitCour: isPart2,
        isExclusiveVidSrcSbs: isPart2,
      };
    }
  }

  // Generic Anime resolution with Title Season Detection System
  const genericTotal = typeof currentAnime === 'object' && currentAnime.episodes ? currentAnime.episodes : 12;
  const animeObj = typeof currentAnime === 'object' ? currentAnime : null;
  const candidateTitles = animeObj ? [animeObj.title_english, animeObj.title, animeObj.title_japanese] : [];
  const chosenResult = checkTitleSeasonAndChooseEpisode({
    candidateTitles,
    requestedSeason,
    requestedEpisode,
    anime: animeObj,
    malId,
  });

  return {
    targetMalId: malId,
    targetAnilistId: getKnownAnilistId(malId),
    partEpisodeNumber: chosenResult.chosenStreamEpisode,
    seasonEpisodeNumber: chosenResult.relativeEpisode,
    seasonNumber: chosenResult.detectedSeasonNumber || requestedSeason,
    totalSeasonEpisodes: genericTotal,
    seasonTitle: typeof currentAnime === 'object' ? (currentAnime.title_english || currentAnime.title) : `Season ${requestedSeason}`,
    partNumber: 1,
    totalParts: 1,
    isPart2OrSplitCour: false,
    isExclusiveVidSrcSbs: false,
  };

}

/**
 * Generates a clean, consolidated franchise season list for ANY anime.
 * Merges split parts (e.g. Season 3 Part 1 + Part 2) into ONE single season with full combined episodes (e.g. 22 eps).
 */
export function getFranchiseSeasonsList(
  currentAnime: JikanAnime,
  jikanDiscoveredSeasons: JikanAnime[]
): JikanAnime[] {
  const config = getFranchiseConfig(currentAnime.mal_id);

  if (config && config.parts.length > 0) {
    // Group parts by seasonNumber
    const seasonMap = new Map<number, FranchisePart[]>();
    for (const part of config.parts) {
      const sNum = part.seasonNumber;
      if (!seasonMap.has(sNum)) {
        seasonMap.set(sNum, []);
      }
      seasonMap.get(sNum)!.push(part);
    }

    const consolidatedList: JikanAnime[] = [];

    for (const [sNum, parts] of seasonMap.entries()) {
      const primaryPart = parts[0];
      const totalEpisodes = parts.reduce((sum, p) => sum + (p.episodesCount || 12), 0);
      
      let seasonName = '';
      if (sNum === 0) {
        seasonName = primaryPart.title;
      } else if (sNum === 4 && /final\s*season/i.test(primaryPart.title)) {
        seasonName = `${config.franchiseName} - The Final Season (Parts 1 & 2)`;
      } else if (sNum === 5 && /final\s*chapters/i.test(primaryPart.title)) {
        seasonName = `${config.franchiseName} - The Final Chapters (1-Hour Specials)`;
      } else {
        seasonName = `${config.franchiseName} - Season ${sNum}`;
      }

      // Check if we have an existing JikanAnime for primaryPart
      const existing = jikanDiscoveredSeasons.find(s => parts.some(p => p.mal_id === s.mal_id));
      const poster = primaryPart.image_url || existing?.images?.jpg?.image_url || currentAnime.images.jpg.image_url;

      consolidatedList.push({
        ...(existing || currentAnime),
        mal_id: primaryPart.mal_id,
        title: seasonName,
        title_english: seasonName,
        episodes: totalEpisodes,
        images: {
          jpg: {
            image_url: poster,
            small_image_url: poster,
            large_image_url: poster,
          }
        },
      });
    }

    return consolidatedList;
  }

  // Default discovery
  const list: JikanAnime[] = [...jikanDiscoveredSeasons];
  if (!list.some(s => s.mal_id === currentAnime.mal_id)) {
    list.unshift(currentAnime);
  }

  return list;
}

/**
 * Accurately formats display labels for anime seasons
 */
export function formatSeasonDisplayLabel(
  seasonItem: JikanAnime,
  idx: number
): { mainTitle: string; subtitle: string; shortBadge: string; seasonNumber: number; episodesCount: number } {
  const config = getFranchiseConfig(seasonItem.mal_id);
  const rawTitle = seasonItem.title_english || seasonItem.title;

  if (config) {
    // Find if this corresponds to a season in config
    const matchingPart = config.parts.find(p => p.mal_id === seasonItem.mal_id);
    if (matchingPart) {
      const sNum = matchingPart.seasonNumber;
      const partsInSeason = config.parts.filter(p => p.seasonNumber === sNum);
      const totalEps = partsInSeason.reduce((acc, p) => acc + (p.episodesCount || 12), 0);

      if (sNum === 0) {
        return {
          mainTitle: matchingPart.title,
          subtitle: 'Movie / Special',
          shortBadge: 'MOVIE',
          seasonNumber: 0,
          episodesCount: totalEps,
        };
      }

      if (sNum === 5 && /final\s*chapters/i.test(matchingPart.title)) {
        return {
          mainTitle: 'The Final Chapters (1-Hour Specials)',
          subtitle: '2 Special Episodes • 1-Hour+ Parts',
          shortBadge: 'SPECIALS',
          seasonNumber: 5,
          episodesCount: 2,
        };
      }

      if (sNum === 4 && /final\s*season/i.test(matchingPart.title)) {
        return {
          mainTitle: `${config.franchiseName} - The Final Season`,
          subtitle: `The Final Season • 28 Episodes (Parts 1 & 2)`,
          shortBadge: `S4`,
          seasonNumber: 4,
          episodesCount: 28,
        };
      }

      const hasParts = partsInSeason.length > 1;
      const sub = hasParts 
        ? `Season ${sNum} • ${totalEps} Episodes (Parts 1-${partsInSeason.length})`
        : `Season ${sNum} • ${totalEps} Episodes`;

      return {
        mainTitle: `${config.franchiseName} Season ${sNum}`,
        subtitle: sub,
        shortBadge: `S${sNum}`,
        seasonNumber: sNum,
        episodesCount: totalEps,
      };
    }
  }

  const matchSeason = rawTitle.match(/season\s*(\d+)/i) || rawTitle.match(/(\d+)(?:st|nd|rd|th)\s*season/i);
  const sNum = matchSeason ? parseInt(matchSeason[1], 10) : idx + 1;
  const eps = seasonItem.episodes || 12;

  return {
    mainTitle: rawTitle,
    subtitle: `Season ${sNum} • ${eps} Episodes`,
    shortBadge: `S${sNum}`,
    seasonNumber: sNum,
    episodesCount: eps,
  };
}

/**
 * Returns complete combined episode list for a season (e.g. 22 episodes for Season 3)
 */
export async function getConsolidatedSeasonEpisodes(
  currentAnime: JikanAnime | number,
  seasonNumber: number = 1
): Promise<JikanEpisode[]> {
  const malId = typeof currentAnime === 'number' ? currentAnime : currentAnime.mal_id;
  const config = getFranchiseConfig(malId);

  if (config) {
    const seasonParts = config.parts.filter(p => p.seasonNumber === seasonNumber);
    if (seasonParts.length > 0) {
      const allEpisodes: JikanEpisode[] = [];
      let continuousEpNum = 1;

      for (const part of seasonParts) {
        // Special case for Attack on Titan: The Final Chapters (2 1-hour+ special parts)
        if (part.mal_id === 51535) {
          return [
            {
              mal_id: 1,
              title: "The Final Chapters: Special 1 (1-Hour Special)",
              title_japanese: "進撃の巨人 The Final Season 完結編 前編",
              title_romanji: "Shingeki no Kyojin: The Final Season - Kanketsu-hen Zenpen",
              aired: "2023-03-04",
              filler: false,
              recap: false,
              forum_url: null,
            },
            {
              mal_id: 2,
              title: "The Final Chapters: Special 2 (85-Min Series Finale)",
              title_japanese: "進撃の巨人 The Final Season 完結編 後編",
              title_romanji: "Shingeki no Kyojin: The Final Season - Kanketsu-hen Kouhen",
              aired: "2023-11-05",
              filler: false,
              recap: false,
              forum_url: null,
            },
          ];
        }

        try {
          const partEps = await jikanService.getAnimeEpisodes(part.mal_id);
          const count = part.episodesCount || (partEps.length > 0 ? partEps.length : 12);
          const offset = part.episodesOffset || 0;
          
          for (let i = 1; i <= count; i++) {
            const actualEpNum = offset + i;
            const foundEp = partEps.find(e => e.mal_id === actualEpNum) || partEps.find(e => e.mal_id === i);
            allEpisodes.push({
              mal_id: continuousEpNum,
              title: foundEp?.title || `${part.title} - Episode ${i}`,
              title_japanese: foundEp?.title_japanese || null,
              title_romanji: foundEp?.title_romanji || null,
              aired: foundEp?.aired || null,
              filler: foundEp?.filler || false,
              recap: foundEp?.recap || false,
              forum_url: foundEp?.forum_url || null,
            });
            continuousEpNum++;
          }
        } catch (e) {
          // Generate fallback continuous episodes
          const count = part.episodesCount || 12;
          for (let i = 1; i <= count; i++) {
            allEpisodes.push({
              mal_id: continuousEpNum,
              title: `Episode ${continuousEpNum}`,
              title_japanese: null,
              title_romanji: null,
              aired: null,
              filler: false,
              recap: false,
              forum_url: null,
            });
            continuousEpNum++;
          }
        }
      }

      return allEpisodes;
    }
  }

  // Generic anime
  try {
    const anime = typeof currentAnime === 'object' ? currentAnime : null;
    const data = await jikanService.getAnimeEpisodes(malId, {
      anilistId: anime?.anilist_id,
      malIsReal: anime?.mal_id_is_real,
    });
    if (data && data.length > 0) return data;
  } catch {}

  const total = typeof currentAnime === 'object' && currentAnime.episodes ? currentAnime.episodes : 12;
  const stubs: JikanEpisode[] = [];
  for (let i = 1; i <= total; i++) {
    stubs.push({
      mal_id: i,
      title: `Episode ${i}`,
      title_japanese: null,
      title_romanji: null,
      aired: null,
      filler: false,
      recap: false,
      forum_url: null,
    });
  }
  return stubs;
}
