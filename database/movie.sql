CREATE DATABASE IF NOT EXISTS movie_watchlist;
USE movie_watchlist;

CREATE TABLE IF NOT EXISTS movies (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(100) NOT NULL,
    genre VARCHAR(50),
    description TEXT,
    watched BOOLEAN DEFAULT FALSE
);
