// Dashboard Logic
// Handles profile data collection, persistence, and visualization

// Mock Data / State
let profileData = {
    fullName: '',
    cvFile: null, // Just storing name for mock
    semesters: [], // { num: 1, cgpa: 8.5 }
    experiences: [] // { id: 1, type: 'internship', title: '...', desc: '...' }
};

// Keys for LocalStorage
const STORAGE_KEY = 'wiiser_student_profile';

document.addEventListener('DOMContentLoaded', () => {
    loadProfileData();
    renderUI();
});

function loadProfileData() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
        profileData = JSON.parse(saved);

        // Populate Inputs
        document.getElementById('inp-fullname').value = profileData.fullName || '';
        if (profileData.cvFile) {
            document.getElementById('file-name-display').innerText = profileData.cvFile;
            document.getElementById('cv-download-section').style.display = 'block';
        }
    } else {
        // Initialize default semesters if empty
        if (!profileData.semesters.length) {
            profileData.semesters = [{ num: 1, cgpa: '' }];
        }
    }
}

function saveProfileData() {
    // Gather personal info
    profileData.fullName = document.getElementById('inp-fullname').value;

    // Semesters and Experience are updated in real-time in the state object, 
    // but let's make sure we capture the current input values for semesters
    const semInputs = document.querySelectorAll('.sem-cgpa-input');
    profileData.semesters = Array.from(semInputs).map((input, idx) => ({
        num: idx + 1,
        cgpa: input.value
    }));

    // Persist
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profileData));

    // Refresh Visualization
    renderUI();

    // Feedback
    alert('Profile saved and Academic Journey generated!');
    document.getElementById('journey-display').scrollIntoView({ behavior: 'smooth' });
}

// --- UI Rendering ---

function renderUI() {
    renderHeader();
    renderSemesterInputs();
    renderExperienceList();

    // Journey Visualization
    renderStats();
    renderTimeline();
    renderChart();
}

function renderHeader() {
    const name = profileData.fullName || 'Student';
    document.getElementById('welcome-msg').innerText = `Welcome, ${name}!`;
    document.getElementById('disp-name').innerText = name;
}

// --- Semester Inputs ---

function renderSemesterInputs() {
    const container = document.getElementById('semester-grid');
    container.innerHTML = '';

    profileData.semesters.forEach((sem, index) => {
        const div = document.createElement('div');
        div.className = 'semester-item';
        div.innerHTML = `
            <label style="font-size:0.8rem; font-weight:600; color:var(--text-secondary);">Semester ${index + 1}</label>
            <input type="number" step="0.01" min="0" max="10" 
                class="form-input sem-cgpa-input" 
                value="${sem.cgpa}" 
                placeholder="0.00"
                style="padding: 6px; font-size: 0.9rem;">
        `;
        container.appendChild(div);
    });
}

function addSemesterField() {
    profileData.semesters.push({ num: profileData.semesters.length + 1, cgpa: '' });
    renderSemesterInputs();
}

// --- Experience Inputs ---

function addExperienceEntry() {
    const type = document.getElementById('entry-type').value;
    const title = document.getElementById('entry-title').value;
    const desc = document.getElementById('entry-desc').value;

    if (!title) {
        alert('Please enter a Title or Role.');
        return;
    }

    const newEntry = {
        id: Date.now(),
        type,
        title,
        desc,
        date: new Date().toLocaleDateString() // Simplification
    };

    profileData.experiences.push(newEntry);

    // Clear inputs
    document.getElementById('entry-title').value = '';
    document.getElementById('entry-desc').value = '';

    renderExperienceList();
}

function deleteExperience(id) {
    profileData.experiences = profileData.experiences.filter(exp => exp.id !== id);
    renderExperienceList();
}

function renderExperienceList() {
    const container = document.getElementById('experience-list');
    container.innerHTML = '';

    profileData.experiences.slice().reverse().forEach(exp => {
        const div = document.createElement('div');
        div.style.cssText = 'background: white; padding: 12px; border-radius: 8px; border: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: start;';

        // Badge color mapping
        const badgeColors = {
            'internship': 'bg-blue-100 text-blue-800', // using raw style below instead
            'project': '#f0fdf4',
            'research': '#faf5ff',
            'cocurricular': '#fff7ed'
        };

        // Simple mapping for display
        const displayType = exp.type.charAt(0).toUpperCase() + exp.type.slice(1);

        div.innerHTML = `
            <div>
                <div style="display:flex; align-items:center; gap:8px; margin-bottom:4px;">
                    <span style="font-weight:700; font-size:0.95rem;">${exp.title}</span>
                    <span style="font-size:0.7rem; padding:2px 6px; border-radius:4px; background:#f1f5f9; color:#475569; text-transform:uppercase;">${displayType}</span>
                </div>
                <div style="font-size:0.85rem; color:#64748b;">${exp.desc}</div>
            </div>
            <button onclick="deleteExperience(${exp.id})" style="color:#ef4444; background:none; border:none; cursor:pointer;">
                <i class="fas fa-trash"></i>
            </button>
        `;
        container.appendChild(div);
    });
}

