const express = require('express');
const session = require('express-session');
const flash = require('express-flash');
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const bcrypt = require('bcrypt');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Initialize the Express application
const app = express();

// Set up session middleware
app.use(
  session({
    secret: 'secret-key',
    resave: false,
    saveUninitialized: false,
  })
);

// Set up flash middleware
app.use(flash());

// Set up passport middleware
app.use(passport.initialize());
app.use(passport.session());

// Set up the database connection
const db = new sqlite3.Database('blog.db');

// Define the User model
class User {
  constructor(id, name, email, password) {
    this.id = id;
    this.name = name;
    this.email = email;
    this.password = password;
  }

  static findByEmail(email, callback) {
    db.get('SELECT * FROM users WHERE email = ?', [email], (err, row) => {
      if (err) return callback(err);
      if (!row) return callback(null, null);

      const user = new User(row.id, row.name, row.email, row.password);
      callback(null, user);
    });
  }

  static findById(id, callback) {
    db.get('SELECT * FROM users WHERE id = ?', [id], (err, row) => {
      if (err) return callback(err);
      if (!row) return callback(null, null);

      const user = new User(row.id, row.name, row.email, row.password);
      callback(null, user);
    });
  }
}

// Set up passport local strategy
passport.use(
  new LocalStrategy({ usernameField: 'email' }, (email, password, done) => {
    User.findByEmail(email, (err, user) => {
      if (err) return done(err);
      if (!user) return done(null, false, { message: 'Incorrect email or password' });

      bcrypt.compare(password, user.password, (err, result) => {
        if (err) return done(err);
        if (!result) return done(null, false, { message: 'Incorrect email or password' });

        return done(null, user);
      });
    });
  })
);

// Serialize user object to store in the session
passport.serializeUser((user, done) => {
  done(null, user.id);
});

// Deserialize user object from the session
passport.deserializeUser((id, done) => {
  User.findById(id, (err, user) => {
    done(err, user);
  });
});

// Set up view engine
app.set('view engine', 'ejs');

// Set up views
app.set('views', path.join(__dirname, 'views'));

// Parse request body as JSON
app.use(express.json());

// Parse URL-encoded bodies
app.use(express.urlencoded({ extended: true }));

// Set up static directory
app.use(express.static('public'));

// Define routes

// Auth Routes

app.get('/register', (req, res) => {
  res.render('register', { message: '' });
});

app.post('/register', (req, res) => {
  const { name, email, password } = req.body;

  // Perform validation on the user input
  if (!name || !email || !password) {
    // If any of the required fields are missing, display an error message
    return res.render('register', { message: 'Please fill in all the fields' });
  }

  // Check if the user already exists in the database
  User.findByEmail(email, (err, existingUser) => {
    if (err) {
      console.error('Error checking existing user:', err);
      // Display an error message if there was an error checking the database
      return res.render('register', { message: 'An error occurred. Please try again later' });
    }

    if (existingUser) {
      // If the user already exists, display an error message
      return res.render('register', { message: 'Email already registered. Please use a different email' });
    }

    // If the user doesn't exist, create a new user record
    const newUser = new User(null, name, email, password);

    // Hash the user's password
    bcrypt.hash(newUser.password, 10, (err, hashedPassword) => {
      if (err) {
        console.error('Error hashing password:', err);
        // Display an error message if there was an error hashing the password
        return res.render('register', { message: 'An error occurred. Please try again later' });
      }

      // Save the hashed password to the user record
      newUser.password = hashedPassword;

      // Save the user record to the database
      db.run(
        'INSERT INTO users (name, email, password) VALUES (?, ?, ?)',
        [newUser.name, newUser.email, newUser.password],
        (err) => {
          if (err) {
            console.error('Error saving user:', err);
            // Display an error message if there was an error saving the user to the database
            return res.render('register', { message: 'An error occurred. Please try again later' });
          }

          // Redirect the user to a success page or login page
          res.redirect('/author-home');
        }
      );
    });
  });
});

app.get('/login', (req, res) => {
  res.render('login', { message: '' }); // Render the login form
});

app.post('/login', passport.authenticate('local', {
  successRedirect: '/',
  failureRedirect: '/login',
  failureFlash: true
}));

