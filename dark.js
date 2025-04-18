// 🌙 Dark Mode Toggle Functionality
const darkModeToggle = document.getElementById("dark-mode-toggle");

darkModeToggle.addEventListener("click", () => {
    // Toggle the dark-mode class on the body
    document.body.classList.toggle("dark-mode");

    // Change button text based on dark mode status
    if (document.body.classList.contains("dark-mode")) {
        darkModeToggle.textContent = "☀️";
        localStorage.setItem("dark-mode", "enabled"); // Store preference
    } else {
        darkModeToggle.textContent = "🌙";
        localStorage.setItem("dark-mode", "disabled"); // Store preference
    }
});

// Ensure dark mode persists if the user previously selected dark mode
window.onload = () => {
    if (localStorage.getItem("dark-mode") === "enabled") {
        document.body.classList.add("dark-mode");
        darkModeToggle.textContent = "☀️";
    } else {
        document.body.classList.remove("dark-mode");
        darkModeToggle.textContent = "🌙";
    }
};
