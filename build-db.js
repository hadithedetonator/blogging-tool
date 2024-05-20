const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');

// Connect to the SQLite database
const db = new sqlite3.Database('blog.db');

// Serialize the database operations
db.serialize(() => {
  db.run("PRAGMA foreign_keys = OFF"); // Disable foreign key constraints temporarily

  // Drop all tables
  db.run("DROP TABLE IF EXISTS articles");
  db.run("DROP TABLE IF EXISTS users");
  db.run("DROP TABLE IF EXISTS blog_settings");
  db.run("DROP TABLE IF EXISTS comments");
  db.run("DROP TABLE IF EXISTS likes");


  
  db.run("PRAGMA foreign_keys = ON"); // Enable foreign key constraints again

   // Create the users table
   db.run(`
   CREATE TABLE IF NOT EXISTS users (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     name TEXT,
     email TEXT UNIQUE,
     password TEXT
   )
 `);
 // Create the articles table
 db.run(`
 CREATE TABLE articles (
   id INTEGER PRIMARY KEY AUTOINCREMENT,
   title TEXT NOT NULL,
   subtitle TEXT NOT NULL,
   content TEXT,
   created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
   modified_at DATETIME DEFAULT CURRENT_TIMESTAMP,
   published_at DATETIME,
   author_id INTEGER,
   likes INTEGER DEFAULT 0,
   FOREIGN KEY (author_id) REFERENCES users (id) ON DELETE CASCADE
 )
`);

// Create the likes table
db.run(`
 CREATE TABLE IF NOT EXISTS likes (
   id INTEGER PRIMARY KEY AUTOINCREMENT,
   article_id INTEGER,
   user_id INTEGER,
   created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
   FOREIGN KEY (article_id) REFERENCES articles(id),
   FOREIGN KEY (user_id) REFERENCES users(id),
   UNIQUE (article_id, user_id)
 )
`);

// Create a trigger to update the likes count in the articles table
db.run(`
 CREATE TRIGGER update_likes_count AFTER INSERT ON likes
 BEGIN
   UPDATE articles
   SET likes = (
     SELECT COUNT(*)
     FROM likes
     WHERE article_id = NEW.article_id
   )
   WHERE id = NEW.article_id;
 END;
`);

// Create the comments table
db.run(`
    CREATE TABLE IF NOT EXISTS comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      article_id INTEGER,
      content TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      user_id INTEGER,
      FOREIGN KEY (article_id) REFERENCES articles(id)
      FOREIGN KEY (user_id) REFERENCES users(id)

      )
  `);

  // Create the blog_settings table
db.run(`
  CREATE TABLE IF NOT EXISTS blog_settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT,
      subtitle TEXT,
      author TEXT
    )
  `);
  
db.run(`INSERT INTO blog_settings (id, title, subtitle, author)
  VALUES (1, 'My Blog', 'A Journey of Thoughts', 'Talha');
  `)


 

});
