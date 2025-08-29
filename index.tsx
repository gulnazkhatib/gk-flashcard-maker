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

// --- Interfaces & Types ---
interface Flashcard {
  term: string;
  definition: string;
}

interface StudySet {
  topic: string;
  cards: Flashcard[];
  sourceContent?: string;
}

type ViewState = 'GENERATION' | 'PRE_STUDY' | 'STUDY' | 'COMPLETE';

// --- DOM Elements ---
const generationContainer = document.getElementById('generationContainer') as HTMLDivElement;
const preStudyContainer = document.getElementById('preStudyContainer') as HTMLDivElement;
const studyContainer = document.getElementById('studyContainer') as HTMLDivElement;
const sessionCompleteContainer = document.getElementById('sessionCompleteContainer') as HTMLDivElement;
const pdfOptionsModal = document.getElementById('pdfOptionsModal') as HTMLDivElement;
const sourceContentContainer = document.getElementById('sourceContentContainer') as HTMLDivElement;

const flashcardsContainer = document.getElementById('flashcardsContainer') as HTMLDivElement;
const errorMessage = document.getElementById('errorMessage') as HTMLDivElement;
const timerDisplay = document.getElementById('timerDisplay') as HTMLDivElement;
const preStudyTopic = document.getElementById('preStudyTopic') as HTMLHeadingElement;
const totalPagesSpan = document.getElementById('totalPagesSpan') as HTMLSpanElement;
const sourceContentPreview = document.getElementById('sourceContentPreview') as HTMLPreElement;
const pdfPreviewContainer = document.getElementById('pdfPreviewContainer') as HTMLDivElement;

const topicInput = document.getElementById('topicInput') as HTMLTextAreaElement;
const timerInput = document.getElementById('timerInput') as HTMLInputElement;
const fileInput = document.getElementById('fileInput') as HTMLInputElement;
const allPagesRadio = document.getElementById('allPagesRadio') as HTMLInputElement;
const customRangeRadio = document.getElementById('customRangeRadio') as HTMLInputElement;
const pageRangeSelector = document.getElementById('pageRangeSelector') as HTMLDivElement;
const startPageInput = document.getElementById('startPageInput') as HTMLInputElement;
const endPageInput = document.getElementById('endPageInput') as HTMLInputElement;
const ocrCheckbox = document.getElementById('ocrCheckbox') as HTMLInputElement;

const generateButton = document.getElementById('generateButton') as HTMLButtonElement;
const importButton = document.getElementById('importButton') as HTMLButtonElement;
const exportButton = document.getElementById('exportButton') as HTMLButtonElement;
const startButton = document.getElementById('startButton') as HTMLButtonElement;
const stopButton = document.getElementById('stopButton') as HTMLButtonElement;
const generateNewButton = document.getElementById('generateNewButton') as HTMLButtonElement;
const generateNewButton2 = document.getElementById('generateNewButton2') as HTMLButtonElement;
const studyAgainButton = document.getElementById('studyAgainButton') as HTMLButtonElement;
const generateFromPdfButton = document.getElementById('generateFromPdfButton') as HTMLButtonElement;
const cancelPdfButton = document.getElementById('cancelPdfButton') as HTMLButtonElement;

// --- App State ---
let activeStudySet: StudySet | null = null;
let timerInterval: number | null = null;
let currentPdfDoc: pdfjsLib.PDFDocumentProxy | null = null;
let previewDebounceTimeout: number | null = null;

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
function setErrorMessage(message: string, isError: boolean = false, isSuccess: boolean = false) {
    errorMessage.textContent = message;
    errorMessage.classList.toggle('is-error', isError);
    errorMessage.classList.toggle('is-success', isSuccess);
    // A message is a loading/status message if it's not an error and not a success message.
    errorMessage.classList.toggle('is-loading', !isError && !isSuccess && !!message);
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

async function renderPdfPagePreview(pageNumber: number) {
    if (!currentPdfDoc) return;
    try {
        const page = await currentPdfDoc.getPage(pageNumber);
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        if (!context) return;
        
        const viewport = page.getViewport({ scale: 0.5 });
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        
        // FIX: Add canvas property to render parameters to fix TypeScript error.
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

async function handleImport(event: Event) {
    const input = event.target as HTMLInputElement;
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
            const text = e.target?.result as string;
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
            mammoth.extractRawText({ arrayBuffer: e.target?.result as ArrayBuffer })
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
                const loadingTask = pdfjsLib.getDocument({ data: e.target?.result as ArrayBuffer });
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
async function generateCardsFromText(content: string, topic: string) {
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
      activeStudySet = { topic: displayTopic, cards: parsedCards, sourceContent: content };
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
  let tesseractWorker: Tesseract.Worker | null = null;
  
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
                
                // FIX: Add canvas property to render parameters to fix TypeScript error.
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