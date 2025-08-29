/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import {GoogleGenAI} from '@google/genai';

// --- Interfaces & Types ---
interface Flashcard {
  term: string;
  definition: string;
}

interface StudySet {
  topic: string;
  cards: Flashcard[];
}

type ViewState = 'GENERATION' | 'PRE_STUDY' | 'STUDY' | 'COMPLETE';

// --- DOM Elements ---
const generationContainer = document.getElementById('generationContainer') as HTMLDivElement;
const preStudyContainer = document.getElementById('preStudyContainer') as HTMLDivElement;
const studyContainer = document.getElementById('studyContainer') as HTMLDivElement;
const sessionCompleteContainer = document.getElementById('sessionCompleteContainer') as HTMLDivElement;

const flashcardsContainer = document.getElementById('flashcardsContainer') as HTMLDivElement;
const errorMessage = document.getElementById('errorMessage') as HTMLDivElement;
const timerDisplay = document.getElementById('timerDisplay') as HTMLDivElement;
const preStudyTopic = document.getElementById('preStudyTopic') as HTMLHeadingElement;

const topicInput = document.getElementById('topicInput') as HTMLTextAreaElement;
const timerInput = document.getElementById('timerInput') as HTMLInputElement;
const fileInput = document.getElementById('fileInput') as HTMLInputElement;

const generateButton = document.getElementById('generateButton') as HTMLButtonElement;
const importButton = document.getElementById('importButton') as HTMLButtonElement;
const exportButton = document.getElementById('exportButton') as HTMLButtonElement;
const startButton = document.getElementById('startButton') as HTMLButtonElement;
const stopButton = document.getElementById('stopButton') as HTMLButtonElement;
const generateNewButton = document.getElementById('generateNewButton') as HTMLButtonElement;
const generateNewButton2 = document.getElementById('generateNewButton2') as HTMLButtonElement;
const studyAgainButton = document.getElementById('studyAgainButton') as HTMLButtonElement;

// --- App State ---
let activeStudySet: StudySet | null = null;
let timerInterval: number | null = null;

const ai = new GoogleGenAI({apiKey: process.env.API_KEY});

// --- State Management ---
function setViewState(view: ViewState) {
  const allContainers = [generationContainer, preStudyContainer, studyContainer, sessionCompleteContainer];
  allContainers.forEach(container => container.classList.add('hidden'));

  switch (view) {
    case 'GENERATION':
      generationContainer.classList.remove('hidden'); 
      break;
    case 'PRE_STUDY':
      if (activeStudySet) {
        preStudyTopic.textContent = `Study: ${activeStudySet.topic}`;
      }
      preStudyContainer.classList.remove('hidden'); 
      break;
    case 'STUDY': studyContainer.classList.remove('hidden'); break;
    case 'COMPLETE': sessionCompleteContainer.classList.remove('hidden'); break;
  }
}

// --- UI Messaging ---
function setErrorMessage(message: string, isError: boolean = false) {
    errorMessage.textContent = message;
    errorMessage.classList.toggle('is-error', isError);
}

// --- Timer Logic ---
function startTimer(durationMinutes: number) {
  if (timerInterval) clearInterval(timerInterval);
  let totalSeconds = durationMinutes * 60;

  const updateDisplay = () => {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    timerDisplay.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  };

  updateDisplay(); // Initial display

  timerInterval = window.setInterval(() => {
    totalSeconds--;
    if (totalSeconds >= 0) {
      updateDisplay();
    } else {
      if (timerInterval) clearInterval(timerInterval);
      setViewState('COMPLETE');
    }
  }, 1000);
}

// --- Flashcard Rendering ---
function renderFlashcards() {
  flashcardsContainer.textContent = ''; // Clear previous cards
  if (!activeStudySet) return;

  const studyMode = (document.querySelector('input[name="studyMode"]:checked') as HTMLInputElement).value;

  activeStudySet.cards.forEach((flashcard, index) => {
    const cardDiv = document.createElement('div');
    cardDiv.classList.add('flashcard');
    cardDiv.dataset['index'] = index.toString();

    const cardInner = document.createElement('div');
    cardInner.classList.add('flashcard-inner');

    const cardFront = document.createElement('div');
    cardFront.classList.add('flashcard-front');
    const frontContent = document.createElement('div');
    frontContent.textContent = studyMode === 'termFirst' ? flashcard.term : flashcard.definition;
    frontContent.classList.add(studyMode === 'termFirst' ? 'term' : 'definition');
    cardFront.appendChild(frontContent);
    
    const cardBack = document.createElement('div');
    cardBack.classList.add('flashcard-back');
    const backContent = document.createElement('div');
    backContent.textContent = studyMode === 'termFirst' ? flashcard.definition : flashcard.term;
    backContent.classList.add(studyMode === 'termFirst' ? 'definition' : 'term');
    cardBack.appendChild(backContent);

    cardInner.appendChild(cardFront);
    cardInner.appendChild(cardBack);
    cardDiv.appendChild(cardInner);
    flashcardsContainer.appendChild(cardDiv);

    cardDiv.addEventListener('click', () => {
      cardDiv.classList.toggle('flipped');
    });
  });
}

