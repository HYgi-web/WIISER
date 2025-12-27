const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const multer = require('multer');
const fs = require('fs');

const app = express();
const PORT = 3000;
const SECRET_KEY = 'wiiser_plus_secret_key_change_this';

// Middleware
app.use(cors());
app.use(bodyParser.json());
// Serve uploads statically
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// File Upload Configuration
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = './uploads/cvs';
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, req.userId + '-CV-' + uniqueSuffix + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

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

        // User Extended Profile
        db.run(`CREATE TABLE IF NOT EXISTS user_profiles (
            user_id INTEGER PRIMARY KEY,
            full_name TEXT,
            cv_path TEXT,
            FOREIGN KEY(user_id) REFERENCES users(id)
        )`);

        // Semesters (CGPA)
        db.run(`CREATE TABLE IF NOT EXISTS semesters (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            semester_number INTEGER,
            cgpa REAL,
            FOREIGN KEY(user_id) REFERENCES users(id)
        )`);

        // Experiences (Internships, Projects, Research, Co-curricular)
        db.run(`CREATE TABLE IF NOT EXISTS experiences (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            type TEXT, -- 'internship', 'project', 'research', 'cocurricular'
            title TEXT,
            description TEXT,
            duration TEXT,
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
            // Initialize basic profile
            db.run(`INSERT INTO user_profiles (user_id, full_name) VALUES (?, ?)`, [this.lastID, username]);

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

// Get Dashboard Data (Profile, Semesters, Experiences)
app.get('/api/dashboard-data', verifyToken, (req, res) => {
    const userId = req.userId;
    const responseData = { profile: {}, semesters: [], experiences: [] };

    db.get(`SELECT * FROM user_profiles WHERE user_id = ?`, [userId], (err, profile) => {
        if (err) return res.status(500).json({ error: 'DB Error' });
        responseData.profile = profile || {};

        db.all(`SELECT * FROM semesters WHERE user_id = ? ORDER BY semester_number ASC`, [userId], (err, sems) => {
            if (err) return res.status(500).json({ error: 'DB Error' });
            responseData.semesters = sems;

            db.all(`SELECT * FROM experiences WHERE user_id = ?`, [userId], (err, exps) => {
                if (err) return res.status(500).json({ error: 'DB Error' });
                responseData.experiences = exps;
                res.json(responseData);
            });
        });
    });
});

// Update Profile (Full Name)
app.post('/api/update-profile', verifyToken, (req, res) => {
    const { full_name } = req.body;
    db.run(`INSERT OR REPLACE INTO user_profiles (user_id, full_name, cv_path) 
            VALUES (?, ?, (SELECT cv_path FROM user_profiles WHERE user_id = ?))`,
        [req.userId, full_name, req.userId],
        function (err) {
            if (err) return res.status(500).json({ error: 'Update failed' });
            res.json({ message: 'Profile updated' });
        });
});


// Add/Update Semester
app.post('/api/semester', verifyToken, (req, res) => {
    const { semester_number, cgpa } = req.body;
    // Check if exists
    db.get(`SELECT id FROM semesters WHERE user_id = ? AND semester_number = ?`, [req.userId, semester_number], (err, row) => {
        if (row) {
            db.run(`UPDATE semesters SET cgpa = ? WHERE id = ?`, [cgpa, row.id], (err) => {
                if (err) return res.status(500).json({ error: 'Update failed' });
                res.json({ message: 'Semester updated' });
            });
        } else {
            db.run(`INSERT INTO semesters (user_id, semester_number, cgpa) VALUES (?, ?, ?)`, [req.userId, semester_number, cgpa], (err) => {
                if (err) return res.status(500).json({ error: 'Insert failed' });
                res.json({ message: 'Semester added' });
            });
        }
    });
});

// Add Experience
app.post('/api/experience', verifyToken, (req, res) => {
    const { type, title, description, duration } = req.body;
    db.run(`INSERT INTO experiences (user_id, type, title, description, duration) VALUES (?, ?, ?, ?, ?)`,
        [req.userId, type, title, description, duration],
        function (err) {
            if (err) return res.status(500).json({ error: 'Failed to add experience' });
            res.json({ message: 'Experience added', id: this.lastID });
        }
    );
});

// Delete Experience
app.delete('/api/experience/:id', verifyToken, (req, res) => {
    db.run(`DELETE FROM experiences WHERE id = ? AND user_id = ?`, [req.params.id, req.userId], function (err) {
        if (err) return res.status(500).json({ error: 'Delete failed' });
        res.json({ message: 'Deleted' });
    });
});

// Upload CV
app.post('/api/upload-cv', verifyToken, upload.single('cv'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    // Convert backslashes to forward slashes for URL compatibility
    const filePath = req.file.path.replace(/\\/g, '/');

    db.run(`UPDATE user_profiles SET cv_path = ? WHERE user_id = ?`, [filePath, req.userId], (err) => {
        if (err) return res.status(500).json({ error: 'DB Update failed' });
        res.json({ message: 'CV Uploaded', path: filePath });
    });
});
app.get('/', (req, res) => {
    res.send('Backend is running fine');
  });
  
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
