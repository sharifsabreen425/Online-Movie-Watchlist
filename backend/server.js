const http = require("node:http");
const { readFileSync } = require("node:fs");
const fs = require("node:fs/promises");
const path = require("node:path");

function loadEnvironmentFile() {
  const envFile = path.join(__dirname, ".env");
  let contents;

  try {
    contents = readFileSync(envFile, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return;
    throw error;
  }

  for (const [index, line] of contents.split(/\r?\n/).entries()) {
    const entry = line.trim();
    if (!entry || entry.startsWith("#")) continue;

    const separator = entry.indexOf("=");
    const name = separator < 0 ? "" : entry.slice(0, separator).trim();
    if (separator < 1 || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
      throw new Error(`Invalid backend .env entry on line ${index + 1}.`);
    }

    if (process.env[name] !== undefined) continue;

    let value = entry.slice(separator + 1).trim();
    const quote = value[0];
    if (quote === '"' || quote === "'") {
      if (value.length < 2 || value[value.length - 1] !== quote) {
        throw new Error(`Unclosed quote in backend .env entry on line ${index + 1}.`);
      }
      value = value.slice(1, -1);
    }
    process.env[name] = value;
  }
}

loadEnvironmentFile();

const PORT = Number(process.env.PORT || 8080);
const DATA_DIRECTORY = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIRECTORY, "movies.json");
const MAX_BODY_BYTES = 1024 * 1024;
const TMDB_API_KEY = process.env.TMDB_API_KEY?.trim();
const TMDB_API_BASE = "https://api.themoviedb.org/3";

let movies = [];
let nextId = 1;
let writeQueue = Promise.resolve();

async function loadMovies() {
  await fs.mkdir(DATA_DIRECTORY, { recursive: true });

  try {
    const contents = await fs.readFile(DATA_FILE, "utf8");
    const savedMovies = JSON.parse(contents);
    if (!Array.isArray(savedMovies)) {
      throw new Error("Movie data must be a JSON array.");
    }

    movies = savedMovies;
    nextId = movies.reduce((highest, movie) => Math.max(highest, movie.id), 0) + 1;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    await fs.writeFile(DATA_FILE, "[]\n", "utf8");
  }
}

function sendJson(response, status, data) {
  response.writeHead(status, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json; charset=utf-8"
  });
  response.end(status === 204 ? undefined : data === undefined ? "" : JSON.stringify(data));
}

async function readJson(request) {
  let body = "";
  let bytes = 0;

  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > MAX_BODY_BYTES) {
      const error = new Error("Request body is too large.");
      error.status = 413;
      throw error;
    }
    body += chunk;
  }

  try {
    return JSON.parse(body);
  } catch {
    const error = new Error("Request body must contain valid JSON.");
    error.status = 400;
    throw error;
  }
}

function validateMovie(data, requireTitle) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return "Request body must be a JSON object.";
  }
  if (requireTitle && (typeof data.title !== "string" || !data.title.trim())) {
    return "Movie title is required.";
  }
  if (requireTitle && data.title.trim().length > 100) {
    return "Movie title must be 100 characters or fewer.";
  }
  if (requireTitle && data.genre != null && typeof data.genre !== "string") {
    return "Genre must be a string.";
  }
  if (requireTitle && typeof data.genre === "string" && data.genre.length > 50) {
    return "Genre must be 50 characters or fewer.";
  }
  if (requireTitle && data.description != null && typeof data.description !== "string") {
    return "Description must be a string.";
  }
  if (requireTitle && typeof data.description === "string" && data.description.length > 1000) {
    return "Description must be 1000 characters or fewer.";
  }
  if (requireTitle && data.tmdbId != null && (!Number.isInteger(data.tmdbId) || data.tmdbId < 1)) {
    return "TMDb movie ID must be a positive integer.";
  }
  if (requireTitle && data.releaseDate != null && (typeof data.releaseDate !== "string" || data.releaseDate.length > 20)) {
    return "Release date must be a string of 20 characters or fewer.";
  }
  if (requireTitle && data.runtime != null && (!Number.isInteger(data.runtime) || data.runtime < 0 || data.runtime > 1000)) {
    return "Runtime must be a valid number of minutes.";
  }
  if (requireTitle && data.rating != null && (typeof data.rating !== "number" || !Number.isFinite(data.rating) || data.rating < 0 || data.rating > 10)) {
    return "Rating must be a number between 0 and 10.";
  }
  if (requireTitle && data.director != null && (typeof data.director !== "string" || data.director.length > 200)) {
    return "Director must be a string of 200 characters or fewer.";
  }
  if (requireTitle && data.cast != null && (!Array.isArray(data.cast) || data.cast.length > 20 ||
      data.cast.some((member) => !member || typeof member.name !== "string" ||
        typeof member.character !== "string" || member.name.length > 200 || member.character.length > 200))) {
    return "Cast must contain at most 20 valid cast members.";
  }
  for (const field of ["poster", "backdrop"]) {
    if (requireTitle && data[field] != null && (typeof data[field] !== "string" || data[field].length > 500)) {
      return `${field} must be a string of 500 characters or fewer.`;
    }
  }
  if (!requireTitle && typeof data.watched !== "boolean") {
    return "Watched must be true or false.";
  }
  return null;
}