// --- Import/Export Logic ---
function handleExport() {
  if (!activeStudySet || activeStudySet.cards.length === 0) {
    setErrorMessage('There are no flashcards to export.', true);
    return;
  }
  
  const content = activeStudySet.cards
    .map(card => `${card.term}: ${card.definition}`)
    .join('\n');
    
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  
  const fileName = `${activeStudySet.topic.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.txt`;
  a.download = fileName;
  
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function handleImport(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    const text = e.target?.result as string;
    if (!text) {
      setErrorMessage('File is empty or could not be read.', true);
      return;
    }
    
    const parsedCards: Flashcard[] = text
      .split('\n')
      .map((line) => {
        const parts = line.split(':');
        if (parts.length >= 2 && parts[0].trim()) {
          const term = parts[0].trim();
          const definition = parts.slice(1).join(':').trim();
          if (definition) {
            return { term, definition };
          }
        }
        return null;
      })
      .filter((card): card is Flashcard => card !== null);
      
    if (parsedCards.length > 0) {
      const topic = file.name.replace(/\.[^/.]+$/, "") || "Imported Set";
      activeStudySet = { topic, cards: parsedCards };
      setErrorMessage('');
      setViewState('PRE_STUDY');
    } else {
      setErrorMessage("Could not parse flashcards from the file. Ensure the format is 'Term: Definition' per line.", true);
    }
  };
  
  reader.onerror = () => {
     setErrorMessage('Error reading file.', true);
  };
  
  reader.readAsText(file);
  input.value = ''; // Reset input to allow re-uploading the same file
}

// --- Event Listeners ---
generateButton.addEventListener('click', async () => {
  const topic = topicInput.value.trim();
  if (!topic) {
    setErrorMessage('Please enter a topic or some terms and definitions.', true);
    return;
  }

  setErrorMessage('Generating flashcards...');
  generateButton.disabled = true;
  importButton.disabled = true;

  try {
    const prompt = `Generate a list of flashcards for the topic of "${topic}". Each flashcard should have a term and a concise definition. Format the output as a list of "Term: Definition" pairs, with each pair on a new line. Ensure terms and definitions are distinct and clearly separated by a single colon. Here's an example output:
    Hello: Hola
    Goodbye: Adiós`;
    const result = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });
    
    const responseText = result?.text ?? '';

    if (!responseText) {
      setErrorMessage('The AI returned an empty response. Please try a different topic or try again.', true);
      return;
    }

    const parsedCards: Flashcard[] = responseText
      .split('\n')
      .map((line) => {
        const parts = line.split(':');
        if (parts.length >= 2 && parts[0].trim()) {
          const term = parts[0].trim();
          const definition = parts.slice(1).join(':').trim();
          if (definition) {
            return {term, definition};
          }
        }
        return null;
      })
      .filter((card): card is Flashcard => card !== null);

    if (parsedCards.length > 0) {
      let displayTopic = topic;
      if (topic.length > 50 || topic.includes('\n')) {
        displayTopic = 'Custom Flashcard Set';
      }
      activeStudySet = { topic: displayTopic, cards: parsedCards };
      setErrorMessage('');
      setViewState('PRE_STUDY');
    } else {
      setErrorMessage("The AI's response couldn't be formatted into flashcards. Try rephrasing your topic or generate again.", true);
    }
  } catch (error: unknown) {
    console.error('Error generating content:', error);
    let userFriendlyMessage = 'An unexpected error occurred. Please try again.';
    if (error instanceof Error) {
        const message = error.message.toLowerCase();
        if (message.includes('api key not valid')) {
            userFriendlyMessage = 'Authentication failed. Please check your API key configuration.';
        } else if (message.includes('fetch')) {
            userFriendlyMessage = 'A network error occurred. Please check your internet connection and try again.';
        } else if (message.includes('quota')) {
            userFriendlyMessage = 'You have exceeded your API quota. Please try again later.';
        } else if (message.includes('timed out')) {
            userFriendlyMessage = 'The request to the AI timed out. Please check your connection and try again.';
        }
    }
    setErrorMessage(userFriendlyMessage, true);
  } finally {
    generateButton.disabled = false;
    importButton.disabled = false;
  }
});

startButton.addEventListener('click', () => {
  const duration = parseInt(timerInput.value, 10);
  if (isNaN(duration) || duration < 1 || duration > 60) {
    setErrorMessage('Please enter a valid duration between 1 and 60 minutes.', true);
    return;
  }
  setErrorMessage('');
  renderFlashcards();
  startTimer(duration);
  setViewState('STUDY');
});

stopButton.addEventListener('click', () => {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
  setViewState('PRE_STUDY');
});

function resetToGenerator() {
  if (timerInterval) clearInterval(timerInterval);
  activeStudySet = null;
  flashcardsContainer.textContent = '';
  topicInput.value = '';
  setErrorMessage('');
  setViewState('GENERATION');
}

studyAgainButton.addEventListener('click', () => {
    setViewState('PRE_STUDY');
});

generateNewButton.addEventListener('click', resetToGenerator);
generateNewButton2.addEventListener('click', resetToGenerator);
importButton.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', handleImport);
exportButton.addEventListener('click', handleExport);

// --- Initial State ---
setViewState('GENERATION');