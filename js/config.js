export const MIN_SCORE = 0.30;      // lowest top similarity that counts as confident
export const MIN_MARGIN = 0.04;     // lowest gap between best and second-best node
export const MAX_REFS_PER_NODE = 50;// newest confirmed items used as references per node
export const MODEL_ID = 'Xenova/all-MiniLM-L6-v2';
export const TRANSFORMERS_URL = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.2';
export const SPEECH_LANG = 'en-IN';
export const SPEECH_LANGS = [['en-IN', 'India'], ['en-GB', 'UK'], ['en-US', 'US']];
export const COLOURS = { blue:'#0A84FF', indigo:'#5E5CE6', purple:'#BF5AF2', pink:'#FF375F',
                         red:'#FF453A', orange:'#FF9F0A', green:'#30D158', teal:'#40C8E0' };
export const STARTER_NODES = [
  { name: 'Academic', type: 'notes', colour: 'blue', icon: '🎓',
    description: 'college, studies, project work, thesis, simulations, CFD, ANSYS, lab, assignments, exams, professor, report, research paper',
    examples: ['Work on my final year project', 'Run the CFD simulation again tonight',
      'Fix the boundary conditions in the ANSYS model', 'Write the methodology chapter of the thesis',
      'Meet my supervisor about the results', 'Study for the thermodynamics exam',
      'Finish the heat transfer assignment', 'Post-process the pressure drop data in Python',
      'Check grid convergence for the microchannel model', 'Book the computer lab for Thursday',
      'Read two papers for the literature review', 'Submit the project report to the department'] },
  { name: 'Personal', type: 'notes', colour: 'green', icon: '🌿',
    description: 'myself, health, gym, sleep, habits, money, bank, errands, appointments, ideas, plans, things I need to do for me',
    examples: ['Go for a run in the morning', 'Drink more water every day', 'Get a haircut this weekend',
      'Pay my phone bill', 'Transfer money to my savings account', 'See a doctor about my back pain',
      'Clean my room', 'Do the laundry tonight', 'Wake up earlier and stop scrolling at night',
      'Renew my driving licence', 'Idea: start journaling every evening', 'Fill in the scholarship form',
      'Schedule an eye check-up at the clinic', 'Take my vitamins after breakfast'] },
  { name: 'Relationships', type: 'notes', colour: 'pink', icon: '💞',
    description: 'people in my life, partner, friends, parents, calls, messages, birthdays, gifts, conversations, feelings about someone, plans with someone',
    examples: ['Call my sister this evening', 'Text my best friend back', 'Visit grandma at the weekend',
      'Think of an anniversary gift idea for my parents', 'Ask dad how his health check went',
      'Catch up with my school friends', 'Say sorry to Aman for being rude', 'Take my parents out for dinner',
      'Wish Neha luck for her interview on Tuesday', 'Plan a weekend trip with friends',
      'Tell mom I will be home late', 'Thank my roommate for helping me move',
      'Send my cousin anniversary wishes', 'Congratulate Priya on her new job'] },
  { name: 'Shopping List', type: 'checklist', colour: 'orange', icon: '🛒',
    description: 'things to buy, groceries, milk, eggs, bread, vegetables, toiletries, order online, purchase, need to get from the shop',
    examples: ['Buy apples and bananas', 'We are out of sugar and tea', 'Get a new notebook and pens',
      'Need soap and toothpaste', 'Order a phone case from Amazon', 'Pick up bread from the bakery',
      'Groceries rice oil and salt', 'Buy a new pair of shoes', 'Get batteries for the remote',
      'Onions garlic and ginger'] }
];
