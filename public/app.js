// DOM elements
const eventNameEl = document.getElementById('eventName');
const timeInfoEl = document.getElementById('timeInfo');
const noEventEl = document.getElementById('noEvent');
const overlayEl = document.getElementById('overlay');
const authEl = document.getElementById('auth');
const minutesElapsedEl = document.getElementById('minutesElapsed');
const minutesRemainingEl = document.getElementById('minutesRemaining');
const timeDotEl = document.getElementById('timeDot');
const timeLineEl = document.getElementById('timeLine');

// Session management
let currentEvent = null;
let updateInterval = null;
let authError = false;

// Format time as HH:MM in 24-hour format
function formatTime(date) {
  return new Date(date).toLocaleTimeString([], { 
    hour: '2-digit', 
    minute: '2-digit', 
    hour12: false 
  });
}

// Format current time
function getCurrentTime() {
  return formatTime(new Date());
}

// Calculate progress percentage of the current event
function calculateProgress(startTime, endTime) {
  const start = new Date(startTime).getTime();
  const end = new Date(endTime).getTime();
  const now = Date.now();
  
  // Calculate elapsed time as a percentage
  return Math.min(100, Math.max(0, ((now - start) / (end - start)) * 100));
}

// Calculate minutes elapsed and remaining
function calculateMinutes(startTime, endTime) {
  const start = new Date(startTime).getTime();
  const end = new Date(endTime).getTime();
  const now = Date.now();
  
  // Calculate minutes and round to nearest integer
  return {
    elapsed: Math.round((now - start) / (1000 * 60)),
    remaining: Math.round((end - now) / (1000 * 60))
  };
}

// Calculate the x-coordinate for the time dot based on current time of day
function calculateTimeDotX() {
  const now = new Date();
  const hours = now.getHours();
  const minutes = now.getMinutes();
  
  // Start time (6am) = 6 hours * 60 minutes = 360 minutes
  const startOfDay = 6 * 60;
  
  // End time (10pm) = 22 hours * 60 minutes = 1320 minutes
  const endOfDay = 22 * 60;
  
  // Current time in minutes since midnight
  const currentTimeInMinutes = hours * 60 + minutes;
  
  // Calculate minutes since 6am, clamped between 6am and 10pm
  const minutesSinceStart = Math.max(0, Math.min(currentTimeInMinutes - startOfDay, endOfDay - startOfDay));
  
  // Calculate as a ratio of the total day range (6am-10pm)
  const ratio = minutesSinceStart / (endOfDay - startOfDay);
  
  // Convert to window width percentage
  return ratio * 100;
}

// Update the UI with current event data
function updateEventDisplay() {
  if (!currentEvent) {
    document.body.style.backgroundColor = '#2c3e50';
    eventNameEl.style.display = 'none';
    timeInfoEl.style.display = 'none';
    noEventEl.style.display = 'block';
    overlayEl.style.height = '0%';
    minutesElapsedEl.style.display = 'none';
    minutesRemainingEl.style.display = 'none';
    timeDotEl.style.display = 'none';
    timeLineEl.style.display = 'none';
    return;
  }
  
  const { summary, start, end, calendarColor } = currentEvent;
  const progress = calculateProgress(start, end);
  const minutes = calculateMinutes(start, end);
  
  // Update UI elements
  document.body.style.backgroundColor = calendarColor || '#4285f4';
  eventNameEl.textContent = summary;
  eventNameEl.style.display = 'block';
  timeInfoEl.textContent = `${formatTime(start)} - ${formatTime(end)}`;
  timeInfoEl.style.display = 'block';
  noEventEl.style.display = 'none';
  
  // Update minutes elapsed and remaining display
  minutesElapsedEl.textContent = `${minutes.elapsed}`;
  minutesElapsedEl.style.display = 'block';
  
  minutesRemainingEl.textContent = `${minutes.remaining}`;
  minutesRemainingEl.style.display = 'block';
  
  // Update overlay height based on elapsed time percentage
  overlayEl.style.height = `${progress}%`;
  
  // Calculate positions for the time dot
  const xPosition = calculateTimeDotX();
  
  // Calculate y-position as the top of the overlay
  // The overlay grows from bottom, so its top is at (100 - height)% of viewport height
  const yPosition = (100 - progress);
  
  // Position the dot and set the current time
  timeDotEl.textContent = getCurrentTime();
  timeDotEl.style.left = `${xPosition}%`;
  timeDotEl.style.top = `${yPosition}%`;
  timeDotEl.style.display = 'block';
  
  // Calculate width for the time line
  // It should end at the left edge of the time rectangle, not its center
  // The dot is positioned with transform: translate(-50%, -50%) so we need to adjust
  const halfDotWidth = timeDotEl.offsetWidth / 2;
  const lineEndPosition = xPosition - halfDotWidth / window.innerWidth * 100;
  
  // Update the time line
  timeLineEl.style.width = `${lineEndPosition}%`;
  timeLineEl.style.top = `${yPosition}%`;
  timeLineEl.style.display = 'block';
  
  // Check if event has ended
  if (progress >= 100) {
    fetchCurrentEvent();
  }
}