app.get('/author-home', ensureAuthenticated, (req, res) => {
  // Retrieve blog settings and articles from the database dynamically
  db.get('SELECT * FROM blog_settings', (err, settings) => {
    if (err) {
      console.error('Error retrieving blog settings:', err);
      res.status(500).send('Internal Server Error');
      return;
    }

    db.all('SELECT * FROM articles WHERE author_id = ? ORDER BY published_at DESC', [req.user.id], (err, articles) => {
      if (err) {
        console.error('Error retrieving articles:', err);
        res.status(500).send('Internal Server Error');
        return;
      }

      res.render('author-home', {
        user: req.user,
        blogTitle: settings ? settings.title : '',
        blogSubtitle: settings ? settings.subtitle : '',
        authorName: settings ? settings.author : '',
        articles: articles || [],
      });
    });
  });
});

// Logout route
app.get('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Error destroying session:', err);
      return res.status(500).send('Internal Server Error');
    }
    res.redirect('/'); // Redirect the user to the homepage
  });
});

// Adding the ensureAuthenticated middleware and protecting our route with it
function ensureAuthenticated(req, res, next) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.redirect('/login');
}
app.get('/', (req, res) => {
  // Retrieve published articles from the database
  db.all('SELECT * FROM articles WHERE published_at IS NOT NULL ORDER BY published_at DESC', (err, articles) => {
    if (err) {
      console.error('Error retrieving articles:', err);
      res.status(500).send('Internal Server Error');
      return;
    }

    // Fetch all records from the blog_settings table
    db.all('SELECT * FROM blog_settings', (err, blogSettings) => {
      if (err) {
        console.error('Error retrieving blog settings:', err);
        res.status(500).send('Internal Server Error');
        return;
      }

      res.render('reader-home', {
        articles: articles,
        blogSettings: blogSettings,
        user: req.user, // Pass the logged-in user to the template
      });
    });
  });
});

// Article Details Route
app.get('/article/:id', (req, res) => {
  const articleId = req.params.id;

  // Retrieve the article details from the database
  db.get('SELECT * FROM articles WHERE id = ?', [articleId], (err, article) => {
    if (err) {
      console.error('Error retrieving article:', err);
      res.status(500).send('Internal Server Error');
      return;
    }

    if (!article) {
      // Article not found
      res.status(404).send('Article not found');
      return;
    }

    // Retrieve comments for the article from the database
    db.all('SELECT comments.*, users.name AS user_name FROM comments LEFT JOIN users ON comments.user_id = users.id WHERE article_id = ? ORDER BY comments.created_at ASC', [articleId], (err, comments) => {
      if (err) {
        console.error('Error retrieving comments:', err);
        res.status(500).send('Internal Server Error');
        return;
      }

      res.render('reader-article', {
        article: article,
        comments: comments || [],
        user: req.user,
      });
    });
  });
});

  // Add comment to an article
app.post('/article/:id/comments', (req, res) => {
  const articleId = req.params.id;
  const { comment } = req.body;

  // Perform validation on the user input
  if (!comment) {
    // If the comment is missing, display an error message or redirect to the article page
    return res.redirect(`/article/${articleId}`);
  }

  // Insert the comment into the database
  db.run(
    'INSERT INTO comments (article_id, content) VALUES (?, ?)',
    [articleId, comment],
    (err) => {
      if (err) {
        console.error('Error adding comment:', err);
        return res.sendStatus(500);
      }
      res.redirect(`/article/${articleId}`);
    }
  );
});

// Like an article
app.post('/article/:id/like', (req, res) => {
  const articleId = req.params.id;

  // Check if the user has already liked the article
  const userId = req.user.id; // Assuming you have the user ID available in the request

  db.get('SELECT * FROM likes WHERE article_id = ? AND user_id = ?', [articleId, userId], (err, like) => {
    if (err) {
      console.error('Error checking like:', err);
      return res.sendStatus(500);
    }

    if (like) {
      // The user has already liked the article
      return res.redirect(`/article/${articleId}`);
    }

    // Insert the like into the database
    db.run(
      'INSERT INTO likes (article_id, user_id) VALUES (?, ?)',
      [articleId, userId],
      (err) => {
        if (err) {
          console.error('Error adding like:', err);
          return res.sendStatus(500);
        }

        // Increment the likes count in the articles table
        db.run('UPDATE articles SET likes = likes + 1 WHERE id = ?', [articleId], (err) => {
          if (err) {
            console.error('Error updating likes count:', err);
            return res.sendStatus(500);
          }

          res.redirect(`/article/${articleId}`);
        });
      }
    );
  });
});

