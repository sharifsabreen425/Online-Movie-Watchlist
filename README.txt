ONLINE MOVIE WATCHLIST

Requirements:
- Node.js 18 or later
- A free TMDb API key for automatic movie search and details
- VS Code

1. Start the backend:
   Get an API key from https://www.themoviedb.org/settings/api.
   Open PowerShell in the backend folder, set the key, then start the server:
       $env:TMDB_API_KEY="your_tmdb_api_key"
       node server.js

2. Run the frontend:
   Open frontend/index.html with VS Code Live Server.
   Alternatively, open frontend/index.html directly in a browser.

Backend URL:
   http://localhost:8080/api/movies

Movies are saved in backend/data/movies.json. The backend keeps the TMDb key
private and does not require Java, Maven, MySQL, or any extra packages.

Features:
- Add movies
- Display movies
- Delete movies
- Mark Watched / Not Watched
- Search by title
- Filter by watch status
- Search TMDb suggestions and auto-fill posters, overview, cast, director,
  release date, runtime, rating, and genres
- Show a short movie description, lead cast, full cast list, genre, and other
  details in the movie preview and watchlist

Note: This is a starter version. It does not yet include user login or separate watchlists for multiple users.

The original Spring Boot backend is still available with Maven and MySQL.
