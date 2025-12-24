const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');

const app = express();
const PORT = 3000;
const SECRET_KEY = 'wiiser_plus_secret_key_change_this';

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Database Setup
const dbPath = path.resolve(__dirname, 'wiiser.db');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening database', err.message);
    } else {
        console.log('Connected to SQLite database.');
        initDb();
    }
});

function initDb() {
    db.serialize(() => {
        // Users Table
        db.run(`CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE,
            email TEXT UNIQUE,
            password TEXT
        )`);

        // Academic Journey Table
        db.run(`CREATE TABLE IF NOT EXISTS academic_journey (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            completed_courses TEXT, -- JSON string
            pending_tasks TEXT,    -- JSON string
            milestones TEXT,        -- JSON string
            FOREIGN KEY(user_id) REFERENCES users(id)
        )`);
    });
}

// Routes

// Register
app.post('/api/register', (req, res) => {
    const { username, email, password } = req.body;
    if (!username || !email || !password) {
        return res.status(400).json({ error: 'Missing fields' });
    }

    const hashedPassword = bcrypt.hashSync(password, 8);

    db.run(
        `INSERT INTO users (username, email, password) VALUES (?, ?, ?)`,
        [username, email, hashedPassword],
        function (err) {
            if (err) {
                return res.status(400).json({ error: 'User already exists' });
            }
            
            // Initialize empty journey for new user
            db.run(`INSERT INTO academic_journey (user_id, completed_courses, pending_tasks, milestones) VALUES (?, ?, ?, ?)`, 
                [this.lastID, '[]', '[]', '[]']);

            const token = jwt.sign({ id: this.lastID }, SECRET_KEY, { expiresIn: '24h' });
            res.json({ message: 'User registered', token });
        }
    );
});

// Login
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;

    db.get(`SELECT * FROM users WHERE username = ?`, [username], (err, user) => {
        if (err || !user) {
            return res.status(404).json({ error: 'User not found' });
        }

        const passwordIsValid = bcrypt.compareSync(password, user.password);
        if (!passwordIsValid) {
            return res.status(401).json({ token: null, error: 'Invalid Password' });
        }

        const token = jwt.sign({ id: user.id }, SECRET_KEY, { expiresIn: '24h' });
        res.json({ token, username: user.username });
    });
});

// Middleware to verify token
function verifyToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) return res.status(403).json({ error: 'No token provided' });

    jwt.verify(token, SECRET_KEY, (err, decoded) => {
        if (err) return res.status(401).json({ error: 'Unauthorized' });
        req.userId = decoded.id;
        next();
    });
}

// Get Academic Journey
app.get('/api/journey', verifyToken, (req, res) => {
    db.get(`SELECT * FROM academic_journey WHERE user_id = ?`, [req.userId], (err, row) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        if (!row) {
             // Should not happen if initialized correctly
             return res.json({ completed_courses: [], pending_tasks: [], milestones: [] });
        }
        res.json({
            completed_courses: JSON.parse(row.completed_courses || '[]'),
            pending_tasks: JSON.parse(row.pending_tasks || '[]'),
            milestones: JSON.parse(row.milestones || '[]')
        });
    });
});

// Update Academic Journey
app.post('/api/journey', verifyToken, (req, res) => {
    const { completed_courses, pending_tasks, milestones } = req.body;

    db.run(
        `UPDATE academic_journey SET completed_courses = ?, pending_tasks = ?, milestones = ? WHERE user_id = ?`,
        [JSON.stringify(completed_courses), JSON.stringify(pending_tasks), JSON.stringify(milestones), req.userId],
        function(err) {
            if (err) return res.status(500).json({ error: 'Update failed' });
            res.json({ message: 'Journey updated successfully' });
        }
    );
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