app.get('/author', (req, res) => {
  // Retrieve published articles and draft articles from the database
  db.all(
    'SELECT * FROM articles WHERE author_id = ? AND published_at IS NOT NULL ORDER BY published_at DESC',
    [req.user.id],
    (err, publishedArticles) => {
      if (err) {
        console.error('Error retrieving published articles:', err);
        res.status(500).send('Internal Server Error');
        return;
      }

db.all(
        'SELECT * FROM articles WHERE author_id = ? AND published_at IS NULL ORDER BY created_at DESC',
        [req.user.id],
        (err, draftArticles) => {
          if (err) {
            console.error('Error retrieving draft articles:', err);
            res.status(500).send('Internal Server Error');
            return; 
          }
db.get('SELECT * FROM blog_settings', (err, blogSettings) => {
            if (err) {
              console.error('Error retrieving blog settings:', err);
              res.status(500).send('Internal Server Error');
              return;
            }

          res.render('author-home', {
            publishedArticles: publishedArticles,
            draftArticles: draftArticles,
            user: req.user,
            blogSettings :blogSettings
          });
        });
      }
    );
  }
);
});

// Author Settings Page
app.get('/author/settings', (req, res) => {
  db.get('SELECT * FROM blog_settings', (err, blogSettings) => {
    if (err) {
      console.error('Error retrieving blog settings:', err);
      res.status(500).send('Internal Server Error');
      return;
    }

    res.render('author-settings', { blogSettings });
  });
});

// Update blog settings
app.post('/author/settings', (req, res) => {
  const { blogTitle, subtitle, authorName } = req.body;

  db.run(
    'UPDATE blog_settings SET title = ?, subtitle = ?, author = ?',
    [blogTitle, subtitle, authorName],
    (err) => {
      if (err) {
        console.error('Error updating blog settings:', err);
        res.status(500).send('Internal Server Error');
        return;
      }

      res.redirect('/author');
    }
  );
});

app.post('/article/:id/delete', (req, res) => {
  const articleId = req.params.id;

  // Delete the article from the database
  db.run('DELETE FROM articles WHERE id = ?', [articleId], (err) => {
    if (err) {
      console.error('Error deleting article:', err);
      res.status(500).send('Internal Server Error');
      return;
    }

    // Redirect back to the author home page after deletion
    res.redirect('/author');
  });
});

// Like an article
app.post('/article/:id/like', ensureAuthenticated, (req, res) => {
    const articleId = req.params.id;
    const userId = req.user.id;
  
    // Check if the user has already liked the article
    db.get('SELECT * FROM likes WHERE article_id = ? AND user_id = ?', [articleId, userId], (err, row) => {
      if (err) {
        console.error('Error checking existing like:', err);
        res.status(500).send('Internal Server Error');
        return;
      }
  
      if (row) {
        // If the user has already liked the article, display a message or redirect back to the article page
        // For example:
        res.redirect(`/article/${articleId}`);
        return;
      }
  
        // Increment the likes count in the articles table
        db.run('UPDATE articles SET likes = likes + 1 WHERE id = ?', [articleId], (err) => {
          if (err) {
            console.error('Error updating likes count:', err);
            res.status(500).send('Internal Server Error');
            return;
          }
  
          // Redirect back to the article page or update the page using AJAX
          res.redirect(`/article/${articleId}`);
        });
      });
    });
    app.post('/author/articles/:articleId/publish', (req, res) => {
      const articleId = req.params.articleId;
    
      // Update the article's published_at value with the current timestamp
      db.run('UPDATE articles SET published_at = datetime("now") WHERE id = ?', [articleId], (err) => {
        if (err) {
          console.error('Error publishing article:', err);
          res.status(500).send('Internal Server Error');
          return;
        }
    
        res.sendStatus(200);
      });
    });

    //new article
    app.get('/author/article/new', (req, res) => {
      const draftId = Date.now().toString(); // Generate draft ID using current timestamp
    
      res.render('author-new-draft', { draftId: draftId });
    });
    
    app.post('/author/article/new', (req, res) => {
      const { title, content } = req.body;
    
      // Insert the new draft article into the database
      db.run(
        'INSERT INTO articles (title, content, created_at, modified_at, published_at, author_id) VALUES (?, ?, datetime("now"), datetime("now"), null, ?)',
        [title, content, req.user.id],
        function (err) {
          if (err) {
            console.error('Error creating new draft article:', err);
            res.status(500).send('Internal Server Error');
            return;
          }
    
          // Retrieve the newly created draft article from the database
          db.get('SELECT * FROM articles WHERE id = ?', [this.lastID], (err, article) => {
            if (err) {
              console.error('Error retrieving new draft article:', err);
              res.status(500).send('Internal Server Error');
              return;
            }
    
            res.redirect('/author');
          });
        }
      );
    });
    
    // Author Edit Article Page
