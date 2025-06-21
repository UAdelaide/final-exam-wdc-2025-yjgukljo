const express = require('express');
const path = require('path');
const session = require('express-session');
const { executeQuery, testConnection, initializeDatabase } = require('./models/db');

const app = express();

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

// Initialize database on startup
(async () => {
    try {
        const isConnected = await testConnection();
        if (isConnected) {
            await initializeDatabase();
            console.log('✅ 数据库系统初始化完成！');
        } else {
            console.log('⚠️  数据库连接失败，应用无法启动');
        }
    } catch (error) {
        console.error('⚠️  数据库初始化错误:', error.message);
    }
})();

// Login route
app.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        console.log('Login attempt:', { username, password });
        
        // Query user from database
        const [rows] = await executeQuery(
            'SELECT user_id, username, password_hash, role FROM Users WHERE username = ?',
            [username]
        );
        
        if (rows.length === 0) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        
        const user = rows[0];
        
        // Simple password check (in production, use bcrypt)
        if (user.password_hash !== password) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        
        // Store user in session
        req.session.user = {
            id: user.user_id,
            username: user.username,
            role: user.role
        };
        
        let redirectUrl = '/owner-dashboard.html';
        if (user.role === 'walker') redirectUrl = '/walker-dashboard.html';
        if (user.role === 'admin') redirectUrl = '/admin-dashboard.html';
        
        res.json({ 
            success: true, 
            role: user.role,
            redirect: redirectUrl
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
        
        const [rows] = await executeQuery(
            'SELECT dog_id, name, size FROM Dogs WHERE owner_id = ?',
            [req.session.user.id]
        );
        
        res.json(rows.map(dog => ({
            dog_id: dog.dog_id,
            id: dog.dog_id,
            name: dog.name,
            size: dog.size,
            owner_id: req.session.user.id,
            owner_username: req.session.user.username
        })));
    } catch (error) {
        console.error('Error fetching user dogs:', error);
        res.status(500).json({ error: 'Failed to fetch dogs' });
    }
});

// Get all dogs for display (API endpoint for exam question 6)
app.get('/api/dogs', async (req, res) => {
    try {
        const [rows] = await executeQuery(`
            SELECT d.name as dog_name, d.size, u.username as owner_username
            FROM Dogs d
            JOIN Users u ON d.owner_id = u.user_id
        `);
        
        res.json(rows);
        
    } catch (error) {
        console.error('Error fetching dogs:', error);
        res.status(500).json({ error: 'Failed to retrieve dogs data' });
    }
});

// Get open walk requests (API endpoint for exam question 7)
app.get('/api/walkrequests/open', async (req, res) => {
    try {
        const [rows] = await executeQuery(`
            SELECT wr.request_id, d.name as dog_name, d.size, u.username as owner_name,
                   wr.requested_time, wr.duration_minutes, wr.location, wr.status
            FROM WalkRequests wr
            JOIN Dogs d ON wr.dog_id = d.dog_id
            JOIN Users u ON d.owner_id = u.user_id
            WHERE wr.status = 'open'
        `);
        
        res.json(rows.map(row => ({
            id: row.request_id,
            dog_name: row.dog_name,
            size: row.size,
            owner_name: row.owner_name,
            requested_time: row.requested_time,
            duration_minutes: row.duration_minutes,
            location: row.location,
            status: row.status
        })));
        
    } catch (error) {
        console.error('Error fetching walk requests:', error);
        res.status(500).json({ error: 'Failed to retrieve walk requests' });
    }
});

// Get walker summary (API endpoint for exam question 8)
app.get('/api/walkers/summary', async (req, res) => {
    try {
        const [rows] = await executeQuery(`
            SELECT u.username as walker_name,
                   COUNT(wa.application_id) as applications_count,
                   COALESCE(AVG(wr.rating), 0) as average_rating
            FROM Users u
            LEFT JOIN WalkApplications wa ON u.user_id = wa.walker_id
            LEFT JOIN WalkRatings wr ON u.user_id = wr.walker_id
            WHERE u.role = 'walker'
            GROUP BY u.user_id, u.username
        `);
        
        res.json(rows.map(row => ({
            walker_name: row.walker_name,
            applications_count: row.applications_count || 0,
            average_rating: parseFloat(row.average_rating) || 0
        })));
        
    } catch (error) {
        console.error('Error fetching walker summary:', error);
        res.status(500).json({ error: 'Failed to retrieve walker summary' });
    }
});

