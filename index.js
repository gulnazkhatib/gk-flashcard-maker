/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import {GoogleGenAI} from '@google/genai';
import mammoth from 'mammoth';
import * as pdfjsLib from 'pdfjs-dist';
import Tesseract from 'tesseract.js';

// Set worker source for pdf.js
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://esm.sh/pdfjs-dist@4.3.136/build/pdf.worker.mjs`;

// --- DOM Elements ---
const generationContainer = document.getElementById('generationContainer');
const preStudyContainer = document.getElementById('preStudyContainer');
const studyContainer = document.getElementById('studyContainer');
const sessionCompleteContainer = document.getElementById('sessionCompleteContainer');
const pdfOptionsModal = document.getElementById('pdfOptionsModal');
const sourceContentContainer = document.getElementById('sourceContentContainer');

const flashcardsContainer = document.getElementById('flashcardsContainer');
const errorMessage = document.getElementById('errorMessage');
const timerDisplay = document.getElementById('timerDisplay');
const preStudyTopic = document.getElementById('preStudyTopic');
const totalPagesSpan = document.getElementById('totalPagesSpan');
const sourceContentPreview = document.getElementById('sourceContentPreview');
const pdfPreviewContainer = document.getElementById('pdfPreviewContainer');
const cardProgress = document.getElementById('cardProgress');

const topicInput = document.getElementById('topicInput');
const timerInput = document.getElementById('timerInput');
const fileInput = document.getElementById('fileInput');
const allPagesRadio = document.getElementById('allPagesRadio');
const customRangeRadio = document.getElementById('customRangeRadio');
const pageRangeSelector = document.getElementById('pageRangeSelector');
const startPageInput = document.getElementById('startPageInput');
const endPageInput = document.getElementById('endPageInput');
const ocrCheckbox = document.getElementById('ocrCheckbox');

const generateButton = document.getElementById('generateButton');
const importButton = document.getElementById('importButton');
const exportButton = document.getElementById('exportButton');
const startButton = document.getElementById('startButton');
const stopButton = document.getElementById('stopButton');
const generateNewButton = document.getElementById('generateNewButton');
const generateNewButton2 = document.getElementById('generateNewButton2');
const studyAgainButton = document.getElementById('studyAgainButton');
const generateFromPdfButton = document.getElementById('generateFromPdfButton');
const cancelPdfButton = document.getElementById('cancelPdfButton');
const prevCardButton = document.getElementById('prevCardButton');
const nextCardButton = document.getElementById('nextCardButton');


// --- App State ---
let activeStudySet = null;
let timerInterval = null;
let currentPdfDoc = null;
let previewDebounceTimeout = null;
let currentCardIndex = 0;

const ai = new GoogleGenAI({apiKey: process.env.API_KEY});

// --- State Management ---
function setViewState(view) {
  const allContainers = [generationContainer, preStudyContainer, studyContainer, sessionCompleteContainer];
  allContainers.forEach(container => container.classList.add('hidden'));

  switch (view) {
    case 'GENERATION':
      generationContainer.classList.remove('hidden'); 
      break;
    case 'PRE_STUDY':
      if (activeStudySet) {
        preStudyTopic.textContent = `Study: ${activeStudySet.topic}`;
        if (activeStudySet.sourceContent) {
          sourceContentPreview.textContent = activeStudySet.sourceContent;
          sourceContentContainer.classList.remove('hidden');
        } else {
          sourceContentContainer.classList.add('hidden');
        }
      }
      preStudyContainer.classList.remove('hidden'); 
      break;
    case 'STUDY': studyContainer.classList.remove('hidden'); break;
    case 'COMPLETE': sessionCompleteContainer.classList.remove('hidden'); break;
  }
}

// --- UI Messaging ---
function setErrorMessage(message, isError = false, isSuccess = false) {
    errorMessage.textContent = message;
    errorMessage.classList.toggle('is-error', isError);
    errorMessage.classList.toggle('is-success', isSuccess);
    // A message is a loading/status message if it's not an error and not a success message.
    errorMessage.classList.toggle('is-loading', !isError && !isSuccess && !!message);
}

