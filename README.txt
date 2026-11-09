ONLINE MOVIE WATCHLIST

Requirements:
- Node.js 18 or later
- A free TMDb API key for automatic movie search and details (optional)
- VS Code

1. Configure and start the backend:
   For TMDb search and automatic movie details, request an API key at
   https://www.themoviedb.org/settings/api.
   From the project folder, copy the example and replace the placeholder in
   backend/.env:
       Copy-Item .\backend\.env.example .\backend\.env
       notepad .\backend\.env
   Then open PowerShell in the backend folder and start the server:
       node server.js
   The .env file is local and ignored by Git; never commit or share your key.
   The watchlist API works without a TMDb key, but movie search and details do not.

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