app.get('/author/article/:id/edit', (req, res) => {
  const articleId = req.params.id;

  db.get('SELECT * FROM articles WHERE id = ?', [articleId], (err, article) => {
    if (err) {
      console.error('Error retrieving article:', err);
      res.status(500).send('Internal Server Error');
      return;
    }

    res.render('author-edit-article', { article });
  });
});

// Update article
app.post('/author/article/:id/edit', (req, res) => {
  const articleId = req.params.id;
  const userId = req.user.id; // Get the user ID from authentication
  const { title, subtitle, content } = req.body;

  db.run(
    'UPDATE articles SET title = ?, subtitle = ?, content = ?, modified_at = CURRENT_TIMESTAMP WHERE id = ? AND author_id = ?',
    [title, subtitle, content, articleId, userId],
    (err) => {
      if (err) {
        console.error('Error updating article:', err);
        res.status(500).send('Internal Server Error');
        return;
      }

      res.redirect('/author');
    }
  );
});
//posting new draft
app.post('/author/article/new/:draftId', (req, res) => {
  const draftId = req.params.draftId;
  const title = req.body.title;
  const subtitle = req.body.subtitle;
  const content = req.body.content;

  // Insert the draft article into the articles table
  db.run(
    'INSERT INTO articles (title,subtitle, content, created_at, modified_at, author_id) VALUES (?, ?,?, datetime("now"), datetime("now"), ?)',
    [title,subtitle, content, req.user.id],
    function (err) {
      if (err) {
        console.error('Error saving draft article:', err);
        res.status(500).send('Internal Server Error');
        return;
      }

      // Retrieve the ID of the newly inserted article
      const articleId = this.lastID;

      // Redirect the user to the author home page or display a success message
      res.redirect('/author');
    }
  );
});


// Reader Article Route
app.get('/reader/article/:id', (req, res) => {
  const articleId = req.params.id;
// Retrieve the article details and its author from the database
db.get(`
SELECT articles.*, users.name AS author_name
FROM articles
LEFT JOIN users ON articles.author_id = users.id
WHERE articles.id = ?`, [articleId], (err, article) => {
if (err) {
  console.error('Error retrieving article:', err);
  res.status(500).send('Internal Server Error');
  return;
}

// Retrieve comments for the article and their commenters from the database
db.all(`
  SELECT comments.*, users.name AS commenter_name
  FROM comments
  LEFT JOIN users ON comments.user_id = users.id
  WHERE comments.article_id = ?
  ORDER BY comments.created_at ASC`, [articleId], (err, comments) => {
  if (err) {
    console.error('Error retrieving comments:', err);
    res.status(500).send('Internal Server Error');
    return;
  }

  res.render('reader-article', {
    article: article,
    comments: comments || [],
    user: req.user,
  });
});
});
});

app.post('/reader/article/:articleId/comment', (req, res) => {
  const articleId = req.params.articleId;
  const comment = req.body.comment;
  const userId = req.user.id; // Assuming you have user authentication and req.user contains the logged-in user information

  // Save the comment to the database
  db.run(
    'INSERT INTO comments (article_id, content, created_at, user_id) VALUES (?, ?, datetime("now"), ?)',
    [articleId, comment, userId],
    (err) => {
      if (err) {
        console.error('Error saving comment:', err);
        res.status(500).send('Internal Server Error');
        return;
      }

      // Redirect the user back to the article page or display a success message
      res.redirect(`/reader/article/${articleId}`);
    }
  );
});

//like route
app.post('/reader/article/:articleId/like', (req, res) => {
  const articleId = req.params.articleId;

    db.run(`
      INSERT INTO likes (article_id, user_id)
      VALUES (?, ?)
    `, [articleId, req.user.id], (err) => {
      if (err) {
        console.error('Error adding like:', err);
        res.status(500).send('Internal Server Error');
        return;
      }

      res.sendStatus(200);
    });
  });

  
app.delete('/author/article/:articleId', (req, res) => {
    const articleId = req.params.articleId;
  
    // Delete the article from the database
    db.run('DELETE FROM articles WHERE id = ?', articleId, (err) => {
      if (err) {
        console.error('Error deleting article:', err);
        res.status(500).send('Internal Server Error');
        return;
      }
  
      // Send a response indicating the successful deletion
      res.sendStatus(204);
    });
  });
  


// Start the server
app.listen(3000, () => {
  console.log('Server is running on port 3000');
});