// Legacy route for compatibility (alias to /api/walkrequests/open)
app.get('/api/walks', async (req, res) => {
    try {
        const [rows] = await executeQuery(`
            SELECT wr.request_id, d.name as dog_name, d.size, u.username as owner_name,
                   wr.requested_time, wr.duration_minutes, wr.location, wr.status
            FROM WalkRequests wr
            JOIN Dogs d ON wr.dog_id = d.dog_id
            JOIN Users u ON d.owner_id = u.user_id
            WHERE wr.status = 'open'
        `);
        
        res.json(rows.map(row => ({
            id: row.request_id,
            dog_name: row.dog_name,
            size: row.size,
            owner_name: row.owner_name,
            requested_time: row.requested_time,
            duration_minutes: row.duration_minutes,
            location: row.location,
            status: row.status
        })));
    } catch (error) {
        console.error('Error fetching walks:', error);
        res.status(500).json({ error: 'Failed to fetch walks' });
    }
});

// Create walk request
app.post('/api/walks', async (req, res) => {
    try {
        if (!req.session.user) {
            return res.status(401).json({ error: 'Not logged in' });
        }
        
        const { dog_id, requested_time, duration_minutes, location } = req.body;
        console.log('Create walk request data:', { dog_id, requested_time, duration_minutes, location });
        
        // Verify dog belongs to user
        const [dogRows] = await executeQuery(
            'SELECT dog_id FROM Dogs WHERE dog_id = ? AND owner_id = ?',
            [parseInt(dog_id), req.session.user.id]
        );
        
        if (dogRows.length === 0) {
            return res.status(400).json({ error: 'Dog not found or not owned by you' });
        }
        
        // Insert walk request
        await executeQuery(
            'INSERT INTO WalkRequests (dog_id, requested_time, duration_minutes, location) VALUES (?, ?, ?, ?)',
            [parseInt(dog_id), requested_time, parseInt(duration_minutes), location]
        );
        
        res.json({ message: 'Walk request created successfully' });
    } catch (error) {
        console.error('Error creating walk request:', error);
        res.status(500).json({ error: 'Failed to create walk request' });
    }
});

// Apply for walk
app.post('/api/walks/:id/apply', async (req, res) => {
    try {
        if (!req.session.user) {
            return res.status(401).json({ error: 'Not logged in' });
        }
        
        const requestId = parseInt(req.params.id);
        
        // Check if request exists and is open
        const [requestRows] = await executeQuery(
            'SELECT request_id, status FROM WalkRequests WHERE request_id = ?',
            [requestId]
        );
        
        if (requestRows.length === 0) {
            return res.status(404).json({ error: 'Walk request not found' });
        }
        
        if (requestRows[0].status !== 'open') {
            return res.status(400).json({ error: 'Walk request is no longer available' });
        }
        
        // Check if already applied
        const [existingApplication] = await executeQuery(
            'SELECT application_id FROM WalkApplications WHERE request_id = ? AND walker_id = ?',
            [requestId, req.session.user.id]
        );
        
        if (existingApplication.length > 0) {
            return res.status(400).json({ error: 'Already applied for this walk' });
        }
        
        // Insert application
        await executeQuery(
            'INSERT INTO WalkApplications (request_id, walker_id) VALUES (?, ?)',
            [requestId, req.session.user.id]
        );
        
        res.json({ message: 'Successfully applied for walk' });
    } catch (error) {
        console.error('Error applying for walk:', error);
        res.status(500).json({ error: 'Failed to apply for walk' });
    }
});

// Admin middleware - check if user is admin
function requireAdmin(req, res, next) {
    if (!req.session.user || req.session.user.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
    }
    next();
}