// --- Timer Logic ---
function startTimer(durationMinutes) {
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
function showCard(index) {
  flashcardsContainer.textContent = ''; // Clear previous card
  if (!activeStudySet || !activeStudySet.cards[index]) return;

  const studyMode = document.querySelector('input[name="studyMode"]:checked').value;
  const flashcard = activeStudySet.cards[index];

  const cardDiv = document.createElement('div');
  cardDiv.classList.add('flashcard');

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

  // Update progress and navigation
  cardProgress.textContent = `${index + 1} / ${activeStudySet.cards.length}`;
  const totalCards = activeStudySet.cards.length;
  // Only disable buttons if there's one or zero cards, otherwise enable for looping
  prevCardButton.disabled = totalCards <= 1;
  nextCardButton.disabled = totalCards <= 1;
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

async function renderPdfPagePreview(pageNumber) {
    if (!currentPdfDoc) return;
    try {
        const page = await currentPdfDoc.getPage(pageNumber);
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        if (!context) return;
        
        const viewport = page.getViewport({ scale: 0.5 });
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        
        await page.render({ canvas: canvas, canvasContext: context, viewport: viewport }).promise;
        pdfPreviewContainer.appendChild(canvas);
    } catch (err) {
        console.error(`Error rendering page ${pageNumber}:`, err);
    }
}

async function updatePdfPreview() {
    if (!currentPdfDoc) return;
    pdfPreviewContainer.innerHTML = ''; // Clear existing previews

    const numPages = currentPdfDoc.numPages;
    let startPage = parseInt(startPageInput.value, 10);
    let endPage = parseInt(endPageInput.value, 10);

    // Validate the range. If invalid, do nothing.
    if (isNaN(startPage) || isNaN(endPage) || startPage < 1 || endPage > numPages || startPage > endPage) {
        return;
    }

    // Render the start page thumbnail
    await renderPdfPagePreview(startPage);

    // If the start and end pages are different, render the end page thumbnail
    if (startPage < endPage) {
        const separator = document.createElement('div');
        separator.textContent = '...';
        separator.style.textAlign = 'center';
        separator.style.margin = '8px 0';
        separator.style.fontWeight = 'bold';
        separator.style.color = 'var(--dark-text-secondary)';
        pdfPreviewContainer.appendChild(separator);
        await renderPdfPagePreview(endPage);
    }
}

async function handleImport(event) {
    const input = event.target;
    const file = input.files?.[0];
    if (!file) return;

    const isTxt = file.name.toLowerCase().endsWith('.txt');
    const isDocx = file.name.toLowerCase().endsWith('.docx');
    const isPdf = file.name.toLowerCase().endsWith('.pdf');

    if (!isTxt && !isDocx && !isPdf) {
        setErrorMessage('Invalid file type. Please upload a .txt, .docx, or .pdf file.', true);
        input.value = '';
        return;
    }

    const reader = new FileReader();
    reader.onerror = () => setErrorMessage('Error reading file.', true);
    
    // Helper to pause for user feedback
    const waitForFeedback = () => new Promise(resolve => setTimeout(resolve, 1500));

    if (isTxt) {
        reader.onload = async (e) => {
            const text = e.target?.result;
            if (!text) {
                setErrorMessage('File is empty or could not be read.', true);
                return;
            }
            setErrorMessage(`${file.name} uploaded successfully.`, false, true);
            await waitForFeedback();
            await generateCardsFromText(text, `Flashcards from ${file.name}`);
        };
        reader.readAsText(file);
    } else if (isDocx) {
        reader.onload = (e) => {
            mammoth.extractRawText({ arrayBuffer: e.target?.result })
                .then(async result => {
                    const text = result.value;
                     if (!text) {
                        setErrorMessage('File is empty or could not be read.', true);
                        return;
                    }
                    setErrorMessage(`${file.name} uploaded successfully.`, false, true);
                    await waitForFeedback();
                    await generateCardsFromText(text, `Flashcards from ${file.name}`);
                })
                .catch(err => {
                    console.error('Error parsing .docx file:', err);
                    setErrorMessage('Could not extract text from the .docx file.', true);
                });
        };
        reader.readAsArrayBuffer(file);
    } else if (isPdf) {
        reader.onload = async (e) => {
            try {
                setErrorMessage(`Processing ${file.name}...`);
                const loadingTask = pdfjsLib.getDocument({ data: e.target?.result });
                currentPdfDoc = await loadingTask.promise;
                
                setErrorMessage(`${file.name} uploaded successfully.`, false, true);
                await waitForFeedback();
                
                totalPagesSpan.textContent = String(currentPdfDoc.numPages);
                startPageInput.max = String(currentPdfDoc.numPages);
                endPageInput.max = String(currentPdfDoc.numPages);
                startPageInput.value = '1';
                endPageInput.value = String(currentPdfDoc.numPages);
                
                allPagesRadio.checked = true;
                pageRangeSelector.classList.add('hidden');
                pdfPreviewContainer.innerHTML = '';
                pdfOptionsModal.classList.remove('hidden');
                setErrorMessage('Please select the page range to generate flashcards from.');

            } catch (err) {
                console.error('Error loading PDF:', err);
                setErrorMessage('Could not load the PDF file. It may be corrupted or protected.', true);
            }
        };
        reader.readAsArrayBuffer(file);
    }

    input.value = ''; // Reset input
}

// --- AI Generation Logic ---
async function generateCardsFromText(content, topic) {
  setErrorMessage('Generating flashcards... please wait...');
  generateButton.disabled = true;
  generateButton.textContent = 'Generating...';
  importButton.disabled = true;

  try {
    const prompt = `Analyze the following text and identify the key concepts. For each key concept, create a flashcard with a clear 'term' and a concise 'definition'. The text to analyze is: "${content}"

Format your response as a list of "Term: Definition" pairs. Each pair must be on a new line. Do not include any other text or explanations.

Example format:
Term 1: Definition 1
Term 2: Definition 2`;
    const result = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });
    
    const responseText = result?.text ?? '';

    if (!responseText) {
      setErrorMessage('The AI returned an empty response. Please try a different topic or try again.', true);
      return;
    }

    const parsedCards = responseText
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
      .filter((card) => card !== null);

    if (parsedCards.length > 0) {
      let displayTopic = topic;
      if (topic.length > 50 || topic.includes('\n')) {
        displayTopic = 'Custom Flashcard Set';
      }
      activeStudySet = { topic: displayTopic, cards: parsedCards, sourceContent: content };
      setErrorMessage('');
      setViewState('PRE_STUDY');
    } else {
      setErrorMessage("The AI's response couldn't be formatted into flashcards. Try rephrasing your topic or generate again.", true);
    }
  } catch (error) {
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
    generateButton.textContent = 'Generate Flashcards';
    importButton.disabled = false;
  }
}


