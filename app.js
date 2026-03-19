// State Management Constants

const DEFAULT_STATE = {
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
};

const STORAGE_KEY = 'workoutTrackerState';

/**
 * Loads the application state from localStorage.
 * If no state exists or an error occurs, returns the default state and saves it.
 * @returns {Object} The current application state.
 */
function loadState() {
    try {
        const storedState = localStorage.getItem(STORAGE_KEY);
        if (storedState) {
            return JSON.parse(storedState);
        }
    } catch (error) {
        console.error("Error loading state from localStorage:", error);
    }

    // Fallback to default state if null or on error
    saveState(DEFAULT_STATE);
    return JSON.parse(JSON.stringify(DEFAULT_STATE)); // Return a deep copy to avoid mutations to the constant
}

/**
 * Saves the given application state to localStorage.
 * @param {Object} state - The state object to save.
 */
function saveState(state) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
        console.error("Error saving state to localStorage:", error);
    }
}

// --- Logic Engine: Split Determination ---

/**
 * Gets the most recent workout from the history.
 * @param {Array} history - The workout history array.
 * @returns {Object|null} The most recent workout object or null if history is empty.
 */
function getLastWorkout(history) {
    if (!history || history.length === 0) return null;
    return history[history.length - 1]; // Assume history is chronologically appended
}

/**
 * Determines the next split group based on the last workout.
 * Defaults to "A" if no history exists.
 * @param {Object|null} lastWorkout - The most recent workout object.
 * @returns {string} The next split group ("A" or "B").
 */
function getNextSplitGroup(lastWorkout) {
    if (!lastWorkout) return "A";
    return lastWorkout.splitGroup === "A" ? "B" : "A";
}

/**
 * Retrieves exercises mapped to a specific split group.
 * @param {Array} dictionary - The exercise dictionary array.
 * @param {string} splitGroup - The target split group ("A" or "B").
 * @returns {Array} Array of exercise objects belonging to the split.
 */
function getExercisesForSplit(dictionary, splitGroup) {
    return dictionary.filter(ex => ex.splitGroup === splitGroup);
}

// --- Logic Engine: Target Generation ---

/**
 * Calculates the number of days elapsed between a past date and now.
 * @param {string} pastDateString - ISO 8601 date string.
 * @param {string} [nowDateString] - Optional current date string for testing.
 * @returns {number} Days elapsed (\Delta t).
 */
function calculateDaysElapsed(pastDateString, nowDateString = new Date().toISOString()) {
    const past = new Date(pastDateString);
    const now = new Date(nowDateString);
    const diffMs = now - past;
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    return Math.max(0, diffDays); // Ensure no negative days if dates are weird
}

/**
 * Calculates the target weight for the next session using the progressive overload with decay formula:
 * W_{n+1} = (W_n + \alpha * max(0, R_{actual} - R_{target})) * e^{-\lambda * max(0, \Delta t - \tau)}
 * 
 * @param {string} exerciseId - The ID of the exercise to calculate for.
 * @param {Object} state - The current application state.
 * @param {string} [nowDateString] - Optional current date string for calculating elapsed time (used for testing).
 * @returns {number|null} The calculated target weight, rounded to nearest 2.5, or null if no history exists.
 */
function calculateTargetWeight(exerciseId, state, nowDateString = new Date().toISOString()) {
    // 1. Find the most recent performance for this exercise in history
    let lastPerformanceDate = null;
    let W_n = null; // Last weight
    let R_actual = null; // Last reps achieved

    // Iterate backwards through history to find the most recent set
    for (let i = state.workoutHistory.length - 1; i >= 0; i--) {
        const workout = state.workoutHistory[i];
        const set = workout.sets.find(s => s.exerciseId === exerciseId);
        if (set) {
            W_n = set.weight;
            R_actual = set.reps;
            lastPerformanceDate = workout.date;
            break;
        }
    }

    // If we have no history for this exercise, we can't calculate a target
    if (W_n === null) return null;

    // 2. Calculate \Delta t
    const delta_t = calculateDaysElapsed(lastPerformanceDate, nowDateString);

    // 3. Extract user variables
    const alpha = state.userConfig.progressionRate_alpha;
    const tau = state.userConfig.decayGracePeriod_tau;
    const lambda = state.userConfig.decayConstant_lambda;
    const R_target = state.userConfig.targetReps;

    // 4. Evaluate the formula
    const progressiveOverload = W_n + alpha * Math.max(0, R_actual - R_target);
    const exponentialDecay = Math.exp(-lambda * Math.max(0, delta_t - tau));

    let W_next = progressiveOverload * exponentialDecay;

    // 5. Round to nearest 2.5 increment
    return Math.round(W_next / 2.5) * 2.5;
}