// --- File Handling ---
function handleFileSelect(input) {
    if (input.files.length > 0) {
        const file = input.files[0];
        document.getElementById('file-name-display').innerText = file.name;
        // In a real app, we'd upload this. Here we just store the name.
        profileData.cvFile = file.name;
    }
}


// --- Visualization Rendering ---

function renderStats() {
    // Filter valid CGPAs
    const validSems = profileData.semesters.filter(s => s.cgpa !== '' && !isNaN(s.cgpa));
    const totalSemesters = validSems.length;

    let avgCgpa = 0;
    if (totalSemesters > 0) {
        const sum = validSems.reduce((acc, curr) => acc + parseFloat(curr.cgpa), 0);
        avgCgpa = (sum / totalSemesters).toFixed(2);
    }

    document.getElementById('disp-cgpa').innerText = avgCgpa || '--';
    document.getElementById('disp-semesters').innerText = totalSemesters;
}

function renderTimeline() {
    const container = document.getElementById('journey-timeline');

    if (profileData.experiences.length === 0) {
        container.innerHTML = '<div style="text-align: center; padding: 40px; color: var(--text-secondary);"><p>No journey data yet. Update your profile below to generate your journey.</p></div>';
        return;
    }

    container.innerHTML = '';

    // Sort experiences? 
    // They don't have dates really inputs, but let's assume entry order or user managed.
    // Let's just reverse them so newest first (top of timeline).
    const list = profileData.experiences.slice().reverse();

    list.forEach(exp => {
        const div = document.createElement('div');
        div.className = 'timeline-item';

        const badgeClass = `badge-${exp.type}`; // defined in CSS

        div.innerHTML = `
            <div class="timeline-dot"></div>
            <div class="timeline-content">
                <span class="timeline-badge ${badgeClass}">${exp.type}</span>
                <h4 style="font-size: 1.1rem; font-weight: 700; margin-bottom: 8px;">${exp.title}</h4>
                <p style="color: var(--text-secondary); font-size: 0.95rem; line-height: 1.5;">${exp.desc}</p>
            </div>
        `;
        container.appendChild(div);
    });
}

// --- Chart JS ---
let myChart = null;

function renderChart() {
    const ctx = document.getElementById('cgpaChart').getContext('2d');

    // Prepare Data
    const labels = [];
    const dataPoints = [];

    profileData.semesters.forEach(sem => {
        if (sem.cgpa !== '' && !isNaN(sem.cgpa)) {
            labels.push(`Sem ${sem.num}`);
            dataPoints.push(parseFloat(sem.cgpa));
        }
    });

    if (myChart) {
        myChart.destroy();
    }

    // Gradient Fill
    const gradient = ctx.createLinearGradient(0, 0, 0, 400);
    gradient.addColorStop(0, 'rgba(65, 105, 225, 0.5)');
    gradient.addColorStop(1, 'rgba(65, 105, 225, 0.0)');

    myChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'CGPA',
                data: dataPoints,
                borderColor: '#4169e1',
                backgroundColor: gradient,
                borderWidth: 3,
                tension: 0.4, // Smooths the curve
                fill: true,
                pointBackgroundColor: '#ffffff',
                pointBorderColor: '#4169e1',
                pointBorderWidth: 3,
                pointRadius: 6,
                pointHoverRadius: 8
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    backgroundColor: 'rgba(255, 255, 255, 0.9)',
                    titleColor: '#1e293b',
                    bodyColor: '#475569',
                    borderColor: '#e2e8f0',
                    borderWidth: 1,
                    padding: 10,
                    callbacks: {
                        label: function (context) {
                            return 'CGPA: ' + context.parsed.y;
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: false,
                    min: 0,
                    max: 10,
                    grid: {
                        color: 'rgba(0, 0, 0, 0.05)'
                    },
                    ticks: {
                        font: { family: 'Inter' }
                    }
                },
                x: {
                    grid: { display: false },
                    ticks: {
                        font: { family: 'Inter' }
                    }
                }
            },
            interaction: {
                mode: 'nearest',
                axis: 'x',
                intersect: false
            }
        }
    });
}