// Admin: Get all users
app.get('/api/admin/users', requireAdmin, async (req, res) => {
    try {
        const [rows] = await executeQuery(
            'SELECT user_id, username, role FROM Users ORDER BY user_id'
        );
        
        res.json(rows.map(user => ({
            id: user.user_id,
            username: user.username,
            role: user.role
        })));
    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).json({ error: 'Failed to fetch users' });
    }
});

// Admin: Add new user
app.post('/api/admin/users', requireAdmin, async (req, res) => {
    try {
        const { username, password, role } = req.body;
        
        if (!username || !password || !role) {
            return res.status(400).json({ error: 'Username, password, and role are required' });
        }
        
        // Check if username exists
        const [existingUser] = await executeQuery(
            'SELECT user_id FROM Users WHERE username = ?',
            [username]
        );
        
        if (existingUser.length > 0) {
            return res.status(400).json({ error: 'Username already exists' });
        }
        
        // Insert new user (with dummy email)
        const [result] = await executeQuery(
            'INSERT INTO Users (username, email, password_hash, role) VALUES (?, ?, ?, ?)',
            [username, `${username}@example.com`, password, role]
        );
        
        res.json({ 
            message: 'User created successfully', 
            user: { id: result.insertId, username, role } 
        });
    } catch (error) {
        console.error('Error creating user:', error);
        res.status(500).json({ error: 'Failed to create user' });
    }
});

// Admin: Delete user
app.delete('/api/admin/users/:id', requireAdmin, async (req, res) => {
    try {
        const userId = parseInt(req.params.id);
        
        // Check if user exists and is not admin
        const [userRows] = await executeQuery(
            'SELECT user_id, role FROM Users WHERE user_id = ?',
            [userId]
        );
        
        if (userRows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        if (userRows[0].role === 'admin') {
            return res.status(400).json({ error: 'Cannot delete admin users' });
        }
        
        // Delete user
        await executeQuery('DELETE FROM Users WHERE user_id = ?', [userId]);
        
        res.json({ message: 'User deleted successfully' });
    } catch (error) {
        console.error('Error deleting user:', error);
        res.status(500).json({ error: 'Failed to delete user' });
    }
});

// Admin: Update user
app.put('/api/admin/users/:id', requireAdmin, async (req, res) => {
    try {
        const userId = parseInt(req.params.id);
        const { username, password, role } = req.body;
        
        // Check if user exists
        const [userRows] = await executeQuery(
            'SELECT user_id, username, role FROM Users WHERE user_id = ?',
            [userId]
        );
        
        if (userRows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        const currentUser = userRows[0];
        
        // Check username uniqueness if changing
        if (username && username !== currentUser.username) {
            const [existingUser] = await executeQuery(
                'SELECT user_id FROM Users WHERE username = ? AND user_id != ?',
                [username, userId]
            );
            
            if (existingUser.length > 0) {
                return res.status(400).json({ error: 'Username already exists' });
            }
        }
        
        // Build update query
        const updates = [];
        const values = [];
        
        if (username) {
            updates.push('username = ?');
            values.push(username);
        }
        if (password) {
            updates.push('password_hash = ?');
            values.push(password);
        }
        if (role && currentUser.role !== 'admin') {
            updates.push('role = ?');
            values.push(role);
        }
        
        if (updates.length > 0) {
            values.push(userId);
            await executeQuery(
                `UPDATE Users SET ${updates.join(', ')} WHERE user_id = ?`,
                values
            );
        }
        
        // Get updated user info
        const [updatedUser] = await executeQuery(
            'SELECT user_id, username, role FROM Users WHERE user_id = ?',
            [userId]
        );
        
        res.json({ 
            message: 'User updated successfully', 
            user: { 
                id: updatedUser[0].user_id, 
                username: updatedUser[0].username, 
                role: updatedUser[0].role 
            } 
        });
    } catch (error) {
        console.error('Error updating user:', error);
        res.status(500).json({ error: 'Failed to update user' });
    }
});

module.exports = app;