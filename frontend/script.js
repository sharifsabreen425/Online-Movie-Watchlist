const API_BASE = "http://localhost:8080/api";
const API = `${API_BASE}/movies`;

const form = document.getElementById("movieForm");
const list = document.getElementById("movieList");
const message = document.getElementById("message");
const titleInput = document.getElementById("title");
const suggestions = document.getElementById("suggestions");
const moviePreview = document.getElementById("moviePreview");
let selectedMovie = null;
let searchTimer;
let searchController;

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const movie = {
    ...(selectedMovie || {}),
    title: titleInput.value.trim(),
    genre: document.getElementById("genre").value,
    description: document.getElementById("description").value.trim()
  };

  try {
    await request(API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(movie)
    });
    form.reset();
    selectedMovie = null;
    moviePreview.hidden = true;
    message.textContent = "Movie added successfully!";
    await displayMovies();
  } catch (error) {
    message.textContent = error.message || "Could not add movie. Check that the backend is running.";
  }
});

async function request(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) {
    let details;
    try {
      details = await response.json();
    } catch {
      details = null;
    }
    throw new Error(details?.error || `Request failed: ${response.status}`);
  }
  if (response.status === 204) return null;
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

function movieYear(movie) {
  return movie.releaseDate ? movie.releaseDate.slice(0, 4) : "Year unknown";
}

function shortDescription(description, maxLength = 240) {
  const text = (description || "").trim();
  if (text.length <= maxLength) return text;

  const shortened = text.slice(0, maxLength);
  const lastSpace = shortened.lastIndexOf(" ");
  return `${shortened.slice(0, lastSpace > maxLength * 0.7 ? lastSpace : maxLength).trimEnd()}...`;
}

function castNames(cast) {
  return (cast || []).map((member) =>
    member.character ? `${member.name} (${member.character})` : member.name
  ).join(", ");
}

function showSuggestions(items, query) {
  suggestions.replaceChildren();

  if (items.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = `No movies found for "${query}".`;
    suggestions.append(empty);
  } else {
    items.forEach((movie) => {
      const option = document.createElement("button");
      option.type = "button";
      option.className = "suggestion";
      option.role = "option";
      option.setAttribute("aria-label", `${movie.title}, ${movieYear(movie)}`);

      if (movie.poster) {
        const poster = document.createElement("img");
        poster.src = movie.poster;
        poster.alt = "";
        option.append(poster);
      }

      const text = document.createElement("span");
      const title = document.createElement("strong");
      title.textContent = movie.title;
      const year = document.createElement("small");
      year.textContent = movieYear(movie);
      text.append(title, year);
      option.append(text);
      option.addEventListener("click", () => loadMovieDetails(movie.id));
      suggestions.append(option);
    });
  }

  suggestions.hidden = false;
  titleInput.setAttribute("aria-expanded", "true");
}

function hideSuggestions() {
  suggestions.hidden = true;
  titleInput.setAttribute("aria-expanded", "false");
}

async function searchMovies(query) {
  searchController?.abort();
  searchController = new AbortController();
  try {
    const results = await request(`${API_BASE}/tmdb/search?query=${encodeURIComponent(query)}`, {
      signal: searchController.signal
    });
    if (titleInput.value.trim() === query) showSuggestions(results, query);
  } catch (error) {
    if (error.name === "AbortError") return;
    if (titleInput.value.trim() === query) showSuggestions([], "");
    const empty = suggestions.querySelector(".empty");
    if (empty) empty.textContent = error.message;
  }
}

function renderMoviePreview(movie) {
  const poster = document.getElementById("previewPoster");
  poster.hidden = !movie.poster;
  poster.src = movie.poster || "";
  poster.alt = movie.poster ? `Poster for ${movie.title}` : "";

  const details = document.getElementById("previewDetails");
  details.replaceChildren();
  const heading = document.createElement("h3");
  heading.textContent = `${movie.title} (${movieYear(movie)})`;
  details.append(heading);

  const summary = document.createElement("p");
  summary.className = "summary";
  summary.textContent = movie.shortDescription || shortDescription(movie.description) || "No short description available.";
  details.append(summary);

  const leadCast = movie.leadCast?.length ? movie.leadCast : movie.cast?.slice(0, 2) || [];
  const facts = [
    movie.genre && `Genre: ${movie.genre}`,
    movie.releaseDate && `Release date: ${movie.releaseDate}`,
    movie.runtime && `Runtime: ${movie.runtime} minutes`,
    movie.rating != null && `TMDb rating: ${movie.rating.toFixed(1)}/10`,
    movie.director && `Director: ${movie.director}`,
    leadCast.length && `Lead cast: ${castNames(leadCast)}`,
    movie.cast?.length && `Cast: ${castNames(movie.cast)}`
  ].filter(Boolean);

  facts.forEach((fact) => {
    const paragraph = document.createElement("p");
    paragraph.textContent = fact;
    details.append(paragraph);
  });
  moviePreview.hidden = false;
}