// Display error message
function showError(message) {
  const errorEl = document.createElement('div');
  errorEl.style.position = 'fixed';
  errorEl.style.top = '10px';
  errorEl.style.left = '10px';
  errorEl.style.right = '10px';
  errorEl.style.backgroundColor = 'rgba(255, 0, 0, 0.2)';
  errorEl.style.color = 'white';
  errorEl.style.padding = '10px';
  errorEl.style.borderRadius = '5px';
  errorEl.style.zIndex = '100';
  errorEl.textContent = message;
  
  // Add a close button
  const closeBtn = document.createElement('button');
  closeBtn.textContent = 'x';
  closeBtn.style.float = 'right';
  closeBtn.style.background = 'none';
  closeBtn.style.border = 'none';
  closeBtn.style.color = 'white';
  closeBtn.style.cursor = 'pointer';
  closeBtn.onclick = () => errorEl.remove();
  errorEl.prepend(closeBtn);
  
  document.body.appendChild(errorEl);
}

// Check for error parameter in URL
function checkForErrors() {
  const urlParams = new URLSearchParams(window.location.search);
  const errorParam = urlParams.get('error');
  
  if (errorParam) {
    showError(`Authentication error: ${errorParam}`);
    // Remove the error parameter from URL
    urlParams.delete('error');
    const newUrl = window.location.pathname + (urlParams.toString() ? '?' + urlParams.toString() : '');
    window.history.replaceState({}, document.title, newUrl);
  }
}

// Fetch the current event from the API
async function fetchCurrentEvent() {
  try {
    console.log('Fetching current event...');
    
    const response = await fetch('/current-event', {
      credentials: 'include' // Important: include cookies in the request
    });
    
    console.log('Response status:', response.status);
    
    if (!response.ok) {
      if (response.status === 401) {
        // Auth expired, show reconnect button
        authEl.style.display = 'block';
        
        if (!authError) {
          showError('Authentication required or expired. Please connect your Google Calendar.');
          authError = true;
        }
        return;
      }
      throw new Error(`API error: ${response.status}`);
    }
    
    const data = await response.json();
    console.log('Current event data:', data.currentEvent ? 'Event found' : 'No current event');
    
    // Update global state
    currentEvent = data.currentEvent;
    
    // Update UI
    updateEventDisplay();
    
    // If authenticated, hide the auth button
    authEl.style.display = currentEvent ? 'none' : 'block';
    authError = false;
    
  } catch (error) {
    console.error('Error fetching current event:', error);
    showError(`Error: ${error.message}`);
  }
}

// Initialize the app
function init() {
  console.log('Initializing app...');
  
  // Check for errors in URL
  checkForErrors();
  
  // Initial fetch
  fetchCurrentEvent();
  
  // Set up interval for regular UI updates
  updateInterval = setInterval(() => {
    if (currentEvent) {
      updateEventDisplay();
    }
  }, 1000);
  
  // Periodically refetch event data
  setInterval(fetchCurrentEvent, 60000);
}

// Start the app when the page loads
window.addEventListener('load', init); 