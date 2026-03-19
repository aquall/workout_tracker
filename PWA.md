Engineering Design Specification: Zero-Server Workout Tracker PWA
1. System Overview
This project is a single-page, local-first Progressive Web Application (PWA) designed exclusively for iOS Safari (via "Add to Home Screen"). The app tracks workouts, dynamically generates target weights and reps using a mathematical progression model, and visualizes progress over time.

Core Constraints:

Zero-Backend: No external databases, no APIs, no server-side logic.

Storage: 100% reliant on the browser's synchronous localStorage API.

Frameworks: Vanilla HTML5, CSS3, and ES6+ JavaScript. No build steps (e.g., Webpack, Vite) to maintain absolute simplicity. Chart.js (via CDN) is permitted for analytics.

2. Data Architecture
The entire application state will be serialized into a single JSON object and stored in localStorage under the key workoutTrackerState.

2.1 Schema Definition
The engineer should initialize the following state object if localStorage.getItem('workoutTrackerState') returns null.

{
  "userConfig": {
    "targetReps": 8,
    "progressionRate_alpha": 2.5,
    "decayGracePeriod_tau": 10,
    "decayConstant_lambda": 0.05
  },
  "exerciseDictionary": [
    { "id": "e1", "name": "Flat Barbell Press", "splitGroup": "A" },
    { "id": "e2", "name": "Barbell Squat", "splitGroup": "B" }
  ],
  "workoutHistory": [
    {
      "date": "2023-10-24T14:30:00Z",
      "splitGroup": "A",
      "sets": [
        { "exerciseId": "e1", "weight": 135, "reps": 8 }
      ]
    }
  ]
}

3. Core Algorithmic EngineThe application requires a deterministic engine to generate the next workout session.3.1 Split Alternation StateWhen the user initializes a new workout, the system must query workoutHistory.Find the most recent chronological entry.If the last splitGroup was A (e.g., Chest/Tri/Abs), the current session becomes B (e.g., Back/Bi/Legs), and vice versa.Select the subset of exercises from exerciseDictionary that map to the current split.3.2 Target Generation (Progressive Overload & Detraining)For each exercise in the current split, the system must calculate the target weight ($W_{n+1}$) for the upcoming session. The engineer must implement the following discrete step function combined with an exponential decay modifier.Let $W_n$ be the weight lifted in the last recorded session for that specific exercise, $R_{actual}$ be the reps achieved, $R_{target}$ be the global rep goal, and $\Delta t$ be the elapsed time in days since that exercise was last performed.$$W_{n+1} = \left( W_n + \alpha \max(0, R_{actual} - R_{target}) \right) e^{-\lambda \max(0, \Delta t - \tau)}$$Variables (sourced from userConfig):$\alpha$ (Progression Rate): Weight added per surplus rep.$\tau$ (Grace Period): Days elapsed before detraining decay initiates.$\lambda$ (Decay Constant): The rate at which target weight drops after $\tau$ is exceeded.Note for the engineer: Round the final calculated $W_{n+1}$ to the nearest 2.5 or 5.0 increment to match standard gym plate denominations.

4. User Interface (UI/UX) RequirementsThe UI must be highly optimized for one-handed mobile use in a gym environment. Use CSS variables for a consistent, high-contrast dark mode theme.
4.1 ViewsHome / Dashboard:Prominent "Start Workout" button.Label displaying the computed upcoming split (e.g., "Next Up: Split B").Active Workout Screen:Dynamically rendered list of exercises for the current split.Each exercise block displays the computed $W_{target}$ and $R_{target}$.Input fields of type="number" for the user to log actual weight and actual reps."Save & Complete" button that constructs the workout object, appends it to workoutHistory, updates localStorage, and routes back to Home.Analytics (Charts):A <select> dropdown populated by exerciseDictionary.A <canvas> element utilizing Chart.js to render a line graph.X-axis: Date. Y-axis: Weight logged.Settings (Data Management):Export Data: Button that serializes the current localStorage state to a .json blob and triggers a browser download.Import Data: A file input that accepts a .json file, parses it, validates the schema, and overwrites localStorage (acting as the backup/restore mechanism).

5. Implementation Milestones
Milestone 1: State Management & Scaffolding

Set up standard index.html, styles.css, and app.js.

Implement the localStorage wrapper functions (loadState(), saveState()).

Milestone 2: The Logic Engine

Write the javascript functions for split determination and implement the math formula for target generation. Write unit tests or console checks for the decay math.

Milestone 3: UI & DOM Manipulation

Implement the view-switching logic (hiding/showing <div> containers based on app state).

Wire the "Start Workout" logic to the Active Workout view.

Capture inputs and save the session to the state.

Milestone 4: Analytics Integration

Inject Chart.js via CDN.

Write the data transformation function that filters workoutHistory by a specific exerciseId and maps it to Chart.js data arrays.

Milestone 5: PWA & Deployment

Create the manifest.json (defining name, icons, display: "standalone").

Create a basic Service Worker to cache the HTML/CSS/JS files for offline execution.

Deploy to GitHub Pages.