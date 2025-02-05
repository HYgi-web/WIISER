const express = require('express');
const bodyParser = require('body-parser');
const app = express();

app.use(bodyParser.json());

app.post('/submit-feedback', (req, res) => {
  const feedback = req.body;
  console.log('Feedback received:', feedback);
  res.send('Feedback submitted successfully!');
});

app.listen(3000, () => console.log('Server running on http://localhost:3000'));
document.getElementById('feedback-form').addEventListener('submit', async function(event) {
    event.preventDefault();
  
    const formData = {
      name: document.getElementById('name').value,
      email: document.getElementById('email').value,
      feedback: document.getElementById('feedback').value,
      rating: document.getElementById('rating').value,
    };
  
    try {
      const response = await fetch('/submit-feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      const result = await response.text();
      alert(result);
    } catch (error) {
      console.error('Error submitting feedback:', error);
      alert('Failed to submit feedback.');
    }
  });
  