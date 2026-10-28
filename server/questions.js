'use strict';

// Original general-knowledge, science/technology, and logic questions.
// Correct answers are kept on the server and never sent before a question closes.
const questions = [
  { category: 'General Knowledge', question: 'Which is the largest ocean on Earth?', options: ['Atlantic Ocean', 'Indian Ocean', 'Pacific Ocean', 'Arctic Ocean'], answer: 2, explanation: 'The Pacific Ocean is the largest and deepest ocean.' },
  { category: 'General Knowledge', question: 'How many sides does a hexagon have?', options: ['Five', 'Six', 'Seven', 'Eight'], answer: 1, explanation: 'A hexagon has six sides.' },
  { category: 'General Knowledge', question: 'Which country is famous for the ancient pyramids of Giza?', options: ['Greece', 'Mexico', 'Egypt', 'India'], answer: 2, explanation: 'The Giza pyramid complex is in Egypt.' },
  { category: 'General Knowledge', question: 'What is the currency of Japan?', options: ['Won', 'Yuan', 'Yen', 'Ringgit'], answer: 2, explanation: 'Japan uses the yen.' },
  { category: 'General Knowledge', question: 'Which instrument measures temperature?', options: ['Barometer', 'Thermometer', 'Compass', 'Altimeter'], answer: 1, explanation: 'A thermometer measures temperature.' },
  { category: 'Science & Technology', question: 'Which planet is known as the Red Planet?', options: ['Venus', 'Mars', 'Jupiter', 'Mercury'], answer: 1, explanation: 'Iron-rich dust gives Mars its reddish appearance.' },
  { category: 'Science & Technology', question: 'What does CPU stand for?', options: ['Central Processing Unit', 'Computer Power Utility', 'Core Program Upload', 'Central Program User'], answer: 0, explanation: 'CPU stands for Central Processing Unit.' },
  { category: 'Science & Technology', question: 'Which gas do plants absorb from the atmosphere for photosynthesis?', options: ['Oxygen', 'Nitrogen', 'Carbon dioxide', 'Hydrogen'], answer: 2, explanation: 'Plants use carbon dioxide, water, and light in photosynthesis.' },
  { category: 'Science & Technology', question: 'What is H₂O commonly known as?', options: ['Salt', 'Hydrogen peroxide', 'Water', 'Oxygen'], answer: 2, explanation: 'H₂O is the chemical formula for water.' },
  { category: 'Science & Technology', question: 'Which of these is a renewable energy source?', options: ['Coal', 'Natural gas', 'Solar power', 'Diesel'], answer: 2, explanation: 'Sunlight is naturally replenished.' },
  { category: 'Logic & Brain Teasers', question: 'What comes next: 2, 4, 8, 16, ...?', options: ['18', '24', '30', '32'], answer: 3, explanation: 'Each number is doubled, so the next is 32.' },
  { category: 'Logic & Brain Teasers', question: 'A dozen eggs costs ₹60. What does one egg cost?', options: ['₹4', '₹5', '₹6', '₹10'], answer: 1, explanation: '₹60 divided by 12 eggs equals ₹5 per egg.' },
  { category: 'Logic & Brain Teasers', question: 'If all Bloops are Razzies and all Razzies are Lazzies, are all Bloops Lazzies?', options: ['Yes', 'No', 'Only some', 'Cannot ever be true'], answer: 0, explanation: 'The relationship is transitive: every Bloop is a Lazzy.' },
  { category: 'Logic & Brain Teasers', question: 'Which number does not belong: 3, 5, 7, 9, 11?', options: ['3', '7', '9', '11'], answer: 2, explanation: 'Nine is not a prime number; the others are prime.' },
  { category: 'Logic & Brain Teasers', question: 'You pass the runner in second place. What place are you now in?', options: ['First', 'Second', 'Third', 'Last'], answer: 1, explanation: 'You take the position of the runner you passed: second.' }
];

module.exports = { questions };
