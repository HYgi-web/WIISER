// Select elements
const darkModeToggle = document.getElementById('darkModeToggle');
const body = document.body;

// Check and apply dark mode preference from localStorage
if (localStorage.getItem('darkMode') === 'enabled') {
    body.classList.add('dark-mode');
    darkModeToggle.textContent = "☀️ Light Mode";
} else {
    darkModeToggle.textContent = "🌙 Dark Mode";
}

// Toggle dark mode on button click
darkModeToggle.addEventListener('click', () => {
    if (body.classList.contains('dark-mode')) {
        body.classList.remove('dark-mode');
        localStorage.setItem('darkMode', 'disabled');
        darkModeToggle.textContent = "🌙 Dark Mode";
    } else {
        body.classList.add('dark-mode');
        localStorage.setItem('darkMode', 'enabled');
        darkModeToggle.textContent = "☀️ Light Mode";
    }
});
