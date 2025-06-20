const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');

const app = express();
const PORT = 8080;

// Middleware
app.use(cors());
app.use(express.json());

// Database connection
const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'DogWalkService'
});

// Initialize database on startup
async function initializeDatabase() {
    try {
        await db.execute(`
            INSERT IGNORE INTO Users (username, email, password_hash, role) VALUES
            ('alice123', 'alice@example.com', 'hashed123', 'owner'),
            ('bobwalker', 'bob@example.com', 'hashed456', 'walker'),
            ('carol123', 'carol@example.com', 'hashed789', 'owner'),
            ('davidwalker', 'david@example.com', 'hashed321', 'walker'),
            ('emma456', 'emma@example.com', 'hashed654', 'owner')
        `);

        await db.execute(`
            INSERT IGNORE INTO Dogs (owner_id, name, size) VALUES
            ((SELECT user_id FROM Users WHERE username = 'alice123'), 'Max', 'medium'),
            ((SELECT user_id FROM Users WHERE username = 'carol123'), 'Bella', 'small'),
            ((SELECT user_id FROM Users WHERE username = 'alice123'), 'Buddy', 'large'),
            ((SELECT user_id FROM Users WHERE username = 'emma456'), 'Milo', 'small'),
            ((SELECT user_id FROM Users WHERE username = 'emma456'), 'Rex', 'medium')
        `);

        await db.execute(`
            INSERT IGNORE INTO WalkRequests (dog_id, requested_time, duration_minutes, location, status) VALUES
            ((SELECT dog_id FROM Dogs WHERE name = 'Max'), '2025-06-10 08:00:00', 30, 'Parklands', 'open'),
            ((SELECT dog_id FROM Dogs WHERE name = 'Bella'), '2025-06-10 09:30:00', 45, 'Beachside Ave', 'accepted'),
            ((SELECT dog_id FROM Dogs WHERE name = 'Buddy'), '2025-06-11 15:00:00', 20, 'Local Park', 'open'),
            ((SELECT dog_id FROM Dogs WHERE name = 'Milo'), '2025-06-12 08:30:00', 35, 'Dog Beach', 'completed'),
            ((SELECT dog_id FROM Dogs WHERE name = 'Rex'), '2025-06-12 17:00:00', 40, 'City Gardens', 'open')
        `);
        
        console.log('Database initialized with sample data');
    } catch (error) {
        console.error('Error initializing database:', error);
    }
}

// API Routes

// /api/dogs - Return all dogs with size and owner username
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

// /api/walkrequests/open - Return all open walk requests
app.get('/api/walkrequests/open', async (req, res) => {
    try {
        const query = `
            SELECT wr.request_id, d.name as dog_name, wr.requested_time, 
                   wr.duration_minutes, wr.location, u.username as owner_username
            FROM WalkRequests wr
            JOIN Dogs d ON wr.dog_id = d.dog_id
            JOIN Users u ON d.owner_id = u.user_id
            WHERE wr.status = 'open'
        `;
        
        const [results] = await db.execute(query);
        res.json(results);
        
    } catch (error) {
        console.error('Error fetching open walk requests:', error);
        res.status(500).json({ error: 'Failed to retrieve open walk requests' });
    }
});

// /api/walkers/summary - Return walker summary with ratings and completed walks
app.get('/api/walkers/summary', async (req, res) => {
    try {
        const query = `
            SELECT u.username as walker_username,
                   COUNT(wr.rating_id) as total_ratings,
                   AVG(wr.rating) as average_rating,
                   COUNT(DISTINCT wa.request_id) as completed_walks
            FROM Users u
            LEFT JOIN WalkApplications wa ON u.user_id = wa.walker_id AND wa.status = 'accepted'
            LEFT JOIN WalkRequests req ON wa.request_id = req.request_id AND req.status = 'completed'
            LEFT JOIN WalkRatings wr ON wa.request_id = wr.request_id AND wa.walker_id = wr.walker_id
            WHERE u.role = 'walker'
            GROUP BY u.user_id, u.username
        `;
        
        const [results] = await db.execute(query);
        res.json(results);
        
    } catch (error) {
        console.error('Error fetching walker summary:', error);
        res.status(500).json({ error: 'Failed to retrieve walker summary' });
    }
});

// Start server
app.listen(PORT, async () => {
    console.log(`Server running on http://localhost:${PORT}`);
    await initializeDatabase();
});

module.exports = app; 