async function requestTmdb(pathname, parameters = {}) {
  if (!TMDB_API_KEY) {
    const error = new Error("Movie search is not configured. Set TMDB_API_KEY in the backend environment and restart the server.");
    error.status = 503;
    throw error;
  }

  const url = new URL(`${TMDB_API_BASE}${pathname}`);
  url.searchParams.set("api_key", TMDB_API_KEY);
  for (const [key, value] of Object.entries(parameters)) {
    url.searchParams.set(key, value);
  }

  let response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(10000) });
  } catch (error) {
    console.error("Could not reach TMDb:", error.message);
    const upstreamError = new Error("Could not reach the movie details provider. Try again later.");
    upstreamError.status = 502;
    throw upstreamError;
  }

  if (!response.ok) {
    const upstreamError = new Error(response.status === 401 || response.status === 403
      ? "TMDb rejected the API key. Check that TMDB_API_KEY is valid."
      : response.status === 404
        ? "Movie not found in TMDb."
        : "TMDb could not complete the movie lookup.");
    upstreamError.status = response.status === 404 ? 404 : 502;
    throw upstreamError;
  }

  return response.json();
}

function tmdbImage(pathname, size) {
  return pathname ? `https://image.tmdb.org/t/p/${size}${pathname}` : null;
}

function makeShortDescription(description, maxLength = 240) {
  const text = description.trim();
  if (text.length <= maxLength) return text;

  const shortened = text.slice(0, maxLength);
  const lastSpace = shortened.lastIndexOf(" ");
  return `${shortened.slice(0, lastSpace > maxLength * 0.7 ? lastSpace : maxLength).trimEnd()}...`;
}

function mutateMovies(action) {
  const operation = writeQueue.then(async () => {
    const previousMovies = movies.map((movie) => ({ ...movie }));
    const previousNextId = nextId;

    try {
      const result = action();
      await fs.writeFile(DATA_FILE, `${JSON.stringify(movies, null, 2)}\n`, "utf8");
      return result;
    } catch (error) {
      movies = previousMovies;
      nextId = previousNextId;
      throw error;
    }
  });

  writeQueue = operation.then(() => undefined, () => undefined);
  return operation;
}