async function loadMovieDetails(id) {
  hideSuggestions();
  message.textContent = "Loading movie details...";
  try {
    const movie = await request(`${API_BASE}/tmdb/movies/${id}`);
    selectedMovie = movie;
    titleInput.value = movie.title;
    document.getElementById("genre").value = movie.genre;
    document.getElementById("description").value = movie.description;
    renderMoviePreview(movie);
    message.textContent = "Movie details loaded. Add it to your watchlist when ready.";
  } catch (error) {
    message.textContent = error.message || "Could not load movie details.";
  }
}

async function displayMovies() {
  try {
    const movies = await request(API);
    const search = document.getElementById("search").value.toLowerCase();
    const status = document.getElementById("filter").value;
    const genre = document.getElementById("genreFilter").value;

    const filtered = movies.filter(movie => {
      const matchesSearch = movie.title.toLowerCase().includes(search);
      const matchesStatus = status === "All" ||
        (status === "Watched" && movie.watched) ||
        (status === "Not Watched" && !movie.watched);
      const matchesGenre = genre === "All" ||
        (movie.genre || "").split(",").map((item) => item.trim()).includes(genre);
      return matchesSearch && matchesStatus && matchesGenre;
    });

    const genreFilter = document.getElementById("genreFilter");
    const selectedGenre = genreFilter.value;
    const genres = [...new Set(movies.flatMap((movie) =>
      (movie.genre || "").split(",").map((item) => item.trim()).filter(Boolean)
    ))].sort((a, b) => a.localeCompare(b));
    genreFilter.replaceChildren(new Option("All genres", "All"));
    genres.forEach((item) => genreFilter.add(new Option(item, item)));
    genreFilter.value = genres.includes(selectedGenre) ? selectedGenre : "All";

    list.innerHTML = "";
    if (filtered.length === 0) {
      list.innerHTML = '<p class="empty">No movies found. Add your first movie!</p>';
      return;
    }

    filtered.forEach(movie => {
      const card = document.createElement("article");
      card.className = "movie";

      if (movie.poster) {
        const poster = document.createElement("img");
        poster.className = "movie-poster";
        poster.src = movie.poster;
        poster.alt = `Poster for ${movie.title}`;
        poster.loading = "lazy";
        card.append(poster);
      }

      const title = document.createElement("h3");
      title.textContent = movie.releaseDate
        ? `${movie.title} (${movieYear(movie)})`
        : movie.title;
      const genreText = document.createElement("p");
      genreText.textContent = "Genre: " + (movie.genre || "Not specified");
      const description = document.createElement("p");
      description.className = "summary";
      description.textContent = movie.shortDescription || shortDescription(movie.description) || "No description";
      const statusText = document.createElement("p");
      statusText.textContent = "Status: " + (movie.watched ? "Watched" : "Not Watched");

      card.append(title, genreText, description);
      const leadCast = movie.leadCast?.length ? movie.leadCast : movie.cast?.slice(0, 2) || [];
      if (leadCast.length) {
        const paragraph = document.createElement("p");
        paragraph.textContent = `Lead cast: ${castNames(leadCast)}`;
        card.append(paragraph);
      }
      [
        movie.releaseDate && `Release date: ${movie.releaseDate}`,
        movie.runtime && `Runtime: ${movie.runtime} minutes`,
        movie.rating != null && `TMDb rating: ${movie.rating.toFixed(1)}/10`,
        movie.director && `Director: ${movie.director}`,
        movie.cast?.length && `Cast: ${castNames(movie.cast)}`
      ].filter(Boolean).forEach((detail) => {
        const paragraph = document.createElement("p");
        paragraph.textContent = detail;
        card.append(paragraph);
      });

      const actions = document.createElement("div");
      actions.className = "actions";
      const toggle = document.createElement("button");
      toggle.textContent = movie.watched ? "Mark Not Watched" : "Mark Watched";
      toggle.addEventListener("click", () => updateMovie(movie.id, !movie.watched));

      const remove = document.createElement("button");
      remove.className = "delete";
      remove.textContent = "Delete";
      remove.addEventListener("click", () => deleteMovie(movie.id));

      actions.append(toggle, remove);
      card.append(statusText, actions);
      list.append(card);
    });
  } catch (error) {
    list.innerHTML = '<p class="empty">Cannot connect to the backend. Start it with node server.js from the backend folder.</p>';
  }
}

async function updateMovie(id, watched) {
  try {
    await request(`${API}/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ watched })
    });
    await displayMovies();
  } catch (error) {
    alert("Could not update movie.");
  }
}

async function deleteMovie(id) {
  if (!confirm("Delete this movie from your watchlist?")) return;
  try {
    await request(`${API}/${id}`, { method: "DELETE" });
    await displayMovies();
  } catch (error) {
    alert("Could not delete movie.");
  }
}

document.getElementById("search").addEventListener("input", displayMovies);
document.getElementById("filter").addEventListener("change", displayMovies);
document.getElementById("genreFilter").addEventListener("change", displayMovies);

titleInput.addEventListener("input", () => {
  selectedMovie = null;
  moviePreview.hidden = true;
  clearTimeout(searchTimer);
  const query = titleInput.value.trim();
  if (query.length < 2) {
    searchController?.abort();
    hideSuggestions();
    return;
  }
  searchTimer = setTimeout(() => searchMovies(query), 300);
});

document.addEventListener("click", (event) => {
  if (!event.target.closest(".autocomplete")) hideSuggestions();
});

displayMovies();