// --- Event Listeners ---
generateButton.addEventListener('click', async () => {
  const topic = topicInput.value.trim();
  if (!topic) {
    setErrorMessage('Please enter a topic or some terms and definitions.', true);
    return;
  }
  await generateCardsFromText(topic, topic);
});

startButton.addEventListener('click', () => {
  const duration = parseInt(timerInput.value, 10);
  if (isNaN(duration) || duration < 1 || duration > 60) {
    setErrorMessage('Please enter a valid duration between 1 and 60 minutes.', true);
    return;
  }
  setErrorMessage('');
  currentCardIndex = 0;
  showCard(currentCardIndex);
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
  currentCardIndex = 0;
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

prevCardButton.addEventListener('click', () => {
  if (!activeStudySet || activeStudySet.cards.length === 0) return;
  const totalCards = activeStudySet.cards.length;
  // Loop to the last card if at the first card
  currentCardIndex = (currentCardIndex - 1 + totalCards) % totalCards;
  showCard(currentCardIndex);
});

nextCardButton.addEventListener('click', () => {
  if (!activeStudySet || activeStudySet.cards.length === 0) return;
  const totalCards = activeStudySet.cards.length;
  // Loop to the first card if at the last card
  currentCardIndex = (currentCardIndex + 1) % totalCards;
  showCard(currentCardIndex);
});

// PDF Modal Listeners
allPagesRadio.addEventListener('change', () => {
  pageRangeSelector.classList.add('hidden');
  pdfPreviewContainer.innerHTML = '';
});

customRangeRadio.addEventListener('change', () => {
  pageRangeSelector.classList.remove('hidden');
  updatePdfPreview();
});

const debouncedPreview = () => {
    if (previewDebounceTimeout) clearTimeout(previewDebounceTimeout);
    previewDebounceTimeout = window.setTimeout(updatePdfPreview, 300);
}

startPageInput.addEventListener('input', debouncedPreview);
endPageInput.addEventListener('input', debouncedPreview);


cancelPdfButton.addEventListener('click', () => {
  pdfOptionsModal.classList.add('hidden');
  currentPdfDoc = null;
  setErrorMessage('');
});

generateFromPdfButton.addEventListener('click', async () => {
  if (!currentPdfDoc) return;

  // Disable buttons and show loading state to prevent multiple clicks
  generateFromPdfButton.disabled = true;
  generateFromPdfButton.textContent = 'Generating...';
  cancelPdfButton.disabled = true;

  const useAllPages = allPagesRadio.checked;
  const numPages = currentPdfDoc.numPages;
  let startPage = useAllPages ? 1 : parseInt(startPageInput.value, 10);
  let endPage = useAllPages ? numPages : parseInt(endPageInput.value, 10);

  if (!useAllPages && (isNaN(startPage) || isNaN(endPage) || startPage < 1 || endPage > numPages || startPage > endPage)) {
      alert('Invalid page range. Please enter a valid start and end page within the document\'s limits.');
      generateFromPdfButton.disabled = false;
      generateFromPdfButton.textContent = 'Generate';
      cancelPdfButton.disabled = false;
      return;
  }

  pdfOptionsModal.classList.add('hidden');
  
  const performOcr = ocrCheckbox.checked;
  let tesseractWorker = null;
  
  if (performOcr) {
      setErrorMessage('Initializing OCR engine...');
      try {
          tesseractWorker = await Tesseract.createWorker('eng', 1, {
              logger: m => {
                  if (m.status === 'recognizing text') {
                      const progress = (m.progress * 100).toFixed(0);
                      setErrorMessage(`Performing OCR... ${progress}%`);
                  } else if (m.status && m.status.includes('loading')) {
                      setErrorMessage('Loading OCR model...');
                  } else if (m.status === 'initializing tesseract') {
                      setErrorMessage('Initializing OCR engine...');
                  }
              }
          });
      } catch (err) {
          console.error('Error initializing Tesseract worker:', err);
          setErrorMessage('Could not initialize OCR engine. Please try again.', true);
          currentPdfDoc = null;
          generateFromPdfButton.disabled = false;
          generateFromPdfButton.textContent = 'Generate';
          cancelPdfButton.disabled = false;
          return;
      }
  }
  
  setErrorMessage('Extracting text from PDF...');
  
  let extractedText = '';
  try {
      for (let i = startPage; i <= endPage; i++) {
        try {
            setErrorMessage(`Processing page ${i} of ${endPage}...`);
            const page = await currentPdfDoc.getPage(i);
            
            if (performOcr && tesseractWorker) {
                // OCR Path: Render page to canvas and recognize text.
                const viewport = page.getViewport({ scale: 2.0 }); // Higher scale for better OCR accuracy
                const canvas = document.createElement('canvas');
                const context = canvas.getContext('2d');
                if (!context) {
                    console.warn(`Could not get 2D context for page ${i}. Skipping.`);
                    continue;
                };

                canvas.width = viewport.width;
                canvas.height = viewport.height;
                
                await page.render({ canvas: canvas, canvasContext: context, viewport: viewport }).promise;
                const { data: { text } } = await tesseractWorker.recognize(canvas);
                if (text) {
                    extractedText += text + '\n\n';
                }
            } else {
                // Standard text extraction for non-OCR tasks.
                const textContent = await page.getTextContent();
                const pageText = textContent.items.map(item => ('str' in item ? item.str : '')).join(' ');
                extractedText += pageText + '\n\n';
            }
        } catch (pageErr) {
            console.error(`Failed to process page ${i}. Skipping.`, pageErr);
            // Continue to the next page
        }
      }

      if (!extractedText.trim()) {
          setErrorMessage('Could not extract any text from the selected PDF pages. If it is a scanned document, please try again with the OCR option enabled.', true);
          return;
      }
      
      const topic = `Flashcards from PDF (Pages ${startPage}-${endPage})`;
      await generateCardsFromText(extractedText, topic);

  } catch (err) {
      console.error('Error processing PDF pages:', err);
      setErrorMessage('An error occurred while extracting text from the PDF.', true);
  } finally {
      if (tesseractWorker) await tesseractWorker.terminate();
      currentPdfDoc = null; // Clean up
      // Always restore button state
      generateFromPdfButton.disabled = false;
      generateFromPdfButton.textContent = 'Generate';
      cancelPdfButton.disabled = false;
  }
});


// --- Initial State ---
setViewState('GENERATION');