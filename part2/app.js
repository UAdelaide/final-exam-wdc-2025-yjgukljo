const express = require('express');
const path = require('path');
const session = require('express-session');
const mysql = require('mysql2/promise');
require('dotenv').config();

const app = express();

// Database connection
const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'DogWalkService'
});

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '/public')));

// Session middleware
app.use(session({
    secret: 'dogwalk-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false }
}));

// Login route
app.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        const [users] = await db.execute(
            'SELECT * FROM Users WHERE username = ?',
            [username]
        );
        
        if (users.length === 0) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        
        const user = users[0];
        // For this exam, passwords are stored as plain text (hashed123, etc.)
        if (password !== user.password_hash) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        
        // Store user in session
        req.session.user = {
            id: user.user_id,
            username: user.username,
            role: user.role
        };
        
        res.json({ 
            success: true, 
            role: user.role,
            redirect: user.role === 'owner' ? '/owner-dashboard.html' : '/walker-dashboard.html'
        });
        
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Login failed' });
    }
});

// Logout route
app.post('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).json({ error: 'Failed to logout' });
        }
        res.clearCookie('connect.sid');
        res.json({ success: true });
    });
});

// Get current user info
app.get('/api/users/me', (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ error: 'Not logged in' });
    }
    res.json({
        id: req.session.user.id,
        username: req.session.user.username,
        role: req.session.user.role
    });
});

// Get current user's dogs
app.get('/api/user/dogs', async (req, res) => {
    try {
        if (!req.session.user) {
            return res.status(401).json({ error: 'Not logged in' });
        }
        
        const [dogs] = await db.execute(
            'SELECT dog_id, name, size FROM Dogs WHERE owner_id = ?',
            [req.session.user.id]
        );
        
        res.json(dogs);
    } catch (error) {
        console.error('Error fetching user dogs:', error);
        res.status(500).json({ error: 'Failed to fetch dogs' });
    }
});

// Get all dogs for display
app.get('/api/dogs', async (req, res) => {
    try {
        const query = `
            SELECT d.name as dog_name, d.size, u.username as owner_username
            FROM Dogs d
            JOIN Users u ON d.owner_id = u.user_id
        `;
        
        const [results] = await db.execute(query);
        res.json(results);
        
    } catch (error) {
        console.error('Error fetching dogs:', error);
        res.status(500).json({ error: 'Failed to retrieve dogs data' });
    }
});

// Routes
const walkRoutes = require('./routes/walkRoutes');
const userRoutes = require('./routes/userRoutes');

app.use('/api/walks', walkRoutes);
app.use('/api/users', userRoutes);

// Export the app instead of listening here
module.exports = app;