/**
 * TMDB 搜索 — 仅服务端持有 API Key
 *
 * GET /api/tmdb/search?q=千与千寻 → 按名称搜索（movie / tv）
 */

import { NextResponse } from "next/server";
import { auth } from "@/auth";

type TmdbSearchItem = {
  mediaType: "movie" | "tv";
  id: number;
  title: string;
  year: string | null;
  posterUrl: string | null;
  rating: number | null;
};

type TmdbSearchResponse = {
  results?: {
    media_type?: string;
    id?: number;
    title?: string;
    name?: string;
    release_date?: string;
    first_air_date?: string;
    poster_path?: string | null;
    vote_average?: number;
  }[];
};

/** 搜索结果收敛成前端需要的字段 */
function toItem(row: {
  media_type?: string;
  id?: number;
  title?: string;
  name?: string;
  release_date?: string;
  first_air_date?: string;
  poster_path?: string | null;
  vote_average?: number;
}): TmdbSearchItem | null {
  const mediaType = row.media_type === "tv" ? "tv" : row.media_type === "movie" ? "movie" : null;
  if (!mediaType || typeof row.id !== "number") return null;

  const date = mediaType === "tv" ? row.first_air_date : row.release_date;
  return {
    mediaType,
    id: row.id,
    title: (mediaType === "tv" ? row.name : row.title) || "未知作品",
    year: date ? date.slice(0, 4) : null,
    posterUrl: row.poster_path ? `https://image.tmdb.org/t/p/w200${row.poster_path}` : null,
    rating: row.vote_average && row.vote_average > 0 ? Number(row.vote_average.toFixed(1)) : null,
  };
}

export async function GET(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ ok: false, message: "未登录" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const q = (searchParams.get("q") ?? "").trim();
    if (!q) return NextResponse.json({ ok: true, results: [] });
    if (q.length > 100) {
      return NextResponse.json({ ok: false, message: "关键词过长" }, { status: 400 });
    }

    const apiKey = process.env.TMDB_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ ok: false, message: "TMDB 未配置" }, { status: 503 });
    }

    const base = (process.env.TMDB_API_BASE || "https://api.themoviedb.org/3").replace(/\/+$/, "");
    const params = new URLSearchParams({
      api_key: apiKey,
      language: "zh-CN",
      query: q,
      include_adult: "false",
      page: "1",
    });

    const res = await fetch(`${base}/search/multi?${params.toString()}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      return NextResponse.json({ ok: false, message: "TMDB 请求失败" }, { status: 502 });
    }

    const data = (await res.json()) as TmdbSearchResponse;
    const results = (data.results ?? [])
      .map(toItem)
      .filter((item): item is TmdbSearchItem => item !== null)
      .slice(0, 8);

    return NextResponse.json({ ok: true, results });
  } catch (e) {
    console.error("[tmdb search]", e);
    return NextResponse.json({ ok: false, message: "服务器内部错误" }, { status: 500 });
  }
}