// --- Testing ---

/**
 * Runs temporary sanity checks in the console.
 * @param {Object} state - Application state.
 */
function runLogicTests(state) {
    console.log("--- Running Logic Engine Tests ---");

    const lastWorkout = getLastWorkout(state.workoutHistory);
    const nextSplit = getNextSplitGroup(lastWorkout);
    console.log(`Last Split: ${lastWorkout ? lastWorkout.splitGroup : 'None'} -> Next Split: ${nextSplit}`);

    const exercisesForA = getExercisesForSplit(state.exerciseDictionary, "A");
    console.log(`Exercises for Split A:`, exercisesForA.map(e => e.name));

    // Test Target Weight generation for "Flat Barbell Press" (e1)
    // History has it at 135 for 8 reps (equals target) on 2023-10-24
    const testDateRecent = new Date("2023-10-25T14:30:00Z").toISOString(); // 1 day elapsed
    const testDateFar = new Date("2023-11-24T14:30:00Z").toISOString(); // 31 days elapsed (triggers decay)

    console.log(`Test Target Weight (1 day elapsed, 8 reps achieved):`, calculateTargetWeight("e1", state, testDateRecent)); // Should be 135
    console.log(`Test Target Weight (31 days elapsed, 8 reps achieved):`, calculateTargetWeight("e1", state, testDateFar)); // Should be lower than 135
    console.log("----------------------------------");
}

// --- UI & DOM Manipulation ---

let currentSplit = "A"; // Track the active split in memory during the workout

function switchView(viewId) {
    document.querySelectorAll('.view').forEach(el => el.classList.add('hidden'));
    document.getElementById(viewId).classList.remove('hidden');
}

function renderHome(state) {
    const lastWorkout = getLastWorkout(state.workoutHistory);
    currentSplit = getNextSplitGroup(lastWorkout);

    document.getElementById('next-split-label').innerText = `Next Up: Split ${currentSplit}`;
}

function startWorkout(state) {
    const exercises = getExercisesForSplit(state.exerciseDictionary, currentSplit);
    const container = document.getElementById('workout-container');

    // Clear previous contents
    container.innerHTML = '';

    exercises.forEach(ex => {
        const targetWeight = calculateTargetWeight(ex.id, state) || 45; // Default to bar if no history
        const targetReps = state.userConfig.targetReps;

        const card = document.createElement('div');
        card.className = 'exercise-card';
        card.innerHTML = `
            <div class="exercise-header">
                <span>${ex.name}</span>
                <span class="target-badge">Target: ${targetWeight} lbs × ${targetReps}</span>
            </div>
            <div class="input-group">
                <div class="input-field">
                    <label>Weight (lbs)</label>
                    <input type="number" class="input-weight" data-exercise-id="${ex.id}" placeholder="${targetWeight}" value="${targetWeight}" step="2.5">
                </div>
                <div class="input-field">
                    <label>Reps</label>
                    <input type="number" class="input-reps" data-exercise-id="${ex.id}" placeholder="${targetReps}" value="${targetReps}" step="1">
                </div>
            </div>
        `;
        container.appendChild(card);
    });

    switchView('view-workout');
}