const server = http.createServer(async (request, response) => {
  if (request.method === "OPTIONS") {
    sendJson(response, 204);
    return;
  }

  const pathname = new URL(request.url, "http://localhost").pathname;
  if (pathname === "/") {
    sendJson(response, 200, { status: "ok", service: "movie-watchlist-api" });
    return;
  }

  const isMovieRoute = pathname === "/api/movies" || /^\/api\/movies\/\d+$/.test(pathname);
  const isTmdbSearch = pathname === "/api/tmdb/search";
  const tmdbDetailsMatch = pathname.match(/^\/api\/tmdb\/movies\/(\d+)$/);
  if (!isMovieRoute && !isTmdbSearch && !tmdbDetailsMatch) {
    sendJson(response, 404, { error: "Not found." });
    return;
  }

  try {
    if (isTmdbSearch && request.method === "GET") {
      const query = new URL(request.url, "http://localhost").searchParams.get("query")?.trim();
      if (!query || query.length < 2 || query.length > 100) {
        sendJson(response, 400, { error: "Search query must be between 2 and 100 characters." });
        return;
      }

      const result = await requestTmdb("/search/movie", {
        query,
        include_adult: "false",
        language: "en-US",
        page: "1"
      });
      sendJson(response, 200, (result.results || []).slice(0, 8).map((movie) => ({
        id: movie.id,
        title: movie.title,
        releaseDate: movie.release_date || "",
        overview: movie.overview || "",
        poster: tmdbImage(movie.poster_path, "w185")
      })));
      return;
    }

    if (tmdbDetailsMatch && request.method === "GET") {
      const movieId = Number(tmdbDetailsMatch[1]);
      const movie = await requestTmdb(`/movie/${movieId}`, {
        append_to_response: "credits",
        language: "en-US"
      });
      const cast = (movie.credits?.cast || []).slice(0, 20).map((member) => ({
        name: member.name,
        character: member.character || ""
      }));
      const description = (movie.overview || "").slice(0, 1000);
      const director = (movie.credits?.crew || []).find((member) => member.job === "Director")?.name || "";

      sendJson(response, 200, {
        tmdbId: movie.id,
        title: movie.title,
        genre: (movie.genres || []).map((genre) => genre.name).join(", "),
        description,
        shortDescription: makeShortDescription(description),
        releaseDate: movie.release_date || "",
        runtime: movie.runtime || null,
        rating: typeof movie.vote_average === "number" ? movie.vote_average : null,
        director,
        cast,
        leadCast: cast.slice(0, 2),
        poster: tmdbImage(movie.poster_path, "w500"),
        backdrop: tmdbImage(movie.backdrop_path, "w1280")
      });
      return;
    }

    if (pathname === "/api/movies" && request.method === "GET") {
      await writeQueue;
      sendJson(response, 200, movies);
      return;
    }

    if (pathname === "/api/movies" && request.method === "POST") {
      const data = await readJson(request);
      const validationError = validateMovie(data, true);
      if (validationError) {
        sendJson(response, 400, { error: validationError });
        return;
      }

      const movie = await mutateMovies(() => {
        const created = {
          id: nextId++,
          title: data.title.trim(),
          genre: data.genre || null,
          description: data.description || null,
          shortDescription: makeShortDescription(data.description || ""),
          tmdbId: data.tmdbId || null,
          releaseDate: data.releaseDate || null,
          runtime: data.runtime ?? null,
          rating: data.rating ?? null,
          director: data.director || null,
          cast: data.cast || [],
          leadCast: (data.cast || []).slice(0, 2),
          poster: data.poster || null,
          backdrop: data.backdrop || null,
          watched: false
        };
        movies.push(created);
        return created;
      });
      sendJson(response, 200, movie);
      return;
    }

    const id = Number(pathname.slice("/api/movies/".length));
    if (request.method === "PUT") {
      const data = await readJson(request);
      const validationError = validateMovie(data, false);
      if (validationError) {
        sendJson(response, 400, { error: validationError });
        return;
      }

      const movie = await mutateMovies(() => {
        const existing = movies.find((item) => item.id === id);
        if (!existing) return null;
        existing.watched = data.watched;
        return existing;
      });
      sendJson(response, movie ? 200 : 404, movie || { error: "Movie not found." });
      return;
    }

    if (request.method === "DELETE") {
      const deleted = await mutateMovies(() => {
        const index = movies.findIndex((item) => item.id === id);
        if (index === -1) return false;
        movies.splice(index, 1);
        return true;
      });
      sendJson(response, deleted ? 204 : 404, deleted ? undefined : { error: "Movie not found." });
      return;
    }

    sendJson(response, 405, { error: "Method not allowed." });
  } catch (error) {
    console.error("Movie API request failed:", error);
    sendJson(response, error.status || 500, {
      error: error.status ? error.message : "The server could not complete the request."
    });
  }
});

loadMovies()
  .then(() => {
    server.listen(PORT, "127.0.0.1", () => {
      console.log(`Movie watchlist API is running at http://localhost:${PORT}`);
    });
  })
  .catch((error) => {
    console.error(`Could not load movie data from ${DATA_FILE}:`, error);
    process.exitCode = 1;
  });
