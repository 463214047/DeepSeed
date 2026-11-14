/**
 * 列表 / 瀑布流使用的帖子摘要类型
 * 字段与 /api/posts 返回的结构保持一致
 */
export type HomePost = {
  id: string;
  post_type?: string;
  category: string;
  title: string;
  subtitle?: string | null;
  status?: string | null;
  tags?: string[] | null;
  cover_url?: string | null;
  screenshot_urls?: string[] | null;
  tmdb_poster?: string | null;
  torrent_name?: string | null;
  torrent_size: number | null;
  hot?: boolean;
  view_count?: number;
  like_count?: number;
  favorite_count?: number;
  comment_count?: number;
  seed_count: number;
  leech_count?: number;
  download_count?: number;
  created_at: string;
};