function finishWorkout(state) {
    const weightInputs = document.querySelectorAll('.input-weight');
    const repsInputs = document.querySelectorAll('.input-reps');

    const sets = [];

    for (let i = 0; i < weightInputs.length; i++) {
        const exerciseId = weightInputs[i].getAttribute('data-exercise-id');
        const weight = parseFloat(weightInputs[i].value);
        const reps = parseInt(repsInputs[i].value, 10);

        if (!isNaN(weight) && !isNaN(reps)) {
            sets.push({
                exerciseId: exerciseId,
                weight: weight,
                reps: reps
            });
        }
    }

    if (sets.length > 0) {
        const newWorkout = {
            date: new Date().toISOString(),
            splitGroup: currentSplit,
            sets: sets
        };

        state.workoutHistory.push(newWorkout);
        saveState(state);
    }

    renderHome(state);
    switchView('view-home');
}

// --- Analytics Integration ---

let chartInstance = null;

function renderAnalytics(state) {
    const select = document.getElementById('exercise-select');
    select.innerHTML = ''; // Clear previous options

    state.exerciseDictionary.forEach(ex => {
        const option = document.createElement('option');
        option.value = ex.id;
        option.textContent = ex.name;
        select.appendChild(option);
    });

    // Listen for changes
    select.removeEventListener('change', handleChartChange); // Avoid duplicate listeners
    select.addEventListener('change', handleChartChange);

    // Render initial chart if exercises exist
    if (state.exerciseDictionary.length > 0) {
        updateChart(state.exerciseDictionary[0].id, state);
    }
}

function handleChartChange(e) {
    const appState = loadState(); // Fetch fresh state
    updateChart(e.target.value, appState);
}

function updateChart(exerciseId, state) {
    // Only attempt to render if Chart.js is loaded
    if (typeof Chart === 'undefined') return;

    const ctx = document.getElementById('progress-chart').getContext('2d');

    // Filter history for the specific exercise
    const dataPoints = [];
    const labels = [];

    state.workoutHistory.forEach(workout => {
        const set = workout.sets.find(s => s.exerciseId === exerciseId);
        if (set) {
            // Format Date for X axis
            const dateObj = new Date(workout.date);
            labels.push(`${dateObj.getMonth() + 1}/${dateObj.getDate()}`);
            dataPoints.push(set.weight);
        }
    });

    if (chartInstance) {
        chartInstance.destroy();
    }

    chartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Weight (lbs)',
                data: dataPoints,
                borderColor: '#f93d3dff',
                backgroundColor: 'rgba(249, 57, 57, 0.54)',
                borderWidth: 2,
                tension: 0.3,
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: false
                }
            }
        }
    });
}

// --- Data Management (Settings) ---

function exportData(state) {
    const dataStr = JSON.stringify(state, null, 2);
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = "workoutTrackerData.json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function importData(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (e) {
        try {
            const importedState = JSON.parse(e.target.result);
            if (importedState && importedState.workoutHistory) {
                saveState(importedState);
                alert('Data successfully imported!');
                location.reload(); // Reload app to ensure clean state
            } else {
                throw new Error("Invalid schema");
            }
        } catch (error) {
            alert('Failed to import data. Please ensure it is a valid workout tracker JSON file.');
            console.error("Import error:", error);
        }
    };
    reader.readAsText(file);
}

// Application Initialization
document.addEventListener('DOMContentLoaded', () => {
    // Load state on startup
    const appState = loadState();

    // Initialize UI
    renderHome(appState);

    // Setup Application Event Listeners
    document.getElementById('btn-start-workout').addEventListener('click', () => {
        startWorkout(loadState()); // Fresh state before workout
    });

    document.getElementById('btn-finish-workout').addEventListener('click', () => {
        finishWorkout(loadState());
    });

    // Setup Navigation Tabs
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            // Update active styling
            document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active-nav'));
            e.target.classList.add('active-nav');

            // Switch View
            const targetView = e.target.getAttribute('data-target');
            switchView(targetView);

            // Render Analytics explicitly when clicked to ensure accurate latest data
            if (targetView === 'view-analytics') {
                renderAnalytics(loadState());
            }
        });
    });

    // Settings Event Listeners
    document.getElementById('btn-export-data').addEventListener('click', () => {
        exportData(loadState());
    });

    document.getElementById('input-import-data').addEventListener('change', importData);
});
