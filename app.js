// State Management Constants

const DEFAULT_STATE = {
    "userConfig": {
        "targetReps": 8,
        "progressionRate_alpha": 2.5,
        "decayGracePeriod_tau": 10,
        "decayConstant_lambda": 0.05
    },
    "exerciseDictionary": [
        // Split A - Upper
        { "id": "a_u1", "name": "Barbell Flat Press", "splitGroup": "A", "category": "upper" },
        { "id": "a_u2", "name": "Dumbbell Flat Press", "splitGroup": "A", "category": "upper" },
        { "id": "a_u3", "name": "Dumbbell Incline Press", "splitGroup": "A", "category": "upper" },
        { "id": "a_u4", "name": "Cable Pec Flys", "splitGroup": "A", "category": "upper" },
        { "id": "a_u5", "name": "Tricep Dips", "splitGroup": "A", "category": "upper", "repsOnly": true },
        // Split A - Lower/Abs
        { "id": "a_l1", "name": "Squats", "splitGroup": "A", "category": "lower/abs" },
        { "id": "a_l2", "name": "Deadlifts", "splitGroup": "A", "category": "lower/abs" },
        { "id": "a_l3", "name": "Lunge Squats", "splitGroup": "A", "category": "lower/abs" },

        // Split B - Upper
        { "id": "b_u1", "name": "Pull Ups", "splitGroup": "B", "category": "upper", "repsOnly": true },
        { "id": "b_u2", "name": "Forearm Cable Curls", "splitGroup": "B", "category": "upper" },
        { "id": "b_u3", "name": "Dumbbell Shoulder Flys", "splitGroup": "B", "category": "upper" },
        { "id": "b_u4", "name": "Barbell Curls", "splitGroup": "B", "category": "upper" },
        // Split B - Lower/Abs (Various ab workouts)
        { "id": "b_l1", "name": "Crunches", "splitGroup": "B", "category": "lower/abs", "repsOnly": true },
        { "id": "b_l2", "name": "Hanging Leg Raises", "splitGroup": "B", "category": "lower/abs", "repsOnly": true },
        { "id": "b_l3", "name": "Planks", "splitGroup": "B", "category": "lower/abs", "repsOnly": true },
        { "id": "b_l4", "name": "Russian Twists", "splitGroup": "B", "category": "lower/abs", "repsOnly": true }
    ],
    "workoutHistory": []
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
            const parsed = JSON.parse(storedState);
            // Overwrite locally stored dictionary with the latest default to ensure app updates apply
            parsed.exerciseDictionary = DEFAULT_STATE.exerciseDictionary;
            return parsed;
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
    const splitEx = dictionary.filter(ex => ex.splitGroup === splitGroup);

    // Group by category
    const upper = splitEx.filter(ex => ex.category === 'upper');
    const lowerAbs = splitEx.filter(ex => ex.category === 'lower/abs');

    // Shuffle helper function
    const shuffle = array => [...array].sort(() => 0.5 - Math.random());

    // Select 3 random upper and 2 random lower/abs
    const selectedUpper = shuffle(upper).slice(0, 3);
    const selectedLowerAbs = shuffle(lowerAbs).slice(0, 2);

    return [...selectedUpper, ...selectedLowerAbs];
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

function renderExerciseCard(ex, state, container) {
    const targetReps = state.userConfig.targetReps;
    let weightHtml = '';
    let targetText = `Target: ${targetReps} reps`;

    if (!ex.repsOnly) {
        const targetWeight = calculateTargetWeight(ex.id, state) || 45; // Default to bar
        targetText = `Target: ${Math.round(targetWeight * 10) / 10} lbs × ${targetReps}`;
        weightHtml = `
            <div class="input-field">
                <label>Weight (lbs)</label>
                <input type="number" class="input-weight" data-exercise-id="${ex.id}" placeholder="${Math.round(targetWeight * 10) / 10}" value="${Math.round(targetWeight * 10) / 10}" step="2.5">
            </div>
        `;
    }

    const card = document.createElement('div');
    card.className = 'exercise-card';
    card.innerHTML = `
        <div class="exercise-header">
            <div style="display: flex; flex-direction: column;">
                <span style="font-weight: bold; font-size: 1.1em;">${ex.name}</span>
                <span class="target-badge" style="margin-top: 4px;">${targetText}</span>
            </div>
            <button class="remove-btn" aria-label="Remove exercise">×</button>
        </div>
        <div class="input-group">
            ${weightHtml}
            <div class="input-field">
                <label>Reps</label>
                <input type="number" class="input-reps" data-exercise-id="${ex.id}" placeholder="${targetReps}" value="${targetReps}" step="1">
            </div>
        </div>
    `;

    // Add remove functionality
    card.querySelector('.remove-btn').addEventListener('click', () => {
        card.remove();
    });

    container.appendChild(card);
}

function startWorkout(state) {
    const exercises = getExercisesForSplit(state.exerciseDictionary, currentSplit);
    const container = document.getElementById('workout-container');

    // Clear previous contents
    container.innerHTML = '';

    exercises.forEach(ex => {
        renderExerciseCard(ex, state, container);
    });

    // Populate Add Exercise dropdown
    const addSelect = document.getElementById('workout-add-select');
    if (addSelect) {
        addSelect.innerHTML = '';
        state.exerciseDictionary.forEach(dictEx => {
            const option = document.createElement('option');
            option.value = dictEx.id;
            option.textContent = dictEx.name;
            addSelect.appendChild(option);
        });
    }

    switchView('view-workout');
}

function finishWorkout(state) {
    const repsInputs = document.querySelectorAll('.input-reps');
    const sets = [];

    repsInputs.forEach(repInput => {
        const exerciseId = repInput.getAttribute('data-exercise-id');
        const reps = parseInt(repInput.value, 10);

        const weightInput = document.querySelector(`.input-weight[data-exercise-id="${exerciseId}"]`);
        let weight = null;
        if (weightInput && weightInput.value) {
            weight = parseFloat(weightInput.value);
        }

        if (!isNaN(reps)) {
            const setObj = { exerciseId: exerciseId, reps: reps };
            if (weight !== null && !isNaN(weight)) {
                setObj.weight = weight;
            }
            sets.push(setObj);
        }
    });

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
    if (typeof Chart === 'undefined') return;

    const ctx = document.getElementById('progress-chart').getContext('2d');

    const dataPointsWeight = [];
    const dataPointsReps = [];
    const labels = [];

    // Check if exercise is reps only
    const exerciseDef = state.exerciseDictionary.find(e => e.id === exerciseId);
    const isRepsOnly = exerciseDef ? !!exerciseDef.repsOnly : false;

    state.workoutHistory.forEach(workout => {
        const set = workout.sets.find(s => s.exerciseId === exerciseId);
        if (set) {
            const dateObj = new Date(workout.date);
            labels.push(`${dateObj.getMonth() + 1}/${dateObj.getDate()}`);
            if (set.weight !== undefined) dataPointsWeight.push(set.weight);
            if (set.reps !== undefined) dataPointsReps.push(set.reps);
        }
    });

    if (chartInstance) {
        chartInstance.destroy();
    }

    const datasets = [];

    // Y1 - Weight (Only if not repsOnly)
    if (!isRepsOnly) {
        datasets.push({
            label: 'Weight (lbs)',
            data: dataPointsWeight,
            borderColor: '#f93d3dff',
            backgroundColor: 'rgba(249, 57, 57, 0.54)',
            borderWidth: 2,
            tension: 0.3,
            fill: true,
            yAxisID: 'y'
        });
    }

    // Y2 - Reps
    datasets.push({
        label: 'Reps',
        data: dataPointsReps,
        borderColor: '#5c81fbff', // Using the primary color for reps
        backgroundColor: 'rgba(108, 157, 255, 0.2)',
        borderWidth: 2,
        borderDash: isRepsOnly ? [] : [5, 5],
        tension: 0.3,
        fill: isRepsOnly, // Only fill if it's the primary graph
        yAxisID: isRepsOnly ? 'y' : 'y1'
    });

    const scales = {
        y: {
            type: 'linear',
            display: true,
            position: 'left',
            beginAtZero: false,
            title: { display: true, text: isRepsOnly ? 'Reps' : 'Weight (lbs)' }
        }
    };

    if (!isRepsOnly) {
        scales.y1 = {
            type: 'linear',
            display: true,
            position: 'right',
            beginAtZero: true,
            grid: { drawOnChartArea: false },
            title: { display: true, text: 'Reps' }
        };
    }

    chartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: scales
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

    document.getElementById('btn-add-exercise').addEventListener('click', () => {
        const selectElement = document.getElementById('workout-add-select');
        const selectedId = selectElement.value;
        const currentState = loadState();
        const ex = currentState.exerciseDictionary.find(e => e.id === selectedId);

        if (ex) {
            const container = document.getElementById('workout-container');
            renderExerciseCard(ex, currentState, container);
        }
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
